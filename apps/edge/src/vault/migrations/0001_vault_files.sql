-- The vault's file tables: statement uploads in quarantine and their parse, the
-- previews and selections an import confirms from, the receipts a person keeps,
-- resync snapshots and exports, and the AI companion's preferences and daily
-- counters. Ported from apps/api/drizzle 0009 (object_publications, replaced by
-- vault_objects), 0010 (snapshot_manifests and snapshot_chunks), 0013 (exports),
-- 0014 (import_uploads), 0016 (import_previews and import_candidates), 0017
-- (attachments, transaction_attachments and import_previews.image_attachment_id),
-- 0018 (import_selections, import_selection_rows and import_row_progress) and
-- 0019 (ai_preferences and ai_usage), with the final shape of each. The API's
-- account_id and lifecycle_generation columns are dropped: a vault holds one
-- account, and the vault is the only writer.
--
-- Object keys begin with their purpose, then the vault's id (B1, src/vault/files/keys.ts).
-- vault_objects registers each key before anyone writes it. A column that holds a key
-- is UNIQUE, and where the purpose is fixed its shape is checked here.
--
-- Every table is STRICT (ruling R16). Timestamps are ISO 8601 TEXT, except
-- vault_objects.delete_after and created_at, which are epoch milliseconds like
-- schedule.due_at. Checks that compare two timestamps are dropped, and the owning
-- tasks' tests assert them. Control-character checks are dropped, as in 0000,
-- because the contracts validate text.

