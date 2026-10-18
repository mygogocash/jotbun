import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';

import { poolConfigFromUrl } from './database-config';
import { ConfigurationError } from '../common/configuration-error';

/** apps/api/drizzle, from both src/database and dist/database. */
export const MIGRATIONS_FOLDER = join(__dirname, '..', '..', 'drizzle');

export type JournalMigration = { tag: string; when: number; hash: string };

const TAG = /^(\d{4})_[a-z0-9_]+$/;

/**
 * Reads meta/_journal.json and checks it against the .sql files: tags are
 * numbered 0001, 0002, … in order with strictly increasing `when`, and every
 * file is listed exactly once. Drizzle silently skips an entry whose `when` is
 * not after the last applied one, so these checks keep the journal honest.
 */
export function readJournal(folder = MIGRATIONS_FOLDER): JournalMigration[] {
  const journal = JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string; when: number }[];
  };
  const migrations = journal.entries.map((entry, index) => {
    const match = TAG.exec(entry.tag);
    if (entry.idx !== index || !match || Number(match[1]) !== index + 1) {
      throw new ConfigurationError(`Migration journal entry ${index} is out of sequence.`);
    }
    if (index > 0 && !(entry.when > journal.entries[index - 1].when)) {
      throw new ConfigurationError(`Migration ${entry.tag} must have a later "when" than its predecessor.`);
    }
    const sql = readFileSync(join(folder, `${entry.tag}.sql`), 'utf8');
    return { tag: entry.tag, when: entry.when, hash: createHash('sha256').update(sql).digest('hex') };
  });
  const files = readdirSync(folder).filter((name) => name.endsWith('.sql')).sort();
  const listed = migrations.map((migration) => `${migration.tag}.sql`);
  if (files.join('\n') !== listed.join('\n')) {
    throw new ConfigurationError('Migration files and journal entries do not match.');
  }
  return migrations;
}

/**
 * Fails if an applied migration's file changed or is missing from the
 * journal, or if a journal entry older than the newest applied one was never
 * applied (Drizzle only runs entries newer than the last applied one, so it
 * would skip that entry forever).
 */
export async function verifyAppliedMigrations(client: Client, migrations: JournalMigration[]): Promise<void> {
  const exists = await client.query<{ present: boolean }>(
    `SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present`,
  );
  if (!exists.rows[0].present) return;
  const applied = await client.query<{ hash: string; created_at: string }>(
    'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at',
  );
  const appliedWhen = new Set<number>();
  for (const row of applied.rows) {
    const migration = migrations.find((candidate) => candidate.when === Number(row.created_at));
    if (!migration) throw new ConfigurationError('The database has an applied migration that is not in the journal.');
    if (migration.hash !== row.hash) {
      throw new ConfigurationError(`Applied migration ${migration.tag} was edited after it ran; add a new migration instead.`);
    }
    appliedWhen.add(migration.when);
  }
  const newestApplied = Math.max(0, ...appliedWhen);
  const skipped = migrations.find((migration) => migration.when <= newestApplied && !appliedWhen.has(migration.when));
  if (skipped) {
    throw new ConfigurationError(`Migration ${skipped.tag} is older than the newest applied migration but was never applied; renumber it after the applied ones.`);
  }
}

/**
 * Applies pending migrations once, under an advisory lock, after verifying the
 * journal and every already-applied file. Run from a controlled release step
 * with the migration-only `DATABASE_DIRECT_URL`, never on API startup.
 */
export async function runMigrations(connectionString: string, folder = MIGRATIONS_FOLDER): Promise<void> {
  const migrations = readJournal(folder);
  const client = new Client(poolConfigFromUrl(connectionString, 1));
  await client.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(hashtext('gogospend.migrations'))`);
    await verifyAppliedMigrations(client, migrations);
    await migrate(drizzle(client), { migrationsFolder: folder });
  } finally {
    await client.query('SELECT pg_advisory_unlock_all()').catch(() => undefined);
    await client.end();
  }
}
