// The encrypted per-account diary on the device (S2). Platform adapters
// (database.native.ts / database.web.ts, and a node:sqlite test adapter)
// implement these ports; accountDatabase.ts and diaryRepository.ts hold all
// the logic, so it is tested against a real SQLite engine.
import type { CreateTransactionRequest, EntityChange } from '@gogospend/contracts';

export type SqlValue = string | number | null;

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  /** Returns the number of rows changed. */
  run(sql: string, params?: readonly SqlValue[]): Promise<number>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
}

export interface SqlDatabase extends SqlExecutor {
  /** Runs `fn` in one exclusive transaction: commits if it resolves, rolls back if it throws. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Where account diaries live. Opening with the wrong key fails (SQLCipher). */
export interface DiaryFiles {
  exists(name: string): Promise<boolean>;
  /** Opens (creating if missing) `name`, keyed with a 64-hex-digit raw key. Throws DiaryKeyRejected for a wrong key. */
  open(name: string, key: string): Promise<SqlDatabase>;
  /** Deletes the database and its side files (journal/WAL). */
  delete(name: string): Promise<void>;
}

/** Per-account database keys (SecureStore on device; this device only, never backed up). */
export interface KeyStore {
  get(accountId: string): Promise<string | null>;
  create(accountId: string): Promise<string>;
  delete(accountId: string): Promise<void>;
}

export const OUTBOX_STATES = ['unsent', 'sending', 'uncertain', 'needs_review', 'paused_upgrade'] as const;
export type OutboxState = (typeof OUTBOX_STATES)[number];

/** A command waiting to be sent (S3 drives its states). Its id and body are immutable once transmitted. */
export type OutboxCommand = {
  commandId: string;
  accountId: string;
  /** Fixed when the draft is saved; sent as X-GoGoSpend-Command-Schema. */
  schemaVersion: number;
  kind: 'transaction.create';
  payload: CreateTransactionRequest;
  state: OutboxState;
  firstTransmissionAt: string | null;
  createdAt: string;
};

/** A draft saved on the device: shown as pending, never mixed into confirmed totals. */
export type PendingEntry = CreateTransactionRequest;

/** A full replacement of the confirmed state: every entity at `high_water`, and the delta cursor there. */
export type ConfirmedSnapshot = { entities: readonly EntityChange[]; cursor: string };

export type DiaryLockReason = 'key_missing' | 'key_rejected' | 'locked' | 'wrong_account';

/** The diary cannot be used: its key is gone or wrong, it was locked, or it belongs to another account. */
export class DiaryLocked extends Error {
  readonly reason: DiaryLockReason;
  constructor(reason: DiaryLockReason) {
    super(`The diary is locked (${reason}).`);
    this.name = 'DiaryLocked';
    this.reason = reason;
  }
}

/** Raised by an adapter when SQLCipher refuses the key. */
export class DiaryKeyRejected extends Error {
  constructor() {
    super('The diary key was rejected.');
    this.name = 'DiaryKeyRejected';
  }
}

/** A write from a session that is no longer current (sign-out, account switch, new binding). */
export class StaleEpochError extends Error {
  constructor() {
    super('The session changed; this write was not saved.');
    this.name = 'StaleEpochError';
  }
}

/** The diary was written by a newer app version. */
export class DiarySchemaTooNew extends Error {
  constructor() {
    super('The diary was written by a newer app version.');
    this.name = 'DiarySchemaTooNew';
  }
}
