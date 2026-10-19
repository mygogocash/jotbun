// The import journey in each of its states (R7, development only), drawn by
// the real ImportScreen on fakes: the in-memory import server
// (spend/v1/testing/fakeImportServer), an in-memory draft store and a fake
// file picker. No network, no device storage, no real upload. Reached with the
// same steps as ImportScreen.render.test.tsx, which imports the fixtures here.
// Not registered yet: the main session adds IMPORT_SECTIONS to registry.tsx.
import type { ImportCandidate, ImportPreview } from '@gogospend/contracts';

import { V1Error } from '@mobile/api/client';
import { ImportScreen } from '@mobile/screens/redesign/import/ImportScreen';
import { awaitPreview, markReviewed, memoryDraftStore, newJourney, selectRows, startUpload } from '@mobile/spend/v1/importReview';
import type { ImportDeps, ImportJourney } from '@mobile/spend/v1/importReview';
import type { ImportFile, ImportResources } from '@mobile/spend/v1/imports';
import type { ImportPorts, PickedFile } from '@mobile/spend/v1/redesign/import/importModel';
import { JOB_ID, createFakeImportServer } from '@mobile/spend/v1/testing/fakeImportServer';
import type { CatalogueSection } from '../registry';
import { CATALOGUE_NOW, GOLDEN, goldenFake } from '../screenFixtures';
import type { FakeResources } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep, Translate } from '../screenSection';

// ---------------------------------------------------------------------------
// Fixtures (shared with ImportScreen.render.test.tsx)

export type FakeImportServer = ReturnType<typeof createFakeImportServer>;
type Method = keyof ImportResources;

const candidate = (ordinal: number, values: Partial<ImportCandidate>): ImportCandidate => ({
  source_row_id: `row:${ordinal + 1}`, ordinal, occurred_on: '2026-09-20', type: 'expense', amount_minor: '6500', wallet_label: 'Cash',
  category_label: 'Food & drink', merchant: null, note: null, review_required: false, ...values,
});

/**
 * A bank export of six rows: a coffee, noodles on an unclear date, a market
 * row with no type, the same coffee again, the September salary already in
 * the golden diary, and a BTS ride. Its labels are the file's own: "Cash",
 * "KBank", "Food & drink", "Transport", "Shopping" and "Pay".
 */
export const SAMPLE_ROWS: readonly ImportCandidate[] = [
  candidate(1, { merchant: 'Coffee' }),
  candidate(2, { occurred_on: null, amount_minor: '12050', merchant: 'Noodles', review_required: true }),
  candidate(3, { occurred_on: '2026-09-21', type: null, amount_minor: '50000', wallet_label: 'KBank', category_label: 'Shopping', merchant: 'Market', review_required: true }),
  candidate(4, { merchant: 'Coffee' }),
  candidate(5, { occurred_on: '2026-09-25', type: 'income', amount_minor: '2800000', wallet_label: 'KBank', category_label: 'Pay', note: 'September salary' }),
  candidate(6, { occurred_on: '2026-09-22', amount_minor: '4000', category_label: 'Transport', merchant: 'BTS' }),
];
export const SAMPLE_ISSUES: ImportPreview['issues'] = [
  { code: 'ambiguous_date', source_row_id: 'row:3', field: 'occurred_on' },
  { code: 'missing_type', source_row_id: 'row:4', field: 'type' },
];
export const SAMPLE_ADVICE: ImportPreview['duplicate_advice'] = [
  { source_row_id: 'row:2', kind: 'same_file', matches: ['row:5'] },
  { source_row_id: 'row:5', kind: 'same_file', matches: ['row:2'] },
  { source_row_id: 'row:6', kind: 'existing_transaction', matches: [GOLDEN.salaryId] },
];

/** `count` clean expense rows (Cash, "Food & drink"), with odd satang: ฿10.01, ฿20.02, … */
export function cleanRows(count: number): ImportCandidate[] {
  return Array.from({ length: count }, (_, i) => candidate(i + 1, { occurred_on: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, amount_minor: String(1001 * (i + 1)), merchant: `Shop ${i + 1}` }));
}

export const CSV_FILE: ImportFile = { name: 'kbank-september.csv', contentType: 'text/csv', bytes: new TextEncoder().encode('date,type,amount,wallet,category\n2026-09-20,expense,65.00,Cash,Food & drink\n') };

