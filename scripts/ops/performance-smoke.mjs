// P6b performance smoke: a mixed, open-loop load of v1 reads and writes from
// many synthetic accounts, measured after a warm-up, with a redacted receipt.
//
//   node scripts/ops/performance-smoke.mjs --target staging-synthetic \
//        --authorization-fd 3 --accounts-fd 4 --location bangkok-<site>
//   node scripts/ops/performance-smoke.mjs --target local-dry-run \
//        --base-url http://127.0.0.1:8091 [--accounts-fd 3] [--location local]
//
// Targets. Anything else is refused (exit 2):
// - `staging-synthetic` runs only with an explicit authorization record read
//   from a descriptor: {"target": "staging-synthetic", "environment":
//   "staging", "synthetic_data": true, "origin": "https://…",
//   "approved_by": "<role>", "approved_at": ISO, "valid_until": ISO (≤7 days
//   after approval)}. Without one it exits 3 (SKIPPED, E1 not authorized); an
//   origin that is not https, has no staging label (staging, stage, stg),
//   looks like production, or does not match the record is refused.
// - `local-dry-run` runs only against a loopback http(s) base URL (a v1 app
//   or a fake started locally). Without accounts it drives public routes.
// Accounts (≥20 for staging) come from a descriptor as JSON:
//   [{"access_token", "binding", "client": "ios/1.2.3", "wallet_id", "category_id"}]
// Tokens and bindings are never arguments, environment variables, log lines
// or receipt fields. Default load (plan): 20 requests/second, 80% reads
// (summary, history, wallets) and 20% writes (one synthetic expense each),
// 30 s warm-up then 120 s measured; pass needs warm p95 reads < 800 ms,
// writes < 1,200 ms and at most 1% failed measured requests. No benchmark
// claim is made without a receipt from the authorized target.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { isLoopbackHost, parseArgs } from './ops-safety.mjs';

export const THRESHOLDS = Object.freeze({ readP95Ms: 800, writeP95Ms: 1_200, maxFailureRate: 0.01 });
export const DEFAULTS = Object.freeze({ rate: 20, warmupSeconds: 30, seconds: 120, writeShare: 0.2, minStagingAccounts: 20, maxInFlight: 200 });
const AUTHORIZATION_MAX_DAYS = 7;
const PRODUCTION_HINT = /(^|[.-])(prod|production|live)([.-]|$)/i;
// A staging origin must say so in a host label (api.staging.…, …-staging.up.railway.app,
// stg-api.…): a host that merely avoids "prod" (api.gogospend.app) is refused.
const STAGING_HINT = /(^|[.-])(staging|stage|stg)([.-]|$)/i;

const MESSAGES = Object.freeze({
  ARGUMENT_REFUSED: 'An unknown, missing or secret-bearing argument was refused.',
  TARGET_REFUSED: 'Only an authorized staging-synthetic target or a loopback dry run is allowed.',
  STAGING_NOT_AUTHORIZED: 'No valid staging authorization record was supplied (E1); recorded as SKIPPED.',
  ACCOUNTS_INVALID: 'The synthetic accounts are missing or malformed.',
  SMOKE_FAILED: 'The performance smoke could not run.',
});

