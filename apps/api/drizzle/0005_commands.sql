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
  entity text NOT NULL CHECK (entity ~ '^[a-z][a-z0-9_]{0,63}$'),
  entity_id uuid NOT NULL,
  entity_version integer NOT NULL CHECK (entity_version >= 1),
  outcome text NOT NULL CHECK (outcome IN ('created', 'updated', 'deleted', 'restored', 'archived', 'unarchived', 'accepted')),
  entity_state text NOT NULL CHECK (entity_state IN ('active', 'deleted', 'purged')),
  revision bigint NOT NULL CHECK (revision >= 1),
  committed_at timestamptz NOT NULL DEFAULT now(),
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
  committed_at timestamptz NOT NULL DEFAULT now(),
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
  created_at timestamptz NOT NULL DEFAULT now(),
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
-- Append-only for the app: receipts, changes and audit rows are never updated
-- or deleted by requests. Heads move forward only (see ChangeWriter). The app
-- cannot read audit rows back.
GRANT SELECT, INSERT ON command_receipts, entity_changes, entity_heads TO gogospend_app;
--> statement-breakpoint
GRANT UPDATE (version, state, revision) ON entity_heads TO gogospend_app;
--> statement-breakpoint
GRANT INSERT ON audit_events TO gogospend_app;
