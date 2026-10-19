import { DiarySchemaTooNew } from './types.ts';
import type { SqlDatabase } from './types.ts';

export type DiaryMigration = { version: number; statements: readonly string[] };

/**
 * Versioned diary schema. Each migration runs in one transaction together
 * with its PRAGMA user_version bump, so a failure leaves the previous version
 * intact. Append only; never edit a released migration.
 *
 * Confirmed server state and on-device drafts live in separate tables, with
 * every amount kept as the exact integer string from the DTO (inside JSON).
 * No credential, token or session binding is ever stored here.
 */
export const DIARY_MIGRATIONS: readonly DiaryMigration[] = [
  {
    version: 1,
    statements: [
      // account_id (the diary's owner), cursor, applied_revision.
      `CREATE TABLE diary_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT`,
      // Each entity's latest confirmed state; tombstones stay (deleted), purged ones keep no data.
      `CREATE TABLE confirmed_entities (
         entity TEXT NOT NULL,
         id TEXT NOT NULL,
         version INTEGER NOT NULL CHECK (version >= 1),
         state TEXT NOT NULL CHECK (state IN ('active', 'deleted', 'purged')),
         snapshot TEXT CHECK ((state = 'purged') = (snapshot IS NULL)),
         PRIMARY KEY (entity, id)
       ) STRICT`,
      // Derived from confirmed records in the same transaction that changes them.
      `CREATE TABLE confirmed_wallet_totals (wallet_id TEXT PRIMARY KEY, balance_minor TEXT NOT NULL) STRICT`,
      `CREATE TABLE pending_entries (
         entity_id TEXT PRIMARY KEY,
         command_id TEXT NOT NULL UNIQUE,
         entry TEXT NOT NULL,
         created_at TEXT NOT NULL
       ) STRICT`,
      `CREATE TABLE outbox (
         command_id TEXT PRIMARY KEY REFERENCES pending_entries (command_id),
         account_id TEXT NOT NULL,
         kind TEXT NOT NULL CHECK (kind = 'transaction.create'),
         schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
         payload TEXT NOT NULL,
         state TEXT NOT NULL CHECK (state IN ('unsent', 'sending', 'uncertain', 'needs_review', 'paused_upgrade', 'acknowledged')),
         first_transmission_at TEXT,
         created_at TEXT NOT NULL,
         acked_revision TEXT CHECK ((state = 'acknowledged') = (acked_revision IS NOT NULL)),
         CHECK (state = 'unsent' OR state = 'needs_review' OR state = 'paused_upgrade' OR first_transmission_at IS NOT NULL)
       ) STRICT`,
    ],
  },
  {
    version: 2,
    statements: [
      // The import review draft (spend/v1/importDraftStore.ts): one row per
      // account, its key and JSON envelope as the store writes them.
      `CREATE TABLE import_drafts (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT`,
    ],
  },
];

/** Applies pending migrations; refuses a diary written by a newer app version. Returns the version. */
export async function migrateDiary(db: SqlDatabase, migrations: readonly DiaryMigration[] = DIARY_MIGRATIONS): Promise<number> {
  migrations.forEach((migration, index) => {
    if (!Number.isInteger(migration.version) || migration.version !== index + 1) throw new RangeError('diary migrations are numbered 1, 2, 3, ...');
  });
  const [{ user_version: current }] = await db.all<{ user_version: number }>('PRAGMA user_version');
  const latest = migrations.length;
  if (current > latest) throw new DiarySchemaTooNew();
  for (const migration of migrations.slice(current)) {
    await db.transaction(async (tx) => {
      for (const statement of migration.statements) await tx.exec(statement);
      await tx.exec(`PRAGMA user_version = ${migration.version}`);
    });
  }
  return latest;
}