export class SmokeError extends Error {
  constructor(code) {
    const known = Object.hasOwn(MESSAGES, code) ? code : 'SMOKE_FAILED';
    super(`${known}: ${MESSAGES[known]}`);
    this.name = 'SmokeError';
    this.code = known;
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLIENT = /^(ios|android)\/\d{1,6}\.\d{1,6}\.\d{1,6}$/;

/** The authorized staging origin, or a SmokeError. */
export function assertStagingAuthorization(record, now = new Date()) {
  if (!record || typeof record !== 'object') throw new SmokeError('STAGING_NOT_AUTHORIZED');
  const keys = Object.keys(record).sort().join(',');
  if (keys !== 'approved_at,approved_by,environment,origin,synthetic_data,target,valid_until') throw new SmokeError('STAGING_NOT_AUTHORIZED');
  if (record.target !== 'staging-synthetic' || record.environment !== 'staging' || record.synthetic_data !== true) throw new SmokeError('STAGING_NOT_AUTHORIZED');
  if (typeof record.approved_by !== 'string' || !/^[a-z][a-z0-9_-]{1,40}$/.test(record.approved_by)) throw new SmokeError('STAGING_NOT_AUTHORIZED');
  if (!ISO.test(String(record.approved_at)) || !ISO.test(String(record.valid_until))) throw new SmokeError('STAGING_NOT_AUTHORIZED');
  const approved = Date.parse(record.approved_at);
  const until = Date.parse(record.valid_until);
  if (!(approved <= now.getTime() && now.getTime() < until && until - approved <= AUTHORIZATION_MAX_DAYS * 86_400_000)) throw new SmokeError('STAGING_NOT_AUTHORIZED');
  let origin;
  try {
    origin = new URL(record.origin);
  } catch {
    throw new SmokeError('TARGET_REFUSED');
  }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new SmokeError('TARGET_REFUSED');
  if (PRODUCTION_HINT.test(origin.hostname) || !STAGING_HINT.test(origin.hostname) || isLoopbackHost(origin.hostname)) throw new SmokeError('TARGET_REFUSED');
  return origin.origin;
}

/** A loopback base URL for the dry run, or a SmokeError. */
export function assertLocalBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SmokeError('TARGET_REFUSED');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(url.protocol) || !isLoopbackHost(host) || url.username || url.password) throw new SmokeError('TARGET_REFUSED');
  return url.origin;
}

export function parseAccounts(text, minimum) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SmokeError('ACCOUNTS_INVALID');
  }
  if (!Array.isArray(parsed) || parsed.length < minimum || parsed.length > 1_000) throw new SmokeError('ACCOUNTS_INVALID');
  for (const account of parsed) {
    if (!account || typeof account !== 'object') throw new SmokeError('ACCOUNTS_INVALID');
    const { access_token: token, binding, client, wallet_id: wallet, category_id: category } = account;
    if (typeof token !== 'string' || !/^[A-Za-z0-9._~+/=-]{20,4096}$/.test(token)) throw new SmokeError('ACCOUNTS_INVALID');
    if (typeof binding !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(binding)) throw new SmokeError('ACCOUNTS_INVALID');
    if (typeof client !== 'string' || !CLIENT.test(client) || !UUID.test(String(wallet)) || !UUID.test(String(category))) throw new SmokeError('ACCOUNTS_INVALID');
  }
  return parsed.map((account) => Object.freeze({ token: account.access_token, binding: account.binding, client: account.client, wallet: account.wallet_id, category: account.category_id }));
}

/** Nearest-rank percentile of `values` (milliseconds); null when empty. */
export function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

function summarize(latencies) {
  return { count: latencies.length, p50_ms: percentile(latencies, 50), p95_ms: percentile(latencies, 95), p99_ms: percentile(latencies, 99) };
}

/** Pass/fail against the plan's thresholds. */
export function evaluate(result, thresholds = THRESHOLDS) {
  const measured = result.reads.count + result.writes.count + result.failed;
  const failureRate = measured === 0 ? 1 : result.failed / measured;
  const reasons = [];
  if (result.reads.count === 0 || result.reads.p95_ms >= thresholds.readP95Ms) reasons.push('read_p95');
  if (result.writes.expected && (result.writes.count === 0 || result.writes.p95_ms >= thresholds.writeP95Ms)) reasons.push('write_p95');
  if (failureRate > thresholds.maxFailureRate) reasons.push('failure_rate');
  return { pass: reasons.length === 0, failure_rate: Number(failureRate.toFixed(4)), reasons };
}

function bangkokMonth(now) {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 7);
}

function readRequest(base, account, index, now) {
  const month = bangkokMonth(now);
  const paths = [`/v1/summary?month=${month}`, `/v1/history?from=${month}-01&through=${month}-28&limit=50`, '/v1/wallets'];
  return { kind: 'read', url: `${base}${paths[index % paths.length]}`, init: { method: 'GET', headers: privateHeaders(account) } };
}

