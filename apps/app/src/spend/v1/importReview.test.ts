import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { V1Error, createV1Transport } from '../../api/client.ts';
import type { V1Credentials } from '../../api/client.ts';
import {
  awaitPreview,
  chooseReceipt,
  confirmBatches,
  discardImport,
  editRow,
  freezeSelection,
  mapCategory,
  mapWallet,
  markReviewed,
  memoryDraftStore,
  newJourney,
  progressCounts,
  receiptImage,
  reloadPreview,
  resumeImport,
  reviewBlockers,
  rowView,
  saveCorrections,
  selectRows,
  startUpload,
} from './importReview.ts';
import type { ImportDeps, ImportJourney } from './importReview.ts';
import { createImportResources } from './imports.ts';
import type { ImportFile } from './imports.ts';
import { JOB_ID, RECEIPT_ID, createFakeImportServer, syntheticCandidates } from './testing/fakeImportServer.ts';

const CASH = '0000000a-0000-4000-8000-000000000001';
const BANK = '0000000a-0000-4000-8000-000000000002';
const FOOD = '0000000c-0000-4000-8000-000000000001';
const SALARY = '0000000c-0000-4000-8000-000000000004';
const FILE: ImportFile = { bytes: new TextEncoder().encode('date,amount\n2026-01-02,65\n'), contentType: 'text/csv', name: 'กสิกร statement.csv' };

let idSequence = 0;
const newId = () => {
  idSequence += 1;
  return `11111111-0000-4000-8000-${idSequence.toString(16).padStart(12, '0')}`;
};

function setup(count: number, options: { note?: (i: number) => string | null; statuses?: ('queued' | 'parsing' | 'ready')[]; groupBudgetBytes?: number } = {}) {
  const server = createFakeImportServer({ candidates: syntheticCandidates(count, options.note), statuses: options.statuses ?? ['ready'], groupBudgetBytes: options.groupBudgetBytes });
  const store = memoryDraftStore();
  const deps: ImportDeps = { resources: server.resources, store, newId, sleep: async () => undefined, pollMs: 1, maxPolls: 5 };
  return { server, store, deps };
}

/** Upload, parse, select every row, review every field and map every label. */
async function reviewedJourney(deps: ImportDeps): Promise<ImportJourney> {
  let journey = await startUpload(newJourney(), FILE, deps);
  journey = await awaitPreview(journey, deps);
  const all = (journey.preview?.candidates ?? []).map((row) => row.source_row_id);
  journey = selectRows(journey, all, true);
  journey = markReviewed(journey, all);
  journey = mapWallet(journey, 'Cash', CASH);
  journey = mapWallet(journey, 'Bank', BANK);
  journey = mapCategory(journey, 'expense', 'food', FOOD);
  return mapCategory(journey, 'income', 'salary', SALARY);
}

const ids = (count: number, from = 0) => Array.from({ length: count }, (_, i) => `row:${from + i + 2}`);

beforeEach(() => {
  idSequence = 0;
});

