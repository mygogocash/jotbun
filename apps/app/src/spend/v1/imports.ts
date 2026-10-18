// P3 import port to the v1 API: upload a file into private quarantine, read
// its status and reviewable preview, save review corrections, freeze the full
// selection and confirm it in batches. Every response is checked against the
// exact shared contract; every write is an immutable command whose key the
// caller holds until its outcome is known. A parsed or frozen import has saved
// nothing: only an acknowledged confirmation batch saves records.
import { COMMAND_OUTCOMES, ENTITY_STATES, IMPORT_PREVIEW_PAGE_MAX_LIMIT, IMPORT_PARSE_LIMITS, IMPORT_SELECTION_STATUSES, isImportJobDto, isImportPreview, isImportSourceRowId, isUuid } from '@gogospend/contracts';
import type {
  CommandAck,
  ConfirmImportBatch,
  ConfirmImportBatchResult,
  FreezeImportSelectionRequest,
  ImportJobDto,
  ImportPreview,
  ImportRowPatch,
  ImportSelectionProgress,
  PatchImportRowsResult,
  UploadAccepted,
} from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import type { V1Transport } from '../../api/client.ts';

/** The command schema this build emits for import commands. */
export const IMPORT_COMMAND_SCHEMA = 1;

/** A picked file: its bytes, declared type and original name (a display label only). */
export type ImportFile = { bytes: Uint8Array; contentType: string; name: string };

/** Optional additive paging of a preview's candidates (the server defaults a missing field: offset 0, limit 500). */
export type ImportPreviewPaging = { offset?: number; limit?: number };

export type ImportResources = {
  /** POST /v1/imports with the raw file; the key replays the original outcome. */
  upload(file: ImportFile, commandId: string): Promise<UploadAccepted>;
  status(jobId: string): Promise<ImportJobDto>;
  /**
   * GET /v1/imports/:id/preview. Without `paging` this is the whole preview
   * (no `page` in the answer); with it, only that page of candidates, which
   * the answer must announce as exactly that page.
   */
  preview(jobId: string, paging?: ImportPreviewPaging): Promise<ImportPreview>;
  /** PATCH /v1/imports/:id/rows against review revision `reviewRevision` (If-Match). */
  patchRows(jobId: string, reviewRevision: string, rows: readonly ImportRowPatch[], commandId: string): Promise<PatchImportRowsResult>;
  /** POST /v1/imports/:id/selections: the acknowledgement's `entity_id` is the selection id. */
  freeze(jobId: string, request: FreezeImportSelectionRequest, commandId: string): Promise<CommandAck>;
  confirm(jobId: string, batch: ConfirmImportBatch, commandId: string): Promise<ConfirmImportBatchResult>;
  selectionProgress(jobId: string, selectionId: string): Promise<ImportSelectionProgress>;
};

type Json = Record<string, unknown>;
const REVISION = /^(?:0|[1-9][0-9]*)$/;
const POSITIVE_REVISION = /^[1-9][0-9]*$/;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const hasExactly = (value: Json, keys: readonly string[]) => Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const isRowIds = (value: unknown): value is string[] => Array.isArray(value) && value.every(isImportSourceRowId) && new Set(value).size === value.length;

function isAck(value: unknown, commandId: string): value is CommandAck {
  return isObject(value) && hasExactly(value, ['command_id', 'entity_id', 'version', 'committed_revision', 'outcome', 'entity_state']) &&
    value.command_id === commandId && isUuid(value.entity_id) && Number.isSafeInteger(value.version) && (value.version as number) >= 1 &&
    typeof value.committed_revision === 'string' && REVISION.test(value.committed_revision) &&
    (COMMAND_OUTCOMES as readonly unknown[]).includes(value.outcome) && (ENTITY_STATES as readonly unknown[]).includes(value.entity_state);
}

