import { isUuid } from '@gogospend/contracts';

import { createDiaryStore } from './diaryRepository.ts';
import type { DiaryStore } from './diaryRepository.ts';
import { DIARY_MIGRATIONS, migrateDiary } from './migrations.ts';
import type { DiaryMigration } from './migrations.ts';
import { DiaryKeyRejected, DiaryLocked, MalformedDiaryKey, StaleEpochError } from './types.ts';
import type { DiaryFiles, KeyStore, SqlDatabase } from './types.ts';

export type AccountDatabaseOptions = {
  files: DiaryFiles;
  keys: KeyStore;
  /** F5's installation-local session epoch (moves on sign-out, account switch or a new binding). */
  epoch: () => number;
  migrations?: readonly DiaryMigration[];
  validators?: Readonly<Record<string, (snapshot: unknown) => boolean>>;
};

const fileName = (accountId: string) => `diary-${accountId}.db`;

function assertAccount(accountId: string): void {
  if (!isUuid(accountId)) throw new RangeError('A diary belongs to an account id.');
}

/**
 * One encrypted SQLite diary per account, keyed by that account's own random
 * key, with at most one open store (and connection) per account: opens of one
 * account are serialized and share the store; a store from an earlier session
 * epoch is closed when the account is opened again. A diary whose key is
 * missing or rejected is locked - never silently replaced by an empty one;
 * the user chooses recovery or an explicit `discard`. A key store that fails
 * (e.g. the device is locked) is only temporarily unavailable. A diary
 * recorded for another account is refused before anything touches it.
 */
export class AccountDatabase {
  private readonly options: AccountDatabaseOptions;
  private readonly live = new Map<string, { store: DiaryStore; epoch: number }>();
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(options: AccountDatabaseOptions) {
    this.options = options;
  }

  async open(accountId: string): Promise<DiaryStore> {
    assertAccount(accountId);
    this.options.files.assertAvailable?.();
    return this.exclusive(accountId, () => this.openLocked(accountId));
  }

  /** Explicit recovery or erase: closes the account's store, then deletes its key (unreadable at once) and its file. */
  async discard(accountId: string): Promise<void> {
    assertAccount(accountId);
    return this.exclusive(accountId, async () => {
      await this.live.get(accountId)?.store.lock();
      await this.options.keys.delete(accountId);
      await this.options.files.delete(fileName(accountId));
    });
  }

  private exclusive<T>(accountId: string, task: () => Promise<T>): Promise<T> {
    const next = (this.chains.get(accountId) ?? Promise.resolve()).then(task, task);
    this.chains.set(accountId, next.catch(() => undefined));
    return next;
  }

  private async openLocked(accountId: string): Promise<DiaryStore> {
    const { files, keys } = this.options;
    const epoch = this.options.epoch();
    const current = this.live.get(accountId);
    if (current?.epoch === epoch) return current.store;
    await current?.store.lock();

    const name = fileName(accountId);
    const exists = await files.exists(name);
    let key: string | null;
    try {
      key = await keys.get(accountId);
    } catch (error) {
      throw new DiaryLocked(error instanceof MalformedDiaryKey ? 'key_rejected' : 'key_unavailable');
    }
    if (exists && key === null) throw new DiaryLocked('key_missing');
    if (key === null) {
      try {
        key = await keys.create(accountId);
      } catch {
        throw new DiaryLocked('key_unavailable');
      }
    }
    let db: SqlDatabase;
    try {
      db = await files.open(name, key);
    } catch (error) {
      if (error instanceof DiaryKeyRejected) throw new DiaryLocked('key_rejected');
      throw error;
    }
    try {
      // The owner is checked before any migration touches the file.
      const [{ user_version: version }] = await db.all<{ user_version: number }>('PRAGMA user_version');
      const owner = version >= 1 ? (await db.all<{ value: string }>(`SELECT value FROM diary_meta WHERE key = 'account_id'`))[0]?.value : undefined;
      if (owner !== undefined && owner !== accountId) throw new DiaryLocked('wrong_account');
      await migrateDiary(db, this.options.migrations ?? DIARY_MIGRATIONS);
      if (owner === undefined) await db.run(`INSERT INTO diary_meta (key, value) VALUES ('account_id', ?)`, [accountId]);
      if (this.options.epoch() !== epoch) throw new StaleEpochError();
    } catch (error) {
      await db.close();
      throw error;
    }
    const store: DiaryStore = createDiaryStore({
      accountId,
      db,
      currentEpoch: this.options.epoch,
      openedEpoch: epoch,
      erase: () => this.discard(accountId),
      onClose: () => {
        if (this.live.get(accountId)?.store === store) this.live.delete(accountId);
      },
      validators: this.options.validators,
    });
    this.live.set(accountId, { store, epoch });
    return store;
  }
}