-- Every object the vault has registered. A key is registered (reserved) before
-- its PUT, published after it, and due at delete_after, when the vault's alarm
-- deletes it. A tombstone is a key the vault deleted or gave up on; it is deleted
-- once more a day later (B19). A published receipt has no deadline: it is kept
-- until its attachment is released.
CREATE TABLE vault_objects (
  key TEXT PRIMARY KEY NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('sync_snapshot', 'export', 'import_quarantine', 'import_image', 'receipt')),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'published', 'tombstone')),
  delete_after INTEGER CHECK (delete_after IS NULL OR delete_after >= 0),
  bytes INTEGER CHECK (bytes IS NULL OR bytes >= 0),
  sha256 TEXT CHECK (sha256 IS NULL OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*')),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  CHECK (substr(key, 1, length(purpose) + 1) = purpose || '/'),
  CHECK (status <> 'published' OR (bytes IS NOT NULL AND sha256 IS NOT NULL)),
  CHECK (delete_after IS NOT NULL OR (status = 'published' AND purpose = 'receipt'))
) STRICT;
--> statement-breakpoint
CREATE INDEX vault_objects_due_idx ON vault_objects (delete_after) WHERE delete_after IS NOT NULL;
--> statement-breakpoint
-- The resync snapshot a build wrote, from snapshot_manifests, with its job state.
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  high_water INTEGER CHECK (high_water IS NULL OR high_water >= 0),
  chunk_count INTEGER CHECK (chunk_count BETWEEN 1 AND 10000),
  created_at TEXT NOT NULL,
  started_at TEXT,
  ready_at TEXT,
  expires_at TEXT,
  -- A ready snapshot has its high-water mark, chunk count and expiry, and no other state does.
  CHECK ((status = 'ready') = (high_water IS NOT NULL AND chunk_count IS NOT NULL AND ready_at IS NOT NULL AND expires_at IS NOT NULL))
) STRICT;
--> statement-breakpoint
CREATE TABLE snapshot_chunks (
  snapshot_id TEXT NOT NULL REFERENCES snapshots (id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL CHECK (chunk_index BETWEEN 0 AND 9999),
  object_key TEXT NOT NULL UNIQUE CHECK (object_key GLOB 'sync_snapshot/*'),
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY (snapshot_id, chunk_index)
) STRICT;
--> statement-breakpoint
CREATE TABLE exports (
  id TEXT PRIMARY KEY NOT NULL,
  from_date TEXT NOT NULL CHECK (date(from_date) IS from_date AND from_date >= '1970-01-01'),
  through_date TEXT NOT NULL CHECK (date(through_date) IS through_date AND through_date >= from_date),
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  failure TEXT CHECK (failure IN ('too_large', 'error')),
  started_at TEXT,
  object_key TEXT UNIQUE,
  bytes INTEGER CHECK (bytes IS NULL OR bytes > 0),
  sha256 TEXT CHECK (sha256 IS NULL OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*')),
  row_count INTEGER CHECK (row_count IS NULL OR row_count >= 0),
  high_water INTEGER CHECK (high_water IS NULL OR high_water >= 0),
  ready_at TEXT,
  expires_at TEXT,
  CHECK ((status = 'failed') = (failure IS NOT NULL)),
  CHECK ((status = 'ready') = (ready_at IS NOT NULL)),
  -- The file columns are set together, once.
  CHECK ((ready_at IS NULL) = (object_key IS NULL) AND (ready_at IS NULL) = (bytes IS NULL) AND (ready_at IS NULL) = (sha256 IS NULL)
     AND (ready_at IS NULL) = (row_count IS NULL) AND (ready_at IS NULL) = (high_water IS NULL) AND (ready_at IS NULL) = (expires_at IS NULL)),
  -- The key is this export's own publication: export/<vault id>/<export id>/... (the vault id is 64 characters).
  CHECK (object_key IS NULL OR (substr(object_key, 1, 7) = 'export/' AND substr(object_key, 72, length(id) + 2) = '/' || id || '/'))
) STRICT;
--> statement-breakpoint
CREATE INDEX exports_requested_idx ON exports (requested_at);
--> statement-breakpoint
-- One statement upload: quarantined, parsed, and then either previewed or expired.
CREATE TABLE import_uploads (
  job_id TEXT PRIMARY KEY NOT NULL,
  intake_token TEXT NOT NULL,
  -- receiving: the body is streaming; accepted: quarantined and queued for parsing;
  -- rejected: refused for its content or a limit; failed: the stream, storage,
  -- deadline or session ended it; expired: the quarantined file was deleted before it was parsed.
  status TEXT NOT NULL CHECK (status IN ('receiving', 'accepted', 'rejected', 'failed', 'expired')),
  outcome_code TEXT CHECK (outcome_code IS NULL OR (length(outcome_code) BETWEEN 1 AND 64 AND outcome_code GLOB '[a-z]*' AND outcome_code NOT GLOB '*[^a-z0-9_]*')),
  -- A display label only (never part of a key); cleared when the upload is refused, fails or expires.
  file_name TEXT CHECK (length(file_name) BETWEEN 1 AND 128),
  declared_type TEXT NOT NULL CHECK (declared_type IN ('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png', 'image/webp')),
  declared_bytes INTEGER CHECK (declared_bytes BETWEEN 1 AND 12582912),
  format TEXT CHECK (format IN ('csv', 'xlsx', 'jpeg', 'png', 'webp')),
  bytes INTEGER CHECK (bytes BETWEEN 1 AND 12582912),
  sha256 TEXT CHECK (sha256 IS NULL OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*')),
  part_count INTEGER CHECK (part_count BETWEEN 1 AND 12),
  -- The parse queue's state, set once the upload is accepted or expires (1B-T5).
  parse_state TEXT CHECK (parse_state IN ('queued', 'parsing', 'parsed', 'failed', 'cancelled')),
  parse_attempts INTEGER NOT NULL DEFAULT 0 CHECK (parse_attempts BETWEEN 0 AND 3),
  parse_failure TEXT,
  -- When the parse message was last sent or seen, and the attempts then.
  enqueued_at TEXT,
  enqueued_attempts INTEGER CHECK (enqueued_attempts IS NULL OR enqueued_attempts BETWEEN 0 AND 3),
  created_at TEXT NOT NULL,
  receive_deadline TEXT NOT NULL,
  accepted_at TEXT,
  expires_at TEXT,
  finished_at TEXT,
  CHECK ((status IN ('rejected', 'failed')) = (outcome_code IS NOT NULL)),
  CHECK ((status IN ('accepted', 'expired')) = (accepted_at IS NOT NULL)),
  CHECK ((status IN ('accepted', 'expired')) = (parse_state IS NOT NULL)),
  CHECK (accepted_at IS NULL OR (format IS NOT NULL AND bytes IS NOT NULL AND part_count IS NOT NULL AND expires_at IS NOT NULL)),
  -- An accepted import has its digest, and a receiving one still has its display name.
  CHECK (status <> 'accepted' OR sha256 IS NOT NULL),
  CHECK (status <> 'receiving' OR file_name IS NOT NULL)
) STRICT;
--> statement-breakpoint
CREATE INDEX import_uploads_receiving_idx ON import_uploads (receive_deadline) WHERE status = 'receiving';
--> statement-breakpoint
CREATE INDEX import_uploads_accepted_expiry_idx ON import_uploads (expires_at) WHERE status = 'accepted';
--> statement-breakpoint
-- The parts of an upload, each one quarantined object (up to 12 for a 12 MiB file).
CREATE TABLE import_parts (
  job_id TEXT NOT NULL REFERENCES import_uploads (job_id) ON DELETE CASCADE,
  part_index INTEGER NOT NULL CHECK (part_index BETWEEN 0 AND 11),
  object_key TEXT NOT NULL UNIQUE CHECK (object_key GLOB 'import_quarantine/*'),
  bytes INTEGER CHECK (bytes IS NULL OR bytes >= 0),
  sha256 TEXT CHECK (sha256 IS NULL OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*')),
  PRIMARY KEY (job_id, part_index)
) STRICT;
--> statement-breakpoint
-- The preview of an accepted upload: its layout, issues, totals and sanitized image.
CREATE TABLE import_previews (
  job_id TEXT PRIMARY KEY NOT NULL REFERENCES import_uploads (job_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ready', 'rejected', 'expired')),
  layout TEXT CHECK (layout IN ('meowjot', 'moneylover', 'spendee', 'generic', 'receipt')),
  issues TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(issues) AND json_type(issues) = 'array'),
  candidate_count INTEGER NOT NULL CHECK (candidate_count BETWEEN 0 AND 5000),
  review_required_count INTEGER NOT NULL CHECK (review_required_count BETWEEN 0 AND candidate_count),
  expense_total_minor INTEGER NOT NULL DEFAULT 0 CHECK (expense_total_minor >= 0),
  income_total_minor INTEGER NOT NULL DEFAULT 0 CHECK (income_total_minor >= 0),
  transfer_total_minor INTEGER NOT NULL DEFAULT 0 CHECK (transfer_total_minor >= 0),
  -- The sanitized receipt image, registered as an import_image object for 24 hours unless it is kept as a receipt.
  image_key TEXT UNIQUE CHECK (image_key IS NULL OR image_key GLOB 'import_image/*'),
  image_width INTEGER CHECK (image_width IS NULL OR image_width >= 1),
  image_height INTEGER CHECK (image_height IS NULL OR image_height >= 1),
  -- The receipt the image became, when the owner kept it (set by the vault, not a trigger).
  image_attachment_id TEXT UNIQUE,
  review_revision INTEGER NOT NULL DEFAULT 1 CHECK (review_revision >= 1),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  expired_at TEXT,
  CHECK ((status = 'expired') = (expired_at IS NOT NULL)),
  CHECK ((image_key IS NULL) = (image_width IS NULL) AND (image_key IS NULL) = (image_height IS NULL)),
  CHECK ((image_key IS NULL) = (image_attachment_id IS NULL)),
  CHECK (image_width IS NULL OR image_width * image_height <= 20000000),
  CHECK (status <> 'ready' OR layout IS NOT NULL),
  CHECK (status <> 'rejected' OR (candidate_count = 0 AND image_key IS NULL AND json_array_length(issues) >= 1))
) STRICT;
--> statement-breakpoint
CREATE INDEX import_previews_due_idx ON import_previews (expires_at) WHERE status <> 'expired';
--> statement-breakpoint
-- The rows a preview read from its file. source_row_id is image:1 or row:<n>, where n is 1 to 8 digits and the first is not 0.
CREATE TABLE import_candidates (
  job_id TEXT NOT NULL REFERENCES import_previews (job_id) ON DELETE CASCADE,
  source_row_id TEXT NOT NULL CHECK (source_row_id = 'image:1' OR (source_row_id GLOB 'row:[1-9]*' AND length(source_row_id) BETWEEN 5 AND 12 AND substr(source_row_id, 5) NOT GLOB '*[^0-9]*')),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 5000),
  occurred_on TEXT CHECK (occurred_on IS NULL OR (date(occurred_on) IS occurred_on AND occurred_on >= '1970-01-01')),
  type TEXT CHECK (type IN ('expense', 'income', 'transfer')),
  amount_minor INTEGER CHECK (amount_minor BETWEEN 1 AND 99999999999),
  wallet_label TEXT CHECK (length(wallet_label) BETWEEN 1 AND 80),
  category_label TEXT CHECK (length(category_label) BETWEEN 1 AND 80),
  merchant TEXT CHECK (length(merchant) BETWEEN 1 AND 120),
  note TEXT CHECK (length(note) BETWEEN 1 AND 500),
  issues TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(issues) AND json_type(issues) = 'array'),
  review_required INTEGER NOT NULL CHECK (review_required IN (0, 1)),
  -- A row that needs no review has every required value and no issue.
  CHECK (review_required = 1 OR (occurred_on IS NOT NULL AND type IS NOT NULL AND amount_minor IS NOT NULL AND wallet_label IS NOT NULL AND json_array_length(issues) = 0)),
  PRIMARY KEY (job_id, source_row_id),
  UNIQUE (job_id, ordinal)
) STRICT;
--> statement-breakpoint
-- A confirmation's frozen rows. The category's type must match the row's type (trigger below).
CREATE TABLE import_selections (
  selection_id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES import_previews (job_id) ON DELETE CASCADE,
  frozen_revision INTEGER NOT NULL CHECK (frozen_revision >= 1),
  row_count INTEGER NOT NULL CHECK (row_count BETWEEN 1 AND 5000),
  created_at TEXT NOT NULL,
  -- The preview's own expiry: frozen copies go when the candidates go.
  expires_at TEXT NOT NULL
) STRICT;
--> statement-breakpoint
CREATE INDEX import_selections_job_idx ON import_selections (job_id);
--> statement-breakpoint
CREATE INDEX import_selections_expiry_idx ON import_selections (expires_at);
--> statement-breakpoint
-- Transfers cannot be confirmed from a file (no layout names a destination).
CREATE TABLE import_selection_rows (
  selection_id TEXT NOT NULL REFERENCES import_selections (selection_id) ON DELETE CASCADE,
  source_row_id TEXT NOT NULL CHECK (source_row_id = 'image:1' OR (source_row_id GLOB 'row:[1-9]*' AND length(source_row_id) BETWEEN 5 AND 12 AND substr(source_row_id, 5) NOT GLOB '*[^0-9]*')),
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 5000),
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor BETWEEN 1 AND 99999999999),
  occurred_on TEXT NOT NULL CHECK (date(occurred_on) IS occurred_on AND occurred_on >= '1970-01-01'),
  wallet_id TEXT NOT NULL REFERENCES wallets (id),
  category_id TEXT NOT NULL REFERENCES categories (id),
  note TEXT CHECK (note IS NULL OR (length(note) BETWEEN 1 AND 500 AND note = trim(note))),
  merchant TEXT CHECK (merchant IS NULL OR (length(merchant) BETWEEN 1 AND 120 AND merchant = trim(merchant))),
  PRIMARY KEY (selection_id, source_row_id),
  UNIQUE (selection_id, ordinal)
) STRICT;
--> statement-breakpoint
CREATE TRIGGER import_selection_rows_category_type BEFORE INSERT ON import_selection_rows
  WHEN EXISTS (SELECT 1 FROM categories c WHERE c.id = NEW.category_id AND c.type IS NOT NEW.type)
