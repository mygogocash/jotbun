-- P5: retention and resumable account erasure.
--   erasure_registry.erasure_markers - the independent erasure authority, in
--                         the shape P6a's restore reads (marker_id,
--                         account_id, keyed subject_lookups, lookup_key_id,
--                         recorded_at): append-only, in a schema only the
--                         maintenance role gogospend_erasure_registry can
--                         use. No API, worker or leased-read role can read
--                         or write it. In production it must live outside the
--                         main database and its backups (P6a), so a restore
--                         cannot roll it back.
--   deletion_requests  - one per account being erased: the initiating
--                         device's binding digest (its lost-response
--                         receipt), and when each idempotent stage finished:
--                         marker -> provider -> objects -> purge. No foreign
--                         key: it outlives the account. Routines only.
--   account_deletion   - the deletion job: a security kind (only
--                         gogospend_security sees, claims or changes it),
--                         created only by gogospend_request_deletion and
--                         gogospend_reapply_erasure.
--   retention          - deleted records are purged 30 days after deletion
--                         (row, earlier change-log payloads and snapshots
--                         built before; the head becomes a `purged`
--                         tombstone in a new change group); export requests
--                         30 days after the request; command receipt digests
--                         after the 30-day outbox lifetime; provider event
--                         receipts, reconcile checks, expired challenges and
--                         lapsed holds; finished jobs; completed deletion
--                         requests. Every cutoff is the database clock.
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
-- "gogospend-erasure-subject-v1\0<issuer>\0<subject>")). Append-only for the
-- registry role: INSERT and SELECT, never UPDATE or DELETE.
CREATE TABLE erasure_registry.erasure_markers (
  marker_id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  subject_lookups text[] NOT NULL CHECK (
    cardinality(subject_lookups) BETWEEN 1 AND 32 AND array_position(subject_lookups, NULL) IS NULL
    AND array_to_string(subject_lookups, ',') ~ '^[A-Za-z0-9_-]{43}(,[A-Za-z0-9_-]{43})*$'),
  lookup_key_id text NOT NULL CHECK (lookup_key_id ~ '^[0-9a-f]{32}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
--> statement-breakpoint
CREATE INDEX erasure_markers_account_idx ON erasure_registry.erasure_markers (account_id);
--> statement-breakpoint
ALTER TABLE erasure_registry.erasure_markers ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY erasure_markers_read ON erasure_registry.erasure_markers FOR SELECT TO gogospend_erasure_registry USING (true);
--> statement-breakpoint
CREATE POLICY erasure_markers_append ON erasure_registry.erasure_markers FOR INSERT TO gogospend_erasure_registry WITH CHECK (true);
--> statement-breakpoint
GRANT SELECT, INSERT ON erasure_registry.erasure_markers TO gogospend_erasure_registry;
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
-- An entity's whole change history, for purging its payloads.
CREATE INDEX entity_changes_entity_idx ON entity_changes (account_id, entity, entity_id);
--> statement-breakpoint
CREATE INDEX transactions_deleted_idx ON transactions (deleted_at) WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX exports_requested_idx ON exports (requested_at);
--> statement-breakpoint
CREATE INDEX jobs_finished_idx ON jobs (finished_at) WHERE status IN ('succeeded', 'superseded', 'cancelled');
--> statement-breakpoint
CREATE INDEX security_reconcile_checks_checked_idx ON security_reconcile_checks (checked_at);
--> statement-breakpoint
CREATE TABLE deletion_requests (
  request_id uuid PRIMARY KEY,
  -- The internal account id, kept after the account row is gone.
  account_id uuid NOT NULL UNIQUE,
  command_id uuid NOT NULL,
  -- The initiating device: sha256 of its binding, its principal digest and
  -- client. Only that device can learn the outcome after a lost response.
  -- Null for an erasure re-queued after a restore (no device asked).
  initiator_binding_digest bytea UNIQUE CHECK (octet_length(initiator_binding_digest) = 32),
  initiator_principal_digest bytea CHECK (octet_length(initiator_principal_digest) = 32),
  initiator_client_id text CHECK (length(initiator_client_id) BETWEEN 1 AND 255),
  requested_at timestamptz NOT NULL DEFAULT now(),
  marker_recorded_at timestamptz,
  provider_verified_at timestamptz,
  objects_swept_at timestamptz,
  purged_at timestamptz,
  CHECK ((initiator_binding_digest IS NULL) = (initiator_principal_digest IS NULL) AND (initiator_binding_digest IS NULL) = (initiator_client_id IS NULL)),
  -- Each stage only after the one before it.
  CHECK (provider_verified_at IS NULL OR marker_recorded_at IS NOT NULL),
  CHECK (objects_swept_at IS NULL OR provider_verified_at IS NOT NULL),
  CHECK (purged_at IS NULL OR objects_swept_at IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX deletion_requests_open_idx ON deletion_requests (requested_at) WHERE purged_at IS NULL;
--> statement-breakpoint
CREATE INDEX deletion_requests_purged_idx ON deletion_requests (purged_at) WHERE purged_at IS NOT NULL;
--> statement-breakpoint
ALTER TABLE deletion_requests ENABLE ROW LEVEL SECURITY;
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
--   - the request (with the initiating device's receipt) and its
--     account_deletion job (20 attempts) are recorded.
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
  INSERT INTO public.deletion_requests (request_id, account_id, command_id, initiator_binding_digest, initiator_principal_digest, initiator_client_id)
  VALUES (p_request_id, v_account, p_command_id, v_session.binding_digest, v_session.principal_digest, v_session.client_id);
  INSERT INTO public.jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts, max_runtime_seconds)
  VALUES (p_request_id, 'account_deletion', v_account, v_generation, '{}'::jsonb, 20, 900);
  RETURN 'accepted';
END
$$;
--> statement-breakpoint
-- The initiating device's answer after a lost acceptance response (its
-- binding no longer resolves): the request this binding, principal and
-- client made with this command id - 'accepted' while erasure runs,
-- 'completed' once the account's data is purged - or nothing.
CREATE FUNCTION gogospend_deletion_receipt(p_binding_digest bytea, p_issuer text, p_subject text, p_client_id text, p_command_id uuid)
  RETURNS TABLE (request_id uuid, status text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT r.request_id, CASE WHEN r.purged_at IS NULL THEN 'accepted' ELSE 'completed' END
    FROM public.deletion_requests r
   WHERE r.initiator_binding_digest = p_binding_digest
     AND r.initiator_principal_digest = public.gogospend_principal_digest(p_issuer, p_subject)
     AND r.initiator_client_id = p_client_id
     AND r.command_id = p_command_id
$$;
--> statement-breakpoint
-- The account of an account_deletion job whose lease is current and
-- unexpired, or NULL. Internal (granted to no role).
CREATE FUNCTION gogospend_deletion_lease_account(p_job_id uuid, p_lease_token uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT j.account_id FROM public.jobs j
   WHERE j.id = p_job_id AND j.kind = 'account_deletion' AND j.status = 'leased'
     AND j.lease_token = p_lease_token AND j.lease_expires_at > clock_timestamp()
$$;
--> statement-breakpoint
-- The request's progress for a current deletion lease (no row otherwise).
CREATE FUNCTION gogospend_deletion_progress(p_job_id uuid, p_lease_token uuid)
  RETURNS TABLE (request_id uuid, account_id uuid, marker_recorded_at timestamptz, provider_verified_at timestamptz, objects_swept_at timestamptz, purged_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT r.request_id, r.account_id, r.marker_recorded_at, r.provider_verified_at, r.objects_swept_at, r.purged_at
    FROM public.deletion_requests r
   WHERE r.account_id = public.gogospend_deletion_lease_account(p_job_id, p_lease_token)
$$;
--> statement-breakpoint
-- The provider aliases to mark, revoke and delete, read per lease (never
-- stored in the queue). Present until the purge.
CREATE FUNCTION gogospend_deletion_identities(p_job_id uuid, p_lease_token uuid)
  RETURNS TABLE (issuer text, subject text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT i.issuer, i.subject
    FROM public.account_identities i
   WHERE i.account_id = public.gogospend_deletion_lease_account(p_job_id, p_lease_token)
   ORDER BY i.issuer, i.subject
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
   WHERE r.account_id = v_account;
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
-- The last stage, in one transaction under the account lock and the job row:
-- with every earlier stage done, deletes the account (its private rows,
-- change log, receipts, audit rows, sessions, challenges, consents and
-- exports cascade), its other jobs, its principals' provider-event receipts,
-- reconcile checks and open challenges; keeps every alias blocked for an
-- hour past provider verification (no access token issued before the
-- provider deletion can still be valid), after which the hold lapses; then
-- marks the request purged and the job succeeded. Idempotent: an already
-- purged request just completes the job. Returns 'purged', 'not_ready' or
-- 'stale_lease'.
CREATE FUNCTION gogospend_deletion_purge(p_job_id uuid, p_lease_token uuid) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_job public.jobs%ROWTYPE;
  v_request public.deletion_requests%ROWTYPE;
  v_digests bytea[];
BEGIN
  SELECT j.* INTO v_job FROM public.jobs j WHERE j.id = p_job_id AND j.kind = 'account_deletion';
  IF NOT FOUND OR v_job.status <> 'leased' OR v_job.lease_token IS DISTINCT FROM p_lease_token OR v_job.lease_expires_at <= clock_timestamp() THEN
    RETURN 'stale_lease';
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_job.account_id FOR UPDATE;
  SELECT j.* INTO v_job FROM public.jobs j WHERE j.id = p_job_id FOR UPDATE;
  IF v_job.status <> 'leased' OR v_job.lease_token IS DISTINCT FROM p_lease_token OR v_job.lease_expires_at <= clock_timestamp() THEN
    RETURN 'stale_lease';
  END IF;
  SELECT r.* INTO v_request FROM public.deletion_requests r WHERE r.account_id = v_job.account_id FOR UPDATE;
  IF NOT FOUND OR v_request.objects_swept_at IS NULL THEN
    RETURN 'not_ready';
  END IF;
  IF v_request.purged_at IS NULL THEN
    SELECT coalesce(array_agg(public.gogospend_principal_digest(i.issuer, i.subject)), '{}'::bytea[]) INTO v_digests
      FROM public.account_identities i WHERE i.account_id = v_job.account_id;
    INSERT INTO public.blocked_principals (principal_digest, reason, blocked_until)
    SELECT d, 'deleted', greatest(now(), v_request.provider_verified_at) + interval '1 hour' FROM unnest(v_digests) AS d
    ON CONFLICT (principal_digest) DO UPDATE
       SET reason = 'deleted', pending_job_id = NULL, blocked_until = EXCLUDED.blocked_until;
    DELETE FROM public.auth_event_receipts r WHERE r.principal_digest = ANY (v_digests) OR r.account_id = v_job.account_id;
    DELETE FROM public.security_reconcile_checks c WHERE c.principal_digest = ANY (v_digests);
    DELETE FROM public.reauth_challenges c WHERE c.principal_digest = ANY (v_digests);
    DELETE FROM public.jobs j WHERE j.account_id = v_job.account_id AND j.id <> p_job_id;
    DELETE FROM public.accounts a WHERE a.id = v_job.account_id;
    UPDATE public.deletion_requests r SET purged_at = now() WHERE r.request_id = v_request.request_id;
  END IF;
  UPDATE public.jobs j
     SET status = 'succeeded', lease_token = NULL, lease_expires_at = NULL, last_error = NULL, finished_at = now(), updated_at = now()
   WHERE j.id = p_job_id;
  RETURN 'purged';
END
$$;
--> statement-breakpoint
-- For the deletion worker's alert: requests not yet purged, those older
-- than 20 hours (the 24-hour target is at risk), the oldest age, and failed
-- deletion jobs (each needs the runbook).
CREATE FUNCTION gogospend_deletion_backlog() RETURNS TABLE (open integer, overdue integer, oldest_seconds bigint, failed integer)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT (SELECT count(*)::integer FROM public.deletion_requests r WHERE r.purged_at IS NULL),
         (SELECT count(*)::integer FROM public.deletion_requests r WHERE r.purged_at IS NULL AND r.requested_at < now() - interval '20 hours'),
         (SELECT coalesce(floor(extract(epoch FROM now() - min(r.requested_at)))::bigint, 0) FROM public.deletion_requests r WHERE r.purged_at IS NULL),
         (SELECT count(*)::integer FROM public.jobs j WHERE j.kind = 'account_deletion' AND j.status = 'failed')
$$;
--> statement-breakpoint
-- Replaces entities' data with `purged` tombstones (internal; the caller
-- holds the account lock and has already deleted the domain rows). In one new
-- change group (revision) it records each live or deleted head as purged at
-- the next version, deletes every earlier change row of those entities (their
-- snapshots carried the data) and moves pruned_through over them (a cursor
-- below a group that lost rows resyncs - only possible for positions older
-- than the entities' last change), and drops snapshots built before the
-- purge (their objects become due for P1's sweep). Returns the revision, or
-- NULL when nothing was left to purge.
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
  UPDATE public.account_sync_state s SET pruned_through = greatest(s.pruned_through, coalesce(v_old, 0)) WHERE s.account_id = p_account;
  UPDATE public.object_publications o SET delete_after = least(o.delete_after, now())
    FROM public.snapshot_chunks c JOIN public.snapshot_manifests m ON m.snapshot_id = c.snapshot_id
   WHERE m.account_id = p_account AND m.high_water < v_revision AND o.key = c.object_key AND o.status = 'published';
  DELETE FROM public.snapshot_manifests m WHERE m.account_id = p_account AND m.high_water < v_revision;
  RETURN v_revision;
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
-- Purges one account in the caller's short transaction (skipped while a
-- user write holds its lock, or while the account is being erased): up to
-- 1,000 transactions deleted more than 30 days ago and up to 1,000 export
-- requests older than 30 days, each set as one purge change group. Returns
-- how many records were purged.
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
-- past expiry, and deletion holds whose stale-token window has passed.
CREATE FUNCTION gogospend_prune_security_records() RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer;
  v_total integer := 0;
BEGIN
  DELETE FROM public.auth_event_receipts r WHERE r.received_at < now() - interval '30 days' AND r.outcome <> 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;
  DELETE FROM public.security_reconcile_checks c WHERE c.checked_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;
  DELETE FROM public.reauth_challenges c WHERE c.expires_at < now() - interval '1 day';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_total := v_total + v_count;
  DELETE FROM public.blocked_principals b WHERE b.reason = 'deleted' AND b.blocked_until IS NOT NULL AND b.blocked_until < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_total + v_count;
END
$$;
--> statement-breakpoint
-- Jobs that finished (succeeded, superseded or cancelled) more than 30 days
-- ago; failed jobs stay visible for the runbook.
CREATE FUNCTION gogospend_prune_finished_jobs() RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.jobs j
   WHERE j.status IN ('succeeded', 'superseded', 'cancelled') AND j.finished_at < now() - interval '30 days'
     AND NOT EXISTS (SELECT 1 FROM public.blocked_principals b WHERE b.pending_job_id = j.id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- Completed deletion requests 30 days after the purge (the initiating
-- device's receipt window); the registry marker is the lasting record.
CREATE FUNCTION gogospend_prune_deletion_requests() RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.deletion_requests r WHERE r.purged_at < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- S1's prune (0010), now also deleting superseded changes at or below the
-- old retention line: a change that was an entity's head when an earlier
-- run passed it, and was superseded later, is removed once its successor is
-- past the cutoff. Otherwise unchanged.
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
     AND NOT EXISTS (SELECT 1 FROM public.entity_heads h
                      WHERE h.account_id = c.account_id AND h.entity = c.entity AND h.entity_id = c.entity_id AND h.revision = c.revision);
  UPDATE public.account_sync_state s SET pruned_through = v_cut WHERE s.account_id = p_account;
  RETURN true;
END
$$;
--> statement-breakpoint
-- For P6a's restore (run by the restore operator, the database owner, on the
-- private copy; granted to no role): re-queues the whole erasure of an
-- account a marker names (or that holds a marked alias) instead of deleting
-- its rows by hand, so provider cleanup - revoke grants, delete and verify
-- the Auth0 user, harmless when already done - and the object sweep run
-- again before the purge. Under the account lock it applies a deletion
-- request's transition (deleting, both generations moved, bindings revoked,
-- every alias held, open jobs cancelled), resets the request's stages
-- (each is idempotent) and makes sure one account_deletion job is open:
-- 'requeued', 'running' (one already was) or 'absent' (no such account).
CREATE FUNCTION gogospend_reapply_erasure(p_account uuid, p_job_id uuid) RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_generation integer;
BEGIN
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = p_account FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'absent';
  END IF;
  UPDATE public.accounts a
     SET status = 'deleting',
         session_generation = a.session_generation + 1,
         lifecycle_generation = a.lifecycle_generation + 1,
         reauth_after = greatest(coalesce(a.reauth_after, '-infinity'::timestamptz), date_trunc('second', clock_timestamp()) + interval '1 second')
   WHERE a.id = p_account
  RETURNING a.lifecycle_generation INTO v_generation;
  UPDATE public.auth_sessions s SET revoked_at = now() WHERE s.account_id = p_account AND s.revoked_at IS NULL;
  INSERT INTO public.blocked_principals (principal_digest, reason)
  SELECT public.gogospend_principal_digest(i.issuer, i.subject), 'deleted'
    FROM public.account_identities i WHERE i.account_id = p_account
  ON CONFLICT (principal_digest) DO UPDATE SET reason = 'deleted', pending_job_id = NULL, blocked_until = NULL;
  UPDATE public.jobs j
     SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, finished_at = now(), updated_at = now()
   WHERE j.account_id = p_account AND j.status IN ('queued', 'leased')
     AND j.kind <> ALL (ARRAY['auth0_revoke_grants', 'auth0_security_reconcile', 'auth0_link_identities', 'account_deletion']);
  INSERT INTO public.deletion_requests (request_id, account_id, command_id)
  VALUES (p_job_id, p_account, p_job_id)
  ON CONFLICT (account_id) DO UPDATE
     SET marker_recorded_at = NULL, provider_verified_at = NULL, objects_swept_at = NULL, purged_at = NULL;
  IF EXISTS (SELECT 1 FROM public.jobs j WHERE j.account_id = p_account AND j.kind = 'account_deletion' AND j.status IN ('queued', 'leased')) THEN
    RETURN 'running';
  END IF;
  UPDATE public.jobs j
     SET status = 'queued', attempts = 0, run_after = now(), last_error = NULL, finished_at = NULL, updated_at = now()
   WHERE j.id = (SELECT f.id FROM public.jobs f WHERE f.account_id = p_account AND f.kind = 'account_deletion' AND f.status = 'failed'
                  ORDER BY f.created_at DESC LIMIT 1);
  IF NOT FOUND THEN
    INSERT INTO public.jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts, max_runtime_seconds)
    VALUES (p_job_id, 'account_deletion', p_account, v_generation, '{}'::jsonb, 20, 900);
  END IF;
  RETURN 'requeued';
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_request_deletion(uuid, uuid, uuid), gogospend_deletion_receipt(bytea, text, text, text, uuid),
  gogospend_deletion_lease_account(uuid, uuid), gogospend_deletion_progress(uuid, uuid), gogospend_deletion_identities(uuid, uuid),
  gogospend_deletion_client_ids(uuid, uuid), gogospend_deletion_mark(uuid, uuid, text), gogospend_deletion_objects(uuid, uuid),
  gogospend_deletion_purge(uuid, uuid), gogospend_deletion_backlog(), gogospend_purge_entities(uuid, text, uuid[]),
  gogospend_retention_purge_candidates(uuid, integer), gogospend_retention_purge_account(uuid), gogospend_drop_receipt_digests(integer),
  gogospend_prune_security_records(), gogospend_prune_finished_jobs(), gogospend_prune_deletion_requests(), gogospend_reapply_erasure(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_request_deletion(uuid, uuid, uuid) TO gogospend_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_deletion_receipt(bytea, text, text, text, uuid) TO gogospend_bootstrap;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_deletion_progress(uuid, uuid), gogospend_deletion_identities(uuid, uuid), gogospend_deletion_client_ids(uuid, uuid),
  gogospend_deletion_mark(uuid, uuid, text), gogospend_deletion_objects(uuid, uuid), gogospend_deletion_purge(uuid, uuid), gogospend_deletion_backlog() TO gogospend_security;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_retention_purge_candidates(uuid, integer), gogospend_retention_purge_account(uuid), gogospend_drop_receipt_digests(integer),
  gogospend_prune_security_records(), gogospend_prune_finished_jobs(), gogospend_prune_deletion_requests() TO gogospend_jobs;
