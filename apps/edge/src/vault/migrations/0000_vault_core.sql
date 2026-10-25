-- The vault's core schema: one person's ledger, in one Durable Object's SQLite.
-- Ported from apps/api/drizzle 0005 (commands), 0006 (wallets, categories),
-- 0007 (transactions), 0008 (budgets), 0010 (sync) and the receipt-digest change
-- in 0015, without account_id: a vault holds one account. PostgreSQL-only rules
-- become CHECKs and BEFORE or AFTER triggers. Control-character checks are
-- dropped, because the contracts validate them. Dates are ISO 8601 TEXT,
-- booleans are 0 or 1, and timestamps have no default: a command binds them
-- from the call's clock.
--
-- Every table is STRICT: SQLite checks each value against its column's type,
-- and it refuses a NULL primary key (table_info reports that column as NOT NULL).
--
-- Sync and history: command_receipts, entity_changes, entity_heads and
-- audit_events are the command protocol's rows (committed under one revision,
-- sync_state.revision). The new tables hold the vault's own state: its account
-- status, the revision and retention line, revoked sessions, consents and the
-- alarm schedule.

CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  pruned_through INTEGER NOT NULL DEFAULT 0 CHECK (pruned_through >= 0),
  -- Change groups at or below pruned_through may be incomplete; a delta cursor below it resyncs.
  CHECK (pruned_through <= revision)
) STRICT;
--> statement-breakpoint
CREATE TABLE account_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  account_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'deleting', 'deleted')),
  -- Epoch seconds, checked against each token's not-before at every command.
  not_before INTEGER NOT NULL DEFAULT 0 CHECK (not_before >= 0),
  created_at TEXT NOT NULL
) STRICT;
--> statement-breakpoint
CREATE TABLE revoked_sessions (
  session_id TEXT PRIMARY KEY,
  revoked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;
--> statement-breakpoint
CREATE TABLE consents (
  kind TEXT NOT NULL CHECK (kind IN ('terms', 'privacy', 'analytics')),
  version INTEGER NOT NULL,
  granted INTEGER NOT NULL CHECK (granted IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, version),
  CHECK ((kind = 'analytics' AND version = 0) OR (kind <> 'analytics' AND version >= 1 AND granted = 1))
) STRICT;
--> statement-breakpoint
CREATE TABLE schedule (
  job TEXT PRIMARY KEY,
  due_at INTEGER NOT NULL CHECK (due_at >= 0)
) STRICT;
--> statement-breakpoint
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  builtin_key TEXT UNIQUE CHECK (builtin_key IN ('food', 'travel', 'household', 'bills', 'shopping', 'fun', 'salary', 'bonus', 'side_job', 'gift')),
  label TEXT CHECK (label IS NULL OR (length(label) BETWEEN 1 AND 80 AND label = trim(label))),
  color TEXT CHECK (color IS NULL OR color GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (label IS NOT NULL OR builtin_key IS NOT NULL),
  CHECK (builtin_key IS NULL OR type = CASE WHEN builtin_key IN ('salary', 'bonus', 'side_job', 'gift') THEN 'income' ELSE 'expense' END)
) STRICT;
--> statement-breakpoint
-- A category's type and built-in key are fixed once it exists. The API froze
-- them through a composite foreign key and column grants. The triggers on
-- transactions and budget_category_limits check the referencing side; these
-- check the category itself, so a category in use cannot change type.
CREATE TRIGGER categories_type_immutable BEFORE UPDATE OF type ON categories
  WHEN NEW.type IS NOT OLD.type
BEGIN
  SELECT RAISE(ABORT, 'category type is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER categories_builtin_key_immutable BEFORE UPDATE OF builtin_key ON categories
  WHEN NEW.builtin_key IS NOT OLD.builtin_key
BEGIN
  SELECT RAISE(ABORT, 'category builtin_key is immutable');
END;
--> statement-breakpoint
-- A category's id never changes, and a category is never deleted: the API archives.
CREATE TRIGGER categories_id_immutable BEFORE UPDATE OF id ON categories
  WHEN NEW.id IS NOT OLD.id
BEGIN
  SELECT RAISE(ABORT, 'category id is immutable');
END;
--> statement-breakpoint
-- INSERT OR REPLACE deletes the row it replaces without firing an UPDATE trigger,
-- so an insert over a category whose type or built-in key differs is refused here.
-- An identical row passes, so ON CONFLICT DO NOTHING seeding still works.
CREATE TRIGGER categories_replace_guard BEFORE INSERT ON categories
  WHEN EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.id AND (c.type IS NOT NEW.type OR c.builtin_key IS NOT NEW.builtin_key))
BEGIN
  SELECT RAISE(ABORT, 'a category in use cannot be replaced with another type or built-in key');
END;
--> statement-breakpoint
CREATE TRIGGER categories_never_deleted BEFORE DELETE ON categories
BEGIN
  SELECT RAISE(ABORT, 'categories are archived, never deleted');
END;
--> statement-breakpoint
CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80 AND name = trim(name)),
  currency TEXT NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  opening_minor INTEGER NOT NULL CHECK (opening_minor BETWEEN 0 AND 99999999999),
  tracking_start TEXT NOT NULL CHECK (date(tracking_start) IS tracking_start AND tracking_start >= '1970-01-01'),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
