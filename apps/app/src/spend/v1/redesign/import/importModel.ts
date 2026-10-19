// R7: the import journey's view rules (plan §6.5). Pure TypeScript over
// importReview.ts: no React, no React Native, no network. The journey itself
// (its commands, keys and draft) stays importReview's; this file only reads it
// and makes the person's explicit choices (select, fix, check) through
// importReview's own steps.
//
// Rules this file keeps (plan §2 principle 6, "hedge machine guesses"):
//   - A value the file left unclear stays unknown and is flagged on its row;
//     nothing is filled in for the person.
//   - Probable duplicates read "probably the same as …", are flagged as
//     information, and are kept: "Select all" chooses them like any row.
//     Only the person leaves a row out.
//   - Money is exact: canonical satang strings through BigInt, never a float.
//   - Nothing is called saved until the server's confirmation said so; the
//     result's counts are the journey's (the server's answers).
import { IMPORT_UPLOAD_MAX_BYTES, importFormatForContentType, importFormatForExtension, parseImportFileName } from '@gogospend/contracts';
import type { ImportCandidate, Minor, TransactionType } from '@gogospend/contracts';

import { DiaryLocked, StaleEpochError } from '../../../../storage/types.ts';
import { REVIEW_FIELDS, editRow, mapCategory, mapWallet, markReviewed, memoryDraftStore, reviewBlockers, rowView, selectRows } from '../../importReview.ts';
import type { ImportDraftStore, ImportJourney, ImportProblem, ReviewBlocker } from '../../importReview.ts';
import type { ImportFile, ImportResources } from '../../imports.ts';
import type { CopyLine } from '../shared.ts';

// ---------------------------------------------------------------------------
// Ports: what the screen needs from the device and the server

/** Why a pick gave no file to upload. */
export type PickProblem = 'canceled' | 'too_large' | 'unsupported' | 'empty' | 'unavailable';
export type PickedFile = { readonly ok: true; readonly file: ImportFile } | { readonly ok: false; readonly reason: PickProblem };

/**
 * Everything the import screen talks to. The app binds them to the device
 * (document picker, file system, the encrypted diary's draft, the v1
 * transport); tests and the catalogue bind them to fakes.
 */
export type ImportPorts = {
  readonly resources: ImportResources;
  /**
   * This account's draft store, kept inside its encrypted diary; null when no
   * diary is open (web, locked, opening), and the screen then keeps the import
   * in memory for this visit only. A rejection is offered Try again.
   */
  readonly openDraftStore: () => Promise<ImportDraftStore | null>;
  /** Opens the system file picker for a CSV, XLSX or image file. */
  readonly pickFile: () => Promise<PickedFile>;
  readonly newId: () => string;
  /** Wait between preview checks while a file is read (default 2 s). */
  readonly pollMs?: number;
  /** Preview checks before the screen says the file is still waiting (default 30). */
  readonly maxPolls?: number;
};

/** What the picked file must be before it is sent: a supported, named, non-empty file within 12 MB. */
export function checkPickedFile(file: ImportFile): PickProblem | null {
  if (file.bytes.length === 0) return 'empty';
  if (file.bytes.length > IMPORT_UPLOAD_MAX_BYTES) return 'too_large';
  let extension: string;
  try {
    extension = parseImportFileName(file.name).extension;
  } catch {
    return 'unsupported';
  }
  const byType = importFormatForContentType(file.contentType);
  const byName = importFormatForExtension(extension);
  return byType !== null && byType === byName ? null : 'unsupported';
}

// ---------------------------------------------------------------------------
// Which state the screen shows

/** What the screen is doing right now, beside the journey it holds. */
export type ImportUi = {
  /** The account's draft store is being opened and read. */
  readonly opening: boolean;
  /** A kept draft waits for Continue or Start over. */
  readonly resumeOffered: boolean;
  /** The system file picker is open. */
  readonly picking: boolean;
  /** A step is talking to Jotbun. */
  readonly running: 'upload' | 'parse' | 'save' | 'confirm' | null;
  /** Reading stopped checking with the file still unread. */
  readonly parseWaiting: boolean;
};

export const NO_UI: ImportUi = { opening: false, resumeOffered: false, picking: false, running: null, parseWaiting: false };

