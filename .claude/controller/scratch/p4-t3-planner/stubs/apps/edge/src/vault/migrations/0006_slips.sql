-- RED stub (P4-T3): the six slip tables with their columns and keys only, and no rule, index
-- or transactions column yet, so every case reads a table and fails on an assertion. GREEN
-- replaces this file with the migration.
CREATE TABLE slip_salt (id INTEGER PRIMARY KEY, salt BLOB, created_at TEXT);
--> statement-breakpoint
CREATE TABLE slip_accounts (id TEXT PRIMARY KEY, version INTEGER, bank TEXT, account_last4 TEXT, wallet_id TEXT, created_at TEXT, updated_at TEXT);
--> statement-breakpoint
CREATE TABLE slip_refs (id TEXT PRIMARY KEY, ref_hash TEXT, state TEXT, transaction_id TEXT, first_seen_at TEXT, updated_at TEXT);
--> statement-breakpoint
CREATE TABLE slip_drafts (id TEXT PRIMARY KEY, ref_id TEXT, amount_minor INTEGER, occurred_on TEXT, occurred_time TEXT, direction TEXT,
  from_bank TEXT, from_last4 TEXT, from_name TEXT, to_bank TEXT, to_last4 TEXT, to_name TEXT, category_id TEXT, category_guessed INTEGER,
  flags TEXT, album TEXT, origin TEXT, model TEXT, escalated INTEGER, announced INTEGER, created_at TEXT, expires_at TEXT);
--> statement-breakpoint
CREATE TABLE slip_leases (id TEXT PRIMARY KEY, expires_at INTEGER, purpose TEXT, day TEXT, reserved INTEGER);
--> statement-breakpoint
CREATE TABLE slip_backfill_uses (day TEXT PRIMARY KEY, uses INTEGER);
