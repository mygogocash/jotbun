// R7: the import journey's view rules (plan §6.5), over importReview.ts: the
// picked file's checks, which state the screen is in, the flags a row
// carries (hedged, never fixed for the person), selection and bulk fixes with
// an exact running total, the label mapping, what still blocks the freeze,
// the frozen summary, progress stages and the result's counts, resuming a
// kept draft, and the words for each problem.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { IMPORT_UPLOAD_MAX_BYTES } from '@gogospend/contracts';
import type { ImportCandidate, ImportPreview } from '@gogospend/contracts';

import { confirmBatches, freezeSelection, mapCategory, mapWallet, memoryDraftStore, newJourney, rowView, saveCorrections } from '../../importReview.ts';
import type { ImportDeps, ImportJourney, ImportProblem } from '../../importReview.ts';
import type { ImportFile } from '../../imports.ts';
import { JOB_ID, createFakeImportServer } from '../../testing/fakeImportServer.ts';
import { untranslated } from '../testing/catalog.ts';
import {
  FILE_ISSUE_WORDS,
  FILE_NOTICE_WORDS,
  ISSUE_WORDS,
  NO_UI,
  REFUSAL_WORDS,
  backToReview,
  blockerLines,
  blockerSummary,
  bulkCategory,
  bulkType,
  bulkWallet,
  canContinue,
  checkPickedFile,
  clearSelection,
  confirmStages,
  fileIssueLines,
  fileNotices,
  filterRows,
  frozenSummary,
  importPhase,
  isResumable,
  labelsToMap,
  leaveOutUnsaveable,
  markChecked,
  parseStages,
  problemNotice,
  resultCounts,
  resumeSummary,
  rowFlags,
  selectAll,
  selectionTotals,
  setRowDate,
  uploadRefusal,
} from './importModel.ts';

const CASH = '0000000a-0000-4000-8000-000000000001';
const DAILY = '0000000a-0000-4000-8000-000000000002';
const FOOD = { id: '0000000c-0000-4000-8000-000000000001', type: 'expense' as const };
const TRAVEL = { id: '0000000c-0000-4000-8000-000000000002', type: 'expense' as const };
const SALARY = { id: '0000000c-0000-4000-8000-000000000004', type: 'income' as const };
const EXISTING = '0000000b-0000-4000-8000-000000000002';

const row = (n: number, values: Partial<ImportCandidate>): ImportCandidate => ({
  source_row_id: `row:${n + 1}`, ordinal: n, occurred_on: '2026-09-01', type: 'expense', amount_minor: '6500', wallet_label: 'Cash',
  category_label: 'food', merchant: null, note: null, review_required: false, ...values,
});

/** Seven rows: clean, an ambiguous date, no type, a same-file duplicate, an income already in the diary, a move, no amount. */
const ROWS: ImportCandidate[] = [
  row(1, { merchant: 'Coffee' }),
  row(2, { occurred_on: null, amount_minor: '12050', review_required: true }),
  row(3, { type: null, amount_minor: '50000', wallet_label: 'KBank', category_label: 'salary', review_required: true }),
  row(4, { merchant: 'Coffee' }),
  row(5, { type: 'income', amount_minor: '2800000', wallet_label: 'KBank', category_label: 'salary' }),
  row(6, { type: 'transfer', amount_minor: '150000', category_label: null }),
  row(7, { amount_minor: null, review_required: true }),
];
const ISSUES: ImportPreview['issues'] = [
  { code: 'legacy_encoding', source_row_id: null, field: null },
  { code: 'ambiguous_date', source_row_id: 'row:3', field: 'occurred_on' },
  { code: 'missing_type', source_row_id: 'row:4', field: 'type' },
  { code: 'missing_amount', source_row_id: 'row:8', field: 'amount_minor' },
];
const ADVICE: ImportPreview['duplicate_advice'] = [
  { source_row_id: 'row:5', kind: 'same_file', matches: ['row:2'] },
  { source_row_id: 'row:2', kind: 'same_file', matches: ['row:5'] },
  { source_row_id: 'row:6', kind: 'existing_transaction', matches: [EXISTING] },
];

function preview(candidates: ImportCandidate[] = ROWS, extra: Partial<ImportPreview> = {}): ImportPreview {
  return {
    job_id: JOB_ID, status: 'ready', candidates, issues: ISSUES, duplicate_advice: ADVICE, review_revision: '1', expires_at: '2026-10-25T03:00:00.000Z',
    summary: { layout: 'generic', candidate_count: candidates.length, review_required_count: 3, totals: { expense_minor: '0', income_minor: '0', transfer_minor: '0' }, image: null },
    ...extra,
  };
}

