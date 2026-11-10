-- The RED's stub of 0004 (alarm-hardening): the checks table only, so the tests can read it. No triggers, no
-- backfill and no import index: nothing fills the table, and the due-time reads still read every row.
CREATE TABLE attachment_checks (
  attachment_id TEXT PRIMARY KEY NOT NULL
) STRICT;