describe('upload, parsing and review', () => {
  test('parsing succeeded never means saved: the journey waits in review with nothing committed', async () => {
    const { server, store, deps } = setup(6, { statuses: ['queued', 'parsing', 'ready'] });
    let journey = await startUpload(newJourney(), FILE, deps);
    assert.equal(journey.stage, 'parsing');
    assert.equal(journey.jobId, JOB_ID);
    journey = await awaitPreview(journey, deps);
    assert.equal(journey.stage, 'review');
    assert.equal(journey.reviewRevision, '1');
    assert.deepEqual(progressCounts(journey), { selected: 0, committed: 0, remaining: 0, conflicted: 0 });
    assert.equal(server.transactions().length, 0);
    assert.equal(server.callsOf('preview').length, 3);
    // Nothing is selected for the user: every row must be chosen explicitly.
    assert.deepEqual(reviewBlockers(journey), [{ source_row_id: null, reason: 'nothing_selected' }]);
    assert.equal((await store.load())?.stage, 'review');
  });

  test('a lost upload response resends the same file under the same key', async () => {
    const { server, deps } = setup(2);
    server.script('upload', { kind: 'network_after' });
    let journey = await startUpload(newJourney(), FILE, deps);
    assert.equal(journey.problem?.kind, 'unconfirmed');
    assert.ok(journey.pendingUpload);
    journey = await startUpload(journey, FILE, deps);
    assert.equal(journey.stage, 'parsing');
    const [first, second] = server.callsOf('upload');
    assert.equal(second.key, first.key);
  });

  test('freezing needs explicit row, direction, date, category and wallet review, and every label mapped', async () => {
    const { server, deps } = setup(4);
    let journey = await awaitPreview(await startUpload(newJourney(), FILE, deps), deps);
    journey = selectRows(journey, ['row:2', 'row:5'], true);
    assert.deepEqual(reviewBlockers(journey), [
      { source_row_id: 'row:2', reason: 'unreviewed', fields: ['date', 'type', 'category', 'wallet'] },
      { source_row_id: 'row:5', reason: 'unreviewed', fields: ['date', 'type', 'category', 'wallet'] },
    ]);
    journey = markReviewed(journey, ['row:2', 'row:5'], ['date', 'type']);
    journey = markReviewed(journey, ['row:2'], ['category', 'wallet']);
    assert.deepEqual(reviewBlockers(journey), [
      { source_row_id: 'row:2', reason: 'wallet_unmapped' },
      { source_row_id: 'row:5', reason: 'unreviewed', fields: ['category', 'wallet'] },
    ]);
    const refused = await freezeSelection(journey, deps);
    assert.equal(refused.selection, null);
    assert.equal(server.callsOf('freeze').length, 0);
    journey = markReviewed(journey, ['row:5'], ['category', 'wallet']);
    journey = mapWallet(mapWallet(journey, 'Cash', CASH), 'Bank', BANK);
    journey = mapCategory(journey, 'expense', 'food', FOOD);
    assert.deepEqual(reviewBlockers(journey), [{ source_row_id: 'row:5', reason: 'category_unmapped' }]);
    journey = mapCategory(journey, 'income', 'salary', SALARY);
    assert.deepEqual(reviewBlockers(journey), []);
    journey = await freezeSelection(journey, deps);
    assert.equal(journey.stage, 'confirming');
    // The frozen request names only what the selected rows use.
    assert.deepEqual(server.callsOf('freeze')[0].body, {
      review_revision: '1', selected_row_ids: ['row:2', 'row:5'],
      mapping: { wallets: { Cash: CASH, Bank: BANK }, categories: { expense: { food: FOOD }, income: { salary: SALARY } } },
    });
    assert.equal(server.transactions().length, 0);
  });

  test('a transfer row cannot be selected for saving; changing its direction is an explicit correction', async () => {
    const { deps } = setup(2);
    let journey = await awaitPreview(await startUpload(newJourney(), FILE, deps), deps);
    journey = editRow(journey, 'row:2', { type: 'transfer' });
    journey = markReviewed(selectRows(journey, ['row:2'], true), ['row:2']);
    journey = mapCategory(mapWallet(journey, 'Cash', CASH), 'expense', 'food', FOOD);
    assert.deepEqual(reviewBlockers(journey), [{ source_row_id: null, reason: 'unsaved_corrections' }, { source_row_id: 'row:2', reason: 'transfer' }]);
    journey = editRow(journey, 'row:2', { type: 'expense' });
    assert.equal(rowView(journey, 'row:2')?.type, 'expense');
  });
});