function reviewing(candidates: ImportCandidate[] = ROWS, extra: Partial<ImportJourney> = {}): ImportJourney {
  return { ...newJourney(), stage: 'review', jobId: JOB_ID, preview: preview(candidates), reviewRevision: '1', ...extra };
}

const file = (name: string, contentType: string, bytes = 10): ImportFile => ({ name, contentType, bytes: new Uint8Array(bytes) });
const labels = (flags: ReturnType<typeof rowFlags>) => flags.map((flag) => [flag.label.text, flag.label.values ?? {}, flag.tone]);

// ---------------------------------------------------------------------------
// The picked file

test('a picked file must be a CSV, XLSX, JPEG, PNG or WebP under 12 MB whose name and type agree', () => {
  assert.equal(checkPickedFile(file('statement.csv', 'text/csv')), null);
  assert.equal(checkPickedFile(file('กสิกร statement.csv', 'text/csv; charset=utf-8')), null);
  assert.equal(checkPickedFile(file('export.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')), null);
  assert.equal(checkPickedFile(file('receipt.JPG', 'image/jpeg')), null);
  assert.equal(checkPickedFile(file('slip.png', 'image/png')), null);
  assert.equal(checkPickedFile(file('IMG_0001.heic', 'image/heic')), 'unsupported');
  assert.equal(checkPickedFile(file('statement.pdf', 'application/pdf')), 'unsupported');
  // A name that says one thing and a type that says another.
  assert.equal(checkPickedFile(file('statement.csv', 'image/png')), 'unsupported');
  assert.equal(checkPickedFile(file('no-extension', 'text/csv')), 'unsupported');
  assert.equal(checkPickedFile(file('statement.csv', 'text/csv', 0)), 'empty');
  assert.equal(checkPickedFile(file('big.csv', 'text/csv', IMPORT_UPLOAD_MAX_BYTES)), null);
  assert.equal(checkPickedFile(file('big.csv', 'text/csv', IMPORT_UPLOAD_MAX_BYTES + 1)), 'too_large');
});

// ---------------------------------------------------------------------------
// Which state the screen is in

test('the phase follows the journey and what the screen is doing, never claiming more than the server said', () => {
  const ui = NO_UI;
  assert.equal(importPhase(null, { ...ui, opening: true }), 'opening');
  assert.equal(importPhase(null, ui), 'start');
  assert.equal(importPhase(newJourney(), { ...ui, resumeOffered: true }), 'resume');
  assert.equal(importPhase(newJourney(), { ...ui, picking: true }), 'picking');
  assert.equal(importPhase(null, { ...ui, running: 'upload' }), 'uploading');
  const uploading = { ...newJourney(), stage: 'uploading' as const, pendingUpload: { key: 'k', body: { name: 'a.csv', contentType: 'text/csv', bytes: 1 } } };
  assert.equal(importPhase(uploading, { ...ui, running: 'upload' }), 'uploading');
  assert.equal(importPhase({ ...uploading, problem: { kind: 'unconfirmed' } }, ui), 'upload_unconfirmed');
  assert.equal(importPhase({ ...newJourney(), problem: { kind: 'invalid', code: 'NOT_FOUND' } }, ui), 'uploads_off');
  assert.equal(importPhase({ ...newJourney(), problem: { kind: 'invalid', code: 'UPLOAD_TYPE_MISMATCH' } }, ui), 'start');
  const parsing = { ...newJourney(), stage: 'parsing' as const, jobId: JOB_ID };
  assert.equal(importPhase(parsing, { ...ui, running: 'parse' }), 'parsing');
  assert.equal(importPhase(parsing, { ...ui, parseWaiting: true }), 'parse_waiting');
  assert.equal(importPhase(parsing, ui), 'parsing');
  assert.equal(importPhase({ ...parsing, stage: 'failed', problem: { kind: 'parse_failed' } }, ui), 'parse_failed');
  assert.equal(importPhase({ ...parsing, stage: 'failed', problem: { kind: 'rejected' } }, ui), 'rejected');
  assert.equal(importPhase({ ...parsing, stage: 'expired', problem: { kind: 'preview_unavailable' } }, ui), 'expired');
  assert.equal(importPhase(reviewing(), ui), 'review');
  assert.equal(importPhase(reviewing(), { ...ui, running: 'save' }), 'review');
  const frozen = { ...reviewing(), stage: 'confirming' as const, selection: { id: 's', frozenRevision: '1', rowIds: ['row:2'] }, remaining: ['row:2'] };
  assert.equal(importPhase(frozen, ui), 'frozen');
  assert.equal(importPhase(frozen, { ...ui, running: 'confirm' }), 'confirming');
  const pending = { ...frozen, pendingBatch: { key: 'b', body: { selection_id: 's', frozen_revision: '1', batch_row_ids: ['row:2'] } }, problem: { kind: 'unconfirmed' as const } };
  assert.equal(importPhase(pending, ui), 'unconfirmed');
  // A pending batch is unconfirmed even before its problem is known (a resumed draft).
  assert.equal(importPhase({ ...pending, problem: null }, ui), 'unconfirmed');
  const someSaved = { ...frozen, selection: { id: 's', frozenRevision: '1', rowIds: ['row:2', 'row:3'] }, committed: ['row:2'], remaining: ['row:3'] };
  assert.equal(importPhase(someSaved, ui), 'paused');
  assert.equal(importPhase({ ...frozen, stage: 'done', remaining: [], committed: ['row:2'] }, ui), 'done');
});

