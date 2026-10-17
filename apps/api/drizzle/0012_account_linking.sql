-- F6c: explicit account linking. No new tables: a linked identity is one
-- more account_identities alias of the account, and linking ends every
-- binding through F6a's global logout (hold + refresh-grant revocation).
-- The database decides everything in one transaction; merging the two Auth0
-- users is a follow-up security job (`auth0_link_identities`), so nothing
-- irreversible happens at Auth0 before the database has committed.

-- The merge job is a security kind: only gogospend_security sees, claims or
-- changes it.
DROP POLICY jobs_security ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_security ON jobs TO gogospend_security
  USING (kind IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities'))
  WITH CHECK (kind IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities'));
--> statement-breakpoint
DROP POLICY jobs_worker_read ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_worker_read ON jobs FOR SELECT TO gogospend_jobs
  USING (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities'));
--> statement-breakpoint
DROP POLICY jobs_worker_update ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_worker_update ON jobs FOR UPDATE TO gogospend_jobs
  USING (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities'))
  WITH CHECK (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities'));
--> statement-breakpoint
DROP POLICY jobs_worker_insert ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_worker_insert ON jobs FOR INSERT TO gogospend_jobs
  WITH CHECK (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'sync_snapshot', 'export'));
--> statement-breakpoint
-- The other identity's fresh login: an unconsumed, unexpired `link`
-- challenge issued to this account for the same command, answered by an ID
-- token with this nonce and client, signed in at most 5 minutes ago and not
-- before the challenge, this account's reauth_after, the other identity's own
-- account's reauth_after, or the newest credential change recorded for that
-- identity (F6b) - the same rules a sign-in of that identity would meet.
CREATE FUNCTION gogospend_link_secondary_is_valid(p_account uuid, p_command_id uuid, p_challenge_id uuid, p_issuer text, p_subject text, p_client_id text, p_nonce_digest bytea, p_auth_time timestamptz)
  RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reauth_challenges c
      JOIN public.accounts a ON a.id = c.account_id
     WHERE c.id = p_challenge_id AND c.account_id = p_account AND c.purpose = 'link' AND c.command_id = p_command_id
       AND c.client_id = p_client_id AND c.nonce_digest = p_nonce_digest
       AND c.proven_at IS NULL AND c.consumed_at IS NULL AND c.expires_at > now()
       AND p_auth_time >= c.created_at - interval '30 seconds'
       AND p_auth_time >= now() - interval '5 minutes'
       AND p_auth_time <= now() + interval '1 minute'
       AND p_auth_time >= coalesce(a.reauth_after, '-infinity'::timestamptz))
  AND NOT EXISTS (
    SELECT 1 FROM public.account_identities i JOIN public.accounts o ON o.id = i.account_id
     WHERE i.issuer = p_issuer AND i.subject = p_subject AND p_auth_time < coalesce(o.reauth_after, '-infinity'::timestamptz))
  AND NOT EXISTS (
    SELECT 1 FROM public.auth_event_receipts r
     WHERE r.principal_digest = public.gogospend_principal_digest(p_issuer, p_subject) AND r.outcome <> 'pending'
       AND p_auth_time < date_trunc('second', r.occurred_at) + interval '1 second')
$$;
--> statement-breakpoint
-- An account holds data once any entity other than an untouched built-in
-- category exists for it (opening Add seeds the built-ins; that is not data).
CREATE FUNCTION gogospend_account_is_populated(p_account uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.entity_heads h
      LEFT JOIN public.categories c ON h.entity = 'category' AND c.account_id = h.account_id AND c.id = h.entity_id
     WHERE h.account_id = p_account
       AND NOT (h.entity = 'category' AND h.version = 1 AND h.state = 'active' AND c.builtin_key IS NOT NULL))
$$;
--> statement-breakpoint
-- The link, in the signed-in account's owner transaction (the caller holds
-- the account lock and has re-checked the session and current policy). It:
--   1. consumes the signed-in identity's `link` proof for this command;
--   2. under the other identity's principal lock (the one bootstrap takes)
--      and its challenge row lock, checks and consumes its fresh login;
--   3. makes it an alias of this account: an unknown identity is added; one
--      whose own account is empty has that account folded in (its aliases
--      move here, the empty account is deleted) under that account's lock;
--      one whose account holds data is a 'conflict';
--   4. ends every binding through gogospend_global_logout;
--   5. queues the Auth0 merge (primary <- other identity) as a security job,
--      with principal digests only.
-- A refusal is returned before anything is changed for good: the caller rolls
-- the transaction back. Outcomes: 'linked', 'proof_invalid',
-- 'secondary_invalid', 'unavailable', 'conflict', 'not_an_alias'.
CREATE FUNCTION gogospend_link_identity(p_proof_id uuid, p_command_id uuid, p_primary_issuer text, p_primary_subject text, p_secondary_challenge_id uuid, p_issuer text, p_subject text, p_client_id text, p_nonce_digest bytea, p_auth_time timestamptz, p_cleanup_job_id uuid, p_link_job_id uuid)
  RETURNS TABLE (outcome text, session_generation integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_digest bytea := public.gogospend_principal_digest(p_issuer, p_subject);
  v_other uuid;
  v_status text;
  v_generation integer;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'linking needs an owner transaction';
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.account_identities i
                  WHERE i.issuer = p_primary_issuer AND i.subject = p_primary_subject AND i.account_id = v_account) THEN
    RETURN QUERY SELECT 'not_an_alias'::text, NULL::integer;
    RETURN;
  END IF;
  IF NOT public.gogospend_consume_proof(p_proof_id, 'link', p_command_id) THEN
    RETURN QUERY SELECT 'proof_invalid'::text, NULL::integer;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gogospend.principal:' || encode(v_digest, 'hex'), 0));
  PERFORM 1 FROM public.reauth_challenges c WHERE c.id = p_secondary_challenge_id FOR UPDATE;
  IF NOT public.gogospend_link_secondary_is_valid(v_account, p_command_id, p_secondary_challenge_id, p_issuer, p_subject, p_client_id, p_nonce_digest, p_auth_time) THEN
    RETURN QUERY SELECT 'secondary_invalid'::text, NULL::integer;
    RETURN;
  END IF;
  UPDATE public.reauth_challenges c SET consumed_at = now(), proven_at = now(), auth_time = p_auth_time WHERE c.id = p_secondary_challenge_id;
  IF EXISTS (SELECT 1 FROM public.blocked_principals b
              WHERE b.principal_digest = v_digest AND (b.blocked_until IS NULL OR b.blocked_until > now())) THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::integer;
    RETURN;
  END IF;
  SELECT i.account_id INTO v_other FROM public.account_identities i WHERE i.issuer = p_issuer AND i.subject = p_subject;
  IF v_other IS NULL THEN
    INSERT INTO public.account_identities (issuer, subject, account_id) VALUES (p_issuer, p_subject, v_account);
  ELSIF v_other <> v_account THEN
    PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_other FOR UPDATE;
    SELECT a.status INTO v_status FROM public.accounts a WHERE a.id = v_other;
    IF v_status IS DISTINCT FROM 'active' THEN
      RETURN QUERY SELECT 'unavailable'::text, NULL::integer;
      RETURN;
    END IF;
    IF public.gogospend_account_is_populated(v_other) THEN
      RETURN QUERY SELECT 'conflict'::text, NULL::integer;
      RETURN;
    END IF;
    UPDATE public.account_identities i SET account_id = v_account WHERE i.account_id = v_other;
    DELETE FROM public.accounts a WHERE a.id = v_other;
  END IF;
  SELECT g.session_generation INTO v_generation FROM public.gogospend_global_logout(p_cleanup_job_id) g;
  IF v_generation IS NULL THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::integer;
    RETURN;
  END IF;
  INSERT INTO public.jobs (id, kind, account_id, payload, max_attempts)
  VALUES (p_link_job_id, 'auth0_link_identities', v_account, jsonb_build_object(
    'primary', encode(public.gogospend_principal_digest(p_primary_issuer, p_primary_subject), 'hex'),
    'secondary', encode(v_digest, 'hex')
  ), 20);
  RETURN QUERY SELECT 'linked'::text, v_generation;
END
$$;
--> statement-breakpoint
-- The Auth0 subjects of a current merge lease: both must still be aliases of
-- the job's account (a later unlink or deletion supersedes the job). Read per
-- lease, never stored in the queue.
CREATE FUNCTION gogospend_link_job_subjects(p_job_id uuid, p_lease_token uuid)
  RETURNS TABLE (primary_subject text, secondary_subject text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT p.subject, s.subject
    FROM public.jobs j
    JOIN public.account_identities p ON p.account_id = j.account_id
     AND encode(public.gogospend_principal_digest(p.issuer, p.subject), 'hex') = j.payload ->> 'primary'
    JOIN public.account_identities s ON s.account_id = j.account_id
     AND encode(public.gogospend_principal_digest(s.issuer, s.subject), 'hex') = j.payload ->> 'secondary'
   WHERE j.id = p_job_id AND j.kind = 'auth0_link_identities' AND j.status = 'leased'
     AND j.lease_token = p_lease_token AND j.lease_expires_at > clock_timestamp()
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_link_secondary_is_valid(uuid, uuid, uuid, text, text, text, bytea, timestamptz), gogospend_account_is_populated(uuid), gogospend_link_identity(uuid, uuid, text, text, uuid, text, text, text, bytea, timestamptz, uuid, uuid), gogospend_link_job_subjects(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_link_identity(uuid, uuid, text, text, uuid, text, text, text, bytea, timestamptz, uuid, uuid) TO gogospend_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_link_job_subjects(uuid, uuid) TO gogospend_security;
