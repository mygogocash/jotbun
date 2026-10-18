// P3 import journey, client side: upload -> parsing -> review -> freeze the
// full selection -> confirm batches -> progress and result. Pure state plus
// steps that talk to the import port; the review screen renders it (after E2
// visual approval) and the import flag stays off until every gate passes.
//
// Rules this file keeps:
//   - Parsing succeeded never means saved. Only acknowledged confirmation
//     batches save records; the journey reports committed, remaining and
//     conflicted rows from the server's answers, never from what was sent.
//   - Every selected row needs an explicit review of its date, direction
//     (type), category and wallet, and every label it uses mapped to an owned
//     wallet or category. Nothing is selected for the user.
//   - Every command is persisted as pending (key and body) before it is sent,
//     and resent exactly as itself until its outcome is known. An unknown
//     outcome (network, gateway, garbled answer, pause) keeps the review and
//     the pending command; the next attempt resolves the original key and
//     body before anything else - never a repartition first.
//   - Only a proven pre-commit refusal (`413 COMMAND_TOO_LARGE`) lets a batch
//     be split, into smaller batches with new command ids.
//   - The draft (review, mapping, pending commands, progress) is kept until
//     every outcome is known.
import type { ConfirmImportBatch, ConfirmImportBatchResult, FreezeImportSelectionRequest, ImportCandidate, ImportMapping, ImportPreview, ImportRowPatch } from '@gogospend/contracts';

import { V1Error } from '../../api/client.ts';
import type { ImportFile, ImportResources } from './imports.ts';

export const REVIEW_FIELDS = ['date', 'type', 'category', 'wallet'] as const;
export type ReviewField = (typeof REVIEW_FIELDS)[number];
/** A row's unsaved corrections (each named field replaced; null makes it unknown). */
export type RowEdit = Omit<ImportRowPatch, 'source_row_id'>;
/** A command whose outcome is not known yet: resend exactly this, never a new key. */
export type PendingCommand<B> = { key: string; body: B };
export type ImportStage = 'idle' | 'uploading' | 'parsing' | 'review' | 'confirming' | 'done' | 'failed' | 'expired';
export type ImportProblemKind =
  /** The outcome is unknown: the pending command is kept and resent as itself. */
  | 'unconfirmed'
  /** A read failed (offline): try again. */
  | 'offline'
  /** The preview moved on (another device corrected it): reload, the edits are kept. */
  | 'review_changed'
  /** The selection no longer matches the preview: freeze again (the review is kept). */
  | 'selection_conflict'
  /** The preview expired or was never ready. */
  | 'preview_unavailable'
  /** A correction named a row already saved; that row's edits were dropped. */
  | 'row_committed'
  /** A definite refusal of this content (`fields` names the rows). */
  | 'invalid'
  | 'rate_limited'
  /** Saving cannot continue until the user acts elsewhere (update, sign in, terms, session). */
  | 'blocked'
  | 'parse_failed'
  | 'rejected';
export type ImportProblem = { kind: ImportProblemKind; code?: string; fields?: Record<string, string> };

export type ImportJourney = {
  stage: ImportStage;
  jobId: string | null;
  pendingUpload: PendingCommand<{ name: string; contentType: string; bytes: number }> | null;
  preview: ImportPreview | null;
  reviewRevision: string | null;
  /** Chosen rows, in file order. */
  selected: string[];
  reviewed: Record<string, ReviewField[]>;
  edits: Record<string, RowEdit>;
  mapping: ImportMapping;
  pendingPatch: PendingCommand<{ revision: string; rows: ImportRowPatch[] }> | null;
  pendingFreeze: PendingCommand<FreezeImportSelectionRequest> | null;
  selection: { id: string; frozenRevision: string; rowIds: string[] } | null;
  pendingBatch: PendingCommand<ConfirmImportBatch> | null;
  /** Rows per confirmation command; halved after a proven COMMAND_TOO_LARGE. */
  batchSize: number;
  committed: string[];
  conflicted: string[];
  remaining: string[];
  problem: ImportProblem | null;
};