test('upload refusals: uploads off (404) is its own answer; a lost answer is not a refusal', () => {
  const refused = (problem: ImportProblem | null) => uploadRefusal(problem);
  assert.equal(refused({ kind: 'invalid', code: 'NOT_FOUND' }), 'uploads_off');
  assert.equal(refused({ kind: 'invalid', code: 'UPLOAD_TOO_LARGE' }), 'too_large');
  assert.equal(refused({ kind: 'invalid', code: 'UPLOAD_UNSUPPORTED_TYPE' }), 'unsupported');
  assert.equal(refused({ kind: 'invalid', code: 'UPLOAD_TYPE_MISMATCH' }), 'unsupported');
  assert.equal(refused({ kind: 'invalid', code: 'INVALID_FILE_NAME' }), 'unsupported');
  assert.equal(refused({ kind: 'invalid', code: 'UPLOAD_EMPTY' }), 'empty');
  assert.equal(refused({ kind: 'rate_limited', code: 'UPLOAD_LIMIT_REACHED' }), 'limit');
  assert.equal(refused({ kind: 'invalid', code: 'UPLOAD_FAILED' }), 'failed');
  assert.equal(refused({ kind: 'blocked', code: 'CLIENT_UPGRADE_REQUIRED' }), 'blocked');
  assert.equal(refused({ kind: 'invalid', code: 'SOMETHING_NEW' }), 'other');
  assert.equal(refused({ kind: 'unconfirmed' }), null);
  assert.equal(refused(null), null);
});

// ---------------------------------------------------------------------------
// Flags: machine guesses are hedged and flagged, never fixed

test('rows carry flags for what the file left unclear; the values stay unknown, never filled in', () => {
  const journey = reviewing();
  assert.deepEqual(labels(rowFlags(journey, 'row:2')), [['Probably the same as row {row}', { row: 4 }, 'info']]);
  assert.deepEqual(labels(rowFlags(journey, 'row:3')), [['Date unclear', {}, 'warning']]);
  assert.equal(rowView(journey, 'row:3')?.occurred_on, null);
  assert.deepEqual(labels(rowFlags(journey, 'row:4')), [['No type', {}, 'warning']]);
  assert.equal(rowView(journey, 'row:4')?.type, null);
  assert.deepEqual(labels(rowFlags(journey, 'row:5')), [['Probably the same as row {row}', { row: 1 }, 'info']]);
  assert.deepEqual(labels(rowFlags(journey, 'row:6')), [['Probably already in your diary', {}, 'info']]);
  assert.deepEqual(labels(rowFlags(journey, 'row:7')), [["Moves can't be imported", {}, 'warning']]);
  assert.deepEqual(labels(rowFlags(journey, 'row:8')), [['No amount', {}, 'warning']]);
});

test('a missing value without its own issue is still flagged, a saved row says so, and a fixed value drops its flag', () => {
  const bare = reviewing([row(1, { wallet_label: null, category_label: null })], {});
  const journey = { ...bare, preview: { ...(bare.preview as ImportPreview), issues: [], duplicate_advice: [] } };
  assert.deepEqual(labels(rowFlags(journey, 'row:2')), [['No wallet', {}, 'warning'], ['No category', {}, 'warning']]);
  assert.deepEqual(labels(rowFlags({ ...journey, committed: ['row:2'] }, 'row:2')), [['Saved', {}, 'info']]);
  const dated = setRowDate(reviewing(), 'row:3', '2026-09-02');
  assert.deepEqual(labels(rowFlags(dated, 'row:3')), []);
});

