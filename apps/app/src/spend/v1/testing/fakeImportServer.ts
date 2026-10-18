// An in-memory P3 import server for the import journey tests: receipts by
// command key (a resent command replays; the same key with another body is a
// mismatch), a preview whose review revision moves with each correction, one
// frozen selection per freeze, durable row progress keyed by source row, a
// change-group byte budget that refuses an oversized batch before anything
// commits, and scripted failures - including a commit whose response is lost.
// It mirrors the server's rules only as far as the client needs. Test use only.
import type {
  CommandAck,
  ConfirmImportBatch,
  ConfirmImportBatchResult,
  FreezeImportSelectionRequest,
  ImportCandidate,
  ImportJobDto,
  ImportPreview,
  ImportRowPatch,
  ImportSelectionProgress,
  PatchImportRowsResult,
} from '@gogospend/contracts';

import { V1Error } from '../../../api/client.ts';
import type { V1Outcome } from '../../../api/client.ts';
import type { ImportFile, ImportResources } from '../imports.ts';

export type ImportMethod = keyof ImportResources;
export type ImportScript =
  | { kind: 'network_before' } // never reached the server
  | { kind: 'network_after' } // committed; the response was lost
  | { kind: 'problem'; outcome: V1Outcome; status: number; code: string; fields?: Record<string, string>; current?: unknown };

export const IMPORT_PROBLEMS = {
  unavailable: (): ImportScript => ({ kind: 'problem', outcome: 'unavailable', status: 503, code: 'IMPORTS_PAUSED' }),
  rateLimited: (): ImportScript => ({ kind: 'problem', outcome: 'rate_limited', status: 429, code: 'RATE_LIMITED' }),
};

export const JOB_ID = '7d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export type FakeImportCall = { method: ImportMethod; key: string | null; body: unknown; revision?: string };

/** `count` reviewable rows: expense rows in Cash, every fourth an income in Bank. */
export function syntheticCandidates(count: number, note: (i: number) => string | null = (i) => `row ${i + 1}`): ImportCandidate[] {
  return Array.from({ length: count }, (_, i) => {
    const income = i % 4 === 3;
    return {
      source_row_id: `row:${i + 2}`,
      ordinal: i + 1,
      occurred_on: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
      type: income ? 'income' : 'expense',
      amount_minor: String(((i * 7919) % 999_999) + 1),
      wallet_label: income ? 'Bank' : 'Cash',
      category_label: income ? 'salary' : 'food',
      merchant: null,
      note: note(i),
      review_required: false,
    } satisfies ImportCandidate;
  });
}

