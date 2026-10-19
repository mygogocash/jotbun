import { SYNC_ENTITY_VALIDATORS, isCommittedChangeGroup, isEntityChange, isKnownSyncEntity, isUuid, normalizeCommand, normalizeMerchant, normalizeNote, validateOccurredOn } from '@gogospend/contracts';
import type { CategoryDto, CommittedChangeGroup, EntityChange, Minor, Revision, WalletSnapshot } from '@gogospend/contracts';

import { CursorMoved, DiaryLocked, DraftReferenceUnavailable, StaleEpochError } from './types.ts';
import type { ConfirmedSnapshot, OutboxCommand, OutboxState, PendingEntry, SqlDatabase, SqlExecutor } from './types.ts';

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
  /**
   * Applies whole groups (strictly after the applied revision), recomputes
   * totals and stores the cursor, atomically - only if the diary's cursor is
   * still `previousCursor`, the one the page was fetched with (else CursorMoved).
   */
  applyChangeGroups(groups: readonly CommittedChangeGroup[], cursor: string, previousCursor: string | null): Promise<void>;
  /** Replaces the confirmed state with a snapshot at `highWater`; drafts and the outbox are untouched. */
  replaceConfirmed(snapshot: ConfirmedSnapshot, highWater: Revision): Promise<void>;
  readOutbox(): Promise<OutboxCommand[]>;
  readState(): Promise<DiaryState>;
  /**
   * Marks a command as being transmitted (unsent, uncertain or paused ->
   * sending) before it is sent, freezing it: the first transmission time is
   * set once and the id and body never change again. Returns its state before
   * and the frozen command - send exactly that - or null if it no longer exists.
   */
  beginTransmission(commandId: string, at: string): Promise<{ previous: OutboxState; command: OutboxCommand } | null>;
  /** Moves a command from one of `from` to `to` (acknowledged needs the revision). False if it was in no state of `from`. */
  setCommandState(commandId: string, from: readonly OutboxState[], to: OutboxState, ackedRevision?: string): Promise<boolean>;
  /** Removes resolved commands with their drafts. */
  resolveCommands(commandIds: readonly string[]): Promise<void>;
  /** Edits a draft that was never transmitted (its command body follows). */
  editPending(commandId: string, entry: PendingEntry): Promise<void>;
  /** Removes a draft that was never transmitted, with its command. */
  removePending(commandId: string): Promise<void>;
  /** Discards a draft the server never committed (needs review), with its command. */
  discardReviewed(commandId: string): Promise<void>;
  /** The import review draft rows (spend/v1/importDraftStore.ts): a row's value, or null. */
  readImportDraft(key: string): Promise<string | null>;
  /** Writes a draft row, replacing any under the same key. */
  writeImportDraft(key: string, value: string): Promise<void>;
  /** Removes a draft row; a missing one is not an error. */
  removeImportDraft(key: string): Promise<void>;
  /** Every draft row's key. */
  importDraftKeys(): Promise<string[]>;
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
  /** Called once when the store closes (lock or erase). */
  onClose?: () => void;
  validators?: Readonly<Record<string, (snapshot: unknown) => boolean>>;
};

/**
 * A reader skips the entity types it has no validator for: a newer server may
 * send types this build cannot show, and refusing the page would stall sync
 * for good. Their cursor and revision still advance; they are not stored.
 */
const SKIP_UNKNOWN = { unknownEntities: 'skip' } as const;

const REVISION = /^(0|[1-9][0-9]{0,18})$/;
const AMOUNT = /^[1-9][0-9]{0,10}$/;
const MAX_CURSOR = 512;
const TRANSMITTABLE: readonly OutboxState[] = ['unsent', 'uncertain', 'paused_upgrade'];
const OUTBOX_COLUMNS = 'command_id, account_id, kind, schema_version, payload, state, first_transmission_at, created_at, acked_revision';
type OutboxRow = { command_id: string; account_id: string; kind: 'transaction.create'; schema_version: number; payload: string; state: OutboxState; first_transmission_at: string | null; created_at: string; acked_revision: string | null };
const toCommand = (row: OutboxRow): OutboxCommand => ({
  commandId: row.command_id,
  accountId: row.account_id,
  schemaVersion: row.schema_version,
  kind: row.kind,
  payload: JSON.parse(row.payload) as PendingEntry,
  state: row.state,
  firstTransmissionAt: row.first_transmission_at,
  createdAt: row.created_at,
  ackedRevision: row.acked_revision,
});

