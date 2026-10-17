-- P1: the generic fenced job runtime and private object publication.
--   jobs                 - any identifier kind (security kinds stay visible to
--                          gogospend_security only), a cancelled state, and a
--                          bounded runtime per attempt (heartbeats cannot
--                          extend a lease past it).
--   object_publications  - every object key is registered before its PUT;
--                          only a current lease can publish, and a sweep
--                          deletes anything unpublished after the publisher's
--                          final deadline. A database rollback never undoes a
--                          PUT, so the registry is the source of truth.
--   gogospend_leased_read - a role that reads an account only through
--                          routines validating the job, lease, purpose,
--                          lifecycle generation and active account.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gogospend_leased_read') THEN
    BEGIN
      CREATE ROLE gogospend_leased_read NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    EXCEPTION WHEN duplicate_object OR unique_violation THEN
      NULL;
    END;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'gogospend_leased_read'
       AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolcanlogin)
  ) THEN
    RAISE EXCEPTION 'Role gogospend_leased_read already exists with login or elevated attributes';
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO gogospend_leased_read;
--> statement-breakpoint
ALTER TABLE jobs DROP CONSTRAINT jobs_kind_check;
--> statement-breakpoint
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK (kind ~ '^[a-z][a-z0-9_]{0,63}$');
--> statement-breakpoint
ALTER TABLE jobs DROP CONSTRAINT jobs_status_check;
--> statement-breakpoint
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check CHECK (status IN ('queued', 'leased', 'succeeded', 'superseded', 'failed', 'cancelled'));
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN max_runtime_seconds integer NOT NULL DEFAULT 900 CHECK (max_runtime_seconds BETWEEN 10 AND 86400);
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN attempt_started_at timestamptz;
--> statement-breakpoint
ALTER TABLE jobs ADD CONSTRAINT jobs_attempt_started_check CHECK (status <> 'leased' OR attempt_started_at IS NOT NULL);
--> statement-breakpoint
GRANT UPDATE (attempt_started_at) ON jobs TO gogospend_jobs, gogospend_security;
--> statement-breakpoint
CREATE INDEX jobs_account_open_idx ON jobs (account_id) WHERE status IN ('queued', 'leased');
--> statement-breakpoint
CREATE TABLE object_publications (
  -- <purpose>/<account>/<job>/<lease token>/<name>: a fresh lease token per
  -- attempt, so no attempt can overwrite another's (or a published) object.
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{0,31}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
  job_id uuid NOT NULL,
  account_id uuid NOT NULL,
  lease_token uuid NOT NULL,
  lifecycle_generation integer NOT NULL CHECK (lifecycle_generation >= 0),
  purpose text NOT NULL CHECK (purpose ~ '^[a-z][a-z0-9_]{0,31}$'),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'published', 'deleted')),
  -- reserved: the publisher's final deadline; published: the object's expiry.
  delete_after timestamptz NOT NULL,
  bytes bigint CHECK (bytes IS NULL OR bytes >= 0),
  sha256 bytea CHECK (sha256 IS NULL OR octet_length(sha256) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  deleted_at timestamptz,
  CHECK ((status = 'published') = (published_at IS NOT NULL AND bytes IS NOT NULL AND sha256 IS NOT NULL) OR status = 'deleted'),
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX object_publications_sweep_idx ON object_publications (delete_after) WHERE status IN ('reserved', 'published');
--> statement-breakpoint
CREATE INDEX object_publications_job_idx ON object_publications (job_id, lease_token);
--> statement-breakpoint
CREATE INDEX object_publications_account_idx ON object_publications (account_id) WHERE status <> 'deleted';
--> statement-breakpoint
ALTER TABLE object_publications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY object_publications_worker ON object_publications TO gogospend_jobs USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT ON object_publications TO gogospend_jobs;
--> statement-breakpoint
GRANT UPDATE (status, delete_after, bytes, sha256, published_at, deleted_at) ON object_publications TO gogospend_jobs;
--> statement-breakpoint
-- Called by a publisher inside its completion transaction: takes the account
-- lock (if the job has an account) and then the job row, and says whether
-- this lease may still publish - the lease is current and unexpired, and the
-- account is active at the job's lifecycle generation. Deletion and
-- cancellation take the same account lock, so they serialize with publishing.
CREATE FUNCTION gogospend_lock_current_job(p_job_id uuid, p_lease_token uuid) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_status text;
  v_generation integer;
BEGIN
  SELECT j.* INTO v_job FROM public.jobs j WHERE j.id = p_job_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_job.account_id IS NOT NULL THEN
    PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_job.account_id FOR UPDATE;
  END IF;
  SELECT j.* INTO v_job FROM public.jobs j WHERE j.id = p_job_id FOR UPDATE;
  IF v_job.status <> 'leased' OR v_job.lease_token IS DISTINCT FROM p_lease_token OR v_job.lease_expires_at <= clock_timestamp() THEN
    RETURN false;
  END IF;
  IF v_job.account_id IS NOT NULL THEN
    SELECT a.status, a.lifecycle_generation INTO v_status, v_generation FROM public.accounts a WHERE a.id = v_job.account_id;
    IF NOT FOUND OR v_status <> 'active' OR v_generation <> v_job.lifecycle_generation THEN
      RETURN false;
    END IF;
  END IF;
  RETURN true;
END
$$;
--> statement-breakpoint
-- An app lifecycle transition (in the owner transaction) cancels the
-- account's open jobs under the common account lock. Security cleanup jobs
-- are never cancelled: they must outlive the account.
CREATE FUNCTION gogospend_cancel_account_jobs() RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_count integer;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'cancelling jobs needs an owner transaction';
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  UPDATE public.jobs j
     SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, finished_at = now(), updated_at = now()
   WHERE j.account_id = v_account AND j.status IN ('queued', 'leased') AND j.kind <> ALL (ARRAY['auth0_revoke_grants']);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- The app enqueues work for its own account only, and only the kinds a user
-- may start (a sync snapshot, an export). Idempotent by job id.
CREATE FUNCTION gogospend_enqueue_account_job(p_job_id uuid, p_kind text, p_payload jsonb, p_max_attempts integer, p_max_runtime_seconds integer) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_generation integer;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'enqueueing needs an owner transaction';
  END IF;
  IF p_kind NOT IN ('sync_snapshot', 'export') THEN
    RAISE EXCEPTION 'this job kind cannot be started by the app' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT a.lifecycle_generation INTO v_generation FROM public.accounts a WHERE a.id = v_account AND a.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the account is not active' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO public.jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts, max_runtime_seconds)
  VALUES (p_job_id, p_kind, v_account, v_generation, p_payload, p_max_attempts, p_max_runtime_seconds)
  ON CONFLICT (id) DO NOTHING;
  RETURN FOUND;
END
$$;
--> statement-breakpoint
-- Validates a leased read: the job exists with kind = purpose, the lease is
-- current and unexpired, and the job's account is active at the job's
-- lifecycle generation. Returns the account; otherwise "leased read denied".
CREATE FUNCTION gogospend_leased_account(p_job_id uuid, p_lease_token uuid, p_purpose text) RETURNS uuid
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
BEGIN
  SELECT j.account_id INTO v_account
    FROM public.jobs j
    JOIN public.accounts a ON a.id = j.account_id
   WHERE j.id = p_job_id AND j.kind = p_purpose AND p_purpose IN ('sync_snapshot', 'export')
     AND j.status = 'leased' AND j.lease_token = p_lease_token AND j.lease_expires_at > clock_timestamp()
     AND a.status = 'active' AND a.lifecycle_generation = j.lifecycle_generation;
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'leased read denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_account;
END
$$;
--> statement-breakpoint
CREATE FUNCTION gogospend_leased_read_open(p_job_id uuid, p_lease_token uuid, p_purpose text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$ SELECT public.gogospend_leased_account(p_job_id, p_lease_token, p_purpose) $$;
--> statement-breakpoint
CREATE FUNCTION gogospend_leased_high_water(p_job_id uuid, p_lease_token uuid, p_purpose text) RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT s.revision FROM public.account_sync_state s
   WHERE s.account_id = public.gogospend_leased_account(p_job_id, p_lease_token, p_purpose)
$$;
--> statement-breakpoint
-- Every entity's latest committed state (deleted ones as tombstones), with the
-- snapshot from the change that set it, in (entity, id) order after a key.
CREATE FUNCTION gogospend_leased_entities(p_job_id uuid, p_lease_token uuid, p_purpose text, p_after_entity text, p_after_id uuid, p_limit integer)
  RETURNS TABLE (entity text, entity_id uuid, version integer, state text, snapshot jsonb)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_leased_account(p_job_id, p_lease_token, p_purpose);
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'limit must be 1-1000';
  END IF;
  RETURN QUERY
    SELECT h.entity, h.entity_id, h.version, h.state, c.snapshot
      FROM public.entity_heads h
      JOIN public.entity_changes c
        ON c.account_id = h.account_id AND c.revision = h.revision AND c.entity = h.entity AND c.entity_id = h.entity_id
     WHERE h.account_id = v_account
       AND (p_after_entity IS NULL OR (h.entity, h.entity_id) > (p_after_entity, p_after_id))
     ORDER BY h.entity, h.entity_id
     LIMIT p_limit;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_lock_current_job(uuid, uuid), gogospend_cancel_account_jobs(), gogospend_leased_account(uuid, uuid, text), gogospend_enqueue_account_job(uuid, text, jsonb, integer, integer),
  gogospend_leased_read_open(uuid, uuid, text), gogospend_leased_high_water(uuid, uuid, text), gogospend_leased_entities(uuid, uuid, text, text, uuid, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_lock_current_job(uuid, uuid) TO gogospend_jobs;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_cancel_account_jobs(), gogospend_enqueue_account_job(uuid, text, jsonb, integer, integer) TO gogospend_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_leased_read_open(uuid, uuid, text), gogospend_leased_high_water(uuid, uuid, text), gogospend_leased_entities(uuid, uuid, text, text, uuid, integer) TO gogospend_leased_read;
