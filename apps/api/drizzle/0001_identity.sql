-- F2: internal accounts, provider identity aliases and the per-account lock row,
-- with role isolation and row-level security. Later tasks add their own tables.
--
-- Group roles are cluster-wide NOLOGIN roles; each environment grants them to
-- its own login users. Another database in the same cluster may create them
-- concurrently, so a duplicate is tolerated; an existing role with login or
-- elevated attributes is refused rather than altered.
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['gogospend_app', 'gogospend_bootstrap', 'gogospend_jobs', 'gogospend_security'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      BEGIN
        EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', role_name);
      EXCEPTION WHEN duplicate_object OR unique_violation THEN
        NULL;
      END;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_roles
       WHERE rolname = role_name
         AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolcanlogin)
    ) THEN
      RAISE EXCEPTION 'Role % already exists with login or elevated attributes', role_name;
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
REVOKE ALL ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
-- No temporary tables: one could shadow a real table for later transactions
-- on the same pooled connection.
DO $$ BEGIN EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()); END $$;
--> statement-breakpoint
-- Functions created by the migration role are not executable by PUBLIC unless
-- a migration grants them explicitly.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO gogospend_app, gogospend_bootstrap, gogospend_jobs, gogospend_security;
--> statement-breakpoint
-- The owner of the current transaction, set only by DatabaseService with
-- set_config('gogospend.account_id', <uuid>, true). Unset means no owner, so
-- every owner policy below matches nothing.
CREATE FUNCTION gogospend_current_account() RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
AS $$ SELECT NULLIF(current_setting('gogospend.account_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_current_account() TO gogospend_app;
--> statement-breakpoint
-- Run by DatabaseService immediately before COMMIT: the transaction it opened
-- is still the one running, with the same owner and role. Catches code that
-- ended the transaction early or switched owner/role inside it. A guard
-- against mistakes in trusted API code, not a sandbox for untrusted SQL.
CREATE FUNCTION gogospend_assert_owner_tx(p_token text, p_account uuid) RETURNS void
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
BEGIN
  IF current_setting('gogospend.tx_token', true) IS DISTINCT FROM p_token
     OR NULLIF(current_setting('gogospend.account_id', true), '')::uuid IS DISTINCT FROM p_account
     OR current_user <> session_user THEN
    RAISE EXCEPTION 'owner transaction integrity check failed';
  END IF;
END
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_assert_owner_tx(text, uuid) TO gogospend_app;
--> statement-breakpoint
CREATE TABLE accounts (
  id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleting')),
  session_generation integer NOT NULL DEFAULT 0 CHECK (session_generation >= 0),
  lifecycle_generation integer NOT NULL DEFAULT 0 CHECK (lifecycle_generation >= 0),
  reauth_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- (issuer, subject) is unique: every provider alias maps to exactly one
-- internal account. Accounts are never linked by email.
CREATE TABLE account_identities (
  issuer text NOT NULL CHECK (length(issuer) BETWEEN 1 AND 512),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (issuer, subject)
);
--> statement-breakpoint
CREATE INDEX account_identities_account_id_idx ON account_identities (account_id);
--> statement-breakpoint
-- One row per account: the common account lock (SELECT … FOR UPDATE) and the
-- account's committed revision, allocated only under that lock.
CREATE TABLE account_sync_state (
  account_id uuid PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
--> statement-breakpoint
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE account_identities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE account_sync_state ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY accounts_owner ON accounts TO gogospend_app
  USING (id = gogospend_current_account())
  WITH CHECK (id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY account_identities_owner ON account_identities TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY account_sync_state_owner ON account_sync_state TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
-- The app reads its own rows. It may lock and advance its revision (FOR UPDATE
-- needs UPDATE on a column). Identity and account rows are created only by
-- the restricted bootstrap routines added in F4. Jobs/security/bootstrap roles
-- get no table access at all.
GRANT SELECT ON accounts, account_identities, account_sync_state TO gogospend_app;
--> statement-breakpoint
GRANT UPDATE (revision) ON account_sync_state TO gogospend_app;
--> statement-breakpoint
-- Resolves a verified provider principal before any owner context exists.
-- SECURITY DEFINER with a fixed search path and schema-qualified names; it
-- returns only the matching internal account id, never other identity data.
CREATE FUNCTION gogospend_resolve_principal(p_issuer text, p_subject text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT account_id FROM public.account_identities WHERE issuer = p_issuer AND subject = p_subject
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_resolve_principal(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_resolve_principal(text, text) TO gogospend_bootstrap;