export type ImportPhase =
  | 'opening'
  | 'resume'
  | 'start'
  | 'picking'
  | 'uploads_off'
  | 'uploading'
  | 'upload_unconfirmed'
  | 'parsing'
  | 'parse_waiting'
  | 'parse_failed'
  | 'rejected'
  | 'expired'
  | 'review'
  | 'frozen'
  | 'confirming'
  | 'unconfirmed'
  | 'paused'
  | 'done';

export type UploadRefusal = 'uploads_off' | 'too_large' | 'unsupported' | 'empty' | 'limit' | 'failed' | 'blocked' | 'other';

/** Why Jotbun refused an upload (`null`: no refusal, or an outcome that is not known yet). */
export function uploadRefusal(problem: ImportProblem | null): UploadRefusal | null {
  if (!problem) return null;
  if (problem.kind === 'rate_limited') return 'limit';
  if (problem.kind === 'blocked') return 'blocked';
  if (problem.kind !== 'invalid') return null;
  switch (problem.code) {
    // Uploads are off on the server (IMPORT_UPLOADS_ENABLED): the route is not there.
    case 'NOT_FOUND': return 'uploads_off';
    case 'UPLOAD_TOO_LARGE': return 'too_large';
    case 'UPLOAD_UNSUPPORTED_TYPE':
    case 'UPLOAD_TYPE_MISMATCH':
    case 'INVALID_FILE_NAME': return 'unsupported';
    case 'UPLOAD_EMPTY': return 'empty';
    case 'UPLOAD_FAILED':
    case 'UPLOAD_INCOMPLETE': return 'failed';
    default: return 'other';
  }
}

const sentNothingYet = (journey: ImportJourney) => journey.committed.length === 0 && journey.problem === null;

export function importPhase(journey: ImportJourney | null, ui: ImportUi): ImportPhase {
  if (ui.opening) return 'opening';
  if (ui.resumeOffered) return 'resume';
  if (ui.picking) return 'picking';
  // The upload is on its way (its first answer may not be back yet).
  if (ui.running === 'upload') return 'uploading';
  if (!journey) return 'start';
  switch (journey.stage) {
    case 'idle':
      return uploadRefusal(journey.problem) === 'uploads_off' ? 'uploads_off' : 'start';
    case 'uploading':
      // Not running: the upload's outcome is not known (a lost answer, or a restart mid-upload).
      return 'upload_unconfirmed';
    case 'parsing':
      if (ui.running === 'parse') return 'parsing';
      return ui.parseWaiting ? 'parse_waiting' : 'parsing';
    case 'failed':
      return journey.problem?.kind === 'rejected' ? 'rejected' : 'parse_failed';
    case 'expired':
      return 'expired';
    case 'review':
      return 'review';
    case 'confirming':
      if (ui.running === 'confirm') return 'confirming';
      // A batch whose outcome is not known is resent as itself, never replaced.
      if (journey.pendingBatch && (journey.problem === null || journey.problem.kind === 'unconfirmed')) return 'unconfirmed';
      return sentNothingYet(journey) && !journey.pendingBatch ? 'frozen' : 'paused';
    case 'done':
      return 'done';
  }
}

// ---------------------------------------------------------------------------
// Row flags

export type RowFlag = { readonly key: string; readonly label: CopyLine; readonly tone: 'warning' | 'info' };

/** A row issue's flag, by its code (English, for the screen's `tc`); an unknown code reads "Check this row". */
export const ISSUE_WORDS: Readonly<Record<string, string>> = {
  missing_date: 'No date',
  invalid_date: 'Date unreadable',
  ambiguous_date: 'Date unclear',
  date_out_of_range: 'Date out of range',
  missing_amount: 'No amount',
  invalid_amount: 'Amount unreadable',
  ambiguous_amount: 'Amount unclear',
  excess_precision: 'Amount has extra decimals',
  amount_over_cap: 'Amount too large',
  zero_amount: 'Amount is zero',
  unsupported_currency: 'Not in baht',
  missing_type: 'No type',
  unknown_type: 'Type unclear',
  type_conflict: 'Type unclear',
  missing_wallet: 'No wallet',
  transfer_destination_missing: 'Move without a destination',
  text_too_long: 'Text shortened',
  invalid_text: 'Text unreadable',
  excluded_in_source: 'Left out in the file',
  legacy_encoding_text: 'Text may look garbled',
};
/** Worth knowing, but the row can still be saved as it is. */
const INFO_ISSUES = new Set(['text_too_long', 'legacy_encoding_text', 'excluded_in_source']);
/** Issues about a value the file left unknown: they go once the person gives that value. */
const VALUE_FIELDS = new Set(['occurred_on', 'type', 'amount_minor', 'wallet_label', 'category_label']);

