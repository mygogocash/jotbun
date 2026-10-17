import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Client } from 'pg';

import { MIGRATIONS_FOLDER, readJournal, verifyAppliedMigrations } from './migrations';

let folder: string;

function journal(entries: { tag: string; when: number }[], files = entries.map((entry) => entry.tag)): string {
  folder = mkdtempSync(join(tmpdir(), 'gogospend-journal-'));
  mkdirSync(join(folder, 'meta'));
  writeFileSync(
    join(folder, 'meta', '_journal.json'),
    JSON.stringify({ version: '7', dialect: 'postgresql', entries: entries.map((entry, idx) => ({ idx, version: '7', breakpoints: true, ...entry })) }),
  );
  for (const tag of files) writeFileSync(join(folder, `${tag}.sql`), 'SELECT 1;');
  return folder;
}

afterEach(() => {
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe('migration journal', () => {
  it('the committed journal matches its SQL files', () => {
    const tags = readJournal().map((migration) => migration.tag);
    // Every migration file, in order. Later migrations are numbered when they are
    // integrated, so only the already-integrated prefix is pinned by name.
    expect(tags).toEqual(readdirSync(MIGRATIONS_FOLDER).filter((name) => name.endsWith('.sql')).map((name) => name.slice(0, -'.sql'.length)).sort());
    expect(tags.slice(0, 14)).toEqual(['0001_identity', '0002_rate_limits', '0003_sessions_policies', '0004_jobs_security', '0005_commands', '0006_wallets_categories', '0007_transactions', '0008_budgets', '0009_jobs_storage', '0010_sync', '0011_auth_events', '0012_account_linking', '0013_exports', '0014_import_intake']);
  });

  it('accepts a contiguous, increasing journal', () => {
    expect(readJournal(journal([{ tag: '0001_a', when: 1 }, { tag: '0002_b', when: 2 }]))).toHaveLength(2);
  });

  it('rejects a "when" that does not increase, which Drizzle would silently skip', () => {
    expect(() => readJournal(journal([{ tag: '0001_a', when: 2 }, { tag: '0002_b', when: 2 }]))).toThrow(/later "when"/);
  });

  it('rejects a gap or misnumbered tag', () => {
    expect(() => readJournal(journal([{ tag: '0001_a', when: 1 }, { tag: '0003_c', when: 2 }]))).toThrow(/out of sequence/);
  });

  it('rejects an SQL file that is not in the journal', () => {
    expect(() => readJournal(journal([{ tag: '0001_a', when: 1 }], ['0001_a', '0002_orphan']))).toThrow(/do not match/);
  });

  it('rejects a journal entry without its SQL file', () => {
    expect(() => readJournal(journal([{ tag: '0001_a', when: 1 }], []))).toThrow();
  });
});

describe('applied-migration verification', () => {
  const fakeClient = (applied: { hash: string; created_at: string }[]) =>
    ({
      query: async (text: string) => (text.includes('to_regclass') ? { rows: [{ present: true }] } : { rows: applied }),
    }) as unknown as Client;
  const migrations = [
    { tag: '0001_a', when: 1, hash: 'h1' },
    { tag: '0002_b', when: 2, hash: 'h2' },
    { tag: '0003_c', when: 3, hash: 'h3' },
  ];

  it('accepts applied migrations whose files are unchanged, with newer ones pending', async () => {
    await expect(verifyAppliedMigrations(fakeClient([{ hash: 'h1', created_at: '1' }]), migrations)).resolves.toBeUndefined();
  });

  it('refuses an older journal entry that was never applied, which Drizzle would skip forever', async () => {
    const applied = [{ hash: 'h1', created_at: '1' }, { hash: 'h3', created_at: '3' }];
    await expect(verifyAppliedMigrations(fakeClient(applied), migrations)).rejects.toThrow(/0002_b.*never applied/);
  });

  it('refuses an applied migration whose file changed', async () => {
    await expect(verifyAppliedMigrations(fakeClient([{ hash: 'edited', created_at: '1' }]), migrations)).rejects.toThrow(/edited after it ran/);
  });
});
