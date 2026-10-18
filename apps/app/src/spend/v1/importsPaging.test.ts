import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import type { ImportPreview } from '@gogospend/contracts';

import { V1Error, createV1Transport } from '../../api/client.ts';
import type { V1Credentials } from '../../api/client.ts';
import { createImportResources, fetchWholePreview } from './imports.ts';

const JOB = '1b8f6a52-1c3d-4e5f-8a7b-9c0d1e2f3a4b';
const candidate = (n: number) => ({
  source_row_id: `row:${n + 1}`, ordinal: n, occurred_on: '2026-09-01', type: 'expense', amount_minor: String(100 + n), wallet_label: 'Cash', category_label: null, merchant: null, note: null, review_required: false,
});
const ALL = Array.from({ length: 5 }, (_, i) => candidate(i + 1));
const SUMMARY = { layout: 'generic', candidate_count: 5, review_required_count: 0, totals: { expense_minor: '515', income_minor: '0', transfer_minor: '0' }, image: null };
const ISSUE = { code: 'missing_wallet', source_row_id: 'row:5', field: 'wallet_label' };
const ADVICE = [{ source_row_id: 'row:2', kind: 'same_file', matches: ['row:3'] }, { source_row_id: 'row:3', kind: 'same_file', matches: ['row:2'] }];

function previewOf(offset: number | null, limit: number, revision = '1'): ImportPreview {
  const whole = offset === null;
  const start = whole ? 0 : offset;
  const slice = whole ? ALL : ALL.slice(start, start + limit);
  const ids = new Set(slice.map((row) => row.source_row_id));
  const end = start + slice.length;
  return {
    job_id: JOB, status: 'ready', candidates: slice as ImportPreview['candidates'], issues: [ISSUE] as ImportPreview['issues'],
    duplicate_advice: ADVICE.filter((row) => ids.has(row.source_row_id)) as ImportPreview['duplicate_advice'],
    review_revision: revision, expires_at: '2026-10-25T10:00:00.000Z', summary: SUMMARY as ImportPreview['summary'],
    ...(whole ? {} : { page: { offset: start, limit, total: ALL.length, next_offset: slice.length > 0 && end < ALL.length ? end : null } }),
  };
}

let seen: string[] = [];
let respond: (url: URL) => unknown = () => null;
const server = createServer((req, res) => {
  seen.push(req.url ?? '');
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(respond(new URL(req.url ?? '', 'http://x'))));
});
let baseUrl = '';
const credentials: V1Credentials = { getAccessToken: async () => 'token', getSessionSnapshot: () => ({ binding: 'b'.repeat(43), epoch: 1 }) };
const imports = () => createImportResources(createV1Transport({ baseUrl, credentials, client: { platform: 'ios', version: '1.2.3' }, timeoutMs: 2_000 }));

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  seen = [];
  respond = () => null;
});

const pagedBy = (url: URL, revision = '1') => previewOf(Number(url.searchParams.get('offset') ?? 0), Number(url.searchParams.get('limit') ?? 500), revision);

test('without paging the request is today\'s whole-preview GET, and a page object in the answer is refused', async () => {
  respond = () => previewOf(null, 0);
  assert.deepEqual(await imports().preview(JOB), previewOf(null, 0));
  assert.deepEqual(seen, [`/v1/imports/${JOB}/preview`]);
  respond = () => previewOf(0, 2);
  await assert.rejects(() => imports().preview(JOB), (error) => error instanceof V1Error && error.outcome === 'invalid_response');
});

test('a paged read names offset and limit and must come back as exactly that page', async () => {
  respond = pagedBy;
  const page = await imports().preview(JOB, { offset: 2, limit: 2 });
  assert.deepEqual(seen, [`/v1/imports/${JOB}/preview?offset=2&limit=2`]);
  assert.deepEqual(page.candidates.map((row) => row.source_row_id), ['row:4', 'row:5']);
  assert.deepEqual(page.page, { offset: 2, limit: 2, total: 5, next_offset: 4 });
  await imports().preview(JOB, { limit: 3 });
  assert.equal(seen[1], `/v1/imports/${JOB}/preview?limit=3`);
  // A server that ignores paging (answers whole) or answers another page is not trusted.
  respond = () => previewOf(null, 0);
  await assert.rejects(() => imports().preview(JOB, { offset: 2, limit: 2 }), (error) => error instanceof V1Error && error.outcome === 'invalid_response');
  respond = () => previewOf(0, 2);
  await assert.rejects(() => imports().preview(JOB, { offset: 2, limit: 2 }), (error) => error instanceof V1Error && error.outcome === 'invalid_response');
});

test('paging that the server would refuse is never sent', async () => {
  for (const paging of [{ offset: -1 }, { limit: 0 }, { limit: 501 }, { offset: 5_001 }, { limit: 1.5 }, { offset: Number.NaN }]) {
    await assert.rejects(() => imports().preview(JOB, paging), (error) => error instanceof V1Error && error.outcome === 'invalid');
  }
  assert.deepEqual(seen, []);
});

test('fetchWholePreview joins the pages into the same preview a whole read gives', async () => {
  respond = pagedBy;
  const joined = await fetchWholePreview(imports(), JOB, 2);
  assert.deepEqual(joined, previewOf(null, 0));
  assert.equal('page' in joined, false);
  assert.deepEqual(seen, [`/v1/imports/${JOB}/preview?offset=0&limit=2`, `/v1/imports/${JOB}/preview?offset=2&limit=2`, `/v1/imports/${JOB}/preview?offset=4&limit=2`]);
});

test('fetchWholePreview returns a preview that has no page (not ready) as it is, after one read', async () => {
  const queued: ImportPreview = { job_id: JOB, status: 'queued', candidates: [], issues: [], duplicate_advice: [], review_revision: null, expires_at: null, summary: null };
  respond = () => queued;
  assert.deepEqual(await fetchWholePreview(imports(), JOB, 2), queued);
  assert.equal(seen.length, 1);
});

test('fetchWholePreview starts over when the review revision moved between pages, and gives up after repeated moves', async () => {
  let reads = 0;
  respond = (url) => {
    reads += 1;
    // First attempt: the second page is already at revision 2. Second attempt: stable at revision 2.
    return pagedBy(url, reads === 1 ? '1' : '2');
  };
  const joined = await fetchWholePreview(imports(), JOB, 3);
  assert.equal(joined.review_revision, '2');
  assert.equal(joined.candidates.length, 5);
  assert.equal(reads, 4);

  let moving = 0;
  respond = (url) => pagedBy(url, String((moving += 1)));
  await assert.rejects(() => fetchWholePreview(imports(), JOB, 2), (error) => error instanceof V1Error && error.code === 'PREVIEW_CHANGED' && error.outcome === 'conflict');
});
