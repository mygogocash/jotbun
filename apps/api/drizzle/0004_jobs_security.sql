-- F6a: the one durable PostgreSQL job queue (P1 extends it) and global
-- logout with a provider-cleanup hold.
CREATE TABLE jobs (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('auth0_revoke_grants')),
  -- No foreign key: cleanup jobs must outlive a deleted account.
  account_id uuid,
  lifecycle_generation integer NOT NULL DEFAULT 0 CHECK (lifecycle_generation >= 0),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'leased', 'succeeded', 'superseded', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 20),
  run_after timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text CHECK (last_error ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CHECK ((status = 'leased') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX jobs_runnable_idx ON jobs (kind, run_after) WHERE status IN ('queued', 'leased');
--> statement-breakpoint
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Security kinds belong to gogospend_security alone: a generic worker login
-- (P1's parsers handle untrusted files) can neither see, create nor change
-- them. The security worker's login is a member of both roles.
CREATE POLICY jobs_worker ON jobs TO gogospend_jobs
  USING (kind NOT IN ('auth0_revoke_grants')) WITH CHECK (kind NOT IN ('auth0_revoke_grants'));
--> statement-breakpoint
CREATE POLICY jobs_security ON jobs TO gogospend_security
  USING (kind IN ('auth0_revoke_grants')) WITH CHECK (kind IN ('auth0_revoke_grants'));
--> statement-breakpoint
GRANT SELECT, INSERT ON jobs TO gogospend_jobs;
--> statement-breakpoint
GRANT SELECT ON jobs TO gogospend_security;
--> statement-breakpoint
GRANT UPDATE (status, attempts, run_after, lease_token, lease_expires_at, last_error, updated_at, finished_at) ON jobs TO gogospend_jobs, gogospend_security;
--> statement-breakpoint
-- A revocation hold names the one job that may lift it (written only by
-- gogospend_global_logout), so no other job - older, forged or replayed -
-- can release it, whatever its payload says.
ALTER TABLE blocked_principals ADD COLUMN pending_job_id uuid;
--> statement-breakpoint
ALTER TABLE blocked_principals ADD CONSTRAINT blocked_principals_pending_job_check
  CHECK (pending_job_id IS NULL OR reason = 'revocation_pending');
--> statement-breakpoint
CREATE INDEX blocked_principals_pending_job_idx ON blocked_principals (pending_job_id) WHERE pending_job_id IS NOT NULL;
--> statement-breakpoint
-- Signs the current owner out everywhere. The caller holds a fresh
-- global_logout proof; this takes the common account lock itself so a direct
-- call cannot skip it. Under the lock it:
--   - bumps session_generation (every binding and early-guard request dies);
--   - sets reauth_after to the next whole second (provider auth_time has
--     whole-second resolution), so no login from before or during the logout
--     second counts;
--   - revokes every binding row;
--   - holds new sign-ins for every alias until this call's cleanup job
--     succeeds (an existing deleted/disabled block is kept);
--   - queues the Auth0 refresh-grant revocation job (20 attempts, about 15
--     hours of backoff). The queue holds no provider subjects: the worker
--     reads them, per lease, through gogospend_revocation_subjects.
CREATE FUNCTION gogospend_global_logout(p_job_id uuid) RETURNS TABLE (session_generation integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_generation integer;
  v_lifecycle integer;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'global logout needs an owner transaction';
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  UPDATE public.accounts a
     SET session_generation = a.session_generation + 1,
         reauth_after = date_trunc('second', clock_timestamp()) + interval '1 second'
   WHERE a.id = v_account AND a.status = 'active'
  RETURNING a.session_generation, a.lifecycle_generation INTO v_generation, v_lifecycle;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE public.auth_sessions s SET revoked_at = now() WHERE s.account_id = v_account AND s.revoked_at IS NULL;
  INSERT INTO public.blocked_principals (principal_digest, reason, pending_job_id)
  SELECT public.gogospend_principal_digest(i.issuer, i.subject), 'revocation_pending', p_job_id
    FROM public.account_identities i WHERE i.account_id = v_account
  ON CONFLICT (principal_digest) DO UPDATE
     SET pending_job_id = EXCLUDED.pending_job_id, blocked_until = NULL
   WHERE public.blocked_principals.reason = 'revocation_pending';
  INSERT INTO public.jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts)
  VALUES (p_job_id, 'auth0_revoke_grants', v_account, v_lifecycle, jsonb_build_object(
    'generation', v_generation,
    'client_ids', (SELECT coalesce(jsonb_agg(DISTINCT s.client_id), '[]'::jsonb)
                     FROM public.auth_sessions s WHERE s.account_id = v_account)
  ), 20);
  RETURN QUERY SELECT v_generation;
END
$$;
--> statement-breakpoint
-- The under-lock re-check (assertActiveSession): this binding belongs to the
-- current owner, is unrevoked and unexpired, matches the account's session
-- generation, and its principal is not blocked.
CREATE FUNCTION gogospend_session_is_active(p_session_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.auth_sessions s
      JOIN public.accounts a ON a.id = s.account_id
     WHERE s.id = p_session_id
       AND s.account_id = public.gogospend_current_account()
       AND s.revoked_at IS NULL
       AND now() < s.idle_expires_at
       AND now() < s.absolute_expires_at
       AND a.status = 'active'
       AND a.session_generation = s.session_generation
       AND NOT EXISTS (SELECT 1 FROM public.blocked_principals b
                        WHERE b.principal_digest = s.principal_digest AND (b.blocked_until IS NULL OR b.blocked_until > now())))
$$;
--> statement-breakpoint
-- Signs one device out: revokes the current owner's binding only.
CREATE FUNCTION gogospend_revoke_session(p_session_id uuid) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
BEGIN
  UPDATE public.auth_sessions s SET revoked_at = now()
   WHERE s.id = p_session_id AND s.account_id = public.gogospend_current_account() AND s.revoked_at IS NULL;
  RETURN FOUND;
END
$$;
--> statement-breakpoint
-- Called by the security worker before any provider call. The lease must be
-- current and unexpired:
--   'stale_lease' - this lease no longer holds the job (expired, reclaimed or
--                   finished): do nothing;
--   'superseded'  - no hold names this job any more (deletion or an operator
--                   replaced it): complete without calling Auth0;
--   'current'     - revoke.
CREATE FUNCTION gogospend_revocation_job_is_current(p_job_id uuid, p_lease_token uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT CASE
           WHEN j.id IS NULL THEN 'stale_lease'
           WHEN NOT EXISTS (SELECT 1 FROM public.blocked_principals b
                             WHERE b.pending_job_id = j.id AND b.reason = 'revocation_pending') THEN 'superseded'
           ELSE 'current'
         END
    FROM (SELECT 1) AS one
    LEFT JOIN public.jobs j
      ON j.id = p_job_id AND j.kind = 'auth0_revoke_grants' AND j.status = 'leased'
     AND j.lease_token = p_lease_token AND j.lease_expires_at > clock_timestamp()
$$;
--> statement-breakpoint
-- The Auth0 subjects to revoke for a current lease: aliases of the job's
-- account whose hold names this job. Read per lease, never stored in the queue.
CREATE FUNCTION gogospend_revocation_subjects(p_job_id uuid, p_lease_token uuid) RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT i.subject
    FROM public.jobs j
    JOIN public.account_identities i ON i.account_id = j.account_id
    JOIN public.blocked_principals b ON b.principal_digest = public.gogospend_principal_digest(i.issuer, i.subject)
   WHERE j.id = p_job_id AND j.kind = 'auth0_revoke_grants' AND j.status = 'leased'
     AND j.lease_token = p_lease_token AND j.lease_expires_at > clock_timestamp()
     AND b.reason = 'revocation_pending' AND b.pending_job_id = j.id
   ORDER BY i.subject
$$;
--> statement-breakpoint
-- Called after Auth0 confirmed the revocation. Under the account lock (if the
-- account still exists) and the job row lock, with the lease still held and
-- unexpired: lifts only the holds that name this job and marks it succeeded.
CREATE FUNCTION gogospend_finish_revocation(p_job_id uuid, p_lease_token uuid) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
BEGIN
  SELECT j.* INTO v_job FROM public.jobs j WHERE j.id = p_job_id AND j.kind = 'auth0_revoke_grants';
  IF NOT FOUND THEN
    RETURN 'stale_lease';
  END IF;
  IF v_job.account_id IS NOT NULL THEN
    PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_job.account_id FOR UPDATE;
  END IF;
  SELECT j.* INTO v_job FROM public.jobs j WHERE j.id = p_job_id FOR UPDATE;
  IF v_job.status <> 'leased' OR v_job.lease_token IS DISTINCT FROM p_lease_token OR v_job.lease_expires_at <= clock_timestamp() THEN
    RETURN 'stale_lease';
  END IF;
  DELETE FROM public.blocked_principals b WHERE b.pending_job_id = p_job_id AND b.reason = 'revocation_pending';
  UPDATE public.jobs j
     SET status = 'succeeded', lease_token = NULL, lease_expires_at = NULL, last_error = NULL, finished_at = now(), updated_at = now()
   WHERE j.id = p_job_id;
  RETURN 'done';
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_global_logout(uuid), gogospend_session_is_active(uuid), gogospend_revoke_session(uuid), gogospend_revocation_job_is_current(uuid, uuid), gogospend_revocation_subjects(uuid, uuid), gogospend_finish_revocation(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_global_logout(uuid), gogospend_session_is_active(uuid), gogospend_revoke_session(uuid) TO gogospend_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_revocation_job_is_current(uuid, uuid), gogospend_revocation_subjects(uuid, uuid), gogospend_finish_revocation(uuid, uuid) TO gogospend_security;
