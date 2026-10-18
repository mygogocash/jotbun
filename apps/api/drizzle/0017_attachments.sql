-- P2c: retained receipt attachments with versioned ownership.
--   attachments             - one row per receipt image the owner explicitly
--                             retained: a server-made copy of a P2b sanitized
--                             import image under its own `receipt` key, with
--                             its size, digest, type and dimensions. Retained
--                             while any of the owner's records holds it; then
--                             released (final: no undo) and its object due.
--   transaction_attachments - which receipt a record holds: at most one per
--                             record (the primary key), composite owner keys
--                             to both the record and the receipt, so no record
--                             can hold another account's receipt. Several
--                             records may share one receipt.
-- The app reads both under owner RLS; it writes attachments only through the
-- routines below, and changes which record holds which receipt only inside
-- M1 commands (account lock, version check, change group). A trigger refuses
-- a holder for a receipt that is not retained, and a SECURITY DEFINER trigger
-- releases a receipt as soon as no record holds it - an explicit removal or
-- replacement, the 30-day purge of a deleted record (P5 retention) or account
-- erasure.
--
-- Object lifecycle (P1's registry is the source of truth; a database rollback
-- never undoes a PUT):
--   1. gogospend_reserve_receipt_copy registers receipt/<account>/<attachment>
--      /<copy token>/image.<ext> (purpose `receipt`) for three minutes (the
--      copy's own one-minute deadline plus the command that publishes it),
--      before the API copies the import image there - inside the object
--      store, never through the API's memory;
--   2. gogospend_retain_attachment, in the command's transaction under the
--      account lock, publishes that reservation with no expiry
--      (delete_after = infinity) once the copy matches the import image's
--      registered size and digest, and records the attachment;
--   3. releasing makes the object due now; P1's sweep deletes it, and the
--      orphan pass covers the `receipt` purpose. A reservation never
--      published is swept at its deadline.
-- P5's deletion objects stage makes every published object of the account
-- due (retained receipts included), so erasure deletes them.
--
-- A preview image's opaque attachment id (import_previews.image_attachment_id)
-- is what the client names; the object keys never leave the server.
--
-- Locks and rewrites (docs/operations/release.md): this migration rewrites
-- every import_previews row that has an image (the UPDATE giving it an
-- attachment id) and builds a unique index on that table, which holds
-- SHARE ROW EXCLUSIVE or stronger on import_previews for the duration. The
-- two CHECK constraints it adds are created NOT VALID and then validated, so
-- the validation scans object_publications and import_previews without
-- blocking their writes (SHARE UPDATE EXCLUSIVE). Previews live seven days and
-- are few, so the window is short; run it with OPERATIONAL_PAUSE=writes on the
-- API (incident.md#pausing) and record that in the release record.

-- Retained receipts outlive P1's 7-day limit on published objects: they are
-- kept until released. Every other purpose keeps the limit.
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT c.conname INTO v_name
    FROM pg_constraint c
   WHERE c.conrelid = 'public.object_publications'::regclass AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) LIKE '%published_at + ''7 days 00:01:00''::interval%';
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'the 7-day publication check was not found';
  END IF;
  EXECUTE format('ALTER TABLE public.object_publications DROP CONSTRAINT %I', v_name);
END $$;
--> statement-breakpoint
ALTER TABLE object_publications ADD CONSTRAINT object_publications_published_expiry_check
  CHECK (status <> 'published' OR purpose = 'receipt' OR delete_after <= published_at + interval '7 days 1 minute') NOT VALID;
--> statement-breakpoint
ALTER TABLE object_publications VALIDATE CONSTRAINT object_publications_published_expiry_check;
--> statement-breakpoint
-- The opaque id a client names to retain a preview's sanitized image.
ALTER TABLE import_previews ADD COLUMN image_attachment_id uuid UNIQUE;
--> statement-breakpoint
UPDATE import_previews SET image_attachment_id = gen_random_uuid() WHERE image_key IS NOT NULL;
--> statement-breakpoint
ALTER TABLE import_previews ADD CONSTRAINT import_previews_attachment_id_check CHECK ((image_attachment_id IS NULL) = (image_key IS NULL)) NOT VALID;
--> statement-breakpoint
ALTER TABLE import_previews VALIDATE CONSTRAINT import_previews_attachment_id_check;
--> statement-breakpoint
CREATE FUNCTION gogospend_assign_image_attachment_id() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.image_attachment_id := CASE WHEN NEW.image_key IS NULL THEN NULL ELSE gen_random_uuid() END;
  ELSE
    NEW.image_attachment_id := OLD.image_attachment_id;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER import_previews_attachment_id BEFORE INSERT OR UPDATE OF image_attachment_id ON import_previews
  FOR EACH ROW EXECUTE FUNCTION gogospend_assign_image_attachment_id();
--> statement-breakpoint
CREATE TABLE attachments (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  id uuid NOT NULL,
  -- The import whose sanitized image was copied (no foreign key: a receipt
  -- outlives its import's rows). One receipt per import image.
  source_job_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'retained' CHECK (status IN ('retained', 'released')),
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes bigint NOT NULL CHECK (bytes BETWEEN 1 AND 12582912),
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  width integer NOT NULL CHECK (width >= 1),
  height integer NOT NULL CHECK (height >= 1),
  -- When the owner explicitly consented to keep it.
  retained_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  PRIMARY KEY (account_id, id),
  UNIQUE (account_id, source_job_id),
  CHECK (width::bigint * height <= 20000000),
  CHECK ((status = 'released') = (released_at IS NOT NULL)),
  -- Its own receipt key, whose extension matches its type.
  CHECK (starts_with(object_key, 'receipt/' || account_id::text || '/' || id::text || '/')),
  CHECK (object_key ~ '^receipt/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/image\.(jpg|png|webp)$'),
  CHECK (right(object_key, 4) = CASE content_type WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' ELSE 'webp' END)
);
--> statement-breakpoint
CREATE INDEX attachments_released_idx ON attachments (released_at) WHERE status = 'released';
--> statement-breakpoint
CREATE TABLE transaction_attachments (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL,
  attachment_id uuid NOT NULL,
  attached_at timestamptz NOT NULL DEFAULT now(),
  -- One current receipt per record.
  PRIMARY KEY (account_id, transaction_id),
  FOREIGN KEY (account_id, transaction_id) REFERENCES transactions (account_id, id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, attachment_id) REFERENCES attachments (account_id, id)
);
--> statement-breakpoint
CREATE INDEX transaction_attachments_attachment_idx ON transaction_attachments (account_id, attachment_id);
--> statement-breakpoint
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE transaction_attachments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY attachments_owner ON attachments FOR SELECT TO gogospend_app
  USING (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY transaction_attachments_owner ON transaction_attachments TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
-- Receipts are written only by the routines below; the app changes which
-- record holds which receipt inside its commands.
GRANT SELECT ON attachments TO gogospend_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON transaction_attachments TO gogospend_app;
--> statement-breakpoint
GRANT UPDATE (attachment_id, attached_at) ON transaction_attachments TO gogospend_app;
--> statement-breakpoint
-- A record's receipt, for the record DTO (owner RLS applies: not a definer).
CREATE FUNCTION gogospend_transaction_attachment(p_account uuid, p_transaction uuid) RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
AS $$
  SELECT ta.attachment_id FROM public.transaction_attachments ta
   WHERE ta.account_id = p_account AND ta.transaction_id = p_transaction
$$;
--> statement-breakpoint
-- A record can only come to hold a receipt that is still retained.
CREATE FUNCTION gogospend_guard_transaction_attachment() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.attachments a
                  WHERE a.account_id = NEW.account_id AND a.id = NEW.attachment_id AND a.status = 'retained') THEN
    RAISE EXCEPTION 'a record can only hold a retained receipt' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER transaction_attachments_retained BEFORE INSERT OR UPDATE OF attachment_id ON transaction_attachments
  FOR EACH ROW EXECUTE FUNCTION gogospend_guard_transaction_attachment();
--> statement-breakpoint
-- Releases a retained receipt that no record holds any more: the attachment
-- becomes `released` (final) and its object due now, for P1's sweep. True
-- when it released something. Internal (no grant).
CREATE FUNCTION gogospend_release_attachment(p_account uuid, p_attachment uuid) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_key text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.transaction_attachments ta WHERE ta.account_id = p_account AND ta.attachment_id = p_attachment) THEN
    RETURN false;
  END IF;
  UPDATE public.attachments a SET status = 'released', released_at = now()
   WHERE a.account_id = p_account AND a.id = p_attachment AND a.status = 'retained'
  RETURNING a.object_key INTO v_key;
  IF v_key IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
   WHERE o.key = v_key AND o.account_id = p_account AND o.purpose = 'receipt' AND o.status IN ('reserved', 'published');
  RETURN true;
END
$$;
--> statement-breakpoint
-- After a record stops holding a receipt (removed, replaced, or the record
-- itself purged or erased), the receipt is released unless another record
-- still holds it.
CREATE FUNCTION gogospend_attachment_unheld() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.attachment_id = OLD.attachment_id THEN
    RETURN NULL;
  END IF;
  PERFORM public.gogospend_release_attachment(OLD.account_id, OLD.attachment_id);
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER transaction_attachments_unheld AFTER DELETE OR UPDATE OF attachment_id ON transaction_attachments
  FOR EACH ROW EXECUTE FUNCTION gogospend_attachment_unheld();
--> statement-breakpoint
-- Owner transaction (API), before a retain copies anything: for the owner's
-- own ready preview whose image p_attachment_id names, while the image is
-- published with at least two minutes left, registers the copy's receipt key
-- for three minutes (committed before the copy) and returns it with the
-- image's key, type, size and digest. One account's reservations are
-- serialized by an advisory lock, so the limits below hold under concurrency.
-- Outcomes:
--   reserved    - copy the image to copy_key now;
--   existing    - the receipt already exists (retained or released): copy nothing;
--   pending     - another request of this account is already copying this
--                 image: wait for it (its receipt, or its reservation going
--                 due) instead of making a second copy; retry_after is a
--                 polling hint in seconds;
--   limited     - the account has 4 copies in flight, or has reserved 100 in
--                 the last 24 hours; retry_after is the seconds until the
--                 oldest of them is due or leaves that window;
--   unavailable - nothing of the owner's to copy (unknown, another account's,
--                 not an image, or past its window).
CREATE FUNCTION gogospend_reserve_receipt_copy(p_attachment_id uuid, p_copy_token uuid)
  RETURNS TABLE (outcome text, copy_key text, source_key text, content_type text, bytes bigint, sha256 text, retry_after integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_generation integer;
  v_source record;
  v_ext text;
  v_key text;
  v_oldest timestamptz;
  v_wait integer;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'retaining a receipt needs an owner transaction';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gogospend.receipt-copy:' || v_account::text, 0));
  SELECT a.lifecycle_generation INTO v_generation FROM public.accounts a WHERE a.id = v_account AND a.status = 'active';
  IF NOT FOUND OR p_attachment_id IS NULL OR p_copy_token IS NULL THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::text, NULL::text, NULL::text, NULL::bigint, NULL::text, NULL::integer;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.attachments a WHERE a.account_id = v_account AND a.id = p_attachment_id) THEN
    RETURN QUERY SELECT 'existing'::text, NULL::text, NULL::text, NULL::text, NULL::bigint, NULL::text, NULL::integer;
    RETURN;
  END IF;
  SELECT p.image_key AS key, o.bytes AS bytes, o.sha256 AS sha256 INTO v_source
    FROM public.import_previews p
    JOIN public.object_publications o ON o.key = p.image_key AND o.account_id = p.account_id
   WHERE p.account_id = v_account AND p.image_attachment_id = p_attachment_id AND p.status = 'ready'
     AND o.purpose = 'import_image' AND o.status = 'published' AND o.delete_after > now() + interval '2 minutes';
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::text, NULL::text, NULL::text, NULL::bigint, NULL::text, NULL::integer;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.object_publications o
              WHERE o.account_id = v_account AND o.purpose = 'receipt' AND o.job_id = p_attachment_id AND o.status = 'reserved'
                AND o.delete_after > now() AND o.lifecycle_generation = v_generation) THEN
    RETURN QUERY SELECT 'pending'::text, NULL::text, NULL::text, NULL::text, NULL::bigint, NULL::text, 1;
    RETURN;
  END IF;
  SELECT min(o.delete_after) INTO v_oldest FROM public.object_publications o
   WHERE o.account_id = v_account AND o.purpose = 'receipt' AND o.status = 'reserved' AND o.delete_after > now()
  HAVING count(*) >= 4;
  IF FOUND THEN
    v_wait := greatest(1, ceil(extract(epoch FROM v_oldest - now()))::integer);
    RETURN QUERY SELECT 'limited'::text, NULL::text, NULL::text, NULL::text, NULL::bigint, NULL::text, v_wait;
    RETURN;
  END IF;
  SELECT min(o.created_at) INTO v_oldest FROM public.object_publications o
   WHERE o.account_id = v_account AND o.purpose = 'receipt' AND o.created_at > now() - interval '24 hours'
  HAVING count(*) >= 100;
  IF FOUND THEN
    v_wait := greatest(1, ceil(extract(epoch FROM v_oldest + interval '24 hours' - now()))::integer);
    RETURN QUERY SELECT 'limited'::text, NULL::text, NULL::text, NULL::text, NULL::bigint, NULL::text, v_wait;
    RETURN;
  END IF;
  v_ext := substring(v_source.key from '\.(jpg|png|webp)$');
  v_key := format('receipt/%s/%s/%s/image.%s', v_account, p_attachment_id, p_copy_token, v_ext);
  INSERT INTO public.object_publications (key, job_id, account_id, lease_token, lifecycle_generation, purpose, delete_after)
  VALUES (v_key, p_attachment_id, v_account, p_copy_token, v_generation, 'receipt', now() + interval '180 seconds');
  RETURN QUERY SELECT 'reserved'::text, v_key, v_source.key::text,
                      CASE v_ext WHEN 'jpg' THEN 'image/jpeg' WHEN 'png' THEN 'image/png' ELSE 'image/webp' END,
                      v_source.bytes::bigint, encode(v_source.sha256, 'hex'), NULL::integer;
