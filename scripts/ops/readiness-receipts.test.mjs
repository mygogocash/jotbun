// P6b review (M2): mandatory receipts are enforced in the release preflight
// with the API's own rules, so the deploy health check can stay receipt-free.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { preflight } from './readiness-receipts.mjs';

const NOW = new Date('2026-10-17T03:00:00.000Z');
const DIGEST = 'b'.repeat(64);
const receipt = (overrides = {}, target = 'isolated-synthetic') => ({
  status: 'passed',
  recorded_at: '2026-10-16T03:00:00.000Z',
  valid_until: '2026-11-15T03:00:00.000Z',
  target,
  evidence_sha256: DIGEST,
  ...overrides,
});
const fresh = () => ({ restore_rehearsal: receipt(), storage_contract: receipt({}, 'r2-test') });

test('every receipt passed and valid for the release window: exit 0', () => {
  const outcome = preflight(JSON.stringify(fresh()), { now: NOW, minValidDays: 7 });
  assert.deepEqual(outcome, {
    exitCode: 0,
    info: ['receipts: restore_rehearsal=passed valid_hours=696', 'receipts: storage_contract=passed valid_hours=696', 'receipts: preflight ok min_valid_days=7'],
    alert: null,
  });
});

test('a receipt that expires inside the release window fails the preflight', () => {
  const soon = { ...fresh(), restore_rehearsal: receipt({ recorded_at: '2026-09-22T03:00:00.000Z', valid_until: '2026-10-22T03:00:00.000Z' }) };
  const outcome = preflight(JSON.stringify(soon), { now: NOW, minValidDays: 7 });
  assert.deepEqual({ exitCode: outcome.exitCode, alert: outcome.alert }, { exitCode: 1, alert: 'receipts: alert preflight failing=restore_rehearsal min_valid_days=7' });
  assert.equal(preflight(JSON.stringify(soon), { now: NOW, minValidDays: 3 }).exitCode, 0);
});

test('missing, failed, all-zero or local receipts fail; malformed input is refused', () => {
  const { storage_contract: storage } = fresh();
  assert.equal(preflight(JSON.stringify({ storage_contract: storage }), { now: NOW }).exitCode, 1);
  assert.equal(preflight(JSON.stringify({ ...fresh(), restore_rehearsal: receipt({ status: 'failed' }) }), { now: NOW }).exitCode, 1);
  assert.equal(preflight(JSON.stringify({ ...fresh(), restore_rehearsal: receipt({ evidence_sha256: '0'.repeat(64) }) }), { now: NOW }).exitCode, 1);
  assert.equal(preflight(JSON.stringify({ ...fresh(), restore_rehearsal: receipt({ target: 'local-isolated-synthetic' }) }), { now: NOW }).exitCode, 1);
  for (const bad of ['{not json', '[]', JSON.stringify({ restore: receipt() })]) assert.equal(preflight(bad, { now: NOW }).exitCode, 2, bad);
});

test('the CLI reads stdin, never prints evidence digests, and exits 1 on a lapsed receipt', () => {
  const script = fileURLToPath(new URL('./readiness-receipts.mjs', import.meta.url));
  const run = (input, args = []) => spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script, ...args], { input, encoding: 'utf8' });
  // The CLI reads the real clock, so the receipt that must stay valid is dated from today.
  const day = 86_400_000;
  const live = receipt({ recorded_at: new Date(Date.now() - day).toISOString(), valid_until: new Date(Date.now() + 29 * day).toISOString() });
  const lapsed = run(JSON.stringify({ restore_rehearsal: live, storage_contract: receipt({ recorded_at: '2026-01-01T00:00:00.000Z', valid_until: '2026-01-31T00:00:00.000Z' }, 'r2-test') }));
  assert.equal(lapsed.status, 1);
  assert.match(lapsed.stdout, /receipts: storage_contract=expired valid_hours=none/);
  assert.match(lapsed.stderr, /^receipts: alert preflight failing=storage_contract/);
  assert.ok(!`${lapsed.stdout}${lapsed.stderr}`.includes(DIGEST));
  assert.equal(run('{}', ['--min-valid-days', '99']).status, 2);
});