BEGIN
  SELECT RAISE(ABORT, 'a selected row must name a category of its own type');
END;
--> statement-breakpoint
-- A confirmed row. transaction_id is NULL only once its transaction was purged; the row stays committed.
CREATE TABLE import_row_progress (
  job_id TEXT NOT NULL REFERENCES import_previews (job_id) ON DELETE CASCADE,
  source_row_id TEXT NOT NULL CHECK (source_row_id = 'image:1' OR (source_row_id GLOB 'row:[1-9]*' AND length(source_row_id) BETWEEN 5 AND 12 AND substr(source_row_id, 5) NOT GLOB '*[^0-9]*')),
  -- The selection the row was confirmed from (a later selection of the same import acknowledges the row instead).
  selection_id TEXT NOT NULL,
  transaction_id TEXT UNIQUE REFERENCES transactions (id) ON DELETE SET NULL,
  command_id TEXT NOT NULL,
  committed_at TEXT NOT NULL,
  PRIMARY KEY (job_id, source_row_id)
) STRICT;
--> statement-breakpoint
-- A committed row is exactly its frozen row: the selection belongs to the same import and still
-- matches the preview's review revision, the preview is ready, and the transaction (new, active,
-- version 1) carries the frozen type, amount, date, wallet, category, note and merchant. The
-- expiry check stays in code.
CREATE TRIGGER import_row_progress_guard BEFORE INSERT ON import_row_progress
  WHEN NOT EXISTS (
    SELECT 1 FROM import_selections s
      JOIN import_previews p ON p.job_id = s.job_id
      JOIN import_selection_rows r ON r.selection_id = s.selection_id AND r.source_row_id = NEW.source_row_id
      JOIN transactions t ON t.id = NEW.transaction_id
     WHERE s.selection_id = NEW.selection_id AND s.job_id = NEW.job_id
       AND p.status = 'ready' AND p.review_revision = s.frozen_revision
       AND t.type = r.type AND t.amount_minor = r.amount_minor AND t.occurred_on = r.occurred_on
       AND t.wallet_id = r.wallet_id AND t.category_id = r.category_id
       AND t.note IS r.note AND t.merchant IS r.merchant
       AND t.deleted_at IS NULL AND t.version = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'a confirmed row is its frozen row saved as a new transaction');
