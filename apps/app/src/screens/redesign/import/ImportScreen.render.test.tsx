// R7: the import journey (plan §6.5), every state on fakes: the in-memory
// import server, an in-memory draft store and a fake file picker. The
// expectation sheet, picking, uploads off, uploading, reading, a reader that
// can't run (today's Node 24 server) or a file that can't be read, the label
// step, review with flags, bulk fixes with an exact running total, probable
// duplicates kept, the frozen selection, confirming in batches, an
// unconfirmed batch resumed and never double-committed, a partial conflict,
// done, resuming a kept draft and offline. Then TH, EN and VI in light and
// dark, targets, labels, the bun, reduced motion, and the catalogue sections.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Animated } from 'react-native';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('@mobile/hooks/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }));

import type { ConfirmImportBatch } from '@gogospend/contracts';
import { mountInApp } from '@mobile/dev/catalogue/catalogueTestHarness';
import { IMPORT_SECTIONS, SAMPLE_ROWS, cleanRows, importFixture, keepReviewDraft } from '@mobile/dev/catalogue/import/importSections';
import type { ImportFixture, ImportFixtureOptions } from '@mobile/dev/catalogue/import/importSections';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import type { BunIntensity } from '@mobile/mascot/bunIntensity';
import { BUN_INTENSITY_STORAGE_KEY } from '@mobile/mascot/bunIntensityStorage';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { BUN_TEXT_PAIRS } from '@mobile/theme/bunPalette';
import type { BunColors } from '@mobile/theme/bunPalette';
import { contrastRatio } from '@mobile/theme/contrast';
import { MATRIX, NOW, hiddenFromScreenReaders, leading, mountScreen, rgb } from '../HistoryTestHarness';
import { ImportScreen } from './ImportScreen';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [router.push, router.replace, router.back, router.navigate]) fn.mockReset();
  router.canGoBack.mockReset();
  router.canGoBack.mockReturnValue(true);
  motion.reduced = false;
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

type Options = ImportFixtureOptions & { locale?: Locale; mode?: 'light' | 'dark'; intensity?: BunIntensity };

function mount(options: Options = {}, existing?: ImportFixture): ImportFixture {
  if (options.intensity) window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, options.intensity);
  const fixture = existing ?? importFixture(options);
  mountScreen(<ImportScreen ports={fixture.ports} now={NOW} />, { resources: fixture.fake.resources, locale: options.locale, mode: options.mode });
  return fixture;
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const click = (name: string | RegExp) => fireEvent.click(button(name));
const disabled = (element: HTMLElement) => element.getAttribute('aria-disabled') === 'true';
const footer = () => screen.getByTestId('import-footer');
const sheet = () => screen.getByRole('dialog');
const NOTHING_SAVED = 'Nothing is saved until you confirm.';

async function openStart(options: Options = {}): Promise<ImportFixture> {
  const fixture = mount(options);
  await screen.findByRole('dialog', { name: translateCopy('What import does', options.locale ?? 'en') });
  return fixture;
}

/** Choose a file from the expectation sheet. */
function chooseFromSheet(locale: Locale = 'en') {
  fireEvent.click(within(sheet()).getByRole('button', { name: translateCopy('Choose a file', locale) }));
}

async function toLabels(options: Options = {}): Promise<ImportFixture> {
  const fixture = await openStart(options);
  chooseFromSheet(options.locale);
  await screen.findByTestId('import-labels');
  return fixture;
}

/** Matches a file label to one of the person's wallets or categories through its sheet. */
async function match(label: string, rows: number, choice: string) {
  const count = rows === 1 ? '1 row' : `${rows} rows`;
  click(`${label}, ${count}, not matched yet`);
  const dialog = await screen.findByRole('dialog', { name: `Match "${label}"` });
  fireEvent.click(within(dialog).getByRole('radio', { name: choice }));
  await screen.findByRole('button', { name: `${label}, ${count}, matched to ${choice}` });
}

async function matchSample() {
  await match('Cash', 4, 'Cash');
  await match('KBank', 2, 'Daily account');
  await match('Food & drink', 3, 'Food');
  await match('Transport', 1, 'Travel');
  await match('Pay', 1, 'Salary');
}

async function toRows(options: Options = {}, matchFirst = true): Promise<ImportFixture> {
  const fixture = await toLabels(options);
  if (matchFirst) await matchSample();
  click('Next: check rows');
  await screen.findByTestId('import-rows');
  return fixture;
}

/** The clean file, matched, chosen, checked and frozen. */
async function toFrozen(count = 5, options: Options = {}): Promise<ImportFixture> {
  const fixture = await toLabels({ rows: cleanRows(count), ...options });
  await match('Cash', count, 'Cash');
  await match('Food & drink', count, 'Food');
  click('Next: check rows');
  await screen.findByTestId('import-rows');
  click('Select all');
  click('Mark as checked');
  click('Continue');
  await screen.findByRole('heading', { name: `Ready to save ${count} records` });
  return fixture;
}

