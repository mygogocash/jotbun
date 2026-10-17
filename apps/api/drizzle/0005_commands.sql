-- M1: the common command protocol.
--   command_receipts - one per (account, command id): the idempotency record
--                      and compact acknowledgement. A salted request digest,
--                      never amounts, notes, names or DTOs.
--   entity_changes   - the committed change log: one group (one revision) per
--                      command, in commit order. Snapshots are the only
--                      entity data here (sync; 30-day retention, purged by P5).
--   entity_heads     - each entity's latest version/state, so status lookups
--                      and edits see deleted/purged without reconstructing data.
--   audit_events     - who committed what from which session; short codes only.
-- Revisions are allocated only under the account lock (account_sync_state),
-- so commit order equals revision order.
CREATE TABLE command_receipts (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_.]{0,63}$'),
  schema_version integer NOT NULL CHECK (schema_version BETWEEN 1 AND 10000),
  request_digest bytea NOT NULL CHECK (octet_length(request_digest) = 32),
  digest_key_id text NOT NULL CHECK (digest_key_id ~ '^[a-z0-9]{1,16}$'),
  entity text NOT NULL CHECK (entity ~ '^[a-z][a-z0-9_]{0,63}$'),
  entity_id uuid NOT NULL,
  entity_version integer NOT NULL CHECK (entity_version >= 1),
  outcome text NOT NULL CHECK (outcome IN ('created', 'updated', 'deleted', 'restored', 'archived', 'unarchived', 'accepted')),
  entity_state text NOT NULL CHECK (entity_state IN ('active', 'deleted', 'purged')),
  revision bigint NOT NULL CHECK (revision >= 1),
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, command_id),
  UNIQUE (account_id, revision)
);
--> statement-breakpoint
CREATE TABLE entity_changes (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK (revision >= 1),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 9999),
  command_id uuid NOT NULL,
  entity text NOT NULL CHECK (entity ~ '^[a-z][a-z0-9_]{0,63}$'),
  entity_id uuid NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  state text NOT NULL CHECK (state IN ('active', 'deleted', 'purged')),
  snapshot jsonb,
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, revision, ordinal),
  CHECK ((state = 'purged') = (snapshot IS NULL))
);
--> statement-breakpoint
CREATE TABLE entity_heads (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  entity text NOT NULL CHECK (entity ~ '^[a-z][a-z0-9_]{0,63}$'),
  entity_id uuid NOT NULL,
  version integer NOT NULL CHECK (version >= 1),
  state text NOT NULL CHECK (state IN ('active', 'deleted', 'purged')),
  revision bigint NOT NULL CHECK (revision >= 1),
  PRIMARY KEY (account_id, entity, entity_id)
);
--> statement-breakpoint
CREATE TABLE audit_events (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK (revision >= 1),
  command_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9_.]{0,63}$'),
  session_id uuid NOT NULL,
  client_id text NOT NULL CHECK (length(client_id) BETWEEN 1 AND 255),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id, revision)
);
--> statement-breakpoint
ALTER TABLE command_receipts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE entity_changes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE entity_heads ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY command_receipts_owner ON command_receipts TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY entity_changes_owner ON entity_changes TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY entity_heads_owner ON entity_heads TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY audit_events_owner ON audit_events FOR INSERT TO gogospend_app
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
-- Defence in depth, whatever writes these tables: change, receipt, audit and
-- head rows land only at the account's current revision (allocated under the
-- account lock), so a stray row can never occupy the next revision and wedge
-- the account. Heads start at version 1 and active, then only move forward
-- and never leave 'purged'.
CREATE FUNCTION gogospend_guard_current_revision() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.revision IS DISTINCT FROM (SELECT s.revision FROM public.account_sync_state s WHERE s.account_id = NEW.account_id) THEN
    RAISE EXCEPTION 'command log rows must use the account''s current revision' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE FUNCTION gogospend_guard_entity_head() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.revision IS DISTINCT FROM (SELECT s.revision FROM public.account_sync_state s WHERE s.account_id = NEW.account_id) THEN
    RAISE EXCEPTION 'entity heads must use the account''s current revision' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- An upsert of an existing head also fires this; it continues as an UPDATE.
    IF (NEW.version <> 1 OR NEW.state <> 'active')
       AND NOT EXISTS (SELECT 1 FROM public.entity_heads h
                        WHERE h.account_id = NEW.account_id AND h.entity = NEW.entity AND h.entity_id = NEW.entity_id) THEN
      RAISE EXCEPTION 'a new entity starts at version 1 and active' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.state = 'purged' OR NEW.version <= OLD.version OR NEW.revision < OLD.revision
     OR (NEW.account_id, NEW.entity, NEW.entity_id) IS DISTINCT FROM (OLD.account_id, OLD.entity, OLD.entity_id) THEN
    RAISE EXCEPTION 'entity heads only move forward and never leave purged' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER command_receipts_current_revision BEFORE INSERT ON command_receipts
  FOR EACH ROW EXECUTE FUNCTION gogospend_guard_current_revision();
--> statement-breakpoint
CREATE TRIGGER entity_changes_current_revision BEFORE INSERT ON entity_changes
  FOR EACH ROW EXECUTE FUNCTION gogospend_guard_current_revision();
--> statement-breakpoint
CREATE TRIGGER audit_events_current_revision BEFORE INSERT ON audit_events
  FOR EACH ROW EXECUTE FUNCTION gogospend_guard_current_revision();
--> statement-breakpoint
CREATE TRIGGER entity_heads_forward BEFORE INSERT OR UPDATE ON entity_heads
  FOR EACH ROW EXECUTE FUNCTION gogospend_guard_entity_head();
--> statement-breakpoint
-- Append-only for the app: receipts, changes and audit rows are never updated
-- or deleted by requests. The app cannot read audit rows back.
GRANT SELECT, INSERT ON command_receipts, entity_changes, entity_heads TO gogospend_app;
--> statement-breakpoint
GRANT UPDATE (version, state, revision) ON entity_heads TO gogospend_app;
--> statement-breakpoint
GRANT INSERT ON audit_events TO gogospend_app;