export type ImportDraftStore = { load(): Promise<ImportJourney | null>; save(journey: ImportJourney): Promise<void>; clear(): Promise<void> };
export type ImportDeps = {
  resources: ImportResources;
  store: ImportDraftStore;
  newId: () => string;
  sleep?: (ms: number) => Promise<void>;
  /** Wait between preview checks while parsing (default 2 s). */
  pollMs?: number;
  /** Preview checks per call before reporting `parsing` (default 30). */
  maxPolls?: number;
};
export type ReviewBlocker = {
  source_row_id: string | null;
  reason: 'nothing_selected' | 'unsaved_corrections' | 'unreviewed' | 'missing_value' | 'transfer' | 'wallet_unmapped' | 'category_unmapped';
  fields?: ReviewField[];
};

const MAX_ROWS_PER_COMMAND = 500;
const EDIT_FIELDS: Readonly<Record<keyof RowEdit, ReviewField | null>> = {
  occurred_on: 'date', type: 'type', amount_minor: null, wallet_label: 'wallet', category_label: 'category', merchant: null, note: null,
};

/** An in-memory draft store (tests, and the screen until a device store is approved). */
export function memoryDraftStore(initial: ImportJourney | null = null): ImportDraftStore & { current(): ImportJourney | null } {
  let saved = initial ? structuredClone(initial) : null;
  return {
    load: async () => (saved ? structuredClone(saved) : null),
    save: async (journey) => {
      saved = structuredClone(journey);
    },
    clear: async () => {
      saved = null;
    },
    current: () => saved,
  };
}

export function newJourney(): ImportJourney {
  return {
    stage: 'idle', jobId: null, pendingUpload: null, preview: null, reviewRevision: null, selected: [], reviewed: {}, edits: {},
    mapping: { wallets: {}, categories: { expense: {}, income: {} } }, pendingPatch: null, pendingFreeze: null, selection: null,
    pendingBatch: null, batchSize: MAX_ROWS_PER_COMMAND, committed: [], conflicted: [], remaining: [], problem: null,
  };
}

const ordinals = (journey: ImportJourney): Map<string, number> => new Map((journey.preview?.candidates ?? []).map((row) => [row.source_row_id, row.ordinal]));
const inFileOrder = (journey: ImportJourney, ids: Iterable<string>): string[] => {
  const order = ordinals(journey);
  return [...new Set(ids)].filter((id) => order.has(id)).sort((a, b) => (order.get(a) as number) - (order.get(b) as number));
};

// ---------------------------------------------------------------------------
// Review (pure)
// ---------------------------------------------------------------------------

/** Chooses or drops rows (only the preview's rows; committed rows stay chosen once frozen). */
export function selectRows(journey: ImportJourney, ids: readonly string[], selected: boolean): ImportJourney {
  const chosen = new Set(journey.selected);
  for (const id of ids) {
    if (selected) chosen.add(id);
    else chosen.delete(id);
  }
  return { ...journey, selected: inFileOrder(journey, chosen) };
}

/** The user explicitly confirms these fields of these rows as shown. */
export function markReviewed(journey: ImportJourney, ids: readonly string[], fields: readonly ReviewField[] = REVIEW_FIELDS): ImportJourney {
  const reviewed = { ...journey.reviewed };
  for (const id of ids) reviewed[id] = REVIEW_FIELDS.filter((field) => fields.includes(field) || (reviewed[id] ?? []).includes(field));
  return { ...journey, reviewed };
}

/** A correction to one row (saved by `saveCorrections`); a corrected field counts as reviewed. */
export function editRow(journey: ImportJourney, id: string, edit: RowEdit): ImportJourney {
  if (!ordinals(journey).has(id)) return journey;
  const edits = { ...journey.edits, [id]: { ...(journey.edits[id] ?? {}), ...edit } };
  const fields = (Object.keys(edit) as (keyof RowEdit)[]).map((key) => EDIT_FIELDS[key]).filter((field): field is ReviewField => field !== null);
  return markReviewed({ ...journey, edits }, [id], fields);
}

export function mapWallet(journey: ImportJourney, label: string, walletId: string): ImportJourney {
  return { ...journey, mapping: { ...journey.mapping, wallets: { ...journey.mapping.wallets, [label]: walletId } } };
}

export function mapCategory(journey: ImportJourney, type: 'expense' | 'income', label: string, categoryId: string): ImportJourney {
  const categories = { ...journey.mapping.categories, [type]: { ...journey.mapping.categories[type], [label]: categoryId } };
  return { ...journey, mapping: { ...journey.mapping, categories } };
}

