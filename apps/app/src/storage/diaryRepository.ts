import { SYNC_ENTITY_VALIDATORS, TRANSACTION_TYPES, isCommittedChangeGroup, isEntityChange, isUuid } from '@gogospend/contracts';
import type { CommittedChangeGroup, EntityChange, Minor, Revision } from '@gogospend/contracts';

import { DiaryLocked, StaleEpochError } from './types.ts';
import type { ConfirmedSnapshot, OutboxCommand, PendingEntry, SqlDatabase, SqlExecutor } from './types.ts';

export type DiaryState = {
  cursor: string | null;
  appliedRevision: Revision;
  confirmed: EntityChange[];
  pending: PendingEntry[];
  walletTotals: Record<string, Minor>;
};

export interface DiaryStore {
  readonly accountId: string;
  /** Saves a draft and its outbox command in one transaction. */
  savePending(entry: PendingEntry, command: OutboxCommand): Promise<void>;
  /** Applies whole groups (strictly after the applied revision), recomputes totals and stores the cursor, atomically. */
  applyChangeGroups(groups: readonly CommittedChangeGroup[], cursor: string): Promise<void>;
  /** Replaces the confirmed state with a snapshot at `highWater`; drafts and the outbox are untouched. */
  replaceConfirmed(snapshot: ConfirmedSnapshot, highWater: Revision): Promise<void>;
  readOutbox(): Promise<OutboxCommand[]>;
  readState(): Promise<DiaryState>;
  /** Closes the diary (sign-out, transient auth failure); data stays for the next unlock. */
  lock(): Promise<void>;
  /** Deletes this account's diary and key. Call only after the user confirmed. */
  eraseAfterConfirmation(): Promise<void>;
}

export type DiaryStoreOptions = {
  accountId: string;
  db: SqlDatabase;
  /** The installation-local session epoch now; writes made after it moves are refused. */
  currentEpoch: () => number;
  openedEpoch: number;
  erase: () => Promise<void>;
  validators?: Readonly<Record<string, (snapshot: unknown) => boolean>>;
};

const REVISION = /^(0|[1-9][0-9]{0,18})$/;
const AMOUNT = /^[1-9][0-9]{0,10}$/;
const MAX_CURSOR = 512;

type EntityRow = { entity: string; id: string; version: number; state: EntityChange['state']; snapshot: string | null };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertDraft(entry: PendingEntry): void {
  const record = entry as Record<string, unknown>;
  const ok =
    isUuid(record.id) && typeof record.amount_minor === 'string' && AMOUNT.test(record.amount_minor) &&
    TRANSACTION_TYPES.includes(record.type as never) && typeof record.occurred_on === 'string' &&
    (record.type === 'transfer' ? isUuid(record.source_wallet_id) && isUuid(record.destination_wallet_id) : isUuid(record.wallet_id) && isUuid(record.category_id));
  if (!ok) throw new TypeError('A pending entry needs a valid id, positive integer amount, type and wallets.');
}

function assertCursor(cursor: string): void {
  if (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > MAX_CURSOR) throw new TypeError('A cursor is a non-empty opaque string.');
}

/** Confirmed wallet balances from confirmed records: the server's rule, in exact integers. */
async function recomputeTotals(tx: SqlExecutor): Promise<void> {
  const rows = await tx.all<{ entity: string; snapshot: string }>(
    `SELECT entity, snapshot FROM confirmed_entities WHERE state = 'active' AND entity IN ('wallet', 'transaction') ORDER BY entity DESC`,
  );
  const totals = new Map<string, bigint>();
  const records: Record<string, string>[] = [];
  for (const row of rows) {
    const snapshot = JSON.parse(row.snapshot) as Record<string, string>;
    if (row.entity === 'wallet') totals.set(snapshot.id, BigInt(snapshot.opening_minor));
    else records.push(snapshot);
  }
  const add = (wallet: string | undefined, amount: bigint) => {
    if (wallet !== undefined && totals.has(wallet)) totals.set(wallet, (totals.get(wallet) as bigint) + amount);
  };
  for (const record of records) {
    const amount = BigInt(record.amount_minor);
    if (record.type === 'income') add(record.wallet_id, amount);
    else if (record.type === 'expense') add(record.wallet_id, -amount);
    else {
      add(record.source_wallet_id, -amount);
      add(record.destination_wallet_id, amount);
    }
  }
  await tx.run('DELETE FROM confirmed_wallet_totals');
  for (const [wallet, total] of totals) await tx.run('INSERT INTO confirmed_wallet_totals (wallet_id, balance_minor) VALUES (?, ?)', [wallet, total.toString()]);
}

async function setMeta(tx: SqlExecutor, values: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await tx.run('INSERT INTO diary_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value]);
  }
}

async function upsert(tx: SqlExecutor, change: EntityChange, onlyForward: boolean): Promise<void> {
  const snapshot = change.state === 'purged' ? null : JSON.stringify(change.snapshot);
  await tx.run(
    `INSERT INTO confirmed_entities (entity, id, version, state, snapshot) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (entity, id) DO UPDATE SET version = excluded.version, state = excluded.state, snapshot = excluded.snapshot
     ${onlyForward ? 'WHERE excluded.version > confirmed_entities.version' : ''}`,
    [change.entity, change.id, change.version, change.state, snapshot],
  );
}

/**
 * One account's diary over an open, keyed database. Every write is one
 * transaction that re-checks, last thing before commit, that the session
 * epoch it was opened under is still current - so a callback from an earlier
 * session (sign-out, account switch, A -> B -> A) can never write, and a
 * write racing a switch rolls back.
 */