export type ImportFixtureOptions = {
  readonly rows?: readonly ImportCandidate[];
  readonly issues?: ImportPreview['issues'];
  readonly advice?: ImportPreview['duplicate_advice'];
  /** What each preview read answers before `ready` (default: one `parsing`). */
  readonly statuses?: ImportPreview['status'][];
  /** The server answers an upload with 404, as it does while IMPORT_UPLOADS_ENABLED is off. */
  readonly uploadsOff?: boolean;
  /** What the picker gives (default: the CSV). `hold`: the picker stays open. */
  readonly picked?: PickedFile | 'hold';
  /** A draft already kept on the phone. */
  readonly draft?: ImportJourney | null;
  /** Opening the draft store fails this many times first (offline). */
  readonly storeFailures?: number;
  readonly maxPolls?: number;
};

export type ImportFixture = ScreenFixture & {
  readonly ports: ImportPorts;
  readonly server: FakeImportServer;
  readonly store: ReturnType<typeof memoryDraftStore>;
  readonly fake: FakeResources;
  /** Calls of the picker. */
  readonly picks: () => number;
  /** Holds every call of `method` until the returned release is called. */
  readonly hold: (method: Method) => () => void;
  /** The deps the screen's journey uses, for preparing a draft. */
  readonly deps: () => ImportDeps;
};

const never = <T,>() => new Promise<T>(() => undefined);