const checkbox = (row: number) => screen.getByRole('checkbox', { name: `Choose row ${row}` });
const checked = (row: number) => checkbox(row).getAttribute('aria-checked') === 'true';
/** A row's own button, whose name starts "Row 2: " (in the locale's words). */
const rowButton = (row: number, locale: Locale = 'en') => {
  const start = translateCopy('Row {row}: {details}', locale, { row, details: '' });
  return screen.getByRole('button', { name: (name) => name.startsWith(start) });
};

// ---------------------------------------------------------------------------
// The expectation sheet

test('the first open shows what import can do and what it won’t, and that nothing is saved until you confirm', async () => {
  const fixture = await openStart();
  const dialog = sheet();
  expect(within(dialog).getByText(NOTHING_SAVED)).toBeTruthy();
  expect(within(dialog).getByRole('heading', { name: 'Import can' })).toBeTruthy();
  expect(within(dialog).getByText('Read CSV and Excel (XLSX) exports from other apps, and photos of receipts.')).toBeTruthy();
  expect(within(dialog).getByRole('heading', { name: "Import won't" })).toBeTruthy();
  expect(within(dialog).getByText("Guess. An unclear date or type stays unclear until you fix it.")).toBeTruthy();
  expect(within(dialog).getByText('Drop rows that look like duplicates. They\'re marked "probably" and kept unless you leave them out.')).toBeTruthy();
  expect(within(dialog).getByText('Connect to your bank.')).toBeTruthy();
  expect(within(dialog).getByText("Files up to 12 MB. Jotbun deletes an uploaded file after 24 hours, and rows you didn't save after 7 days.")).toBeTruthy();
  // Nothing is sent by opening the screen.
  expect(fixture.server.calls).toEqual([]);
  expect(fixture.picks()).toBe(0);
  // Closing the sheet leaves the way forward on the page, and the sheet can come back.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(within(footer()).getByRole('button', { name: 'Choose a file' })).toBeTruthy();
  click('What import does');
  expect(await screen.findByRole('dialog', { name: 'What import does' })).toBeTruthy();
});

test('the screen has a stage header with Back, which goes back (or Home on a deep link)', async () => {
  await openStart();
  fireEvent.click(within(sheet()).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('heading', { name: 'Import' })).toBeTruthy();
  click('Back');
  expect(router.back).toHaveBeenCalledTimes(1);
  router.canGoBack.mockReturnValue(false);
  click('Back');
  expect(router.replace).toHaveBeenCalledWith('/spend');
});

// ---------------------------------------------------------------------------
// Picking and uploading

test('picking: while the system picker is open the screen says so; cancelling goes back quietly', async () => {
  const fixture = await openStart({ picked: 'hold' });
  chooseFromSheet();
  expect(await screen.findByLabelText('Opening your files…')).toBeTruthy();
  expect(fixture.server.calls).toEqual([]);
  cleanup();
  const canceled = await openStart({ picked: { ok: false, reason: 'canceled' } });
  chooseFromSheet();
  await waitFor(() => expect(within(footer()).getByRole('button', { name: 'Choose a file' })).toBeTruthy());
  expect(screen.queryByRole('alert')).toBeNull();
  expect(canceled.server.calls).toEqual([]);
});

test('a file that can’t be imported is refused on the phone, in words, and never uploaded', async () => {
  const fixture = await openStart({ picked: { ok: true, file: { name: 'IMG_0001.heic', contentType: 'image/heic', bytes: new Uint8Array(10) } } });
  chooseFromSheet();
  expect(await screen.findByText("Jotbun can import CSV and Excel (XLSX) files, and JPEG, PNG or WebP photos. HEIC photos aren't supported yet.")).toBeTruthy();
  expect(fixture.server.callsOf('upload')).toHaveLength(0);
  cleanup();
  const big = await openStart({ picked: { ok: false, reason: 'too_large' } });
  chooseFromSheet();
  expect(await screen.findByText('This file is over 12 MB. Export a shorter date range and try again.')).toBeTruthy();
  expect(big.server.callsOf('upload')).toHaveLength(0);
});

test('uploads off: the screen says so plainly, and nothing pretends to work', async () => {
  const fixture = await openStart({ uploadsOff: true });
  chooseFromSheet();
  expect(await screen.findByRole('heading', { name: "Import isn't switched on yet" })).toBeTruthy();
  expect(screen.getByText("Jotbun isn't taking files right now, so your file wasn't uploaded and nothing was saved. Import will open in a later update.")).toBeTruthy();
  // No retry, no picker, no progress: only the way out.
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Choose a file' })).toBeNull();
  expect(screen.queryByTestId('import-progress')).toBeNull();
  expect(fixture.server.callsOf('upload')).toHaveLength(1);
  expect(fixture.server.callsOf('preview')).toHaveLength(0);
  click('Done');
  expect(router.back).toHaveBeenCalledTimes(1);
});