const ordinalOf = (journey: ImportJourney, id: string): number | null => journey.preview?.candidates.find((candidate) => candidate.source_row_id === id)?.ordinal ?? null;

/** The flags a row carries, warnings first: what the file left unclear, then probable duplicates. */
export function rowFlags(journey: ImportJourney, id: string): RowFlag[] {
  const row = rowView(journey, id);
  if (!row) return [];
  if (journey.committed.includes(id)) return [{ key: 'saved', label: { text: 'Saved' }, tone: 'info' }];
  const flags: RowFlag[] = [];
  const add = (flag: RowFlag) => {
    if (!flags.some((existing) => existing.label.text === flag.label.text)) flags.push(flag);
  };
  const flagged = new Set<string>();
  for (const issue of journey.preview?.issues ?? []) {
    if (issue.source_row_id !== id) continue;
    if (issue.field && VALUE_FIELDS.has(issue.field) && row[issue.field as keyof ImportCandidate] !== null) continue;
    if (issue.field) flagged.add(issue.field);
    add({ key: `issue:${issue.code}`, label: { text: ISSUE_WORDS[issue.code] ?? 'Check this row' }, tone: INFO_ISSUES.has(issue.code) ? 'info' : 'warning' });
  }
  const missing: [keyof ImportCandidate, string][] = [['occurred_on', 'No date'], ['type', 'No type'], ['amount_minor', 'No amount'], ['wallet_label', 'No wallet']];
  for (const [field, words] of missing) if (row[field] === null && !flagged.has(field)) add({ key: `missing:${field}`, label: { text: words }, tone: 'warning' });
  if (row.type !== 'transfer' && row.category_label === null && !flagged.has('category_label')) add({ key: 'missing:category_label', label: { text: 'No category' }, tone: 'warning' });
  if (row.type === 'transfer') add({ key: 'transfer', label: { text: "Moves can't be imported" }, tone: 'warning' });
  for (const advice of journey.preview?.duplicate_advice ?? []) {
    if (advice.source_row_id !== id) continue;
    if (advice.kind === 'existing_transaction') {
      add({ key: 'duplicate:diary', label: { text: 'Probably already in your diary' }, tone: 'info' });
      continue;
    }
    const match = advice.matches.map((other) => ordinalOf(journey, other)).find((ordinal): ordinal is number => ordinal !== null);
    if (match !== undefined) add({ key: 'duplicate:file', label: { text: 'Probably the same as row {row}', values: { row: match } }, tone: 'info' });
  }
  return flags;
}

/** The preview's rows in file order. */
export const rowIds = (journey: ImportJourney): string[] => (journey.preview?.candidates ?? []).map((candidate) => candidate.source_row_id);

export type ReviewFilter = 'all' | 'needs_look' | 'duplicates' | 'selected';

/** The rows a filter shows, in file order. */
export function filterRows(journey: ImportJourney, filter: ReviewFilter): string[] {
  const ids = rowIds(journey);
  if (filter === 'all') return ids;
  if (filter === 'selected') {
    const chosen = new Set(journey.selected);
    return ids.filter((id) => chosen.has(id));
  }
  if (filter === 'duplicates') {
    const advised = new Set((journey.preview?.duplicate_advice ?? []).map((advice) => advice.source_row_id));
    return ids.filter((id) => advised.has(id));
  }
  return ids.filter((id) => rowFlags(journey, id).some((flag) => flag.tone === 'warning'));
}

// ---------------------------------------------------------------------------
// Selection, the running total and bulk fixes

/** Chooses every row of the file, probable duplicates included. */
export const selectAll = (journey: ImportJourney): ImportJourney => selectRows(journey, rowIds(journey), true);

/** Chooses nothing (rows already saved stay part of a frozen selection). */
export const clearSelection = (journey: ImportJourney): ImportJourney => selectRows(journey, journey.selected, false);