test('filters: rows that need a look, probable duplicates, and the selection, in file order', () => {
  const journey = selectAll(reviewing());
  assert.deepEqual(filterRows(journey, 'all'), ROWS.map((candidate) => candidate.source_row_id));
  assert.deepEqual(filterRows(journey, 'needs_look'), ['row:3', 'row:4', 'row:7', 'row:8']);
  assert.deepEqual(filterRows(journey, 'duplicates'), ['row:2', 'row:5', 'row:6']);
  assert.deepEqual(filterRows(clearSelection(journey), 'selected'), []);
});

// ---------------------------------------------------------------------------
// Selection and the running total

test('select all keeps probable duplicates; leaving rows out is the person’s explicit choice', () => {
  const journey = selectAll(reviewing());
  assert.deepEqual(journey.selected, ROWS.map((candidate) => candidate.source_row_id));
  assert.ok(journey.selected.includes('row:5'));
  assert.ok(journey.selected.includes('row:6'));
  // "Leave out rows that can't be saved" drops only a missing value or a move, never a duplicate.
  assert.deepEqual(leaveOutUnsaveable(journey).selected, ['row:2', 'row:5', 'row:6']);
  assert.deepEqual(clearSelection(journey).selected, []);
});

test('the selected total is exact satang, split by money out and in, and counts rows it cannot add', () => {
  const journey = selectAll(reviewing());
  assert.deepEqual(selectionTotals(journey), { count: 7, outMinor: '25050', inMinor: '2800000', unknown: 3 });
  assert.deepEqual(selectionTotals(clearSelection(journey)), { count: 0, outMinor: '0', inMinor: '0', unknown: 0 });
  // Past 2^53 satang a float would round; BigInt does not.
  const huge = selectAll(reviewing([row(1, { amount_minor: '9007199254740993' }), row(2, { amount_minor: '1' })]));
  assert.equal(selectionTotals(huge).outMinor, '9007199254740994');
  const cents = selectAll(reviewing([row(1, { amount_minor: '10' }), row(2, { amount_minor: '20' }), row(3, { amount_minor: '1' })]));
  assert.equal(selectionTotals(cents).outMinor, '31');
});

// ---------------------------------------------------------------------------
// Bulk fixes

test('bulk type edits the chosen rows and counts as checking their type', () => {
  const journey = bulkType(selectAll(reviewing()), ['row:4', 'row:7'], 'expense');
  assert.equal(rowView(journey, 'row:4')?.type, 'expense');
  assert.equal(rowView(journey, 'row:7')?.type, 'expense');
  assert.deepEqual(journey.edits['row:4'], { type: 'expense' });
  assert.deepEqual(journey.reviewed['row:4'], ['type']);
});

test('bulk category applies to the chosen rows of its type and maps a label of its own, never taking over another row’s label', () => {
  const start = selectAll(reviewing());
  const { journey, applied } = bulkCategory(start, ['row:2', 'row:5', 'row:6'], TRAVEL, 'Travel');
  // row:6 is income: a Travel (expense) category does not fit it.
  assert.equal(applied, 2);
  assert.equal(rowView(journey, 'row:2')?.category_label, 'Travel');
  assert.equal(rowView(journey, 'row:6')?.category_label, 'salary');
  assert.equal(journey.mapping.categories.expense.Travel, TRAVEL.id);
  assert.deepEqual(journey.reviewed['row:2'], ['category']);
  // "food" is still the file's label on other rows: choosing Food for one row gets a label of its own.
  const named = bulkCategory(mapCategory(start, 'expense', 'food', TRAVEL.id), ['row:2'], FOOD, 'food');
  assert.equal(rowView(named.journey, 'row:2')?.category_label, 'food (2)');
  assert.equal(named.journey.mapping.categories.expense['food (2)'], FOOD.id);
  assert.equal(named.journey.mapping.categories.expense.food, TRAVEL.id);
  // The same label mapped to the same category is reused.
  const again = bulkCategory(named.journey, ['row:5'], FOOD, 'food');
  assert.equal(rowView(again.journey, 'row:5')?.category_label, 'food (2)');
  // Income categories go to income rows.
  assert.equal(bulkCategory(start, ['row:2', 'row:6'], SALARY, 'Salary').applied, 1);
});