describe('corrections', () => {
  test('are saved in commands of at most 500 rows against the current revision, and a lost response resends the same command', async () => {
    const { server, store, deps } = setup(1_100);
    let journey = await awaitPreview(await startUpload(newJourney(), FILE, deps), deps);
    for (const id of ids(1_100)) journey = editRow(journey, id, { note: `checked ${id}` });
    server.script('patchRows', { kind: 'network_before' }, { kind: 'network_after' });
    journey = await saveCorrections(journey, deps);
    assert.equal(journey.problem?.kind, 'unconfirmed');
    assert.ok((await store.load())?.pendingPatch);
    journey = await saveCorrections(journey, deps);
    assert.equal(journey.problem?.kind, 'unconfirmed');
    journey = await saveCorrections(journey, deps);
    assert.equal(journey.problem, null);
    assert.equal(journey.reviewRevision, '4');
    assert.deepEqual(journey.edits, {});
    const calls = server.callsOf('patchRows');
    // Not sent, committed but lost, replayed: the same command three times; then the rest.
    assert.deepEqual(calls.map((call) => [call.revision, (call.body as unknown[]).length]), [['1', 500], ['1', 500], ['1', 500], ['2', 500], ['3', 100]]);
    assert.equal(calls[1].key, calls[0].key);
    assert.equal(calls[2].key, calls[0].key);
    assert.deepEqual(calls[2].body, calls[0].body);
    assert.equal(new Set(calls.map((call) => call.key)).size, 3);
    assert.equal(rowView(journey, 'row:2')?.note, 'checked row:2');
    assert.equal(server.transactions().length, 0);
  });

  test('a correction against a revision another device moved keeps the edits and asks for a reload', async () => {
    const { server, deps } = setup(3);
    let journey = await awaitPreview(await startUpload(newJourney(), FILE, deps), deps);
    journey = editRow(journey, 'row:3', { occurred_on: '2026-02-02' });
    server.bumpRevision();
    journey = await saveCorrections(journey, deps);
    assert.equal(journey.problem?.kind, 'review_changed');
    assert.deepEqual(journey.edits, { 'row:3': { occurred_on: '2026-02-02' } });
    journey = await reloadPreview(journey, deps);
    assert.equal(journey.reviewRevision, '2');
    journey = await saveCorrections(journey, deps);
    assert.equal(journey.problem, null);
    assert.equal(journey.reviewRevision, '3');
  });
});

