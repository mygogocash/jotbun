-- P3: explicit, resumable import confirmation (after P2c's 0017_attachments).
--   import_selections     - one per freeze command: the preview it froze, at
--                           which review revision, and how many rows. Written
--                           only by gogospend_freeze_import_selection.
--   import_selection_rows - the frozen, normalized fields of every chosen row
--                           (at most 5,000), with the owned wallet and
--                           category its labels were mapped to. Never updated.
--   import_row_progress   - one per committed source row of an import:
--                           unique (job_id, source_row_id), the transaction it
--                           became and the command that saved it. Inserted by
--                           a confirmation command in the same account-locked
--                           transaction as that transaction; never updated by
--                           the app.
-- Nothing here is a financial record. Rows become transactions only through
-- P3's confirmation command (M1 executor): the guard on import_row_progress
-- accepts a row only when its new transaction is exactly the frozen row of a
-- selection that still matches the ready, unexpired preview. Review
-- corrections (gogospend_patch_import_rows) are the only writes to P2b's
-- candidates and never touch a committed row.
CREATE TABLE import_selections (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  selection_id uuid NOT NULL,
  job_id uuid NOT NULL REFERENCES import_previews (job_id) ON DELETE CASCADE,
  frozen_revision bigint NOT NULL CHECK (frozen_revision >= 1),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The preview's own expiry: frozen copies go when the candidates go.
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (account_id, selection_id),
  UNIQUE (selection_id)
);
--> statement-breakpoint
CREATE INDEX import_selections_job_idx ON import_selections (account_id, job_id);
--> statement-breakpoint
CREATE INDEX import_selections_expiry_idx ON import_selections (expires_at);
--> statement-breakpoint
CREATE TABLE import_selection_rows (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  selection_id uuid NOT NULL,
  source_row_id text NOT NULL CHECK (source_row_id ~ '^(row:[1-9][0-9]{0,7}|image:1)$'),
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 5000),
  -- Transfers cannot be confirmed from a file (no layout names a destination).
  type text NOT NULL CHECK (type IN ('expense', 'income')),
  amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 1 AND 99999999999),
  occurred_on date NOT NULL CHECK (occurred_on >= DATE '1970-01-01'),
  wallet_id uuid NOT NULL,
  category_id uuid NOT NULL,
  category_type text GENERATED ALWAYS AS (type) STORED,
  note text CHECK (note IS NULL OR (char_length(note) BETWEEN 1 AND 500 AND note = btrim(note))),
  merchant text CHECK (merchant IS NULL OR (char_length(merchant) BETWEEN 1 AND 120 AND merchant = btrim(merchant) AND merchant !~ '[[:cntrl:]]')),
  PRIMARY KEY (account_id, selection_id, source_row_id),
  UNIQUE (account_id, selection_id, ordinal),
  FOREIGN KEY (account_id, selection_id) REFERENCES import_selections (account_id, selection_id) ON DELETE CASCADE,
  FOREIGN KEY (account_id, wallet_id) REFERENCES wallets (account_id, id),
  FOREIGN KEY (account_id, category_id, category_type) REFERENCES categories (account_id, id, type)
);
--> statement-breakpoint
CREATE TABLE import_row_progress (
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES import_previews (job_id) ON DELETE CASCADE,
  source_row_id text NOT NULL CHECK (source_row_id ~ '^(row:[1-9][0-9]{0,7}|image:1)$'),
  -- The selection the row was confirmed from (a later selection of the same
  -- import acknowledges the row instead of writing it again).
  selection_id uuid NOT NULL,
  -- NULL only once the transaction itself was purged (30 days after its
  -- deletion); the row stays committed.
  transaction_id uuid,
  command_id uuid NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (job_id, source_row_id),
  UNIQUE (account_id, transaction_id),
  FOREIGN KEY (account_id, transaction_id) REFERENCES transactions (account_id, id) ON DELETE SET NULL (transaction_id)
);
--> statement-breakpoint
CREATE INDEX import_row_progress_account_idx ON import_row_progress (account_id, job_id);
--> statement-breakpoint
ALTER TABLE import_selections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE import_selection_rows ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE import_row_progress ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY import_selections_owner ON import_selections FOR SELECT TO gogospend_app
  USING (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY import_selection_rows_owner ON import_selection_rows FOR SELECT TO gogospend_app
  USING (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY import_row_progress_owner_read ON import_row_progress FOR SELECT TO gogospend_app
  USING (account_id = gogospend_current_account());
--> statement-breakpoint
CREATE POLICY import_row_progress_owner_insert ON import_row_progress FOR INSERT TO gogospend_app
  WITH CHECK (account_id = gogospend_current_account());
--> statement-breakpoint
-- Selections are written by the freeze routine only; progress is append-only.
GRANT SELECT ON import_selections, import_selection_rows TO gogospend_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON import_row_progress TO gogospend_app;
--> statement-breakpoint
-- A committed row is exactly its frozen row: the selection belongs to the
-- same import and still matches the preview's review revision, the preview is
-- ready and unexpired, and the transaction (new, active, version 1) carries
-- the frozen type, amount, date, wallet, category, note and merchant. Runs as
-- the caller, so row-level security limits every lookup to the owner.
CREATE FUNCTION gogospend_guard_import_progress() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog
AS $$
DECLARE
  v_selection public.import_selections%ROWTYPE;
  v_preview public.import_previews%ROWTYPE;
BEGIN
  SELECT s.* INTO v_selection FROM public.import_selections s
   WHERE s.account_id = NEW.account_id AND s.selection_id = NEW.selection_id;
  IF NOT FOUND OR v_selection.job_id <> NEW.job_id THEN
    RAISE EXCEPTION 'row progress names a selection of its own import' USING ERRCODE = 'check_violation';
  END IF;
  SELECT p.* INTO v_preview FROM public.import_previews p WHERE p.job_id = NEW.job_id AND p.account_id = NEW.account_id;
  IF NOT FOUND OR v_preview.status <> 'ready' OR v_preview.expires_at <= now() OR v_preview.review_revision <> v_selection.frozen_revision THEN
    RAISE EXCEPTION 'rows are confirmed only from a current selection of a ready preview' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.transaction_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.import_selection_rows r
         JOIN public.transactions t ON t.account_id = r.account_id AND t.id = NEW.transaction_id
        WHERE r.account_id = NEW.account_id AND r.selection_id = NEW.selection_id AND r.source_row_id = NEW.source_row_id
          AND t.type = r.type AND t.amount_minor = r.amount_minor AND t.occurred_on = r.occurred_on
          AND t.wallet_id = r.wallet_id AND t.category_id = r.category_id
          AND t.note IS NOT DISTINCT FROM r.note AND t.merchant IS NOT DISTINCT FROM r.merchant
          AND t.deleted_at IS NULL AND t.version = 1) THEN
    RAISE EXCEPTION 'a confirmed row is its frozen row saved as a new transaction' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER import_row_progress_guard BEFORE INSERT ON import_row_progress
  FOR EACH ROW EXECUTE FUNCTION gogospend_guard_import_progress();
--> statement-breakpoint
-- Review corrections, in the owner's command transaction (account lock held
-- by the executor; taken again here). For a ready, unexpired preview at
-- exactly p_review_revision: each named field of each listed row is replaced
-- (p_rows: [{source_row_id, set: {field: value|null}}], at most 500 distinct
-- rows, none committed). A corrected field's issues are cleared and the row's
-- review flag recomputed; totals and counts are recomputed and the review
-- revision moves forward by one. Returns the new revision. Any violation
-- raises (the caller validates first; this is the database's own guard).
CREATE FUNCTION gogospend_patch_import_rows(p_job_id uuid, p_review_revision bigint, p_rows jsonb) RETURNS bigint
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_preview public.import_previews%ROWTYPE;
  v_count integer;
  v_revision bigint;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'corrections need an owner transaction' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  SELECT p.* INTO v_preview FROM public.import_previews p WHERE p.job_id = p_job_id AND p.account_id = v_account FOR UPDATE;
  IF NOT FOUND OR v_preview.status <> 'ready' OR v_preview.expires_at <= now() OR v_preview.review_revision <> p_review_revision THEN
    RAISE EXCEPTION 'corrections apply to a ready, unexpired preview at its current revision' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500
     OR (SELECT count(DISTINCT r.value ->> 'source_row_id') FROM jsonb_array_elements(p_rows) AS r(value)) <> jsonb_array_length(p_rows)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) AS r(value)
                 WHERE jsonb_typeof(r.value -> 'set') IS DISTINCT FROM 'object'
                    OR EXISTS (SELECT 1 FROM jsonb_object_keys(r.value -> 'set') AS k(name)
                                WHERE k.name NOT IN ('occurred_on', 'type', 'amount_minor', 'wallet_label', 'category_label', 'merchant', 'note'))) THEN
    RAISE EXCEPTION 'corrections are 1-500 distinct rows of known fields' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.import_row_progress g, jsonb_array_elements(p_rows) AS r(value)
              WHERE g.job_id = p_job_id AND g.source_row_id = r.value ->> 'source_row_id') THEN
    RAISE EXCEPTION 'a committed row cannot be corrected' USING ERRCODE = 'check_violation';
  END IF;
  WITH patch AS (
    SELECT r.value ->> 'source_row_id' AS source_row_id, r.value -> 'set' AS s FROM jsonb_array_elements(p_rows) AS r(value)
  ), next AS (
    SELECT c.source_row_id,
           CASE WHEN patch.s ? 'occurred_on' THEN (patch.s ->> 'occurred_on')::date ELSE c.occurred_on END AS occurred_on,
           CASE WHEN patch.s ? 'type' THEN patch.s ->> 'type' ELSE c.type END AS type,
           CASE WHEN patch.s ? 'amount_minor' THEN (patch.s ->> 'amount_minor')::bigint ELSE c.amount_minor END AS amount_minor,
           CASE WHEN patch.s ? 'wallet_label' THEN patch.s ->> 'wallet_label' ELSE c.wallet_label END AS wallet_label,
           CASE WHEN patch.s ? 'category_label' THEN patch.s ->> 'category_label' ELSE c.category_label END AS category_label,
           CASE WHEN patch.s ? 'merchant' THEN patch.s ->> 'merchant' ELSE c.merchant END AS merchant,
           CASE WHEN patch.s ? 'note' THEN patch.s ->> 'note' ELSE c.note END AS note,
           (SELECT coalesce(jsonb_agg(i.value ORDER BY i.n), '[]'::jsonb)
              FROM jsonb_array_elements(c.issues) WITH ORDINALITY AS i(value, n)
             WHERE NOT (patch.s ? coalesce(i.value ->> 'field', ''))) AS issues
      FROM public.import_candidates c JOIN patch ON patch.source_row_id = c.source_row_id
     WHERE c.job_id = p_job_id AND c.account_id = v_account
  )
  UPDATE public.import_candidates c
     SET occurred_on = n.occurred_on, type = n.type, amount_minor = n.amount_minor, wallet_label = n.wallet_label,
         category_label = n.category_label, merchant = n.merchant, note = n.note, issues = n.issues,
         review_required = (n.occurred_on IS NULL OR n.type IS NULL OR n.amount_minor IS NULL OR n.wallet_label IS NULL OR n.issues <> '[]'::jsonb)
    FROM next n
   WHERE c.job_id = p_job_id AND c.source_row_id = n.source_row_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> jsonb_array_length(p_rows) THEN
    RAISE EXCEPTION 'every corrected row is a candidate of this preview' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.import_previews p
     SET review_revision = p.review_revision + 1,
         review_required_count = t.review,
         expense_total_minor = t.expense,
         income_total_minor = t.income,
         transfer_total_minor = t.transfer
    FROM (SELECT count(*) FILTER (WHERE c.review_required) AS review,
                 coalesce(sum(c.amount_minor) FILTER (WHERE c.type = 'expense'), 0) AS expense,
                 coalesce(sum(c.amount_minor) FILTER (WHERE c.type = 'income'), 0) AS income,
                 coalesce(sum(c.amount_minor) FILTER (WHERE c.type = 'transfer'), 0) AS transfer
            FROM public.import_candidates c WHERE c.job_id = p_job_id) t
   WHERE p.job_id = p_job_id
  RETURNING p.review_revision INTO v_revision;
  RETURN v_revision;
