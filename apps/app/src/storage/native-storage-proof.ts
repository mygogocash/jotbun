// The native storage proof (S2 device check). Run on iOS and Android
// development builds from a developer-only entry point; it uses a synthetic
// account and synthetic records, reports pass/fail per check, and never
// returns or logs record contents, keys or file bytes beyond a yes/no.
// Procedure and results: docs/implementation/sqlcipher-device-proof.md.
import * as Crypto from 'expo-crypto';
import { File, FileMode } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

import { AccountDatabase } from './accountDatabase.ts';
import { deviceDiaryFiles } from './database';
import { createSecureKeyStore } from './keyStore.ts';
import { DIARY_MIGRATIONS } from './migrations.ts';
import { DiaryLocked, StaleEpochError } from './types.ts';

export const PROOF_ACCOUNT = '0f000000-0000-4000-8000-00000000f00f';
const WALLET = '0f000000-0000-4000-8000-0000000000a1';
const SQLITE_HEADER = 'SQLite format 3\u0000';

export type ProofCheck = { name: string; result: 'pass' | 'fail' | 'manual'; note?: string };
export type ProofPhase = 'write' | 'verify-after-restart' | 'checks';

async function check(name: string, run: () => Promise<boolean>): Promise<ProofCheck> {
  try {
    return { name, result: (await run()) ? 'pass' : 'fail' };
  } catch (error) {
    return { name, result: 'fail', note: error instanceof Error ? error.name : 'error' };
  }
}

function fileHeaderIsPlainSqlite(name: string): boolean {
  const directory = String(SQLite.defaultDatabaseDirectory);
  const file = new File(directory.startsWith('file:') ? directory : `file://${directory}`, name);
  const handle = file.open(FileMode.ReadOnly);
  try {
    const header = handle.readBytesSync(16);
    return String.fromCharCode(...header) === SQLITE_HEADER;
  } finally {
    handle.close();
  }
}

/**
 * `write` creates the proof diary with a synthetic wallet; kill the app
 * process, relaunch and run `verify-after-restart`; then run `checks`, which
 * covers encryption at rest, key loss and rejection, migration rollback, a
 * stale-epoch write and erase, and deletes the proof diary at the end.
 */
export async function runNativeStorageProof(phase: ProofPhase): Promise<ProofCheck[]> {
  const session = { epoch: 1 };
  const keys = createSecureKeyStore(SecureStore, Crypto.getRandomBytes, SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY);
  const files = deviceDiaryFiles();
  const database = new AccountDatabase({ files, keys, epoch: () => session.epoch });
  const name = `diary-${PROOF_ACCOUNT}.db`;
  const wallet = { id: WALLET, name: 'Proof', currency: 'THB', opening_minor: '12345', tracking_start: '2026-01-01', archived: false, version: 1 };

  if (phase === 'write') {
    return [
      await check('sqlcipher_diary_opens_and_writes', async () => {
        const store = await database.open(PROOF_ACCOUNT);
        await store.applyChangeGroups([{ revision: '1', command_id: Crypto.randomUUID(), changes: [{ entity: 'wallet', id: WALLET, version: 1, state: 'active', snapshot: wallet }] }], 'proof-cursor-1');
        await store.lock();
        return true;
      }),
    ];
  }
  if (phase === 'verify-after-restart') {
    return [
      await check('data_survives_process_restart', async () => {
        const store = await database.open(PROOF_ACCOUNT);
        const state = await store.readState();
        await store.lock();
        return state.cursor === 'proof-cursor-1' && state.walletTotals[WALLET] === '12345';
      }),
    ];
  }

  const results: ProofCheck[] = [];
  results.push(await check('encrypted_at_rest', async () => (await files.exists(name)) && !fileHeaderIsPlainSqlite(name)));
  results.push(await check('rejected_key_locks', async () => {
    const real = await keys.get(PROOF_ACCOUNT);
    await SecureStore.setItemAsync(`gogospend.diary.v1.${PROOF_ACCOUNT}`, 'f'.repeat(64), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    try {
      await database.open(PROOF_ACCOUNT);
      return false;
    } catch (error) {
      return error instanceof DiaryLocked && error.reason === 'key_rejected';
    } finally {
      if (real) await SecureStore.setItemAsync(`gogospend.diary.v1.${PROOF_ACCOUNT}`, real, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    }
  }));
  results.push(await check('missing_key_locks_and_keeps_the_file', async () => {
    const real = await keys.get(PROOF_ACCOUNT);
    await keys.delete(PROOF_ACCOUNT);
    try {
      await database.open(PROOF_ACCOUNT);
      return false;
    } catch (error) {
      return error instanceof DiaryLocked && error.reason === 'key_missing' && (await files.exists(name));
    } finally {
      if (real) await SecureStore.setItemAsync(`gogospend.diary.v1.${PROOF_ACCOUNT}`, real, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    }
  }));
  results.push(await check('failed_migration_rolls_back', async () => {
    const broken = [...DIARY_MIGRATIONS, { version: DIARY_MIGRATIONS.length + 1, statements: ['CREATE TABLE proof_half_done (x TEXT)', 'NOT SQL'] }];
    const failed = await new AccountDatabase({ files, keys, epoch: () => session.epoch, migrations: broken }).open(PROOF_ACCOUNT).then(() => false, () => true);
    const store = await database.open(PROOF_ACCOUNT);
    const intact = (await store.readState()).cursor === 'proof-cursor-1';
    await store.lock();
    return failed && intact;
  }));
  results.push(await check('stale_epoch_write_refused', async () => {
    const old = await database.open(PROOF_ACCOUNT);
    session.epoch += 1;
    const refused = await old.applyChangeGroups([], 'stale').then(() => false, (error) => error instanceof StaleEpochError);
    await old.lock();
    return refused;
  }));
  results.push(await check('erase_removes_diary_and_key', async () => {
    const store = await database.open(PROOF_ACCOUNT);
    await store.eraseAfterConfirmation();
    return !(await files.exists(name)) && (await keys.get(PROOF_ACCOUNT)) === null;
  }));
  results.push({ name: 'android_backup_disabled', result: 'manual', note: 'adb backup / Auto Backup excludes the app (android.allowBackup=false)' });
  results.push({ name: 'ios_backup_excluded', result: 'manual', note: 'needs a native exclusion step; see the device proof doc' });
  return results;
}
