// P6b: the performance smoke refuses every target except an explicitly
// authorized staging target or a loopback dry run, measures only warm
// requests, and never prints a token, binding or amount. The load runs here
// against a loopback fake of the v1 routes, never a real service.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { SmokeError, assertLocalBaseUrl, assertStagingAuthorization, evaluate, main, parseAccounts, percentile, runLoad } from './performance-smoke.mjs';

const NOW = new Date('2026-10-17T03:00:00.000Z');
const record = (overrides = {}) => ({
  target: 'staging-synthetic',
  environment: 'staging',
  synthetic_data: true,
  origin: 'https://api.staging.gogospend.example',
  approved_by: 'founder',
  approved_at: '2026-10-16T03:00:00.000Z',
  valid_until: '2026-10-18T03:00:00.000Z',
  ...overrides,
});
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.c3ludGhldGljLXNtb2tlLXRva2Vu.c2lnbmF0dXJlLXN5bnRoZXRpYw';
const BINDING = 'SyntheticSmokeBinding_0123456789abcdefABCDEF';
const account = (n) => ({
  access_token: `${TOKEN}${n}`,
  binding: `${BINDING}${n}`,
  client: 'ios/1.0.0',
  wallet_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  category_id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
});

const refusedWith = (code) => (error) => error instanceof SmokeError && error.code === code;

test('only an authorized, current, non-production https staging record is accepted', () => {
  assert.equal(assertStagingAuthorization(record(), NOW), 'https://api.staging.gogospend.example');
  for (const [label, bad, code] of [
    ['no record', null, 'STAGING_NOT_AUTHORIZED'],
    ['another target', record({ target: 'production' }), 'STAGING_NOT_AUTHORIZED'],
    ['real data', record({ synthetic_data: false }), 'STAGING_NOT_AUTHORIZED'],
    ['another environment', record({ environment: 'production' }), 'STAGING_NOT_AUTHORIZED'],
    ['expired', record({ valid_until: '2026-10-17T02:59:59.000Z' }), 'STAGING_NOT_AUTHORIZED'],
    ['approved in the future', record({ approved_at: '2026-10-17T04:00:00.000Z' }), 'STAGING_NOT_AUTHORIZED'],
    ['valid too long', record({ valid_until: '2026-10-24T03:00:01.000Z' }), 'STAGING_NOT_AUTHORIZED'],
    ['an extra field', { ...record(), note: 'x' }, 'STAGING_NOT_AUTHORIZED'],
    ['plain http', record({ origin: 'http://api.staging.gogospend.example' }), 'TARGET_REFUSED'],
    ['a production-looking host', record({ origin: 'https://api.prod.gogospend.example' }), 'TARGET_REFUSED'],
    ['a live host', record({ origin: 'https://live-api.gogospend.example' }), 'TARGET_REFUSED'],
    ['credentials in the origin', record({ origin: 'https://user:pass@api.staging.gogospend.example' }), 'TARGET_REFUSED'],
    ['a path', record({ origin: 'https://api.staging.gogospend.example/v1' }), 'TARGET_REFUSED'],
  ]) {
    assert.throws(() => assertStagingAuthorization(bad, NOW), refusedWith(code), label);
  }
});

test('a dry run only targets loopback', () => {
  assert.equal(assertLocalBaseUrl('http://127.0.0.1:8091'), 'http://127.0.0.1:8091');
  assert.equal(assertLocalBaseUrl('http://[::1]:8091/'), 'http://[::1]:8091');
  for (const bad of ['https://api.staging.gogospend.example', 'http://10.0.0.5:8091', 'ftp://127.0.0.1', 'not a url']) {
    assert.throws(() => assertLocalBaseUrl(bad), refusedWith('TARGET_REFUSED'), bad);
  }
});

