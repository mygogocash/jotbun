-- Phase 5's money in any currency (plan P5-T4, B18): wallets in any ISO currency
-- with their looks, each record's money fields, categories' icons and pack keys,
-- trips and the home currency. 0000 and 0001 are never edited.
--
-- wallets is rebuilt, because SQLite cannot change a CHECK in place. The migrator
-- runs this whole entry inside one transactionSync, where PRAGMA foreign_keys
-- cannot change, so the swap runs under deferred foreign keys: DROP TABLE wallets
-- counts one violation for each row that names a wallet, the copy already holds
-- every wallet those rows name, and turning defer_foreign_keys off before the
-- commit clears the count. No trigger or view names wallets in 0000 or 0001
-- (SELECT type, name, sql FROM sqlite_master WHERE type IN ('trigger', 'view') AND
-- sql LIKE '%wallets%' finds none); one added by an earlier migration is dropped in
-- step 1 and created again after step 4.
--
-- transactions only gains columns: a rebuild would cascade into
-- transaction_attachments. A row the previous release writes has a null
-- home_amount_minor, which reads as amount_minor. Looks, icons and pack keys are
-- shape checks here and exact lists in the contracts (X6). New tables are STRICT.

-- 1. Defer foreign keys until the swap is done.
PRAGMA defer_foreign_keys = ON;
--> statement-breakpoint
-- 2. Today's columns and rules, except a currency of any ISO shape (and no default), plus the three looks.
CREATE TABLE wallets_next (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80 AND name = trim(name)),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  opening_minor INTEGER NOT NULL CHECK (opening_minor BETWEEN 0 AND 99999999999),
  tracking_start TEXT NOT NULL CHECK (date(tracking_start) IS tracking_start AND tracking_start >= '1970-01-01'),
  archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  type TEXT CHECK (type IS NULL OR (length(type) BETWEEN 1 AND 32 AND type NOT GLOB '*[^a-z_]*')),
  material TEXT CHECK (material IS NULL OR (length(material) BETWEEN 1 AND 32 AND material NOT GLOB '*[^a-z_]*')),
  bun_face TEXT CHECK (bun_face IS NULL OR (length(bun_face) BETWEEN 1 AND 32 AND bun_face NOT GLOB '*[^a-z_]*'))
) STRICT;
--> statement-breakpoint
-- 3. Copy every wallet, then swap the tables. The rows that name wallets keep naming the same ids.
INSERT INTO wallets_next (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at)
  SELECT id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at FROM wallets;
--> statement-breakpoint
DROP TABLE wallets;
--> statement-breakpoint
ALTER TABLE wallets_next RENAME TO wallets;
--> statement-breakpoint
-- 4. Enforce foreign keys again (this clears the violations the drop counted), then fix each wallet's currency (Q7).
PRAGMA defer_foreign_keys = OFF;
--> statement-breakpoint
CREATE TRIGGER wallets_currency_immutable BEFORE UPDATE OF currency ON wallets
  WHEN NEW.currency IS NOT OLD.currency
BEGIN
  SELECT RAISE(ABORT, 'wallet currency is immutable');
END;
--> statement-breakpoint
-- 5. A category's icon, and its pack key, which a built-in never has.
ALTER TABLE categories ADD COLUMN icon TEXT CHECK (icon IS NULL OR (length(icon) BETWEEN 1 AND 32 AND icon NOT GLOB '*[^a-z_]*'));
--> statement-breakpoint
ALTER TABLE categories ADD COLUMN pack_key TEXT CHECK (pack_key IS NULL OR (length(pack_key) BETWEEN 1 AND 32 AND pack_key NOT GLOB '*[^a-z_]*' AND builtin_key IS NULL));
--> statement-breakpoint
-- 6. A record's money fields. Older rows are baht at 1, from the reference rate, with no trip.
ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'THB' CHECK (currency GLOB '[A-Z][A-Z][A-Z]');
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN rate TEXT NOT NULL DEFAULT '1' CHECK (length(rate) BETWEEN 1 AND 40 AND rate NOT GLOB '*[^0-9.]*');
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN rate_source TEXT NOT NULL DEFAULT 'reference' CHECK (rate_source IN ('reference', 'own', 'exchange'));
--> statement-breakpoint
-- The feed day of the reference rate used (B17).
ALTER TABLE transactions ADD COLUMN rate_date TEXT CHECK (rate_date IS NULL OR date(rate_date) IS rate_date);
--> statement-breakpoint
ALTER TABLE transactions ADD COLUMN home_amount_minor INTEGER CHECK (home_amount_minor IS NULL OR home_amount_minor BETWEEN 0 AND 99999999999);
--> statement-breakpoint
-- The amount charged to the wallet, when the record's currency is not the wallet's (B15). Never on a transfer.
ALTER TABLE transactions ADD COLUMN wallet_amount_minor INTEGER CHECK (wallet_amount_minor IS NULL OR (type <> 'transfer' AND wallet_amount_minor BETWEEN 0 AND 99999999999));
--> statement-breakpoint
-- The amount an exchange put into the destination wallet. Only on a transfer.
ALTER TABLE transactions ADD COLUMN to_amount_minor INTEGER CHECK (to_amount_minor IS NULL OR (type = 'transfer' AND to_amount_minor BETWEEN 1 AND 99999999999));
--> statement-breakpoint
-- No foreign key: a tag naming a deleted trip reads as no trip (X4).
ALTER TABLE transactions ADD COLUMN trip_id TEXT;
--> statement-breakpoint
UPDATE transactions SET home_amount_minor = amount_minor WHERE home_amount_minor IS NULL;
--> statement-breakpoint
CREATE INDEX transactions_trip_idx ON transactions (trip_id, occurred_on) WHERE deleted_at IS NULL AND trip_id IS NOT NULL;
--> statement-breakpoint
-- 7. Trips, soft-deleted (X4). The budget is in the trip's currency.
CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80 AND name = trim(name)),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  starts_on TEXT NOT NULL CHECK (date(starts_on) IS starts_on),
  ends_on TEXT NOT NULL CHECK (date(ends_on) IS ends_on AND ends_on >= starts_on),
  budget_minor INTEGER CHECK (budget_minor IS NULL OR budget_minor BETWEEN 1 AND 99999999999),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
--> statement-breakpoint
CREATE INDEX trips_dates_idx ON trips (starts_on, ends_on) WHERE deleted_at IS NULL;
--> statement-breakpoint
-- 8. The vault's settings, one row once the home currency first changes (THB until then, X5).
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  entity_id TEXT NOT NULL,
  home_currency TEXT NOT NULL CHECK (home_currency GLOB '[A-Z][A-Z][A-Z]'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TEXT NOT NULL
) STRICT;
