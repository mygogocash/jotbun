-- P2a: bounded private upload quarantine.
--   import_uploads - one row per upload attempt; its id is the import's job
--                    id (derived from the account and the idempotency key).
--                    It holds no file content. The body streams into 1 MiB
--                    quarantine parts, each registered in object_publications
--                    (purpose import_quarantine, the attempt's intake token in
--                    the lease-token slot) before its PUT. An accepted upload
--                    publishes its parts for 24 hours and queues one
--                    import_parse job (the import's own id) and one
--                    import_expire job due at expiry. Rows are also the quota
--                    ledger: attempts per 15 minutes, accepted bytes and parse
--                    jobs per 24 hours, as sliding windows decided under the
--                    common account lock. At most two uploads of an account
--                    stream at once.
-- The worker's import maintenance (every sweep) fails uploads left receiving
-- past their deadline, ends imports that are due or whose account is no
-- longer active at their lifecycle generation, and clears file names kept
-- past the 7-day preview window (a retention hook; P5 owns row retention).
-- The app writes these rows only through the routines below; the owner reads
-- its own rows. Nothing here writes a financial record.
CREATE TABLE import_uploads (
  job_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  lifecycle_generation integer NOT NULL CHECK (lifecycle_generation >= 0),
  intake_token uuid NOT NULL,
  -- receiving: the body is streaming; accepted: quarantined and queued for
  -- parsing; rejected: refused for its content or a limit; failed: the
  -- stream, storage, deadline or session ended it; expired: the quarantined
  -- file was deleted before it was parsed.
  status text NOT NULL CHECK (status IN ('receiving', 'accepted', 'rejected', 'failed', 'expired')),
  outcome_code text CHECK (outcome_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  -- A display label only (never part of a storage key); cleared when the
  -- upload is refused, fails or expires.
  file_name text CHECK (char_length(file_name) BETWEEN 1 AND 128),
  declared_type text NOT NULL CHECK (declared_type IN ('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'image/webp')),
  declared_bytes bigint CHECK (declared_bytes BETWEEN 1 AND 12582912),
  format text CHECK (format IN ('csv', 'xlsx', 'jpeg', 'png', 'webp')),
  bytes bigint CHECK (bytes BETWEEN 1 AND 12582912),
  sha256 bytea CHECK (sha256 IS NULL OR octet_length(sha256) = 32),
  part_count integer CHECK (part_count BETWEEN 1 AND 12),
  created_at timestamptz NOT NULL DEFAULT now(),
  receive_deadline timestamptz NOT NULL,
  accepted_at timestamptz,
  expires_at timestamptz,
  finished_at timestamptz,
  CHECK (receive_deadline > created_at AND receive_deadline <= created_at + interval '15 minutes'),
  CHECK ((status IN ('rejected', 'failed')) = (outcome_code IS NOT NULL)),
  CHECK ((status IN ('accepted', 'expired')) = (accepted_at IS NOT NULL)),
  CHECK (accepted_at IS NULL OR (format IS NOT NULL AND bytes IS NOT NULL AND part_count IS NOT NULL
                                 AND expires_at > accepted_at AND expires_at <= accepted_at + interval '24 hours')),
  -- An accepted (or parsed) import's name is cleared after its preview window.
  CHECK (status <> 'accepted' OR sha256 IS NOT NULL),
  CHECK (status <> 'receiving' OR file_name IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX import_uploads_account_created_idx ON import_uploads (account_id, created_at);
--> statement-breakpoint
CREATE INDEX import_uploads_account_accepted_idx ON import_uploads (account_id, accepted_at) WHERE accepted_at IS NOT NULL;
--> statement-breakpoint
-- The maintenance pass: uploads receiving, imports to end, names to clear.
CREATE INDEX import_uploads_receiving_idx ON import_uploads (receive_deadline) WHERE status = 'receiving';
--> statement-breakpoint
CREATE INDEX import_uploads_accepted_expiry_idx ON import_uploads (expires_at) WHERE status = 'accepted';
--> statement-breakpoint
CREATE INDEX import_uploads_named_idx ON import_uploads (accepted_at) WHERE file_name IS NOT NULL AND accepted_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE import_uploads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY import_uploads_owner ON import_uploads FOR SELECT TO gogospend_app
  USING (account_id = gogospend_current_account());
--> statement-breakpoint
GRANT SELECT ON import_uploads TO gogospend_app;
--> statement-breakpoint
-- Import jobs come only from the app's finish routine: the worker login cannot
-- mint an import_parse job (which will read a quarantined file) or an
-- import_expire job for any account.
DROP POLICY jobs_worker_insert ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_worker_insert ON jobs FOR INSERT TO gogospend_jobs
  WITH CHECK (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'sync_snapshot', 'export', 'import_parse', 'import_expire'));
--> statement-breakpoint
-- Quota helpers (called only by the routines below, as their owner).
-- Seconds until a parse-job slot frees when the account already has 10 in the
-- last 24 hours (accepted uploads, plus - when asked - uploads still
-- receiving, which may become one); NULL when a slot is free.
CREATE FUNCTION gogospend_import_parse_retry(p_account uuid, p_count_receiving boolean) RETURNS integer
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
AS $$
  WITH slots AS (
    SELECT u.accepted_at + interval '24 hours' AS frees_at FROM public.import_uploads u
     WHERE u.account_id = p_account AND u.accepted_at > now() - interval '24 hours'
    UNION ALL
    SELECT u.receive_deadline FROM public.import_uploads u
     WHERE p_count_receiving AND u.account_id = p_account AND u.status = 'receiving' AND u.receive_deadline > now()
  )
  SELECT greatest(1, ceil(extract(epoch FROM s.frees_at - now())))::integer FROM slots s ORDER BY s.frees_at DESC OFFSET 9 LIMIT 1
$$;
--> statement-breakpoint
-- Seconds until `p_need` more accepted bytes fit in the account's 50 MiB per
-- 24 hours (when enough earlier uploads leave the window); NULL when they fit.
CREATE FUNCTION gogospend_import_bytes_retry(p_account uuid, p_need bigint) RETURNS integer
  LANGUAGE plpgsql STABLE
  SET search_path = pg_catalog
AS $$
DECLARE
  v_used bigint;
  v_free timestamptz;
BEGIN
  SELECT coalesce(sum(u.bytes), 0) INTO v_used FROM public.import_uploads u
   WHERE u.account_id = p_account AND u.accepted_at > now() - interval '24 hours';
  IF v_used + p_need <= 52428800 THEN
    RETURN NULL;
  END IF;
  SELECT min(t.accepted_at) + interval '24 hours' INTO v_free
    FROM (SELECT u.accepted_at, sum(u.bytes) OVER (ORDER BY u.accepted_at, u.job_id) AS leaving
            FROM public.import_uploads u
           WHERE u.account_id = p_account AND u.accepted_at > now() - interval '24 hours') t
   WHERE v_used - t.leaving + p_need <= 52428800;
  RETURN greatest(1, ceil(extract(epoch FROM coalesce(v_free, now() + interval '24 hours') - now())))::integer;
END
$$;
--> statement-breakpoint
-- The first limit a new attempt (or a retry of a key refused by a limit,
-- p_job_id) would break, with the seconds until room returns; no row when it
-- may start. In order: at most 2 uploads streaming at once; at most 5
-- attempts in any 15 minutes; 10 parse jobs per 24 hours (counting uploads
-- still receiving, which may become one); 50 MiB accepted per 24 hours (with
-- the declared length, or 1 byte when none was declared).
CREATE FUNCTION gogospend_import_quota(p_account uuid, p_job_id uuid, p_declared_bytes bigint)
  RETURNS TABLE (code text, retry_after_seconds integer)
  LANGUAGE plpgsql STABLE
  SET search_path = pg_catalog
AS $$
DECLARE
  v_retry integer;
BEGIN
  -- A slot frees when an upload in progress ends; it is told to retry within a minute.
  SELECT least(60, greatest(1, ceil(extract(epoch FROM min(u.receive_deadline) - now()))))::integer INTO v_retry
    FROM public.import_uploads u
   WHERE u.account_id = p_account AND u.job_id <> p_job_id AND u.status = 'receiving' AND u.receive_deadline > now()
  HAVING count(*) >= 2;
  IF v_retry IS NOT NULL THEN
    RETURN QUERY SELECT 'limit_in_progress'::text, v_retry;
    RETURN;
  END IF;
  -- A slot frees when the fifth most recent attempt leaves the window.
  SELECT greatest(1, ceil(extract(epoch FROM u.created_at + interval '15 minutes' - now())))::integer INTO v_retry
    FROM public.import_uploads u
   WHERE u.account_id = p_account AND u.job_id <> p_job_id AND u.created_at > now() - interval '15 minutes'
   ORDER BY u.created_at DESC OFFSET 4 LIMIT 1;
  IF v_retry IS NOT NULL THEN
    RETURN QUERY SELECT 'limit_uploads'::text, v_retry;
    RETURN;
  END IF;
  v_retry := public.gogospend_import_parse_retry(p_account, true);
  IF v_retry IS NOT NULL THEN
    RETURN QUERY SELECT 'limit_parse_jobs'::text, v_retry;
    RETURN;
  END IF;
  v_retry := public.gogospend_import_bytes_retry(p_account, coalesce(p_declared_bytes, 1));
  IF v_retry IS NOT NULL THEN
    RETURN QUERY SELECT 'limit_bytes'::text, v_retry;
  END IF;
END
$$;
--> statement-breakpoint
-- Fails uploads still receiving past their deadline, or whose account is no
-- longer active at their lifecycle generation (one account's, or every
-- account's when NULL), clearing their names; their unpublished parts become
-- due for the sweep now. Returns how many uploads it failed.
CREATE FUNCTION gogospend_fail_stale_import_uploads(p_account uuid) RETURNS integer
  LANGUAGE plpgsql VOLATILE
  SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH stale AS (
    UPDATE public.import_uploads u
       SET status = 'failed', file_name = NULL, finished_at = now(),
           outcome_code = CASE WHEN u.receive_deadline <= now() THEN 'deadline_passed' ELSE 'account_changed' END
      FROM public.accounts a
     WHERE a.id = u.account_id AND u.status = 'receiving' AND (p_account IS NULL OR u.account_id = p_account)
       AND (u.receive_deadline <= now() OR a.status <> 'active' OR a.lifecycle_generation <> u.lifecycle_generation)
    RETURNING u.job_id, u.intake_token
  ), parts AS (
    UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
      FROM stale
     WHERE o.job_id = stale.job_id AND o.lease_token = stale.intake_token AND o.purpose = 'import_quarantine' AND o.status = 'reserved'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM stale;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- Ends an accepted import: cancels its parse job if it is still queued or
-- running, marks it expired (clearing its name and digest) unless it was
-- parsed, clears its name anyway when asked (an account that is going), and
-- makes every quarantine part of it due for the sweep now.
CREATE FUNCTION gogospend_end_import(p_import uuid, p_account uuid, p_clear_name boolean) RETURNS void
  LANGUAGE plpgsql VOLATILE
  SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE public.jobs j SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, finished_at = now(), updated_at = now()
   WHERE j.id = p_import AND j.kind = 'import_parse' AND j.account_id = p_account AND j.status IN ('queued', 'leased');
  UPDATE public.import_uploads u SET status = 'expired', file_name = NULL, sha256 = NULL, finished_at = now()
   WHERE u.job_id = p_import AND u.account_id = p_account AND u.status = 'accepted'
     AND NOT EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = p_import AND j.status = 'succeeded');
  IF p_clear_name THEN
    UPDATE public.import_uploads u SET file_name = NULL WHERE u.job_id = p_import AND u.account_id = p_account AND u.file_name IS NOT NULL;
  END IF;
  UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
   WHERE o.job_id = p_import AND o.account_id = p_account AND o.purpose = 'import_quarantine' AND o.status IN ('reserved', 'published');
END
$$;
--> statement-breakpoint
-- The owner starts an upload (inside an owner transaction, after the API
-- re-checked session and policy under the same lock). Under the account lock,
-- in order: the account's stale uploads fail (gogospend_fail_stale_import_uploads);
-- a retry of the same id returns its state ('replay' for an accepted or
-- expired upload, 'in_progress', or the earlier 'rejected'/'failed' outcome)
-- - except that a key refused only by a 24-hour limit is tried again like a
-- new attempt; otherwise the quotas decide ('limited' with the limit and the
-- seconds until room returns; nothing is recorded); otherwise the attempt is
-- recorded as receiving for at most 10 minutes ('started', with the bytes the
-- account may still have accepted in the 24-hour window).
CREATE FUNCTION gogospend_begin_import_upload(p_job_id uuid, p_intake_token uuid, p_file_name text, p_declared_type text, p_declared_bytes bigint)
  RETURNS TABLE (outcome text, code text, retry_after_seconds integer, remaining_bytes bigint)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_generation integer;
  v_row public.import_uploads%ROWTYPE;
  v_limit record;
  v_remaining bigint;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'uploading needs an owner transaction';
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  SELECT a.lifecycle_generation INTO v_generation FROM public.accounts a WHERE a.id = v_account AND a.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the account is not active' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public.gogospend_fail_stale_import_uploads(v_account);
  SELECT u.* INTO v_row FROM public.import_uploads u WHERE u.job_id = p_job_id FOR UPDATE;
  IF FOUND THEN
    IF v_row.account_id <> v_account THEN
      RAISE EXCEPTION 'upload id conflict' USING ERRCODE = 'unique_violation';
    END IF;
    IF v_row.status = 'receiving' THEN
      RETURN QUERY SELECT 'in_progress'::text, NULL::text, greatest(1, ceil(extract(epoch FROM v_row.receive_deadline - now())))::integer, NULL::bigint;
      RETURN;
    ELSIF v_row.status IN ('accepted', 'expired') THEN
      RETURN QUERY SELECT 'replay'::text, NULL::text, NULL::integer, NULL::bigint;
      RETURN;
    ELSIF NOT (v_row.status = 'rejected' AND v_row.outcome_code IN ('limit_bytes', 'limit_parse_jobs')) THEN
      RETURN QUERY SELECT v_row.status, v_row.outcome_code, NULL::integer, NULL::bigint;
      RETURN;
    END IF;
  END IF;
  SELECT q.code, q.retry_after_seconds INTO v_limit FROM public.gogospend_import_quota(v_account, p_job_id, p_declared_bytes) q;
  IF v_limit.code IS NOT NULL THEN
    RETURN QUERY SELECT 'limited'::text, v_limit.code, v_limit.retry_after_seconds, NULL::bigint;
    RETURN;
  END IF;
  SELECT 52428800 - coalesce(sum(u.bytes), 0) INTO v_remaining FROM public.import_uploads u
   WHERE u.account_id = v_account AND u.accepted_at > now() - interval '24 hours';
  IF v_row.job_id IS NOT NULL THEN
    -- A key refused by a limit starts again as a new attempt.
    UPDATE public.import_uploads u
       SET status = 'receiving', outcome_code = NULL, finished_at = NULL, lifecycle_generation = v_generation, intake_token = p_intake_token,
           file_name = p_file_name, declared_type = p_declared_type, declared_bytes = p_declared_bytes,
           created_at = now(), receive_deadline = now() + interval '10 minutes'
     WHERE u.job_id = p_job_id;
  ELSE
    INSERT INTO public.import_uploads (job_id, account_id, lifecycle_generation, intake_token, status, file_name, declared_type, declared_bytes, receive_deadline)
    VALUES (p_job_id, v_account, v_generation, p_intake_token, 'receiving', p_file_name, p_declared_type, p_declared_bytes, now() + interval '10 minutes');
  END IF;
  RETURN QUERY SELECT 'started'::text, NULL::text, NULL::integer, greatest(v_remaining, 0);
END
$$;
--> statement-breakpoint
-- Registers the key of quarantine part p_index (0-11) of an upload still
-- receiving under this intake token, before its deadline and while the
-- account is active at the upload's lifecycle generation. Committed before
-- the PUT, so the sweep always knows the object; the reservation is due 15
-- minutes after the upload's deadline. NULL when the upload cannot continue.
CREATE FUNCTION gogospend_reserve_import_part(p_job_id uuid, p_intake_token uuid, p_index integer) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_row public.import_uploads%ROWTYPE;
  v_key text;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'uploading needs an owner transaction';
  END IF;
  IF p_index IS NULL OR p_index NOT BETWEEN 0 AND 11 THEN
    RETURN NULL;
  END IF;
  SELECT u.* INTO v_row FROM public.import_uploads u JOIN public.accounts a ON a.id = u.account_id
   WHERE u.job_id = p_job_id AND u.account_id = v_account AND u.intake_token = p_intake_token AND u.status = 'receiving'
     AND u.receive_deadline > now() AND a.status = 'active' AND a.lifecycle_generation = u.lifecycle_generation;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_key := format('import_quarantine/%s/%s/%s/part-%s', v_account, p_job_id, p_intake_token, lpad(p_index::text, 4, '0'));
  INSERT INTO public.object_publications (key, job_id, account_id, lease_token, lifecycle_generation, purpose, delete_after)
  VALUES (v_key, p_job_id, v_account, p_intake_token, v_row.lifecycle_generation, 'import_quarantine', v_row.receive_deadline + interval '15 minutes');
  RETURN v_key;
END
$$;
--> statement-breakpoint
-- Accepts a received upload (owner transaction, after the API re-checked the
-- session and policy under the same lock). Under the account lock: the
-- upload must still be receiving under this token, before its deadline, with
-- the account active at the same lifecycle generation ('refused' otherwise);
-- the parts must be exactly its own reservations part-0000.. in order, with
-- the stated sizes adding up; the 24-hour quotas are re-checked ('limited':
-- the upload is rejected). Then, at once: the parts are published for 24
-- hours, the upload is accepted, and one import_parse job (the upload's own
-- id) plus one import_expire job due at expiry are queued.
CREATE FUNCTION gogospend_finish_import_upload(p_job_id uuid, p_intake_token uuid, p_format text, p_bytes bigint, p_sha256 bytea, p_parts jsonb)
  RETURNS TABLE (outcome text, code text, retry_after_seconds integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_row public.import_uploads%ROWTYPE;
  v_status text;
  v_generation integer;
  v_count integer;
  v_matched integer;
  v_sum bigint;
  v_retry integer;
  v_code text;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'uploading needs an owner transaction';
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  SELECT u.* INTO v_row FROM public.import_uploads u
   WHERE u.job_id = p_job_id AND u.account_id = v_account AND u.intake_token = p_intake_token AND u.status = 'receiving'
   FOR UPDATE;
  IF NOT FOUND OR v_row.receive_deadline <= now() THEN
    RETURN QUERY SELECT 'refused'::text, 'deadline_passed'::text, NULL::integer;
    RETURN;
  END IF;
  SELECT a.status, a.lifecycle_generation INTO v_status, v_generation FROM public.accounts a WHERE a.id = v_account;
  IF v_status IS DISTINCT FROM 'active' OR v_generation IS DISTINCT FROM v_row.lifecycle_generation THEN
    RETURN QUERY SELECT 'refused'::text, 'account_changed'::text, NULL::integer;
    RETURN;
  END IF;
  IF jsonb_typeof(p_parts) IS DISTINCT FROM 'array' OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 12582912
     OR p_sha256 IS NULL OR octet_length(p_sha256) <> 32
     OR p_format IS DISTINCT FROM (CASE v_row.declared_type
                                     WHEN 'text/csv' THEN 'csv'
                                     WHEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' THEN 'xlsx'
                                     WHEN 'image/jpeg' THEN 'jpeg'
                                     WHEN 'image/png' THEN 'png'
                                     WHEN 'image/webp' THEN 'webp' END) THEN
    RAISE EXCEPTION 'an upload does not match its declaration';
  END IF;
  v_count := jsonb_array_length(p_parts);
  IF v_count NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'an upload has 1-12 parts';
  END IF;
  SELECT count(*), coalesce(sum((c.value ->> 'bytes')::bigint), 0) INTO v_matched, v_sum
    FROM jsonb_array_elements(p_parts) WITH ORDINALITY AS c(value, ordinal)
    JOIN public.object_publications o ON o.key = c.value ->> 'key'
   WHERE o.job_id = p_job_id AND o.lease_token = p_intake_token AND o.account_id = v_account
     AND o.purpose = 'import_quarantine' AND o.status = 'reserved'
     AND o.key = format('import_quarantine/%s/%s/%s/part-%s', v_account, p_job_id, p_intake_token, lpad((c.ordinal - 1)::text, 4, '0'))
     AND jsonb_typeof(c.value -> 'bytes') = 'number' AND (c.value ->> 'bytes')::bigint BETWEEN 1 AND 1048576
     AND (c.value ->> 'sha256') ~ '^[0-9a-f]{64}$';
  IF v_matched <> v_count OR v_sum <> p_bytes THEN
    RAISE EXCEPTION 'quarantine parts do not match the upload';
  END IF;
  v_retry := public.gogospend_import_parse_retry(v_account, false);
  v_code := 'limit_parse_jobs';
  IF v_retry IS NULL THEN
    v_retry := public.gogospend_import_bytes_retry(v_account, p_bytes);
    v_code := 'limit_bytes';
  END IF;
  IF v_retry IS NOT NULL THEN
    -- Its parts are discarded by the API (gogospend_abort_import_upload), or
    -- swept. A retry with the same key is decided again (begin).
    UPDATE public.import_uploads u SET status = 'rejected', outcome_code = v_code, file_name = NULL, finished_at = now() WHERE u.job_id = p_job_id;
    RETURN QUERY SELECT 'limited'::text, v_code, v_retry;
    RETURN;
  END IF;
  UPDATE public.object_publications o
     SET status = 'published', bytes = (c.value ->> 'bytes')::bigint, sha256 = decode(c.value ->> 'sha256', 'hex'),
         published_at = now(), delete_after = now() + interval '24 hours'
    FROM jsonb_array_elements(p_parts) AS c(value)
   WHERE o.key = c.value ->> 'key' AND o.job_id = p_job_id AND o.lease_token = p_intake_token AND o.account_id = v_account
     AND o.purpose = 'import_quarantine' AND o.status = 'reserved';
  -- Reservations this upload made but did not use are due now.
  UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
   WHERE o.job_id = p_job_id AND o.lease_token = p_intake_token AND o.purpose = 'import_quarantine' AND o.status = 'reserved';
  UPDATE public.import_uploads u
     SET status = 'accepted', format = p_format, bytes = p_bytes, sha256 = p_sha256, part_count = v_count,
         accepted_at = now(), expires_at = now() + interval '24 hours'
   WHERE u.job_id = p_job_id;
  INSERT INTO public.jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts, max_runtime_seconds)
  VALUES (p_job_id, 'import_parse', v_account, v_generation, '{}'::jsonb, 3, 120);
  INSERT INTO public.jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts, max_runtime_seconds, run_after)
  VALUES (gen_random_uuid(), 'import_expire', v_account, v_generation, jsonb_build_object('import_job_id', p_job_id), 3, 60, now() + interval '24 hours');
  RETURN QUERY SELECT 'accepted'::text, NULL::text, NULL::integer;
END
$$;
--> statement-breakpoint
-- Ends an upload still receiving under this token as rejected or failed, and
-- moves its unpublished reservations to `deleting` (the sweep retries those)
-- returning their keys, so the API deletes the objects at once and then
-- confirms them with gogospend_discard_import_parts.
CREATE FUNCTION gogospend_abort_import_upload(p_job_id uuid, p_intake_token uuid, p_status text, p_code text) RETURNS SETOF text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'uploading needs an owner transaction';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('rejected', 'failed') THEN
    RAISE EXCEPTION 'an upload ends rejected or failed';
  END IF;
  UPDATE public.import_uploads u SET status = p_status, outcome_code = p_code, file_name = NULL, finished_at = now()
   WHERE u.job_id = p_job_id AND u.account_id = v_account AND u.intake_token = p_intake_token AND u.status = 'receiving';
  RETURN QUERY
    UPDATE public.object_publications o SET status = 'deleting'
     WHERE o.job_id = p_job_id AND o.lease_token = p_intake_token AND o.account_id = v_account
       AND o.purpose = 'import_quarantine' AND o.status = 'reserved'
    RETURNING o.key;
END
$$;
--> statement-breakpoint
-- Marks parts of this upload `deleted` once the API's storage deletes succeeded.
CREATE FUNCTION gogospend_discard_import_parts(p_job_id uuid, p_intake_token uuid, p_keys text[]) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_count integer;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'uploading needs an owner transaction';
  END IF;
  UPDATE public.object_publications o SET status = 'deleted', deleted_at = now()
   WHERE o.key = ANY (p_keys) AND o.job_id = p_job_id AND o.lease_token = p_intake_token AND o.account_id = v_account
     AND o.purpose = 'import_quarantine' AND o.status = 'deleting';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- The owner's parse-job state for an import, or NULL when it has none.
CREATE FUNCTION gogospend_import_job_status(p_job_id uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT j.status FROM public.jobs j
   WHERE j.id = p_job_id AND j.kind = 'import_parse' AND j.account_id = public.gogospend_current_account()
$$;
--> statement-breakpoint
-- The worker's import_expire handler, inside its fenced completion
-- transaction (after gogospend_lock_current_job): for a current lease of an
-- import_expire job, once its import's 24 hours have passed, cancels the
-- import's parse job if it is still queued or running, marks an unparsed
-- import expired (clearing its file name and digest), and makes every
-- quarantine part of it due for the sweep now. False when the lease is not
-- current or the import is not due yet; true when there is nothing to expire.
CREATE FUNCTION gogospend_expire_import(p_job_id uuid, p_lease_token uuid) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_import uuid;
  v_row public.import_uploads%ROWTYPE;
BEGIN
  SELECT j.* INTO v_job FROM public.jobs j
   WHERE j.id = p_job_id AND j.kind = 'import_expire' AND j.status = 'leased' AND j.lease_token = p_lease_token
     AND j.lease_expires_at > clock_timestamp();
  IF NOT FOUND OR v_job.account_id IS NULL THEN
    RETURN false;
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_job.account_id FOR UPDATE;
  IF jsonb_typeof(v_job.payload -> 'import_job_id') IS DISTINCT FROM 'string' OR (v_job.payload ->> 'import_job_id') !~ '^[0-9a-f-]{36}$' THEN
    RETURN false;
  END IF;
  v_import := (v_job.payload ->> 'import_job_id')::uuid;
  SELECT u.* INTO v_row FROM public.import_uploads u WHERE u.job_id = v_import AND u.account_id = v_job.account_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN true;
  END IF;
  IF v_row.expires_at IS NULL OR v_row.expires_at > now() THEN
    RETURN false;
  END IF;
  PERFORM public.gogospend_end_import(v_import, v_job.account_id, false);
  RETURN true;
END
$$;
--> statement-breakpoint
-- Seconds until `p_need` more accepted bytes fit in the owner's 24-hour
-- window (at least 1): the retry time of an upload refused while streaming.
CREATE FUNCTION gogospend_import_bytes_wait(p_need bigint) RETURNS integer
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'uploading needs an owner transaction';
  END IF;
  RETURN coalesce(public.gogospend_import_bytes_retry(v_account, greatest(coalesce(p_need, 1), 1)), 1);
END
$$;
--> statement-breakpoint
-- The worker's import maintenance (each sweep), in order: fails stale uploads
-- (gogospend_fail_stale_import_uploads); ends imports that are past their
-- expiry (their expiry job was cancelled or failed) or whose account is no
-- longer active at their lifecycle generation (deleting, disabled, or moved
-- on) - at most 1,000 per run, skipping rows another transaction holds; and
-- clears file names kept more than 8 days after acceptance (a parsed import
-- keeps its name through its 7-day preview window; P5 owns the rows'
-- retention). Returns the counts.
CREATE FUNCTION gogospend_import_maintenance() RETURNS TABLE (stale integer, expired integer, names_cleared integer)
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
REVOKE ALL ON FUNCTION gogospend_import_parse_retry(uuid, boolean), gogospend_import_bytes_retry(uuid, bigint),
  gogospend_import_quota(uuid, uuid, bigint), gogospend_fail_stale_import_uploads(uuid), gogospend_end_import(uuid, uuid, boolean),
  gogospend_begin_import_upload(uuid, uuid, text, text, bigint), gogospend_reserve_import_part(uuid, uuid, integer),
  gogospend_finish_import_upload(uuid, uuid, text, bigint, bytea, jsonb), gogospend_abort_import_upload(uuid, uuid, text, text),
  gogospend_discard_import_parts(uuid, uuid, text[]), gogospend_import_job_status(uuid), gogospend_expire_import(uuid, uuid),
  gogospend_import_bytes_wait(bigint), gogospend_import_maintenance() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_begin_import_upload(uuid, uuid, text, text, bigint), gogospend_reserve_import_part(uuid, uuid, integer),
  gogospend_finish_import_upload(uuid, uuid, text, bigint, bytea, jsonb), gogospend_abort_import_upload(uuid, uuid, text, text),
  gogospend_discard_import_parts(uuid, uuid, text[]), gogospend_import_job_status(uuid), gogospend_import_bytes_wait(bigint) TO gogospend_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_expire_import(uuid, uuid), gogospend_import_maintenance() TO gogospend_jobs;
