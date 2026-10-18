// P6a: every recoverable copy is inventoried with an expiry no more than
// 7 days after it was taken, provider sources fail closed, and an erasure
// marker becomes clearable only once every copy that could hold the erased
// principal has expired. Hermetic: no Docker, provider or network access.
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
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

// P5 records the marker first and purges later: a backup taken between the
// two still holds the account, so clearing keys on the purge, not the marker.
test('a marker is clearable only after every copy taken before the purge completed has expired', async () => {
  const H = 3_600_000;
  const T = NOW.getTime() - 6 * DAY - 3 * H;
  const iso = (ms) => new Date(ms).toISOString();
  const marker = { recorded_at: iso(T), purged_at: iso(T + 20 * H) };
  const all = [
    copy({ id: 'bk_before', created_at: iso(T - 22 * H), expires_at: iso(T - 22 * H + 7 * DAY) }),
    copy({ id: 'bk_in_purge_window', created_at: iso(T + 2 * H), expires_at: iso(T + 2 * H + 7 * DAY) }),
    copy({ id: 'bk_after_purge', created_at: iso(T + 21 * H), expires_at: iso(T + 21 * H + 7 * DAY) }),
  ];
  const liveAt = (time) => new RecoveryInventory({ now: () => new Date(time), sources: [staticSource('recovery-store', all.filter((entry) => Date.parse(entry.expires_at) > time))] });
  // bk_before has expired; bk_in_purge_window still holds the account for ~23 h.
  const now = liveAt(NOW.getTime());
  assert.equal(await now.markerClearableAt(marker), iso(T + 2 * H + 7 * DAY));
  assert.equal(await now.canClearMarker(marker), false);
  const later = liveAt(T + 2 * H + 7 * DAY + 1000);
  assert.equal(await later.canClearMarker(marker), true);
  const incomplete = new RecoveryInventory({ now: () => new Date(T + 8 * DAY), sources: [staticSource('a', [])], skipped: HOSTED_INVENTORY_SKIPPED });
  assert.equal(await incomplete.canClearMarker(marker), false);
});

test('a marker whose purge is not recorded as complete is never clearable', async () => {
  const marker = { recorded_at: at(-30 * DAY) };
  const inventory = new RecoveryInventory({ now: () => NOW, sources: [staticSource('a', [])] });
  assert.equal(await inventory.markerClearableAt(marker), null);
  assert.equal(await inventory.canClearMarker(marker), false);
  assert.equal(await inventory.canClearMarker({ ...marker, purged_at: null }), false);
});

test('point-in-time history holds a purged account until the purge itself leaves the window', async () => {
  const marker = { recorded_at: at(-3 * DAY), purged_at: at(-2 * DAY) };
  // A rolling 7-day window: its oldest point expires now, but the points just
  // before the purge stay restorable until purge + 7 days.
  const history = copy({ id: 'pitr_window', kind: 'database_history', created_at: at(-7 * DAY + 60_000), expires_at: at(60_000) });
  const inventory = new RecoveryInventory({ now: () => NOW, sources: [staticSource('neon-history', [history])] });
  assert.equal(await inventory.markerClearableAt(marker), at(5 * DAY));
  assert.equal(await inventory.canClearMarker(marker), false);
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

async function editManifest(dir, id, edit) {
  const path = join(dir, `${id}.manifest.json`);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  edit(manifest);
  await writeFile(path, JSON.stringify(manifest));
}

test('retention uses the backup id time, not editable manifest dates', async () => {
  await withStoreDir(async (dir) => {
    const key = RecoveryKey.generate();
    const store = localRecoveryStore({ dir });
    const common = { attachments: memoryAttachmentSource(new Map()), store, key, environment: 'non_production', synthetic: true };
    const old = await runDailyBackup({ ...common, database: fakeDump('old'), now: new Date(NOW.getTime() - 30 * DAY) });
    // A store writer without the key makes the 30-day-old set look fresh.
    await editManifest(dir, old.backup_id, (manifest) => {
      manifest.created_at = new Date(NOW.getTime() - 3_600_000).toISOString();
      manifest.expires_at = new Date(NOW.getTime() + 6 * DAY).toISOString();
    });
    const listed = await new RecoveryInventory({ now: () => NOW, sources: [recoveryStoreSource(store)] }).enumerate().catch((error) => error);
    assert.equal(listed.code, 'RETENTION_VIOLATION');
    assert.ok(listed.details.violations.some((violation) => violation.id === old.backup_id && violation.reason === 'past_expiry'));
    const fresh = await runDailyBackup({ ...common, database: fakeDump('new'), now: NOW });
    assert.equal(fresh.pruned, 1);
    assert.deepEqual((await store.list()).map((manifest) => manifest.id), [fresh.backup_id]);
  });
});

test('an unverifiable manifest is a violation for a key holder, and its file time also bounds retention', async () => {
  await withStoreDir(async (dir) => {
    const key = RecoveryKey.generate();
    const writer = localRecoveryStore({ dir });
    const set = await runDailyBackup({ database: fakeDump('x'), attachments: memoryAttachmentSource(new Map()), store: writer, key, now: new Date(NOW.getTime() - DAY), environment: 'non_production', synthetic: true });
    await editManifest(dir, set.backup_id, (manifest) => {
      manifest.expires_at = new Date(NOW.getTime() + 5 * DAY).toISOString();
    });
    const keyed = localRecoveryStore({ dir, key });
    const error = await new RecoveryInventory({ now: () => NOW, sources: [recoveryStoreSource(keyed)] }).enumerate().catch((failure) => failure);
    assert.equal(error.code, 'RETENTION_VIOLATION');
    assert.ok(error.details.violations.some((violation) => violation.id === set.backup_id && violation.reason === 'manifest_unverified'));
    // Files older than the id claims: an unverified set falls back to them.
    const old = new Date(NOW.getTime() - 9 * DAY);
    for (const name of await readdir(dir)) if (name.startsWith(set.backup_id)) await utimes(join(dir, name), old, old);
    assert.equal(await keyed.prune(NOW), 1);
    assert.deepEqual(await readdir(dir), []);
  });
});

test('files the store does not recognise are violations and are pruned by age', async () => {
  await withStoreDir(async (dir) => {
    const store = localRecoveryStore({ dir });
    const names = ['bk_20260801T000000Z_abcdef.db.enc.bak', 'manual-copy.dump', 'bk_20260801T000000Z_abcdef.manifest.json.old'];
    for (const name of names) await writeFile(join(dir, name), 'x', { mode: 0o600 });
    const error = await new RecoveryInventory({ now: () => NOW, sources: [recoveryStoreSource(store)] }).enumerate().catch((failure) => failure);
    assert.equal(error.code, 'RETENTION_VIOLATION');
    assert.equal(error.details.violations.length, 3);
    for (const violation of error.details.violations) assert.equal(violation.reason, 'unaccounted_file');
    assert.equal(await store.prune(new Date()), 0);
    assert.equal((await readdir(dir)).length, 3, 'young unknown files are kept and flagged');
    const old = new Date(Date.now() - 8 * DAY);
    for (const name of names) await utimes(join(dir, name), old, old);
    await store.prune(new Date());
    assert.deepEqual(await readdir(dir), []);
  });
});
