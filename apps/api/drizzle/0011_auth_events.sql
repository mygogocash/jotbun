-- F6b: verified provider security events and their reconciliation.
--   accounts.credentials_changed_at - the newest provider credential change
--                          applied to the account (password change or block);
--                          an older event is superseded, never re-applied.
--   auth_event_receipts  - one row per verified event id (or reconciled
--                          change): deduplication and the reconciliation
--                          trail. Principals are stored as digests only.
--   security_reconcile_checks - when each principal was last checked against
--                          Auth0 by a reconciliation pass.
-- A change ends every live session signed in before it, raises reauth_after
-- past it, and - when it ended any session - holds the principals and queues
-- F6a's refresh-grant revocation job, exactly like global logout.
ALTER TABLE accounts ADD COLUMN credentials_changed_at timestamptz;
--> statement-breakpoint
CREATE TABLE auth_event_receipts (
  event_id text PRIMARY KEY CHECK (event_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
  source text NOT NULL CHECK (source IN ('event', 'reconcile')),
  type text NOT NULL CHECK (type IN ('password_changed', 'user_blocked')),
  principal_digest bytea NOT NULL CHECK (octet_length(principal_digest) = 32),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN ('pending', 'applied', 'superseded', 'no_account')),
  account_id uuid REFERENCES accounts (id) ON DELETE SET NULL,
  job_id uuid
);
--> statement-breakpoint
CREATE INDEX auth_event_receipts_received_idx ON auth_event_receipts (received_at);
--> statement-breakpoint
CREATE TABLE security_reconcile_checks (
  principal_digest bytea PRIMARY KEY CHECK (octet_length(principal_digest) = 32),
  checked_at timestamptz NOT NULL
);
--> statement-breakpoint
-- Routines only: no role reads or writes these tables directly.
ALTER TABLE auth_event_receipts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE security_reconcile_checks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The reconciliation pass is a security kind: only gogospend_security sees,
-- claims or changes it (a generic jobs login neither sees nor creates it).
DROP POLICY jobs_security ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_security ON jobs TO gogospend_security
  USING (kind IN ('auth0_revoke_grants', 'auth0_security_reconcile')) WITH CHECK (kind IN ('auth0_revoke_grants', 'auth0_security_reconcile'));
--> statement-breakpoint
DROP POLICY jobs_worker_read ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_worker_read ON jobs FOR SELECT TO gogospend_jobs
  USING (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile'));
--> statement-breakpoint
DROP POLICY jobs_worker_update ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_worker_update ON jobs FOR UPDATE TO gogospend_jobs
  USING (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile')) WITH CHECK (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile'));
--> statement-breakpoint
DROP POLICY jobs_worker_insert ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_worker_insert ON jobs FOR INSERT TO gogospend_jobs
  WITH CHECK (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'sync_snapshot', 'export'));
--> statement-breakpoint
-- The one place a credential change takes effect (not granted to any role;
-- called by the event and reconciliation routines). Records the receipt
-- first, so a concurrent delivery of the same id waits on it and then sees a
-- duplicate. Returns 'applied', 'superseded', 'no_account', 'duplicate' or
-- 'conflict' (the id was used for different content; nothing changes).
CREATE FUNCTION gogospend_apply_credential_change(p_event_id text, p_source text, p_type text, p_issuer text, p_subject text, p_occurred_at timestamptz, p_job_id uuid)
  RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_digest bytea := public.gogospend_principal_digest(p_issuer, p_subject);
  v_existing public.auth_event_receipts%ROWTYPE;
  v_account uuid;
  v_status text;
  v_changed timestamptz;
  v_generation integer;
  v_lifecycle integer;
  v_cutoff timestamptz;
  v_revoked integer;