describe('confirmation', () => {
  test('freezes the full selection once, and later batches confirm against the same selection', async () => {
    const { server, store, deps } = setup(1_200);
    let journey = await freezeSelection(await reviewedJourney(deps), deps);
    assert.deepEqual(server.callsOf('freeze').map((call) => (call.body as { selected_row_ids: string[] }).selected_row_ids.length), [1_200]);
    journey = await confirmBatches(journey, deps);
    assert.equal(journey.stage, 'done');
    const batches = server.callsOf('confirm').map((call) => call.body as { selection_id: string; frozen_revision: string; batch_row_ids: string[] });
    assert.deepEqual(batches.map((batch) => batch.batch_row_ids.length), [500, 500, 200]);
    assert.equal(new Set(batches.map((batch) => batch.selection_id)).size, 1);
    assert.equal(batches[0].selection_id, journey.selection?.id);
    assert.ok(batches.every((batch) => batch.frozen_revision === '1'));
    assert.equal(new Set(server.callsOf('confirm').map((call) => call.key)).size, 3);
    assert.deepEqual(progressCounts(journey), { selected: 1_200, committed: 1_200, remaining: 0, conflicted: 0 });
    assert.equal(server.transactions().length, 1_200);
    // The outcome is known: the draft is no longer kept.
    assert.equal(await store.load(), null);
  });

  test('a lost confirmation response keeps the review and resends the same key and body', async () => {
    const { server, store, deps } = setup(1_000);
    let journey = await freezeSelection(await reviewedJourney(deps), deps);
    server.script('confirm', { kind: 'network_after' }, { kind: 'network_before' });
    journey = await confirmBatches(journey, deps);
    assert.equal(journey.stage, 'confirming');
    assert.equal(journey.problem?.kind, 'unconfirmed');
    assert.deepEqual(progressCounts(journey), { selected: 1_000, committed: 0, remaining: 1_000, conflicted: 0 });
    const saved = await store.load();
    assert.deepEqual(saved?.pendingBatch, journey.pendingBatch);
    assert.deepEqual(saved?.selected.length, 1_000);
    journey = await confirmBatches(journey, deps);
    assert.equal(journey.problem?.kind, 'unconfirmed');
    journey = await confirmBatches(journey, deps);
    assert.equal(journey.stage, 'done');
    const calls = server.callsOf('confirm');
    assert.equal(calls[1].key, calls[0].key);
    assert.deepEqual(calls[1].body, calls[0].body);
    assert.equal(calls[2].key, calls[0].key);
    assert.equal(server.transactions().length, 1_000);
    assert.equal(new Set(server.transactions().map((record) => record.source_row_id)).size, 1_000);
  });

  test('a proven COMMAND_TOO_LARGE splits the batch, with new command ids, and saves every row once', async () => {
    const note = (i: number) => `${'💸'.repeat(498)}${String(i % 100).padStart(2, '0')}`;
    const { server, deps } = setup(500, { note, groupBudgetBytes: 1024 * 1024 });
    let journey = await freezeSelection(await reviewedJourney(deps), deps);
    journey = await confirmBatches(journey, deps);
    assert.equal(journey.stage, 'done');
    const calls = server.callsOf('confirm');
    assert.deepEqual(calls.map((call) => (call.body as { batch_row_ids: string[] }).batch_row_ids.length), [500, 250, 250]);
    assert.equal(new Set(calls.map((call) => call.key)).size, 3);
    assert.equal(server.transactions().length, 500);
  });

  test('an unknown outcome is resolved with the original key and body before any split', async () => {
    const note = () => '💸'.repeat(500);
    const { server, deps } = setup(500, { note, groupBudgetBytes: 1024 * 1024 });
    let journey = await freezeSelection(await reviewedJourney(deps), deps);
    server.script('confirm', { kind: 'network_before' });
    journey = await confirmBatches(journey, deps);
    assert.equal(journey.problem?.kind, 'unconfirmed');
    journey = await confirmBatches(journey, deps);
    assert.equal(journey.stage, 'done');
    const calls = server.callsOf('confirm');
    assert.equal(calls[1].key, calls[0].key);
    assert.deepEqual(calls[1].body, calls[0].body);
    assert.ok(calls.slice(2).every((call) => call.key !== calls[0].key));
    assert.equal(server.transactions().length, 500);
  });

  test('overlapping retries acknowledge rows another attempt committed and continue the untouched ones', async () => {
    const { server, deps } = setup(900);
    let journey = await freezeSelection(await reviewedJourney(deps), deps);
    server.commitElsewhere(journey.selection?.id as string, ids(300, 200));
    journey = await confirmBatches(journey, deps);
    assert.equal(journey.stage, 'done');
    assert.deepEqual(progressCounts(journey), { selected: 900, committed: 900, remaining: 0, conflicted: 0 });
    assert.equal(server.transactions().length, 900);
    assert.equal(new Set(server.transactions().map((record) => record.source_row_id)).size, 900);
  });

  test('conflicted rows are reported and never resent; the rest are saved', async () => {
    const { server, store, deps } = setup(600);
    let journey = await freezeSelection(await reviewedJourney(deps), deps);
    server.blockRows(ids(10, 100));
    journey = await confirmBatches(journey, deps);
    assert.equal(journey.stage, 'done');
    assert.deepEqual(progressCounts(journey), { selected: 600, committed: 590, remaining: 0, conflicted: 10 });
    assert.deepEqual(journey.conflicted, ids(10, 100));
    assert.deepEqual(server.callsOf('confirm').map((call) => (call.body as { batch_row_ids: string[] }).batch_row_ids.length), [500, 100]);
    assert.equal(server.transactions().length, 590);
    assert.equal(await store.load(), null);
  });

  test('after a restart, the saved draft resumes and resolves the pending batch first', async () => {
    const { server, store, deps } = setup(700);
    let journey = await freezeSelection(await reviewedJourney(deps), deps);
    server.script('confirm', { kind: 'network_after' });
    journey = await confirmBatches(journey, deps);
    const pending = journey.pendingBatch;
    assert.ok(pending);
    const resumed = await resumeImport({ ...deps, store });
    assert.deepEqual(resumed?.pendingBatch, pending);
    journey = await confirmBatches(resumed as ImportJourney, deps);
    assert.equal(journey.stage, 'done');
    assert.equal(server.callsOf('confirm')[1].key, pending.key);
    assert.equal(server.transactions().length, 700);
  });

  test('a corrected preview needs a new selection: the review is kept and committed rows are acknowledged', async () => {
    const { server, deps } = setup(800);
    let journey = await freezeSelection(await reviewedJourney(deps), deps);
    const first = journey.selection?.id;
    journey = await confirmBatches(journey, deps, { maxBatches: 1 });
    assert.deepEqual(progressCounts(journey), { selected: 800, committed: 500, remaining: 300, conflicted: 0 });
    server.bumpRevision();
    journey = await confirmBatches(journey, deps);
    assert.equal(journey.problem?.kind, 'selection_conflict');
    assert.equal(journey.stage, 'review');
    assert.equal(journey.selection, null);
    assert.equal(journey.selected.length, 800);
    assert.equal(Object.keys(journey.reviewed).length, 800);
    journey = await reloadPreview(journey, deps);
    journey = await freezeSelection(journey, deps);
    assert.notEqual(journey.selection?.id, first);
    journey = await confirmBatches(journey, deps);
    assert.equal(journey.stage, 'done');
    assert.equal(server.transactions().length, 800);
    assert.deepEqual(progressCounts(journey), { selected: 800, committed: 800, remaining: 0, conflicted: 0 });
  });

  test('discarding clears the kept draft', async () => {
    const { store, deps } = setup(2);
    await reviewedJourney(deps);
    assert.ok(await store.load());
    await discardImport(deps);
    assert.equal(await store.load(), null);
  });
});