export function importFixture(options: ImportFixtureOptions = {}): ImportFixture {
  const server = createFakeImportServer({ candidates: [...(options.rows ?? SAMPLE_ROWS)], statuses: options.statuses ?? ['parsing', 'ready'] });
  const store = memoryDraftStore(options.draft ?? null);
  const fake = goldenFake();
  const gates = new Map<Method, Promise<void>>();
  let picks = 0;
  let storeFailures = options.storeFailures ?? 0;
  const gated = <A extends unknown[], R>(method: Method, call: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => {
    const gate = gates.get(method);
    if (gate) await gate;
    return call(...args);
  };
  const base = server.resources;
  const resources: ImportResources = {
    upload: gated('upload', async (file, key) => {
      if (options.uploadsOff) {
        // Recorded like any upload; the route is not there while IMPORT_UPLOADS_ENABLED is off.
        server.calls.push({ method: 'upload', key, body: { name: file.name, contentType: file.contentType, bytes: file.bytes.length } });
        throw new V1Error('not_found', 404, 'NOT_FOUND');
      }
      return base.upload(file, key);
    }),
    status: gated('status', (jobId) => base.status(jobId)),
    preview: gated('preview', async (jobId, paging) => {
      const preview = await base.preview(jobId, paging);
      if (preview.status === 'ready') return { ...preview, issues: options.issues ?? SAMPLE_ISSUES, duplicate_advice: options.advice ?? SAMPLE_ADVICE };
      return preview.status === 'rejected' ? { ...preview, issues: options.issues ?? [] } : preview;
    }),
    patchRows: gated('patchRows', (...args) => base.patchRows(...args)),
    freeze: gated('freeze', (...args) => base.freeze(...args)),
    confirm: gated('confirm', (...args) => base.confirm(...args)),
    selectionProgress: gated('selectionProgress', (...args) => base.selectionProgress(...args)),
  };
  const newId = () => globalThis.crypto.randomUUID();
  const ports: ImportPorts = {
    resources,
    newId,
    pollMs: 1,
    maxPolls: options.maxPolls ?? 5,
    async openDraftStore() {
      if (storeFailures > 0) {
        storeFailures -= 1;
        throw new V1Error('network', 0, 'NETWORK_ERROR');
      }
      return store;
    },
    async pickFile() {
      picks += 1;
      if (options.picked === 'hold') return never<PickedFile>();
      return options.picked ?? { ok: true, file: CSV_FILE };
    },
  };
  return {
    resources: fake.resources,
    diary: null,
    ports,
    server,
    store,
    fake,
    picks: () => picks,
    hold(method) {
      let release = () => undefined as void;
      gates.set(method, new Promise<void>((resolve) => { release = resolve; }));
      return () => {
        gates.delete(method);
        release();
      };
    },
    deps: () => ({ resources, store, newId, pollMs: 1, maxPolls: 5 }),
  };
}

/** A review draft kept on the phone: the sample file uploaded and read, three rows chosen and checked. */
export async function keepReviewDraft(fixture: ImportFixture): Promise<ImportJourney> {
  const deps = fixture.deps();
  let journey = await startUpload(newJourney(), CSV_FILE, deps);
  journey = await awaitPreview(journey, deps);
  journey = markReviewed(selectRows(journey, ['row:2', 'row:5', 'row:7'], true), ['row:2', 'row:5', 'row:7']);
  await fixture.store.save(journey);
  return journey;
}

// ---------------------------------------------------------------------------
// Script steps

/** From the expectation sheet to the label step. */
const toLabels = (tc: Translate): ScriptStep[] => [{ waitFor: tc('Nothing is saved until you confirm.') }, { press: tc('Choose a file') }, { waitFor: 'import-labels' }];

/** Matches the sample file's labels: Cash, KBank, Food & drink, Transport and Pay. */
const matchSample = (tc: Translate): ScriptStep[] => [
  ...match(tc, 'Cash', 4, GOLDEN.cash.name),
  ...match(tc, 'KBank', 2, GOLDEN.daily.name),
  ...match(tc, 'Food & drink', 3, tc('Food')),
  ...match(tc, 'Transport', 1, tc('Travel')),
  ...match(tc, 'Pay', 1, tc('Salary')),
];
/** Matches the clean file's labels: Cash and Food & drink. */
const matchClean = (tc: Translate, rows: number): ScriptStep[] => [...match(tc, 'Cash', rows, GOLDEN.cash.name), ...match(tc, 'Food & drink', rows, tc('Food'))];

function match(tc: Translate, label: string, rows: number, choice: string): ScriptStep[] {
  const unmatched = rows === 1 ? tc('{label}, 1 row, not matched yet', { label }) : tc('{label}, {rows} rows, not matched yet', { label, rows });
  const matched = rows === 1 ? tc('{label}, 1 row, matched to {name}', { label, name: choice }) : tc('{label}, {rows} rows, matched to {name}', { label, rows, name: choice });
  return [{ press: unmatched }, { press: choice }, { waitFor: matched }];
}

const toRows = (tc: Translate): ScriptStep[] => [{ press: tc('Next: check rows') }, { waitFor: 'import-rows' }];

/** The clean file of `rows` rows, matched, chosen, checked and frozen: "Ready to save". */
const toFrozen = (tc: Translate, rows: number): ScriptStep[] => [
  ...toLabels(tc),
  ...matchClean(tc, rows),
  ...toRows(tc),
  { press: tc('Select all') },
  { press: tc('Mark as checked') },
  { press: tc('Continue') },
  { waitFor: tc('Ready to save {count} records', { count: rows }) },
];

const screen = (fixture: ImportFixture) => <ImportScreen ports={fixture.ports} now={CATALOGUE_NOW} />;

export const IMPORT_SECTIONS: CatalogueSection[] = [
  screenSection({
    id: 'import-expectation',
    title: 'Import: expectation',
    fixture: () => importFixture(),
    script: (tc) => [{ waitFor: tc('Nothing is saved until you confirm.') }],
    render: screen,
  }),
  screenSection({
    id: 'import-picking',
    title: 'Import: picking a file',
    // The system picker stays open.
    fixture: () => importFixture({ picked: 'hold' }),
    script: (tc) => [{ press: tc('Choose a file') }, { waitFor: tc('Opening your files…') }],
    render: screen,
  }),
  screenSection({
    id: 'import-uploads-off',
    title: 'Import: uploads off',
    // IMPORT_UPLOADS_ENABLED is off: the server answers 404.
    fixture: () => importFixture({ uploadsOff: true }),
    script: (tc) => [{ press: tc('Choose a file') }, { waitFor: tc("Import isn't switched on yet") }],
    render: screen,
  }),
  screenSection({
    id: 'import-uploading',
    title: 'Import: uploading',
    fixture: () => {
      const fixture = importFixture();
      fixture.hold('upload');
      return fixture;
    },
    script: (tc) => [{ press: tc('Choose a file') }, { waitFor: 'import-progress' }],
    render: screen,
  }),
  screenSection({
    id: 'import-parsing',
    title: 'Import: reading the file',
    // Uploaded; the first read of the preview is held.
    fixture: () => {
      const fixture = importFixture();
      fixture.hold('preview');
      return fixture;
    },
    script: (tc) => [{ press: tc('Choose a file') }, { waitFor: tc('Read the file, In progress') }],
    render: screen,
  }),
  screenSection({
    id: 'import-parse-waiting',
    title: 'Import: still waiting to be read',
    // Today's Node 24 server: the parser can't be sandboxed, so no worker claims the file and it stays queued.
    fixture: () => importFixture({ statuses: Array.from({ length: 40 }, () => 'queued' as const), maxPolls: 2 }),
    script: (tc) => [{ press: tc('Choose a file') }, { waitFor: tc('Check again') }],
    render: screen,
  }),
  screenSection({
    id: 'import-parse-failed',
    title: 'Import: reading failed',
    // The parse job failed (the reader could not run): no preview.
    fixture: () => importFixture({ statuses: ['failed'] }),
    script: (tc) => [{ press: tc('Choose a file') }, { waitFor: 'import-parse-failed' }],
    render: screen,
  }),
  screenSection({
    id: 'import-rejected',
    title: 'Import: file rejected',
    fixture: () => importFixture({ statuses: ['rejected'], issues: [{ code: 'formulas', source_row_id: null, field: null }, { code: 'multiple_worksheets', source_row_id: null, field: null }] }),
    script: (tc) => [{ press: tc('Choose a file') }, { waitFor: 'import-rejected' }],
    render: screen,
  }),
  screenSection({
    id: 'import-labels',
    title: 'Import: label mapping',
    fixture: () => importFixture(),
    script: (tc) => [...toLabels(tc), ...match(tc, 'Cash', 4, GOLDEN.cash.name)],
    render: screen,
  }),
  screenSection({
    id: 'import-review',
    title: 'Import: review with flags',
    fixture: () => importFixture(),
    script: (tc) => [...toLabels(tc), ...matchSample(tc), ...toRows(tc)],
    render: screen,
  }),
  screenSection({
    id: 'import-bulk',
    title: 'Import: bulk fix',
    // Market (no type) and BTS chosen; the type sheet is open.
    fixture: () => importFixture(),
    script: (tc) => [
      ...toLabels(tc),
      ...matchSample(tc),
      ...toRows(tc),
      { press: tc('Choose row {row}', { row: 3 }) },
      { press: tc('Choose row {row}', { row: 6 }) },
      { press: tc('Set type') },
      { waitFor: tc('Set the type of {count} rows', { count: 2 }) },
    ],
    render: screen,
  }),
  screenSection({
    id: 'import-duplicates',
    title: 'Import: duplicates',
    fixture: () => importFixture(),
    script: (tc) => [...toLabels(tc), ...toRows(tc), { press: tc('Select all') }, { press: tc('Probably duplicates ({count})', { count: 3 }) }, { waitFor: tc('Choose row {row}', { row: 4 }) }],
    render: screen,
  }),
  screenSection({
    id: 'import-frozen',
    title: 'Import: ready to save',
    fixture: () => importFixture({ rows: cleanRows(5) }),
    script: (tc) => toFrozen(tc, 5),
    render: screen,
  }),
  screenSection({
    id: 'import-confirming',
    title: 'Import: saving in batches',
    fixture: () => importFixture({ rows: cleanRows(5) }),
    script: (tc, fixture: ImportFixture) => [...toFrozen(tc, 5), { run: () => { fixture.hold('confirm'); } }, { press: tc('Save {count} records', { count: 5 }) }, { waitFor: tc('Save the records, In progress, {count}', { count: tc('{done} of {total}', { done: '0', total: '5' }) }) }],
    render: screen,
  }),
  screenSection({
    id: 'import-unconfirmed',
    title: 'Import: unconfirmed batch',
    // The batch committed but its answer was lost: Try again resends the same request.
    fixture: () => {
      const fixture = importFixture({ rows: cleanRows(5) });
      fixture.server.script('confirm', { kind: 'network_after' });
      return fixture;
    },
    script: (tc) => [...toFrozen(tc, 5), { press: tc('Save {count} records', { count: 5 }) }, { waitFor: 'import-unconfirmed' }],
    render: screen,
  }),
  screenSection({
    id: 'import-conflict',
    title: 'Import: partial conflict result',
    // Two rows' category is archived after the freeze: Jotbun saves the others and reports those two.
    fixture: () => importFixture({ rows: cleanRows(5) }),
    script: (tc, fixture: ImportFixture) => [
      ...toFrozen(tc, 5),
      { run: () => fixture.server.blockRows(['row:3', 'row:5']) },
      { press: tc('Save {count} records', { count: 5 }) },
      { waitFor: 'import-result' },
    ],
    render: screen,
  }),
  screenSection({
    id: 'import-done',
    title: 'Import: done',
    fixture: () => importFixture({ rows: cleanRows(5) }),
    script: (tc) => [...toFrozen(tc, 5), { press: tc('Save {count} records', { count: 5 }) }, { waitFor: 'import-result' }],
    render: screen,
  }),
  screenSection({
    id: 'import-resume',
    title: 'Import: resume from a draft',
    fixture: (): ImportFixture => {
      const fixture = importFixture();
      return { ...fixture, prepare: async () => { await keepReviewDraft(fixture); } };
    },
    script: (tc) => [{ waitFor: tc('Pick up where you left off?') }],
    render: screen,
  }),
  screenSection({
    id: 'import-offline',
    title: 'Import: offline',
    // Jotbun can't be reached while the file is being read.
    fixture: () => {
      const fixture = importFixture();
      fixture.server.script('preview', { kind: 'network_before' });
      return fixture;
    },
    script: (tc) => [{ press: tc('Choose a file') }, { waitFor: 'import-offline' }],
    render: screen,
  }),
];

/** The job the fixtures' uploads create. */
export const IMPORT_JOB_ID = JOB_ID;
