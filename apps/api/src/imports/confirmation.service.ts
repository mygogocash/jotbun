import { Injectable } from '@nestjs/common';
import {
  ATTACHMENT_MESSAGE_KEYS,
  ContractValidationError,
  IMPORT_CONFIRM_BATCH_MAX_ROWS,
  IMPORT_IMAGE_ROW_ID,
  IMPORT_PATCH_MAX_ROWS,
  IMPORT_SELECTION_MAX_ROWS,
  assertKnownFields,
  bangkokDate,
  isImportReviewSnapshot,
  isImportSelectionSnapshot,
  isUuid,
  parseImportMapping,
  parseImportRowIds,
  parseImportRowPatch,
  RECEIPT_RETENTION_CONSENT,
} from '@gogospend/contracts';
import type {
  CommandAck,
  CommandInput,
  ConfirmImportBatch,
  ConfirmImportBatchResult,
  EntityChange,
  FreezeImportSelection,
  FreezeImportSelectionRequest,
  ImportMapping,
  ImportReceiptChoice,
  ImportRowPatch,
  ImportSelectionProgress,
  ImportSelectionSnapshot,
  ImportSelectionStatus,
  PatchImportRowsResult,
  SessionContext,
} from '@gogospend/contracts';

import { AttachmentService } from '../attachments/attachments.service';
import type { PreparedReceipt } from '../attachments/attachments.service';
import { CommandExecutor } from '../commands/command-executor';
import type { AuditMetadata, MutationResult } from '../commands/command-executor';
import { CommandRegistry } from '../commands/command-registry';
import { derivedUuid } from '../commands/derived-id';
import { entityHead } from '../commands/entity-state';
import { stateProblem } from '../commands/versioned-entity';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import type { OwnerTx } from '../database/owner-transaction';
import { RECORD_COLUMNS, toDto } from '../transactions/transactions.repository';
import type { RecordRow } from '../transactions/transactions.repository';

export const REVIEW_ENTITY = 'import_review';
export const SELECTION_ENTITY = 'import_selection';
export const PATCH_KIND = 'import.review.patch';
export const FREEZE_KIND = 'import.selection.freeze';
export const CONFIRM_KIND = 'import.selection.confirm';

export type PatchImportRows = { job_id: string; rows: readonly ImportRowPatch[] };

const REVISION = /^[1-9][0-9]{0,17}$/;
/** Row problems named in one refusal (the rest are found once these are fixed). */
const MAX_ROW_PROBLEMS = 50;

function revisionField(value: unknown, field: string): string {
  if (typeof value !== 'string' || !REVISION.test(value)) throw new ContractValidationError('VALIDATION_FAILED', 'Expected a revision.', field);
  return value;
}

/** `PatchImportRowsRequest`: 1-500 distinct rows, each normalized as the parser stores values. */
export function parsePatchBody(body: unknown, today = bangkokDate(new Date())): ImportRowPatch[] {
  const input = assertKnownFields(body, ['rows']);
  if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > IMPORT_PATCH_MAX_ROWS) {
    throw new ContractValidationError('VALIDATION_FAILED', `Expected 1-${IMPORT_PATCH_MAX_ROWS} rows.`, 'rows');
  }
  const rows = input.rows.map((row, index) => parseImportRowPatch(row, today, `rows.${index}`));
  if (new Set(rows.map((row) => row.source_row_id)).size !== rows.length) throw new ContractValidationError('VALIDATION_FAILED', 'Rows must not repeat.', 'rows');
  return rows;
}

/** `FreezeImportSelectionRequest`: the review revision, 1-5,000 distinct rows and the label mapping. */
export function parseFreezeBody(body: unknown): FreezeImportSelectionRequest {
  const input = assertKnownFields(body, ['review_revision', 'selected_row_ids', 'mapping']);
  return {
    review_revision: revisionField(input.review_revision, 'review_revision'),
    selected_row_ids: parseImportRowIds(input.selected_row_ids, IMPORT_SELECTION_MAX_ROWS, 'selected_row_ids'),
    mapping: parseImportMapping(input.mapping),
  };
}

