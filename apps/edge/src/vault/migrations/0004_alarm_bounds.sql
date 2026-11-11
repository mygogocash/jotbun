-- Bounds for the alarm's due-time reads (alarm-hardening, the 1B-T11 review's m4). attachmentsDueAt and
-- importsDueAt run after every write that touches the vault (1B-T11's rearm), so neither may read every row its
-- table has ever held. 0000 to 0003 are never edited.
--
-- The receipts whose holders changed since pruneAttachments last checked every receipt. A retained receipt can be
-- left with no holder only by one of the four events below: it is inserted, or set back to retained, before any
-- record holds it; or its last holder is deleted, or moved to another receipt (B20's triggers release it then,
-- unless a statement went around them). So attachmentsDueAt's safety net, a retained receipt no record holds, reads
-- only the receipts listed here. pruneAttachments still checks every retained receipt and empties this table in the
-- same block. No foreign key: a listed receipt that has gone is skipped by the join and dropped at the next prune.
CREATE TABLE attachment_checks (
  attachment_id TEXT PRIMARY KEY NOT NULL
) STRICT;
--> statement-breakpoint
CREATE TRIGGER attachments_checked_insert AFTER INSERT ON attachments
  WHEN NEW.status = 'retained'
BEGIN
  INSERT OR IGNORE INTO attachment_checks (attachment_id) VALUES (NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER attachments_checked_update AFTER UPDATE OF id, status ON attachments
  WHEN NEW.status = 'retained'
BEGIN
  INSERT OR IGNORE INTO attachment_checks (attachment_id) VALUES (NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER transaction_attachments_checked_delete AFTER DELETE ON transaction_attachments
BEGIN
  INSERT OR IGNORE INTO attachment_checks (attachment_id) VALUES (OLD.attachment_id);
END;
--> statement-breakpoint
CREATE TRIGGER transaction_attachments_checked_update AFTER UPDATE OF attachment_id ON transaction_attachments
  WHEN OLD.attachment_id IS NOT NEW.attachment_id
BEGIN
  INSERT OR IGNORE INTO attachment_checks (attachment_id) VALUES (OLD.attachment_id);
END;
--> statement-breakpoint
-- A vault upgraded from 0003 starts with the receipts that already have no holder.
INSERT INTO attachment_checks (attachment_id)
  SELECT id FROM attachments
   WHERE status = 'retained' AND NOT EXISTS (SELECT 1 FROM transaction_attachments ta WHERE ta.attachment_id = attachments.id);
--> statement-breakpoint
-- The import records that are not purged. A purged head stays for good, so without this index importsDueAt would
-- walk every import record the vault ever had. Its WHERE is importsDueAt's (previews.ts, LIVE_IMPORT_HEADS), term
-- for term, so the planner can use it: the entity names are the API's REVIEW_ENTITY and SELECTION_ENTITY.
CREATE INDEX entity_heads_imports_idx ON entity_heads (entity, entity_id)
  WHERE entity IN ('import_selection', 'import_review') AND state <> 'purged';
