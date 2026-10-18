// The native storage proof (S2 device check). Run on iOS and Android
// development builds from a developer-only entry point; it uses a synthetic
// account and synthetic records, reports pass/fail per check, and never
// returns or logs record contents, keys or file bytes beyond a yes/no.
// Procedure and results: docs/implementation/sqlcipher-device-proof.md.
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { AccountDatabase } from './accountDatabase.ts';
import { deviceDiaryFiles, diaryHeaderIsPlainSqlite } from './database';
import { createSecureKeyStore } from './keyStore.ts';
import { DIARY_MIGRATIONS } from './migrations.ts';
import { DiaryLocked, StaleEpochError } from './types.ts';
import type { CommittedChangeGroup } from '@gogospend/contracts';

export const PROOF_ACCOUNT = '0f000000-0000-4000-8000-00000000f00f';
const WALLET = '0f000000-0000-4000-8000-0000000000a1';

export type ProofCheck = { name: string; result: 'pass' | 'fail' | 'manual'; note?: string };
export type ProofPhase = 'write' | 'write-large' | 'verify-after-restart' | 'checks';

async function check(name: string, run: () => Promise<boolean>): Promise<ProofCheck> {
  try {
    return { name, result: (await run()) ? 'pass' : 'fail' };
  } catch (error) {
    return { name, result: 'fail', note: error instanceof Error ? error.name : 'error' };
  }
}

/**
 * `write` creates the proof diary with a synthetic wallet; kill the app
 * process, relaunch and run `verify-after-restart`. `write-large` applies one
 * large delta transaction: kill the app while it runs, relaunch and verify -
 * the diary must hold either all of it or none of it. Then run `checks`, which
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
        await store.applyChangeGroups([{ revision: '1', command_id: Crypto.randomUUID(), changes: [{ entity: 'wallet', id: WALLET, version: 1, state: 'active', snapshot: wallet }] }], 'proof-cursor-1', null);
        await store.lock();
        return true;
      }),
    ];
  }
  if (phase === 'write-large') {
    return [
      await check('large_write_completes', async () => {
        const store = await database.open(PROOF_ACCOUNT);
        const groups: CommittedChangeGroup[] = Array.from({ length: 2000 }, (_, index) => ({
          revision: String(index + 2),
          command_id: Crypto.randomUUID(),
          changes: [{ entity: 'wallet', id: WALLET, version: index + 2, state: 'active', snapshot: { ...wallet, version: index + 2, opening_minor: String(index) } }],
        }));
        await store.applyChangeGroups(groups, 'proof-cursor-large', 'proof-cursor-1');
        await store.lock();
        return true;
      }),
    ];
  }
  if (phase === 'verify-after-restart') {
    return [
      await check('data_survives_process_restart_whole', async () => {
        const store = await database.open(PROOF_ACCOUNT);
        const state = await store.readState();
        await store.lock();
        const before = state.cursor === 'proof-cursor-1' && state.appliedRevision === '1' && state.walletTotals[WALLET] === '12345';
        const after = state.cursor === 'proof-cursor-large' && state.appliedRevision === '2001' && state.walletTotals[WALLET] === '1999';
        return before || after;
      }),
    ];
  }

  const results: ProofCheck[] = [];
  results.push(await check('encrypted_at_rest', async () => (await files.exists(name)) && !diaryHeaderIsPlainSqlite(name)));
  results.push(await check('rejected_key_locks', async () => {
    const real = await keys.get(PROOF_ACCOUNT);
    await SecureStore.setItemAsync(`gogospend.diary.v1.${PROOF_ACCOUNT}`, 'f'.repeat(64), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    try {
      await database.open(PROOF_ACCOUNT);
      return false;
    } catch (error) {
      return error instanceof DiaryLocked && error.reason === 'key_rejected';
    } finally {
      // Restore the real key, or remove the dummy one.
      if (real) await SecureStore.setItemAsync(`gogospend.diary.v1.${PROOF_ACCOUNT}`, real, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      else await keys.delete(PROOF_ACCOUNT);
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
    const intact = (await store.readState()).cursor !== null;
    await store.lock();
    return failed && intact;
  }));
  results.push(await check('stale_epoch_write_refused', async () => {
    const old = await database.open(PROOF_ACCOUNT);
    session.epoch += 1;
    const refused = await old.applyChangeGroups([], 'stale', 'proof-cursor-1').then(() => false, (error) => error instanceof StaleEpochError);
    await old.lock();
    return refused;
  }));
  results.push(await check('erase_removes_diary_and_key', async () => {
    const store = await database.open(PROOF_ACCOUNT);
    await store.eraseAfterConfirmation();
    return !(await files.exists(name)) && (await keys.get(PROOF_ACCOUNT)) === null;
  }));
  results.push({ name: 'android_backup_disabled', result: 'manual', note: 'adb backup / Auto Backup excludes the app (android.allowBackup=false)' });
  results.push({ name: 'android_device_transfer_excluded', result: 'manual', note: 'Android 12+ device-to-device transfer carries no diary (data extraction rules)' });
  results.push({ name: 'ios_backup_excluded', result: 'manual', note: 'needs a native exclusion step; see the device proof doc' });
  return results;
}