/** Leaves out the chosen rows that can't be saved as they are: a value missing, or a move. Duplicates stay. */
export function leaveOutUnsaveable(journey: ImportJourney): ImportJourney {
  const unsaveable = reviewBlockers(journey)
    .filter((blocker): blocker is ReviewBlocker & { source_row_id: string } => blocker.source_row_id !== null && (blocker.reason === 'missing_value' || blocker.reason === 'transfer'))
    .map((blocker) => blocker.source_row_id);
  return selectRows(journey, unsaveable, false);
}

export type SelectionTotals = {
  readonly count: number;
  /** Exact satang of the chosen expenses. */
  readonly outMinor: Minor;
  /** Exact satang of the chosen income. */
  readonly inMinor: Minor;
  /** Chosen rows in neither total: no type, no amount, or a move. */
  readonly unknown: number;
};

/** The running total of `ids` (the chosen rows by default), exact. */
export function selectionTotals(journey: ImportJourney, ids: readonly string[] = journey.selected): SelectionTotals {
  let out = 0n;
  let income = 0n;
  let unknown = 0;
  for (const id of ids) {
    const row = rowView(journey, id);
    if (!row) continue;
    if (row.amount_minor === null || (row.type !== 'expense' && row.type !== 'income')) {
      unknown += 1;
      continue;
    }
    if (row.type === 'expense') out += BigInt(row.amount_minor);
    else income += BigInt(row.amount_minor);
  }
  return { count: ids.length, outMinor: out.toString(), inMinor: income.toString(), unknown };
}

/** Sets the type of `ids` (a correction, saved by Continue; it counts as checking their type). */
export function bulkType(journey: ImportJourney, ids: readonly string[], type: Extract<TransactionType, 'expense' | 'income'>): ImportJourney {
  return ids.reduce((current, id) => editRow(current, id, { type }), journey);
}

type LabelKind = { readonly kind: 'wallet' } | { readonly kind: 'category'; readonly type: 'expense' | 'income' };

const labelOf = (row: ImportCandidate, kind: LabelKind): string | null =>
  kind.kind === 'wallet' ? row.wallet_label : row.type === kind.type ? row.category_label : null;
const mappingOf = (journey: ImportJourney, kind: LabelKind): Readonly<Record<string, string>> =>
  kind.kind === 'wallet' ? journey.mapping.wallets : journey.mapping.categories[kind.type];

/**
 * A label for a bulk fix to `targetId`: the name itself when it is free (or
 * already means `targetId`), else "name (2)", "name (3)", … A label is free
 * when no other row uses it and it is not mapped elsewhere, so a fix never
 * changes rows the person did not choose.
 */
function freeLabel(journey: ImportJourney, kind: LabelKind, name: string, targetId: string, ids: readonly string[]): string {
  const chosen = new Set(ids);
  const others = new Set<string>();
  for (const id of rowIds(journey)) {
    if (chosen.has(id)) continue;
    const row = rowView(journey, id);
    const label = row ? labelOf(row, kind) : null;
    if (label !== null) others.add(label);
  }
  const mapping = mappingOf(journey, kind);
  for (let n = 1; ; n += 1) {
    const label = n === 1 ? name : `${name} (${n})`;
    const mapped = Object.prototype.hasOwnProperty.call(mapping, label) ? mapping[label] : null;
    if (mapped === targetId || (mapped === null && !others.has(label))) return label;
  }
}

/** Puts the chosen rows of the category's type in that category; rows of the other type (or none) are left as they are. */
export function bulkCategory(journey: ImportJourney, ids: readonly string[], category: { id: string; type: 'expense' | 'income' }, name: string): { journey: ImportJourney; applied: number } {
  const fits = ids.filter((id) => rowView(journey, id)?.type === category.type);
  if (fits.length === 0) return { journey, applied: 0 };
  const label = freeLabel(journey, { kind: 'category', type: category.type }, name, category.id, fits);
  const mapped = mapCategory(journey, category.type, label, category.id);
  return { journey: fits.reduce((current, id) => editRow(current, id, { category_label: label }), mapped), applied: fits.length };
}

