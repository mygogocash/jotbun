-- P2b: quarantined files parsed into reviewable previews.
--   import_previews   - one row per parsed import (the import's job id): ready
--                       with candidates, or rejected with file-level issue
--                       codes; expired after 7 days. Exact totals are
--                       recomputed here from the stored candidates.
--   import_candidates - one row per reviewable source row, with a stable
--                       source-row id and nullable fields: a value is what the
--                       file says or NULL, never a guess.
-- Written only by the worker's import_parse job through
-- gogospend_record_import_preview, inside P1's fenced completion transaction
-- (account lock, current lease, active account at the job's generation). The
-- owner reads its own rows. Nothing here writes a financial record: P3
-- confirms selected candidates explicitly through the command executor.
-- File-level issues: at most 32 short identifier codes.
CREATE FUNCTION gogospend_valid_import_file_issues(p_issues jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(p_issues) = 'array' AND jsonb_array_length(p_issues) <= 32
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_issues) AS i(value)
        WHERE CASE WHEN jsonb_typeof(i.value) IS DISTINCT FROM 'string' THEN true
                   ELSE (i.value #>> '{}') !~ '^[a-z][a-z0-9_]{0,63}$' END)
$$;
--> statement-breakpoint
-- Row issues: at most 16 objects of exactly {field, code}, field one of the
-- candidate fields or null, code a short identifier.
CREATE FUNCTION gogospend_valid_import_row_issues(p_issues jsonb) RETURNS boolean
  LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(p_issues) = 'array' AND jsonb_array_length(p_issues) <= 16
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_issues) AS i(value)
        WHERE CASE WHEN jsonb_typeof(i.value) IS DISTINCT FROM 'object' THEN true
                   WHEN NOT (i.value ?& ARRAY['field', 'code']) THEN true
                   WHEN (SELECT count(*) FROM jsonb_object_keys(i.value)) <> 2 THEN true
                   WHEN jsonb_typeof(i.value -> 'code') IS DISTINCT FROM 'string' THEN true
                   WHEN (i.value ->> 'code') !~ '^[a-z][a-z0-9_]{0,63}$' THEN true
                   WHEN jsonb_typeof(i.value -> 'field') = 'null' THEN false
                   ELSE (i.value ->> 'field') NOT IN ('occurred_on', 'type', 'amount_minor', 'wallet_label', 'category_label', 'merchant', 'note') END)
$$;
--> statement-breakpoint
CREATE TABLE import_previews (
  job_id uuid PRIMARY KEY REFERENCES import_uploads (job_id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  lifecycle_generation integer NOT NULL CHECK (lifecycle_generation >= 0),
  status text NOT NULL CHECK (status IN ('ready', 'rejected', 'expired')),
  layout text CHECK (layout IN ('meowjot', 'moneylover', 'spendee', 'generic', 'receipt')),
  issues jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (gogospend_valid_import_file_issues(issues)),
  candidate_count integer NOT NULL CHECK (candidate_count BETWEEN 0 AND 5000),
  review_required_count integer NOT NULL CHECK (review_required_count BETWEEN 0 AND candidate_count),
  expense_total_minor bigint NOT NULL DEFAULT 0 CHECK (expense_total_minor >= 0),
  income_total_minor bigint NOT NULL DEFAULT 0 CHECK (income_total_minor >= 0),
  transfer_total_minor bigint NOT NULL DEFAULT 0 CHECK (transfer_total_minor >= 0),
  -- The sanitized receipt image, published in object_publications (purpose
  -- import_image) for 24 hours unless P2c retains it.
  image_key text UNIQUE,
  image_width integer,
  image_height integer,
  review_revision bigint NOT NULL DEFAULT 1 CHECK (review_revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  expired_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days'),
  CHECK ((status = 'expired') = (expired_at IS NOT NULL)),
  CHECK ((image_key IS NULL) = (image_width IS NULL) AND (image_key IS NULL) = (image_height IS NULL)),
  CHECK (image_key IS NULL OR starts_with(image_key, 'import_image/' || account_id::text || '/' || job_id::text || '/')),
  CHECK (image_width IS NULL OR (image_width >= 1 AND image_height >= 1 AND image_width::bigint * image_height <= 20000000)),
  CHECK (status <> 'ready' OR layout IS NOT NULL),
  CHECK (status <> 'rejected' OR (candidate_count = 0 AND image_key IS NULL AND jsonb_array_length(issues) >= 1))
);
--> statement-breakpoint
CREATE TABLE import_candidates (
  job_id uuid NOT NULL REFERENCES import_previews (job_id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  -- row:<n> is the n-th CSV record or worksheet row (the header counts);
  -- image:1 is the single image.
  source_row_id text NOT NULL CHECK (source_row_id ~ '^(row:[1-9][0-9]{0,7}|image:1)$'),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 5000),
  occurred_on date CHECK (occurred_on >= DATE '1970-01-01'),
  type text CHECK (type IN ('expense', 'income', 'transfer')),
  amount_minor bigint CHECK (amount_minor BETWEEN 1 AND 99999999999),
  wallet_label text CHECK (char_length(wallet_label) BETWEEN 1 AND 80 AND wallet_label !~ '[[:cntrl:]]'),
  category_label text CHECK (char_length(category_label) BETWEEN 1 AND 80 AND category_label !~ '[[:cntrl:]]'),
  merchant text CHECK (char_length(merchant) BETWEEN 1 AND 120 AND merchant !~ '[[:cntrl:]]'),
  note text CHECK (char_length(note) BETWEEN 1 AND 500 AND note !~ '[\x01-\x09\x0b-\x1f\x7f]'),
  issues jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (gogospend_valid_import_row_issues(issues)),
  review_required boolean NOT NULL,
  -- A row that needs no review has every required value and no issue.
  CHECK (review_required OR (occurred_on IS NOT NULL AND type IS NOT NULL AND amount_minor IS NOT NULL AND wallet_label IS NOT NULL AND issues = '[]'::jsonb)),
  PRIMARY KEY (job_id, source_row_id),
  UNIQUE (job_id, ordinal)
);
--> statement-breakpoint
CREATE INDEX import_candidates_account_idx ON import_candidates (account_id, occurred_on);
--> statement-breakpoint
ALTER TABLE import_previews ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE import_candidates ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY import_previews_owner ON import_previews FOR SELECT TO gogospend_app
  USING (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY import_candidates_owner ON import_candidates FOR SELECT TO gogospend_app
  USING (account_id = gogospend_current_account());
--> statement-breakpoint
GRANT SELECT ON import_previews, import_candidates TO gogospend_app;
--> statement-breakpoint
-- The worker's parse job reads its import's quarantine description (format,
-- size, digest, parts in order) for a current lease of an import_parse job
-- whose account is active at the job's generation, while the upload is
-- accepted and its raw file has not expired. No rows otherwise.
CREATE FUNCTION gogospend_import_parse_source(p_job_id uuid, p_lease_token uuid)
  RETURNS TABLE (format text, bytes bigint, sha256 text, part_count integer, expires_at timestamptz, part_keys text[], part_bytes bigint[], part_sha256 text[])
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_status text;
  v_generation integer;
BEGIN
  SELECT j.* INTO v_job FROM public.jobs j
   WHERE j.id = p_job_id AND j.kind = 'import_parse' AND j.status = 'leased' AND j.lease_token = p_lease_token
     AND j.lease_expires_at > clock_timestamp() AND j.account_id IS NOT NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT a.status, a.lifecycle_generation INTO v_status, v_generation FROM public.accounts a WHERE a.id = v_job.account_id;
  IF v_status IS DISTINCT FROM 'active' OR v_generation IS DISTINCT FROM v_job.lifecycle_generation THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT u.format, u.bytes, encode(u.sha256, 'hex'), u.part_count, u.expires_at,
           coalesce(array_agg(o.key ORDER BY o.key) FILTER (WHERE o.key IS NOT NULL), '{}'::text[]),
           coalesce(array_agg(o.bytes ORDER BY o.key) FILTER (WHERE o.key IS NOT NULL), '{}'::bigint[]),
           coalesce(array_agg(encode(o.sha256, 'hex') ORDER BY o.key) FILTER (WHERE o.key IS NOT NULL), '{}'::text[])
      FROM public.import_uploads u
      LEFT JOIN public.object_publications o
        ON o.job_id = u.job_id AND o.account_id = u.account_id AND o.lease_token = u.intake_token
       AND o.purpose = 'import_quarantine' AND o.status = 'published'
     WHERE u.job_id = p_job_id AND u.account_id = v_job.account_id AND u.status = 'accepted' AND u.expires_at > now()
     GROUP BY u.job_id, u.format, u.bytes, u.sha256, u.part_count, u.expires_at;
END
$$;
--> statement-breakpoint
-- Records a parse result, inside the parse job's fenced completion
-- transaction (after gogospend_lock_current_job). Under the account lock:
-- the lease must be a current import_parse lease, the account active at the
-- job's generation and the upload still accepted (false otherwise: the caller
-- rolls back). A preview image must be this lease's own published
-- import_image object. The candidates' ordinals must be exactly 1..n; every
-- other rule is a table CHECK (an invalid row aborts the whole record). The
-- totals and review count are computed here from the stored candidates. One
-- import_expire job (stage "preview") is queued for the 7-day expiry.
CREATE FUNCTION gogospend_record_import_preview(p_job_id uuid, p_lease_token uuid, p_preview jsonb, p_candidates jsonb) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_status text;
  v_generation integer;
  v_count integer;
  v_image text;
  v_expires timestamptz := now() + interval '7 days';
BEGIN
  SELECT j.* INTO v_job FROM public.jobs j
   WHERE j.id = p_job_id AND j.kind = 'import_parse' AND j.status = 'leased' AND j.lease_token = p_lease_token
     AND j.lease_expires_at > clock_timestamp() AND j.account_id IS NOT NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_job.account_id FOR UPDATE;
  SELECT a.status, a.lifecycle_generation INTO v_status, v_generation FROM public.accounts a WHERE a.id = v_job.account_id;
  IF v_status IS DISTINCT FROM 'active' OR v_generation IS DISTINCT FROM v_job.lifecycle_generation THEN
    RETURN false;
  END IF;
  PERFORM 1 FROM public.import_uploads u WHERE u.job_id = p_job_id AND u.account_id = v_job.account_id AND u.status = 'accepted' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p_preview) IS DISTINCT FROM 'object' OR jsonb_typeof(p_candidates) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'a preview is an object and its candidates an array' USING ERRCODE = 'check_violation';
  END IF;
  v_count := jsonb_array_length(p_candidates);
  v_image := p_preview ->> 'image_key';
  IF v_image IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.object_publications o
        WHERE o.key = v_image AND o.job_id = p_job_id AND o.lease_token = p_lease_token AND o.account_id = v_job.account_id
          AND o.purpose = 'import_image' AND o.status = 'published') THEN
    RAISE EXCEPTION 'a preview image is its own lease''s published object' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.import_previews (job_id, account_id, lifecycle_generation, status, layout, issues, candidate_count, review_required_count,
                                      image_key, image_width, image_height, expires_at)
  VALUES (p_job_id, v_job.account_id, v_job.lifecycle_generation, p_preview ->> 'status', p_preview ->> 'layout',
          coalesce(p_preview -> 'issues', '[]'::jsonb), v_count, 0, v_image,
          (p_preview ->> 'image_width')::integer, (p_preview ->> 'image_height')::integer, v_expires);
  INSERT INTO public.import_candidates (job_id, account_id, source_row_id, ordinal, occurred_on, type, amount_minor,
                                        wallet_label, category_label, merchant, note, issues, review_required)
  SELECT p_job_id, v_job.account_id, c.source_row_id, c.ordinal, c.occurred_on, c.type, c.amount_minor,
         c.wallet_label, c.category_label, c.merchant, c.note, c.issues, c.review_required
    FROM jsonb_to_recordset(p_candidates) AS c(source_row_id text, ordinal integer, occurred_on date, type text, amount_minor bigint,
                                               wallet_label text, category_label text, merchant text, note text, issues jsonb, review_required boolean);
  IF EXISTS (SELECT 1 FROM public.import_candidates c WHERE c.job_id = p_job_id AND c.ordinal > v_count) THEN
    RAISE EXCEPTION 'candidate ordinals are 1..n' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.import_previews p
     SET review_required_count = t.review,
         expense_total_minor = t.expense,
         income_total_minor = t.income,
         transfer_total_minor = t.transfer
    FROM (SELECT count(*) FILTER (WHERE c.review_required) AS review,
                 coalesce(sum(c.amount_minor) FILTER (WHERE c.type = 'expense'), 0) AS expense,
                 coalesce(sum(c.amount_minor) FILTER (WHERE c.type = 'income'), 0) AS income,
                 coalesce(sum(c.amount_minor) FILTER (WHERE c.type = 'transfer'), 0) AS transfer
            FROM public.import_candidates c WHERE c.job_id = p_job_id) t
   WHERE p.job_id = p_job_id;
  INSERT INTO public.jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts, max_runtime_seconds, run_after)
  VALUES (gen_random_uuid(), 'import_expire', v_job.account_id, v_job.lifecycle_generation,
          jsonb_build_object('import_job_id', p_job_id, 'stage', 'preview'), 3, 60, v_expires);
  RETURN true;