END
$$;
--> statement-breakpoint
-- The full-selection freeze, in the owner's command transaction (account lock
-- held by the executor; taken again here). For a ready, unexpired preview at
-- exactly p_review_revision: copies the listed candidates (1-5,000 distinct
-- rows) with the owned wallet and category their labels map to
-- (p_mapping: {wallets: {label: id}, categories: {expense|income: {label: id}}}).
-- A row without a date, a direction other than expense/income, an amount or a
-- mapped label violates the frozen row's constraints; foreign or mistyped
-- wallets and categories violate its foreign keys. Returns the row count.
CREATE FUNCTION gogospend_freeze_import_selection(p_selection_id uuid, p_job_id uuid, p_review_revision bigint, p_row_ids text[], p_mapping jsonb) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid := public.gogospend_current_account();
  v_preview public.import_previews%ROWTYPE;
  v_count integer;
BEGIN
  IF v_account IS NULL THEN
    RAISE EXCEPTION 'a selection needs an owner transaction' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE;
  SELECT p.* INTO v_preview FROM public.import_previews p WHERE p.job_id = p_job_id AND p.account_id = v_account;
  IF NOT FOUND OR v_preview.status <> 'ready' OR v_preview.expires_at <= now() OR v_preview.review_revision <> p_review_revision THEN
    RAISE EXCEPTION 'a selection freezes a ready, unexpired preview at its current revision' USING ERRCODE = 'check_violation';
  END IF;
  IF p_row_ids IS NULL OR cardinality(p_row_ids) NOT BETWEEN 1 AND 5000
     OR (SELECT count(DISTINCT r) FROM unnest(p_row_ids) AS r) <> cardinality(p_row_ids)
     OR jsonb_typeof(p_mapping -> 'wallets') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_mapping -> 'categories' -> 'expense') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_mapping -> 'categories' -> 'income') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'a selection is 1-5,000 distinct rows with a label mapping' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.import_selections (account_id, selection_id, job_id, frozen_revision, row_count, expires_at)
  VALUES (v_account, p_selection_id, p_job_id, p_review_revision, cardinality(p_row_ids), v_preview.expires_at);
  INSERT INTO public.import_selection_rows (account_id, selection_id, source_row_id, ordinal, type, amount_minor, occurred_on,
                                            wallet_id, category_id, note, merchant)
  SELECT v_account, p_selection_id, c.source_row_id, c.ordinal, c.type, c.amount_minor, c.occurred_on,
         (p_mapping -> 'wallets' ->> c.wallet_label)::uuid,
         (p_mapping -> 'categories' -> c.type ->> c.category_label)::uuid,
         c.note, c.merchant
    FROM public.import_candidates c
   WHERE c.job_id = p_job_id AND c.account_id = v_account AND c.source_row_id = ANY (p_row_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> cardinality(p_row_ids) THEN
    RAISE EXCEPTION 'every selected row is a candidate of this preview' USING ERRCODE = 'check_violation';
  END IF;
  RETURN v_count;
END
$$;
--> statement-breakpoint
-- Retention (P5 contract). The frozen copies of a selection are private
-- financial fields: they are deleted when their preview expires (7 days after
-- parsing). The import's compact synced records - each selection's progress
-- counts and the correction revision, no row fields - become purged
-- tombstones once their last change is 30 days old and their selection or
-- preview is gone, so a purge never moves the sync retention line inside
-- S1's 30-day delta window. One account at a time, skipped while a user write
-- holds its lock (the next run retries) or while it is being erased. Row
-- progress stays until the upload row is pruned (P5's imports.uploads, 30
-- days after the raw file's expiry), whose cascade removes it. Returns how
-- many selections and records it removed.
CREATE FUNCTION gogospend_import_records_due(p_account uuid, p_entity text) RETURNS uuid[]
  LANGUAGE sql STABLE
  SET search_path = pg_catalog
AS $$
  SELECT array_agg(h.entity_id ORDER BY h.entity_id)
    FROM public.entity_heads h
    JOIN public.entity_changes c ON c.account_id = h.account_id AND c.revision = h.revision AND c.entity = h.entity AND c.entity_id = h.entity_id
   WHERE (p_account IS NULL OR h.account_id = p_account) AND h.entity = p_entity AND h.state <> 'purged'
     AND c.committed_at < now() - interval '30 days'
     AND CASE p_entity
           WHEN 'import_selection' THEN NOT EXISTS (SELECT 1 FROM public.import_selections s WHERE s.account_id = h.account_id AND s.selection_id = h.entity_id)
           WHEN 'import_review' THEN NOT EXISTS (SELECT 1 FROM public.import_previews p WHERE p.account_id = h.account_id AND p.job_id = h.entity_id AND p.expires_at > now())
           ELSE false
         END
$$;
--> statement-breakpoint
CREATE FUNCTION gogospend_prune_import_selections(p_limit integer) RETURNS integer
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog
AS $$
DECLARE
  v_account uuid;
  v_ids uuid[];
  v_entity text;
  v_deleted integer;
  v_count integer := 0;
BEGIN
  FOR v_account IN
    SELECT x.account_id FROM (
      SELECT s.account_id FROM public.import_selections s WHERE s.expires_at <= now()
      UNION
      SELECT h.account_id FROM public.entity_heads h
        JOIN public.entity_changes c ON c.account_id = h.account_id AND c.revision = h.revision AND c.entity = h.entity AND c.entity_id = h.entity_id
       WHERE h.entity IN ('import_selection', 'import_review') AND h.state <> 'purged' AND c.committed_at < now() - interval '30 days'
    ) x
     ORDER BY x.account_id
     LIMIT least(greatest(coalesce(p_limit, 1), 1), 1000)
  LOOP
    PERFORM 1 FROM public.account_sync_state s WHERE s.account_id = v_account FOR UPDATE SKIP LOCKED;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = v_account AND a.status <> 'deleting') THEN
      CONTINUE;
    END IF;
    WITH gone AS (
      DELETE FROM public.import_selections s WHERE s.account_id = v_account AND s.expires_at <= now() RETURNING s.selection_id)
    SELECT count(*) INTO v_deleted FROM gone;
    v_count := v_count + v_deleted;
    FOREACH v_entity IN ARRAY ARRAY['import_selection', 'import_review'] LOOP
      v_ids := public.gogospend_import_records_due(v_account, v_entity);
      IF v_ids IS NOT NULL THEN
        PERFORM public.gogospend_purge_entities(v_account, v_entity, v_ids);
        v_count := v_count + cardinality(v_ids);
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_count;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION gogospend_guard_import_progress(), gogospend_patch_import_rows(uuid, bigint, jsonb),
  gogospend_freeze_import_selection(uuid, uuid, bigint, text[], jsonb), gogospend_import_records_due(uuid, text), gogospend_prune_import_selections(integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_patch_import_rows(uuid, bigint, jsonb), gogospend_freeze_import_selection(uuid, uuid, bigint, text[], jsonb) TO gogospend_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION gogospend_prune_import_selections(integer) TO gogospend_jobs;
