// Remote flags after yes (P6B-T14): the request to PostHog's /flags through
// 1D-T2's proxy, and how its answer and the kept answer are read. A fake fetch
// answers; nothing leaves the machine.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FLAGS_TIMEOUT_MS, REMOTE_FLAGS_NAME, fetchRemoteFlags, parseKeptFlags } from './remoteFlags.ts';

const HOST = 'https://api.jotbun.test/ingest';
const KEY = 'phc_project';
const ANALYTICS_ID = 'a'.repeat(64);

// PostHog's documented answer from /flags?v=2 (docs/api/flags), without its stray comma.
const DOCUMENTED = {
  flags: {
    'my-awesome-flag': {
      key: 'my-awesome-flag',
      enabled: true,
      reason: { code: 'condition_match', condition_index: 0, description: 'Condition set 1 matched' },
      metadata: { id: 1, version: 1, payload: '{"example": "json", "payload": "value"}' },
    },
    'my-multivariate-flag': {
      key: 'my-multivariate-flag',
      enabled: true,
      variant: 'some-string-value',
      reason: { code: 'condition_match', condition_index: 1, description: 'Condition set 2 matched' },
      metadata: { id: 2, version: 42 },
    },
    'flag-thats-not-on': {
      key: 'flag-thats-not-on',
      enabled: false,
      reason: { code: 'no_condition_match', condition_index: 0, description: 'No condition sets matched' },
      metadata: { id: 3, version: 1 },
    },
  },
  errorsWhileComputingFlags: false,
  requestId: '550e8400-e29b-41d4-a716-446655440000',
};

const READ = {
  flags: { 'my-awesome-flag': true, 'my-multivariate-flag': 'some-string-value', 'flag-thats-not-on': false },
  payloads: { 'my-awesome-flag': { example: 'json', payload: 'value' } },
};

type Call = { url: string; init: RequestInit };

/** A fetch that records each call and answers `body` (JSON unless a string) with `status`. */
function answering(body: unknown, status = 200): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

/** The call's outcome: its value, or 'rejected', so a rejection fails an assertion. */
const outcome = (pending: Promise<unknown>) => pending.then((value) => value, () => 'rejected');

/** 'pending' while `pending` has not settled once the current microtasks and one macrotask have run. */
const stateOf = (pending: Promise<unknown>) =>
  Promise.race([pending.then(() => 'settled', () => 'settled'), new Promise((resolve) => { setImmediate(() => resolve('pending')); })]);

const ask = (fetchImpl: typeof fetch, timeoutMs?: number) =>
  fetchRemoteFlags({ host: HOST, apiKey: KEY, distinctId: ANALYTICS_ID, fetchImpl, ...(timeoutMs === undefined ? {} : { timeoutMs }) });

test('it posts api_key and distinct_id to /flags/?v=2 without following a redirect, and reads flags and variants', async () => {
  const { fetchImpl, calls } = answering(DOCUMENTED);
  // A host written with a trailing slash still asks one path.
  const read = await outcome(fetchRemoteFlags({ host: `${HOST}/`, apiKey: KEY, distinctId: ANALYTICS_ID, fetchImpl }));
  assert.deepEqual(read, READ);
  assert.equal(calls.length, 1);
  const call = calls[0] as Call;
  assert.equal(call.url, 'https://api.jotbun.test/ingest/flags/?v=2');
  assert.equal(call.init.method, 'POST');
  assert.deepEqual(call.init.headers, { 'Content-Type': 'application/json' });
  // The project key and the analytics id, and nothing else about the person.
  assert.deepEqual(JSON.parse(String(call.init.body)), { api_key: KEY, distinct_id: ANALYTICS_ID });
  assert.equal(call.init.redirect, 'error');
  assert.ok(call.init.signal instanceof AbortSignal);
  assert.equal(REMOTE_FLAGS_NAME, 'remote-flags');
});