BEGIN
  IF p_occurred_at IS NULL OR p_occurred_at > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'a credential change cannot be in the future' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.auth_event_receipts (event_id, source, type, principal_digest, occurred_at, outcome)
  VALUES (p_event_id, p_source, p_type, v_digest, p_occurred_at, 'pending')
  ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN
    SELECT r.* INTO v_existing FROM public.auth_event_receipts r WHERE r.event_id = p_event_id;
    IF v_existing.source = p_source AND v_existing.type = p_type AND v_existing.principal_digest = v_digest AND v_existing.occurred_at = p_occurred_at THEN
      RETURN 'duplicate';
    END IF;
    RETURN 'conflict';
  END IF;

  SELECT i.account_id INTO v_account FROM public.account_identities i WHERE i.issuer = p_issuer AND i.subject = p_subject;
  IF v_account IS NULL THEN
    UPDATE public.auth_event_receipts r SET outcome = 'no_account' WHERE r.event_id = p_event_id;
    RETURN 'no_account';
  END IF;
  -- The common account lock, then a fresh read (see lockAccount).
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  SELECT a.status, a.credentials_changed_at, a.session_generation, a.lifecycle_generation
    INTO v_status, v_changed, v_generation, v_lifecycle
    FROM public.accounts a WHERE a.id = v_account;
  IF NOT FOUND OR v_status <> 'active' OR (v_changed IS NOT NULL AND p_occurred_at <= v_changed) THEN
    UPDATE public.auth_event_receipts r SET outcome = 'superseded', account_id = CASE WHEN v_status IS NULL THEN NULL ELSE v_account END WHERE r.event_id = p_event_id;
    RETURN 'superseded';
  END IF;

  -- Provider auth_time has whole-second resolution: no login from the change's second counts.
  v_cutoff := date_trunc('second', p_occurred_at) + interval '1 second';
  UPDATE public.accounts a
     SET credentials_changed_at = p_occurred_at,
         reauth_after = greatest(coalesce(a.reauth_after, '-infinity'::timestamptz), v_cutoff)
   WHERE a.id = v_account;
  UPDATE public.auth_sessions s SET revoked_at = now()
   WHERE s.account_id = v_account AND s.revoked_at IS NULL AND s.authenticated_at < v_cutoff
     AND now() < s.idle_expires_at AND now() < s.absolute_expires_at;
  GET DIAGNOSTICS v_revoked = ROW_COUNT;
  IF v_revoked = 0 THEN
    -- Nothing signed in with the old credentials is live here: without a
    -- binding, an old refresh grant cannot bind again (reauth_after).
    UPDATE public.auth_event_receipts r SET outcome = 'applied', account_id = v_account WHERE r.event_id = p_event_id;
    RETURN 'applied';
  END IF;
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
  UPDATE public.auth_event_receipts r SET outcome = 'applied', account_id = v_account, job_id = p_job_id WHERE r.event_id = p_event_id;
  RETURN 'applied';
END
$$;
--> statement-breakpoint
-- A verified provider event (the API checked its signature, source and time).
CREATE FUNCTION gogospend_record_security_event(p_event_id text, p_type text, p_issuer text, p_subject text, p_occurred_at timestamptz, p_job_id uuid) RETURNS text
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT public.gogospend_apply_credential_change(p_event_id, 'event', p_type, p_issuer, p_subject, p_occurred_at, p_job_id)
$$;
--> statement-breakpoint
-- Queues one reconciliation pass unless one is open or was queued within
-- p_every_seconds. Serialized, so two workers cannot both queue one.
CREATE FUNCTION gogospend_schedule_security_reconcile(p_job_id uuid, p_every_seconds integer) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
BEGIN
  IF p_every_seconds IS NULL OR p_every_seconds < 0 OR p_every_seconds > 86400 THEN
    RAISE EXCEPTION 'reconcile interval out of range' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gogospend.security_reconcile', 0));
  IF EXISTS (SELECT 1 FROM public.jobs j
              WHERE j.kind = 'auth0_security_reconcile'
                AND (j.status IN ('queued', 'leased') OR j.created_at > clock_timestamp() - make_interval(secs => p_every_seconds))) THEN
    RETURN false;
  END IF;
  INSERT INTO public.jobs (id, kind, account_id, payload, max_attempts, max_runtime_seconds)
  VALUES (p_job_id, 'auth0_security_reconcile', NULL, '{}'::jsonb, 5, 600);
  RETURN true;