describe('a receipt photo (P2c)', () => {
  /** A receipt import: its one row, corrected and checked, with its labels mapped. */
  async function receiptJourney() {
    const server = createFakeImportServer({ candidates: [{ source_row_id: 'image:1', ordinal: 1, occurred_on: null, type: null, amount_minor: null, wallet_label: null, category_label: null, merchant: null, note: null, review_required: true }], receiptImage: true });
    const store = memoryDraftStore();
    const deps: ImportDeps = { resources: server.resources, store, newId, sleep: async () => undefined, pollMs: 1, maxPolls: 5 };
    let journey = await awaitPreview(await startUpload(newJourney(), FILE, deps), deps);
    journey = editRow(journey, 'image:1', { occurred_on: '2026-03-03', type: 'expense', amount_minor: '6500', wallet_label: 'Cash', category_label: 'food' });
    journey = await saveCorrections(journey, deps);
    journey = markReviewed(selectRows(journey, ['image:1'], true), ['image:1']);
    journey = mapCategory(mapWallet(journey, 'Cash', CASH), 'expense', 'food', FOOD);
    return { server, deps, journey: await freezeSelection(journey, deps) };
  }

  test('the image is kept with its record only when the user chose to keep it', async () => {
    const { server, deps, journey } = await receiptJourney();
    assert.equal(journey.keepReceipt, false);
    assert.deepEqual(receiptImage(journey), { attachment_id: RECEIPT_ID, attachable_until: '2026-10-19T02:58:00.000Z' });
    const kept = await confirmBatches(chooseReceipt(journey, true), deps);
    assert.equal(kept.stage, 'done');
    assert.deepEqual(server.callsOf('confirm').map((call) => (call.body as { receipt?: unknown }).receipt), [{ attachment_id: RECEIPT_ID, consent: 'retain_receipt' }]);
    assert.equal(server.keptReceipts().size, 1);
  });

  test('without the choice no receipt is sent', async () => {
    const { server, deps, journey } = await receiptJourney();
    assert.equal((await confirmBatches(journey, deps)).stage, 'done');
    assert.equal((server.callsOf('confirm')[0].body as { receipt?: unknown }).receipt, undefined);
    assert.equal(server.keptReceipts().size, 0);
  });

  test('a receipt that can no longer be kept saves nothing; the record can then be saved without it, as a new command', async () => {
    const { server, deps, journey } = await receiptJourney();
    server.expireReceipt();
    let current = await confirmBatches(chooseReceipt(journey, true), deps);
    assert.equal(current.problem?.kind, 'receipt_unavailable');
    assert.equal(current.pendingBatch, null);
    assert.equal(server.transactions().length, 0);
    current = await confirmBatches(chooseReceipt(current, false), deps);
    assert.equal(current.stage, 'done');
    const [first, second] = server.callsOf('confirm');
    assert.notEqual(second.key, first.key);
    assert.equal((second.body as { receipt?: unknown }).receipt, undefined);
    assert.equal(server.transactions().length, 1);
  });
});

