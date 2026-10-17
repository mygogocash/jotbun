-- S1: ordered deltas and immutable snapshots.
--   account_sync_state.pruned_through - change groups at or below this
--                         revision may be incomplete (retention removed
--                         rows); a delta cursor below it must resync.
--   snapshot_manifests / snapshot_chunks - a completed snapshot: one
--                         consistent view at high_water, its published chunk
--                         objects (internal keys, never returned to clients)
--                         and a 24-hour expiry. Written only by
--                         gogospend_record_snapshot inside the worker's
--                         publish-and-complete transaction; read by the owner.
-- Retention keeps every entity's head change row (the latest snapshot),
-- since snapshots are built from heads; only superseded changes go.
ALTER TABLE account_sync_state ADD COLUMN pruned_through bigint NOT NULL DEFAULT 0 CHECK (pruned_through >= 0);
--> statement-breakpoint
CREATE INDEX entity_changes_committed_idx ON entity_changes (account_id, committed_at);
--> statement-breakpoint
CREATE TABLE snapshot_manifests (
  snapshot_id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  lifecycle_generation integer NOT NULL CHECK (lifecycle_generation >= 0),
  high_water bigint NOT NULL CHECK (high_water >= 0),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  chunk_count integer NOT NULL CHECK (chunk_count BETWEEN 1 AND 10000),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '25 hours')
);
--> statement-breakpoint
CREATE INDEX snapshot_manifests_account_idx ON snapshot_manifests (account_id, created_at);
--> statement-breakpoint
CREATE TABLE snapshot_chunks (
  snapshot_id uuid NOT NULL REFERENCES snapshot_manifests (snapshot_id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index BETWEEN 0 AND 9999),
  object_key text NOT NULL UNIQUE,
  bytes bigint NOT NULL CHECK (bytes >= 0),
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  PRIMARY KEY (snapshot_id, chunk_index)
);
--> statement-breakpoint
ALTER TABLE snapshot_manifests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE snapshot_chunks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY snapshot_manifests_owner ON snapshot_manifests FOR SELECT TO gogospend_app
  USING (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY snapshot_chunks_owner ON snapshot_chunks FOR SELECT TO gogospend_app
  USING (account_id = gogospend_current_account());
--> statement-breakpoint
GRANT SELECT ON snapshot_manifests, snapshot_chunks TO gogospend_app;
--> statement-breakpoint
-- The owner asks for a snapshot. Under the account lock, in order: a retry
-- of the same request (p_job_id, which the API derives from the account and
-- the idempotency key) returns its job; a snapshot completed in the last hour
-- is reused (it plus later deltas is current); an open build is reused (one
-- at a time); otherwise p_job_id is queued. Returns the snapshot/job id.
CREATE FUNCTION gogospend_request_snapshot(p_job_id uuid) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_generation integer;
  v_open uuid;
  v_owner uuid;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'requesting a snapshot needs an owner transaction';
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  SELECT a.lifecycle_generation INTO v_generation FROM public.accounts a WHERE a.id = v_account AND a.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'the account is not active' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT j.account_id INTO v_owner FROM public.jobs j WHERE j.id = p_job_id;
  IF FOUND THEN
    IF v_owner IS DISTINCT FROM v_account THEN
      RAISE EXCEPTION 'snapshot request id conflict' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN p_job_id;
  END IF;
  SELECT m.snapshot_id INTO v_open FROM public.snapshot_manifests m
   WHERE m.account_id = v_account AND m.lifecycle_generation = v_generation
     AND m.created_at > now() - interval '1 hour' AND m.expires_at > now() + interval '23 hours'
   ORDER BY m.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN v_open;
  END IF;
  SELECT j.id INTO v_open FROM public.jobs j
   WHERE j.account_id = v_account AND j.kind = 'sync_snapshot' AND j.status IN ('queued', 'leased')
   ORDER BY j.created_at LIMIT 1;
  IF FOUND THEN
    RETURN v_open;
  END IF;
  INSERT INTO public.jobs (id, kind, account_id, lifecycle_generation, payload, max_attempts, max_runtime_seconds)
  VALUES (p_job_id, 'sync_snapshot', v_account, v_generation, '{}'::jsonb, 3, 600);
  RETURN p_job_id;
END
$$;
--> statement-breakpoint
-- The owner's snapshot job state: 'queued' | 'leased' | 'succeeded' |
-- 'failed' | 'cancelled' | ..., or NULL when there is no such job for them.
CREATE FUNCTION gogospend_snapshot_job_status(p_job_id uuid) RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
  SELECT j.status FROM public.jobs j
   WHERE j.id = p_job_id AND j.kind = 'sync_snapshot' AND j.account_id = public.gogospend_current_account()
$$;
--> statement-breakpoint
-- Called by the snapshot worker inside its publish-and-complete transaction,
-- after gogospend_lock_current_job: records the manifest of a current lease's
-- sync_snapshot job. Every chunk must be an object this lease has published
-- with the same size and digest. False when anything does not hold.
CREATE FUNCTION gogospend_record_snapshot(p_job_id uuid, p_lease_token uuid, p_high_water bigint, p_chunks jsonb, p_expires_at timestamptz) RETURNS boolean
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
  IF jsonb_typeof(p_chunks) <> 'array' OR p_high_water > (SELECT s.revision FROM public.account_sync_state s WHERE s.account_id = v_job.account_id) THEN
    RETURN false;
  END IF;
  v_count := jsonb_array_length(p_chunks);
  SELECT count(*) INTO v_matched
    FROM jsonb_array_elements(p_chunks) WITH ORDINALITY AS c(value, ordinal)
    JOIN public.object_publications o ON o.key = c.value ->> 'key'
   WHERE o.job_id = p_job_id AND o.lease_token = p_lease_token AND o.account_id = v_job.account_id
     AND o.purpose = 'sync_snapshot' AND o.status = 'published'
     AND o.bytes = (c.value ->> 'bytes')::bigint AND o.sha256 = decode(c.value ->> 'sha256', 'hex')
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
-- Retention (the worker's maintenance loop). For up to p_max_accounts
-- accounts with changes committed before p_before, under each account lock:
-- deletes those changes except each entity's head change row, and moves
-- pruned_through to the last pruned revision. Also drops manifests a week
-- past their expiry. Returns the number of accounts pruned.
CREATE FUNCTION gogospend_prune_changes(p_before timestamptz, p_max_accounts integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_cut bigint;
  v_done integer := 0;
BEGIN
  IF p_before > now() - interval '1 day' OR p_max_accounts NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'retention cutoff must be at least a day old, and 1-10000 accounts per call';
  END IF;
  FOR v_account IN
    SELECT s.account_id FROM public.account_sync_state s
     WHERE EXISTS (SELECT 1 FROM public.entity_changes c
                    WHERE c.account_id = s.account_id AND c.committed_at < p_before AND c.revision > s.pruned_through)
     LIMIT p_max_accounts
  LOOP
    PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
    SELECT max(c.revision) INTO v_cut FROM public.entity_changes c WHERE c.account_id = v_account AND c.committed_at < p_before;
    DELETE FROM public.entity_changes c
     WHERE c.account_id = v_account AND c.revision <= v_cut
       AND NOT EXISTS (SELECT 1 FROM public.entity_heads h
                        WHERE h.account_id = c.account_id AND h.entity = c.entity AND h.entity_id = c.entity_id AND h.revision = c.revision);
    UPDATE public.account_sync_state s SET pruned_through = greatest(s.pruned_through, v_cut) WHERE s.account_id = v_account;
    v_done := v_done + 1;
  END LOOP;
  DELETE FROM public.snapshot_manifests m WHERE m.expires_at < now() - interval '7 days';
  RETURN v_done;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_request_snapshot(uuid), gogospend_snapshot_job_status(uuid),
  gogospend_record_snapshot(uuid, uuid, bigint, jsonb, timestamptz), gogospend_prune_changes(timestamptz, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_request_snapshot(uuid), gogospend_snapshot_job_status(uuid) TO gogospend_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_record_snapshot(uuid, uuid, bigint, jsonb, timestamptz), gogospend_prune_changes(timestamptz, integer) TO gogospend_jobs;