--> statement-breakpoint
-- One row per expense, income or transfer. A transfer is one row between two
-- wallets, so it can never be half-written. The category's type must match the
-- transaction's (triggers below), as the API's composite key enforced.
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 99999999999),
  occurred_on TEXT NOT NULL CHECK (date(occurred_on) IS occurred_on AND occurred_on >= '1970-01-01'),
  wallet_id TEXT REFERENCES wallets (id),
  category_id TEXT REFERENCES categories (id),
  source_wallet_id TEXT REFERENCES wallets (id),
  destination_wallet_id TEXT REFERENCES wallets (id),
  note TEXT CHECK (note IS NULL OR (length(note) BETWEEN 1 AND 500 AND note = trim(note))),
  merchant TEXT CHECK (merchant IS NULL OR (length(merchant) BETWEEN 1 AND 120 AND merchant = trim(merchant))),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (type <> 'transfer' AND wallet_id IS NOT NULL AND category_id IS NOT NULL
      AND source_wallet_id IS NULL AND destination_wallet_id IS NULL)
    OR (type = 'transfer' AND wallet_id IS NULL AND category_id IS NULL
      AND source_wallet_id IS NOT NULL AND destination_wallet_id IS NOT NULL
      AND source_wallet_id <> destination_wallet_id)
  )
) STRICT;
--> statement-breakpoint
CREATE INDEX transactions_wallet_idx ON transactions (wallet_id) WHERE deleted_at IS NULL AND wallet_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX transactions_source_idx ON transactions (source_wallet_id) WHERE deleted_at IS NULL AND source_wallet_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX transactions_destination_idx ON transactions (destination_wallet_id) WHERE deleted_at IS NULL AND destination_wallet_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX transactions_history_idx ON transactions (occurred_on, id) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX transactions_category_idx ON transactions (category_id) WHERE category_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER transactions_category_type_insert BEFORE INSERT ON transactions
  WHEN EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.type IS NOT NEW.type)
BEGIN
  SELECT RAISE(ABORT, 'a transaction must name a category of its own type');
END;
--> statement-breakpoint
CREATE TRIGGER transactions_category_type_update BEFORE UPDATE OF type, category_id ON transactions
  WHEN EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.type IS NOT NEW.type)
BEGIN
  SELECT RAISE(ABORT, 'a transaction must name a category of its own type');
END;
--> statement-breakpoint
CREATE TABLE monthly_budgets (
  month TEXT PRIMARY KEY CHECK (date(month) IS month AND substr(month, 9, 2) = '01' AND month >= '1970-01-01'),
  id TEXT NOT NULL UNIQUE,
  overall_limit_minor INTEGER NOT NULL CHECK (overall_limit_minor BETWEEN 1 AND 99999999999),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
--> statement-breakpoint
-- Expense categories only, and their sublimits never add up to more than the
-- month's overall limit. The sum is checked after each change that can break
-- it; removing a sublimit can never break it, so deletes are not checked.
CREATE TABLE budget_category_limits (
  month TEXT NOT NULL REFERENCES monthly_budgets (month) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories (id),
  limit_minor INTEGER NOT NULL CHECK (limit_minor BETWEEN 1 AND 99999999999),
  PRIMARY KEY (month, category_id)
) STRICT;
--> statement-breakpoint
CREATE TRIGGER budget_category_limits_expense_insert BEFORE INSERT ON budget_category_limits
  WHEN EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.type <> 'expense')