/** Puts the chosen rows in one of the person's wallets. */
export function bulkWallet(journey: ImportJourney, ids: readonly string[], wallet: { id: string }, name: string): ImportJourney {
  if (ids.length === 0) return journey;
  const label = freeLabel(journey, { kind: 'wallet' }, name, wallet.id, ids);
  return ids.reduce((current, id) => editRow(current, id, { wallet_label: label }), mapWallet(journey, label, wallet.id));
}

/** The person gives a row its date. */
export const setRowDate = (journey: ImportJourney, id: string, date: string): ImportJourney => editRow(journey, id, { occurred_on: date });

/** The person says the date, type, category and wallet of these rows look right. */
export const markChecked = (journey: ImportJourney, ids: readonly string[]): ImportJourney => markReviewed(journey, ids, REVIEW_FIELDS);

/** Whether the person has checked every field of a row. */
export const isChecked = (journey: ImportJourney, id: string): boolean => REVIEW_FIELDS.every((field) => (journey.reviewed[id] ?? []).includes(field));

// ---------------------------------------------------------------------------
// Label mapping

export type LabelUse = { readonly label: string; readonly rows: number; readonly mappedId: string | null };
export type LabelsToMap = { readonly wallets: LabelUse[]; readonly expense: LabelUse[]; readonly income: LabelUse[] };