END
$$;
--> statement-breakpoint
-- Owner transaction (API): a copy reservation this account made that will
-- not be published (the copy failed, or the command did not use it) is due
-- now. True when it was still reserved.
CREATE FUNCTION gogospend_release_receipt_copy(p_copy_key text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'retaining a receipt needs an owner transaction';
  END IF;
  UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
   WHERE o.key = p_copy_key AND o.account_id = v_account AND o.purpose = 'receipt' AND o.status = 'reserved';
  RETURN FOUND;
END
$$;
--> statement-breakpoint
-- Inside an M1 command (owner transaction under the account lock): the
-- receipt p_attachment_id names, ready for a record to hold. Returns
--   retained - it exists and is retained (shared: a copy made for nothing is
--              due now), or it was just recorded: the copy p_copy_key is this
--              account's own unexpired reservation for this attachment at the
--              account's lifecycle generation, and p_bytes/p_sha256 (the copy
--              as stored) equal the import image's registered size and
--              digest; the copy is published with no expiry;
--   released - it was removed earlier (final);
--   expired  - the preview image is the owner's but there is no usable copy
--              (past its window, or the copy did not match);
--   unknown  - nothing of the owner's (another account's id looks the same).
CREATE FUNCTION gogospend_retain_attachment(p_attachment_id uuid, p_copy_key text, p_bytes bigint, p_sha256 bytea) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_status text;
  v_preview public.import_previews%ROWTYPE;
  v_copy public.object_publications%ROWTYPE;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'retaining a receipt needs an owner transaction';
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  SELECT a.status INTO v_status FROM public.attachments a WHERE a.account_id = v_account AND a.id = p_attachment_id FOR UPDATE;
  IF FOUND THEN
    IF p_copy_key IS NOT NULL THEN
      UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
       WHERE o.key = p_copy_key AND o.account_id = v_account AND o.purpose = 'receipt' AND o.status = 'reserved';
    END IF;
    RETURN v_status;
  END IF;
  SELECT p.* INTO v_preview FROM public.import_previews p WHERE p.account_id = v_account AND p.image_attachment_id = p_attachment_id;
  IF NOT FOUND THEN
    RETURN 'unknown';
  END IF;
  IF p_copy_key IS NULL OR p_bytes IS NULL OR p_sha256 IS NULL THEN
    RETURN 'expired';
  END IF;
  SELECT o.* INTO v_copy FROM public.object_publications o
    JOIN public.accounts a ON a.id = o.account_id AND a.status = 'active' AND a.lifecycle_generation = o.lifecycle_generation
   WHERE o.key = p_copy_key AND o.account_id = v_account AND o.job_id = p_attachment_id AND o.purpose = 'receipt'
     AND o.status = 'reserved' AND o.delete_after > now()
     AND right(o.key, 4) = right(v_preview.image_key, 4)
   FOR UPDATE OF o;
  IF NOT FOUND OR NOT EXISTS (
       SELECT 1 FROM public.object_publications s
        WHERE s.key = v_preview.image_key AND s.account_id = v_account AND s.purpose = 'import_image'
          AND s.bytes = p_bytes AND s.sha256 = p_sha256) THEN
    RETURN 'expired';
  END IF;
  UPDATE public.object_publications o
     SET status = 'published', bytes = p_bytes, sha256 = p_sha256, published_at = now(), delete_after = 'infinity'
   WHERE o.key = p_copy_key;
  INSERT INTO public.attachments (account_id, id, source_job_id, object_key, content_type, bytes, sha256, width, height)
  VALUES (v_account, p_attachment_id, v_preview.job_id, p_copy_key,
          CASE right(p_copy_key, 4) WHEN '.jpg' THEN 'image/jpeg' WHEN '.png' THEN 'image/png' ELSE 'image/webp' END,
          p_bytes, p_sha256, v_preview.image_width, v_preview.image_height);
  RETURN 'retained';