END
$$;
--> statement-breakpoint
-- The worker's import_expire handler for the "preview" stage, inside its
-- fenced completion transaction: once a preview's 7 days have passed, its
-- unconfirmed candidates are deleted, the preview is marked expired and an
-- unattached sanitized image is made due for the sweep. False when the lease
-- is not current or the preview is not due yet; true when there is nothing
-- (left) to expire, including for a job of the 24-hour stage.
CREATE FUNCTION gogospend_expire_import_preview(p_job_id uuid, p_lease_token uuid) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_import uuid;
  v_preview public.import_previews%ROWTYPE;
BEGIN
  SELECT j.* INTO v_job FROM public.jobs j
   WHERE j.id = p_job_id AND j.kind = 'import_expire' AND j.status = 'leased' AND j.lease_token = p_lease_token
     AND j.lease_expires_at > clock_timestamp();
  IF NOT FOUND OR v_job.account_id IS NULL THEN
    RETURN false;
  END IF;
  IF (v_job.payload ->> 'stage') IS DISTINCT FROM 'preview' THEN
    RETURN true;
  END IF;
  IF jsonb_typeof(v_job.payload -> 'import_job_id') IS DISTINCT FROM 'string' OR (v_job.payload ->> 'import_job_id') !~ '^[0-9a-f-]{36}$' THEN
    RETURN false;
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_job.account_id FOR UPDATE;
  v_import := (v_job.payload ->> 'import_job_id')::uuid;
  SELECT p.* INTO v_preview FROM public.import_previews p WHERE p.job_id = v_import AND p.account_id = v_job.account_id FOR UPDATE;
  IF NOT FOUND OR v_preview.status = 'expired' THEN
    RETURN true;
  END IF;
  IF v_preview.expires_at > now() THEN
    RETURN false;
  END IF;
  DELETE FROM public.import_candidates c WHERE c.job_id = v_import;
  UPDATE public.import_previews p SET status = 'expired', expired_at = now() WHERE p.job_id = v_import;
  UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
   WHERE o.job_id = v_import AND o.account_id = v_job.account_id AND o.purpose = 'import_image' AND o.status IN ('reserved', 'published');
  RETURN true;
