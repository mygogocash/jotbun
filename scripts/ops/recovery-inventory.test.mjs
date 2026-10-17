// P6a: every recoverable copy is inventoried with an expiry no more than
// 7 days after it was taken, provider sources fail closed, and an erasure
// marker becomes clearable only once every copy that could hold the erased
// principal has expired. Hermetic: no Docker, provider or network access.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { inspect } from 'node:util';

import { memoryAttachmentSource, localRecoveryStore, runDailyBackup } from './backup.mjs';
import { RecoveryKey } from './recovery-crypto.mjs';
import {
  COPY_KINDS,
  HOSTED_INVENTORY_SKIPPED,
  localRestoreLedger,
  RecoveryInventory,
  recoveryStoreSource,
  restoreLedgerSource,
  staticSource,
} from './recovery-inventory.mjs';

const DAY = 86_400_000;
const NOW = new Date('2026-10-17T03:00:00.000Z');
const at = (ms) => new Date(NOW.getTime() + ms).toISOString();
const SECRETS = ['SyntheticPassw0rd-DO-NOT-USE', 'AKIASYNTHETIC0000KEY', '987654321', '฿9,876,543.21'];

function copy(overrides = {}) {
  return { id: 'copy_1', kind: 'logical_backup', environment: 'production', synthetic: false, created_at: at(-DAY), expires_at: at(6 * DAY), ...overrides };
}

function capture() {
  const lines = [];
  return { lines, log: { event: (name, fields) => lines.push(JSON.stringify({ name, ...fields })) } };
}

function assertLeaksNothing(...values) {
  const text = values.map((value) => (typeof value === 'string' ? value : `${inspect(value, { depth: 8 })} ${JSON.stringify(value)} ${value?.stack ?? ''}`)).join('\n');
  for (const secret of SECRETS) assert.ok(!text.includes(secret), `leaked ${secret}`);
}

async function rejectsWith(promise, code) {
  let caught;
  await assert.rejects(promise, (error) => {
    caught = error;
    assert.equal(error?.code, code);
    return true;
  });
  return caught;
}

test('enumerate lists every recoverable copy kind with its source and expiry', async () => {
  const inventory = new RecoveryInventory({
    now: () => NOW,
    sources: [
      staticSource('neon-history', [copy({ id: 'pitr_window', kind: 'database_history', created_at: at(-7 * DAY + 60_000), expires_at: at(60_000) })]),
      staticSource('neon-branches', [copy({ id: 'br_1', kind: 'database_branch', created_at: at(-2 * DAY), expires_at: at(DAY) })]),
      staticSource('neon-snapshots', [copy({ id: 'snap_1', kind: 'manual_snapshot', created_at: at(-3 * DAY), expires_at: at(2 * DAY) })]),
      staticSource('recovery-store', [copy({ id: 'bk_1' }), copy({ id: 'bk_1_objects', kind: 'object_backup' })]),
      staticSource('restore-ledger', [copy({ id: 'gogospend_restore_abcdef12', kind: 'restore_copy', environment: 'non_production', synthetic: true, created_at: at(-3_600_000), expires_at: at(DAY) })]),
    ],
  });
  const copies = await inventory.enumerate();
  assert.deepEqual(new Set(copies.map((entry) => entry.kind)), new Set(COPY_KINDS));
  assert.equal(copies.length, 6);
  assert.deepEqual(copies.map((entry) => entry.created_at), copies.map((entry) => entry.created_at).sort());
  for (const entry of copies) {
    assert.ok(entry.source.length > 0);
    assert.ok(Date.parse(entry.expires_at) - Date.parse(entry.created_at) <= 7 * DAY);
  }
  assert.equal(copies.find((entry) => entry.id === 'br_1').source, 'neon-branches');
});

test('a copy kept longer than 7 days is refused', async () => {
  const inventory = new RecoveryInventory({
    now: () => NOW,
    sources: [staticSource('neon-branches', [copy({ id: 'br_long', kind: 'database_branch', created_at: at(-DAY), expires_at: at(6 * DAY + 1000) })])],
  });
  const error = await rejectsWith(inventory.enumerate(), 'RETENTION_VIOLATION');
  assert.deepEqual(error.details.violations, [{ id: 'br_long', source: 'neon-branches', reason: 'retention_exceeds_7_days' }]);
});