/** Each wallet label, and each category label by type, in the order the file first uses it, with its rows and its match. */
export function labelsToMap(journey: ImportJourney): LabelsToMap {
  const collect = (kind: LabelKind): LabelUse[] => {
    const counts = new Map<string, number>();
    for (const id of rowIds(journey)) {
      const row = rowView(journey, id);
      const label = row ? labelOf(row, kind) : null;
      if (label !== null) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const mapping = mappingOf(journey, kind);
    return [...counts].map(([label, rows]) => ({ label, rows, mappedId: Object.prototype.hasOwnProperty.call(mapping, label) ? mapping[label] : null }));
  };
  return { wallets: collect({ kind: 'wallet' }), expense: collect({ kind: 'category', type: 'expense' }), income: collect({ kind: 'category', type: 'income' }) };
}

// ---------------------------------------------------------------------------
// What stops Continue

export type BlockerSummary = {
  readonly nothingSelected: boolean;
  /** Chosen rows with a value missing (date, type, amount, wallet or category). */
  readonly missing: number;
  /** Chosen moves, which import can't save. */
  readonly transfer: number;
  /** Chosen rows not checked yet. */
  readonly unchecked: number;
  readonly walletUnmapped: number;
  readonly categoryUnmapped: number;
};

export function blockerSummary(journey: ImportJourney): BlockerSummary {
  const blockers = reviewBlockers(journey);
  const count = (reason: ReviewBlocker['reason']) => blockers.filter((blocker) => blocker.reason === reason).length;
  return {
    nothingSelected: count('nothing_selected') > 0,
    missing: count('missing_value'),
    transfer: count('transfer'),
    unchecked: count('unreviewed'),
    walletUnmapped: count('wallet_unmapped'),
    categoryUnmapped: count('category_unmapped'),
  };
}

/** What still stops Continue, one line per reason, with its count. */
export function blockerLines(summary: BlockerSummary): CopyLine[] {
  const lines: CopyLine[] = [];
  if (summary.nothingSelected) lines.push({ text: 'Choose the rows to save.' });
  // One row reads in the singular; the catalogs take each form as its own line.
  const add = (count: number, one: string, many: string) => {
    if (count === 1) lines.push({ text: one });
    else if (count > 1) lines.push({ text: many, values: { count } });
  };
  add(summary.missing, '1 chosen row is missing a date, type, amount, wallet or category. Fix it or leave it out.', '{count} chosen rows are missing a date, type, amount, wallet or category. Fix them or leave them out.');
  add(summary.transfer, "1 chosen row is a move, which import can't save. Change its type or leave it out.", "{count} chosen rows are moves, which import can't save. Change their type or leave them out.");
  add(summary.unchecked, "1 chosen row isn't checked yet.", "{count} chosen rows aren't checked yet.");
  add(summary.walletUnmapped, "1 chosen row uses a wallet that isn't matched yet.", "{count} chosen rows use a wallet that isn't matched yet.");
  add(summary.categoryUnmapped, "1 chosen row uses a category that isn't matched yet.", "{count} chosen rows use a category that isn't matched yet.");
  return lines;
}

/** Continue saves any corrections first, so only the other blockers stop it. */
export const canContinue = (journey: ImportJourney): boolean => reviewBlockers(journey).every((blocker) => blocker.reason === 'unsaved_corrections');

// ---------------------------------------------------------------------------
// Frozen, confirming and the result

/** The frozen selection's rows still to save, and their exact totals. */
export function frozenSummary(journey: ImportJourney): { count: number; outMinor: Minor; inMinor: Minor } {
  const committed = new Set(journey.committed);
  const ids = (journey.selection?.rowIds ?? []).filter((id) => !committed.has(id));
  const totals = selectionTotals(journey, ids);
  return { count: ids.length, outMinor: totals.outMinor, inMinor: totals.inMinor };
}

/** Back from the frozen selection to the review, while no batch has been sent (null otherwise). Nothing is lost: the same rows stay chosen. */
export function backToReview(journey: ImportJourney): ImportJourney | null {
  if (journey.stage !== 'confirming' || journey.pendingBatch || journey.pendingFreeze || !sentNothingYet(journey)) return null;
  return { ...journey, stage: 'review', selection: null, remaining: [], conflicted: [], problem: null };
}

export type StageLine = { readonly key: string; readonly label: CopyLine; readonly status: 'pending' | 'active' | 'done' | 'failed'; readonly done?: number; readonly total?: number };

/** Upload, read, rows: the staged progress while a file is read. */
export function parseStages(phase: ImportPhase, rows?: number): StageLine[] {
  const upload: StageLine['status'] = phase === 'uploading' ? 'active' : phase === 'upload_unconfirmed' ? 'pending' : 'done';
  const read: StageLine['status'] =
    phase === 'uploading' || phase === 'upload_unconfirmed' || phase === 'parse_waiting' ? 'pending'
      : phase === 'parsing' ? 'active'
        : phase === 'parse_failed' || phase === 'rejected' ? 'failed'
          : 'done';
  const found = read === 'done';
  return [
    { key: 'upload', label: { text: 'Upload the file' }, status: upload },
    { key: 'read', label: { text: 'Read the file' }, status: read },
    { key: 'rows', label: { text: 'Find the rows' }, status: found ? 'done' : 'pending', ...(found && rows !== undefined ? { done: rows } : {}) },
  ];
}

export type ResultCounts = { readonly total: number; readonly committed: number; readonly remaining: number; readonly conflicted: number };

/** The server's counts for the frozen selection. */
export function resultCounts(journey: ImportJourney): ResultCounts {
  return { total: journey.selection?.rowIds.length ?? journey.selected.length, committed: journey.committed.length, remaining: journey.remaining.length, conflicted: journey.conflicted.length };
}

/** Chosen, saving, result: the staged progress while batches are confirmed. */
export function confirmStages(journey: ImportJourney, running: boolean): StageLine[] {
  const counts = resultCounts(journey);
  const done = journey.stage === 'done';
  const save: StageLine['status'] = done ? 'done' : running ? 'active' : journey.problem && journey.problem.kind !== 'unconfirmed' ? 'failed' : 'pending';
  return [
    { key: 'frozen', label: { text: 'Records chosen' }, status: 'done', done: counts.total, total: counts.total },
    { key: 'save', label: { text: 'Save the records' }, status: save, done: counts.committed, total: counts.total },
    { key: 'result', label: { text: 'Check the result' }, status: done ? 'done' : 'pending' },
  ];
}

// ---------------------------------------------------------------------------
// Resuming a kept draft

/** Whether a kept draft has something to pick up (a finished, failed or empty one does not). */
export function isResumable(journey: ImportJourney | null): journey is ImportJourney {
  if (!journey) return false;
  if (journey.stage === 'idle') return journey.pendingUpload !== null && uploadRefusal(journey.problem) === null;
  return journey.stage === 'uploading' || journey.stage === 'parsing' || journey.stage === 'review' || journey.stage === 'confirming';
}

/** One line on what a kept draft holds. */
export function resumeSummary(journey: ImportJourney): CopyLine | null {
  if (!isResumable(journey)) return null;
  switch (journey.stage) {
    case 'parsing':
      return { text: 'Your file is uploaded and waiting to be read.' };
    case 'review':
      return { text: '{rows} rows to check, {selected} chosen.', values: { rows: rowIds(journey).length, selected: journey.selected.length } };
    case 'confirming':
      return { text: '{committed} of {total} records saved.', values: { committed: journey.committed.length, total: resultCounts(journey).total } };
    default:
      return { text: "Your last upload of {name} wasn't confirmed.", values: { name: journey.pendingUpload?.body.name ?? '' } };
  }
}

// ---------------------------------------------------------------------------
// Problems in words

export type NoticeAction = 'retry' | 'reload' | 'without_receipt';
export type ProblemNotice = { readonly text: CopyLine; readonly tone: 'alert' | 'status'; readonly action: NoticeAction | null };

/** The notice for a journey problem, or null when the phase itself says it (uploads off, a refused upload, a failed or expired file). */
export function problemNotice(problem: ImportProblem | null, phase: ImportPhase, visitOnly = false): ProblemNotice | null {
  if (!problem) return null;
  const alert = (text: string, action: NoticeAction | null = null): ProblemNotice => ({ text: { text }, tone: 'alert', action });
  switch (problem.kind) {
    case 'unconfirmed':
      if (phase === 'unconfirmed') return alert('Not confirmed yet. The last batch may have been saved. Try again checks it with the same request, so nothing is saved twice.', 'retry');
      if (phase === 'upload_unconfirmed') return alert("Not confirmed yet. Try again sends the same file with the same request, so it's never uploaded twice.", 'retry');
      return alert('Not confirmed yet. Your review is kept; try again.', 'retry');
    case 'offline':
      // With no diary (the web, or a locked one) the import is kept only while the screen is open.
      return visitOnly
        ? { text: { text: "Couldn't reach Jotbun. Import needs a connection; your import is kept only while this screen is open." }, tone: 'status', action: 'reload' }
        : { text: { text: "Couldn't reach Jotbun. Import needs a connection; your import is kept on this phone." }, tone: 'status', action: 'reload' };
    case 'review_changed':
      return alert('This import changed on another device. Reload it; your changes are kept.', 'reload');
    case 'selection_conflict':
      return alert('The rows changed since you chose them. Check them and continue again; saved records stay saved.');
    case 'row_committed':
      return alert("Some rows are already saved and can't be changed. Their changes were dropped.");
    case 'rate_limited':
      return phase === 'start' ? null : alert('Too many changes at once. Your review is kept; try again in a moment.', 'retry');
    case 'blocked':
      return phase === 'start' ? null : alert('Saving is paused until you update Jotbun, sign in again or accept the terms. Your import is kept.');
    case 'receipt_unavailable':
      return alert('The receipt photo can no longer be kept. Nothing was saved. You can save the record without it.', 'without_receipt');
    case 'invalid':
      return phase === 'start' || phase === 'uploads_off' ? null : alert('Some rows could not be used. Check them and try again.');
    default:
      // parse_failed, rejected and preview_unavailable are the phase's own words.
      return null;
  }
}

/** Why a file can't be used, before or at upload. */
export const REFUSAL_WORDS: Readonly<Record<Exclude<UploadRefusal, 'uploads_off'> | 'unavailable', string>> = {
  too_large: 'This file is over 12 MB. Export a shorter date range and try again.',
  unsupported: "Jotbun can import CSV and Excel (XLSX) files, and JPEG, PNG or WebP photos. HEIC photos aren't supported yet.",
  empty: 'This file is empty.',
  limit: "You've reached an upload limit for now. Try again later. Nothing was uploaded.",
  failed: "The upload didn't finish. Nothing was saved. Try the file again.",
  blocked: 'Uploading is paused until you update Jotbun, sign in again or accept the terms.',
  other: "Jotbun couldn't take this file. Nothing was saved.",
  unavailable: "Couldn't open your files. Try again.",
};

/** Why a rejected file can't be used, by its issue code; an unknown code reads "Part of this file couldn't be read." */
export const FILE_ISSUE_WORDS: Readonly<Record<string, string>> = {
  empty_file: 'The file has no rows.',
  unrecognized_columns: "Jotbun couldn't find a date, a type and an amount in this file's columns.",
  ambiguous_columns: 'Some columns could mean more than one thing.',
  malformed_csv: 'The CSV file is damaged.',
  unsupported_encoding: "The file's text encoding isn't supported. Save it as UTF-8 and try again.",
  too_many_rows: 'The file has more than 5,000 rows. Export a shorter date range.',
  too_many_columns: 'The file has more than 100 columns.',
  cell_too_long: 'A cell in the file is too long to read.',
  preview_too_large: 'The file is too large to check in one go. Export a shorter date range.',
  zip_malformed: 'The Excel file is damaged.',
  zip_too_large: 'The Excel file is too large once opened.',
  zip_too_many_entries: 'The Excel file is too large once opened.',
  zip_unsupported: 'The Excel file is damaged.',
  workbook_malformed: 'The Excel file is damaged.',
  embedded_objects: 'The workbook has formulas, macros or links. Save a copy with values only, then import that.',
  macros: 'The workbook has formulas, macros or links. Save a copy with values only, then import that.',
  formulas: 'The workbook has formulas, macros or links. Save a copy with values only, then import that.',
  external_references: 'The workbook has formulas, macros or links. Save a copy with values only, then import that.',
  multiple_worksheets: 'The workbook has more than one sheet. Keep only the sheet to import.',
  unsupported_sheet: "This sheet can't be read.",
  image_malformed: "The photo couldn't be read.",
  image_too_large: 'The photo is too large.',
  image_format_mismatch: "The photo isn't what its name says.",
  parse_timeout: 'The file took too long to read. Try a smaller file.',
  parse_resource_limit: 'The file took too long to read. Try a smaller file.',
};

/** A rejected file's reasons, once each, in plain words. */
export function fileIssueLines(journey: ImportJourney): CopyLine[] {
  const fileIssues = (journey.preview?.issues ?? []).filter((issue) => issue.source_row_id === null);
  const lines: string[] = [];
  for (const issue of fileIssues) {
    const words = FILE_ISSUE_WORDS[issue.code] ?? "Part of this file couldn't be read.";
    if (!lines.includes(words)) lines.push(words);
  }
  return (lines.length > 0 ? lines : ["This file couldn't be read."]).map((text) => ({ text }));
}

/** What is worth knowing about a readable file as a whole, by its issue code. */
export const FILE_NOTICE_WORDS: Readonly<Record<string, string>> = {
  unmapped_columns: 'Some columns were not used',
  legacy_encoding: 'Old text encoding: check names and notes',
  receipt_fields_unread: "The receipt's details couldn't be read",
  mixed_amount_separators: 'Amounts use mixed separators: check them',
};

/** Notices about a readable file as a whole (information, not blockers). */
export function fileNotices(journey: ImportJourney): RowFlag[] {
  const notices: RowFlag[] = [];
  for (const issue of journey.preview?.issues ?? []) {
    const words = issue.source_row_id === null ? FILE_NOTICE_WORDS[issue.code] : undefined;
    if (words && !notices.some((notice) => notice.label.text === words)) notices.push({ key: issue.code, label: { text: words }, tone: 'info' });
  }
  return notices;
}

/**
 * The diary's import draft, falling back to this visit's memory when the
 * diary locks or its session moves on while the screen is open (decision 7
 * review). The memory copy starts from the latest journey this store saw, and
 * `onFallback` runs once so the screen can say the import is now kept only
 * while it is open. Any other failure still reaches the caller.
 */
export function withVisitFallback(durable: ImportDraftStore, onFallback: () => void): ImportDraftStore {
  let latest: ImportJourney | null = null;
  let memory: ImportDraftStore | null = null;
  const fallBack = (error: unknown): ImportDraftStore => {
    if (!(error instanceof DiaryLocked || error instanceof StaleEpochError)) throw error;
    if (!memory) {
      memory = memoryDraftStore(latest);
      onFallback();
    }
    return memory;
  };
  return {
    async load() {
      if (memory) return memory.load();
      try {
        latest = await durable.load();
        return latest;
      } catch (error) {
        return fallBack(error).load();
      }
    },
    async save(journey) {
      latest = journey;
      if (memory) return memory.save(journey);
      try {
        await durable.save(journey);
      } catch (error) {
        await fallBack(error).save(journey);
      }
    },
    async clear() {
      latest = null;
      if (memory) return memory.clear();
      try {
        await durable.clear();
      } catch (error) {
        await fallBack(error).clear();
      }
    },
  };
}