test('uploading: the staged progress and the box bun, and nothing saved yet', async () => {
  const fixture = importFixture();
  const release = fixture.hold('upload');
  mount({}, fixture);
  await screen.findByRole('dialog');
  chooseFromSheet();
  const progress = await screen.findByTestId('import-progress');
  expect(within(progress).getByLabelText('Upload the file, In progress')).toBeTruthy();
  expect(within(progress).getByLabelText('Read the file, Waiting')).toBeTruthy();
  expect(within(progress).getByText('Nothing has been saved.')).toBeTruthy();
  const bun = screen.getByTestId('import-bun');
  expect(hiddenFromScreenReaders(bun)).toBe(true);
  release();
  await screen.findByTestId('import-labels');
});

test('an upload whose answer was lost is sent again as the same request, after a restart too, and the file is uploaded once', async () => {
  const fixture = importFixture();
  fixture.server.script('upload', { kind: 'network_after' }, { kind: 'network_after' });
  mount({}, fixture);
  await screen.findByRole('dialog');
  chooseFromSheet();
  expect(await screen.findByText("Not confirmed yet. Try again sends the same file with the same request, so it's never uploaded twice.")).toBeTruthy();
  expect(screen.getByLabelText('Upload the file, Waiting')).toBeTruthy();
  click('Try again');
  await screen.findByText("Not confirmed yet. Try again sends the same file with the same request, so it's never uploaded twice.");
  // The app restarts: the file is not kept, so the person picks it again.
  cleanup();
  mount({}, fixture);
  expect(await screen.findByText("Your last upload of kbank-september.csv wasn't confirmed.")).toBeTruthy();
  click('Continue');
  click('Choose the file again');
  await screen.findByTestId('import-labels');
  const keys = fixture.server.callsOf('upload').map((call) => call.key);
  expect(keys).toHaveLength(3);
  expect(new Set(keys).size).toBe(1);
});

test('reading: upload done, reading in progress, then the review', async () => {
  const fixture = importFixture();
  const release = fixture.hold('preview');
  mount({}, fixture);
  await screen.findByRole('dialog');
  chooseFromSheet();
  expect(await screen.findByLabelText('Read the file, In progress')).toBeTruthy();
  expect(screen.getByLabelText('Upload the file, Done')).toBeTruthy();
  expect(screen.getByTestId('import-bun')).toBeTruthy();
  release();
  await screen.findByTestId('import-labels');
  expect(fixture.server.transactions()).toHaveLength(0);
});

test('a file still waiting to be read (today’s Node 24 server never starts reading it) says so and checks again', async () => {
  // Two checks find it queued; Check again finds it queued once more, then read.
  const fixture = await openStart({ statuses: Array.from({ length: 3 }, () => 'queued' as const), maxPolls: 2 });
  chooseFromSheet();
  expect(await screen.findByText("Your file is uploaded but hasn't been read yet. Jotbun's file reader may be paused on our side. Nothing has been saved. Check again later: the file is kept for 24 hours.")).toBeTruthy();
  expect(screen.getByLabelText('Read the file, Waiting')).toBeTruthy();
  const reads = fixture.server.callsOf('preview').length;
  click('Check again');
  await waitFor(() => expect(fixture.server.callsOf('preview').length).toBeGreaterThan(reads));
  await screen.findByTestId('import-labels', {}, { timeout: 3000 });
});

