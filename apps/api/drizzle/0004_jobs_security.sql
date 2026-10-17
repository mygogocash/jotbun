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
CREATE POLICY jobs_worker ON jobs TO gogospend_jobs USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT ON jobs TO gogospend_jobs;
--> statement-breakpoint
GRANT UPDATE (status, attempts, run_after, lease_token, lease_expires_at, last_error, updated_at, finished_at) ON jobs TO gogospend_jobs;
--> statement-breakpoint
-- A revocation hold names the session generation whose provider cleanup it
-- waits for, so an older job cannot lift a newer logout's hold.
ALTER TABLE blocked_principals ADD COLUMN pending_generation integer;
--> statement-breakpoint
ALTER TABLE blocked_principals ADD CONSTRAINT blocked_principals_pending_generation_check
  CHECK (pending_generation IS NULL OR reason = 'revocation_pending');
--> statement-breakpoint
-- Signs the current owner out everywhere. The caller holds a fresh
-- global_logout proof; this takes the common account lock itself so a direct
-- call cannot skip it. Under the lock it:
--   - bumps session_generation (every binding and early-guard request dies);
--   - sets reauth_after, so only logins after this second count. Provider
--     auth_time has whole-second resolution, hence the truncation;
--   - revokes every binding row;
--   - holds new sign-ins for every alias until the cleanup job for this
--     generation succeeds (an existing deleted/disabled block is kept);
--   - queues the Auth0 refresh-grant revocation job.
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
         reauth_after = date_trunc('second', now())
   WHERE a.id = v_account AND a.status = 'active'
  RETURNING a.session_generation, a.lifecycle_generation INTO v_generation, v_lifecycle;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE public.auth_sessions s SET revoked_at = now() WHERE s.account_id = v_account AND s.revoked_at IS NULL;
  INSERT INTO public.blocked_principals (principal_digest, reason, pending_generation)
  SELECT public.gogospend_principal_digest(i.issuer, i.subject), 'revocation_pending', v_generation
    FROM public.account_identities i WHERE i.account_id = v_account
  ON CONFLICT (principal_digest) DO UPDATE
     SET pending_generation = EXCLUDED.pending_generation, blocked_until = NULL
   WHERE public.blocked_principals.reason = 'revocation_pending';
  INSERT INTO public.jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts)
  VALUES (p_job_id, 'auth0_revoke_grants', v_account, v_lifecycle, jsonb_build_object(
    'generation', v_generation,
    'principals', (SELECT jsonb_agg(jsonb_build_object('issuer', i.issuer, 'subject', i.subject) ORDER BY i.issuer, i.subject)
                     FROM public.account_identities i WHERE i.account_id = v_account),
    'client_ids', (SELECT coalesce(jsonb_agg(DISTINCT s.client_id), '[]'::jsonb)
                     FROM public.auth_sessions s WHERE s.account_id = v_account)
  ), 8);
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
-- Called by the security worker before any provider call:
--   'stale_lease' - this lease no longer holds the job (expired and reclaimed,
--                   or already finished): do nothing;
--   'superseded'  - no alias still waits on this job's generation (a newer
--                   logout took over, or deletion replaced the hold): skip
--                   the provider call;
--   'current'     - revoke.
CREATE FUNCTION gogospend_revocation_job_is_current(p_job_id uuid, p_lease_token uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT CASE
           WHEN j.id IS NULL THEN 'stale_lease'
           WHEN NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(j.payload -> 'principals') p
               JOIN public.blocked_principals b ON b.principal_digest = public.gogospend_principal_digest(p ->> 'issuer', p ->> 'subject')
              WHERE b.reason = 'revocation_pending' AND b.pending_generation = (j.payload ->> 'generation')::integer) THEN 'superseded'
           ELSE 'current'
         END
    FROM (SELECT 1) AS one
    LEFT JOIN public.jobs j
      ON j.id = p_job_id AND j.kind = 'auth0_revoke_grants' AND j.status = 'leased' AND j.lease_token = p_lease_token
$$;
--> statement-breakpoint
-- Called after Auth0 confirmed the revocation. Under the account lock (if the
-- account still exists) and the job row lock, with the lease still held:
-- lifts the holds for this job's generation only, so an older job can never
-- release a newer logout's hold, and marks the job succeeded.
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
  IF v_job.status <> 'leased' OR v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN 'stale_lease';
  END IF;
  DELETE FROM public.blocked_principals b
   USING jsonb_array_elements(v_job.payload -> 'principals') p
   WHERE b.principal_digest = public.gogospend_principal_digest(p ->> 'issuer', p ->> 'subject')
     AND b.reason = 'revocation_pending'
     AND b.pending_generation = (v_job.payload ->> 'generation')::integer;
  UPDATE public.jobs j
     SET status = 'succeeded', lease_token = NULL, lease_expires_at = NULL, last_error = NULL, finished_at = now(), updated_at = now()
   WHERE j.id = p_job_id;
  RETURN 'done';
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_global_logout(uuid), gogospend_session_is_active(uuid), gogospend_revoke_session(uuid), gogospend_revocation_job_is_current(uuid, uuid), gogospend_finish_revocation(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_global_logout(uuid), gogospend_session_is_active(uuid), gogospend_revoke_session(uuid) TO gogospend_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_revocation_job_is_current(uuid, uuid), gogospend_finish_revocation(uuid, uuid) TO gogospend_security;