test('a 5xx, a timeout or a malformed answer is null', async () => {
  let asked = 0;
  const count = (fetchImpl: typeof fetch): typeof fetch => async (url, init) => {
    asked += 1;
    return fetchImpl(url, init);
  };
  // A 5xx, even with a body shaped like flags.
  const shaped = { flags: { 'rollout-travel': { key: 'rollout-travel', enabled: true } } };
  assert.equal(await outcome(ask(count(answering(shaped, 500).fetchImpl))), null);
  assert.equal(await outcome(ask(count(answering(shaped, 503).fetchImpl))), null);
  // A network failure, or a redirect refused by redirect: 'error', rejects the fetch.
  assert.equal(await outcome(ask(count(async () => { throw new TypeError('Network request failed'); }))), null);
  // Malformed: not JSON, the v1 shape, flags that are not an object, a flag without
  // a boolean `enabled`, and a payload that is not JSON.
  assert.equal(await outcome(ask(count(answering('<html>gateway</html>').fetchImpl))), null);
  assert.equal(await outcome(ask(count(answering({ featureFlags: { 'rollout-travel': true } }).fetchImpl))), null);
  assert.equal(await outcome(ask(count(answering({ flags: [] }).fetchImpl))), null);
  assert.equal(await outcome(ask(count(answering({ flags: { 'rollout-travel': { key: 'rollout-travel', enabled: 'yes' } } }).fetchImpl))), null);
  assert.equal(await outcome(ask(count(answering({ flags: { 'rollout-travel': { key: 'rollout-travel', enabled: true, metadata: { payload: '{not json' } } } }).fetchImpl))), null);
  // A request that never answers, even one that ignores the abort, is null at the time limit, and is aborted.
  let signal: AbortSignal | null = null;
  const silent: typeof fetch = (_url, init) => {
    signal = init?.signal ?? null;
    return new Promise<Response>(() => {});
  };
  const late = await Promise.race([outcome(ask(count(silent), 20)), new Promise((resolve) => { setTimeout(() => resolve('still waiting'), 1000); })]);
  assert.equal(late, null);
  assert.equal((signal as AbortSignal | null)?.aborted, true);
  assert.equal(asked, 9);
});

test('the time limit is 5000 ms by default', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null = null;
  const silent: typeof fetch = (_url, init) => {
    signal = init?.signal ?? null;
    return new Promise<Response>(() => {});
  };
  const pending = outcome(ask(silent));
  assert.equal(FLAGS_TIMEOUT_MS, 5000);
  t.mock.timers.tick(4999);
  assert.equal(await stateOf(pending), 'pending');
  assert.equal((signal as AbortSignal | null)?.aborted, false);
  t.mock.timers.tick(1);
  // Checked before it is awaited, so a call that never settles fails here instead of hanging.
  assert.equal(await stateOf(pending), 'settled');
  assert.equal(await pending, null);
  assert.equal((signal as AbortSignal | null)?.aborted, true);
});

test('an answer PostHog marks as partial or over the flags quota is null, so the last whole answer stays', async () => {
  const flags = DOCUMENTED.flags;
  assert.equal(await outcome(ask(answering({ flags, errorsWhileComputingFlags: true }).fetchImpl)), null);
  assert.equal(await outcome(ask(answering({ flags: {}, quotaLimited: ['feature_flags'] }).fetchImpl)), null);
  // Another feature's quota, or none, leaves the flags whole.
  assert.deepEqual(await outcome(ask(answering({ flags, errorsWhileComputingFlags: false, quotaLimited: ['recordings'] }).fetchImpl)), READ);
});

test('a kept answer is read back, and one that cannot be read counts as none', () => {
  const tryParse = (raw: string | null) => {
    try {
      return parseKeptFlags(raw);
    } catch {
      return 'threw';
    }
  };
  assert.deepEqual(tryParse(JSON.stringify(READ)), READ);
  assert.equal(tryParse(null), null);
  assert.equal(tryParse('{"flags":'), null);
  assert.equal(tryParse('{"payloads":{}}'), null);
  assert.equal(tryParse('{"flags":{"rollout-travel":true}}'), null);
});
