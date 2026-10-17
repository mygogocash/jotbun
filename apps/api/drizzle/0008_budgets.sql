-- M4: one overall budget per account and calendar month, with optional
-- expense-category sublimits that are part of it (never extra). Budget
-- commands validate under the account lock; a deferred constraint trigger is
-- the backstop that the sublimits never add up to more than the overall
-- limit at commit, whichever side changed. Spending and summaries are
-- derived from records, never stored.
CREATE TABLE monthly_budgets (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  month date NOT NULL CHECK (extract(day FROM month) = 1 AND month >= DATE '1970-01-01'),
  -- Derived from (account, month); the change-log entity id.
  id uuid NOT NULL,
  overall_limit_minor bigint NOT NULL CHECK (overall_limit_minor BETWEEN 1 AND 99999999999),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, month),
  UNIQUE (account_id, id)
);
--> statement-breakpoint
CREATE TABLE budget_category_limits (
  account_id uuid NOT NULL,
  month date NOT NULL,
  category_id uuid NOT NULL,
  -- Fixed: only expense categories can carry a sublimit (FK below).
  category_type text NOT NULL DEFAULT 'expense' CHECK (category_type = 'expense'),
  limit_minor bigint NOT NULL CHECK (limit_minor BETWEEN 1 AND 99999999999),
  PRIMARY KEY (account_id, month, category_id),
  FOREIGN KEY (account_id, month) REFERENCES monthly_budgets (account_id, month) ON DELETE CASCADE,
  FOREIGN KEY (account_id, category_id, category_type) REFERENCES categories (account_id, id, type)
);
--> statement-breakpoint
CREATE FUNCTION gogospend_check_budget_sublimits() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_month date;
  v_overall bigint;
  v_sum numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_account := OLD.account_id;
    v_month := OLD.month;
  ELSE
    v_account := NEW.account_id;
    v_month := NEW.month;
  END IF;
  SELECT b.overall_limit_minor INTO v_overall FROM public.monthly_budgets b WHERE b.account_id = v_account AND b.month = v_month;
  IF v_overall IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(sum(l.limit_minor), 0) INTO v_sum FROM public.budget_category_limits l WHERE l.account_id = v_account AND l.month = v_month;
  IF v_sum > v_overall THEN
    RAISE EXCEPTION 'category sublimits exceed the overall budget' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER budget_limits_within_overall AFTER INSERT OR UPDATE OR DELETE ON budget_category_limits
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gogospend_check_budget_sublimits();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER budget_overall_covers_limits AFTER UPDATE ON monthly_budgets
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gogospend_check_budget_sublimits();
--> statement-breakpoint
ALTER TABLE monthly_budgets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE budget_category_limits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY monthly_budgets_owner ON monthly_budgets TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY budget_category_limits_owner ON budget_category_limits TO gogospend_app
  USING (account_id = gogospend_current_account())
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
-- A budget is replaced as a whole: its sublimits may be deleted and
-- re-inserted; the month's budget row itself is never deleted.
GRANT SELECT, INSERT ON monthly_budgets TO gogospend_app;
--> statement-breakpoint
GRANT UPDATE (overall_limit_minor, version, updated_at) ON monthly_budgets TO gogospend_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON budget_category_limits TO gogospend_app;
--> statement-breakpoint
GRANT UPDATE (limit_minor) ON budget_category_limits TO gogospend_app;