/** A row as the user sees it: the preview's values with unsaved corrections applied. */
export function rowView(journey: ImportJourney, id: string): ImportCandidate | null {
  const row = journey.preview?.candidates.find((candidate) => candidate.source_row_id === id);
  return row ? { ...row, ...(journey.edits[id] ?? {}) } : null;
}

const has = (map: Readonly<Record<string, string>>, key: string | null) => key !== null && Object.prototype.hasOwnProperty.call(map, key);

/** What stops the freeze, global problems first, then rows in file order. Empty: the selection can be frozen. */
export function reviewBlockers(journey: ImportJourney): ReviewBlocker[] {
  const blockers: ReviewBlocker[] = [];
  if (journey.selected.length === 0) blockers.push({ source_row_id: null, reason: 'nothing_selected' });
  if (Object.keys(journey.edits).length > 0 || journey.pendingPatch) blockers.push({ source_row_id: null, reason: 'unsaved_corrections' });
  const committed = new Set(journey.committed);
  for (const id of journey.selected) {
    // A saved row is acknowledged by any later selection, never written again.
    if (committed.has(id)) continue;
    const row = rowView(journey, id);
    if (!row) continue;
    const missing = row.occurred_on === null || row.type === null || row.amount_minor === null || row.wallet_label === null || (row.type !== 'transfer' && row.category_label === null);
    const unreviewed = REVIEW_FIELDS.filter((field) => !(journey.reviewed[id] ?? []).includes(field));
    if (missing) blockers.push({ source_row_id: id, reason: 'missing_value' });
    else if (row.type === 'transfer') blockers.push({ source_row_id: id, reason: 'transfer' });
    else if (unreviewed.length > 0) blockers.push({ source_row_id: id, reason: 'unreviewed', fields: unreviewed });
    else if (!has(journey.mapping.wallets, row.wallet_label)) blockers.push({ source_row_id: id, reason: 'wallet_unmapped' });
    else if (!has(row.type === 'income' ? journey.mapping.categories.income : journey.mapping.categories.expense, row.category_label)) {
      blockers.push({ source_row_id: id, reason: 'category_unmapped' });
    }
  }
  return blockers;
}

export function progressCounts(journey: ImportJourney): { selected: number; committed: number; remaining: number; conflicted: number } {
  return { selected: journey.selected.length, committed: journey.committed.length, remaining: journey.remaining.length, conflicted: journey.conflicted.length };
}

// ---------------------------------------------------------------------------
// Steps (each saves the draft before sending and after every outcome)
// ---------------------------------------------------------------------------

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The outcome may have committed: keep the pending command and resend it as itself. */
function unknownOutcome(error: unknown): boolean {
  return error instanceof V1Error && (error.outcome === 'network' || error.outcome === 'unavailable' || error.outcome === 'invalid_response');
}

/** A refusal that saved nothing and needs the user elsewhere: keep everything, frozen. */
function blocking(error: unknown): ImportProblem | null {
  if (!(error instanceof V1Error)) return null;
  if (error.outcome === 'rate_limited') return { kind: 'rate_limited', code: error.code };
  if (['upgrade_required', 'policy_required', 'signed_out', 'session_changed', 'unsupported_platform'].includes(error.outcome)) return { kind: 'blocked', code: error.code };
  return null;
}

async function saved(journey: ImportJourney, deps: ImportDeps): Promise<ImportJourney> {
  await deps.store.save(journey);
  return journey;
}

/** Sends (or resends) the upload of `file`; the same file keeps its key until the outcome is known. */
export async function startUpload(journey: ImportJourney, file: ImportFile, deps: ImportDeps): Promise<ImportJourney> {
  const body = { name: file.name, contentType: file.contentType, bytes: file.bytes.length };
  const same = journey.pendingUpload && JSON.stringify(journey.pendingUpload.body) === JSON.stringify(body);
  const pendingUpload = same ? journey.pendingUpload : { key: deps.newId(), body };
  let current = await saved({ ...journey, stage: 'uploading', pendingUpload, problem: null }, deps);
  try {
    const accepted = await deps.resources.upload(file, (pendingUpload as PendingCommand<unknown>).key);
    current = { ...current, stage: 'parsing', jobId: accepted.job_id, pendingUpload: null };
  } catch (error) {
    if (unknownOutcome(error)) current = { ...current, problem: { kind: 'unconfirmed' } };
    else current = { ...current, stage: 'idle', pendingUpload: blocking(error) ? pendingUpload : null, problem: blocking(error) ?? { kind: 'invalid', code: error instanceof V1Error ? error.code : undefined } };
  }
  return saved(current, deps);
}

