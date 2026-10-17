// Device diaries on SQLCipher (expo-sqlite built with useSQLCipher; see
// app.json). Metro uses database.web.ts on web instead. Verified only on
// development builds (docs/implementation/sqlcipher-device-proof.md).
import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { DiaryKeyRejected } from './types.ts';
import type { DiaryFiles, SqlDatabase, SqlExecutor, SqlValue } from './types.ts';

const KEY = /^[0-9a-f]{64}$/;

function directoryUri(): string {
  const directory = String(SQLite.defaultDatabaseDirectory);
  return directory.startsWith('file:') ? directory : `file://${directory}`;
}

function executor(connection: SQLite.SQLiteDatabase): SqlExecutor {
  return {
    exec: (sql) => connection.execAsync(sql),
    run: async (sql, params = []) => (await connection.runAsync(sql, params as SqlValue[])).changes,
    all: <T>(sql: string, params: readonly SqlValue[] = []) => connection.getAllAsync<T>(sql, params as SqlValue[]),
  };
}

function wrap(db: SQLite.SQLiteDatabase): SqlDatabase {
  return {
    ...executor(db),
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      let result: T | undefined;
      // A separate exclusive connection: nothing else can interleave.
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = await fn(executor(txn));
      });
      return result as T;
    },
    close: () => db.closeAsync(),
  };
}

/**
 * Opens a diary with a raw 256-bit key. Refuses to run on a SQLite without
 * SQLCipher (never an unencrypted diary), checks the key with a first read
 * (a wrong key fails as "not a database"), and keeps temporary tables and
 * indices in memory so no plaintext temp file reaches the disk.
 */
export function deviceDiaryFiles(): DiaryFiles {
  return {
    async exists(name) {
      return new File(directoryUri(), name).exists;
    },
    async open(name, key) {
      if (!KEY.test(key)) throw new RangeError('A diary key is 64 hex digits.');
      const db = await SQLite.openDatabaseAsync(name, { useNewConnection: true });
      try {
        const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
        if (!cipher?.cipher_version) throw new Error('SQLCipher is not available; refusing to store an unencrypted diary.');
        await db.execAsync(`PRAGMA key = "x'${key}'"`);
        try {
          await db.getFirstAsync('SELECT count(*) AS n FROM sqlite_master');
        } catch {
          throw new DiaryKeyRejected();
        }
        await db.execAsync('PRAGMA temp_store = MEMORY; PRAGMA foreign_keys = ON;');
      } catch (error) {
        await db.closeAsync().catch(() => undefined);
        throw error;
      }
      return wrap(db);
    },
    async delete(name) {
      await SQLite.deleteDatabaseAsync(name);
    },
  };
}