END
$$;
--> statement-breakpoint
-- For the preview (owner): until when the owner's import image can still be
-- copied into a new receipt (two minutes before its unattached deadline), or
-- NULL once it cannot. A receipt already retained from it stays attachable to
-- more records by the same id while it is retained.
CREATE FUNCTION gogospend_import_image_attachable_until(p_job_id uuid) RETURNS timestamptz
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT o.delete_after - interval '2 minutes'
    FROM public.import_previews p
    JOIN public.object_publications o ON o.key = p.image_key AND o.account_id = p.account_id
   WHERE p.job_id = p_job_id AND p.account_id = public.gogospend_current_account() AND p.status = 'ready'
     AND o.purpose = 'import_image' AND o.status = 'published' AND o.delete_after > now() + interval '2 minutes'
$$;
--> statement-breakpoint
-- Retention (P5 step attachments.obsolete; jobs login), at most p_limit per
-- part, skipping accounts whose lock a write holds:
--   - a retained receipt no record holds (a safety net: the trigger releases
--     them as records let go) is released and its object due;
--   - a released receipt's row goes 30 days after its release, once its
--     object is gone from the registry's live states.
-- Returns how many rows it changed.
CREATE FUNCTION gogospend_prune_attachments(p_limit integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 1), 1), 10000);
  v_row record;
  v_count integer := 0;
  v_gone integer;