/** Drops review marks of rows whose values changed between two previews. */
function keepReviews(previous: ImportPreview | null, next: ImportPreview, reviewed: Record<string, ReviewField[]>): Record<string, ReviewField[]> {
  const before = new Map((previous?.candidates ?? []).map((row) => [row.source_row_id, JSON.stringify(row)]));
  const kept: Record<string, ReviewField[]> = {};
  for (const row of next.candidates) {
    const marks = reviewed[row.source_row_id];
    if (marks && before.get(row.source_row_id) === JSON.stringify(row)) kept[row.source_row_id] = marks;
  }
  return kept;
}

function applyPreview(journey: ImportJourney, preview: ImportPreview): ImportJourney {
  switch (preview.status) {
    case 'ready': {
      const rows = new Set(preview.candidates.map((row) => row.source_row_id));
      const edits = Object.fromEntries(Object.entries(journey.edits).filter(([id]) => rows.has(id)));
      const next = { ...journey, preview, reviewRevision: preview.review_revision, edits, reviewed: keepReviews(journey.preview, preview, journey.reviewed), problem: null };
      return { ...next, stage: journey.selection ? journey.stage : 'review', selected: inFileOrder(next, journey.selected) };
    }
    case 'queued':
    case 'parsing':
      return { ...journey, stage: 'parsing', problem: null };
    case 'rejected':
      return { ...journey, stage: 'failed', preview, problem: { kind: 'rejected' } };
    case 'expired':
      return { ...journey, stage: 'expired', problem: { kind: 'preview_unavailable' } };
    default:
      return { ...journey, stage: 'failed', problem: { kind: 'parse_failed' } };
  }
}

/** Waits (bounded) for the parser; `review` once the preview is ready. Ready means reviewable, never saved. */
export async function awaitPreview(journey: ImportJourney, deps: ImportDeps): Promise<ImportJourney> {
  if (!journey.jobId) return journey;
  const sleep = deps.sleep ?? defaultSleep;
  let current = journey;
  for (let poll = 0; poll < (deps.maxPolls ?? 30); poll += 1) {
    if (poll > 0) await sleep(deps.pollMs ?? 2_000);
    try {
      current = applyPreview(current, await deps.resources.preview(journey.jobId));
    } catch (error) {
      return saved({ ...current, problem: blocking(error) ?? { kind: 'offline' } }, deps);
    }
    if (current.stage !== 'parsing') break;
  }
  return saved(current, deps);
}

/** Reads the current preview again, keeping selection, mapping, unsaved edits and the reviews of unchanged rows. */
export async function reloadPreview(journey: ImportJourney, deps: ImportDeps): Promise<ImportJourney> {
  if (!journey.jobId) return journey;
  try {
    return saved(applyPreview(journey, await deps.resources.preview(journey.jobId)), deps);
  } catch (error) {
    return saved({ ...journey, problem: blocking(error) ?? { kind: 'offline' } }, deps);
  }
}

