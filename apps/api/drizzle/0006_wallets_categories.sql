-- M2: owned wallets and stable categories. Composite (account_id, id) keys
-- and owner RLS; later tables reference them with composite foreign keys, so
-- one account's record can never point at another account's wallet or
-- category. Names are stored exactly as normalizeName returns them.
CREATE TABLE wallets (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80 AND name = btrim(name) AND name !~ '[[:cntrl:]]'),
  currency text NOT NULL DEFAULT 'THB' CHECK (currency = 'THB'),
  opening_minor bigint NOT NULL CHECK (opening_minor BETWEEN 0 AND 99999999999),
  tracking_start date NOT NULL CHECK (tracking_start >= DATE '1970-01-01'),
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, id)
);
--> statement-breakpoint
CREATE TABLE categories (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('expense', 'income')),
  builtin_key text CHECK (builtin_key IN ('food', 'travel', 'household', 'bills', 'shopping', 'fun', 'salary', 'bonus', 'side_job', 'gift')),
  label text CHECK (label IS NULL OR (char_length(label) BETWEEN 1 AND 80 AND label = btrim(label) AND label !~ '[[:cntrl:]]')),
  color text CHECK (color IS NULL OR color ~ '^#[0-9A-F]{6}$'),
  archived boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, id),
  -- Target for M3's (account, category, type) foreign key: an expense can
  -- only reference an expense category.
  UNIQUE (account_id, id, type),
  UNIQUE (account_id, builtin_key),
  CHECK (builtin_key IS NOT NULL OR label IS NOT NULL),
  CHECK (builtin_key IS NULL OR type = CASE WHEN builtin_key IN ('salary', 'bonus', 'side_job', 'gift') THEN 'income' ELSE 'expense' END)
);
--> statement-breakpoint
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY wallets_owner ON wallets TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY categories_owner ON categories TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
-- No DELETE: archived wallets and categories stay for history. A category's
-- type and built-in key, and a wallet's currency, are not updatable at all.
GRANT SELECT, INSERT ON wallets, categories TO gogospend_app;
--> statement-breakpoint
GRANT UPDATE (name, opening_minor, tracking_start, archived, version, updated_at) ON wallets TO gogospend_app;
--> statement-breakpoint
GRANT UPDATE (label, color, archived, version, updated_at) ON categories TO gogospend_app;
