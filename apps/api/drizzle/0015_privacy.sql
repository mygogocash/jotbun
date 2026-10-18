-- P5: retention and resumable account erasure.
--   erasure_registry.erasure_markers - the independent erasure authority, in
--                         the shape P6a's restore reads (marker_id,
--                         account_id, keyed subject_lookups, lookup_key_id,
--                         recorded_at, and once the purge is verified
--                         purged_at and blocked_until): append-only except
--                         that a purge is recorded once, in a schema only the
--                         maintenance role gogospend_erasure_registry can
--                         use. No API, worker or leased-read role can read
--                         or write it. In production it must live outside the
--                         main database and its backups (P6a), so a restore
--                         cannot roll it back.
--   deletion_requests  - one per account being erased, the erasure's own
--                         work item: the initiating device's receipt (binding
--                         digest; its principal digest only until the purge),
--                         the job that runs it, and when each idempotent stage
--                         finished: marker -> provider -> objects -> purge ->
--                         registry. No foreign key and no `account_id` column:
--                         it outlives the account, and a restore's row-level
--                         erase keeps it. Routines only.
--   deletion_request_subjects - the provider aliases to revoke and delete,
--                         captured when the erasure is accepted (or
--                         re-queued by a restore), so provider cleanup never
--                         depends on the account's rows; deleted at the purge.
--   account_deletion   - the deletion job: a security kind (only
--                         gogospend_security sees, claims or changes it),
--                         created only by gogospend_request_deletion and
--                         gogospend_reapply_erasure.
--   retention          - deleted records are purged 30 days after deletion
--                         (row, earlier change-log payloads and snapshots
--                         built before; the head becomes a `purged`
--                         tombstone in a new change group, and no snapshot
--                         read before it can be recorded); export requests
--                         30 days after the request; command receipt digests
--                         after the 30-day outbox lifetime; provider event
--                         receipts, reconcile checks, expired challenges and
--                         lapsed holds; finished jobs; completed deletion
--                         requests; finished uploads. Every cutoff is the
--                         database clock and every pass is batched.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gogospend_erasure_registry') THEN
    BEGIN
      CREATE ROLE gogospend_erasure_registry NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    EXCEPTION WHEN duplicate_object OR unique_violation THEN
      NULL;
    END;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'gogospend_erasure_registry'
       AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR rolcanlogin)
  ) THEN
    RAISE EXCEPTION 'Role gogospend_erasure_registry already exists with login or elevated attributes';
  END IF;