test('bulk wallet maps a wallet label of its own for the chosen rows', () => {
  const journey = bulkWallet(selectAll(reviewing()), ['row:4', 'row:6'], { id: DAILY }, 'Daily account');
  assert.equal(rowView(journey, 'row:4')?.wallet_label, 'Daily account');
  assert.equal(journey.mapping.wallets['Daily account'], DAILY);
  assert.deepEqual(journey.reviewed['row:6'], ['wallet']);
  // "Cash" is the file's own label on other rows, so one row's fix takes "Cash (2)".
  const second = bulkWallet(selectAll(reviewing()), ['row:2'], { id: DAILY }, 'Cash');
  assert.equal(rowView(second, 'row:2')?.wallet_label, 'Cash (2)');
});

test('marking rows as checked marks all four fields of exactly those rows', () => {
  const journey = markChecked(reviewing(), ['row:2', 'row:5']);
  assert.deepEqual(journey.reviewed, { 'row:2': ['date', 'type', 'category', 'wallet'], 'row:5': ['date', 'type', 'category', 'wallet'] });
});

// ---------------------------------------------------------------------------
// Label mapping

test('the label step lists each wallet and category label in the file with its row count and its match', () => {
  const journey = mapWallet(reviewing(), 'Cash', CASH);
  assert.deepEqual(labelsToMap(journey), {
    wallets: [{ label: 'Cash', rows: 5, mappedId: CASH }, { label: 'KBank', rows: 2, mappedId: null }],
    expense: [{ label: 'food', rows: 4, mappedId: null }],
    income: [{ label: 'salary', rows: 1, mappedId: null }],
  });
});

// ---------------------------------------------------------------------------
// What blocks the freeze

test('blockers are counted in words, and Continue waits for every chosen row', () => {
  let journey = selectAll(reviewing());
  assert.deepEqual(blockerSummary(journey), { nothingSelected: false, missing: 3, transfer: 1, unchecked: 3, walletUnmapped: 0, categoryUnmapped: 0 });
  assert.equal(canContinue(journey), false);
  journey = markChecked(leaveOutUnsaveable(journey), ['row:2', 'row:5', 'row:6']);
  assert.deepEqual(blockerSummary(journey), { nothingSelected: false, missing: 0, transfer: 0, unchecked: 0, walletUnmapped: 3, categoryUnmapped: 0 });
  journey = mapWallet(mapWallet(journey, 'Cash', CASH), 'KBank', DAILY);
  assert.equal(blockerSummary(journey).categoryUnmapped, 3);
  journey = mapCategory(mapCategory(journey, 'expense', 'food', FOOD.id), 'income', 'salary', SALARY.id);
  assert.equal(canContinue(journey), true);
  // Unsaved corrections are saved by Continue itself, so they never block it.
  assert.equal(canContinue(bulkType(journey, ['row:2'], 'expense')), true);
  assert.equal(blockerSummary(clearSelection(journey)).nothingSelected, true);
  assert.equal(canContinue(clearSelection(journey)), false);
});

test('blocker lines name each reason with its count, the way forward first', () => {
  const lines = blockerLines(blockerSummary(selectAll(reviewing())));
  assert.deepEqual(lines, [
    { text: '{count} chosen rows are missing a date, type, amount, wallet or category. Fix them or leave them out.', values: { count: 3 } },
    { text: "1 chosen row is a move, which import can't save. Change its type or leave it out." },
    { text: "{count} chosen rows aren't checked yet.", values: { count: 3 } },
  ]);
  assert.deepEqual(blockerLines(blockerSummary(reviewing())), [{ text: 'Choose the rows to save.' }]);
  const unmatched = markChecked(leaveOutUnsaveable(selectAll(reviewing())), ['row:2', 'row:5', 'row:6']);
  assert.deepEqual(blockerLines(blockerSummary(unmatched)), [{ text: "{count} chosen rows use a wallet that isn't matched yet.", values: { count: 3 } }]);
});

// ---------------------------------------------------------------------------
// Freeze, confirm and the result (on the fake import server)

const CLEAN = [1, 2, 3].map((n) => row(n, { amount_minor: String(1000 * n + n) }));

