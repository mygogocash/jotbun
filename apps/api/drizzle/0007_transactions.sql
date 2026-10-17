-- M3: one row per logical expense, income or owned-wallet transfer, so a
-- transfer can never be half-written. Composite foreign keys keep every
-- reference inside the owner's account, and (category, type) makes an
-- expense point at an expense category. Balances are derived from active
-- rows (BalanceQuery), never stored. Deletion is soft (restorable 30 days;
-- P5 purges private fields later).
CREATE TABLE transactions (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 99999999999),
  occurred_on date NOT NULL CHECK (occurred_on >= DATE '1970-01-01'),
  wallet_id uuid,
  category_id uuid,
  category_type text GENERATED ALWAYS AS (CASE WHEN type <> 'transfer' THEN type END) STORED,
  source_wallet_id uuid,
  destination_wallet_id uuid,
  note text CHECK (note IS NULL OR (char_length(note) BETWEEN 1 AND 500 AND note = btrim(note))),
  merchant text CHECK (merchant IS NULL OR (char_length(merchant) BETWEEN 1 AND 120 AND merchant = btrim(merchant) AND merchant !~ '[[:cntrl:]]')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, id),
  FOREIGN KEY (account_id, wallet_id) REFERENCES wallets (account_id, id),
  FOREIGN KEY (account_id, category_id, category_type) REFERENCES categories (account_id, id, type),
  FOREIGN KEY (account_id, source_wallet_id) REFERENCES wallets (account_id, id),
  FOREIGN KEY (account_id, destination_wallet_id) REFERENCES wallets (account_id, id),
  CHECK (
    (type <> 'transfer' AND wallet_id IS NOT NULL AND category_id IS NOT NULL
      AND source_wallet_id IS NULL AND destination_wallet_id IS NULL)
    OR (type = 'transfer' AND wallet_id IS NULL AND category_id IS NULL
      AND source_wallet_id IS NOT NULL AND destination_wallet_id IS NOT NULL
      AND source_wallet_id <> destination_wallet_id)
  )
);
--> statement-breakpoint
-- Balance and reference lookups over active rows, and M4's keyset history.
CREATE INDEX transactions_wallet_idx ON transactions (account_id, wallet_id) WHERE deleted_at IS NULL AND wallet_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX transactions_source_idx ON transactions (account_id, source_wallet_id) WHERE deleted_at IS NULL AND source_wallet_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX transactions_destination_idx ON transactions (account_id, destination_wallet_id) WHERE deleted_at IS NULL AND destination_wallet_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX transactions_history_idx ON transactions (account_id, occurred_on, id) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE INDEX transactions_category_idx ON transactions (account_id, category_id) WHERE category_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY transactions_owner ON transactions TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
-- No DELETE (soft deletion only) and no type change.
GRANT SELECT, INSERT ON transactions TO gogospend_app;
--> statement-breakpoint
GRANT UPDATE (amount_minor, occurred_on, wallet_id, category_id, source_wallet_id, destination_wallet_id, note, merchant, version, deleted_at, updated_at) ON transactions TO gogospend_app;
