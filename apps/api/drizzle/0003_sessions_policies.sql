-- F4: application sessions (bindings), one-use reauthentication challenges,
-- blocked principals, published policy versions and per-account consents.
-- Provider principals are stored only as sha256(issuer || 0x00 || subject).
CREATE FUNCTION gogospend_principal_digest(p_issuer text, p_subject text) RETURNS bytea
  LANGUAGE sql IMMUTABLE STRICT
  SET search_path = pg_catalog
AS $$ SELECT sha256(convert_to(p_issuer, 'UTF8') || '\x00'::bytea || convert_to(p_subject, 'UTF8')) $$;
--> statement-breakpoint
CREATE TABLE policy_versions (
  kind text NOT NULL CHECK (kind IN ('terms', 'privacy')),
  version integer NOT NULL CHECK (version >= 1),
  required boolean NOT NULL,
  published_at timestamptz NOT NULL,
  text_th text NOT NULL CHECK (length(text_th) > 0),
  text_en text NOT NULL CHECK (length(text_en) > 0),
  PRIMARY KEY (kind, version)
);
--> statement-breakpoint
CREATE TABLE consents (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('terms', 'privacy', 'analytics')),
  version integer NOT NULL,
  granted boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  -- Acceptance rows must name a real policy version (analytics rows do not).
  policy_kind text GENERATED ALWAYS AS (CASE WHEN kind <> 'analytics' THEN kind END) STORED,
  policy_version integer GENERATED ALWAYS AS (CASE WHEN kind <> 'analytics' THEN version END) STORED,
  PRIMARY KEY (account_id, kind, version),
  FOREIGN KEY (policy_kind, policy_version) REFERENCES policy_versions (kind, version),
  CHECK ((kind = 'analytics' AND version = 0) OR (kind <> 'analytics' AND version >= 1 AND granted))
);
--> statement-breakpoint
CREATE TABLE blocked_principals (
  principal_digest bytea PRIMARY KEY CHECK (octet_length(principal_digest) = 32),
  reason text NOT NULL CHECK (reason IN ('deleted', 'disabled', 'revocation_pending')),
  blocked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE reauth_challenges (
  id uuid PRIMARY KEY,
  principal_digest bytea NOT NULL CHECK (octet_length(principal_digest) = 32),
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 255),
  account_id uuid REFERENCES accounts (id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('bootstrap', 'export', 'link', 'global_logout', 'deletion')),
  command_id uuid NOT NULL,
  request_id uuid NOT NULL,
  nonce_digest bytea NOT NULL CHECK (octet_length(nonce_digest) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  proven_at timestamptz,
  auth_time timestamptz,
  consumed_at timestamptz,
  CHECK (purpose = 'bootstrap' OR account_id IS NOT NULL),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes'),
  CHECK ((proven_at IS NULL) = (auth_time IS NULL))
);
--> statement-breakpoint
CREATE INDEX reauth_challenges_principal_idx ON reauth_challenges (principal_digest, expires_at);
--> statement-breakpoint
CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  binding_digest bytea NOT NULL UNIQUE CHECK (octet_length(binding_digest) = 32),
  principal_digest bytea NOT NULL CHECK (octet_length(principal_digest) = 32),
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 255),
  session_generation integer NOT NULL CHECK (session_generation >= 0),
  authenticated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  first_used_at timestamptz,
  last_used_at timestamptz,
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (absolute_expires_at <= created_at + interval '30 days'),
  CHECK (idle_expires_at <= absolute_expires_at)
);
--> statement-breakpoint
CREATE INDEX auth_sessions_account_id_idx ON auth_sessions (account_id);
--> statement-breakpoint
ALTER TABLE policy_versions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE blocked_principals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reauth_challenges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Published policy text is public; unpublished (future) versions are not visible.
CREATE POLICY policy_versions_published ON policy_versions FOR SELECT TO gogospend_app
  USING (published_at <= now());
