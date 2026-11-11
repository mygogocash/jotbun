-- The alarm's two indexes (1B-T11), ported from apps/api/drizzle/0015_privacy.sql
-- without the API's account_id column (a vault holds one account). The vault
-- reschedules its alarm after every call that writes, and 1A-T8b's nextDue reads
-- the earliest deletion each time (transactions_deleted_idx; without it, a scan of
-- every record). Each purge group reads and deletes the earlier changes of its
-- entities (entity_changes_entity_idx; without it, two scans of the change log).
-- 0000 to 0002 are never edited.

CREATE INDEX transactions_deleted_idx ON transactions (deleted_at) WHERE deleted_at IS NOT NULL;
--> statement-breakpoint
CREATE INDEX entity_changes_entity_idx ON entity_changes (entity, entity_id);