test('the CLI refuses unknown targets and secret-bearing arguments, and skips staging without authorization', async () => {
  const run = (argv) => main(argv, { fetchImpl: () => assert.fail('no request may be sent'), now: () => NOW, write: () => undefined });
  await assert.rejects(run([]), refusedWith('ARGUMENT_REFUSED'));
  await assert.rejects(run(['--target', 'production']), refusedWith('TARGET_REFUSED'));
  await assert.rejects(run(['--target', 'staging']), refusedWith('TARGET_REFUSED'));
  await assert.rejects(run(['--target', 'staging-synthetic']), refusedWith('STAGING_NOT_AUTHORIZED'));
  await assert.rejects(run(['--target', 'staging-synthetic', '--base-url', 'http://127.0.0.1:8091']), refusedWith('TARGET_REFUSED'));
  await assert.rejects(run(['--target', 'local-dry-run', '--base-url', 'https://api.staging.gogospend.example']), refusedWith('TARGET_REFUSED'));
  await assert.rejects(run(['--target', 'local-dry-run', '--base-url', 'http://u:secret@127.0.0.1:8091']), refusedWith('ARGUMENT_REFUSED'));
  await assert.rejects(run(['--target', 'local-dry-run', '--token', TOKEN]), refusedWith('ARGUMENT_REFUSED'));
  await assert.rejects(run(['--target', 'local-dry-run', '--base-url', 'http://127.0.0.1:8091', '--rate', '99']), refusedWith('ARGUMENT_REFUSED'));
});

test('accounts are validated; staging needs at least 20', () => {
  const twenty = JSON.stringify(Array.from({ length: 20 }, (_, n) => account(n)));
  assert.equal(parseAccounts(twenty, 20).length, 20);
  assert.throws(() => parseAccounts(JSON.stringify([account(1)]), 20), refusedWith('ACCOUNTS_INVALID'));
  assert.throws(() => parseAccounts(JSON.stringify([{ ...account(1), client: 'web/1.0.0' }]), 1), refusedWith('ACCOUNTS_INVALID'));
  assert.throws(() => parseAccounts('{not json', 1), refusedWith('ACCOUNTS_INVALID'));
});

test('percentiles are nearest-rank and thresholds decide the verdict', () => {
  assert.equal(percentile([], 95), null);
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95), 95);
  const ok = { reads: { count: 100, p95_ms: 799 }, writes: { count: 20, p95_ms: 1_199, expected: true }, failed: 1 };
  assert.deepEqual(evaluate(ok), { pass: true, failure_rate: 0.0083, reasons: [] });
  assert.deepEqual(evaluate({ ...ok, reads: { count: 100, p95_ms: 800 } }).reasons, ['read_p95']);
  assert.deepEqual(evaluate({ ...ok, writes: { count: 20, p95_ms: 1_200, expected: true } }).reasons, ['write_p95']);
  assert.deepEqual(evaluate({ ...ok, failed: 5 }).reasons, ['failure_rate']);
  assert.deepEqual(evaluate({ ...ok, writes: { count: 0, p95_ms: null, expected: true } }).reasons, ['write_p95']);
});