--> statement-breakpoint
CREATE POLICY consents_owner ON consents TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
GRANT SELECT ON policy_versions TO gogospend_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON consents TO gogospend_app;
--> statement-breakpoint
GRANT UPDATE (granted, recorded_at) ON consents TO gogospend_app;
--> statement-breakpoint
-- Issues a one-use, 5-minute challenge bound to the principal, client,
-- purpose and command. Non-bootstrap purposes need an existing active
-- account; a blocked principal gets nothing. At most 10 open per principal.
CREATE FUNCTION gogospend_issue_challenge(p_challenge_id uuid, p_issuer text, p_subject text, p_client_id text, p_purpose text, p_command_id uuid, p_request_id uuid, p_nonce_digest bytea)
  RETURNS TABLE (outcome text, expires_at timestamptz)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_digest bytea := public.gogospend_principal_digest(p_issuer, p_subject);
  v_account uuid;
  v_status text;
  v_open integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('gogospend.principal:' || encode(v_digest, 'hex'), 0));
  IF EXISTS (SELECT 1 FROM public.blocked_principals b
              WHERE b.principal_digest = v_digest AND (b.blocked_until IS NULL OR b.blocked_until > now())) THEN
    RETURN QUERY SELECT 'blocked'::text, NULL::timestamptz;
    RETURN;
  END IF;
  SELECT i.account_id, a.status INTO v_account, v_status
    FROM public.account_identities i JOIN public.accounts a ON a.id = i.account_id
   WHERE i.issuer = p_issuer AND i.subject = p_subject;
  IF (p_purpose <> 'bootstrap' AND v_account IS NULL) OR (v_account IS NOT NULL AND v_status <> 'active') THEN
    RETURN QUERY SELECT 'account_unavailable'::text, NULL::timestamptz;
    RETURN;
  END IF;
  DELETE FROM public.reauth_challenges c WHERE c.principal_digest = v_digest AND c.expires_at < now() - interval '1 day';
  SELECT count(*) INTO v_open FROM public.reauth_challenges c
   WHERE c.principal_digest = v_digest AND c.consumed_at IS NULL AND c.expires_at > now();
  IF v_open >= 10 THEN
    RETURN QUERY SELECT 'too_many'::text, NULL::timestamptz;
    RETURN;
  END IF;
  INSERT INTO public.reauth_challenges (id, principal_digest, client_id, account_id, purpose, command_id, request_id, nonce_digest, expires_at)
  VALUES (p_challenge_id, v_digest, p_client_id, v_account, p_purpose, p_command_id, p_request_id, p_nonce_digest, now() + interval '5 minutes');
  RETURN QUERY SELECT 'issued'::text, now() + interval '5 minutes';
END
$$;
--> statement-breakpoint
-- First sign-in or binding renewal, in one transaction:
--   1. serialize on the principal (before any account exists);
--   2. take an existing account's common lock;
--   3. check and consume the bootstrap challenge (nonce, client, expiry,
--      login after the challenge);
--   4. refuse blocked principals;
--   5. create the account exactly once;
--   6. refuse non-active accounts and logins older than reauth_after;
--   7. issue the session (7-day idle, 30-day absolute).
-- A mismatched nonce does not consume the challenge.
CREATE FUNCTION gogospend_bootstrap(p_issuer text, p_subject text, p_client_id text, p_challenge_id uuid, p_nonce_digest bytea, p_auth_time timestamptz, p_new_account_id uuid, p_session_id uuid, p_binding_digest bytea)
  RETURNS TABLE (outcome text, account_id uuid, session_generation integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_digest bytea := public.gogospend_principal_digest(p_issuer, p_subject);
  v_challenge public.reauth_challenges%ROWTYPE;
  v_account uuid;
  v_outcome text := 'renewed';
  v_status text;
  v_generation integer;
  v_reauth_after timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('gogospend.principal:' || encode(v_digest, 'hex'), 0));
  -- The common account lock comes before the challenge row, the same order
  -- as deletion and authorizePurpose, so racing them cannot deadlock.
  SELECT i.account_id INTO v_account FROM public.account_identities i WHERE i.issuer = p_issuer AND i.subject = p_subject;
  IF v_account IS NOT NULL THEN
    PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
    -- Re-read: the account may have been deleted while this waited.
    SELECT i.account_id INTO v_account FROM public.account_identities i WHERE i.issuer = p_issuer AND i.subject = p_subject;
  END IF;
  SELECT c.* INTO v_challenge FROM public.reauth_challenges c
   WHERE c.id = p_challenge_id AND c.principal_digest = v_digest AND c.client_id = p_client_id AND c.purpose = 'bootstrap'
   FOR UPDATE;
  IF NOT FOUND OR v_challenge.nonce_digest <> p_nonce_digest THEN
    RETURN QUERY SELECT 'challenge_invalid'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF v_challenge.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'challenge_used'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF v_challenge.expires_at <= now() THEN
    RETURN QUERY SELECT 'challenge_invalid'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  UPDATE public.reauth_challenges c SET consumed_at = now() WHERE c.id = p_challenge_id;
  IF p_auth_time < v_challenge.created_at - interval '30 seconds' THEN
    RETURN QUERY SELECT 'reauth_required'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  -- Checked after the account lock, so a hold written under that lock
  -- (global-logout cleanup, deletion) always wins.
  IF EXISTS (SELECT 1 FROM public.blocked_principals b
              WHERE b.principal_digest = v_digest AND (b.blocked_until IS NULL OR b.blocked_until > now())) THEN
    RETURN QUERY SELECT 'blocked'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF v_account IS NULL THEN
    INSERT INTO public.accounts (id) VALUES (p_new_account_id);
    INSERT INTO public.account_sync_state (account_id) VALUES (p_new_account_id);
    INSERT INTO public.account_identities (issuer, subject, account_id) VALUES (p_issuer, p_subject, p_new_account_id);
    v_account := p_new_account_id;
    v_outcome := 'created';
  END IF;
  -- Fresh read under the lock (see lockAccount).
  SELECT a.status, a.session_generation, a.reauth_after INTO v_status, v_generation, v_reauth_after
    FROM public.accounts a WHERE a.id = v_account;
  IF v_status <> 'active' THEN
    RETURN QUERY SELECT 'account_unavailable'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  IF v_reauth_after IS NOT NULL AND p_auth_time < v_reauth_after THEN
    RETURN QUERY SELECT 'reauth_required'::text, NULL::uuid, NULL::integer;
    RETURN;
  END IF;
  INSERT INTO public.auth_sessions (id, account_id, binding_digest, principal_digest, client_id, session_generation, authenticated_at, idle_expires_at, absolute_expires_at)
  VALUES (p_session_id, v_account, p_binding_digest, v_digest, p_client_id, v_generation, p_auth_time, now() + interval '7 days', now() + interval '30 days');
  RETURN QUERY SELECT v_outcome, v_account, v_generation;