function writeRequest(base, account, now) {
  const id = randomUUID();
  const body = JSON.stringify({
    id,
    type: 'expense',
    wallet_id: account.wallet,
    category_id: account.category,
    amount_minor: String(100 + Math.floor(Math.random() * 900)),
    occurred_on: new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10),
    note: 'performance smoke (synthetic)',
  });
  return {
    kind: 'write',
    url: `${base}/v1/transactions`,
    init: { method: 'POST', headers: { ...privateHeaders(account), 'content-type': 'application/json', 'idempotency-key': id, 'x-gogospend-command-schema': '1' }, body },
  };
}

function privateHeaders(account) {
  return { authorization: `Bearer ${account.token}`, 'x-gogospend-session': account.binding, 'x-gogospend-client': account.client };
}

/**
 * Open-loop load: a request is started every 1/rate seconds whatever the
 * previous ones are doing (bounded by maxInFlight), so a slow server shows up
 * as latency rather than as a lower request rate. Only requests started after
 * the warm-up are measured. Without accounts, public routes are used.
 */
export async function runLoad({ base, accounts = [], rate = DEFAULTS.rate, warmupMs, durationMs, writeShare = DEFAULTS.writeShare, fetchImpl = fetch, now = () => new Date(), maxInFlight = DEFAULTS.maxInFlight }) {
  const intervalMs = 1000 / rate;
  const startedAt = now();
  const t0 = performance.now();
  const latencies = { read: [], write: [] };
  const errors = {};
  let failed = 0;
  let skipped = 0;
  let sent = 0;
  // Reads and writes rotate over the accounts separately, so every account
  // writes and each stays well inside its session write budget (at the plan
  // load, 20 req/s × 20% over 20 accounts is 12 writes a minute each).
  let reads = 0;
  let writes = 0;
  let inFlight = 0;
  const pending = new Set();
  const total = Math.floor(((warmupMs + durationMs) / 1000) * rate);
  for (let index = 0; index < total; index += 1) {
    const due = t0 + index * intervalMs;
    const wait = due - performance.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const measured = index * intervalMs >= warmupMs;
    if (inFlight >= maxInFlight) {
      if (measured) skipped += 1;
      continue;
    }
    const isWrite = accounts.length > 0 && (index % Math.round(1 / writeShare)) === 0;
    const account = accounts.length === 0 ? null : isWrite ? accounts[writes++ % accounts.length] : accounts[reads++ % accounts.length];
    const request = account === null
      ? { kind: 'read', url: `${base}${index % 2 === 0 ? '/live' : '/v1/policies'}`, init: { method: 'GET' } }
      : isWrite ? writeRequest(base, account, now()) : readRequest(base, account, reads, now());
    sent += 1;
    inFlight += 1;
    const begun = performance.now();
    const task = fetchImpl(request.url, { ...request.init, redirect: 'manual', signal: AbortSignal.timeout(10_000) })
      .then(async (response) => {
        await response.arrayBuffer().catch(() => undefined);
        const elapsed = performance.now() - begun;
        if (!measured) return;
        if (response.status >= 200 && response.status < 300) latencies[request.kind].push(Math.round(elapsed));
        else {
          failed += 1;
          errors[String(response.status)] = (errors[String(response.status)] ?? 0) + 1;
        }
      })
      .catch(() => {
        if (!measured) return;
        failed += 1;
        errors.network = (errors.network ?? 0) + 1;
      })
      .finally(() => {
        inFlight -= 1;
        pending.delete(task);
      });
    pending.add(task);
  }
  await Promise.allSettled([...pending]);
  return {
    started_at: startedAt.toISOString(),
    finished_at: now().toISOString(),
    sent,
    reads: summarize(latencies.read),
    writes: { ...summarize(latencies.write), expected: accounts.length > 0 },
    failed: failed + skipped,
    errors: { ...errors, ...(skipped > 0 ? { not_sent_in_flight_cap: skipped } : {}) },
  };
}