describe('the import port on the wire', () => {
  type Seen = { method: string; url: string; headers: IncomingHttpHeaders; body: Buffer };
  let baseUrl = '';
  let seen: Seen[] = [];
  let replies: { status: number; body: unknown }[] = [];
  const http = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) });
    const reply = replies.shift() ?? { status: 500, body: { code: 'INTERNAL_ERROR' } };
    res.writeHead(reply.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
  const credentials: V1Credentials = { getAccessToken: async () => 'access-token', getSessionSnapshot: () => ({ binding: 'b'.repeat(43), epoch: 1 }) };
  const port = () => createImportResources(createV1Transport({ baseUrl, credentials, client: { platform: 'ios', version: '1.2.3' }, timeoutMs: 2_000 }));
  const KEY = '22222222-0000-4000-8000-000000000001';
  const SELECTION = '33333333-0000-4000-8000-000000000001';
  const ack = (entity: string, outcome: string, version = 2) => ({ command_id: KEY, entity_id: entity, version, committed_revision: '41', outcome, entity_state: 'active' });

  before(async () => {
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    assert.ok(address && typeof address !== 'string');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  after(() => new Promise<void>((resolve) => http.close(() => resolve())));
  beforeEach(() => {
    seen = [];
    replies = [];
  });

  test('an upload sends the raw file with its type, encoded name and command key', async () => {
    replies.push({ status: 202, body: { job_id: JOB_ID, status: 'queued', format: 'csv', file_name: FILE.name, bytes: FILE.bytes.length, received_at: '2026-10-18T03:00:00.000Z', expires_at: '2026-10-19T03:00:00.000Z' } });
    await port().upload(FILE, KEY);
    const [sent] = seen;
    assert.equal(sent.url, '/v1/imports');
    assert.equal(sent.headers['content-type'], 'text/csv');
    assert.equal(sent.headers['x-gogospend-file-name'], encodeURIComponent(FILE.name));
    assert.equal(sent.headers['idempotency-key'], KEY);
    assert.deepEqual(new Uint8Array(sent.body), FILE.bytes);
  });

  test('corrections carry the review revision as If-Match; confirmation results are checked exactly', async () => {
    replies.push({ status: 200, body: { ack: ack(JOB_ID, 'updated', 1), review_revision: '2' } });
    assert.equal((await port().patchRows(JOB_ID, '1', [{ source_row_id: 'row:2', note: 'x' }], KEY)).review_revision, '2');
    assert.equal(seen[0].headers['if-match'], '"1"');
    assert.equal(seen[0].method, 'PATCH');
    const batch = { selection_id: SELECTION, frozen_revision: '1', batch_row_ids: ['row:2', 'row:3'] };
    replies.push({ status: 200, body: { ack: ack(SELECTION, 'updated'), selection_id: SELECTION, frozen_revision: '1', committed: ['row:2'], remaining: ['row:4'], conflicted: ['row:3'] } });
    assert.deepEqual((await port().confirm(JOB_ID, batch, KEY)).conflicted, ['row:3']);
    // A result that drops a batch row, or names another selection, is not trusted.
    replies.push({ status: 200, body: { ack: ack(SELECTION, 'updated'), selection_id: SELECTION, frozen_revision: '1', committed: ['row:2'], remaining: [], conflicted: [] } });
    await assert.rejects(port().confirm(JOB_ID, batch, KEY), (error: unknown) => error instanceof V1Error && error.outcome === 'invalid_response');
    replies.push({ status: 413, body: { code: 'COMMAND_TOO_LARGE', request_id: 'r', message_key: 'errors.command_too_large' } });
    await assert.rejects(port().confirm(JOB_ID, batch, KEY), (error: unknown) => error instanceof V1Error && error.outcome === 'too_large');
  });
});
