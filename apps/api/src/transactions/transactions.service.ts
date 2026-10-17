import { Injectable } from '@nestjs/common';
import {
  ContractValidationError,
  MINOR_AMOUNT_MAX,
  RESTORE_WINDOW_DAYS,
  TRANSACTION_TYPES,
  TRACKING_START_MIN,
  assertKnownFields,
  bangkokDate,
  isTransactionSnapshot,
  isUuid,
  normalizeMerchant,
  normalizeNote,
  parseMinor,
  validateOccurredOn,
} from '@gogospend/contracts';
import type { CommandAck, CommandOutcome, SessionContext, TransactionDto, TransactionType } from '@gogospend/contracts';

import { CommandExecutor } from '../commands/command-executor';
import type { MutationResult } from '../commands/command-executor';
import type { CommandHeaders } from '../commands/command-headers';
import { CommandRegistry } from '../commands/command-registry';
import { entityHead } from '../commands/entity-state';
import { expectVersion, routeId, stateProblem } from '../commands/versioned-entity';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import type { OwnerTx } from '../database/owner-transaction';
import { RECORD_COLUMNS as COLUMNS, toDto } from './transactions.repository';
import type { RecordRow as Row } from './transactions.repository';

const ENTITY = 'transaction';
const COMMANDS: [string, CommandOutcome][] = [['transaction.create', 'created'], ['transaction.update', 'updated'], ['transaction.delete', 'deleted'], ['transaction.restore', 'restored']];
const AMOUNT = { allowZero: false, allowNegative: false, max: MINOR_AMOUNT_MAX };
const COMMON_FIELDS = ['amount_minor', 'occurred_on', 'note', 'merchant'] as const;
const ENTRY_REFS = ['wallet_id', 'category_id'] as const;
const TRANSFER_REFS = ['source_wallet_id', 'destination_wallet_id'] as const;
type RefField = (typeof ENTRY_REFS)[number] | (typeof TRANSFER_REFS)[number];

/** The record's editable state, before it is written. */
type Draft = Omit<Row, 'deleted_at' | 'version'>;

const changed = (row: Row): MutationResult => ({
  entityId: row.id,
  version: row.version,
  changes: [{ entity: ENTITY, id: row.id, version: row.version, state: row.deleted_at ? 'deleted' : 'active', snapshot: toDto(row) }],
});

const refsOf = (type: TransactionType): readonly RefField[] => (type === 'transfer' ? TRANSFER_REFS : ENTRY_REFS);
const today = () => bangkokDate(new Date());

function uuidField(value: unknown, field: string): string {
  if (!isUuid(value)) throw new ContractValidationError('VALIDATION_FAILED', `${field} must be a lower-case UUID.`, field);
  return value;
}

/** Format checks for a date; the tracking-start check needs the wallet, under the lock. */
const dateField = (value: unknown) => validateOccurredOn(value, TRACKING_START_MIN, today());

function sameWallet(draft: Draft): void {
  if (draft.type === 'transfer' && draft.source_wallet_id === draft.destination_wallet_id) {
    throw new ContractValidationError('VALIDATION_FAILED', 'A transfer needs two different wallets.', 'destination_wallet_id');
  }
}

/**
 * Expense, income and transfer records through the M1 executor. Each record
 * is one row; references are checked under the account lock (owned, not
 * archived when newly referenced, matching category type, date within every
 * wallet's tracking period). Deletion is soft and restorable for 30 days.
 */