type EntityRow = { entity: string; id: string; version: number; state: EntityChange['state']; snapshot: string | null };

const ENTRY_KEYS = ['amount_minor', 'category_id', 'id', 'merchant', 'note', 'occurred_on', 'type', 'wallet_id'];
const TRANSFER_KEYS = ['amount_minor', 'destination_wallet_id', 'id', 'merchant', 'note', 'occurred_on', 'source_wallet_id', 'type'];
const LATEST_DATE = '9999-12-31';

/** The command canonical form (sorted keys, undefined fields dropped), as the server digests it. */
const canonical = (payload: unknown) => normalizeCommand('transaction.create', 1, payload).canonicalJson;

async function activeSnapshot<T>(tx: SqlExecutor, entity: string, id: unknown): Promise<T | null> {
  if (!isUuid(id)) return null;
  const [row] = await tx.all<{ snapshot: string }>(`SELECT snapshot FROM confirmed_entities WHERE entity = ? AND id = ? AND state = 'active'`, [entity, id]);
  return row ? (JSON.parse(row.snapshot) as T) : null;
}

/**
 * A draft is a valid create (the shape the server accepts, normalized text,
 * a real date on or after its wallets' tracking start) that uses synced,
 * open references: active, unarchived wallets (two different ones for a
 * transfer) and an active, unarchived category of the entry's type.
 */