async function readyJourney(server: ReturnType<typeof createFakeImportServer>): Promise<{ journey: ImportJourney; deps: ImportDeps }> {
  let n = 0;
  const deps: ImportDeps = { resources: server.resources, store: memoryDraftStore(), newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
  let journey: ImportJourney = { ...newJourney(), stage: 'review', jobId: JOB_ID, preview: await server.resources.preview(JOB_ID), reviewRevision: server.revision() };
  journey = markChecked(selectAll(journey), journey.preview!.candidates.map((candidate) => candidate.source_row_id));
  journey = mapCategory(mapWallet(journey, 'Cash', CASH), 'expense', 'food', FOOD.id);
  return { journey, deps };
}

test('freezing saves nothing: the frozen summary is ready to save, and going back is allowed until a batch is sent', async () => {
  const server = createFakeImportServer({ candidates: CLEAN });
  const { journey, deps } = await readyJourney(server);
  const frozen = await freezeSelection(journey, deps);
  assert.equal(server.callsOf('confirm').length, 0);
  assert.equal(server.transactions().length, 0);
  assert.deepEqual(frozenSummary(frozen), { count: 3, outMinor: '6006', inMinor: '0' });
  assert.equal(importPhase(frozen, NO_UI), 'frozen');
  const back = backToReview(frozen);
  assert.ok(back);
  assert.equal(back.stage, 'review');
  assert.equal(back.selection, null);
  assert.deepEqual(back.selected, frozen.selected);
  const sending = { ...frozen, pendingBatch: { key: 'k', body: { selection_id: frozen.selection!.id, frozen_revision: '1', batch_row_ids: ['row:2'] } } };
  assert.equal(backToReview(sending), null);
});

test('progress stages and the result use the server’s counts: committed, remaining and conflicted', async () => {
  const server = createFakeImportServer({ candidates: CLEAN });
  const { journey, deps } = await readyJourney(server);
  const frozen = await freezeSelection(journey, deps);
  const stages = (current: ImportJourney, running: boolean) => confirmStages(current, running).map((stage) => [stage.key, stage.status, stage.done ?? null, stage.total ?? null]);
  assert.deepEqual(stages(frozen, false), [['frozen', 'done', 3, 3], ['save', 'pending', 0, 3], ['result', 'pending', null, null]]);
  assert.deepEqual(stages(frozen, true), [['frozen', 'done', 3, 3], ['save', 'active', 0, 3], ['result', 'pending', null, null]]);
  server.blockRows(['row:3']);
  const done = await confirmBatches(frozen, deps);
  assert.equal(done.stage, 'done');
  assert.deepEqual(resultCounts(done), { total: 3, committed: 2, remaining: 0, conflicted: 1 });
  assert.deepEqual(stages(done, false), [['frozen', 'done', 3, 3], ['save', 'done', 2, 3], ['result', 'done', null, null]]);
  const failed = { ...frozen, problem: { kind: 'invalid' as const } };
  assert.deepEqual(stages(failed, false)[1], ['save', 'failed', 0, 3]);
});

test('parse stages: uploaded, reading, rows found', () => {
  const stages = (phase: Parameters<typeof parseStages>[0], rows?: number) => parseStages(phase, rows).map((stage) => [stage.key, stage.status, stage.done ?? null]);
  assert.deepEqual(stages('uploading'), [['upload', 'active', null], ['read', 'pending', null], ['rows', 'pending', null]]);
  assert.deepEqual(stages('parsing'), [['upload', 'done', null], ['read', 'active', null], ['rows', 'pending', null]]);
  assert.deepEqual(stages('parse_waiting'), [['upload', 'done', null], ['read', 'pending', null], ['rows', 'pending', null]]);
  assert.deepEqual(stages('parse_failed'), [['upload', 'done', null], ['read', 'failed', null], ['rows', 'pending', null]]);
  assert.deepEqual(stages('review', 342), [['upload', 'done', null], ['read', 'done', null], ['rows', 'done', 342]]);
});

// ---------------------------------------------------------------------------
// Resuming a kept draft

test('a kept draft resumes when it has something to pick up, and says what', () => {
  assert.equal(isResumable(null), false);
  assert.equal(isResumable(newJourney()), false);
  assert.equal(isResumable({ ...newJourney(), problem: { kind: 'invalid', code: 'NOT_FOUND' } }), false);
  const upload = { ...newJourney(), stage: 'uploading' as const, pendingUpload: { key: 'k', body: { name: 'a.csv', contentType: 'text/csv', bytes: 1 } } };
  assert.equal(isResumable(upload), true);
  assert.deepEqual(resumeSummary(upload), { text: "Your last upload of {name} wasn't confirmed.", values: { name: 'a.csv' } });
  assert.deepEqual(resumeSummary({ ...newJourney(), stage: 'parsing', jobId: JOB_ID }), { text: 'Your file is uploaded and waiting to be read.' });
  assert.deepEqual(resumeSummary(selectAll(reviewing())), { text: '{rows} rows to check, {selected} chosen.', values: { rows: 7, selected: 7 } });
  const confirming = { ...reviewing(), stage: 'confirming' as const, selection: { id: 's', frozenRevision: '1', rowIds: ['row:2', 'row:3'] }, committed: ['row:2'], remaining: ['row:3'] };
  assert.deepEqual(resumeSummary(confirming), { text: '{committed} of {total} records saved.', values: { committed: 1, total: 2 } });
  assert.equal(isResumable({ ...confirming, stage: 'done' }), false);
  assert.equal(isResumable({ ...newJourney(), stage: 'failed', problem: { kind: 'parse_failed' } }), false);
});

// ---------------------------------------------------------------------------
// Problems in words

test('each problem says what happened, what was kept, and the one way forward', () => {
  const notice = (problem: ImportProblem, phase: Parameters<typeof problemNotice>[1]) => {
    const found = problemNotice(problem, phase);
    return found ? [found.text.text, found.tone, found.action] : null;
  };
  assert.deepEqual(notice({ kind: 'unconfirmed' }, 'unconfirmed'), [
    'Not confirmed yet. The last batch may have been saved. Try again checks it with the same request, so nothing is saved twice.', 'alert', 'retry',
  ]);
  assert.deepEqual(notice({ kind: 'unconfirmed' }, 'review'), ['Not confirmed yet. Your review is kept; try again.', 'alert', 'retry']);
  assert.deepEqual(notice({ kind: 'offline' }, 'parsing'), ["Couldn't reach Jotbun. Import needs a connection; your import is kept on this phone.", 'status', 'reload']);
  assert.deepEqual(notice({ kind: 'review_changed' }, 'review'), ['This import changed on another device. Reload it; your changes are kept.', 'alert', 'reload']);
  assert.deepEqual(notice({ kind: 'selection_conflict' }, 'review'), ['The rows changed since you chose them. Check them and continue again; saved records stay saved.', 'alert', null]);
  assert.deepEqual(notice({ kind: 'receipt_unavailable' }, 'paused'), ["The receipt photo can no longer be kept. Nothing was saved. You can save the record without it.", 'alert', 'without_receipt']);
  assert.deepEqual(notice({ kind: 'rate_limited' }, 'review'), ['Too many changes at once. Your review is kept; try again in a moment.', 'alert', 'retry']);
  assert.equal(problemNotice({ kind: 'invalid', code: 'NOT_FOUND' }, 'uploads_off'), null);
});

test('a rejected file lists why, in plain words, once per reason', () => {
  const rejected = { ...newJourney(), stage: 'failed' as const, problem: { kind: 'rejected' as const }, preview: preview([], { status: 'rejected', issues: [
    { code: 'formulas', source_row_id: null, field: null },
    { code: 'macros', source_row_id: null, field: null },
    { code: 'something_new', source_row_id: null, field: null },
  ] }) };
  assert.deepEqual(fileIssueLines(rejected).map((line) => line.text), [
    'The workbook has formulas, macros or links. Save a copy with values only, then import that.',
    "Part of this file couldn't be read.",
  ]);
  assert.deepEqual(fileIssueLines({ ...rejected, preview: null }).map((line) => line.text), ["This file couldn't be read."]);
});

test('saving corrections then freezing sends the patch before the freeze, and the freeze before any batch', async () => {
  const server = createFakeImportServer({ candidates: CLEAN });
  const ready = await readyJourney(server);
  const edited = bulkType(ready.journey, ['row:2'], 'expense');
  const saved = await saveCorrections(edited, ready.deps);
  const frozen = await freezeSelection(saved, ready.deps);
  assert.deepEqual(server.calls.filter((call) => call.method !== 'preview').map((call) => call.method), ['patchRows', 'freeze']);
  assert.equal(importPhase(frozen, NO_UI), 'frozen');
});

// ---------------------------------------------------------------------------
// The catalogs

// Copy is looked up by its English text, and every line here reaches the
// screen's `tc` as a CopyLine or from a table, where the literal guard can't
// see it: one missing from the catalogs shows English in every locale (R7, E2
// checkpoint 5).
test('every flag, blocker, stage, summary, notice and file reason is copy in en.json, with Thai', () => {
  const texts: string[] = [];
  const add = (lines: readonly { text: string }[]) => texts.push(...lines.map((line) => line.text));
  const flags = (candidates: ImportCandidate[], extra: Partial<ImportPreview> = {}, more: Partial<ImportJourney> = {}) => {
    const base = reviewing(candidates, more);
    return rowFlags({ ...base, preview: { ...(base.preview as ImportPreview), issues: [], duplicate_advice: [], ...extra } }, 'row:2').map((flag) => flag.label);
  };
  const issueFlags = flags([row(1, {})], { issues: [...Object.keys(ISSUE_WORDS), 'something_new'].map((code) => ({ code, source_row_id: 'row:2', field: null })) });
  assert.deepEqual(issueFlags.map((label) => label.text).sort(), [...new Set([...Object.values(ISSUE_WORDS), 'Check this row'])].sort(), 'every issue code is walked');
  add(issueFlags);
  add(flags([row(1, { occurred_on: null, type: null, amount_minor: null, wallet_label: null, category_label: null })]));
  add(flags([row(1, { type: 'transfer', category_label: null })]));
  add(flags([row(1, {})], {}, { committed: ['row:2'] }));
  add(flags([row(1, {}), row(2, {})], { duplicate_advice: [{ source_row_id: 'row:2', kind: 'existing_transaction', matches: [EXISTING] }, { source_row_id: 'row:2', kind: 'same_file', matches: ['row:3'] }] }));
  for (const count of [1, 2]) add(blockerLines({ nothingSelected: true, missing: count, transfer: count, unchecked: count, walletUnmapped: count, categoryUnmapped: count }));
  add(parseStages('review', 3).map((stage) => stage.label));
  add(confirmStages(reviewing(), false).map((stage) => stage.label));
  const upload = { ...newJourney(), stage: 'uploading' as const, pendingUpload: { key: 'k', body: { name: 'a.csv', contentType: 'text/csv', bytes: 1 } } };
  const confirming = { ...reviewing(), stage: 'confirming' as const, selection: { id: 's', frozenRevision: '1', rowIds: ['row:2'] }, remaining: ['row:2'] };
  add([upload, { ...newJourney(), stage: 'parsing' as const, jobId: JOB_ID }, reviewing(), confirming].map((journey) => resumeSummary(journey) ?? { text: '' }));
  const kinds: ImportProblem['kind'][] = [
    'unconfirmed', 'offline', 'review_changed', 'selection_conflict', 'preview_unavailable', 'row_committed', 'invalid', 'rate_limited', 'blocked', 'parse_failed', 'rejected', 'receipt_unavailable',
  ];
  for (const kind of kinds) {
    for (const phase of ['unconfirmed', 'upload_unconfirmed', 'review', 'paused', 'start', 'uploads_off'] as const) {
      const notice = problemNotice({ kind }, phase);
      if (notice) texts.push(notice.text.text);
    }
  }
  texts.push(...Object.values(REFUSAL_WORDS));
  const rejected = (codes: readonly string[]) => ({
    ...newJourney(), stage: 'failed' as const, problem: { kind: 'rejected' as const },
    preview: preview([], { status: 'rejected', issues: codes.map((code) => ({ code, source_row_id: null, field: null })) }),
  });
  const reasons = fileIssueLines(rejected([...Object.keys(FILE_ISSUE_WORDS), 'something_new']));
  assert.deepEqual(reasons.map((line) => line.text).sort(), [...new Set([...Object.values(FILE_ISSUE_WORDS), "Part of this file couldn't be read."])].sort(), 'every file issue code is walked');
  add(reasons);
  add(fileIssueLines({ ...rejected([]), preview: null }));
  const readable = reviewing();
  const notices = fileNotices({ ...readable, preview: { ...(readable.preview as ImportPreview), issues: Object.keys(FILE_NOTICE_WORDS).map((code) => ({ code, source_row_id: null, field: null })) } });
  assert.deepEqual(notices.map((notice) => notice.label.text).sort(), [...new Set(Object.values(FILE_NOTICE_WORDS))].sort(), 'every file notice code is walked');
  add(notices.map((notice) => notice.label));
  assert.deepEqual(untranslated(texts.filter((text) => text !== '')), []);
});
