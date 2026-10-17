// Device diaries on SQLCipher (expo-sqlite built with useSQLCipher; see
// app.json). Metro uses database.web.ts on web instead. Verified only on
// development builds (docs/implementation/sqlcipher-device-proof.md).
import { File, FileMode } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { createSerialDatabase } from './serialDatabase.ts';
import { DiaryKeyRejected } from './types.ts';
import type { DiaryFiles, SqlConnection, SqlValue } from './types.ts';

const KEY = /^[0-9a-f]{64}$/;

function directoryUri(): string {
  const directory = String(SQLite.defaultDatabaseDirectory);
  return directory.startsWith('file:') ? directory : `file://${directory}`;
}

function connection(db: SQLite.SQLiteDatabase): SqlConnection {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => (await db.runAsync(sql, params as SqlValue[])).changes,
    all: <T>(sql: string, params: readonly SqlValue[] = []) => db.getAllAsync<T>(sql, params as SqlValue[]),
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
        } catch (error) {
          // Only SQLITE_NOTADB means a wrong key; busy, I/O or corruption errors stay what they are.
          if (/not a database|SQLITE_NOTADB/i.test(error instanceof Error ? error.message : String(error))) throw new DiaryKeyRejected();
          throw error;
        }
        await db.execAsync('PRAGMA temp_store = MEMORY; PRAGMA foreign_keys = ON;');
      } catch (error) {
        await db.closeAsync().catch(() => undefined);
        throw error;
      }
      // One keyed connection for everything, transactions included:
      // withExclusiveTransactionAsync would open a second, unkeyed connection.
      return createSerialDatabase(connection(db));
    },
    async delete(name) {
      // deleteDatabaseAsync throws for a missing file; that is a finished delete here.
      if (!new File(directoryUri(), name).exists) return;
      await SQLite.deleteDatabaseAsync(name);
    },
  };
}

/** For the native proof harness: whether a diary file starts with the plaintext SQLite header. */
export function diaryHeaderIsPlainSqlite(name: string): boolean {
  const handle = new File(directoryUri(), name).open(FileMode.ReadOnly);
  try {
    return String.fromCharCode(...handle.readBytesSync(16)) === 'SQLite format 3\u0000';
  } finally {
    handle.close();
  }
}
