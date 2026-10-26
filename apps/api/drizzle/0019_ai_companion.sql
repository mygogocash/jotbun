-- D15 (premium and AI plan, 24 October 2026): the AI companion's consent and
-- daily use counters. Both are account data under owner RLS and go with the
-- account (ON DELETE CASCADE from the erasure purge's DELETE FROM accounts).
-- Nothing a user writes to Bun, and no slip image, is stored here: only
-- whether AI help and cashback tips are on, the notice version agreed to,
-- and how many times each feature ran on a Bangkok day.
CREATE TABLE ai_preferences (
  account_id uuid PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  companion boolean NOT NULL DEFAULT false,
  cashback_tips boolean NOT NULL DEFAULT false,
  -- The AI notice version the user agreed to; AI stays off without the current one.
  notice_version integer CHECK (notice_version >= 1),
  CHECK (NOT companion OR notice_version IS NOT NULL),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE ai_usage (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  -- Bangkok calendar day.
  day date NOT NULL,
  feature text NOT NULL CHECK (feature IN ('parse', 'slip', 'note', 'ask')),
  uses integer NOT NULL DEFAULT 0 CHECK (uses BETWEEN 0 AND 1000),
  PRIMARY KEY (account_id, day, feature)
);
--> statement-breakpoint
ALTER TABLE ai_preferences ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ai_preferences_owner ON ai_preferences TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY ai_usage_owner ON ai_usage TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ai_preferences TO gogospend_app;
--> statement-breakpoint
-- DELETE lets each use prune the account's own counters older than 35 days.
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_usage TO gogospend_app;