END
$$;
--> statement-breakpoint
-- Completes a non-bootstrap challenge (export, link, global logout,
-- deletion). The proof stays fresh for 5 minutes after the login and is
-- consumed by its command (authorizePurpose).
CREATE FUNCTION gogospend_prove_challenge(p_issuer text, p_subject text, p_client_id text, p_challenge_id uuid, p_nonce_digest bytea, p_auth_time timestamptz)
  RETURNS TABLE (outcome text, expires_at timestamptz)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_digest bytea := public.gogospend_principal_digest(p_issuer, p_subject);
  v_challenge public.reauth_challenges%ROWTYPE;
  v_status text;
BEGIN
  SELECT c.* INTO v_challenge FROM public.reauth_challenges c
   WHERE c.id = p_challenge_id AND c.principal_digest = v_digest AND c.client_id = p_client_id AND c.purpose <> 'bootstrap'
   FOR UPDATE;
  IF NOT FOUND OR v_challenge.nonce_digest <> p_nonce_digest THEN
    RETURN QUERY SELECT 'challenge_invalid'::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF v_challenge.consumed_at IS NOT NULL OR v_challenge.proven_at IS NOT NULL THEN
    RETURN QUERY SELECT 'challenge_used'::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF v_challenge.expires_at <= now() THEN
    RETURN QUERY SELECT 'challenge_invalid'::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF p_auth_time < v_challenge.created_at - interval '30 seconds' THEN
    UPDATE public.reauth_challenges c SET consumed_at = now() WHERE c.id = p_challenge_id;
    RETURN QUERY SELECT 'reauth_required'::text, NULL::timestamptz;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.blocked_principals b
              WHERE b.principal_digest = v_digest AND (b.blocked_until IS NULL OR b.blocked_until > now())) THEN
    RETURN QUERY SELECT 'blocked'::text, NULL::timestamptz;
    RETURN;
  END IF;
  SELECT a.status INTO v_status FROM public.accounts a WHERE a.id = v_challenge.account_id;
  IF v_status IS DISTINCT FROM 'active' THEN
    RETURN QUERY SELECT 'account_unavailable'::text, NULL::timestamptz;
    RETURN;
  END IF;
  UPDATE public.reauth_challenges c SET proven_at = now(), auth_time = p_auth_time WHERE c.id = p_challenge_id;
  RETURN QUERY SELECT 'proven'::text, p_auth_time + interval '5 minutes';
END
$$;
--> statement-breakpoint
-- Resolves an application binding for a verified principal on every private
-- request. Valid only if the binding:
--   - belongs to this principal and client, and is not revoked;
--   - is within its idle (7-day) and absolute (30-day) limits;
--   - was first used within 5 minutes of issue, so a binding whose bootstrap
--     response was lost dies unused;
--   - belongs to an active account whose session generation is unchanged
--     (global logout);
--   - belongs to a principal that is not blocked.
-- The idle window slides at most once a minute.
CREATE FUNCTION gogospend_resolve_session(p_binding_digest bytea, p_issuer text, p_subject text, p_client_id text)
  RETURNS TABLE (session_id uuid, account_id uuid, session_generation integer)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_digest bytea := public.gogospend_principal_digest(p_issuer, p_subject);
  v_session public.auth_sessions%ROWTYPE;