export function isPatchImportRowsResult(value: unknown, commandId: string, jobId: string): value is PatchImportRowsResult {
  return isObject(value) && hasExactly(value, ['ack', 'review_revision']) && isAck(value.ack, commandId) && value.ack.entity_id === jobId &&
    typeof value.review_revision === 'string' && POSITIVE_REVISION.test(value.review_revision);
}

/** The exact result of `batch`: its rows split into committed and conflicted, and the selection's remaining rows. */
export function isConfirmImportBatchResult(value: unknown, commandId: string, batch: ConfirmImportBatch): value is ConfirmImportBatchResult {
  if (!isObject(value) || !hasExactly(value, ['ack', 'selection_id', 'frozen_revision', 'committed', 'remaining', 'conflicted'])) return false;
  if (!isAck(value.ack, commandId) || value.ack.entity_id !== batch.selection_id || value.selection_id !== batch.selection_id) return false;
  if (value.frozen_revision !== batch.frozen_revision || !isRowIds(value.committed) || !isRowIds(value.remaining) || !isRowIds(value.conflicted)) return false;
  const inBatch = new Set(batch.batch_row_ids);
  const reported = [...value.committed, ...value.conflicted];
  // Every batch row is reported exactly once, and nothing else is.
  return reported.length === inBatch.size && reported.every((id) => inBatch.has(id)) && new Set(reported).size === reported.length &&
    value.remaining.every((id) => !inBatch.has(id));
}

export function isImportSelectionProgress(value: unknown, selectionId: string): value is ImportSelectionProgress {
  return isObject(value) && hasExactly(value, ['selection_id', 'job_id', 'frozen_revision', 'row_count', 'status', 'committed', 'remaining']) &&
    value.selection_id === selectionId && isUuid(value.job_id) && typeof value.frozen_revision === 'string' && POSITIVE_REVISION.test(value.frozen_revision) &&
    Number.isSafeInteger(value.row_count) && (IMPORT_SELECTION_STATUSES as readonly unknown[]).includes(value.status) &&
    isRowIds(value.committed) && isRowIds(value.remaining) && (value.committed as string[]).length + (value.remaining as string[]).length === value.row_count;
}

const segment = (id: string) => {
  if (!isUuid(id)) throw new V1Error('invalid', 0, 'INVALID_ID');
  return id;
};