export function createDiaryStore(options: DiaryStoreOptions): DiaryStore {
  const { accountId, db } = options;
  const validators = options.validators ?? SYNC_ENTITY_VALIDATORS;
  let locked = false;

  const guard = () => {
    if (locked) throw new DiaryLocked('locked');
    if (options.currentEpoch() !== options.openedEpoch) throw new StaleEpochError();
  };
  const write = async <T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> => {
    guard();
    return db.transaction(async (tx) => {
      const result = await fn(tx);
      guard();
      return result;
    });
  };
  const read = async <T>(fn: (sql: SqlExecutor) => Promise<T>): Promise<T> => {
    guard();
    return fn(db);
  };
  const close = async () => {
    if (locked) return;
    locked = true;
    await db.close();
  };

  return {
    accountId,

    async savePending(entry, command) {
      guard();
      assertDraft(entry);
      if (
        command.accountId !== accountId || !isUuid(command.commandId) || command.kind !== 'transaction.create' ||
        !Number.isInteger(command.schemaVersion) || command.schemaVersion < 1 ||
        command.state !== 'unsent' || command.firstTransmissionAt !== null || canonical(command.payload) !== canonical(entry)
      ) {
        throw new TypeError("An outbox command must be this account's unsent create of exactly this entry.");
      }
      await write(async (tx) => {
        await tx.run('INSERT INTO pending_entries (entity_id, command_id, entry, created_at) VALUES (?, ?, ?, ?)', [entry.id, command.commandId, JSON.stringify(entry), command.createdAt]);
        await tx.run(
          `INSERT INTO outbox (command_id, account_id, kind, schema_version, payload, state, first_transmission_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [command.commandId, command.accountId, command.kind, command.schemaVersion, JSON.stringify(command.payload), command.state, command.firstTransmissionAt, command.createdAt],
        );
      });
    },

    async applyChangeGroups(groups, cursor) {
      guard();
      assertCursor(cursor);
      let previous = -1n;
      for (const group of groups) {
        if (!isCommittedChangeGroup(group, validators)) throw new TypeError('A change group does not match the sync contract.');
        const revision = BigInt(group.revision);
        if (revision <= previous) throw new RangeError('Change groups must be in increasing revision order.');
        previous = revision;
      }
      await write(async (tx) => {
        const [applied] = await tx.all<{ value: string }>(`SELECT value FROM diary_meta WHERE key = 'applied_revision'`);
        if (groups.length > 0 && BigInt(groups[0].revision) <= BigInt(applied?.value ?? '0')) throw new RangeError('A change group was already applied.');
        for (const group of groups) for (const change of group.changes) await upsert(tx, change, true);
        await recomputeTotals(tx);
        await setMeta(tx, groups.length > 0 ? { cursor, applied_revision: groups[groups.length - 1].revision } : { cursor });
      });
    },

    async replaceConfirmed(snapshot, highWater) {
      guard();
      assertCursor(snapshot.cursor);
      if (typeof highWater !== 'string' || !REVISION.test(highWater)) throw new TypeError('A high-water mark is a revision.');
      const seen = new Set<string>();
      for (const entity of snapshot.entities) {
        if (!isEntityChange(entity, validators)) throw new TypeError('A snapshot entity does not match the sync contract.');
        const key = `${entity.entity}\u0000${entity.id}`;
        if (seen.has(key)) throw new TypeError('A snapshot repeats an entity.');
        seen.add(key);
      }
      await write(async (tx) => {
        await tx.run('DELETE FROM confirmed_entities');
        for (const entity of snapshot.entities) await upsert(tx, entity, false);
        await recomputeTotals(tx);
        await setMeta(tx, { cursor: snapshot.cursor, applied_revision: highWater });
      });
    },

    readOutbox: () =>
      read(async (sql) =>
        (await sql.all<{ command_id: string; account_id: string; kind: 'transaction.create'; schema_version: number; payload: string; state: OutboxCommand['state']; first_transmission_at: string | null; created_at: string }>(
          'SELECT command_id, account_id, kind, schema_version, payload, state, first_transmission_at, created_at FROM outbox ORDER BY created_at, rowid',
        )).map((row) => ({
          commandId: row.command_id,
          accountId: row.account_id,
          schemaVersion: row.schema_version,
          kind: row.kind,
          payload: JSON.parse(row.payload) as PendingEntry,
          state: row.state,
          firstTransmissionAt: row.first_transmission_at,
          createdAt: row.created_at,
        })),
      ),

    readState: () =>
      read(async (sql) => {
        const meta = new Map((await sql.all<{ key: string; value: string }>('SELECT key, value FROM diary_meta')).map((row) => [row.key, row.value]));
        const confirmed = (await sql.all<EntityRow>('SELECT entity, id, version, state, snapshot FROM confirmed_entities ORDER BY entity, id')).map((row) => ({
          entity: row.entity,
          id: row.id,
          version: row.version,
          state: row.state,
          snapshot: row.snapshot === null ? null : (JSON.parse(row.snapshot) as unknown),
        }));
        const pending = (await sql.all<{ entry: string }>('SELECT entry FROM pending_entries ORDER BY created_at, rowid')).map((row) => JSON.parse(row.entry) as PendingEntry);
        const totals = await sql.all<{ wallet_id: string; balance_minor: string }>('SELECT wallet_id, balance_minor FROM confirmed_wallet_totals ORDER BY wallet_id');
        return {
          cursor: meta.get('cursor') ?? null,
          appliedRevision: meta.get('applied_revision') ?? '0',
          confirmed,
          pending,
          walletTotals: Object.fromEntries(totals.map((row) => [row.wallet_id, row.balance_minor])),
        };
      }),

    lock: close,

    async eraseAfterConfirmation() {
      await close();
      await options.erase();
    },
  };
}