async function assertDraft(tx: SqlExecutor, entry: PendingEntry): Promise<void> {
  const fail = (reason: string): never => {
    throw new TypeError(`A pending entry is not a valid create: ${reason}.`);
  };
  const record = entry as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  const transfer = record.type === 'transfer';
  if (!transfer && record.type !== 'expense' && record.type !== 'income') fail('type');
  const allowed = transfer ? TRANSFER_KEYS : ENTRY_KEYS;
  const required = transfer ? ['amount_minor', 'destination_wallet_id', 'id', 'occurred_on', 'source_wallet_id', 'type'] : ['amount_minor', 'category_id', 'id', 'occurred_on', 'type', 'wallet_id'];
  if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !keys.includes(key))) fail('fields');
  if (!isUuid(record.id) || typeof record.amount_minor !== 'string' || !AMOUNT.test(record.amount_minor)) fail('id or amount');
  for (const [field, normalize] of [['note', normalizeNote], ['merchant', normalizeMerchant]] as const) {
    const value = record[field] ?? null;
    let normalized: string | null;
    try {
      normalized = normalize(value);
    } catch {
      return fail(field);
    }
    if (normalized !== value) fail(field);
  }
  const walletIds = transfer ? [record.source_wallet_id, record.destination_wallet_id] : [record.wallet_id];
  if (transfer && record.source_wallet_id === record.destination_wallet_id) fail('a transfer needs two different wallets');
  const wallets: WalletSnapshot[] = [];
  for (const id of walletIds) {
    const wallet = await activeSnapshot<WalletSnapshot>(tx, 'wallet', id);
    if (!wallet || wallet.archived) throw new DraftReferenceUnavailable('wallet');
    wallets.push(wallet as WalletSnapshot);
  }
  if (!transfer) {
    const category = await activeSnapshot<CategoryDto>(tx, 'category', record.category_id);
    if (!category || category.archived || category.type !== record.type) throw new DraftReferenceUnavailable('category');
  }
  const trackingStart = wallets.map((wallet) => wallet.tracking_start).sort().at(-1) as string;
  try {
    validateOccurredOn(record.occurred_on, trackingStart, LATEST_DATE);
  } catch {
    fail('date');
  }
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

  // A store from an earlier session is stale first of all, whether or not it was closed.
  const guard = () => {
    if (options.currentEpoch() !== options.openedEpoch) throw new StaleEpochError();
    if (locked) throw new DiaryLocked('locked');
  };
  const write = async <T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> => {
    guard();
    return db.transaction(async (tx) => {
      const result = await fn(tx);
      guard();
      return result;
    });
  };
  // One consistent read unit; nothing read is returned once the session moved.
  const read = async <T>(fn: (sql: SqlExecutor) => Promise<T>): Promise<T> => {
    guard();
    const result = await db.read(fn);
    guard();
    return result;
  };
  const close = async () => {
    if (locked) return;
    locked = true;
    options.onClose?.();
    await db.close();
  };

  return {
    accountId,

    async savePending(entry, command) {
      guard();
      let same = false;
      try {
        same = canonical(command.payload) === canonical(entry);
      } catch {
        same = false;
      }
      if (
        command.accountId !== accountId || !isUuid(command.commandId) || command.kind !== 'transaction.create' ||
        !Number.isInteger(command.schemaVersion) || command.schemaVersion < 1 ||
        command.state !== 'unsent' || command.firstTransmissionAt !== null || command.ackedRevision !== null || typeof command.createdAt !== 'string' || !same
      ) {
        throw new TypeError("An outbox command must be this account's unsent create of exactly this entry.");
      }
      await write(async (tx) => {
        // A retry of a save whose outcome was unknown: the same command and entry is a no-op.
        const [existing] = await tx.all<{ entry: string }>('SELECT entry FROM pending_entries WHERE command_id = ? OR entity_id = ?', [command.commandId, entry.id]);
        if (existing) {
          const [queued] = await tx.all<{ payload: string }>('SELECT payload FROM outbox WHERE command_id = ?', [command.commandId]);
          if (queued && canonical(JSON.parse(existing.entry)) === canonical(entry) && canonical(JSON.parse(queued.payload)) === canonical(entry)) return;
          throw new TypeError('A different draft was already saved under this command or entry id.');
        }
        await assertDraft(tx, entry);
        await tx.run('INSERT INTO pending_entries (entity_id, command_id, entry, created_at) VALUES (?, ?, ?, ?)', [entry.id, command.commandId, JSON.stringify(entry), command.createdAt]);
        await tx.run(
          `INSERT INTO outbox (command_id, account_id, kind, schema_version, payload, state, first_transmission_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [command.commandId, command.accountId, command.kind, command.schemaVersion, JSON.stringify(command.payload), command.state, command.firstTransmissionAt, command.createdAt],
        );
      });
    },

    async applyChangeGroups(groups, cursor, previousCursor) {
      guard();
      assertCursor(cursor);
      if (previousCursor !== null) assertCursor(previousCursor);
      let previous = -1n;
      for (const group of groups) {
        if (!isCommittedChangeGroup(group, validators, SKIP_UNKNOWN)) throw new TypeError('A change group does not match the sync contract.');
        const revision = BigInt(group.revision);
        if (revision <= previous) throw new RangeError('Change groups must be in increasing revision order.');
        previous = revision;
      }
      await write(async (tx) => {
        const meta = new Map((await tx.all<{ key: string; value: string }>(`SELECT key, value FROM diary_meta WHERE key IN ('cursor', 'applied_revision')`)).map((row) => [row.key, row.value]));
        if ((meta.get('cursor') ?? null) !== previousCursor) throw new CursorMoved();
        const applied = meta.has('applied_revision') ? { value: meta.get('applied_revision') as string } : undefined;
        if (groups.length > 0 && BigInt(groups[0].revision) <= BigInt(applied?.value ?? '0')) throw new RangeError('A change group was already applied.');
        for (const group of groups) for (const change of group.changes) if (isKnownSyncEntity(change.entity, validators)) await upsert(tx, change, true);
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
        if (!isEntityChange(entity, validators, SKIP_UNKNOWN)) throw new TypeError('A snapshot entity does not match the sync contract.');
        if (!isKnownSyncEntity(entity.entity, validators)) continue;
        const key = `${entity.entity}\u0000${entity.id}`;
        if (seen.has(key)) throw new TypeError('A snapshot repeats an entity.');
        seen.add(key);
      }
      await write(async (tx) => {
        await tx.run('DELETE FROM confirmed_entities');
        for (const entity of snapshot.entities) if (isKnownSyncEntity(entity.entity, validators)) await upsert(tx, entity, false);
        await recomputeTotals(tx);
        await setMeta(tx, { cursor: snapshot.cursor, applied_revision: highWater });
      });
    },

    readOutbox: () => read(async (sql) => (await sql.all<OutboxRow>(`SELECT ${OUTBOX_COLUMNS} FROM outbox ORDER BY created_at, rowid`)).map(toCommand)),

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

    async beginTransmission(commandId, at) {
      guard();
      if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) throw new TypeError('A transmission time is an ISO instant.');
      return write(async (tx) => {
        const [row] = await tx.all<OutboxRow>(`SELECT ${OUTBOX_COLUMNS} FROM outbox WHERE command_id = ?`, [commandId]);
        if (!row) return null;
        if (!TRANSMITTABLE.includes(row.state)) throw new TypeError('Only an unsent, uncertain or paused command can be transmitted.');
        await tx.run(`UPDATE outbox SET state = 'sending', first_transmission_at = coalesce(first_transmission_at, ?) WHERE command_id = ?`, [at, commandId]);
        return { previous: row.state, command: { ...toCommand(row), state: 'sending' as const, firstTransmissionAt: row.first_transmission_at ?? at } };
      });
    },

    async setCommandState(commandId, from, to, ackedRevision) {
      guard();
      if ((to === 'acknowledged') !== (ackedRevision !== undefined) || (ackedRevision !== undefined && !REVISION.test(ackedRevision))) {
        throw new TypeError('Only an acknowledgement carries a committed revision, and it always does.');
      }
      return write(async (tx) => {
        const states = [...from];
        if (states.length === 0) return false;
        const changed = await tx.run(
          `UPDATE outbox SET state = ?, acked_revision = ? WHERE command_id = ? AND state IN (${states.map(() => '?').join(', ')})`,
          [to, ackedRevision ?? null, commandId, ...states],
        );
        return changed === 1;
      });
    },

    async resolveCommands(commandIds) {
      guard();
      await write(async (tx) => {
        for (const commandId of commandIds) {
          await tx.run('DELETE FROM outbox WHERE command_id = ?', [commandId]);
          await tx.run('DELETE FROM pending_entries WHERE command_id = ?', [commandId]);
        }
      });
    },

    async editPending(commandId, entry) {
      guard();
      await write(async (tx) => {
        const [row] = await tx.all<{ entity_id: string }>(
          `SELECT p.entity_id FROM outbox o JOIN pending_entries p ON p.command_id = o.command_id
            WHERE o.command_id = ? AND o.state = 'unsent' AND o.first_transmission_at IS NULL`,
          [commandId],
        );
        if (!row) throw new TypeError('Only a draft that was never transmitted can be edited.');
        if (row.entity_id !== entry.id) throw new TypeError('An edit keeps the draft id.');
        await assertDraft(tx, entry);
        await tx.run('UPDATE pending_entries SET entry = ? WHERE command_id = ?', [JSON.stringify(entry), commandId]);
        await tx.run('UPDATE outbox SET payload = ? WHERE command_id = ?', [JSON.stringify(entry), commandId]);
      });
    },

    async removePending(commandId) {
      guard();
      await write(async (tx) => {
        const removed = await tx.run(`DELETE FROM outbox WHERE command_id = ? AND state = 'unsent' AND first_transmission_at IS NULL`, [commandId]);
        if (removed !== 1) throw new TypeError('Only a draft that was never transmitted can be removed.');
        await tx.run('DELETE FROM pending_entries WHERE command_id = ?', [commandId]);
      });
    },

    async discardReviewed(commandId) {
      guard();
      await write(async (tx) => {
        const removed = await tx.run(`DELETE FROM outbox WHERE command_id = ? AND state = 'needs_review'`, [commandId]);
        if (removed !== 1) throw new TypeError('Only a draft that needs review can be discarded.');
        await tx.run('DELETE FROM pending_entries WHERE command_id = ?', [commandId]);
      });
    },

    readImportDraft: (key) => read(async (sql) => (await sql.all<{ value: string }>('SELECT value FROM import_drafts WHERE key = ?', [key]))[0]?.value ?? null),

    async writeImportDraft(key, value) {
      await write((tx) => tx.run('INSERT INTO import_drafts (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, value]));
    },

    async removeImportDraft(key) {
      await write((tx) => tx.run('DELETE FROM import_drafts WHERE key = ?', [key]));
    },

    importDraftKeys: () => read(async (sql) => (await sql.all<{ key: string }>('SELECT key FROM import_drafts ORDER BY key')).map((row) => row.key)),

    lock: close,

    async eraseAfterConfirmation() {
      // Only the current session may erase; an old store can at most be closed.
      guard();
      await close();
      await options.erase();
    },
  };
}