/** Saves unsaved corrections in commands of at most 500 rows, each against the revision the last one produced. */
export async function saveCorrections(journey: ImportJourney, deps: ImportDeps): Promise<ImportJourney> {
  let current: ImportJourney = { ...journey, problem: null };
  if (!current.jobId || !current.reviewRevision) return current;
  for (;;) {
    let pending = current.pendingPatch;
    if (!pending) {
      const ids = inFileOrder(current, Object.keys(current.edits)).slice(0, MAX_ROWS_PER_COMMAND);
      if (ids.length === 0) return saved(current, deps);
      pending = { key: deps.newId(), body: { revision: current.reviewRevision as string, rows: ids.map((id) => ({ source_row_id: id, ...current.edits[id] })) } };
      current = await saved({ ...current, pendingPatch: pending }, deps);
    }
    try {
      const result = await deps.resources.patchRows(current.jobId as string, pending.body.revision, pending.body.rows, pending.key);
      const sent = new Map(pending.body.rows.map(({ source_row_id, ...edit }) => [source_row_id, edit]));
      const edits = Object.fromEntries(Object.entries(current.edits).filter(([id]) => !sent.has(id)));
      const preview = current.preview
        ? { ...current.preview, review_revision: result.review_revision, candidates: current.preview.candidates.map((row) => (sent.has(row.source_row_id) ? { ...row, ...sent.get(row.source_row_id) } : row)) }
        : null;
      current = await saved({ ...current, pendingPatch: null, edits, preview, reviewRevision: result.review_revision }, deps);
    } catch (error) {
      if (unknownOutcome(error)) return saved({ ...current, problem: { kind: 'unconfirmed' } }, deps);
      const blocked = blocking(error);
      if (blocked) return saved({ ...current, problem: blocked }, deps);
      const v1 = error instanceof V1Error ? error : null;
      if (v1?.code === 'VERSION_CONFLICT') return saved({ ...current, pendingPatch: null, problem: { kind: 'review_changed' } }, deps);
      if (v1?.code === 'IMPORT_ROW_COMMITTED') {
        const committed = new Set(Object.keys(v1.fields ?? {}));
        const edits = Object.fromEntries(Object.entries(current.edits).filter(([id]) => !committed.has(id)));
        return saved({ ...current, pendingPatch: null, edits, problem: { kind: 'row_committed', fields: v1.fields } }, deps);
      }
      if (v1?.code === 'IMPORT_PREVIEW_UNAVAILABLE') return saved({ ...current, pendingPatch: null, stage: 'expired', problem: { kind: 'preview_unavailable' } }, deps);
      return saved({ ...current, pendingPatch: null, problem: { kind: 'invalid', code: v1?.code, fields: v1?.fields } }, deps);
    }
  }
}

/** The labels the chosen rows use, and nothing else. */
function usedMapping(journey: ImportJourney, ids: readonly string[]): ImportMapping {
  const mapping: ImportMapping = { wallets: {}, categories: { expense: {}, income: {} } };
  const wallets: Record<string, string> = {};
  const expense: Record<string, string> = {};
  const income: Record<string, string> = {};
  for (const id of ids) {
    const row = rowView(journey, id);
    if (!row) continue;
    if (has(journey.mapping.wallets, row.wallet_label)) wallets[row.wallet_label as string] = journey.mapping.wallets[row.wallet_label as string];
    const source = row.type === 'income' ? journey.mapping.categories.income : journey.mapping.categories.expense;
    const target = row.type === 'income' ? income : expense;
    if (has(source, row.category_label)) target[row.category_label as string] = source[row.category_label as string];
  }
  return { ...mapping, wallets, categories: { expense, income } };
}

/** Freezes the full chosen set at the current review revision (non-financial: saves no record). */
export async function freezeSelection(journey: ImportJourney, deps: ImportDeps): Promise<ImportJourney> {
  if (!journey.jobId || !journey.reviewRevision) return journey;
  let pending = journey.pendingFreeze;
  if (!pending) {
    if (reviewBlockers(journey).length > 0) return journey;
    const ids = inFileOrder(journey, journey.selected);
    pending = { key: deps.newId(), body: { review_revision: journey.reviewRevision, selected_row_ids: ids, mapping: usedMapping(journey, ids) } };
  }
  let current = await saved({ ...journey, pendingFreeze: pending, problem: null }, deps);
  try {
    const ack = await deps.resources.freeze(current.jobId as string, pending.body, pending.key);
    const rowIds = [...pending.body.selected_row_ids];
    const committed = new Set(current.committed);
    current = {
      ...current,
      stage: 'confirming',
      pendingFreeze: null,
      selection: { id: ack.entity_id, frozenRevision: pending.body.review_revision, rowIds },
      conflicted: [],
      remaining: rowIds.filter((id) => !committed.has(id)),
      committed: rowIds.filter((id) => committed.has(id)),
    };
  } catch (error) {
    if (unknownOutcome(error)) return saved({ ...current, problem: { kind: 'unconfirmed' } }, deps);
    const blocked = blocking(error);
    if (blocked) return saved({ ...current, problem: blocked }, deps);
    const v1 = error instanceof V1Error ? error : null;
    const kind = v1?.code === 'VERSION_CONFLICT' ? 'review_changed' : v1?.code === 'IMPORT_PREVIEW_UNAVAILABLE' ? 'preview_unavailable' : 'invalid';
    current = { ...current, pendingFreeze: null, stage: kind === 'preview_unavailable' ? 'expired' : current.stage, problem: { kind, code: v1?.code, fields: v1?.fields } };
  }
  return saved(current, deps);
}

