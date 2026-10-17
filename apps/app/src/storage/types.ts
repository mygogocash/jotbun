// The encrypted per-account diary on the device (S2). Platform adapters
// (database.ts / database.web.ts, and a node:sqlite test adapter)
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
  /** Runs `fn` in one exclusive write transaction: commits if it resolves, rolls back if it throws. */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  /** Runs `fn`'s reads as one consistent unit (no write can land between them). */
  read<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** One raw, already keyed database connection (wrapped by createSerialDatabase). */
export interface SqlConnection extends SqlExecutor {
  close(): Promise<void>;
}

/** Where account diaries live. Opening with the wrong key fails (SQLCipher). */
export interface DiaryFiles {
  /** Throws when this platform keeps no local diary (web). */
  assertAvailable?(): void;
  exists(name: string): Promise<boolean>;
  /** Opens (creating if missing) `name`, keyed with a 64-hex-digit raw key. Throws DiaryKeyRejected for a wrong key. */
  open(name: string, key: string): Promise<SqlDatabase>;
  /** Deletes the database and its side files (journal/WAL); a missing file is not an error. */
  delete(name: string): Promise<void>;
}

/** Per-account database keys (SecureStore on device; this device only, never backed up). */
export interface KeyStore {
  /** Throws MalformedDiaryKey for a stored value that is not a key. */
  get(accountId: string): Promise<string | null>;
  /** Refuses when the account already has a key (never overwrites one). */
  create(accountId: string): Promise<string>;
  delete(accountId: string): Promise<void>;
}

/**
 * unsent: never transmitted (editable while firstTransmissionAt is null);
 * sending: a transmission is in flight (after a crash: uncertain);
 * uncertain: transmitted, outcome unknown - check its status, then resend
 * only the same command; needs_review: refused (validation, references,
 * schema, age) - the draft is kept; paused_upgrade: waits for an app update;
 * acknowledged: committed - removed once the confirmed state holds it.
 */
export const OUTBOX_STATES = ['unsent', 'sending', 'uncertain', 'needs_review', 'paused_upgrade', 'acknowledged'] as const;
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
  /** The committed revision once acknowledged. */
  ackedRevision: string | null;
};

/** A draft saved on the device: shown as pending, never mixed into confirmed totals. */
export type PendingEntry = CreateTransactionRequest;

/** A full replacement of the confirmed state: every entity at `high_water`, and the delta cursor there. */
export type ConfirmedSnapshot = { entities: readonly EntityChange[]; cursor: string };

/**
 * key_missing / key_rejected: the data cannot be decrypted - offer recovery
 * (resync) or an explicit discard. key_unavailable: the key store failed
 * (e.g. the device is locked) - retry later; never offer discard.
 */
export type DiaryLockReason = 'key_missing' | 'key_rejected' | 'key_unavailable' | 'locked' | 'wrong_account';

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

/** A stored key that is not a 64-hex-digit key. */
export class MalformedDiaryKey extends Error {
  constructor() {
    super('The stored diary key is malformed.');
    this.name = 'MalformedDiaryKey';
  }
}

/** The diary's cursor moved since the page being applied was fetched; fetch again from the current cursor. */
export class CursorMoved extends Error {
  constructor() {
    super('The sync cursor moved; fetch again.');
    this.name = 'CursorMoved';
  }
}

/**
 * A draft names a wallet or category this device has not synced yet (or one
 * that is archived or gone): pulling the latest changes may make it usable.
 */
export class DraftReferenceUnavailable extends TypeError {
  readonly reference: 'wallet' | 'category';
  constructor(reference: 'wallet' | 'category') {
    super(`A pending entry is not a valid create: ${reference}.`);
    this.name = 'DraftReferenceUnavailable';
    this.reference = reference;
  }
}

/** The diary was written by a newer app version. */
export class DiarySchemaTooNew extends Error {
  constructor() {
    super('The diary was written by a newer app version.');
    this.name = 'DiarySchemaTooNew';
  }
}