/**
 * `ConfirmImportBatch`: the selection, its frozen revision and 1-500 distinct
 * rows of it; `receipt` only with the receipt image's row in the batch and the
 * user's explicit consent (P2c's literal).
 */
export function parseConfirmBody(body: unknown): ConfirmImportBatch {
  const input = assertKnownFields(body, ['selection_id', 'frozen_revision', 'batch_row_ids', 'receipt']);
  if (!isUuid(input.selection_id)) throw new ContractValidationError('VALIDATION_FAILED', 'selection_id must be a lower-case UUID.', 'selection_id');
  const batch: ConfirmImportBatch = {
    selection_id: input.selection_id,
    frozen_revision: revisionField(input.frozen_revision, 'frozen_revision'),
    batch_row_ids: parseImportRowIds(input.batch_row_ids, IMPORT_CONFIRM_BATCH_MAX_ROWS, 'batch_row_ids'),
  };
  if (input.receipt === undefined) return batch;
  const receipt = assertKnownFields(input.receipt, ['attachment_id', 'consent'], 'receipt');
  if (receipt.consent !== RECEIPT_RETENTION_CONSENT) throw stateProblem(ATTACHMENT_MESSAGE_KEYS.consentRequired, 'receipt.consent');
  if (!isUuid(receipt.attachment_id)) throw new ContractValidationError('VALIDATION_FAILED', 'attachment_id must be a lower-case UUID.', 'receipt.attachment_id');
  if (!batch.batch_row_ids.includes(IMPORT_IMAGE_ROW_ID)) throw new ContractValidationError('VALIDATION_FAILED', 'A receipt goes with its image row.', 'receipt');
  return { ...batch, receipt: { attachment_id: receipt.attachment_id, consent: RECEIPT_RETENTION_CONSENT } };
}

/** A 422 naming at most 50 rows (in file order) and why each cannot be used. */
function rowProblems(problems: ReadonlyMap<string, string>, messageKey: string): ProblemException {
  return new ProblemException(422, 'VALIDATION_FAILED', { messageKey, fields: Object.fromEntries([...problems].slice(0, MAX_ROW_PROBLEMS)) });
}

const hasOwn = (map: Readonly<Record<string, string>>, key: string | null): key is string => key !== null && Object.prototype.hasOwnProperty.call(map, key);

type PreviewRow = { job_id: string; status: string; review_revision: string; expired: boolean };
type SelectionRow = { selection_id: string; job_id: string; frozen_revision: string; row_count: number; preview_status: string; review_revision: string; expired: boolean };
type CandidateRow = { source_row_id: string; ordinal: number; type: string | null; amount_minor: string | null; occurred_on: string | null; wallet_label: string | null; category_label: string | null };
type BatchRow = {
  source_row_id: string;
  ordinal: number | null;
  occurred_on: string | null;
  committed: boolean;
  wallet_archived: boolean | null;
  tracking_start: string | null;
  category_archived: boolean | null;
};
type ProgressRow = { source_row_id: string; committed: boolean };

/**
 * P3: explicit, resumable import confirmation, owner side. Review
 * corrections, the full-selection freeze and every confirmation batch are M1
 * commands (account lock, session and policy re-check, receipt replay, one
 * change group). Only a confirmation batch writes financial records: each of
 * its rows becomes one transaction (a deterministic id per import row) and
 * one row-progress record in the same transaction, under M3's rules. Rows
 * committed earlier are acknowledged, never written again; a selection that
 * no longer matches the preview, or a row outside it, is a conflict. Raw
 * candidate fields never enter receipts, audit rows or synced snapshots.
 */