END
$$;
--> statement-breakpoint
-- The owner's failed parse job's error code (a short identifier), or NULL.
CREATE FUNCTION gogospend_import_parse_failure(p_job_id uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT j.last_error FROM public.jobs j
   WHERE j.id = p_job_id AND j.kind = 'import_parse' AND j.status = 'failed' AND j.account_id = public.gogospend_current_account()
$$;
--> statement-breakpoint
-- P2b review fixes (M1): duplicate advice names at most 5 of the owner's
-- active records per candidate, looked up through this index (date, type and
-- amount, then id order), so 5,000 rows against 5,000 identical records stay
-- linear whatever join the planner would have chosen.
CREATE INDEX transactions_duplicate_advice_idx ON transactions (account_id, occurred_on, type, amount_minor, id) WHERE deleted_at IS NULL;
--> statement-breakpoint
-- P2b review fixes (M4): previews the retention backstop below has to visit.
CREATE INDEX import_previews_due_idx ON import_previews (expires_at) WHERE status <> 'expired';
--> statement-breakpoint
-- P2b review fixes (M4): the retention backstop of the 7-day preview expiry
-- (P5's imports.previews step). The expiry job ends superseded when its
-- account was disabled or at another lifecycle generation when it fell due,
-- and can fail; this expires every preview past expires_at whatever its
-- account's state. Deleting is always safe, so there is no generation fence:
-- the candidates are deleted, the preview marked expired and an unattached
-- sanitized image made due, as gogospend_expire_import_preview does. At most
-- p_limit (1-1,000) accounts per call, each under its account lock taken
-- with SKIP LOCKED (an account a writer holds waits for the next pass).
-- Returns how many previews it expired.
CREATE FUNCTION gogospend_expire_due_import_previews(p_limit integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_jobs uuid[];
  v_count integer := 0;
BEGIN
  FOR v_account IN
    SELECT DISTINCT p.account_id FROM public.import_previews p
     WHERE p.status <> 'expired' AND p.expires_at <= now()
     ORDER BY p.account_id
     LIMIT least(greatest(coalesce(p_limit, 1), 1), 1000)
  LOOP
    PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    SELECT array_agg(d.job_id) INTO v_jobs FROM (
      SELECT p.job_id FROM public.import_previews p
       WHERE p.account_id = v_account AND p.status <> 'expired' AND p.expires_at <= now()
       FOR UPDATE SKIP LOCKED) d;
    IF v_jobs IS NULL THEN
      CONTINUE;
    END IF;
    DELETE FROM public.import_candidates c WHERE c.job_id = ANY (v_jobs);
    UPDATE public.import_previews p SET status = 'expired', expired_at = now() WHERE p.job_id = ANY (v_jobs);
    UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
     WHERE o.job_id = ANY (v_jobs) AND o.account_id = v_account AND o.purpose = 'import_image' AND o.status IN ('reserved', 'published');
    v_count := v_count + cardinality(v_jobs);
  END LOOP;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- P2b review fixes (minor 4): a recorded preview means the import was parsed,
-- even once P5 has pruned its succeeded parse job (30 days after it
-- finished). P2a's routines below inferred "parsed" from that job alone, so
-- the maintenance pass turned a parsed import into an expired upload (and
-- restarted its 30-day retention) and the status route said `cancelled`.
-- Replaced from 0014 with only that inference changed.
CREATE OR REPLACE FUNCTION gogospend_end_import(p_import uuid, p_account uuid, p_clear_name boolean) RETURNS void
  LANGUAGE plpgsql VOLATILE
  SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE public.jobs j SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, finished_at = now(), updated_at = now()
   WHERE j.id = p_import AND j.kind = 'import_parse' AND j.account_id = p_account AND j.status IN ('queued', 'leased');
  UPDATE public.import_uploads u SET status = 'expired', file_name = NULL, sha256 = NULL, finished_at = now()
   WHERE u.job_id = p_import AND u.account_id = p_account AND u.status = 'accepted'
     AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = p_import AND j.status = 'succeeded')
     AND NOT EXISTS (SELECT 1 FROM public.import_previews p WHERE p.job_id = p_import);
  IF p_clear_name THEN
    UPDATE public.import_uploads u SET file_name = NULL WHERE u.job_id = p_import AND u.account_id = p_account AND u.file_name IS NOT NULL;
  END IF;
  UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
   WHERE o.job_id = p_import AND o.account_id = p_account AND o.purpose = 'import_quarantine' AND o.status IN ('reserved', 'published');
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION gogospend_import_maintenance() RETURNS TABLE (stale integer, expired integer, names_cleared integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_stale integer;
  v_expired integer := 0;
  v_names integer;
  v_row record;
BEGIN
  v_stale := public.gogospend_fail_stale_import_uploads(NULL);
  FOR v_row IN
    SELECT u.job_id, u.account_id, (a.status <> 'active' OR a.lifecycle_generation <> u.lifecycle_generation) AS gone
      FROM public.import_uploads u
      JOIN public.accounts a ON a.id = u.account_id
     WHERE u.status = 'accepted'
       AND (u.expires_at <= now() OR a.status <> 'active' OR a.lifecycle_generation <> u.lifecycle_generation)
       AND (NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = u.job_id AND j.status = 'succeeded')
                AND NOT EXISTS (SELECT 1 FROM public.import_previews p WHERE p.job_id = u.job_id)
            OR u.file_name IS NOT NULL AND (a.status <> 'active' OR a.lifecycle_generation <> u.lifecycle_generation)
            OR EXISTS (SELECT 1 FROM public.object_publications o
                        WHERE o.job_id = u.job_id AND o.purpose = 'import_quarantine' AND o.status IN ('reserved', 'published') AND o.delete_after > now()))
     ORDER BY u.expires_at
     LIMIT 1000
     FOR UPDATE OF u SKIP LOCKED
  LOOP
    PERFORM public.gogospend_end_import(v_row.job_id, v_row.account_id, v_row.gone);
    v_expired := v_expired + 1;
  END LOOP;
  UPDATE public.import_uploads u SET file_name = NULL
   WHERE u.file_name IS NOT NULL AND u.accepted_at IS NOT NULL AND u.accepted_at < now() - interval '8 days';
  GET DIAGNOSTICS v_names = ROW_COUNT;
  RETURN QUERY SELECT v_stale, v_expired, v_names;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION gogospend_import_job_status(p_job_id uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT coalesce(
    (SELECT j.status FROM public.jobs j
      WHERE j.id = p_job_id AND j.kind = 'import_parse' AND j.account_id = public.gogospend_current_account()),
    (SELECT 'succeeded'::text FROM public.import_previews p
      WHERE p.job_id = p_job_id AND p.account_id = public.gogospend_current_account()))
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_valid_import_file_issues(jsonb), gogospend_valid_import_row_issues(jsonb),
  gogospend_import_parse_source(uuid, uuid), gogospend_record_import_preview(uuid, uuid, jsonb, jsonb),
  gogospend_expire_import_preview(uuid, uuid), gogospend_import_parse_failure(uuid), gogospend_expire_due_import_previews(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_import_parse_source(uuid, uuid), gogospend_record_import_preview(uuid, uuid, jsonb, jsonb),
  gogospend_expire_import_preview(uuid, uuid), gogospend_expire_due_import_previews(integer) TO gogospend_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_import_parse_failure(uuid) TO gogospend_app;