BEGIN
  SELECT RAISE(ABORT, 'a budget sublimit must name an expense category');
END;
--> statement-breakpoint
CREATE TRIGGER budget_category_limits_expense_update BEFORE UPDATE OF category_id ON budget_category_limits
  WHEN EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.type <> 'expense')
BEGIN
  SELECT RAISE(ABORT, 'a budget sublimit must name an expense category');
END;
--> statement-breakpoint
CREATE TRIGGER budget_limits_within_overall_insert AFTER INSERT ON budget_category_limits
BEGIN
  SELECT RAISE(ABORT, 'category sublimits exceed the overall budget')
   WHERE (SELECT coalesce(sum(limit_minor), 0) FROM budget_category_limits WHERE month = NEW.month)
      > (SELECT overall_limit_minor FROM monthly_budgets WHERE month = NEW.month);
END;
--> statement-breakpoint
CREATE TRIGGER budget_limits_within_overall_update AFTER UPDATE ON budget_category_limits
BEGIN
  SELECT RAISE(ABORT, 'category sublimits exceed the overall budget')
   WHERE (SELECT coalesce(sum(limit_minor), 0) FROM budget_category_limits WHERE month = NEW.month)
      > (SELECT overall_limit_minor FROM monthly_budgets WHERE month = NEW.month);
END;
--> statement-breakpoint
CREATE TRIGGER monthly_budgets_covers_limits AFTER UPDATE OF overall_limit_minor ON monthly_budgets
BEGIN
  SELECT RAISE(ABORT, 'category sublimits exceed the overall budget')
   WHERE (SELECT coalesce(sum(limit_minor), 0) FROM budget_category_limits WHERE month = NEW.month) > NEW.overall_limit_minor;
END;
--> statement-breakpoint
-- The command protocol. Each command's rows are written under the current
-- revision (sync_state), allocated inside the command's transaction, so commit
-- order is revision order and a stray row cannot occupy the next revision.
CREATE TABLE command_receipts (
  command_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 64 AND kind GLOB '[a-z]*' AND kind NOT GLOB '*[^a-z0-9_.]*'),
  schema_version INTEGER NOT NULL CHECK (schema_version BETWEEN 1 AND 10000),
  -- The request digest and its key id drop together after the outbox lifetime:
  -- a receipt without them never matches a replay (409 IDEMPOTENCY_MISMATCH),
  -- and its status still answers.
  request_digest BLOB CHECK (request_digest IS NULL OR length(request_digest) = 32),
  digest_key_id TEXT CHECK (digest_key_id IS NULL OR (length(digest_key_id) BETWEEN 1 AND 16 AND digest_key_id NOT GLOB '*[^a-z0-9]*')),
  entity TEXT NOT NULL CHECK (length(entity) BETWEEN 1 AND 64 AND entity GLOB '[a-z]*' AND entity NOT GLOB '*[^a-z0-9_]*'),
  entity_id TEXT NOT NULL,
  entity_version INTEGER NOT NULL CHECK (entity_version >= 1),
  outcome TEXT NOT NULL CHECK (outcome IN ('created', 'updated', 'deleted', 'restored', 'archived', 'unarchived', 'accepted')),
  entity_state TEXT NOT NULL CHECK (entity_state IN ('active', 'deleted', 'purged')),
  revision INTEGER NOT NULL UNIQUE CHECK (revision >= 1),
  committed_at TEXT NOT NULL,
  CONSTRAINT command_receipts_digest_pair_check CHECK ((request_digest IS NULL) = (digest_key_id IS NULL))
) STRICT;
--> statement-breakpoint
CREATE INDEX command_receipts_digest_age_idx ON command_receipts (committed_at) WHERE request_digest IS NOT NULL;
--> statement-breakpoint
CREATE TABLE entity_changes (
  revision INTEGER NOT NULL CHECK (revision >= 1),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 0 AND 9999),
  command_id TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (length(entity) BETWEEN 1 AND 64 AND entity GLOB '[a-z]*' AND entity NOT GLOB '*[^a-z0-9_]*'),
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  state TEXT NOT NULL CHECK (state IN ('active', 'deleted', 'purged')),
  snapshot TEXT CHECK (snapshot IS NULL OR json_valid(snapshot)),
  committed_at TEXT NOT NULL,
  -- The serialized size of the whole group, on its first change, so delta pages are chosen by byte budget.
  group_bytes INTEGER CHECK (group_bytes IS NULL OR (ordinal = 0 AND group_bytes > 0)),
  PRIMARY KEY (revision, ordinal),
  CHECK ((state = 'purged') = (snapshot IS NULL))
) STRICT;
--> statement-breakpoint
CREATE INDEX entity_changes_groups_idx ON entity_changes (revision) WHERE ordinal = 0;
--> statement-breakpoint
CREATE TABLE entity_heads (
  entity TEXT NOT NULL CHECK (length(entity) BETWEEN 1 AND 64 AND entity GLOB '[a-z]*' AND entity NOT GLOB '*[^a-z0-9_]*'),
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  state TEXT NOT NULL CHECK (state IN ('active', 'deleted', 'purged')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  PRIMARY KEY (entity, entity_id)
) STRICT;
--> statement-breakpoint
CREATE TABLE audit_events (
  revision INTEGER PRIMARY KEY CHECK (revision >= 1),
  command_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 64 AND kind GLOB '[a-z]*' AND kind NOT GLOB '*[^a-z0-9_.]*'),
  session_id TEXT NOT NULL,
  client_id TEXT NOT NULL CHECK (length(client_id) BETWEEN 1 AND 255),
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata) AND json_type(metadata) = 'object'),
  created_at TEXT NOT NULL
) STRICT;
--> statement-breakpoint
CREATE TRIGGER command_receipts_current_revision BEFORE INSERT ON command_receipts
  WHEN NEW.revision IS NOT (SELECT revision FROM sync_state WHERE id = 1)