@Injectable()
export class ConfirmationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly executor: CommandExecutor,
    registry: CommandRegistry,
    private readonly attachments: AttachmentService,
  ) {
    registry.defineEntity({ entity: REVIEW_ENTITY, validate: isImportReviewSnapshot });
    registry.defineEntity({ entity: SELECTION_ENTITY, validate: isImportSelectionSnapshot });
    registry.defineCommand({ kind: PATCH_KIND, entity: REVIEW_ENTITY, outcome: 'updated', schemaVersions: [1], policy: 'current' });
    registry.defineCommand({ kind: FREEZE_KIND, entity: SELECTION_ENTITY, outcome: 'created', schemaVersions: [1], policy: 'current' });
    registry.defineCommand({ kind: CONFIRM_KIND, entity: SELECTION_ENTITY, outcome: 'updated', schemaVersions: [1], policy: 'current' });
  }

  /**
   * Corrections to rows not committed yet, made against review revision
   * `expectedVersion` (`If-Match`). The import's `import_review` entity moves
   * to version n for review revision n + 1 (revision 1 is the parse itself),
   * so a replayed command reports the same revision.
   */
  async patchRows(ctx: SessionContext, input: CommandInput<PatchImportRows>): Promise<PatchImportRowsResult> {
    if (input.kind !== PATCH_KIND) throw new Error(`corrections use ${PATCH_KIND}`);
    const jobId = this.jobId(input.payload.job_id);
    const rows = parsePatchBody({ rows: input.payload.rows });
    const expected = input.expectedVersion;
    if (expected === undefined) throw new ContractValidationError('VALIDATION_FAILED', 'If-Match must be the review revision.', 'if_match');
    const ack = await this.executor.run(ctx, { ...input, payload: { id: jobId, rows } }, async (tx) => {
      const preview = await this.readyPreview(tx, jobId);
      if (preview.review_revision !== String(expected)) throw new ProblemException(409, 'VERSION_CONFLICT', { current: { review_revision: preview.review_revision } });
      const ids = rows.map((row) => row.source_row_id);
      const known = new Set((await tx.query<{ source_row_id: string }>('SELECT source_row_id FROM import_candidates WHERE job_id = $1 AND source_row_id = ANY ($2::text[])', [jobId, ids])).map((row) => row.source_row_id));
      const unknown = ids.filter((id) => !known.has(id));
      if (unknown.length > 0) throw rowProblems(new Map(unknown.map((id) => [id, 'errors.import_row_unknown'])), 'errors.import_rows_unknown');
      const committed = await tx.query<{ source_row_id: string }>('SELECT source_row_id FROM import_row_progress WHERE job_id = $1 AND source_row_id = ANY ($2::text[]) ORDER BY source_row_id', [jobId, ids]);
      if (committed.length > 0) {
        throw new ProblemException(409, 'IMPORT_ROW_COMMITTED', { fields: Object.fromEntries(committed.slice(0, MAX_ROW_PROBLEMS).map((row) => [row.source_row_id, 'errors.import_row_committed'])) });
      }
      const sets = rows.map(({ source_row_id, ...set }) => ({ source_row_id, set }));
      const [{ revision }] = await tx.query<{ revision: string }>('SELECT gogospend_patch_import_rows($1, $2, $3::jsonb)::text AS revision', [jobId, expected, JSON.stringify(sets)]);
      const version = ((await entityHead(tx, REVIEW_ENTITY, jobId))?.version ?? 0) + 1;
      if (String(version + 1) !== revision) throw new Error('An import review revision moved without a correction command.');
      return {
        entityId: jobId,
        version,
        changes: [{ entity: REVIEW_ENTITY, id: jobId, version, state: 'active', snapshot: { id: jobId, review_revision: revision } }],
        audit: { rows: String(rows.length) },
      };
    });
    return { ack, review_revision: String(ack.version + 1) };
  }

  /**
   * Freezes the whole chosen set at the preview's current review revision:
   * every row's normalized fields with the owned wallet and category its labels
   * map to. Non-financial: it saves no record. The selection id follows from
   * the account and command, so a retried freeze names the same selection.
   */
  freezeSelection(ctx: SessionContext, input: CommandInput<FreezeImportSelection>): Promise<CommandAck> {
    if (input.kind !== FREEZE_KIND) throw new Error(`a freeze uses ${FREEZE_KIND}`);
    const jobId = this.jobId(input.payload.job_id);
    const request = parseFreezeBody({ review_revision: input.payload.review_revision, selected_row_ids: input.payload.selected_row_ids, mapping: input.payload.mapping });
    const id = derivedUuid(ctx.accountId, 'import-selection', input.commandId);
    return this.executor.run(ctx, { ...input, payload: { id, job_id: jobId, ...request } }, async (tx) => {
      const preview = await this.readyPreview(tx, jobId);
      if (preview.review_revision !== request.review_revision) throw new ProblemException(409, 'VERSION_CONFLICT', { current: { review_revision: preview.review_revision } });
      await this.checkSelectable(tx, jobId, request.selected_row_ids, request.mapping);
      const [{ count }] = await tx.query<{ count: number }>('SELECT gogospend_freeze_import_selection($1, $2, $3, $4::text[], $5::jsonb) AS count', [
        id, jobId, request.review_revision, request.selected_row_ids, JSON.stringify(request.mapping),
      ]);
      const [{ committed }] = await tx.query<{ committed: number }>(
        'SELECT count(*)::int AS committed FROM import_row_progress WHERE job_id = $1 AND source_row_id = ANY ($2::text[])',
        [jobId, request.selected_row_ids],
      );
      const snapshot: ImportSelectionSnapshot = { id, job_id: jobId, frozen_revision: request.review_revision, row_count: count, committed_count: committed };
      return { entityId: id, version: 1, changes: [{ entity: SELECTION_ENTITY, id, version: 1, state: 'active', snapshot }], audit: { rows: String(count) } };
    });
  }

  /**
   * One confirmation batch of a frozen selection. Under the account lock the
   * selection must still match the ready, unexpired preview at the frozen
   * revision the client names, and every row must be in it; then each row not
   * committed yet whose wallet and category still take it becomes one
   * transaction and one progress record. The result is read from durable
   * progress, so a replay (lost response) reports the same outcome.
   */
  async confirm(ctx: SessionContext, input: CommandInput<ConfirmImportBatch>, options: { jobId?: string } = {}): Promise<ConfirmImportBatchResult> {
    if (input.kind !== CONFIRM_KIND) throw new Error(`a confirmation uses ${CONFIRM_KIND}`);
    const batch = parseConfirmBody(input.payload);
    const { selection_id: id, ...rest } = batch;
    // P2c: a kept receipt is copied to the account's own receipt key before the
    // command (registry first, outside any transaction); the command links it.
    const prepared = batch.receipt ? await this.attachments.prepare(ctx, batch.receipt.attachment_id, input.commandId) : null;
    try {
      const ack = await this.executor.run(ctx, { ...input, payload: { id, ...rest } }, (tx) => this.confirmIn(tx, ctx, input.commandId, batch, options.jobId, prepared));
      return await this.outcome(ctx, batch, ack, options.jobId);
    } finally {
      // A copy the command did not publish is due at once.
      if (prepared) await this.attachments.release(ctx, prepared).catch(() => undefined);
    }
  }

  /** The selection's durable progress, or null for an unknown or foreign one. */
  progress(ctx: SessionContext, jobId: string, selectionId: string): Promise<ImportSelectionProgress | null> {
    return this.db.withOwnerTransaction(
      ctx,
      async (tx) => {
        const selection = await this.selection(tx, selectionId);
        if (!selection || selection.job_id !== jobId) return null;
        const rows = await this.selectionRows(tx, selection);
        const status: ImportSelectionStatus = selection.preview_status !== 'ready' || selection.expired ? 'expired' : selection.review_revision !== selection.frozen_revision ? 'stale' : 'open';
        return {
          selection_id: selection.selection_id,
          job_id: selection.job_id,
          frozen_revision: selection.frozen_revision,
          row_count: selection.row_count,
          status,
          committed: rows.filter((row) => row.committed).map((row) => row.source_row_id),
          remaining: rows.filter((row) => !row.committed).map((row) => row.source_row_id),
        };
      },
      { snapshot: true },
    );
  }

  private jobId(value: unknown): string {
    if (!isUuid(value)) throw new ProblemException(404, 'NOT_FOUND');
    return value;
  }

  /** The owner's preview, ready and unexpired: 404 for none (or another account's), 409 otherwise. */
  private async readyPreview(tx: OwnerTx, jobId: string): Promise<PreviewRow> {
    const [preview] = await tx.query<PreviewRow>(
      'SELECT job_id, status, review_revision::text AS review_revision, (expires_at <= now()) AS expired FROM import_previews WHERE job_id = $1',
      [jobId],
    );
    if (!preview) throw new ProblemException(404, 'NOT_FOUND');
    if (preview.status !== 'ready' || preview.expired) {
      throw new ProblemException(409, 'IMPORT_PREVIEW_UNAVAILABLE', { messageKey: preview.status === 'rejected' ? 'errors.import_preview_rejected' : 'errors.import_preview_expired' });
    }
    return preview;
  }

  /**
   * Every chosen row is a candidate with a date, an expense or income
   * direction and an amount, and labels the mapping names; every mapped
   * wallet and category is the owner's, active and of the row's direction;
   * no date is before its wallet's tracking start or after today in Bangkok.
   * A row that already has durable progress is a record now: a freeze that
   * includes it only has to carry its frozen copy (labels mapped to an
   * existing wallet and category of its direction), not find the wallet,
   * category and date still open - archiving them afterwards must not make
   * the rest of the import unfreezable.
   */
  private async checkSelectable(tx: OwnerTx, jobId: string, ids: readonly string[], mapping: ImportMapping): Promise<void> {
    const candidates = await tx.query<CandidateRow>(
      `SELECT source_row_id, ordinal, type, amount_minor::text AS amount_minor, to_char(occurred_on, 'YYYY-MM-DD') AS occurred_on, wallet_label, category_label
         FROM import_candidates WHERE job_id = $1 AND source_row_id = ANY ($2::text[]) ORDER BY ordinal`,
      [jobId, ids],
    );
    const known = new Set(candidates.map((row) => row.source_row_id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length > 0) throw rowProblems(new Map(unknown.map((id) => [id, 'errors.import_row_unknown'])), 'errors.import_rows_unknown');

    const committed = new Set(
      (await tx.query<{ source_row_id: string }>('SELECT source_row_id FROM import_row_progress WHERE job_id = $1 AND source_row_id = ANY ($2::text[])', [jobId, ids])).map((row) => row.source_row_id),
    );
    const walletIds = [...new Set(Object.values(mapping.wallets))];
    const categoryIds = [...new Set([...Object.values(mapping.categories.expense), ...Object.values(mapping.categories.income)])];
    const wallets = new Map(
      (await tx.query<{ id: string; archived: boolean; tracking_start: string }>(`SELECT id, archived, to_char(tracking_start, 'YYYY-MM-DD') AS tracking_start FROM wallets WHERE id = ANY ($1::uuid[])`, [walletIds]))
        .map((row) => [row.id, row]),
    );
    const categories = new Map(
      (await tx.query<{ id: string; type: string; archived: boolean }>('SELECT id, type, archived FROM categories WHERE id = ANY ($1::uuid[])', [categoryIds])).map((row) => [row.id, row]),
    );
    const today = bangkokDate(new Date());
    const problems = new Map<string, string>();
    for (const row of candidates) {
      const problem = ((): string | null => {
        if (row.type === 'transfer') return 'errors.import_row_transfer';
        if (row.type === null || row.amount_minor === null || row.occurred_on === null) return 'errors.import_row_incomplete';
        if (!hasOwn(mapping.wallets, row.wallet_label)) return 'errors.import_wallet_unmapped';
        const byType = row.type === 'income' ? mapping.categories.income : mapping.categories.expense;
        if (!hasOwn(byType, row.category_label)) return 'errors.import_category_unmapped';
        const wallet = wallets.get(mapping.wallets[row.wallet_label]);
        if (!wallet) return 'errors.wallet_not_found';
        const open = !committed.has(row.source_row_id);
        if (open && wallet.archived) return 'errors.wallet_archived';
        const category = categories.get(byType[row.category_label]);
        if (!category) return 'errors.category_not_found';
        if (category.type !== row.type) return 'errors.category_type_mismatch';
        if (open && category.archived) return 'errors.category_archived';
        if (!open) return null;
        if (row.occurred_on < wallet.tracking_start) return 'errors.date_before_tracking_start';
        if (row.occurred_on > today) return 'errors.date_in_future';
        return null;
      })();
      if (problem) problems.set(row.source_row_id, problem);
    }
    if (problems.size > 0) throw rowProblems(problems, 'errors.import_selection_invalid');
  }

  private async confirmIn(tx: OwnerTx, ctx: SessionContext, commandId: string, batch: ConfirmImportBatch, jobId: string | undefined, prepared: PreparedReceipt | null): Promise<MutationResult> {
    const selection = await this.selection(tx, batch.selection_id);
    if (!selection || (jobId !== undefined && selection.job_id !== jobId)) throw new ProblemException(404, 'NOT_FOUND');
    if (selection.preview_status !== 'ready' || selection.expired) throw new ProblemException(409, 'IMPORT_PREVIEW_UNAVAILABLE', { messageKey: 'errors.import_preview_expired' });
    if (batch.frozen_revision !== selection.frozen_revision) {
      throw new ProblemException(409, 'IMPORT_SELECTION_CONFLICT', { messageKey: 'errors.import_frozen_revision_mismatch', current: { frozen_revision: selection.frozen_revision } });
    }
    if (selection.review_revision !== selection.frozen_revision) {
      // The preview was corrected after this freeze: freeze the current revision again.
      throw new ProblemException(409, 'IMPORT_SELECTION_CONFLICT', { messageKey: 'errors.import_selection_stale', current: { review_revision: selection.review_revision } });
    }
    const rows = await tx.query<BatchRow>(
      `SELECT b.source_row_id, r.ordinal, to_char(r.occurred_on, 'YYYY-MM-DD') AS occurred_on, (g.source_row_id IS NOT NULL) AS committed,
              w.archived AS wallet_archived, to_char(w.tracking_start, 'YYYY-MM-DD') AS tracking_start, c.archived AS category_archived
         FROM unnest($2::text[]) AS b(source_row_id)
         LEFT JOIN import_selection_rows r ON r.selection_id = $1 AND r.source_row_id = b.source_row_id
         LEFT JOIN import_row_progress g ON g.job_id = $3 AND g.source_row_id = b.source_row_id
         LEFT JOIN wallets w ON w.id = r.wallet_id
         LEFT JOIN categories c ON c.id = r.category_id`,
      [selection.selection_id, batch.batch_row_ids, selection.job_id],
    );
    const outside = rows.filter((row) => row.ordinal === null).map((row) => row.source_row_id);
    if (outside.length > 0) {
      throw new ProblemException(409, 'IMPORT_SELECTION_CONFLICT', {
        messageKey: 'errors.import_rows_outside_selection',
        fields: Object.fromEntries(outside.slice(0, MAX_ROW_PROBLEMS).map((id) => [id, 'errors.import_row_outside_selection'])),
      });
    }
    // Under the lock: references and dates as M3 checks them for a new record.
    const today = bangkokDate(new Date());
    const open = rows
      .filter((row) => !row.committed)
      .sort((a, b) => (a.ordinal as number) - (b.ordinal as number))
      .filter((row) => !row.wallet_archived && !row.category_archived && row.tracking_start !== null && (row.occurred_on as string) >= row.tracking_start && (row.occurred_on as string) <= today)
      .map((row) => ({ source_row_id: row.source_row_id, id: derivedUuid(ctx.accountId, 'import-transaction', selection.job_id, row.source_row_id) }));
    // A record id is never reused (a purged one keeps its head).
    const taken = new Set((await tx.query<{ entity_id: string }>(`SELECT entity_id FROM entity_heads WHERE entity = 'transaction' AND entity_id = ANY ($1::uuid[])`, [open.map((row) => row.id)])).map((row) => row.entity_id));
    const saving = open.filter((row) => !taken.has(row.id));

    let records: RecordRow[] = [];
    if (saving.length > 0) {
      records = await tx.query<RecordRow>(
        `INSERT INTO transactions (account_id, id, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant)
         SELECT r.account_id, x.id, r.type, r.amount_minor, r.occurred_on, r.wallet_id, r.category_id, r.note, r.merchant
           FROM jsonb_to_recordset($2::jsonb) AS x(source_row_id text, id uuid)
           JOIN import_selection_rows r ON r.selection_id = $1 AND r.source_row_id = x.source_row_id
          ORDER BY r.ordinal
         RETURNING ${RECORD_COLUMNS}`,
        [selection.selection_id, JSON.stringify(saving)],
      );
      if (records.length !== saving.length) throw new Error('Every confirmed row becomes exactly one record.');
      await tx.query(
        `INSERT INTO import_row_progress (account_id, job_id, source_row_id, selection_id, transaction_id, command_id)
         SELECT gogospend_current_account(), $1, x.source_row_id, $2, x.id, $3 FROM jsonb_to_recordset($4::jsonb) AS x(source_row_id text, id uuid)`,
        [selection.job_id, selection.selection_id, commandId, JSON.stringify(saving)],
      );
    }
    const audit: Record<string, string> = {};
    // P2c: the record the receipt image's row becomes holds the kept receipt,
    // in this transaction, under P2c's ownership and retention rules (a
    // receipt past its window or removed refuses the whole batch).
    const imageRecord = saving.find((row) => row.source_row_id === IMPORT_IMAGE_ROW_ID);
    if (batch.receipt && prepared && imageRecord) {
      await this.linkReceipt(tx, selection.job_id, batch.receipt, prepared, imageRecord.id);
      const [held] = await tx.query<RecordRow>(`SELECT ${RECORD_COLUMNS} FROM transactions WHERE id = $1`, [imageRecord.id]);
      records = records.map((record) => (record.id === held.id ? held : record));
      audit.consent = RECEIPT_RETENTION_CONSENT;
    }

    const [{ committed }] = await tx.query<{ committed: number }>(
      `SELECT count(*)::int AS committed FROM import_selection_rows r
         JOIN import_row_progress g ON g.job_id = $2 AND g.source_row_id = r.source_row_id
        WHERE r.selection_id = $1`,
      [selection.selection_id, selection.job_id],
    );
    const head = await entityHead(tx, SELECTION_ENTITY, selection.selection_id);
    if (!head) throw new Error('A frozen selection has its entity head.');
    const version = head.version + 1;
    const snapshot: ImportSelectionSnapshot = {
      id: selection.selection_id,
      job_id: selection.job_id,
      frozen_revision: selection.frozen_revision,
      row_count: selection.row_count,
      committed_count: committed,
    };
    const changes: EntityChange[] = [
      { entity: SELECTION_ENTITY, id: selection.selection_id, version, state: 'active', snapshot },
      ...records.map((record): EntityChange => ({ entity: 'transaction', id: record.id, version: record.version, state: 'active', snapshot: toDto(record) })),
    ];
    const conflicted = rows.length - rows.filter((row) => row.committed).length - saving.length;
    const codes: AuditMetadata = { rows: String(saving.length), conflicted: String(conflicted), ...audit };
    return { entityId: selection.selection_id, version, changes, audit: codes };
  }

  /** Only this import's own receipt image (the preview's attachment id) may be kept with its record. */
  private async linkReceipt(tx: OwnerTx, jobId: string, receipt: ImportReceiptChoice, prepared: PreparedReceipt, transactionId: string): Promise<void> {
    const [preview] = await tx.query<{ attachment_id: string | null }>('SELECT image_attachment_id AS attachment_id FROM import_previews WHERE job_id = $1', [jobId]);
    if (!preview?.attachment_id || preview.attachment_id !== receipt.attachment_id || prepared.attachmentId !== receipt.attachment_id) {
      throw stateProblem('errors.import_receipt_not_this_import', 'receipt.attachment_id');
    }
    await this.attachments.attachIn(tx, prepared, transactionId);
  }

  /** The batch's outcome from durable progress (the same for a replay of the same command). */
  private outcome(ctx: SessionContext, batch: ConfirmImportBatch, ack: CommandAck, jobId: string | undefined): Promise<ConfirmImportBatchResult> {
    if (ack.entity_id !== batch.selection_id) throw new Error('A confirmation acknowledged another selection.');
    return this.db.withOwnerTransaction(
      ctx,
      async (tx) => {
        const selection = await this.selection(tx, batch.selection_id);
        // Frozen copies go with the preview (7 days): the batch's rows are no longer reported.
        if (!selection) throw new ProblemException(409, 'IMPORT_PREVIEW_UNAVAILABLE', { messageKey: 'errors.import_preview_expired' });
        if (jobId !== undefined && selection.job_id !== jobId) throw new ProblemException(404, 'NOT_FOUND');
        const rows = await this.selectionRows(tx, selection);
        const inBatch = new Set(batch.batch_row_ids);
        const conflicted = rows.filter((row) => inBatch.has(row.source_row_id) && !row.committed).map((row) => row.source_row_id);
        const skipped = new Set(conflicted);
        return {
          ack,
          selection_id: selection.selection_id,
          frozen_revision: selection.frozen_revision,
          committed: rows.filter((row) => inBatch.has(row.source_row_id) && row.committed).map((row) => row.source_row_id),
          remaining: rows.filter((row) => !row.committed && !skipped.has(row.source_row_id)).map((row) => row.source_row_id),
          conflicted,
        };
      },
      { snapshot: true },
    );
  }

  private async selection(tx: OwnerTx, selectionId: string): Promise<SelectionRow | null> {
    const [row] = await tx.query<SelectionRow>(
      `SELECT s.selection_id, s.job_id, s.frozen_revision::text AS frozen_revision, s.row_count,
              p.status AS preview_status, p.review_revision::text AS review_revision, (p.expires_at <= now()) AS expired
         FROM import_selections s JOIN import_previews p ON p.job_id = s.job_id
        WHERE s.selection_id = $1`,
      [selectionId],
    );
    return row ?? null;
  }

  /** The selection's rows in file order, each with whether the import has committed it (from any selection). */
  private selectionRows(tx: OwnerTx, selection: SelectionRow): Promise<ProgressRow[]> {
    return tx.query<ProgressRow>(
      `SELECT r.source_row_id, (g.source_row_id IS NOT NULL) AS committed
         FROM import_selection_rows r
         LEFT JOIN import_row_progress g ON g.job_id = $2 AND g.source_row_id = r.source_row_id
        WHERE r.selection_id = $1
        ORDER BY r.ordinal`,
      [selection.selection_id, selection.job_id],
    );
  }
}
