-- F6c: explicit account linking. No new tables: a linked identity is one
-- more account_identities alias of the account, and linking ends every
-- binding through F6a's global logout (hold + refresh-grant revocation).
-- Both routines run in the signed-in account's owner transaction.

-- The other identity's fresh login: an unconsumed, unexpired `link`
-- challenge issued to this account for the same command, answered by an ID
-- token with this nonce and client, signed in at most 5 minutes ago (and not
-- before the challenge or the account's reauth_after).
CREATE FUNCTION gogospend_link_secondary_is_valid(p_account uuid, p_command_id uuid, p_challenge_id uuid, p_client_id text, p_nonce_digest bytea, p_auth_time timestamptz)
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
$$;
--> statement-breakpoint
-- An account holds data once any command committed for it.
CREATE FUNCTION gogospend_account_is_populated(p_account uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT EXISTS (SELECT 1 FROM public.entity_heads h WHERE h.account_id = p_account)
      OR EXISTS (SELECT 1 FROM public.command_receipts r WHERE r.account_id = p_account)
$$;
--> statement-breakpoint
-- Read-only, before Auth0 is asked to link: 'linkable', 'already_linked',
-- 'conflict' (the other identity's account holds data), 'unavailable' (held,
-- disabled or being deleted), 'proof_invalid' or 'secondary_invalid'.
CREATE FUNCTION gogospend_link_precheck(p_proof_id uuid, p_command_id uuid, p_secondary_challenge_id uuid, p_issuer text, p_subject text, p_client_id text, p_nonce_digest bytea, p_auth_time timestamptz) RETURNS text
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_other uuid;
  v_status text;
BEGIN
  IF v_account IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.reauth_challenges c JOIN public.accounts a ON a.id = c.account_id
     WHERE c.id = p_proof_id AND c.purpose = 'link' AND c.command_id = p_command_id AND c.account_id = v_account
       AND c.proven_at IS NOT NULL AND c.consumed_at IS NULL
       AND c.auth_time >= now() - interval '5 minutes'
       AND c.auth_time >= coalesce(a.reauth_after, '-infinity'::timestamptz)) THEN
    RETURN 'proof_invalid';
  END IF;
  IF NOT public.gogospend_link_secondary_is_valid(v_account, p_command_id, p_secondary_challenge_id, p_client_id, p_nonce_digest, p_auth_time) THEN
    RETURN 'secondary_invalid';
  END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_principals b
              WHERE b.principal_digest = public.gogospend_principal_digest(p_issuer, p_subject) AND (b.blocked_until IS NULL OR b.blocked_until > now())) THEN
    RETURN 'unavailable';
  END IF;
  SELECT i.account_id INTO v_other FROM public.account_identities i WHERE i.issuer = p_issuer AND i.subject = p_subject;
  IF v_other IS NULL THEN
    RETURN 'linkable';
  END IF;
  IF v_other = v_account THEN
    RETURN 'already_linked';
  END IF;
  SELECT a.status INTO v_status FROM public.accounts a WHERE a.id = v_other;
  IF v_status IS DISTINCT FROM 'active' THEN
    RETURN 'unavailable';
  END IF;
  IF public.gogospend_account_is_populated(v_other) THEN
    RETURN 'conflict';
  END IF;
  RETURN 'linkable';
END
$$;
--> statement-breakpoint
-- The link itself. The caller holds the account lock and has consumed the
-- signed-in identity's `link` proof (authorizePurpose) in this transaction.
-- Under the other identity's principal lock (the one bootstrap takes, so its
-- first sign-in cannot race this) it consumes the other identity's challenge,
-- then makes it an alias of this account: an unknown identity is added; one
-- whose own account is empty has that account folded in (its aliases move
-- here, the empty account is deleted); one whose account holds data is a
-- 'conflict'. Finally every binding ends through gogospend_global_logout.
-- Any refusal is returned before anything is changed for good: the caller
-- rolls the transaction back.
CREATE FUNCTION gogospend_link_identity(p_command_id uuid, p_secondary_challenge_id uuid, p_issuer text, p_subject text, p_client_id text, p_nonce_digest bytea, p_auth_time timestamptz, p_job_id uuid)
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
  PERFORM pg_advisory_xact_lock(hashtextextended('gogospend.principal:' || encode(v_digest, 'hex'), 0));
  PERFORM 1 FROM public.reauth_challenges c WHERE c.id = p_secondary_challenge_id FOR UPDATE;
  IF NOT public.gogospend_link_secondary_is_valid(v_account, p_command_id, p_secondary_challenge_id, p_client_id, p_nonce_digest, p_auth_time) THEN
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
  SELECT g.session_generation INTO v_generation FROM public.gogospend_global_logout(p_job_id) g;
  IF v_generation IS NULL THEN
    RETURN QUERY SELECT 'unavailable'::text, NULL::integer;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'linked'::text, v_generation;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_link_secondary_is_valid(uuid, uuid, uuid, text, bytea, timestamptz), gogospend_account_is_populated(uuid), gogospend_link_precheck(uuid, uuid, uuid, text, text, text, bytea, timestamptz), gogospend_link_identity(uuid, uuid, text, text, text, bytea, timestamptz, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_link_precheck(uuid, uuid, uuid, text, text, text, bytea, timestamptz), gogospend_link_identity(uuid, uuid, text, text, text, bytea, timestamptz, uuid) TO gogospend_app;
