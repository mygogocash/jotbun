// A transaction-capable test adapter on Node's built-in SQLite (node:sqlite):
// the same SQL, constraints and transactions as the device, in temporary
// files. SQLCipher is simulated only as far as keying goes: a file remembers
// the key it was created with and refuses any other. Test use only.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { DiaryKeyRejected } from '../types.ts';
import type { DiaryFiles, SqlDatabase, SqlExecutor, SqlValue } from '../types.ts';

export type FaultHook = (sql: string) => void;

export type TestDiaryFiles = DiaryFiles & {
  /** Throws from `hook` before a matching statement runs (simulates a failure halfway through). */
  failWhen(hook: FaultHook | null): void;
  /** Raw access to a file, bypassing the key (for tampering in tests). */
  raw(name: string): DatabaseSync;
  /** Names of files that exist. */
  names(): string[];
  dispose(): void;
};

export function createTestDiaryFiles(): TestDiaryFiles {
  const dir = mkdtempSync(join(tmpdir(), 'gogospend-diary-'));
  const keys = new Map<string, string>();
  const known = new Set<string>();
  let fault: FaultHook | null = null;
  const path = (name: string) => join(dir, name);
  const digest = (key: string) => createHash('sha256').update(key).digest('hex');

  function executor(db: DatabaseSync): SqlExecutor {
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
    };
  }

  return {
    async exists(name) {
      return existsSync(path(name));
    },
    async open(name, key) {
      if (!/^[0-9a-f]{64}$/.test(key)) throw new RangeError('a diary key is 64 hex digits');
      const stored = keys.get(name);
      if (existsSync(path(name)) && stored !== undefined && stored !== digest(key)) throw new DiaryKeyRejected();
      if (existsSync(path(name)) && stored === undefined) throw new DiaryKeyRejected();
      keys.set(name, digest(key));
      known.add(name);
      const db = new DatabaseSync(path(name));
      const base = executor(db);
      // One connection, so operations queue behind a running transaction (as an exclusive one would).
      let queue: Promise<unknown> = Promise.resolve();
      const serial = <T>(task: () => Promise<T>): Promise<T> => {
        const next = queue.then(task, task);
        queue = next.catch(() => undefined);
        return next;
      };
      let closed = false;
      const open = () => {
        if (closed) throw new Error('database is closed');
      };
      const database: SqlDatabase = {
        exec: (sql) => serial(async () => (open(), base.exec(sql))),
        run: (sql, params) => serial(async () => (open(), base.run(sql, params))),
        all: <T>(sql: string, params?: readonly SqlValue[]) => serial(async () => (open(), base.all<T>(sql, params))),
        transaction: <T>(fn: (tx: SqlExecutor) => Promise<T>) =>
          serial(async () => {
            open();
            db.exec('BEGIN IMMEDIATE');
            try {
              const result = await fn(base);
              db.exec('COMMIT');
              return result;
            } catch (error) {
              db.exec('ROLLBACK');
              throw error;
            }
          }),
        close: () =>
          serial(async () => {
            if (!closed) db.close();
            closed = true;
          }),
      };
      return database;
    },
    async delete(name) {
      for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(path(name) + suffix, { force: true });
      keys.delete(name);
      known.delete(name);
    },
    failWhen(hook) {
      fault = hook;
    },
    raw(name) {
      return new DatabaseSync(path(name));
    },
    names() {
      return [...known].filter((name) => existsSync(path(name))).sort();
    },
    dispose() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