BEGIN
  SELECT s.* INTO v_session FROM public.auth_sessions s
    JOIN public.accounts a ON a.id = s.account_id
   WHERE s.binding_digest = p_binding_digest
     AND s.principal_digest = v_digest
     AND s.client_id = p_client_id
     AND s.revoked_at IS NULL
     AND now() < s.idle_expires_at
     AND now() < s.absolute_expires_at
     AND (s.first_used_at IS NOT NULL OR now() < s.created_at + interval '5 minutes')
     AND a.status = 'active'
     AND a.session_generation = s.session_generation
     AND NOT EXISTS (SELECT 1 FROM public.blocked_principals b
                      WHERE b.principal_digest = v_digest AND (b.blocked_until IS NULL OR b.blocked_until > now()));
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_session.first_used_at IS NULL OR v_session.last_used_at < now() - interval '1 minute' THEN
    UPDATE public.auth_sessions s
       SET first_used_at = coalesce(s.first_used_at, now()),
           last_used_at = now(),
           idle_expires_at = least(now() + interval '7 days', s.absolute_expires_at)
     WHERE s.id = v_session.id;
  END IF;
  RETURN QUERY SELECT v_session.id, v_session.account_id, v_session.session_generation;
END
$$;
--> statement-breakpoint
-- Read-only pre-check before the Auth0 profile lookup: 'open', 'used' or
-- 'invalid' for this principal, client, nonce and purpose class. Keeps
-- invented challenge ids from spending the Management API quota; the
-- routines that consume the challenge re-check everything under lock.
CREATE FUNCTION gogospend_check_challenge(p_issuer text, p_subject text, p_client_id text, p_challenge_id uuid, p_nonce_digest bytea, p_purpose text)
  RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT CASE
           WHEN c.id IS NULL THEN 'invalid'
           WHEN c.consumed_at IS NOT NULL OR c.proven_at IS NOT NULL THEN 'used'
           WHEN c.expires_at <= now() THEN 'invalid'
           ELSE 'open'
         END
    FROM (SELECT 1) AS one
    LEFT JOIN public.reauth_challenges c
      ON c.id = p_challenge_id
     AND c.principal_digest = public.gogospend_principal_digest(p_issuer, p_subject)
     AND c.client_id = p_client_id
     AND c.nonce_digest = p_nonce_digest
     AND (c.purpose = 'bootstrap') = (p_purpose = 'bootstrap')
$$;
--> statement-breakpoint
-- Consumes a fresh proof for the owner transaction's account, purpose and
-- command (authorizePurpose). Callers hold the account lock. The app role
-- has no direct access to challenge rows.
CREATE FUNCTION gogospend_consume_proof(p_proof_id uuid, p_purpose text, p_command_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
BEGIN
  IF v_account IS NULL OR p_purpose = 'bootstrap' THEN
    RETURN false;
  END IF;
  UPDATE public.reauth_challenges c
     SET consumed_at = now()
   WHERE c.id = p_proof_id AND c.purpose = p_purpose AND c.command_id = p_command_id
     AND c.account_id = v_account
     AND c.proven_at IS NOT NULL AND c.consumed_at IS NULL
     AND c.auth_time >= now() - interval '5 minutes'
     AND c.auth_time >= coalesce((SELECT a.reauth_after FROM public.accounts a WHERE a.id = v_account), '-infinity');
  RETURN FOUND;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_issue_challenge(uuid, text, text, text, text, uuid, uuid, bytea), gogospend_bootstrap(text, text, text, uuid, bytea, timestamptz, uuid, uuid, bytea), gogospend_prove_challenge(text, text, text, uuid, bytea, timestamptz), gogospend_resolve_session(bytea, text, text, text), gogospend_principal_digest(text, text), gogospend_check_challenge(text, text, text, uuid, bytea, text), gogospend_consume_proof(uuid, text, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_issue_challenge(uuid, text, text, text, text, uuid, uuid, bytea), gogospend_bootstrap(text, text, text, uuid, bytea, timestamptz, uuid, uuid, bytea), gogospend_prove_challenge(text, text, text, uuid, bytea, timestamptz), gogospend_check_challenge(text, text, text, uuid, bytea, text) TO gogospend_bootstrap;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_resolve_session(bytea, text, text, text), gogospend_consume_proof(uuid, text, uuid) TO gogospend_app;