/** A loopback fake of the v1 routes the smoke uses, recording what it received. */
async function fakeV1({ readDelayMs = 2, writeDelayMs = 4 } = {}) {
  const seen = { reads: 0, writes: 0, keys: new Set(), schema: new Set(), authorized: 0, paths: new Set(), bodies: [] };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const path = req.url.split('?')[0];
      seen.paths.add(path);
      if (req.headers.authorization?.startsWith(`Bearer ${TOKEN}`) && req.headers['x-gogospend-session']?.startsWith(BINDING)) seen.authorized += 1;
      const isWrite = req.method === 'POST' && path === '/v1/transactions';
      if (isWrite) {
        seen.writes += 1;
        seen.keys.add(req.headers['idempotency-key']);
        seen.schema.add(req.headers['x-gogospend-command-schema']);
        seen.bodies.push(JSON.parse(body));
      } else seen.reads += 1;
      setTimeout(() => {
        res.writeHead(isWrite ? 201 : 200, { 'content-type': 'application/json' });
        res.end('{}');
      }, isWrite ? writeDelayMs : readDelayMs);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { base: `http://127.0.0.1:${server.address().port}`, seen, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('a dry run against a loopback fake: mixed load, warm-only measurement, no secret in the receipt', async () => {
  const fake = await fakeV1();
  try {
    const accounts = parseAccounts(JSON.stringify(Array.from({ length: 20 }, (_, n) => account(n))), 20);
    const result = await runLoad({ base: fake.base, accounts, rate: 50, warmupMs: 200, durationMs: 1_000, now: () => NOW });
    assert.equal(result.sent, 60);
    assert.equal(fake.seen.reads + fake.seen.writes, 60);
    assert.equal(fake.seen.writes, 12);
    assert.equal(fake.seen.authorized, 60);
    assert.equal(fake.seen.keys.size, 12, 'every write has its own Idempotency-Key');
    assert.deepEqual([...fake.seen.schema], ['1']);
    assert.deepEqual([...fake.seen.paths].sort(), ['/v1/history', '/v1/summary', '/v1/transactions', '/v1/wallets']);
    for (const body of fake.seen.bodies) {
      assert.equal(body.type, 'expense');
      assert.match(body.amount_minor, /^[1-9]\d{2}$/);
      assert.equal(body.id, body.id.toLowerCase());
    }
    // 10 of the 60 started during the warm-up are not measured.
    assert.equal(result.reads.count + result.writes.count, 50);
    assert.equal(result.failed, 0);
    assert.equal(evaluate(result).pass, true);
    const text = JSON.stringify(result);
    assert.ok(!text.includes(TOKEN) && !text.includes(BINDING) && !text.includes('amount'));
  } finally {
    await fake.close();
  }
});

test('the CLI dry run without accounts drives public routes and prints a redacted receipt', async () => {
  const fake = await fakeV1();
  const printed = [];
  try {
    const receipt = await main(['--target', 'local-dry-run', '--base-url', fake.base, '--rate', '20', '--warmup-seconds', '0', '--seconds', '1', '--location', 'local'], { now: () => NOW, write: (text) => printed.push(text) });
    assert.equal(receipt.receipt, 'gogospend-performance-smoke-v1');
    assert.equal(receipt.target, 'local-dry-run');
    assert.equal(receipt.accounts, 0);
    assert.equal(receipt.writes.expected, false);
    assert.equal(receipt.reads.count, 20);
    assert.equal(receipt.pass, true);
    assert.deepEqual([...fake.seen.paths].sort(), ['/live', '/v1/policies']);
    assert.match(printed.join(''), /"origin_host": "127\.0\.0\.1:\d+"/);
  } finally {
    await fake.close();
  }
});

test('failed requests count against the verdict', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end('{"code":"SERVICE_UNAVAILABLE"}');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await runLoad({ base: `http://127.0.0.1:${server.address().port}`, rate: 20, warmupMs: 0, durationMs: 500, now: () => NOW });
    assert.equal(result.failed, 10);
    assert.deepEqual(result.errors, { 503: 10 });
    assert.deepEqual(evaluate(result).reasons, ['read_p95', 'failure_rate']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// P6b review (m5): reads and writes are spread over the accounts separately,
// so every synthetic account writes, each well inside its write budget.
test('every account writes, at no more than half of the 60-per-minute write budget', async () => {
  const accounts = parseAccounts(JSON.stringify(Array.from({ length: 20 }, (_, n) => account(n))), 20);
  const perAccount = new Map();
  const fetchImpl = async (_url, init) => {
    const key = init.headers.authorization;
    const entry = perAccount.get(key) ?? { read: 0, write: 0 };
    entry[init.method === 'POST' ? 'write' : 'read'] += 1;
    perAccount.set(key, entry);
    return new Response('{}', { status: 200 });
  };
  // One minute of the plan's load (20 req/s, 20% writes = 1,200 requests), sent fast.
  await runLoad({ base: 'http://127.0.0.1:1', accounts, rate: 1_000, warmupMs: 0, durationMs: 1_200, fetchImpl, now: () => NOW });
  const writes = [...perAccount.values()].map((entry) => entry.write);
  assert.equal(perAccount.size, 20);
  assert.deepEqual({ writers: writes.filter((count) => count > 0).length, withinHalfBudget: Math.max(...writes) <= 30 }, { writers: 20, withinHalfBudget: true });
  assert.ok([...perAccount.values()].every((entry) => entry.read > 0));
});

test('a staging origin must look like staging, not merely avoid "prod" or "live"', () => {
  for (const origin of ['https://api.gogospend.app', 'https://gogospend.example', 'https://api.gogospend-prd.example']) {
    assert.throws(() => assertStagingAuthorization(record({ origin }), NOW), refusedWith('TARGET_REFUSED'), origin);
  }
  for (const origin of ['https://api.staging.gogospend.example', 'https://gogospend-api-staging.up.railway.app', 'https://stg-api.gogospend.example']) {
    assert.equal(assertStagingAuthorization(record({ origin }), NOW), origin);
  }
});