END;
--> statement-breakpoint
-- The receipts a person keeps. One receipt per import image.
CREATE TABLE attachments (
  id TEXT PRIMARY KEY NOT NULL,
  -- The import whose sanitized image was copied (no foreign key: a receipt outlives its import's rows).
  source_job_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'retained' CHECK (status IN ('retained', 'released')),
  object_key TEXT NOT NULL UNIQUE CHECK (object_key GLOB 'receipt/*/*/*/image.*'),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  bytes INTEGER NOT NULL CHECK (bytes BETWEEN 1 AND 12582912),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  width INTEGER NOT NULL CHECK (width >= 1),
  height INTEGER NOT NULL CHECK (height >= 1),
  retained_at TEXT NOT NULL,
  -- Stamped by pruneAttachments from the vault clock. The trigger on transaction_attachments
  -- sets the status when the last holder lets go, and cannot read the clock, so the stamp can lag.
  released_at TEXT,
  CHECK (width * height <= 20000000),
  CHECK (released_at IS NULL OR status = 'released'),
  -- The extension matches the content type.
  CHECK ((content_type = 'image/jpeg' AND object_key GLOB '*/image.jpg')
      OR (content_type = 'image/png' AND object_key GLOB '*/image.png')
      OR (content_type = 'image/webp' AND object_key GLOB '*/image.webp'))
) STRICT;
--> statement-breakpoint
CREATE INDEX attachments_released_idx ON attachments (released_at) WHERE status = 'released';
--> statement-breakpoint
-- One current receipt per record.
CREATE TABLE transaction_attachments (
  transaction_id TEXT PRIMARY KEY NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL REFERENCES attachments (id),
  attached_at TEXT NOT NULL
) STRICT;
--> statement-breakpoint
CREATE INDEX transaction_attachments_attachment_idx ON transaction_attachments (attachment_id);
--> statement-breakpoint
CREATE TRIGGER transaction_attachments_retained_insert BEFORE INSERT ON transaction_attachments
  WHEN NOT EXISTS (SELECT 1 FROM attachments a WHERE a.id = NEW.attachment_id AND a.status = 'retained')
BEGIN
  SELECT RAISE(ABORT, 'a record can hold only a retained receipt');
END;
--> statement-breakpoint
CREATE TRIGGER transaction_attachments_retained_update BEFORE UPDATE OF attachment_id ON transaction_attachments
  WHEN NOT EXISTS (SELECT 1 FROM attachments a WHERE a.id = NEW.attachment_id AND a.status = 'retained')
BEGIN
  SELECT RAISE(ABORT, 'a record can hold only a retained receipt');
END;
--> statement-breakpoint
-- Letting go of the last holder releases the receipt and makes its object due at once (B20). The
-- cascade from a purged transaction runs this trigger too.
CREATE TRIGGER transaction_attachments_unheld_delete AFTER DELETE ON transaction_attachments
  WHEN NOT EXISTS (SELECT 1 FROM transaction_attachments t WHERE t.attachment_id = OLD.attachment_id)
BEGIN
  UPDATE attachments SET status = 'released' WHERE id = OLD.attachment_id AND status = 'retained';
  UPDATE vault_objects SET delete_after = 0 WHERE key = (SELECT object_key FROM attachments WHERE id = OLD.attachment_id);
END;
--> statement-breakpoint
CREATE TRIGGER transaction_attachments_unheld_update AFTER UPDATE OF attachment_id ON transaction_attachments
  WHEN OLD.attachment_id IS NOT NEW.attachment_id
   AND NOT EXISTS (SELECT 1 FROM transaction_attachments t WHERE t.attachment_id = OLD.attachment_id)
BEGIN
  UPDATE attachments SET status = 'released' WHERE id = OLD.attachment_id AND status = 'retained';
  UPDATE vault_objects SET delete_after = 0 WHERE key = (SELECT object_key FROM attachments WHERE id = OLD.attachment_id);
END;
--> statement-breakpoint
-- The AI companion's consent and the notice version agreed to. One row. Nothing a person writes to
-- Bun, and no slip image, is stored here.
CREATE TABLE ai_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  companion INTEGER NOT NULL DEFAULT 0 CHECK (companion IN (0, 1)),
  cashback_tips INTEGER NOT NULL DEFAULT 0 CHECK (cashback_tips IN (0, 1)),
  -- The AI notice version agreed to; AI stays off without the current one.
  notice_version INTEGER CHECK (notice_version >= 1),
  updated_at TEXT NOT NULL,
  CHECK (companion = 0 OR notice_version IS NOT NULL)
) STRICT;
--> statement-breakpoint
-- How many times each AI feature ran on a Bangkok day.
CREATE TABLE ai_usage (
  day TEXT NOT NULL CHECK (date(day) IS day),
  feature TEXT NOT NULL CHECK (feature IN ('parse', 'slip', 'note', 'ask')),
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses BETWEEN 0 AND 1000),
  PRIMARY KEY (day, feature)
) STRICT;
--> statement-breakpoint
-- The purge watermark: the purged entries, read in revision order (1B-T8).
CREATE INDEX entity_changes_purged_idx ON entity_changes (revision) WHERE state = 'purged';