export function createImportResources(transport: V1Transport): ImportResources {
  return {
    upload: (file, commandId) =>
      transport.request('POST', '/v1/imports', {
        raw: { bytes: file.bytes, contentType: file.contentType, fileName: file.name },
        command: { id: segment(commandId), schemaVersion: IMPORT_COMMAND_SCHEMA },
        validate: isImportJobDto,
      }),
    status: (jobId) => transport.request('GET', `/v1/imports/${segment(jobId)}`, { validate: (value): value is ImportJobDto => isImportJobDto(value) && value.job_id === jobId }),
    async preview(jobId, paging) {
      const id = segment(jobId);
      if (paging === undefined) {
        return transport.request('GET', `/v1/imports/${id}/preview`, { validate: (value): value is ImportPreview => isImportPreview(value) && value.job_id === jobId && value.page === undefined });
      }
      const { offset, limit } = paging;
      if (offset !== undefined && !(Number.isSafeInteger(offset) && offset >= 0 && offset <= IMPORT_PARSE_LIMITS.candidateRows)) throw new V1Error('invalid', 0, 'INVALID_PAGING');
      if (limit !== undefined && !(Number.isSafeInteger(limit) && limit >= 1 && limit <= IMPORT_PREVIEW_PAGE_MAX_LIMIT)) throw new V1Error('invalid', 0, 'INVALID_PAGING');
      if (offset === undefined && limit === undefined) throw new V1Error('invalid', 0, 'INVALID_PAGING');
      const query = new URLSearchParams();
      if (offset !== undefined) query.set('offset', String(offset));
      if (limit !== undefined) query.set('limit', String(limit));
      const wantOffset = offset ?? 0;
      return transport.request('GET', `/v1/imports/${id}/preview?${query.toString()}`, {
        validate: (value): value is ImportPreview =>
          isImportPreview(value) &&
          value.job_id === jobId &&
          // Only a ready preview has rows to page; any other state is served as it is, without a page.
          (value.status === 'ready'
            ? value.page !== undefined && value.page.offset === wantOffset && (limit === undefined || value.page.limit === limit)
            : value.page === undefined),
      });
    },
    patchRows(jobId, reviewRevision, rows, commandId) {
      const ifMatch = Number(reviewRevision);
      if (!POSITIVE_REVISION.test(reviewRevision) || !Number.isSafeInteger(ifMatch)) throw new V1Error('invalid', 0, 'INVALID_REVISION');
      return transport.request('PATCH', `/v1/imports/${segment(jobId)}/rows`, {
        body: { rows },
        command: { id: segment(commandId), schemaVersion: IMPORT_COMMAND_SCHEMA, ifMatch },
        validate: (value): value is PatchImportRowsResult => isPatchImportRowsResult(value, commandId, jobId),
      });
    },
    freeze: (jobId, request, commandId) =>
      transport.request('POST', `/v1/imports/${segment(jobId)}/selections`, {
        body: request,
        command: { id: segment(commandId), schemaVersion: IMPORT_COMMAND_SCHEMA },
        validate: (value): value is CommandAck => isAck(value, commandId) && value.outcome === 'created',
      }),
    confirm: (jobId, batch, commandId) =>
      transport.request('POST', `/v1/imports/${segment(jobId)}/confirmations`, {
        body: batch,
        command: { id: segment(commandId), schemaVersion: IMPORT_COMMAND_SCHEMA },
        validate: (value): value is ConfirmImportBatchResult => isConfirmImportBatchResult(value, commandId, batch),
      }),
    selectionProgress: (jobId, selectionId) =>
      transport.request('GET', `/v1/imports/${segment(jobId)}/selections/${segment(selectionId)}`, {
        validate: (value): value is ImportSelectionProgress => isImportSelectionProgress(value, selectionId),
      }),
  };
}

/** Reads attempts of `fetchWholePreview` before it reports that the preview keeps changing underneath it. */
const WHOLE_PREVIEW_ATTEMPTS = 3;

/**
 * The whole preview, read in pages of `pageSize` and joined: the same value a
 * plain (unpaged) read gives, with no `page`. A preview that is not ready has
 * no page and is returned as the one read gave it. Each page is its own
 * snapshot, so if a correction moves the review revision between pages the
 * read starts over; if it moves on every attempt the read is refused
 * (`PREVIEW_CHANGED`) rather than joined from different revisions.
 */
export async function fetchWholePreview(resources: Pick<ImportResources, 'preview'>, jobId: string, pageSize = IMPORT_PREVIEW_PAGE_MAX_LIMIT): Promise<ImportPreview> {
  for (let attempt = 0; attempt < WHOLE_PREVIEW_ATTEMPTS; attempt += 1) {
    const first = await resources.preview(jobId, { offset: 0, limit: pageSize });
    if (first.page === undefined) return first;
    const candidates = [...first.candidates];
    const advice = [...first.duplicate_advice];
    let next = first.page.next_offset;
    let stable = true;
    while (next !== null) {
      const page = await resources.preview(jobId, { offset: next, limit: pageSize });
      if (page.page === undefined || page.review_revision !== first.review_revision || page.status !== first.status) {
        stable = false;
        break;
      }
      candidates.push(...page.candidates);
      advice.push(...page.duplicate_advice);
      next = page.page.next_offset;
    }
    if (stable) {
      const { page: _page, ...whole } = first;
      return { ...whole, candidates, duplicate_advice: advice };
    }
  }
  throw new V1Error('conflict', 0, 'PREVIEW_CHANGED');
}
