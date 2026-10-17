-- P4: private asynchronous export.
--   exports - one row per export request; its id is also the export job's id
--             and the `export` entity's id. The owner's command writes the
--             request (inclusive period, lifecycle generation) under the
--             account lock. Only gogospend_record_export, inside the worker's
--             publish-and-complete transaction, adds the file: its private
--             object key, size, digest, row count, the revision it was read
--             at and a 24-hour expiry. Owner-read RLS; the object key never
--             leaves the server (downloads go through short-lived grants).
--   gogospend_leased_export_rows - the leased-read role's only way to read
--             records for an export: the job's own account and the period
--             stored in the job (which no worker login can change), active
--             records only, in (occurred_on, id) order - the history filter's
--             date semantics.
CREATE TABLE exports (
  export_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  lifecycle_generation integer NOT NULL CHECK (lifecycle_generation >= 0),
  from_date date NOT NULL CHECK (from_date >= DATE '1970-01-01'),
  through_date date NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  object_key text UNIQUE,
  bytes bigint CHECK (bytes IS NULL OR bytes > 0),
  sha256 bytea CHECK (sha256 IS NULL OR octet_length(sha256) = 32),
  row_count integer CHECK (row_count IS NULL OR row_count >= 0),
  high_water bigint CHECK (high_water IS NULL OR high_water >= 0),
  ready_at timestamptz,
  expires_at timestamptz,
  CHECK (through_date >= from_date),
  -- The file columns are set together, once.
  CHECK ((ready_at IS NULL) = (object_key IS NULL) AND (ready_at IS NULL) = (bytes IS NULL) AND (ready_at IS NULL) = (sha256 IS NULL)
     AND (ready_at IS NULL) = (row_count IS NULL) AND (ready_at IS NULL) = (high_water IS NULL) AND (ready_at IS NULL) = (expires_at IS NULL)),
  CHECK (expires_at IS NULL OR (expires_at > ready_at AND expires_at <= ready_at + interval '25 hours')),
  -- The key is this export's own private publication.
  CHECK (object_key IS NULL OR starts_with(object_key, 'export/' || account_id::text || '/' || export_id::text || '/'))
);
--> statement-breakpoint
CREATE INDEX exports_account_idx ON exports (account_id, requested_at);
--> statement-breakpoint
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY exports_owner_read ON exports FOR SELECT TO gogospend_app
  USING (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY exports_owner_insert ON exports FOR INSERT TO gogospend_app
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
-- The app writes only the request columns, and never updates or deletes.
GRANT SELECT ON exports TO gogospend_app;
--> statement-breakpoint
GRANT INSERT (export_id, account_id, lifecycle_generation, from_date, through_date) ON exports TO gogospend_app;
--> statement-breakpoint
-- The owner's export job state ('queued' | 'leased' | 'succeeded' | 'failed'
-- | 'cancelled' | ...) and, for a failure the user can act on, its code
-- ('export_too_large'); no row when they have no such export job.
CREATE FUNCTION gogospend_export_job_status(p_export_id uuid) RETURNS TABLE (status text, failure text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT j.status, CASE WHEN j.status = 'failed' AND j.last_error = 'export_too_large' THEN j.last_error END
    FROM public.jobs j
   WHERE j.id = p_export_id AND j.kind = 'export' AND j.account_id = public.gogospend_current_account()
$$;
--> statement-breakpoint
-- How many of the owner's export jobs are queued or running (the per-account cap).
CREATE FUNCTION gogospend_open_export_jobs() RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT count(*)::integer FROM public.jobs j
   WHERE j.kind = 'export' AND j.account_id = public.gogospend_current_account() AND j.status IN ('queued', 'leased')
$$;
--> statement-breakpoint
-- Records for a current `export` lease (gogospend_leased_account validates the
-- job, lease, purpose, lifecycle generation and active account on every
-- call): the job account's active records dated within the job's stored
-- period, after a keyset position, with the names of the wallets and
-- categories they reference. Amounts as exact text. Nothing else - no
-- account, identity, receipt or deleted rows.
CREATE FUNCTION gogospend_leased_export_rows(p_job_id uuid, p_lease_token uuid, p_after_date date, p_after_id uuid, p_limit integer)
  RETURNS TABLE (
    record_id uuid, record_type text, occurred_on text, amount_minor text,
    wallet_id uuid, wallet_name text, category_id uuid, category_builtin_key text, category_label text,
    source_wallet_id uuid, source_wallet_name text, destination_wallet_id uuid, destination_wallet_name text,
    merchant text, note text, record_version integer)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_account uuid := public.gogospend_leased_account(p_job_id, p_lease_token, 'export');
  v_from date;
  v_through date;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'limit must be 1-1000';
  END IF;
  IF (p_after_date IS NULL) <> (p_after_id IS NULL) THEN
    RAISE EXCEPTION 'a key position needs both its date and id';
  END IF;
  SELECT (j.payload ->> 'from')::date, (j.payload ->> 'through')::date INTO v_from, v_through
    FROM public.jobs j WHERE j.id = p_job_id;
  IF v_from IS NULL OR v_through IS NULL OR v_through < v_from THEN
    RAISE EXCEPTION 'an export job needs its period';
  END IF;
  RETURN QUERY
    SELECT t.id, t.type, to_char(t.occurred_on, 'YYYY-MM-DD'), t.amount_minor::text,
           t.wallet_id, w.name, t.category_id, c.builtin_key, c.label,
           t.source_wallet_id, sw.name, t.destination_wallet_id, dw.name,
           t.merchant, t.note, t.version
      FROM public.transactions t
      LEFT JOIN public.wallets w ON w.account_id = t.account_id AND w.id = t.wallet_id
      LEFT JOIN public.categories c ON c.account_id = t.account_id AND c.id = t.category_id
      LEFT JOIN public.wallets sw ON sw.account_id = t.account_id AND sw.id = t.source_wallet_id
      LEFT JOIN public.wallets dw ON dw.account_id = t.account_id AND dw.id = t.destination_wallet_id
     WHERE t.account_id = v_account AND t.deleted_at IS NULL
       AND t.occurred_on BETWEEN v_from AND v_through
       AND (p_after_date IS NULL OR (t.occurred_on, t.id) > (p_after_date, p_after_id))
     ORDER BY t.occurred_on, t.id
     LIMIT p_limit;
END
$$;
--> statement-breakpoint
-- Called by the export worker inside its publish-and-complete transaction,
-- after gogospend_lock_current_job: records the file of a current lease's
-- export job. The object must be one this lease published, with the same
-- size, digest and expiry; the export row must be this account's, at the
-- job's lifecycle generation, and not recorded yet. False otherwise.
CREATE FUNCTION gogospend_record_export(p_job_id uuid, p_lease_token uuid, p_object_key text, p_bytes bigint, p_sha256 text, p_row_count integer, p_high_water bigint, p_expires_at timestamptz)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
BEGIN
  SELECT j.* INTO v_job FROM public.jobs j
   WHERE j.id = p_job_id AND j.kind = 'export' AND j.status = 'leased'
     AND j.lease_token = p_lease_token AND j.lease_expires_at > clock_timestamp();
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = v_job.account_id AND a.status = 'active' AND a.lifecycle_generation = v_job.lifecycle_generation) THEN
    RETURN false;
  END IF;
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' OR p_row_count IS NULL OR p_row_count < 0 OR p_high_water IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.account_sync_state s WHERE s.account_id = v_job.account_id AND p_high_water BETWEEN 0 AND s.revision) THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.object_publications o
        WHERE o.key = p_object_key AND o.job_id = p_job_id AND o.lease_token = p_lease_token AND o.account_id = v_job.account_id
          AND o.purpose = 'export' AND o.status = 'published'
          AND o.bytes = p_bytes AND o.sha256 = decode(p_sha256, 'hex') AND o.delete_after = p_expires_at) THEN
    RETURN false;
  END IF;
  UPDATE public.exports e
     SET object_key = p_object_key, bytes = p_bytes, sha256 = decode(p_sha256, 'hex'), row_count = p_row_count,
         high_water = p_high_water, ready_at = now(), expires_at = p_expires_at
   WHERE e.export_id = p_job_id AND e.account_id = v_job.account_id
     AND e.lifecycle_generation = v_job.lifecycle_generation AND e.object_key IS NULL;
  RETURN FOUND;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_export_job_status(uuid), gogospend_open_export_jobs(), gogospend_leased_export_rows(uuid, uuid, date, uuid, integer),
  gogospend_record_export(uuid, uuid, text, bigint, text, integer, bigint, timestamptz) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_export_job_status(uuid), gogospend_open_export_jobs() TO gogospend_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_leased_export_rows(uuid, uuid, date, uuid, integer) TO gogospend_leased_read;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_record_export(uuid, uuid, text, bigint, text, integer, bigint, timestamptz) TO gogospend_jobs;