function readFd(fd) {
  try {
    return readFileSync(Number(fd), 'utf8');
  } catch {
    throw new SmokeError('ARGUMENT_REFUSED');
  }
}

export async function main(argv = process.argv.slice(2), { fetchImpl = fetch, now = () => new Date(), write = (text) => process.stdout.write(text) } = {}) {
  const fd = /^([3-9]|[1-9][0-9])$/;
  let args;
  try {
    args = parseArgs(argv, {
      target: /^[a-z][a-z0-9-]{0,40}$/,
      'base-url': /^https?:\/\/[A-Za-z0-9.:[\]-]{1,100}(:\d{1,5})?\/?$/,
      'authorization-fd': fd,
      'accounts-fd': fd,
      location: /^[a-z][a-z0-9-]{1,40}$/,
      rate: /^\d{1,2}$/,
      'warmup-seconds': /^\d{1,3}$/,
      seconds: /^\d{1,4}$/,
    });
  } catch {
    throw new SmokeError('ARGUMENT_REFUSED');
  }
  if (!args.target) throw new SmokeError('ARGUMENT_REFUSED');
  let base;
  let accounts = [];
  if (args.target === 'staging-synthetic') {
    if (args['base-url']) throw new SmokeError('TARGET_REFUSED');
    if (!args['authorization-fd']) throw new SmokeError('STAGING_NOT_AUTHORIZED');
    let record;
    try {
      record = JSON.parse(readFd(args['authorization-fd']));
    } catch {
      throw new SmokeError('STAGING_NOT_AUTHORIZED');
    }
    base = assertStagingAuthorization(record, now());
    if (!args['accounts-fd'] || !args.location) throw new SmokeError('ARGUMENT_REFUSED');
    accounts = parseAccounts(readFd(args['accounts-fd']), DEFAULTS.minStagingAccounts);
  } else if (args.target === 'local-dry-run') {
    if (!args['base-url'] || args['authorization-fd']) throw new SmokeError('ARGUMENT_REFUSED');
    base = assertLocalBaseUrl(args['base-url']);
    if (args['accounts-fd']) accounts = parseAccounts(readFd(args['accounts-fd']), 1);
  } else {
    throw new SmokeError('TARGET_REFUSED');
  }
  const rate = Number(args.rate ?? DEFAULTS.rate);
  const warmupSeconds = Number(args['warmup-seconds'] ?? DEFAULTS.warmupSeconds);
  const seconds = Number(args.seconds ?? DEFAULTS.seconds);
  if (rate < 1 || rate > 50 || seconds < 1) throw new SmokeError('ARGUMENT_REFUSED');
  const result = await runLoad({ base, accounts, rate, warmupMs: warmupSeconds * 1000, durationMs: seconds * 1000, fetchImpl, now });
  const verdict = evaluate(result);
  const receipt = {
    receipt: 'gogospend-performance-smoke-v1',
    target: args.target,
    origin_host: new URL(base).host,
    location: args.location ?? 'unspecified',
    node: process.version,
    accounts: accounts.length,
    load: { rate_per_second: rate, warmup_seconds: warmupSeconds, measured_seconds: seconds, write_share: accounts.length > 0 ? DEFAULTS.writeShare : 0 },
    thresholds: { read_p95_ms: THRESHOLDS.readP95Ms, write_p95_ms: THRESHOLDS.writeP95Ms, max_failure_rate: THRESHOLDS.maxFailureRate },
    ...result,
    ...verdict,
  };
  write(`${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const receipt = await main();
    process.exitCode = receipt.pass ? 0 : 1;
  } catch (error) {
    const failure = error instanceof SmokeError ? error : new SmokeError('SMOKE_FAILED');
    process.stderr.write(`${JSON.stringify({ code: failure.code, message: failure.message })}\n`);
    process.exitCode = failure.code === 'ARGUMENT_REFUSED' || failure.code === 'TARGET_REFUSED' ? 2 : failure.code === 'STAGING_NOT_AUTHORIZED' ? 3 : 1;
  }
}
