// P3 import port to the v1 API: upload a file into private quarantine, read
// its status and reviewable preview, save review corrections, freeze the full
// selection and confirm it in batches. Every response is checked against the
// exact shared contract; every write is an immutable command whose key the
// caller holds until its outcome is known. A parsed or frozen import has saved
// nothing: only an acknowledged confirmation batch saves records.
import { COMMAND_OUTCOMES, ENTITY_STATES, IMPORT_SELECTION_STATUSES, isImportJobDto, isImportPreview, isImportSourceRowId, isUuid } from '@gogospend/contracts';
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

export type ImportResources = {
  /** POST /v1/imports with the raw file; the key replays the original outcome. */
  upload(file: ImportFile, commandId: string): Promise<UploadAccepted>;
  status(jobId: string): Promise<ImportJobDto>;
  preview(jobId: string): Promise<ImportPreview>;
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
    preview: (jobId) => transport.request('GET', `/v1/imports/${segment(jobId)}/preview`, { validate: (value): value is ImportPreview => isImportPreview(value) && value.job_id === jobId }),
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