BEGIN
  SELECT RAISE(ABORT, 'command log rows must use the current revision');
END;
--> statement-breakpoint
CREATE TRIGGER entity_changes_current_revision BEFORE INSERT ON entity_changes
  WHEN NEW.revision IS NOT (SELECT revision FROM sync_state WHERE id = 1)
BEGIN
  SELECT RAISE(ABORT, 'command log rows must use the current revision');
END;
--> statement-breakpoint
CREATE TRIGGER audit_events_current_revision BEFORE INSERT ON audit_events
  WHEN NEW.revision IS NOT (SELECT revision FROM sync_state WHERE id = 1)
BEGIN
  SELECT RAISE(ABORT, 'command log rows must use the current revision');
END;
--> statement-breakpoint
-- A head is the entity's latest version and state. It starts at version 1 and
-- active, then only moves forward, and never leaves purged.
CREATE TRIGGER entity_heads_current_revision_insert BEFORE INSERT ON entity_heads
  WHEN NEW.revision IS NOT (SELECT revision FROM sync_state WHERE id = 1)
BEGIN
  SELECT RAISE(ABORT, 'entity heads must use the current revision');
END;
--> statement-breakpoint
CREATE TRIGGER entity_heads_current_revision_update BEFORE UPDATE ON entity_heads
  WHEN NEW.revision IS NOT (SELECT revision FROM sync_state WHERE id = 1)
BEGIN
  SELECT RAISE(ABORT, 'entity heads must use the current revision');
END;
--> statement-breakpoint
CREATE TRIGGER entity_heads_new_entity BEFORE INSERT ON entity_heads
  WHEN (NEW.version <> 1 OR NEW.state <> 'active')
   AND NOT EXISTS (SELECT 1 FROM entity_heads h WHERE h.entity = NEW.entity AND h.entity_id = NEW.entity_id)
BEGIN
  SELECT RAISE(ABORT, 'a new entity starts at version 1 and active');
END;
--> statement-breakpoint
CREATE TRIGGER entity_heads_forward BEFORE UPDATE ON entity_heads
  WHEN OLD.state = 'purged' OR NEW.version <= OLD.version OR NEW.revision < OLD.revision
   OR NEW.entity IS NOT OLD.entity OR NEW.entity_id IS NOT OLD.entity_id
BEGIN
  SELECT RAISE(ABORT, 'entity heads only move forward and never leave purged');
END;