test('exactly 7 days of retention is accepted', async () => {
  const inventory = new RecoveryInventory({ now: () => NOW, sources: [staticSource('s', [copy({ created_at: at(-DAY), expires_at: at(6 * DAY) })])] });
  assert.equal((await inventory.enumerate()).length, 1);
});

test('a copy with no expiry is refused as unbounded', async () => {
  const inventory = new RecoveryInventory({ now: () => NOW, sources: [staticSource('neon-snapshots', [copy({ id: 'snap_forever', kind: 'manual_snapshot', expires_at: null })])] });
  const error = await rejectsWith(inventory.enumerate(), 'RETENTION_VIOLATION');
  assert.deepEqual(error.details.violations, [{ id: 'snap_forever', source: 'neon-snapshots', reason: 'retention_unbounded' }]);
});

test('a copy expiring more than 7 days from now is refused whatever its claimed start', async () => {
  const inventory = new RecoveryInventory({ now: () => NOW, sources: [staticSource('s', [copy({ id: 'odd', created_at: at(2 * DAY), expires_at: at(8 * DAY) })])] });
  const error = await rejectsWith(inventory.enumerate(), 'RETENTION_VIOLATION');
  assert.deepEqual(error.details.violations, [{ id: 'odd', source: 's', reason: 'expiry_beyond_7_days' }]);
});

test('a copy still present after its expiry is reported as expiry not enforced', async () => {
  const inventory = new RecoveryInventory({ now: () => NOW, sources: [staticSource('r2-recovery-objects', [copy({ id: 'old', kind: 'object_backup', created_at: at(-8 * DAY), expires_at: at(-DAY) })])] });
  const error = await rejectsWith(inventory.enumerate(), 'RETENTION_VIOLATION');
  assert.deepEqual(error.details.violations, [{ id: 'old', source: 'r2-recovery-objects', reason: 'past_expiry' }]);
});

test('non-production copies must hold synthetic data only', async () => {
  const inventory = new RecoveryInventory({ now: () => NOW, sources: [staticSource('staging', [copy({ id: 'stg', environment: 'non_production', synthetic: false })])] });
  const error = await rejectsWith(inventory.enumerate(), 'RETENTION_VIOLATION');
  assert.deepEqual(error.details.violations, [{ id: 'stg', source: 'staging', reason: 'non_production_real_data' }]);
});

test('a failing source refuses the whole inventory and leaks nothing', async () => {
  const { lines, log } = capture();
  const failing = {
    name: 'neon-branches',
    async list() {
      throw new Error(`GET https://console.neon.invalid/api?token=${SECRETS[1]} for postgres://ops:${SECRETS[0]}@db.invalid/prod amount_minor=${SECRETS[2]} ${SECRETS[3]}`);
    },
  };
  const inventory = new RecoveryInventory({ now: () => NOW, log, sources: [staticSource('ok', [copy()]), failing] });
  const error = await rejectsWith(inventory.enumerate(), 'INVENTORY_SOURCE_FAILED');
  assert.equal(error.details.source, 'neon-branches');
  assertLeaksNothing(error, lines.join('\n'));
});

test('report names hosted sources as SKIPPED and is not complete', async () => {
  const inventory = new RecoveryInventory({ now: () => NOW, sources: [staticSource('recovery-store', [copy()])], skipped: HOSTED_INVENTORY_SKIPPED });
  const report = await inventory.report();
  assert.equal(report.complete, false);
  assert.deepEqual(report.skipped.map((entry) => entry.source).sort(), ['neon-branches', 'neon-history', 'neon-snapshots', 'r2-recovery-objects']);
  for (const entry of report.skipped) assert.equal(entry.reason, 'e1_not_authorized');
  assert.equal(report.copies.length, 1);
});