/** Folds one acknowledged batch into the journey's progress (the server's answer is the truth). */
function applyBatch(journey: ImportJourney, result: ConfirmImportBatchResult): ImportJourney {
  const committed = new Set([...journey.committed, ...result.committed]);
  const conflicted = new Set([...journey.conflicted, ...result.conflicted].filter((id) => !committed.has(id)));
  const rowIds = journey.selection?.rowIds ?? journey.selected;
  return {
    ...journey,
    pendingBatch: null,
    committed: rowIds.filter((id) => committed.has(id)),
    conflicted: rowIds.filter((id) => conflicted.has(id)),
    remaining: result.remaining.filter((id) => !conflicted.has(id) && !committed.has(id)),
  };
}

/**
 * Confirms the frozen selection batch by batch (at most 500 rows each, the
 * same selection every time) until nothing remains, an outcome is unknown or
 * a refusal needs the user. A pending batch is always resolved first, as
 * itself. `maxBatches` bounds one call (the screen shows progress between).
 */
export async function confirmBatches(journey: ImportJourney, deps: ImportDeps, options: { maxBatches?: number } = {}): Promise<ImportJourney> {
  if (!journey.jobId || !journey.selection) return journey;
  let current: ImportJourney = { ...journey, problem: null };
  let sent = 0;
  for (;;) {
    const selection = current.selection as { id: string; frozenRevision: string; rowIds: string[] };
    let pending = current.pendingBatch;
    if (!pending) {
      if (current.remaining.length === 0) {
        await deps.store.clear();
        return { ...current, stage: 'done' };
      }
      if (options.maxBatches !== undefined && sent >= options.maxBatches) return saved(current, deps);
      const rows = current.remaining.slice(0, Math.min(current.batchSize, MAX_ROWS_PER_COMMAND));
      pending = { key: deps.newId(), body: { selection_id: selection.id, frozen_revision: selection.frozenRevision, batch_row_ids: rows } };
      current = await saved({ ...current, pendingBatch: pending }, deps);
    }
    sent += 1;
    try {
      const result = await deps.resources.confirm(current.jobId as string, pending.body, pending.key);
      current = await saved(applyBatch(current, result), deps);
    } catch (error) {
      if (unknownOutcome(error)) return saved({ ...current, problem: { kind: 'unconfirmed' } }, deps);
      const blocked = blocking(error);
      if (blocked) return saved({ ...current, problem: blocked }, deps);
      const v1 = error instanceof V1Error ? error : null;
      if (v1?.outcome === 'too_large') {
        // Refused before anything committed: smaller batches, each a new command.
        const size = Math.max(1, Math.floor(pending.body.batch_row_ids.length / 2));
        current = await saved({ ...current, pendingBatch: null, batchSize: size }, deps);
        continue;
      }
      if (v1?.code === 'IMPORT_SELECTION_CONFLICT') {
        return saved({ ...current, pendingBatch: null, selection: null, stage: 'review', problem: { kind: 'selection_conflict', code: v1.code } }, deps);
      }
      if (v1?.code === 'IMPORT_PREVIEW_UNAVAILABLE' || v1?.outcome === 'not_found') {
        return saved({ ...current, pendingBatch: null, stage: 'expired', problem: { kind: 'preview_unavailable', code: v1.code } }, deps);
      }
      return saved({ ...current, pendingBatch: null, problem: { kind: 'invalid', code: v1?.code, fields: v1?.fields } }, deps);
    }
  }
}

/** The kept draft after a restart (pending commands included), or null. */
export function resumeImport(deps: Pick<ImportDeps, 'store'>): Promise<ImportJourney | null> {
  return deps.store.load();
}

/** The user discards the import draft (the server keeps the preview until it expires). */
export async function discardImport(deps: Pick<ImportDeps, 'store'>): Promise<void> {
  await deps.store.clear();
}