test('a parse failure says plainly that the reader couldn’t run, that it isn’t the file, and that nothing was saved', async () => {
  const fixture = await openStart({ statuses: ['failed'] });
  chooseFromSheet();
  const failed = await screen.findByTestId('import-parse-failed');
  expect(within(failed).getByText("Jotbun couldn't read your file because its file reader isn't running on our side right now. It's not a problem with your file. Nothing was saved.")).toBeTruthy();
  expect(screen.getByLabelText('Read the file, Failed')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  expect(fixture.server.transactions()).toHaveLength(0);
  click('Start over');
  expect(await screen.findByRole('button', { name: 'Choose a file' })).toBeTruthy();
});

test('a file that can’t be read lists why, once per reason', async () => {
  const fixture = await openStart({ statuses: ['rejected'], issues: [{ code: 'formulas', source_row_id: null, field: null }, { code: 'macros', source_row_id: null, field: null }, { code: 'multiple_worksheets', source_row_id: null, field: null }] });
  chooseFromSheet();
  const rejected = await screen.findByTestId('import-rejected');
  expect(within(rejected).getByRole('heading', { name: "This file couldn't be read" })).toBeTruthy();
  expect(within(rejected).getAllByText('The workbook has formulas, macros or links. Save a copy with values only, then import that.')).toHaveLength(1);
  expect(within(rejected).getByText('The workbook has more than one sheet. Keep only the sheet to import.')).toBeTruthy();
  expect(within(rejected).getByText('Nothing was saved.')).toBeTruthy();
  // The next file is read (the fake's next answer is a ready preview).
  click('Choose another file');
  await screen.findByTestId('import-labels');
  expect(fixture.picks()).toBe(2);
});

// ---------------------------------------------------------------------------
// The label step

test('label mapping: each file label with its rows, matched to the person’s own wallets and categories', async () => {
  await toLabels();
  const labels = screen.getByTestId('import-labels');
  expect(within(labels).getByRole('heading', { name: 'Match your labels' })).toBeTruthy();
  expect(within(labels).getByRole('heading', { name: 'Wallets in this file' })).toBeTruthy();
  expect(within(labels).getByRole('button', { name: 'Cash, 4 rows, not matched yet' })).toBeTruthy();
  expect(within(labels).getByRole('button', { name: 'KBank, 2 rows, not matched yet' })).toBeTruthy();
  expect(within(labels).getByRole('heading', { name: 'Expense categories in this file' })).toBeTruthy();
  expect(within(labels).getByRole('heading', { name: 'Income categories in this file' })).toBeTruthy();
  await match('Cash', 4, 'Cash');
  await match('Pay', 1, 'Salary');
  // The income label offers only income categories.
  click('Food & drink, 3 rows, not matched yet');
  const dialog = await screen.findByRole('dialog', { name: 'Match "Food & drink"' });
  expect(within(dialog).queryByRole('radio', { name: 'Salary' })).toBeNull();
  expect(within(dialog).getByRole('radio', { name: 'Food' })).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Review: flags, selection, bulk fixes and duplicates

test('review: rows are calm, with flags for what the file left unclear, never filled in', async () => {
  await toRows();
  const rows = screen.getByTestId('import-rows');
  expect(within(rows).getByText('6 rows in this file')).toBeTruthy();
  const noodles = rowButton(2);
  expect(noodles.getAttribute('aria-label')).toBe('Row 2: Noodles, Expense ฿120.50, No date, Cash, Food. Check this: Date unclear');
  const market = rowButton(3);
  expect(market.getAttribute('aria-label')).toBe('Row 3: Market, ฿500.00, Monday 21 September 2026, Daily account, Shopping. Check this: No type');
  expect(within(rows).getByLabelText('Check this: Date unclear')).toBeTruthy();
  expect(within(rows).getByLabelText('Check this: No type')).toBeTruthy();
  // Nothing is chosen for the person.
  expect([1, 2, 3, 4, 5, 6].some(checked)).toBe(false);
  expect(within(footer()).getByText('Choose the rows to save.')).toBeTruthy();
  expect(disabled(within(footer()).getByRole('button', { name: 'Continue' }))).toBe(true);
});

test('review: choosing rows shows an exact running total, and the blockers in words', async () => {
  await toRows();
  click('Select all');
  expect([1, 2, 3, 4, 5, 6].every(checked)).toBe(true);
  const total = screen.getByTestId('import-total');
  // ฿65.00 + ฿120.50 + ฿65.00 + ฿40.00 out; ฿28,000.00 in; the row with no type is not counted.
  expect(total.getAttribute('aria-label')).toBe('6 chosen. Money out ฿290.50. Money in ฿28,000.00. 1 not counted: no type or amount, or a move.');
  expect(within(footer()).getByText('2 chosen rows are missing a date, type, amount, wallet or category. Fix them or leave them out.')).toBeTruthy();
  expect(within(footer()).getByText("4 chosen rows aren't checked yet.")).toBeTruthy();
  fireEvent.click(checkbox(5));
  expect(screen.getByTestId('import-total').getAttribute('aria-label')).toBe('5 chosen. Money out ฿290.50. Money in ฿0.00. 1 not counted: no type or amount, or a move.');
});

test('bulk fix: type, category and wallet for the chosen rows, then mark them checked', async () => {
  const fixture = await toRows();
  fireEvent.click(checkbox(3));
  fireEvent.click(checkbox(6));
  click('Set type');
  const typeSheet = await screen.findByRole('dialog', { name: 'Set the type of 2 rows' });
  fireEvent.click(within(typeSheet).getByRole('radio', { name: 'Expense' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(rowButton(3).getAttribute('aria-label')).toBe('Row 3: Market, Expense ฿500.00, Monday 21 September 2026, Daily account, Shopping');
  click('Set category');
  const categorySheet = await screen.findByRole('dialog', { name: 'Set the category of 2 rows' });
  fireEvent.click(within(categorySheet).getByRole('radio', { name: 'Bills' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(rowButton(3).getAttribute('aria-label')).toContain(', Bills');
  expect(rowButton(6).getAttribute('aria-label')).toContain(', Bills');
  click('Set wallet');
  const walletSheet = await screen.findByRole('dialog', { name: 'Set the wallet of 2 rows' });
  fireEvent.click(within(walletSheet).getByRole('radio', { name: 'Cash' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(rowButton(3).getAttribute('aria-label')).toBe('Row 3: Market, Expense ฿500.00, Monday 21 September 2026, Cash, Bills');
  click('Mark as checked');
  expect(rowButton(3).getAttribute('aria-label')).toContain('checked');
  expect(screen.getByTestId('import-total').getAttribute('aria-label')).toBe('2 chosen. Money out ฿540.00. Money in ฿0.00.');
  // Corrections are saved by Continue, before the freeze.
  click('Continue');
  await screen.findByRole('heading', { name: 'Ready to save 2 records' });
  expect(fixture.server.calls.filter((call) => call.method !== 'preview' && call.method !== 'upload').map((call) => call.method)).toEqual(['patchRows', 'freeze']);
});

test('a row’s own sheet gives an unclear date a day the person chooses', async () => {
  await toRows();
  fireEvent.click(rowButton(2));
  const dialog = await screen.findByRole('dialog', { name: 'Row 2' });
  expect(within(dialog).getByText("The file's date was unclear. Choose the day:")).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Use this day' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Looks right' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(rowButton(2).getAttribute('aria-label')).toBe('Row 2: Noodles, Expense ฿120.50, Tuesday 29 September 2026, Cash, Food, checked');
});

test('duplicates read “probably”, are kept when everything is chosen, and stay until the person leaves them out', async () => {
  const fixture = await toRows();
  expect(within(screen.getByTestId('import-rows')).getAllByLabelText('Note: Probably the same as row 4')).toHaveLength(1);
  expect(screen.getByLabelText('Note: Probably the same as row 1')).toBeTruthy();
  expect(screen.getByLabelText('Note: Probably already in your diary')).toBeTruthy();
  click('Select all');
  expect(checked(4)).toBe(true);
  expect(checked(5)).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: 'Probably duplicates (3)' }));
  expect(screen.queryByRole('checkbox', { name: 'Choose row 2' })).toBeNull();
  expect(checked(1) && checked(4) && checked(5)).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: 'All (6)' }));
  // Leaving out what can't be saved drops the unclear rows, never the duplicates.
  click("Leave out rows that can't be saved");
  expect(checked(2) || checked(3)).toBe(false);
  expect(checked(4) && checked(5)).toBe(true);
  click('Mark as checked');
  click('Continue');
  expect(await screen.findByRole('heading', { name: 'Ready to save 4 records' })).toBeTruthy();
  const frozen = fixture.server.callsOf('freeze')[0].body as { selected_row_ids: string[] };
  expect(frozen.selected_row_ids).toEqual(['row:2', 'row:5', 'row:6', 'row:7']);
});

// ---------------------------------------------------------------------------
// Frozen, confirming and the result

test('frozen: “Ready to save” with exact totals; freezing saved nothing and sent no batch', async () => {
  const fixture = await toFrozen(5);
  const frozen = screen.getByTestId('import-frozen');
  // ฿10.01 + ฿20.02 + ฿30.03 + ฿40.04 + ฿50.05
  expect(within(frozen).getByLabelText('Money out ฿150.15')).toBeTruthy();
  expect(within(frozen).getByText('Nothing is saved yet. Records are saved in batches of up to 500; if the connection drops, nothing is saved twice.')).toBeTruthy();
  expect(fixture.server.callsOf('freeze')).toHaveLength(1);
  expect(fixture.server.callsOf('confirm')).toHaveLength(0);
  expect(fixture.server.transactions()).toHaveLength(0);
  // Back to the review keeps every choice; Continue freezes again.
  click('Back to review');
  await screen.findByTestId('import-rows');
  expect([1, 2, 3, 4, 5].every(checked)).toBe(true);
  click('Continue');
  await screen.findByRole('heading', { name: 'Ready to save 5 records' });
  expect(fixture.server.callsOf('freeze')).toHaveLength(2);
  expect(fixture.server.callsOf('confirm')).toHaveLength(0);
});

test('confirming: staged progress while batches are saved, then done', async () => {
  const fixture = await toFrozen(5);
  const release = fixture.hold('confirm');
  click('Save 5 records');
  expect(await screen.findByLabelText('Save the records, In progress, 0 of 5')).toBeTruthy();
  expect(screen.getByLabelText('Records chosen, Done, 5 of 5')).toBeTruthy();
  expect(screen.queryByText(/Saved 5/)).toBeNull();
  release();
  const result = await screen.findByTestId('import-result');
  expect(within(result).getByRole('heading', { name: 'Saved 5 records' })).toBeTruthy();
  expect(fixture.server.transactions()).toHaveLength(5);
  expect(await fixture.store.load()).toBeNull();
});

test('an unconfirmed batch keeps its request; resumed after a restart, Try again resends it as itself and nothing is saved twice', async () => {
  const fixture = await toFrozen(5);
  fixture.server.script('confirm', { kind: 'network_after' });
  click('Save 5 records');
  const unconfirmed = await screen.findByTestId('import-unconfirmed');
  expect(within(unconfirmed).getByText('Not confirmed yet. The last batch may have been saved. Try again checks it with the same request, so nothing is saved twice.')).toBeTruthy();
  const kept = await fixture.store.load();
  expect(kept?.pendingBatch).toBeTruthy();
  // The app restarts.
  cleanup();
  mount({}, fixture);
  expect(await screen.findByRole('heading', { name: 'Pick up where you left off?' })).toBeTruthy();
  click('Continue');
  await screen.findByTestId('import-unconfirmed');
  expect(fixture.server.callsOf('confirm')).toHaveLength(1);
  click('Try again');
  await screen.findByTestId('import-result');
  const [first, second] = fixture.server.callsOf('confirm');
  expect(second.key).toBe(first.key);
  expect(second.body).toEqual(first.body);
  expect((first.body as ConfirmImportBatch).batch_row_ids).toHaveLength(5);
  expect(fixture.server.transactions()).toHaveLength(5);
});

test('a partial conflict: the server’s committed, remaining and conflicted counts, and which rows weren’t saved', async () => {
  const fixture = await toFrozen(5);
  fixture.server.blockRows(['row:3', 'row:5']);
  click('Save 5 records');
  const result = await screen.findByTestId('import-result');
  expect(within(result).getByRole('heading', { name: 'Saved 3 of 5 records' })).toBeTruthy();
  expect(within(result).getByLabelText('Saved: 3')).toBeTruthy();
  expect(within(result).getByLabelText('Still to save: 0')).toBeTruthy();
  expect(within(result).getByLabelText("Couldn't save: 2")).toBeTruthy();
  expect(within(result).getByText("2 records weren't saved because their wallet or category was archived after you chose them. Add them by hand if you still want them.")).toBeTruthy();
  expect(within(result).getByText('Shop 2')).toBeTruthy();
  expect(within(result).getByText('Shop 4')).toBeTruthy();
  expect(fixture.server.transactions()).toHaveLength(3);
});

test('done: History is one tap away, or another file', async () => {
  await toFrozen(3);
  click('Save 3 records');
  await screen.findByTestId('import-result');
  expect(screen.getByLabelText('Saved: 3')).toBeTruthy();
  click('See them in History');
  expect(router.replace).toHaveBeenCalledWith('/spend/all');
  click('Import another file');
  expect(await screen.findByRole('button', { name: 'Choose a file' })).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Resume and offline

test('resume: a kept draft is offered on reopening, and picks up with its choices; Start over discards it after asking', async () => {
  const fixture = importFixture();
  await keepReviewDraft(fixture);
  mount({}, fixture);
  expect(await screen.findByRole('heading', { name: 'Pick up where you left off?' })).toBeTruthy();
  expect(screen.getByText('6 rows to check, 3 chosen.')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  click('Continue');
  await screen.findByTestId('import-labels');
  click('Next: check rows');
  await screen.findByTestId('import-rows');
  expect(checked(1) && checked(4) && checked(6)).toBe(true);
  expect(checked(2)).toBe(false);
  cleanup();
  mount({}, fixture);
  await screen.findByRole('heading', { name: 'Pick up where you left off?' });
  click('Start over');
  const ask = await screen.findByRole('dialog', { name: 'Start over?' });
  expect(within(ask).getByText("This import's review is removed from this phone. Records already saved stay saved.")).toBeTruthy();
  fireEvent.click(within(ask).getByRole('button', { name: 'Start over' }));
  await screen.findByRole('dialog', { name: 'What import does' });
  expect(await fixture.store.load()).toBeNull();
});

test('offline: opening without a connection says so and tries again; a read that fails keeps the import', async () => {
  const fixture = mount({ storeFailures: 1 });
  const offline = await screen.findByTestId('import-offline');
  expect(within(offline).getByText("Couldn't reach Jotbun. Import needs a connection; your import is kept on this phone.")).toBeTruthy();
  fireEvent.click(within(offline).getByRole('button', { name: 'Try again' }));
  await screen.findByRole('dialog', { name: 'What import does' });
  fixture.server.script('preview', { kind: 'network_before' });
  chooseFromSheet();
  const notice = await screen.findByTestId('import-offline');
  expect(screen.getByTestId('import-progress')).toBeTruthy();
  fireEvent.click(within(notice).getByRole('button', { name: 'Try again' }));
  await screen.findByTestId('import-labels');
});

// ---------------------------------------------------------------------------
// Looks, words and access

test('every control is at least 44 points, with a role and a name', async () => {
  await toRows();
  click('Select all');
  for (const element of [...screen.getAllByRole('button'), ...screen.getAllByRole('checkbox'), ...screen.getAllByRole('radio')]) {
    expect(Number.parseFloat(element.style.minHeight), element.getAttribute('aria-label') ?? element.textContent ?? '').toBeGreaterThanOrEqual(44);
    expect((element.getAttribute('aria-label') ?? element.textContent ?? '').trim()).not.toBe('');
  }
});

test('the bun is the box, decorative, and goes with the bun turned off', async () => {
  const fixture = importFixture();
  fixture.hold('preview');
  mount({}, fixture);
  await screen.findByRole('dialog');
  chooseFromSheet();
  await screen.findByLabelText('Read the file, In progress');
  expect(hiddenFromScreenReaders(screen.getByTestId('import-bun'))).toBe(true);
  cleanup();
  const quiet = importFixture();
  quiet.hold('preview');
  mount({ intensity: 'off' }, quiet);
  await screen.findByRole('dialog');
  chooseFromSheet();
  await screen.findByLabelText('Read the file, In progress');
  expect(screen.queryByTestId('import-bun')).toBeNull();
});

test('reduced motion: the expectation sheet appears without a spring', async () => {
  motion.reduced = true;
  const spring = vi.spyOn(Animated, 'spring');
  const timing = vi.spyOn(Animated, 'timing');
  await openStart();
  expect(spring).not.toHaveBeenCalled();
  expect(timing).not.toHaveBeenCalled();
  expect(screen.getByTestId('sheet-panel').style.transform).toBe('translateY(0px)');
});

test('the screen draws with palette tokens only, and keeps money out of floating point', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const files = [join(here, 'ImportScreen.tsx'), join(here, 'ImportParts.tsx'), join(here, 'ImportReviewParts.tsx'), join(here, '../../../spend/v1/redesign/import/importModel.ts')];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    expect(source, file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source, file).not.toMatch(/rgba?\(/);
    expect(source, file).not.toMatch(/parseFloat|parseInt|toFixed|Number\(|Math\.|keyboardType/);
  }
  for (const file of files.slice(0, 3)) expect(readFileSync(file, 'utf8'), file).toMatch(/useBunColors\(\)/);
});

test.each(MATRIX)('reads in $locale, $mode: the stage, the review rows, exact money, palette colours and Thai leading', async ({ locale, mode, colors }) => {
  const say = (english: string, values?: Record<string, string | number>) => translateCopy(english, locale, values);
  await toLabels({ locale, mode });
  expect(screen.getByTestId('import-screen').style.backgroundColor).toEqual(rgb(colors.background));
  expect(screen.getByTestId('stage-header').style.backgroundColor).toEqual(rgb(colors.stage));
  const title = screen.getByRole('heading', { name: say('Import') });
  expect(title.style.lineHeight).toBe(leading('title', locale));
  fireEvent.click(screen.getByRole('button', { name: say('Next: check rows') }));
  await screen.findByTestId('import-rows');
  fireEvent.click(screen.getByRole('button', { name: say('Select all') }));
  const total = screen.getByTestId('import-total');
  expect(within(total).getByText('฿290.50').style.lineHeight).toBe(leading('label', locale));
  expect(within(rowButton(1, locale)).getByText('Coffee').style.lineHeight).toBe(leading('body', locale));
  expect(within(rowButton(1, locale)).getByText('−฿65.00').style.color).toEqual(rgb(colors.ink));
  expect(screen.getByRole('button', { name: say('Continue') })).toBeTruthy();
  expectApprovedTextPairs(document.body, colors);
});

test.each(['light', 'dark'] as const)('%s: the expectation sheet, progress, frozen and result states use approved text pairs', async (mode) => {
  const colors = MATRIX.find((entry) => entry.mode === mode)!.colors;
  await openStart({ mode, rows: cleanRows(3) });
  expectApprovedTextPairs(sheet(), colors);
  cleanup();
  const held = importFixture();
  held.hold('preview');
  mount({ mode }, held);
  await screen.findByRole('dialog');
  chooseFromSheet();
  await screen.findByLabelText('Read the file, In progress');
  expectApprovedTextPairs(document.body, colors);
  cleanup();
  await toFrozen(3, { mode });
  expectApprovedTextPairs(document.body, colors);
  click('Save 3 records');
  await screen.findByTestId('import-result');
  expectApprovedTextPairs(document.body, colors);
});

test('Thai: the journey reads Thai, and money stays exact baht', async () => {
  await toLabels({ locale: 'th' });
  fireEvent.click(screen.getByRole('button', { name: translateCopy('Next: check rows', 'th') }));
  await screen.findByTestId('import-rows');
  // "Back" and "Continue" are the core's catalog words; the journey's own, such as "Select all", are in the catalogs too (R7, pending E2).
  for (const english of ['Back', 'Continue', 'Select all']) {
    expect(translateCopy(english, 'th')).not.toBe(english);
    expect(screen.getByRole('button', { name: translateCopy(english, 'th') })).toBeTruthy();
  }
  fireEvent.click(screen.getByRole('button', { name: translateCopy('Select all', 'th') }));
  expect(within(screen.getByTestId('import-total')).getByText('฿290.50')).toBeTruthy();
  expect(within(screen.getByTestId('import-total')).getByText('฿290.50').style.lineHeight).toBe(leading('label', 'th'));
});

// ---------------------------------------------------------------------------
// The catalogue's import sections (registered by the main session)

/** What each catalogue section must show once its script has run. */
const SECTION_SHOWS: Readonly<Record<string, (body: HTMLElement) => void>> = {
  'import-expectation': () => expect(screen.getByRole('dialog', { name: 'What import does' })).toBeTruthy(),
  'import-picking': (body) => expect(within(body).getByLabelText('Opening your files…')).toBeTruthy(),
  'import-uploads-off': (body) => expect(within(body).getByRole('heading', { name: "Import isn't switched on yet" })).toBeTruthy(),
  'import-uploading': (body) => expect(within(body).getByLabelText('Upload the file, In progress')).toBeTruthy(),
  'import-parsing': (body) => expect(within(body).getByLabelText('Read the file, In progress')).toBeTruthy(),
  'import-parse-waiting': (body) => expect(within(body).getByRole('button', { name: 'Check again' })).toBeTruthy(),
  'import-parse-failed': (body) => expect(within(body).getByLabelText('Read the file, Failed')).toBeTruthy(),
  'import-rejected': (body) => expect(within(body).getByText('The workbook has more than one sheet. Keep only the sheet to import.')).toBeTruthy(),
  'import-labels': (body) => expect(within(body).getByRole('button', { name: 'Cash, 4 rows, matched to Cash' })).toBeTruthy(),
  'import-review': (body) => expect(within(body).getByLabelText('Check this: Date unclear')).toBeTruthy(),
  'import-bulk': () => expect(screen.getByRole('dialog', { name: 'Set the type of 2 rows' })).toBeTruthy(),
  'import-duplicates': (body) => expect(within(body).getByLabelText('Note: Probably already in your diary')).toBeTruthy(),
  'import-frozen': (body) => expect(within(body).getByRole('heading', { name: 'Ready to save 5 records' })).toBeTruthy(),
  'import-confirming': (body) => expect(within(body).getByLabelText('Save the records, In progress, 0 of 5')).toBeTruthy(),
  'import-unconfirmed': (body) => expect(within(body).getByRole('button', { name: 'Try again' })).toBeTruthy(),
  'import-conflict': (body) => expect(within(body).getByLabelText("Couldn't save: 2")).toBeTruthy(),
  'import-done': (body) => expect(within(body).getByRole('heading', { name: 'Saved 5 records' })).toBeTruthy(),
  'import-resume': (body) => expect(within(body).getByText('6 rows to check, 3 chosen.')).toBeTruthy(),
  'import-offline': (body) => expect(within(body).getByText("Couldn't reach Jotbun. Import needs a connection; your import is kept on this phone.")).toBeTruthy(),
};

test('the catalogue has one import section per state, ids import-… and titles Import: …', () => {
  expect(IMPORT_SECTIONS.map((section) => section.id)).toEqual(Object.keys(SECTION_SHOWS));
  for (const section of IMPORT_SECTIONS) {
    expect(section.id).toMatch(/^import-[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(section.title).toMatch(/^Import: \S/);
    expect(section.group).toBe('Screens');
    expect(section.layout).toBe('screen');
  }
  expect(new Set(IMPORT_SECTIONS.map((section) => section.title)).size).toBe(IMPORT_SECTIONS.length);
  expect(SAMPLE_ROWS).toHaveLength(6);
});

test.each(IMPORT_SECTIONS.map((section) => [section.id, section] as const))('catalogue section %s reaches its state on fakes alone', async (id, section) => {
  const network = vi.spyOn(globalThis, 'fetch');
  const errors = vi.spyOn(console, 'error');
  mountInApp(<>{section.render()}</>);
  await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 20_000 });
  expect(screen.queryByTestId('catalogue-screen-stopped'), screen.queryByTestId('catalogue-screen-stopped')?.textContent ?? '').toBeNull();
  SECTION_SHOWS[id](screen.getByTestId('catalogue-screen-ready'));
  expect(network).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
  await settle();
}, 30_000);

// ---------------------------------------------------------------------------
// Text pairs (as the Wallets render test checks them)

function hexOf(css: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css.toUpperCase();
  const found = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(css);
  if (!found || (found[4] !== undefined && Number(found[4]) === 0)) return null;
  return `#${[found[1], found[2], found[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Every visible text is drawn in a palette pair BUN_TEXT_PAIRS approves, at 4.5:1 or more against the ground behind it. */
function expectApprovedTextPairs(root: ParentNode, colors: BunColors) {
  const tokens = (hex: string) => Object.entries(colors).filter(([, value]) => typeof value === 'string' && value.toUpperCase() === hex).map(([name]) => name);
  let count = 0;
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    const ownText = [...element.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '');
    if (!ownText || !element.style.color || hiddenFromScreenReaders(element)) continue;
    const fg = hexOf(element.style.color);
    let ground: string | null = null;
    for (let node: HTMLElement | null = element; node && !ground; node = node.parentElement) ground = node.style?.backgroundColor ? hexOf(node.style.backgroundColor) : null;
    expect(fg, element.textContent ?? '').not.toBeNull();
    expect(ground, element.textContent ?? '').not.toBeNull();
    const pairOk = BUN_TEXT_PAIRS.some(([text, on]) => tokens(fg as string).includes(text) && tokens(ground as string).includes(on));
    expect(pairOk, `${element.textContent}: ${fg} on ${ground}`).toBe(true);
    expect(contrastRatio(fg as string, ground as string), element.textContent ?? '').toBeGreaterThanOrEqual(4.5);
    count += 1;
  }
  expect(count).toBeGreaterThan(0);
}