export function createFakeImportServer(options: { candidates: ImportCandidate[]; statuses?: ImportPreview['status'][]; groupBudgetBytes?: number }) {
  const candidates = new Map(options.candidates.map((row) => [row.source_row_id, { ...row }]));
  const statuses = [...(options.statuses ?? [])];
  const budget = options.groupBudgetBytes ?? 1024 * 1024;
  let revision = 1;
  let sequence = 0;
  let committedRevision = 100;
  const receipts = new Map<string, { body: string; result: unknown }>();
  const selections = new Map<string, { frozenRevision: string; rowIds: string[]; version: number; fields: Map<string, ImportCandidate> }>();
  /** source_row_id → transaction id: one record per committed row, ever. */
  const progress = new Map<string, string>();
  const transactions = new Map<string, { source_row_id: string; selection: string }>();
  const calls: FakeImportCall[] = [];
  /** Rows whose wallet or category can no longer take them: reported conflicted, never saved. */
  const blocked = new Set<string>();
  const scripts = new Map<ImportMethod, ImportScript[]>();

  const nextAck = (key: string, entityId: string, version: number, outcome: CommandAck['outcome']): CommandAck => {
    committedRevision += 1;
    return { command_id: key, entity_id: entityId, version, committed_revision: String(committedRevision), outcome, entity_state: 'active' };
  };

  /** Runs `commit` once per key (replays after), honouring a scripted failure before or after it. */
  async function command<T>(method: ImportMethod, key: string, body: unknown, commit: () => T, outcome?: (stored: T) => T): Promise<T> {
    const script = scripts.get(method)?.shift();
    if (script?.kind === 'network_before') throw new V1Error('network', 0, 'NETWORK_ERROR');
    if (script?.kind === 'problem') throw new V1Error(script.outcome, script.status, script.code, { fields: script.fields, current: script.current });
    const text = JSON.stringify(body);
    const stored = receipts.get(key);
    let result: T;
    if (stored) {
      if (stored.body !== text) throw new V1Error('idempotency_mismatch', 409, 'IDEMPOTENCY_MISMATCH');
      result = outcome ? outcome(stored.result as T) : (stored.result as T);
    } else {
      result = commit();
      receipts.set(key, { body: text, result });
    }
    if (script?.kind === 'network_after') throw new V1Error('network', 0, 'NETWORK_ERROR');
    return structuredClone(result);
  }

  const preview = (): ImportPreview => ({
    job_id: JOB_ID,
    status: 'ready',
    candidates: [...candidates.values()].sort((a, b) => a.ordinal - b.ordinal).map((row) => ({ ...row })),
    issues: [],
    duplicate_advice: [],
    review_revision: String(revision),
    expires_at: '2026-10-25T03:00:00.000Z',
    summary: { layout: 'generic', candidate_count: candidates.size, review_required_count: 0, totals: { expense_minor: '0', income_minor: '0', transfer_minor: '0' }, image: null },
  });

  const batchOutcome = (selectionId: string, batch: ConfirmImportBatch, ack: CommandAck): ConfirmImportBatchResult => {
    const selection = selections.get(selectionId) as { rowIds: string[]; frozenRevision: string };
    const inBatch = new Set(batch.batch_row_ids);
    const conflicted = selection.rowIds.filter((id) => inBatch.has(id) && !progress.has(id));
    return {
      ack,
      selection_id: selectionId,
      frozen_revision: selection.frozenRevision,
      committed: selection.rowIds.filter((id) => inBatch.has(id) && progress.has(id)),
      remaining: selection.rowIds.filter((id) => !progress.has(id) && !conflicted.includes(id)),
      conflicted,
    };
  };

  const resources: ImportResources = {
    async upload(file: ImportFile, key: string) {
      calls.push({ method: 'upload', key, body: { name: file.name, contentType: file.contentType, bytes: file.bytes.length } });
      return command('upload', key, { name: file.name, contentType: file.contentType, bytes: [...file.bytes] }, (): ImportJobDto => ({
        job_id: JOB_ID, status: 'queued', format: 'csv', file_name: file.name, bytes: file.bytes.length, received_at: '2026-10-18T03:00:00.000Z', expires_at: '2026-10-19T03:00:00.000Z',
      }));
    },
    async status() {
      throw new V1Error('not_found', 404, 'NOT_FOUND');
    },
    async preview(jobId) {
      calls.push({ method: 'preview', key: null, body: jobId });
      const script = scripts.get('preview')?.shift();
      if (script?.kind === 'network_before' || script?.kind === 'network_after') throw new V1Error('network', 0, 'NETWORK_ERROR');
      if (script?.kind === 'problem') throw new V1Error(script.outcome, script.status, script.code);
      const status = statuses.shift();
      if (status && status !== 'ready') return { job_id: JOB_ID, status, candidates: [], issues: [], duplicate_advice: [], review_revision: null, expires_at: null, summary: null };
      return preview();
    },
    async patchRows(jobId, reviewRevision, rows, key) {
      calls.push({ method: 'patchRows', key, body: rows, revision: reviewRevision });
      return command('patchRows', key, { reviewRevision, rows }, (): PatchImportRowsResult => {
        if (reviewRevision !== String(revision)) throw new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: { review_revision: String(revision) } });
        if (rows.length > 500) throw new V1Error('invalid', 422, 'VALIDATION_FAILED');
        const committed = rows.filter((row) => progress.has(row.source_row_id));
        if (committed.length > 0) throw new V1Error('conflict', 409, 'IMPORT_ROW_COMMITTED', { fields: Object.fromEntries(committed.map((row) => [row.source_row_id, 'errors.import_row_committed'])) });
        for (const row of rows) {
          const current = candidates.get(row.source_row_id);
          if (!current) throw new V1Error('invalid', 422, 'VALIDATION_FAILED');
          const { source_row_id: _id, ...set } = row as ImportRowPatch;
          Object.assign(current, set);
        }
        revision += 1;
        return { ack: nextAck(key, jobId, revision - 1, 'updated'), review_revision: String(revision) };
      });
    },
    async freeze(jobId, request: FreezeImportSelectionRequest, key) {
      calls.push({ method: 'freeze', key, body: request });
      return command('freeze', key, request, (): CommandAck => {
        if (request.review_revision !== String(revision)) throw new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: { review_revision: String(revision) } });
        const fields = new Map<string, ImportCandidate>();
        for (const id of request.selected_row_ids) {
          const row = candidates.get(id);
          const categories = row?.type === 'income' ? request.mapping.categories.income : request.mapping.categories.expense;
          if (!row || row.type === 'transfer' || !row.wallet_label || !(row.wallet_label in request.mapping.wallets) || !row.category_label || !(row.category_label in categories)) {
            throw new V1Error('invalid', 422, 'VALIDATION_FAILED', { fields: { [id]: 'errors.import_row_incomplete' } });
          }
          fields.set(id, { ...row });
        }
        sequence += 1;
        const id = uuid(sequence);
        selections.set(id, { frozenRevision: request.review_revision, rowIds: [...request.selected_row_ids], version: 1, fields });
        void jobId;
        return nextAck(key, id, 1, 'created');
      });
    },
    async confirm(_jobId, batch, key) {
      calls.push({ method: 'confirm', key, body: batch });
      return command(
        'confirm',
        key,
        batch,
        (): ConfirmImportBatchResult => {
          if (batch.batch_row_ids.length > 500) throw new V1Error('invalid', 422, 'VALIDATION_FAILED', { fields: { batch_row_ids: 'VALIDATION_FAILED' } });
          const selection = selections.get(batch.selection_id);
          if (!selection) throw new V1Error('not_found', 404, 'NOT_FOUND');
          if (batch.frozen_revision !== selection.frozenRevision || selection.frozenRevision !== String(revision) || batch.batch_row_ids.some((id) => !selection.rowIds.includes(id))) {
            throw new V1Error('conflict', 409, 'IMPORT_SELECTION_CONFLICT');
          }
          const saving = batch.batch_row_ids.filter((id) => !progress.has(id) && !blocked.has(id));
          // One change group: each saved record's snapshot, about 300 bytes plus its note.
          const bytes = saving.reduce((sum, id) => sum + 300 + new TextEncoder().encode(selection.fields.get(id)?.note ?? '').length, 0);
          if (bytes > budget) throw new V1Error('too_large', 413, 'COMMAND_TOO_LARGE');
          for (const id of saving) {
            sequence += 1;
            const transaction = uuid(1_000_000 + sequence);
            progress.set(id, transaction);
            transactions.set(transaction, { source_row_id: id, selection: batch.selection_id });
          }
          selection.version += 1;
          return batchOutcome(batch.selection_id, batch, nextAck(key, batch.selection_id, selection.version, 'updated'));
        },
        // A replay reports the batch from durable progress, as the server does.
        (stored) => batchOutcome(batch.selection_id, batch, stored.ack),
      );
    },
    async selectionProgress(jobId, selectionId) {
      const selection = selections.get(selectionId);
      if (!selection) throw new V1Error('not_found', 404, 'NOT_FOUND');
      return {
        selection_id: selectionId, job_id: jobId, frozen_revision: selection.frozenRevision, row_count: selection.rowIds.length,
        status: selection.frozenRevision === String(revision) ? 'open' : 'stale',
        committed: selection.rowIds.filter((id) => progress.has(id)),
        remaining: selection.rowIds.filter((id) => !progress.has(id)),
      } satisfies ImportSelectionProgress;
    },
  };

  return {
    resources,
    calls,
    callsOf: (method: ImportMethod) => calls.filter((call) => call.method === method),
    /** Queues a failure for the next call of `method`. */
    script(method: ImportMethod, ...entries: ImportScript[]) {
      scripts.set(method, [...(scripts.get(method) ?? []), ...entries]);
    },
    /** Another device corrects the preview: frozen selections become stale. */
    bumpRevision() {
      revision += 1;
    },
    /** Another device already confirmed these rows of a selection (with its own key). */
    commitElsewhere(selectionId: string, rowIds: readonly string[]) {
      for (const id of rowIds) {
        if (progress.has(id)) continue;
        sequence += 1;
        const transaction = uuid(1_000_000 + sequence);
        progress.set(id, transaction);
        transactions.set(transaction, { source_row_id: id, selection: selectionId });
      }
    },
    /** Their wallet or category was archived after the freeze. */
    blockRows(rowIds: readonly string[]) {
      for (const id of rowIds) blocked.add(id);
    },
    revision: () => String(revision),
    transactions: () => [...transactions.values()],
    committedRows: () => [...progress.keys()],
    selectionIds: () => [...selections.keys()],
  };
}