@Injectable()
export class TransactionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly executor: CommandExecutor,
    registry: CommandRegistry,
  ) {
    registry.defineEntity({ entity: ENTITY, validate: isTransactionSnapshot });
    for (const [kind, outcome] of COMMANDS) registry.defineCommand({ kind, entity: ENTITY, outcome, schemaVersions: [1], policy: 'current' });
  }

  get(ctx: SessionContext, id: string): Promise<TransactionDto> {
    const recordId = routeId(id);
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      const [row] = await tx.query<Row>(`SELECT ${COLUMNS} FROM transactions WHERE id = $1`, [recordId]);
      if (!row) throw new ProblemException(404, 'NOT_FOUND');
      return toDto(row);
    });
  }

  create(ctx: SessionContext, command: CommandHeaders, body: unknown): Promise<CommandAck> {
    const type = (body as { type?: unknown } | null)?.type;
    if (!TRANSACTION_TYPES.includes(type as TransactionType)) {
      throw new ContractValidationError('VALIDATION_FAILED', 'type must be expense, income or transfer.', 'type');
    }
    const refs = refsOf(type as TransactionType);
    const input = assertKnownFields(body, ['id', 'type', ...COMMON_FIELDS, ...refs]);
    const draft: Draft = {
      id: uuidField(input.id, 'id'),
      type: type as TransactionType,
      amount_minor: parseMinor(input.amount_minor, AMOUNT, 'amount_minor').toString(),
      occurred_on: dateField(input.occurred_on),
      wallet_id: null, category_id: null, source_wallet_id: null, destination_wallet_id: null,
      note: normalizeNote(input.note),
      merchant: normalizeMerchant(input.merchant),
    };
    for (const ref of refs) draft[ref] = uuidField(input[ref], ref);
    sameWallet(draft);
    return this.executor.run(ctx, { ...command, kind: 'transaction.create', payload: draft }, async (tx) => {
      await this.checkReferences(tx, draft, new Set(refs));
      const [row] = await tx.query<Row>(
        `INSERT INTO transactions (account_id, id, type, amount_minor, occurred_on, wallet_id, category_id, source_wallet_id, destination_wallet_id, note, merchant)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT DO NOTHING RETURNING ${COLUMNS}`,
        [tx.accountId, draft.id, draft.type, draft.amount_minor, draft.occurred_on, draft.wallet_id, draft.category_id, draft.source_wallet_id, draft.destination_wallet_id, draft.note, draft.merchant],
      );
      if (!row) {
        const [existing] = await tx.query<Row>(`SELECT ${COLUMNS} FROM transactions WHERE id = $1`, [draft.id]);
        throw new ProblemException(409, 'VERSION_CONFLICT', { current: existing ? toDto(existing) : undefined });
      }
      return changed(row);
    });
  }

  update(ctx: SessionContext, command: CommandHeaders, id: string, body: unknown): Promise<CommandAck> {
    const recordId = routeId(id);
    const input = assertKnownFields(body, [...COMMON_FIELDS, ...ENTRY_REFS, ...TRANSFER_REFS]);
    const edits: Partial<Draft> = {};
    if (input.amount_minor !== undefined) edits.amount_minor = parseMinor(input.amount_minor, AMOUNT, 'amount_minor').toString();
    if (input.occurred_on !== undefined) edits.occurred_on = dateField(input.occurred_on);
    if (input.note !== undefined) edits.note = normalizeNote(input.note);
    if (input.merchant !== undefined) edits.merchant = normalizeMerchant(input.merchant);
    for (const ref of [...ENTRY_REFS, ...TRANSFER_REFS]) if (input[ref] !== undefined) edits[ref] = uuidField(input[ref], ref);
    if (Object.keys(edits).length === 0) throw new ContractValidationError('VALIDATION_FAILED', 'Nothing to change.', 'amount_minor');
    return this.executor.run(ctx, { ...command, kind: 'transaction.update', payload: { id: recordId, ...edits } }, async (tx) => {
      const row = await this.live(tx, recordId, command.expectedVersion);
      const refs = refsOf(row.type);
      for (const field of [...ENTRY_REFS, ...TRANSFER_REFS]) {
        if (edits[field] !== undefined && !refs.includes(field)) throw new ContractValidationError('UNKNOWN_FIELD', `A ${row.type} has no ${field}.`, field);
      }
      const draft: Draft = { ...row, ...edits };
      sameWallet(draft);
      await this.checkReferences(tx, draft, new Set(refs.filter((field) => edits[field] !== undefined && edits[field] !== row[field])));
      const [updated] = await tx.query<Row>(
        `UPDATE transactions
            SET amount_minor = $2, occurred_on = $3, wallet_id = $4, category_id = $5, source_wallet_id = $6, destination_wallet_id = $7,
                note = $8, merchant = $9, version = version + 1, updated_at = now()
          WHERE id = $1 RETURNING ${COLUMNS}`,
        [recordId, draft.amount_minor, draft.occurred_on, draft.wallet_id, draft.category_id, draft.source_wallet_id, draft.destination_wallet_id, draft.note, draft.merchant],
      );
      return changed(updated);
    });
  }

  remove(ctx: SessionContext, command: CommandHeaders, id: string): Promise<CommandAck> {
    const recordId = routeId(id);
    return this.executor.run(ctx, { ...command, kind: 'transaction.delete', payload: { id: recordId } }, async (tx) => {
      await this.live(tx, recordId, command.expectedVersion);
      const [row] = await tx.query<Row>(
        `UPDATE transactions SET deleted_at = now(), version = version + 1, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
        [recordId],
      );
      return changed(row);
    });
  }

  restore(ctx: SessionContext, command: CommandHeaders, id: string, body: unknown): Promise<CommandAck> {
    const recordId = routeId(id);
    assertKnownFields(body ?? {}, []);
    return this.executor.run(ctx, { ...command, kind: 'transaction.restore', payload: { id: recordId } }, async (tx) => {
      const row = await this.locked(tx, recordId);
      if (!row.deleted_at) throw stateProblem('errors.not_deleted', 'deleted_at');
      await expectVersion(row, command.expectedVersion, async (current) => toDto(current));
      const [{ expired }] = await tx.query<{ expired: boolean }>(`SELECT $1::timestamptz < now() - make_interval(days => $2) AS expired`, [row.deleted_at, RESTORE_WINDOW_DAYS]);
      if (expired) throw new ProblemException(409, 'ENTITY_DELETED', { messageKey: 'errors.restore_expired' });
      // Restoring re-adds every reference, so all must still be valid.
      await this.checkReferences(tx, row, new Set(refsOf(row.type)));
      const [restored] = await tx.query<Row>(
        `UPDATE transactions SET deleted_at = NULL, version = version + 1, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
        [recordId],
      );
      return changed(restored);
    });
  }

  /** The record FOR UPDATE: 404 when this owner has none, 410 once purged. */
  private async locked(tx: OwnerTx, id: string): Promise<Row> {
    const [row] = await tx.query<Row>(`SELECT ${COLUMNS} FROM transactions WHERE id = $1 FOR UPDATE`, [id]);
    if (row) return row;
    if ((await entityHead(tx, ENTITY, id))?.state === 'purged') throw new ProblemException(410, 'ENTITY_PURGED');
    throw new ProblemException(404, 'NOT_FOUND');
  }

  /** An active record at the expected version (ENTITY_DELETED first, then VERSION_CONFLICT). */
  private async live(tx: OwnerTx, id: string, expected: number | undefined): Promise<Row> {
    const row = await this.locked(tx, id);
    if (row.deleted_at) throw new ProblemException(409, 'ENTITY_DELETED');
    return expectVersion(row, expected, async (current) => toDto(current));
  }

  /**
   * Under the account lock: every wallet and category is the owner's; newly
   * referenced ones are not archived; the category type matches; the date is
   * within every wallet's tracking period.
   */
  private async checkReferences(tx: OwnerTx, draft: Draft, newlyReferenced: ReadonlySet<RefField>): Promise<void> {
    for (const field of refsOf(draft.type)) {
      const id = draft[field] as string;
      if (field === 'category_id') {
        const [category] = await tx.query<{ type: string; archived: boolean }>('SELECT type, archived FROM categories WHERE id = $1', [id]);
        if (!category) throw stateProblem('errors.category_not_found', field);
        if (category.type !== draft.type) throw stateProblem('errors.category_type_mismatch', field);
        if (category.archived && newlyReferenced.has(field)) throw stateProblem('errors.category_archived', field);
        continue;
      }
      const [wallet] = await tx.query<{ archived: boolean; tracking_start: string }>('SELECT archived, tracking_start::text AS tracking_start FROM wallets WHERE id = $1', [id]);
      if (!wallet) throw stateProblem('errors.wallet_not_found', field);
      if (wallet.archived && newlyReferenced.has(field)) throw stateProblem('errors.wallet_archived', field);
      if (draft.occurred_on < wallet.tracking_start) {
        throw new ContractValidationError('DATE_BEFORE_TRACKING_START', 'Date is before the wallet started tracking.', 'occurred_on');
      }
    }
  }
}
