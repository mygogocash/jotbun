import { isUuid } from '@gogospend/contracts';

import { createDiaryStore } from './diaryRepository.ts';
import type { DiaryStore } from './diaryRepository.ts';
import { DIARY_MIGRATIONS, migrateDiary } from './migrations.ts';
import type { DiaryMigration } from './migrations.ts';
import { DiaryKeyRejected, DiaryLocked } from './types.ts';
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

/**
 * Opens one encrypted SQLite diary per account, keyed by that account's own
 * random key. A diary whose key is missing or rejected is locked - never
 * silently replaced by an empty one under the same account; the user chooses
 * recovery or an explicit `discard`. A diary recorded for another account is
 * refused. Stores are bound to the session epoch current at open.
 */
export class AccountDatabase {
  private readonly options: AccountDatabaseOptions;

  constructor(options: AccountDatabaseOptions) {
    this.options = options;
  }

  async open(accountId: string): Promise<DiaryStore> {
    if (!isUuid(accountId)) throw new RangeError('A diary belongs to an account id.');
    const { files, keys } = this.options;
    const name = fileName(accountId);
    const openedEpoch = this.options.epoch();
    const exists = await files.exists(name);
    let key = await keys.get(accountId);
    if (exists && key === null) throw new DiaryLocked('key_missing');
    if (key === null) key = await keys.create(accountId);
    let db: SqlDatabase;
    try {
      db = await files.open(name, key);
    } catch (error) {
      if (error instanceof DiaryKeyRejected) throw new DiaryLocked('key_rejected');
      throw error;
    }
    try {
      await migrateDiary(db, this.options.migrations ?? DIARY_MIGRATIONS);
      const [owner] = await db.all<{ value: string }>(`SELECT value FROM diary_meta WHERE key = 'account_id'`);
      if (owner === undefined) await db.run(`INSERT INTO diary_meta (key, value) VALUES ('account_id', ?)`, [accountId]);
      else if (owner.value !== accountId) throw new DiaryLocked('wrong_account');
    } catch (error) {
      await db.close();
      throw error;
    }
    return createDiaryStore({ accountId, db, currentEpoch: this.options.epoch, openedEpoch, erase: () => this.discard(accountId), validators: this.options.validators });
  }

  /** Explicit recovery or erase: deletes the account's diary and its key. */
  async discard(accountId: string): Promise<void> {
    if (!isUuid(accountId)) throw new RangeError('A diary belongs to an account id.');
    await this.options.files.delete(fileName(accountId));
    await this.options.keys.delete(accountId);
  }
}
