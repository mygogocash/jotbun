-- How each record was made (P3-T2, B2): one of the seven sources in TRANSACTION_SOURCES
-- (packages/contracts/src/v1/transactions.ts), or NULL for a record made before phase 3 and
-- for one whose create named none. Only a create sets it. 0000 to 0004 are never edited.
--
-- transactions only gains a column; it is never rebuilt. A rebuild would delete every receipt
-- link (transaction_attachments, ON DELETE CASCADE) and clear every import link
-- (import_row_progress, ON DELETE SET NULL). ADD COLUMN keeps every row as it is, and the
-- previous release's statements, which never name the column, still run.
ALTER TABLE transactions ADD COLUMN source TEXT CHECK (source IN ('typed', 'photo', 'slip_import', 'tell_bun', 'statement', 'share_extension', 'siri'));
