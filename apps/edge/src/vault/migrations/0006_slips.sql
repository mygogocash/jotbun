-- Slip import's vault tables (plan P4-T3, §6.2 and §6.8). 0000 to 0005 are never edited.
--
-- The salt (S16): one row of 32 random bytes, made on its first read and never rotated;
-- erase deletes it with the vault. Slip accounts: one per bank and last four digits, mapped
-- to a wallet or not. Slip references: one per salted reference hash (A25: the vault sees
-- only hashes), kept after their draft goes so a slip is never read twice. Drafts: what a
-- read found, both sides as printed, until it is confirmed, dismissed or expires (C11).
-- Leases and backfill uses are slip reads' quota (P4-T6, S6). Only the inbox count is
-- change-logged (S1, the `slip_inbox` entity); none of these tables is.
--
-- transactions only gains a column; it is never rebuilt (0005's reasons). The column's
-- default is NULL, as ADD COLUMN with REFERENCES needs, so every row keeps its value and the
-- previous release's statements, which never name the column, still run. New tables are STRICT.
CREATE TABLE slip_salt (id INTEGER PRIMARY KEY CHECK (id = 1), salt BLOB NOT NULL CHECK (length(salt) = 32), created_at TEXT NOT NULL) STRICT;
--> statement-breakpoint
CREATE TABLE slip_accounts (id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  bank TEXT NOT NULL CHECK (bank GLOB '[a-z]*' AND length(bank) BETWEEN 2 AND 16),
  account_last4 TEXT NOT NULL CHECK (length(account_last4) = 4 AND account_last4 NOT GLOB '*[^0-9]*'),
  wallet_id TEXT REFERENCES wallets (id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (bank, account_last4)) STRICT;
--> statement-breakpoint
CREATE TABLE slip_refs (id TEXT PRIMARY KEY, ref_hash TEXT NOT NULL UNIQUE CHECK (length(ref_hash) = 64 AND ref_hash NOT GLOB '*[^0-9a-f]*'),
  state TEXT NOT NULL CHECK (state IN ('draft', 'confirmed', 'dismissed', 'expired', 'recorded')), transaction_id TEXT,
  first_seen_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK ((state IN ('confirmed', 'recorded')) = (transaction_id IS NOT NULL))) STRICT;
--> statement-breakpoint
CREATE TABLE slip_drafts (id TEXT PRIMARY KEY, ref_id TEXT NOT NULL UNIQUE REFERENCES slip_refs (id),
  amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor BETWEEN 1 AND 99999999999),
  occurred_on TEXT CHECK (occurred_on IS NULL OR date(occurred_on) IS occurred_on),
  occurred_time TEXT CHECK (occurred_time IS NULL OR (length(occurred_time) = 5 AND occurred_time GLOB '[0-2][0-9]:[0-5][0-9]')),
  direction TEXT NOT NULL CHECK (direction IN ('out', 'in')),
  from_bank TEXT CHECK (from_bank IS NULL OR (from_bank GLOB '[a-z]*' AND length(from_bank) BETWEEN 2 AND 16)),
  from_last4 TEXT CHECK (from_last4 IS NULL OR (length(from_last4) = 4 AND from_last4 NOT GLOB '*[^0-9]*')),
  from_name TEXT CHECK (from_name IS NULL OR length(from_name) BETWEEN 1 AND 120),
  to_bank TEXT CHECK (to_bank IS NULL OR (to_bank GLOB '[a-z]*' AND length(to_bank) BETWEEN 2 AND 16)),
  to_last4 TEXT CHECK (to_last4 IS NULL OR (length(to_last4) = 4 AND to_last4 NOT GLOB '*[^0-9]*')),
  to_name TEXT CHECK (to_name IS NULL OR length(to_name) BETWEEN 1 AND 120), category_id TEXT REFERENCES categories (id),
  category_guessed INTEGER NOT NULL DEFAULT 0 CHECK (category_guessed IN (0, 1)),
  flags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(flags) AND json_type(flags) = 'array'),
  album TEXT CHECK (album IS NULL OR length(album) BETWEEN 1 AND 60), origin TEXT NOT NULL CHECK (origin IN ('album', 'share', 'photo')),
  model TEXT NOT NULL CHECK (model IN ('claude-haiku-5-5', 'claude-opus-5-5')),
  escalated INTEGER NOT NULL CHECK (escalated IN (0, 1)), announced INTEGER NOT NULL DEFAULT 0 CHECK (announced IN (0, 1)),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL) STRICT;
--> statement-breakpoint
CREATE INDEX slip_drafts_order_idx ON slip_drafts (occurred_on, occurred_time, id);
--> statement-breakpoint
CREATE TABLE slip_leases (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL CHECK (expires_at >= 0), purpose TEXT NOT NULL CHECK (purpose IN ('live', 'backfill')),
  day TEXT NOT NULL CHECK (date(day) IS day), reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0)) STRICT;
--> statement-breakpoint
CREATE TABLE slip_backfill_uses (day TEXT PRIMARY KEY CHECK (date(day) IS day), uses INTEGER NOT NULL CHECK (uses BETWEEN 0 AND 500)) STRICT;
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN slip_ref_id TEXT REFERENCES slip_refs (id);
--> statement-breakpoint
CREATE INDEX transactions_merchant_idx ON transactions (lower(merchant)) WHERE deleted_at IS NULL AND merchant IS NOT NULL;