END $$;
--> statement-breakpoint
CREATE SCHEMA erasure_registry;
--> statement-breakpoint
REVOKE ALL ON SCHEMA erasure_registry FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA erasure_registry TO gogospend_erasure_registry;
--> statement-breakpoint
-- One marker per recorded deletion (more than 32 aliases take several):
-- each subject lookup is base64url(HMAC-SHA256(lookup key,
-- "gogospend-erasure-subject-v1\0<issuer>\0<subject>")). For the registry
-- role: INSERT and SELECT, and UPDATE of purged_at/blocked_until only, once
-- (the guard trigger); never DELETE.
CREATE TABLE erasure_registry.erasure_markers (
  marker_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  subject_lookups text[] NOT NULL CHECK (
    cardinality(subject_lookups) BETWEEN 1 AND 32 AND array_position(subject_lookups, NULL) IS NULL
    AND array_to_string(subject_lookups, ',') ~ '^[A-Za-z0-9_-]{43}(,[A-Za-z0-9_-]{43})*$'),
  lookup_key_id text NOT NULL CHECK (lookup_key_id ~ '^[0-9a-f]{32}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- When P5 verified the account's server-side rows and objects were purged
  -- (P6a may clear the marker only after this), and the end of the aliases'
  -- hold it set then (a restore replays it).
  purged_at timestamptz,
  blocked_until timestamptz,
  CHECK (purged_at IS NULL OR purged_at >= recorded_at),
  CHECK (blocked_until IS NULL OR purged_at IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX erasure_markers_account_idx ON erasure_registry.erasure_markers (account_id);
--> statement-breakpoint
CREATE FUNCTION erasure_registry.gogospend_guard_erasure_marker() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
BEGIN
  IF (NEW.marker_id, NEW.account_id, NEW.subject_lookups, NEW.lookup_key_id, NEW.recorded_at)
       IS DISTINCT FROM (OLD.marker_id, OLD.account_id, OLD.subject_lookups, OLD.lookup_key_id, OLD.recorded_at)
     OR OLD.purged_at IS NOT NULL OR NEW.purged_at IS NULL THEN
    RAISE EXCEPTION 'erasure markers are append-only; a purge is recorded once' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER erasure_markers_guard BEFORE UPDATE ON erasure_registry.erasure_markers
  FOR EACH ROW EXECUTE FUNCTION erasure_registry.gogospend_guard_erasure_marker();
--> statement-breakpoint
ALTER TABLE erasure_registry.erasure_markers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY erasure_markers_read ON erasure_registry.erasure_markers FOR SELECT TO gogospend_erasure_registry USING (true);
--> statement-breakpoint
CREATE POLICY erasure_markers_append ON erasure_registry.erasure_markers FOR INSERT TO gogospend_erasure_registry WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY erasure_markers_purge ON erasure_registry.erasure_markers FOR UPDATE TO gogospend_erasure_registry USING (true) WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT ON erasure_registry.erasure_markers TO gogospend_erasure_registry;
--> statement-breakpoint
GRANT UPDATE (purged_at, blocked_until) ON erasure_registry.erasure_markers TO gogospend_erasure_registry;
--> statement-breakpoint
-- Receipt digests are dropped after the outbox lifetime (a receipt without
-- one never matches a replay: 409 IDEMPOTENCY_MISMATCH; status still answers).
ALTER TABLE command_receipts ALTER COLUMN request_digest DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE command_receipts ALTER COLUMN digest_key_id DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE command_receipts ADD CONSTRAINT command_receipts_digest_pair_check CHECK ((request_digest IS NULL) = (digest_key_id IS NULL));
--> statement-breakpoint
CREATE INDEX command_receipts_digest_age_idx ON command_receipts (committed_at) WHERE request_digest IS NOT NULL;
--> statement-breakpoint
-- The revision of the account's latest retention purge: no snapshot read
-- below it (it could still hold purged data) can be recorded.
ALTER TABLE account_sync_state ADD COLUMN purge_revision bigint NOT NULL DEFAULT 0 CHECK (purge_revision >= 0);
--> statement-breakpoint
ALTER TABLE account_sync_state ADD CONSTRAINT account_sync_state_purge_check CHECK (purge_revision <= revision);
--> statement-breakpoint
-- An entity's whole change history, for purging its payloads and for the
-- incremental change-log prune.
CREATE INDEX entity_changes_entity_idx ON entity_changes (account_id, entity, entity_id);
--> statement-breakpoint
CREATE INDEX transactions_deleted_idx ON transactions (deleted_at) WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX exports_requested_idx ON exports (requested_at);
--> statement-breakpoint
CREATE INDEX jobs_finished_idx ON jobs (finished_at) WHERE status IN ('succeeded', 'superseded', 'cancelled');
--> statement-breakpoint
-- Every job of an account (the erasure purge deletes them; the existing
-- index covers open jobs only).
CREATE INDEX jobs_account_idx ON jobs (account_id) WHERE account_id IS NOT NULL;
--> statement-breakpoint
-- The account foreign key's SET NULL and the erasure purge.
CREATE INDEX auth_event_receipts_account_idx ON auth_event_receipts (account_id) WHERE account_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX security_reconcile_checks_checked_idx ON security_reconcile_checks (checked_at);
--> statement-breakpoint
CREATE INDEX import_uploads_finished_idx ON import_uploads ((coalesce(finished_at, expires_at))) WHERE status <> 'receiving';
--> statement-breakpoint
CREATE TABLE deletion_requests (
  request_id uuid PRIMARY KEY,
  -- The erased account's internal id. Not named account_id on purpose: this
  -- is the erasure's work item, not the account's data.
  erased_account_id uuid NOT NULL UNIQUE,
  -- The account_deletion job that runs it (a restore re-queues a new one).
  job_id uuid NOT NULL UNIQUE,
  command_id uuid NOT NULL,
  -- The initiating device: sha256 of its binding, its principal digest and
  -- client. Only that device can learn the outcome after a lost response.
  -- The principal digest is cleared at the purge (the binding digest, a hash
  -- of a random secret, still identifies the device). All null for an
  -- erasure re-queued after a restore (no device asked).
  initiator_binding_digest bytea UNIQUE CHECK (octet_length(initiator_binding_digest) = 32),
  initiator_principal_digest bytea CHECK (octet_length(initiator_principal_digest) = 32),
  initiator_client_id text CHECK (length(initiator_client_id) BETWEEN 1 AND 255),
  requested_at timestamptz NOT NULL DEFAULT now(),
  marker_recorded_at timestamptz,
  provider_verified_at timestamptz,
  objects_swept_at timestamptz,
  purged_at timestamptz,
  -- The end of the aliases' hold set at the purge.
  blocked_until timestamptz,
  -- When the registry learned the purge (the marker's purged_at).
  marker_purge_recorded_at timestamptz,
  CHECK ((initiator_binding_digest IS NULL) = (initiator_client_id IS NULL)),
  CHECK (initiator_principal_digest IS NULL OR (initiator_binding_digest IS NOT NULL AND purged_at IS NULL)),
  CHECK (initiator_binding_digest IS NULL OR initiator_principal_digest IS NOT NULL OR purged_at IS NOT NULL),
  -- Each stage only after the one before it.
  CHECK (provider_verified_at IS NULL OR marker_recorded_at IS NOT NULL),
  CHECK (objects_swept_at IS NULL OR provider_verified_at IS NOT NULL),
  CHECK (purged_at IS NULL OR objects_swept_at IS NOT NULL),
  CHECK ((purged_at IS NULL) = (blocked_until IS NULL)),
  CHECK (marker_purge_recorded_at IS NULL OR purged_at IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX deletion_requests_open_idx ON deletion_requests (requested_at) WHERE marker_purge_recorded_at IS NULL;
--> statement-breakpoint
CREATE INDEX deletion_requests_purged_idx ON deletion_requests (purged_at) WHERE purged_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE deletion_request_subjects (
  request_id uuid NOT NULL REFERENCES deletion_requests (request_id) ON DELETE CASCADE,
  issuer text NOT NULL CHECK (length(issuer) BETWEEN 1 AND 512),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
  PRIMARY KEY (request_id, issuer, subject)
);
--> statement-breakpoint
ALTER TABLE deletion_request_subjects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- The deletion job is a security kind: a generic jobs login (parsers handle
-- untrusted files) can neither see, create, claim nor change it. Every
-- security kind is listed (auth0_link_identities included, so these
-- policies stay a superset whatever order migrations integrate in), and the
-- worker login cannot insert app-only kinds either.
DROP POLICY jobs_security ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_security ON jobs TO gogospend_security
  USING (kind IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'account_deletion'))
  WITH CHECK (kind IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'account_deletion'));
--> statement-breakpoint
DROP POLICY jobs_worker_read ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_worker_read ON jobs FOR SELECT TO gogospend_jobs
  USING (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'account_deletion'));
--> statement-breakpoint
DROP POLICY jobs_worker_update ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_worker_update ON jobs FOR UPDATE TO gogospend_jobs
  USING (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'account_deletion'))
  WITH CHECK (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'account_deletion'));
--> statement-breakpoint
DROP POLICY jobs_worker_insert ON jobs;
--> statement-breakpoint
CREATE POLICY jobs_worker_insert ON jobs FOR INSERT TO gogospend_jobs
  WITH CHECK (kind NOT IN ('auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'account_deletion',
                          'sync_snapshot', 'export', 'import_parse', 'import_expire'));
--> statement-breakpoint
-- P1's app cancel (0009), now also never cancelling the deletion job.
CREATE OR REPLACE FUNCTION gogospend_cancel_account_jobs() RETURNS integer
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
   WHERE j.account_id = v_account AND j.status IN ('queued', 'leased')
     AND j.kind <> ALL (ARRAY['auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'account_deletion']);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- The owner asks to be erased. The caller holds the account lock, re-checked
-- this session and consumed a fresh `deletion` proof in this transaction.
-- Under the lock, all at once:
--   - the account becomes `deleting`; its session and lifecycle generations
--     move (every binding, leased read and publisher at the old generation
--     is dead) and reauth_after moves past now;
--   - every binding is revoked;
--   - every alias is held as `deleted` (no sign-in, challenge, proof or link;
--     a pending global-logout hold is replaced, so its revocation job is
--     superseded - the deletion revokes grants itself);
--   - every open job of the account is cancelled, so no publisher can
--     publish again (security cleanup excepted);
--   - the request (with the initiating device's receipt), every alias to
--     clean up at the provider, and its account_deletion job (20 attempts)
--     are recorded.
-- Returns 'accepted', or 'unavailable' when the account is not active or the
-- session is not this account's live binding.
CREATE FUNCTION gogospend_request_deletion(p_request_id uuid, p_command_id uuid, p_session_id uuid) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_session public.auth_sessions%ROWTYPE;
  v_generation integer;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'deletion needs an owner transaction';
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  SELECT s.* INTO v_session FROM public.auth_sessions s
   WHERE s.id = p_session_id AND s.account_id = v_account AND s.revoked_at IS NULL;
  IF NOT FOUND THEN
    RETURN 'unavailable';
  END IF;
  UPDATE public.accounts a
     SET status = 'deleting',
         session_generation = a.session_generation + 1,
         lifecycle_generation = a.lifecycle_generation + 1,
         reauth_after = greatest(coalesce(a.reauth_after, '-infinity'::timestamptz), date_trunc('second', clock_timestamp()) + interval '1 second')
   WHERE a.id = v_account AND a.status = 'active'
  RETURNING a.lifecycle_generation INTO v_generation;
  IF NOT FOUND THEN
    RETURN 'unavailable';
  END IF;
  UPDATE public.auth_sessions s SET revoked_at = now() WHERE s.account_id = v_account AND s.revoked_at IS NULL;
  INSERT INTO public.blocked_principals (principal_digest, reason)
  SELECT public.gogospend_principal_digest(i.issuer, i.subject), 'deleted'
    FROM public.account_identities i WHERE i.account_id = v_account
  ON CONFLICT (principal_digest) DO UPDATE SET reason = 'deleted', pending_job_id = NULL, blocked_until = NULL;
  UPDATE public.jobs j
     SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, finished_at = now(), updated_at = now()
   WHERE j.account_id = v_account AND j.status IN ('queued', 'leased')
     AND j.kind <> ALL (ARRAY['auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'account_deletion']);
  INSERT INTO public.deletion_requests (request_id, erased_account_id, job_id, command_id, initiator_binding_digest, initiator_principal_digest, initiator_client_id)
  VALUES (p_request_id, v_account, p_request_id, p_command_id, v_session.binding_digest, v_session.principal_digest, v_session.client_id);
  INSERT INTO public.deletion_request_subjects (request_id, issuer, subject)
  SELECT p_request_id, i.issuer, i.subject FROM public.account_identities i WHERE i.account_id = v_account;
  INSERT INTO public.jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts, max_runtime_seconds)
  VALUES (p_request_id, 'account_deletion', v_account, v_generation, '{}'::jsonb, 20, 900);
  RETURN 'accepted';
END
$$;
--> statement-breakpoint
-- The initiating device's answer after a lost acceptance response (its
-- binding no longer resolves): the request this binding, principal and
-- client made with this command id - 'accepted' while erasure runs,
-- 'completed' once the account's data is purged - or nothing. After the
-- purge the principal digest is gone, and the binding digest (a hash of the
-- device's random secret), client and command id still have to match.
CREATE FUNCTION gogospend_deletion_receipt(p_binding_digest bytea, p_issuer text, p_subject text, p_client_id text, p_command_id uuid)
  RETURNS TABLE (request_id uuid, status text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT r.request_id, CASE WHEN r.purged_at IS NULL THEN 'accepted' ELSE 'completed' END
    FROM public.deletion_requests r
   WHERE r.initiator_binding_digest = p_binding_digest
     AND (r.initiator_principal_digest = public.gogospend_principal_digest(p_issuer, p_subject)
          OR (r.initiator_principal_digest IS NULL AND r.purged_at IS NOT NULL))
     AND r.initiator_client_id = p_client_id
     AND r.command_id = p_command_id
$$;
--> statement-breakpoint
-- The erased account of an account_deletion job whose lease is current and
-- unexpired (through the request that names the job), or NULL. Internal
-- (granted to no role).
CREATE FUNCTION gogospend_deletion_lease_account(p_job_id uuid, p_lease_token uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT r.erased_account_id
    FROM public.jobs j JOIN public.deletion_requests r ON r.job_id = j.id
   WHERE j.id = p_job_id AND j.kind = 'account_deletion' AND j.status = 'leased'
     AND j.lease_token = p_lease_token AND j.lease_expires_at > clock_timestamp()
$$;
--> statement-breakpoint
-- The request's progress for a current deletion lease (no row otherwise).
CREATE FUNCTION gogospend_deletion_progress(p_job_id uuid, p_lease_token uuid)
  RETURNS TABLE (request_id uuid, account_id uuid, marker_recorded_at timestamptz, provider_verified_at timestamptz, objects_swept_at timestamptz,
                 purged_at timestamptz, blocked_until timestamptz, marker_purge_recorded_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT r.request_id, r.erased_account_id, r.marker_recorded_at, r.provider_verified_at, r.objects_swept_at,
         r.purged_at, r.blocked_until, r.marker_purge_recorded_at
    FROM public.deletion_requests r
   WHERE r.job_id = p_job_id
     AND r.erased_account_id = public.gogospend_deletion_lease_account(p_job_id, p_lease_token)
$$;
--> statement-breakpoint
-- The provider aliases to mark, revoke and delete, read per lease (never
-- stored in the queue): captured with the request, kept until the purge.
CREATE FUNCTION gogospend_deletion_identities(p_job_id uuid, p_lease_token uuid)
  RETURNS TABLE (issuer text, subject text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT s.issuer, s.subject
    FROM public.deletion_request_subjects s
    JOIN public.deletion_requests r ON r.request_id = s.request_id
   WHERE r.job_id = p_job_id
     AND r.erased_account_id = public.gogospend_deletion_lease_account(p_job_id, p_lease_token)
   ORDER BY s.issuer, s.subject
$$;
--> statement-breakpoint
-- Every native client that held a session (their refresh grants are revoked).
CREATE FUNCTION gogospend_deletion_client_ids(p_job_id uuid, p_lease_token uuid) RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT DISTINCT s.client_id FROM public.auth_sessions s
   WHERE s.account_id = public.gogospend_deletion_lease_account(p_job_id, p_lease_token)
   ORDER BY s.client_id
$$;
--> statement-breakpoint
-- Records that a stage finished ('marker', 'provider', 'objects'), once;
-- each needs the one before it (CHECKs). True for a current lease.
CREATE FUNCTION gogospend_deletion_mark(p_job_id uuid, p_lease_token uuid, p_stage text) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_deletion_lease_account(p_job_id, p_lease_token);
BEGIN
  IF v_account IS NULL OR p_stage NOT IN ('marker', 'provider', 'objects') THEN
    RETURN false;
  END IF;
  UPDATE public.deletion_requests r
     SET marker_recorded_at = CASE WHEN p_stage = 'marker' THEN coalesce(r.marker_recorded_at, now()) ELSE r.marker_recorded_at END,
         provider_verified_at = CASE WHEN p_stage = 'provider' THEN coalesce(r.provider_verified_at, now()) ELSE r.provider_verified_at END,
         objects_swept_at = CASE WHEN p_stage = 'objects' THEN coalesce(r.objects_swept_at, now()) ELSE r.objects_swept_at END
   WHERE r.job_id = p_job_id AND r.erased_account_id = v_account;
  RETURN FOUND;
END
$$;
--> statement-breakpoint
-- The account's objects for a current lease: published ones become due now
-- (P1's sweep then deletes them, registry first), and the report says what
-- is still live - `pending` rows (reserved by a cancelled publisher, still
-- published, or awaiting a storage delete retry) and `quiet_after`, the
-- last reservation's final publisher deadline, after which nothing can
-- still be written under its key. NULLs for a stale lease.
CREATE FUNCTION gogospend_deletion_objects(p_job_id uuid, p_lease_token uuid)
  RETURNS TABLE (pending integer, quiet_after timestamptz)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
#variable_conflict use_column
DECLARE
  v_account uuid := public.gogospend_deletion_lease_account(p_job_id, p_lease_token);
BEGIN
  IF v_account IS NULL THEN
    RETURN QUERY SELECT NULL::integer, NULL::timestamptz;
    RETURN;
  END IF;
  UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
   WHERE o.account_id = v_account AND o.status = 'published';
  RETURN QUERY
    SELECT count(*)::integer, max(o.delete_after) FILTER (WHERE o.status = 'reserved')
      FROM public.object_publications o
     WHERE o.account_id = v_account AND o.status IN ('reserved', 'published', 'deleting');
END
$$;
--> statement-breakpoint
-- Before the purge, in short transactions (under the account lock): deletes
-- up to p_limit (1-10,000) rows of the account's largest tables - change
-- log, audit rows, receipts, records, entity heads - so the final purge
-- transaction stays small. Only once the objects stage is done; never after
-- the purge. Returns how many rows went (0: nothing left to shed), or NULL
-- for a stale lease.
CREATE FUNCTION gogospend_deletion_shed(p_job_id uuid, p_lease_token uuid, p_limit integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_deletion_lease_account(p_job_id, p_lease_token);
  v_left integer := least(greatest(coalesce(p_limit, 1), 1), 10000);
  v_n integer;
  v_total integer := 0;
BEGIN
  IF v_account IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.deletion_requests r WHERE r.job_id = p_job_id AND r.objects_swept_at IS NOT NULL AND r.purged_at IS NULL) THEN
    RETURN 0;
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  DELETE FROM public.entity_changes c
   WHERE c.ctid = ANY (ARRAY(SELECT x.ctid FROM public.entity_changes x WHERE x.account_id = v_account LIMIT v_left));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;
  v_left := v_left - v_n;
  IF v_left > 0 THEN
    DELETE FROM public.audit_events c
     WHERE c.ctid = ANY (ARRAY(SELECT x.ctid FROM public.audit_events x WHERE x.account_id = v_account LIMIT v_left));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_left := v_left - v_n;
  END IF;
  IF v_left > 0 THEN
    DELETE FROM public.command_receipts c
     WHERE c.ctid = ANY (ARRAY(SELECT x.ctid FROM public.command_receipts x WHERE x.account_id = v_account LIMIT v_left));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_left := v_left - v_n;
  END IF;
  IF v_left > 0 THEN
    DELETE FROM public.transactions c
     WHERE c.ctid = ANY (ARRAY(SELECT x.ctid FROM public.transactions x WHERE x.account_id = v_account LIMIT v_left));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
    v_left := v_left - v_n;
  END IF;
  IF v_left > 0 THEN
    DELETE FROM public.entity_heads c
     WHERE c.ctid = ANY (ARRAY(SELECT x.ctid FROM public.entity_heads x WHERE x.account_id = v_account LIMIT v_left));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END IF;
  RETURN v_total;
END
$$;
--> statement-breakpoint
-- The purge, in one transaction under the account lock (when the account
-- still exists) and the job row: with every earlier stage done, deletes the
-- account (its remaining private rows, sessions, challenges, consents,
-- exports, snapshots and change log cascade), its other jobs, its aliases'
-- provider-event receipts, reconcile checks and open challenges, and the
-- captured aliases; keeps every alias blocked for an hour past provider
-- verification (no access token issued before the provider deletion can
-- still be valid), after which the hold lapses; clears the initiator's
-- principal digest; marks the request purged with that hold end. The job
-- stays leased: gogospend_deletion_finish completes it once the registry has
-- the purge. Idempotent. Returns 'purged', 'not_ready' or 'stale_lease'.
CREATE FUNCTION gogospend_deletion_purge(p_job_id uuid, p_lease_token uuid) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_deletion_lease_account(p_job_id, p_lease_token);
  v_job public.jobs%ROWTYPE;
  v_request public.deletion_requests%ROWTYPE;
  v_digests bytea[];
  v_until timestamptz;
BEGIN
  IF v_account IS NULL THEN
    RETURN 'stale_lease';
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  SELECT j.* INTO v_job FROM public.jobs j WHERE j.id = p_job_id FOR UPDATE;
  IF v_job.status <> 'leased' OR v_job.lease_token IS DISTINCT FROM p_lease_token OR v_job.lease_expires_at <= clock_timestamp() THEN
    RETURN 'stale_lease';
  END IF;
  SELECT r.* INTO v_request FROM public.deletion_requests r WHERE r.job_id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_request.objects_swept_at IS NULL THEN
    RETURN 'not_ready';
  END IF;
  IF v_request.purged_at IS NULL THEN
    SELECT coalesce(array_agg(DISTINCT d), '{}'::bytea[]) INTO v_digests FROM (
      SELECT public.gogospend_principal_digest(s.issuer, s.subject) AS d FROM public.deletion_request_subjects s WHERE s.request_id = v_request.request_id
      UNION
      SELECT public.gogospend_principal_digest(i.issuer, i.subject) FROM public.account_identities i WHERE i.account_id = v_account) x;
    v_until := greatest(now(), v_request.provider_verified_at) + interval '1 hour';
    INSERT INTO public.blocked_principals (principal_digest, reason, blocked_until)
    SELECT d, 'deleted', v_until FROM unnest(v_digests) AS d
    ON CONFLICT (principal_digest) DO UPDATE
       SET reason = 'deleted', pending_job_id = NULL, blocked_until = EXCLUDED.blocked_until;
    DELETE FROM public.auth_event_receipts r WHERE r.principal_digest = ANY (v_digests);
    DELETE FROM public.auth_event_receipts r WHERE r.account_id = v_account;
    DELETE FROM public.security_reconcile_checks c WHERE c.principal_digest = ANY (v_digests);
    DELETE FROM public.reauth_challenges c WHERE c.principal_digest = ANY (v_digests);
    DELETE FROM public.jobs j WHERE j.account_id = v_account AND j.id <> p_job_id;
    DELETE FROM public.accounts a WHERE a.id = v_account;
    DELETE FROM public.deletion_request_subjects s WHERE s.request_id = v_request.request_id;
    UPDATE public.deletion_requests r
       SET purged_at = now(), blocked_until = v_until, initiator_principal_digest = NULL
     WHERE r.request_id = v_request.request_id;
  END IF;
  RETURN 'purged';
END
$$;
--> statement-breakpoint
-- The last step, after the registry recorded the purge (the marker's
-- purged_at and blocked_until): records that, and completes the job. Returns
-- 'finished', 'not_ready' or 'stale_lease'.
CREATE FUNCTION gogospend_deletion_finish(p_job_id uuid, p_lease_token uuid) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
BEGIN
  SELECT j.* INTO v_job FROM public.jobs j WHERE j.id = p_job_id AND j.kind = 'account_deletion' FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'leased' OR v_job.lease_token IS DISTINCT FROM p_lease_token OR v_job.lease_expires_at <= clock_timestamp() THEN
    RETURN 'stale_lease';
  END IF;
  UPDATE public.deletion_requests r SET marker_purge_recorded_at = coalesce(r.marker_purge_recorded_at, now())
   WHERE r.job_id = p_job_id AND r.purged_at IS NOT NULL;
  IF NOT FOUND THEN
    RETURN 'not_ready';
  END IF;
  UPDATE public.jobs j
     SET status = 'succeeded', lease_token = NULL, lease_expires_at = NULL, last_error = NULL, finished_at = now(), updated_at = now()
   WHERE j.id = p_job_id;
  RETURN 'finished';
END
$$;
--> statement-breakpoint
-- For the deletion worker's alert: erasures not finished (purge and its
-- registry record), those older than 20 hours (the 24-hour target is at
-- risk), the oldest age, and failed deletion jobs (each needs the runbook).
CREATE FUNCTION gogospend_deletion_backlog() RETURNS TABLE (open integer, overdue integer, oldest_seconds bigint, failed integer)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT (SELECT count(*)::integer FROM public.deletion_requests r WHERE r.marker_purge_recorded_at IS NULL),
         (SELECT count(*)::integer FROM public.deletion_requests r WHERE r.marker_purge_recorded_at IS NULL AND r.requested_at < now() - interval '20 hours'),
         (SELECT coalesce(floor(extract(epoch FROM now() - min(r.requested_at)))::bigint, 0) FROM public.deletion_requests r WHERE r.marker_purge_recorded_at IS NULL),
         (SELECT count(*)::integer FROM public.jobs j WHERE j.kind = 'account_deletion' AND j.status = 'failed')
$$;
--> statement-breakpoint
-- Replaces entities' data with `purged` tombstones (internal; the caller
-- holds the account lock and has already deleted the domain rows). In one new
-- change group (revision) it records each live or deleted head as purged at
-- the next version, deletes every earlier change row of those entities (their
-- snapshots carried the data) and moves pruned_through over them (a cursor
-- below a group that lost rows resyncs - only possible for positions older
-- than the entities' last change), raises the purge watermark to the new
-- revision (no snapshot read before it can be recorded) and drops snapshots
-- built before the purge (their objects become due for P1's sweep). Returns
-- the revision, or NULL when nothing was left to purge.
CREATE FUNCTION gogospend_purge_entities(p_account uuid, p_entity text, p_ids uuid[]) RETURNS bigint
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_changes jsonb;
  v_revision bigint;
  v_command uuid;
  v_old bigint;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('entity', h.entity, 'id', h.entity_id, 'version', h.version + 1, 'state', 'purged', 'snapshot', NULL) ORDER BY h.entity_id)
    INTO v_changes
    FROM public.entity_heads h
   WHERE h.account_id = p_account AND h.entity = p_entity AND h.entity_id = ANY (p_ids) AND h.state <> 'purged';
  IF v_changes IS NULL THEN
    RETURN NULL;
  END IF;
  UPDATE public.account_sync_state s SET revision = s.revision + 1 WHERE s.account_id = p_account RETURNING s.revision INTO v_revision;
  v_command := md5('gogospend.purge:' || p_account::text || ':' || v_revision::text)::uuid;
  SELECT max(c.revision) INTO v_old FROM public.entity_changes c
   WHERE c.account_id = p_account AND c.entity = p_entity AND c.entity_id = ANY (p_ids) AND c.revision < v_revision;
  DELETE FROM public.entity_changes c
   WHERE c.account_id = p_account AND c.entity = p_entity AND c.entity_id = ANY (p_ids) AND c.revision < v_revision;
  -- group_bytes: jsonb text is at least as long as what sync serves.
  INSERT INTO public.entity_changes (account_id, revision, ordinal, command_id, entity, entity_id, version, state, snapshot, group_bytes)
  SELECT p_account, v_revision, (e.ordinal - 1)::integer, v_command, e.value ->> 'entity', (e.value ->> 'id')::uuid, (e.value ->> 'version')::integer, 'purged', NULL,
         CASE WHEN e.ordinal = 1 THEN octet_length(format('{"revision":"%s","command_id":"%s","changes":%s}', repeat('9', 19), v_command, v_changes::text)) END
    FROM jsonb_array_elements(v_changes) WITH ORDINALITY AS e(value, ordinal);
  UPDATE public.entity_heads h
     SET version = h.version + 1, state = 'purged', revision = v_revision
   WHERE h.account_id = p_account AND h.entity = p_entity AND h.entity_id = ANY (p_ids) AND h.state <> 'purged';
  UPDATE public.account_sync_state s
     SET pruned_through = greatest(s.pruned_through, coalesce(v_old, 0)), purge_revision = v_revision
   WHERE s.account_id = p_account;
  UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
    FROM public.snapshot_chunks c JOIN public.snapshot_manifests m ON m.snapshot_id = c.snapshot_id
   WHERE m.account_id = p_account AND m.high_water < v_revision AND o.key = c.object_key AND o.status = 'published';
  DELETE FROM public.snapshot_manifests m WHERE m.account_id = p_account AND m.high_water < v_revision;
  RETURN v_revision;
END
$$;
--> statement-breakpoint
-- S1's snapshot record (0010), now also refusing a high-water below the
-- account's purge watermark: a view read before a retention purge still
-- holds the purged data, so the worker builds a new one. Otherwise unchanged.
CREATE OR REPLACE FUNCTION gogospend_record_snapshot(p_job_id uuid, p_lease_token uuid, p_high_water bigint, p_chunks jsonb, p_expires_at timestamptz) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_count integer;
  v_matched integer;
BEGIN
  SELECT j.* INTO v_job FROM public.jobs j
   WHERE j.id = p_job_id AND j.kind = 'sync_snapshot' AND j.status = 'leased'
     AND j.lease_token = p_lease_token AND j.lease_expires_at > clock_timestamp();
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = v_job.account_id AND a.status = 'active' AND a.lifecycle_generation = v_job.lifecycle_generation) THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p_chunks) <> 'array' OR NOT EXISTS (
       SELECT 1 FROM public.account_sync_state s
        WHERE s.account_id = v_job.account_id AND p_high_water BETWEEN greatest(s.pruned_through, s.purge_revision) AND s.revision) THEN
    RETURN false;
  END IF;
  v_count := jsonb_array_length(p_chunks);
  SELECT count(*) INTO v_matched
    FROM jsonb_array_elements(p_chunks) WITH ORDINALITY AS c(value, ordinal)
    JOIN public.object_publications o ON o.key = c.value ->> 'key'
   WHERE o.job_id = p_job_id AND o.lease_token = p_lease_token AND o.account_id = v_job.account_id
     AND o.purpose = 'sync_snapshot' AND o.status = 'published'
     AND o.bytes = (c.value ->> 'bytes')::bigint AND o.sha256 = decode(c.value ->> 'sha256', 'hex') AND o.delete_after = p_expires_at
     AND (c.value ->> 'index')::integer = c.ordinal - 1;
  IF v_count < 1 OR v_matched <> v_count THEN
    RETURN false;
  END IF;
  INSERT INTO public.snapshot_manifests (snapshot_id, account_id, lifecycle_generation, high_water, schema_version, chunk_count, expires_at)
  VALUES (p_job_id, v_job.account_id, v_job.lifecycle_generation, p_high_water, 1, v_count, p_expires_at);
  INSERT INTO public.snapshot_chunks (snapshot_id, account_id, chunk_index, object_key, bytes, sha256)
  SELECT p_job_id, v_job.account_id, (c.value ->> 'index')::integer, c.value ->> 'key', (c.value ->> 'bytes')::bigint, decode(c.value ->> 'sha256', 'hex')
    FROM jsonb_array_elements(p_chunks) AS c(value);
  RETURN true;
END
$$;
--> statement-breakpoint
-- Accounts with records past retention, in account order after p_after:
-- transactions deleted more than 30 days ago (past the restore window) and
-- export requests more than 30 days old.
CREATE FUNCTION gogospend_retention_purge_candidates(p_after uuid, p_limit integer) RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT x.account_id FROM (
    SELECT t.account_id FROM public.transactions t
     WHERE t.deleted_at < now() - interval '30 days' AND (p_after IS NULL OR t.account_id > p_after)
    UNION
    SELECT e.account_id FROM public.exports e
     WHERE e.requested_at < now() - interval '30 days' AND (p_after IS NULL OR e.account_id > p_after)
  ) x
   ORDER BY x.account_id
   LIMIT least(greatest(p_limit, 1), 1000)
$$;
--> statement-breakpoint
-- Purges one account in the caller's short transaction: up to 1,000
-- transactions deleted more than 30 days ago and up to 1,000 export requests
-- older than 30 days, each set as one purge change group. Skipped while a
-- user write holds the account lock (the next run retries) and for an
-- account being erased: its erasure removes everything, so retention writes
-- no new change groups for it and never contends for its lock. Returns how
-- many records were purged.
CREATE FUNCTION gogospend_retention_purge_account(p_account uuid) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_ids uuid[];
  v_count integer := 0;
BEGIN
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = p_account FOR UPDATE SKIP LOCKED;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = p_account AND a.status <> 'deleting') THEN
    RETURN 0;
  END IF;
  WITH gone AS (
    DELETE FROM public.transactions t
     WHERE t.account_id = p_account
       AND t.id IN (SELECT d.id FROM public.transactions d
                     WHERE d.account_id = p_account AND d.deleted_at < now() - interval '30 days'
                     ORDER BY d.deleted_at, d.id LIMIT 1000)
    RETURNING t.id)
  SELECT array_agg(gone.id) INTO v_ids FROM gone;
  IF v_ids IS NOT NULL THEN
    PERFORM public.gogospend_purge_entities(p_account, 'transaction', v_ids);
    v_count := v_count + cardinality(v_ids);
  END IF;
  WITH gone AS (
    DELETE FROM public.exports e
     WHERE e.account_id = p_account
       AND e.export_id IN (SELECT d.export_id FROM public.exports d
                            WHERE d.account_id = p_account AND d.requested_at < now() - interval '30 days'
                            ORDER BY d.requested_at, d.export_id LIMIT 1000)
    RETURNING e.export_id)
  SELECT array_agg(gone.export_id) INTO v_ids FROM gone;
  IF v_ids IS NOT NULL THEN
    PERFORM public.gogospend_purge_entities(p_account, 'export', v_ids);
    v_count := v_count + cardinality(v_ids);
  END IF;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- Drops the request digests of receipts older than the 30-day outbox
-- lifetime (at most p_limit per call). The compact acknowledgement stays.
CREATE FUNCTION gogospend_drop_receipt_digests(p_limit integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH due AS (
    SELECT r.account_id, r.command_id FROM public.command_receipts r
     WHERE r.request_digest IS NOT NULL AND r.committed_at < now() - interval '30 days'
     ORDER BY r.committed_at LIMIT least(greatest(p_limit, 1), 10000)
     FOR UPDATE SKIP LOCKED)
  UPDATE public.command_receipts r SET request_digest = NULL, digest_key_id = NULL
    FROM due WHERE r.account_id = due.account_id AND r.command_id = due.command_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- F6b's provider-event receipts and reconcile checks after 30 days (past the
-- 7-day event window; an account keeps its own watermark), challenges a day
-- past expiry, and deletion holds whose stale-token window has passed - at
-- most p_limit (1-10,000) rows of each per call. Returns how many went.
CREATE FUNCTION gogospend_prune_security_records(p_limit integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 1), 1), 10000);
  v_count integer;
  v_total integer := 0;
BEGIN
  DELETE FROM public.auth_event_receipts r
   WHERE r.event_id = ANY (ARRAY(SELECT x.event_id FROM public.auth_event_receipts x
                                  WHERE x.received_at < now() - interval '30 days' AND x.outcome <> 'pending'
                                  ORDER BY x.received_at LIMIT v_limit));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;
  DELETE FROM public.security_reconcile_checks c
   WHERE c.principal_digest = ANY (ARRAY(SELECT x.principal_digest FROM public.security_reconcile_checks x
                                          WHERE x.checked_at < now() - interval '30 days' ORDER BY x.checked_at LIMIT v_limit));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;
  DELETE FROM public.reauth_challenges c
   WHERE c.id = ANY (ARRAY(SELECT x.id FROM public.reauth_challenges x WHERE x.expires_at < now() - interval '1 day' LIMIT v_limit));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;
  DELETE FROM public.blocked_principals b
   WHERE b.principal_digest = ANY (ARRAY(SELECT x.principal_digest FROM public.blocked_principals x
                                          WHERE x.reason = 'deleted' AND x.blocked_until IS NOT NULL AND x.blocked_until < now() LIMIT v_limit));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_total + v_count;
END
$$;
--> statement-breakpoint
-- Jobs that finished (succeeded, superseded or cancelled) more than 30 days
-- ago, at most p_limit (1-10,000) per call; failed jobs stay for the runbook.
CREATE FUNCTION gogospend_prune_finished_jobs(p_limit integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.jobs j
   WHERE j.id = ANY (ARRAY(SELECT x.id FROM public.jobs x
                            WHERE x.status IN ('succeeded', 'superseded', 'cancelled') AND x.finished_at < now() - interval '30 days'
                              AND NOT EXISTS (SELECT 1 FROM public.blocked_principals b WHERE b.pending_job_id = x.id)
                            ORDER BY x.finished_at LIMIT least(greatest(coalesce(p_limit, 1), 1), 10000)));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- Finished deletion requests 30 days after the purge (the initiating
-- device's receipt window), at most p_limit (1-10,000) per call; the
-- registry marker is the lasting record.
CREATE FUNCTION gogospend_prune_deletion_requests(p_limit integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.deletion_requests r
   WHERE r.request_id = ANY (ARRAY(SELECT x.request_id FROM public.deletion_requests x
                                    WHERE x.purged_at < now() - interval '30 days' AND x.marker_purge_recorded_at IS NOT NULL
                                    ORDER BY x.purged_at LIMIT least(greatest(coalesce(p_limit, 1), 1), 10000)));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- P2a's upload rows 30 days after they finished (refused, failed or expired)
-- or after an accepted upload's 24-hour expiry, at most p_limit (1-10,000)
-- per call. The quotas look back 24 hours at most and a receiving upload is
-- never touched. (P2a's maintenance already clears file names after 8 days.)
CREATE FUNCTION gogospend_prune_import_uploads(p_limit integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.import_uploads u
   WHERE u.job_id = ANY (ARRAY(SELECT x.job_id FROM public.import_uploads x
                                WHERE x.status <> 'receiving' AND coalesce(x.finished_at, x.expires_at) < now() - interval '30 days'
                                  AND x.created_at < now() - interval '24 hours'
                                ORDER BY coalesce(x.finished_at, x.expires_at) LIMIT least(greatest(coalesce(p_limit, 1), 1), 10000)));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- S1's prune (0010), now also deleting changes superseded after an earlier
-- pass moved the retention line past them. Still incremental: besides the
-- window (pruned_through, cut], it visits only the history of entities
-- changed since the last pass (any change above pruned_through), through the
-- (account, entity, entity_id) index - an entity untouched since then has no
-- superseded row below the line. Every change at or below the cut that is
-- not its entity's head goes. Otherwise unchanged.
CREATE OR REPLACE FUNCTION gogospend_prune_account(p_account uuid) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_from bigint;
  v_cut bigint;
BEGIN
  SELECT s.pruned_through INTO v_from FROM public.account_sync_state s WHERE s.account_id = p_account FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  SELECT max(c.revision) INTO v_cut FROM public.entity_changes c
   WHERE c.account_id = p_account AND c.revision > v_from AND c.ordinal = 0 AND c.committed_at < now() - interval '30 days';
  IF v_cut IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM public.entity_changes c
   WHERE c.account_id = p_account AND c.revision <= v_cut
     AND (c.entity, c.entity_id) IN (SELECT DISTINCT n.entity, n.entity_id FROM public.entity_changes n
                                      WHERE n.account_id = p_account AND n.revision > v_from)
     AND NOT EXISTS (SELECT 1 FROM public.entity_heads h
                      WHERE h.account_id = c.account_id AND h.entity = c.entity AND h.entity_id = c.entity_id AND h.revision = c.revision);
  UPDATE public.account_sync_state s SET pruned_through = v_cut WHERE s.account_id = p_account;
  RETURN true;
END
$$;
--> statement-breakpoint
-- F6b's credential change (0011), now recording nothing for a principal
-- under an active `deleted` hold: the account is being or has been erased,
-- every session is already revoked, and a new provider-event receipt would
-- keep a digest of the erased person. Answers 'no_account'. Otherwise
-- unchanged.
CREATE OR REPLACE FUNCTION gogospend_apply_credential_change(p_event_id text, p_source text, p_type text, p_issuer text, p_subject text, p_occurred_at timestamptz, p_job_id uuid)
  RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_digest bytea := public.gogospend_principal_digest(p_issuer, p_subject);
  v_existing public.auth_event_receipts%ROWTYPE;
  v_account uuid;
  v_changed timestamptz;
  v_generation integer;
  v_lifecycle integer;
  v_cutoff timestamptz;
  v_live_ended integer;
BEGIN
  -- The verifier allows 60 s of clock skew; this leaves room for processing.
  IF p_occurred_at IS NULL OR p_occurred_at > clock_timestamp() + interval '90 seconds' THEN
    RAISE EXCEPTION 'a credential change cannot be in the future' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gogospend.principal:' || encode(v_digest, 'hex'), 0));
  IF EXISTS (SELECT 1 FROM public.blocked_principals b
              WHERE b.principal_digest = v_digest AND b.reason = 'deleted' AND (b.blocked_until IS NULL OR b.blocked_until > now())) THEN
    RETURN 'no_account';
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
    -- Kept as the principal's watermark: bootstrap refuses logins from before it.
    UPDATE public.auth_event_receipts r SET outcome = 'no_account' WHERE r.event_id = p_event_id;
    RETURN 'no_account';
  END IF;
  -- The common account lock, then a fresh read (see lockAccount).
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  SELECT a.credentials_changed_at, a.session_generation, a.lifecycle_generation
    INTO v_changed, v_generation, v_lifecycle
    FROM public.accounts a WHERE a.id = v_account;
  -- Any status: a disabled account re-enabled later must not revive old sessions.
  IF NOT FOUND OR (v_changed IS NOT NULL AND p_occurred_at <= v_changed) THEN
    UPDATE public.auth_event_receipts r SET outcome = 'superseded', account_id = CASE WHEN FOUND THEN v_account END WHERE r.event_id = p_event_id;
    RETURN 'superseded';
  END IF;

  -- Provider auth_time has whole-second resolution: no login from the change's second counts.
  v_cutoff := date_trunc('second', p_occurred_at) + interval '1 second';
  UPDATE public.accounts a
     SET credentials_changed_at = p_occurred_at,
         reauth_after = greatest(coalesce(a.reauth_after, '-infinity'::timestamptz), v_cutoff)
   WHERE a.id = v_account;
  WITH ended AS (
    UPDATE public.auth_sessions s SET revoked_at = now()
     WHERE s.account_id = v_account AND s.revoked_at IS NULL AND s.authenticated_at < v_cutoff
    RETURNING (now() < s.idle_expires_at AND now() < s.absolute_expires_at) AS live
  )
  SELECT count(*) FILTER (WHERE live) INTO v_live_ended FROM ended;
  -- Old refresh grants could still reach the token-only routes (and spend the
  -- principal's challenge budget): revoke them for every verified event and
  -- for a reconciled change that ended a live session or is recent. A change
  -- found days after every live session started ends nothing.
  IF v_live_ended = 0 AND p_source = 'reconcile' AND p_occurred_at < clock_timestamp() - interval '1 day' THEN
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
-- For P6a's restore (run by the restore operator, the database owner, on the
-- private copy; granted to no role): re-queues the erasure of an account
-- whose deletion was still in progress - its marker has no purged_at, or the
-- restored copy holds its accepted request - so provider cleanup, the
-- object sweep, the purge and the registry's purge record all run again
-- once the copy serves. In one transaction (the account lock, when the
-- account exists): the account's deletion transition (deleting, both
-- generations moved, bindings revoked, every alias held with no end, open
-- jobs cancelled); its aliases captured for the provider stage; the request
-- (created or reset to its first stage, no initiator receipt kept); and a
-- new account_deletion job without an account_id, replacing any earlier one
-- (cancelled when open, removed when failed). The restore then deletes the
-- account's own rows; the request, its captured aliases and the job are the
-- erasure's work items and stay. Returns 'requeued', or 'absent' when the
-- copy has no such account (nothing left to erase or capture).
CREATE FUNCTION gogospend_reapply_erasure(p_account uuid, p_job_id uuid) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_request public.deletion_requests%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'absent';
  END IF;
  SELECT r.* INTO v_request FROM public.deletion_requests r WHERE r.erased_account_id = p_account FOR UPDATE;
  UPDATE public.accounts a
     SET status = 'deleting',
         session_generation = a.session_generation + 1,
         lifecycle_generation = a.lifecycle_generation + 1,
         reauth_after = greatest(coalesce(a.reauth_after, '-infinity'::timestamptz), date_trunc('second', clock_timestamp()) + interval '1 second')
   WHERE a.id = p_account;
  UPDATE public.auth_sessions s SET revoked_at = now() WHERE s.account_id = p_account AND s.revoked_at IS NULL;
  INSERT INTO public.blocked_principals (principal_digest, reason)
  SELECT public.gogospend_principal_digest(i.issuer, i.subject), 'deleted'
    FROM public.account_identities i WHERE i.account_id = p_account
  ON CONFLICT (principal_digest) DO UPDATE SET reason = 'deleted', pending_job_id = NULL, blocked_until = NULL;
  UPDATE public.jobs j
     SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, finished_at = now(), updated_at = now()
   WHERE j.account_id = p_account AND j.status IN ('queued', 'leased')
     AND j.kind <> ALL (ARRAY['auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'account_deletion']);
  IF v_request.request_id IS NULL THEN
    INSERT INTO public.deletion_requests (request_id, erased_account_id, job_id, command_id)
    VALUES (p_job_id, p_account, p_job_id, p_job_id)
    RETURNING * INTO v_request;
  ELSE
    UPDATE public.jobs j
       SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, finished_at = now(), updated_at = now()
     WHERE j.id = v_request.job_id AND j.status IN ('queued', 'leased');
    DELETE FROM public.jobs j WHERE j.id = v_request.job_id AND j.status = 'failed';
    UPDATE public.deletion_requests r
       SET job_id = p_job_id, marker_recorded_at = NULL, provider_verified_at = NULL, objects_swept_at = NULL, purged_at = NULL,
           blocked_until = NULL, marker_purge_recorded_at = NULL,
           initiator_binding_digest = NULL, initiator_principal_digest = NULL, initiator_client_id = NULL
     WHERE r.request_id = v_request.request_id;
  END IF;
  INSERT INTO public.deletion_request_subjects (request_id, issuer, subject)
  SELECT v_request.request_id, i.issuer, i.subject FROM public.account_identities i WHERE i.account_id = p_account
  ON CONFLICT DO NOTHING;
  INSERT INTO public.jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts, max_runtime_seconds)
  VALUES (p_job_id, 'account_deletion', NULL, 0, '{}'::jsonb, 20, 900);
  RETURN 'requeued';
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_request_deletion(uuid, uuid, uuid), gogospend_deletion_receipt(bytea, text, text, text, uuid),
  gogospend_deletion_lease_account(uuid, uuid), gogospend_deletion_progress(uuid, uuid), gogospend_deletion_identities(uuid, uuid),
  gogospend_deletion_client_ids(uuid, uuid), gogospend_deletion_mark(uuid, uuid, text), gogospend_deletion_objects(uuid, uuid),
  gogospend_deletion_shed(uuid, uuid, integer), gogospend_deletion_purge(uuid, uuid), gogospend_deletion_finish(uuid, uuid),
  gogospend_deletion_backlog(), gogospend_purge_entities(uuid, text, uuid[]),
  gogospend_retention_purge_candidates(uuid, integer), gogospend_retention_purge_account(uuid), gogospend_drop_receipt_digests(integer),
  gogospend_prune_security_records(integer), gogospend_prune_finished_jobs(integer), gogospend_prune_deletion_requests(integer),
  gogospend_prune_import_uploads(integer), gogospend_reapply_erasure(uuid, uuid), erasure_registry.gogospend_guard_erasure_marker() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_request_deletion(uuid, uuid, uuid) TO gogospend_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_deletion_receipt(bytea, text, text, text, uuid) TO gogospend_bootstrap;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_deletion_progress(uuid, uuid), gogospend_deletion_identities(uuid, uuid), gogospend_deletion_client_ids(uuid, uuid),
  gogospend_deletion_mark(uuid, uuid, text), gogospend_deletion_objects(uuid, uuid), gogospend_deletion_shed(uuid, uuid, integer),
  gogospend_deletion_purge(uuid, uuid), gogospend_deletion_finish(uuid, uuid), gogospend_deletion_backlog() TO gogospend_security;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_retention_purge_candidates(uuid, integer), gogospend_retention_purge_account(uuid), gogospend_drop_receipt_digests(integer),
  gogospend_prune_security_records(integer), gogospend_prune_finished_jobs(integer), gogospend_prune_deletion_requests(integer),
  gogospend_prune_import_uploads(integer) TO gogospend_jobs;