END
$$;
--> statement-breakpoint
-- The current, unexpired lease of a reconciliation pass.
CREATE FUNCTION gogospend_reconcile_lease_is_current(p_job_id uuid, p_lease_token uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM public.jobs j
                  WHERE j.id = p_job_id AND j.kind = 'auth0_security_reconcile' AND j.status = 'leased'
                    AND j.lease_token = p_lease_token AND j.lease_expires_at > clock_timestamp())
$$;
--> statement-breakpoint
-- The least recently checked principals of active accounts that still have
-- a live session (nothing to protect otherwise), for a current lease only.
CREATE FUNCTION gogospend_reconcile_candidates(p_job_id uuid, p_lease_token uuid, p_limit integer)
  RETURNS TABLE (issuer text, subject text, credentials_changed_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT i.issuer, i.subject, a.credentials_changed_at
    FROM public.account_identities i
    JOIN public.accounts a ON a.id = i.account_id
    LEFT JOIN public.security_reconcile_checks c ON c.principal_digest = public.gogospend_principal_digest(i.issuer, i.subject)
   WHERE public.gogospend_reconcile_lease_is_current(p_job_id, p_lease_token)
     AND a.status = 'active'
     AND EXISTS (SELECT 1 FROM public.auth_sessions s
                  WHERE s.account_id = a.id AND s.revoked_at IS NULL
                    AND now() < s.idle_expires_at AND now() < s.absolute_expires_at)
   ORDER BY c.checked_at NULLS FIRST, i.issuer, i.subject
   LIMIT least(greatest(p_limit, 1), 1000)
$$;
--> statement-breakpoint
-- Marks the principal checked and applies the last password change Auth0
-- reports (null: none). The receipt id is derived from the principal and the
-- change time, so a change found again is a duplicate. Returns 'checked',
-- 'applied', 'superseded', 'duplicate', 'no_account' or 'stale_lease'.
CREATE FUNCTION gogospend_reconcile_identity(p_job_id uuid, p_lease_token uuid, p_issuer text, p_subject text, p_changed_at timestamptz, p_new_job_id uuid) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_digest bytea := public.gogospend_principal_digest(p_issuer, p_subject);
BEGIN
  IF NOT public.gogospend_reconcile_lease_is_current(p_job_id, p_lease_token) THEN
    RETURN 'stale_lease';
  END IF;
  INSERT INTO public.security_reconcile_checks (principal_digest, checked_at) VALUES (v_digest, clock_timestamp())
  ON CONFLICT (principal_digest) DO UPDATE SET checked_at = EXCLUDED.checked_at;
  IF p_changed_at IS NULL THEN
    RETURN 'checked';
  END IF;
  RETURN public.gogospend_apply_credential_change(
    'reconcile:' || encode(v_digest, 'hex') || ':' || floor(extract(epoch FROM p_changed_at) * 1000)::bigint::text,
    'reconcile', 'password_changed', p_issuer, p_subject, p_changed_at, p_new_job_id);
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_apply_credential_change(text, text, text, text, text, timestamptz, uuid), gogospend_record_security_event(text, text, text, text, timestamptz, uuid), gogospend_schedule_security_reconcile(uuid, integer), gogospend_reconcile_lease_is_current(uuid, uuid), gogospend_reconcile_candidates(uuid, uuid, integer), gogospend_reconcile_identity(uuid, uuid, text, text, timestamptz, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_record_security_event(text, text, text, text, timestamptz, uuid) TO gogospend_bootstrap;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_schedule_security_reconcile(uuid, integer), gogospend_reconcile_candidates(uuid, uuid, integer), gogospend_reconcile_identity(uuid, uuid, text, text, timestamptz, uuid) TO gogospend_security;
