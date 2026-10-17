// A test adapter on Node's built-in SQLite (node:sqlite): the same SQL,
// constraints and transaction wrapper (createSerialDatabase) as the device,
// in temporary files. SQLCipher is simulated only as far as keying goes: a
// file remembers the key it was created with and refuses any other. Like the
// device, deleting a file that still has an open connection fails. Test use only.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createSerialDatabase } from '../serialDatabase.ts';
import { DiaryKeyRejected } from '../types.ts';
import type { DiaryFiles, SqlConnection, SqlValue } from '../types.ts';

export type FaultHook = (sql: string) => void;

export type TestDiaryFiles = DiaryFiles & {
  /** Runs `hook` before every statement (including BEGIN/COMMIT); it may throw to fail that statement. */
  failWhen(hook: FaultHook | null): void;
  /** Raw access to a file, bypassing the key (for tampering in tests). */
  raw(name: string): DatabaseSync;
  /** Names of files that exist. */
  names(): string[];
  /** Open connections per file. */
  openCount(name: string): number;
  dispose(): void;
};

export function createTestDiaryFiles(): TestDiaryFiles {
  const dir = mkdtempSync(join(tmpdir(), 'gogospend-diary-'));
  const keys = new Map<string, string>();
  const handles = new Map<string, number>();
  let fault: FaultHook | null = null;
  const path = (name: string) => join(dir, name);
  const digest = (key: string) => createHash('sha256').update(key).digest('hex');

  function connection(name: string, db: DatabaseSync): SqlConnection {
    return {
      async exec(sql) {
        fault?.(sql);
        db.exec(sql);
      },
      async run(sql, params = []) {
        fault?.(sql);
        return Number(db.prepare(sql).run(...(params as SqlValue[])).changes);
      },
      async all<T>(sql: string, params: readonly SqlValue[] = []) {
        fault?.(sql);
        return db.prepare(sql).all(...(params as SqlValue[])) as T[];
      },
      async close() {
        db.close();
        handles.set(name, (handles.get(name) ?? 1) - 1);
      },
    };
  }

  return {
    async exists(name) {
      return existsSync(path(name));
    },
    async open(name, key) {
      if (!/^[0-9a-f]{64}$/.test(key)) throw new RangeError('a diary key is 64 hex digits');
      if (existsSync(path(name)) && keys.get(name) !== digest(key)) throw new DiaryKeyRejected();
      keys.set(name, digest(key));
      handles.set(name, (handles.get(name) ?? 0) + 1);
      return createSerialDatabase(connection(name, new DatabaseSync(path(name))));
    },
    async delete(name) {
      if ((handles.get(name) ?? 0) > 0) throw new Error('database is open');
      for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(path(name) + suffix, { force: true });
      keys.delete(name);
    },
    failWhen(hook) {
      fault = hook;
    },
    raw(name) {
      return new DatabaseSync(path(name));
    },
    names() {
      return [...keys.keys()].filter((name) => existsSync(path(name))).sort();
    },
    openCount(name) {
      return handles.get(name) ?? 0;
    },
    dispose() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