test('a marker is clearable only after every copy taken before the erasure has expired', async () => {
  const marker = { recorded_at: at(-2 * DAY) };
  const sources = [
    staticSource('a', [
      copy({ id: 'before_1', created_at: at(-3 * DAY), expires_at: at(4 * DAY) }),
      copy({ id: 'before_2', created_at: at(-4 * DAY), expires_at: at(3 * DAY) }),
      copy({ id: 'after', created_at: at(-DAY), expires_at: at(6 * DAY) }),
    ]),
  ];
  const inventory = new RecoveryInventory({ now: () => NOW, sources });
  assert.equal(await inventory.markerClearableAt(marker), at(4 * DAY));
  assert.equal(await inventory.canClearMarker(marker), false);
  const later = new RecoveryInventory({ now: () => new Date(NOW.getTime() + 4 * DAY), sources: [staticSource('a', [copy({ id: 'after', created_at: at(-DAY), expires_at: at(6 * DAY) })])] });
  assert.equal(await later.canClearMarker(marker), true);
  const incomplete = new RecoveryInventory({ now: () => new Date(NOW.getTime() + 4 * DAY), sources: [staticSource('a', [])], skipped: HOSTED_INVENTORY_SKIPPED });
  assert.equal(await incomplete.canClearMarker(marker), false);
});

async function withStoreDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'gogospend-recovery-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const fakeDump = (text) => ({ label: 'synthetic', dump: () => ({ stream: Readable.from([Buffer.from(text)]), done: Promise.resolve() }) });

test('local backups and restore-created copies appear in the inventory with expiry', async () => {
  await withStoreDir(async (dir) => {
    const key = RecoveryKey.generate();
    const store = localRecoveryStore({ dir });
    const receipt = await runDailyBackup({ database: fakeDump('{"synthetic":true}'), attachments: memoryAttachmentSource(new Map([['receipts/a/1.jpg', Buffer.from('jpeg')]])), store, key, now: NOW, environment: 'non_production', synthetic: true });
    const ledger = localRestoreLedger({ dir });
    await ledger.record({ id: 'gogospend_restore_0a1b2c3d', created_at: NOW.toISOString(), expires_at: at(DAY), environment: 'non_production', synthetic: true });
    const inventory = new RecoveryInventory({ now: () => NOW, sources: [recoveryStoreSource(store), restoreLedgerSource(ledger)] });
    const copies = await inventory.enumerate();
    assert.deepEqual(copies.map((entry) => entry.kind).sort(), ['logical_backup', 'object_backup', 'restore_copy']);
    for (const entry of copies) assert.ok(Date.parse(entry.expires_at) - Date.parse(entry.created_at) <= 7 * DAY);
    assert.ok(copies.some((entry) => entry.id === receipt.backup_id));
    await ledger.markDropped('gogospend_restore_0a1b2c3d', NOW);
    assert.deepEqual((await inventory.enumerate()).map((entry) => entry.kind).sort(), ['logical_backup', 'object_backup']);
  });
});

test('a restore-created copy recorded with more than 7 days of retention is refused', async () => {
  await withStoreDir(async (dir) => {
    const ledger = localRestoreLedger({ dir });
    await rejectsWith(ledger.record({ id: 'gogospend_restore_0a1b2c3d', created_at: NOW.toISOString(), expires_at: at(7 * DAY + 1), environment: 'non_production', synthetic: true }), 'RETENTION_EXCEEDS_LIMIT');
  });
});

test('expired local backups are pruned by the 7-day lifecycle', async () => {
  await withStoreDir(async (dir) => {
    const key = RecoveryKey.generate();
    const store = localRecoveryStore({ dir });
    const common = { attachments: memoryAttachmentSource(new Map()), store, key, environment: 'non_production', synthetic: true };
    const old = await runDailyBackup({ ...common, database: fakeDump('old'), now: new Date(NOW.getTime() - 8 * DAY) });
    const fresh = await runDailyBackup({ ...common, database: fakeDump('new'), now: NOW });
    assert.equal(fresh.pruned, 1);
    const ids = (await store.list()).map((manifest) => manifest.id);
    assert.deepEqual(ids, [fresh.backup_id]);
    assert.ok(!ids.includes(old.backup_id));
  });
});