BEGIN
  FOR v_row IN
    SELECT a.account_id, a.id FROM public.attachments a
     WHERE a.status = 'retained'
       AND NOT EXISTS (SELECT 1 FROM public.transaction_attachments ta WHERE ta.account_id = a.account_id AND ta.attachment_id = a.id)
     ORDER BY a.retained_at, a.id
     LIMIT v_limit
  LOOP
    PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_row.account_id FOR UPDATE SKIP LOCKED;
    CONTINUE WHEN NOT FOUND;
    IF public.gogospend_release_attachment(v_row.account_id, v_row.id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  DELETE FROM public.attachments a
   WHERE (a.account_id, a.id) IN (
     SELECT d.account_id, d.id FROM public.attachments d
      WHERE d.status = 'released' AND d.released_at < now() - interval '30 days'
        AND NOT EXISTS (SELECT 1 FROM public.object_publications o
                         WHERE o.key = d.object_key AND o.status IN ('reserved', 'published', 'deleting'))
      ORDER BY d.released_at, d.id
      LIMIT v_limit);
  GET DIAGNOSTICS v_gone = ROW_COUNT;
  RETURN v_count + v_gone;
END
$$;
--> statement-breakpoint
-- The P5 erasure step attachments.objects (deletion worker), for a current
-- deletion lease: the account's receipt objects still live are made due now,
-- and their number returned (0 once the sweep has deleted them all); NULL
-- for a stale lease. The purge must not run while one is still stored.
CREATE FUNCTION gogospend_attachment_erasure(p_job_id uuid, p_lease_token uuid) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_deletion_lease_account(p_job_id, p_lease_token);
  v_live integer;
BEGIN
  IF v_account IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
   WHERE o.account_id = v_account AND o.purpose = 'receipt' AND o.status IN ('reserved', 'published');
  SELECT count(*)::integer INTO v_live FROM public.object_publications o
   WHERE o.account_id = v_account AND o.purpose = 'receipt' AND o.status IN ('reserved', 'published', 'deleting');
  RETURN v_live;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_assign_image_attachment_id(), gogospend_transaction_attachment(uuid, uuid), gogospend_guard_transaction_attachment(),
  gogospend_release_attachment(uuid, uuid), gogospend_attachment_unheld(), gogospend_reserve_receipt_copy(uuid, uuid),
  gogospend_release_receipt_copy(text), gogospend_retain_attachment(uuid, text, bigint, bytea), gogospend_import_image_attachable_until(uuid),
  gogospend_prune_attachments(integer), gogospend_attachment_erasure(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_transaction_attachment(uuid, uuid), gogospend_reserve_receipt_copy(uuid, uuid), gogospend_release_receipt_copy(text),
  gogospend_retain_attachment(uuid, text, bigint, bytea), gogospend_import_image_attachable_until(uuid) TO gogospend_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_prune_attachments(integer) TO gogospend_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_attachment_erasure(uuid, uuid) TO gogospend_security;
