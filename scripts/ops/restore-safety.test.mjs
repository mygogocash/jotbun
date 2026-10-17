// P6a: backups are encrypted streams with owner-only, 7-day copies; a restore
// refuses any serving, production or non-isolated target and any missing
// erasure registry, key custody or usable backup before it touches data; it
// reapplies the independent erasure markers and checks retained attachment
// references before anything could switch traffic; and no failure path leaks
// credentials or financial values. Hermetic: fakes stand in for PostgreSQL and
// object storage (the Docker rehearsal is `npm run ops:rehearsal:local`).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createCipheriv, createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { chmod, mkdtemp, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';

import { findRecoveryCredentialNames, localDockerDump, localRecoveryStore, memoryAttachmentSource, runDailyBackup } from './backup.mjs';
import { SubjectLookupKey, memoryMarkerSource } from './erasure-markers.mjs';
import { createOpsLog, OpsError } from './ops-safety.mjs';
import { decryptStream, encryptStream, manifestMac, readRecoveryKeyFromFd, RecoveryKey } from './recovery-crypto.mjs';
import { localRestoreLedger } from './recovery-inventory.mjs';
import { restoreRehearsal } from './restore-rehearsal.mjs';

const DAY = 86_400_000;
const NOW = new Date('2026-10-17T03:00:00.000Z');
const BACKUP_AT = new Date('2026-10-16T18:00:00.000Z');
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ISSUER = 'https://auth.gogospend.invalid/';
const SYNTHETIC_PASSWORD = 'SyntheticPassw0rd-DO-NOT-USE';
const SYNTHETIC_ACCESS_KEY = 'AKIASYNTHETIC0000KEY';
const SYNTHETIC_AMOUNT = '987654321';
const SYNTHETIC_BAHT = '฿9,876,543.21';
const CANARY = 'SYNTHETIC-PLAINTEXT-CANARY-7f3a';
const SECRETS = [SYNTHETIC_PASSWORD, SYNTHETIC_ACCESS_KEY, SYNTHETIC_AMOUNT, SYNTHETIC_BAHT, CANARY];
const LEAKY = `connect postgres://backup_user:${SYNTHETIC_PASSWORD}@db.invalid:5432/prod key=${SYNTHETIC_ACCESS_KEY} amount_minor=${SYNTHETIC_AMOUNT} ${SYNTHETIC_BAHT} ${CANARY}`;

const ACCOUNT = {
  kept: '0a000000-0000-4000-8000-000000000001',
  erased: '0b000000-0000-4000-8000-000000000002',
  folded: '0d000000-0000-4000-8000-000000000004',
  reborn: '0e000000-0000-4000-8000-000000000005',
};
const SUBJECT = { kept: 'apple|kept-0001', erased: 'apple|erased-0002', folded: 'auth0|linked-0004', reborn: 'apple|reborn-0005' };

// The synthetic "database": a JSON dump the memory restorer understands.
// Principal digests follow gogospend_principal_digest: sha256(issuer 0x00 subject).
function digestOf(subject) {
  return createHash('sha256').update(Buffer.concat([Buffer.from(ISSUER), Buffer.from([0]), Buffer.from(subject)])).digest('hex');
}

function objectBytes(ref) {
  return Buffer.from(`jpeg ${ref}`);
}

function syntheticDatabase({ padding = 0 } = {}) {
  const identity = (who, created) => ({ issuer: ISSUER, subject: SUBJECT[who], account_id: ACCOUNT[who], created_at: created });
  const txn = (who, n) => ({ account_id: ACCOUNT[who], id: randomUUID(), amount_minor: SYNTHETIC_AMOUNT, note: `${CANARY} ${SYNTHETIC_BAHT} #${n}` });
  const ref = (who, name) => {
    const path = `receipt/${ACCOUNT[who]}/${name}.jpg`;
    return { account_id: ACCOUNT[who], ref: path, sha256: createHash('sha256').update(objectBytes(path)).digest('hex') };
  };
  return {
    tables: {
      accounts: Object.keys(ACCOUNT).map((who) => ({ id: ACCOUNT[who] })),
      account_identities: [
        identity('kept', '2026-10-01T00:00:00.000Z'),
        identity('erased', '2026-10-01T00:00:00.000Z'),
        identity('folded', '2026-10-01T00:00:00.000Z'),
        // Signed up again after the marker was recorded: a new account, kept.
        identity('reborn', '2026-10-16T12:00:00.000Z'),
      ],
      transactions: [txn('kept', 1), txn('kept', 2), txn('erased', 1), txn('folded', 1), txn('reborn', 1)],
      attachment_refs: [ref('kept', 'r1'), ref('erased', 'r2'), ref('folded', 'r3')],
      // Principal-digest tables: an event receipt whose account link was set
      // to NULL, and a reconcile check keyed by digest alone.
      auth_event_receipts: [
        { principal_digest: digestOf(SUBJECT.kept), account_id: ACCOUNT.kept },
        { principal_digest: digestOf(SUBJECT.erased), account_id: null },
        { principal_digest: digestOf(SUBJECT.folded), account_id: ACCOUNT.folded },
      ],
      security_reconcile_checks: [{ principal_digest: digestOf(SUBJECT.erased) }, { principal_digest: digestOf(SUBJECT.reborn) }],
      // No foreign key to accounts: cleanup jobs outlive their account, so a
      // backup taken mid-purge can hold one for an account row already gone.
      jobs: [{ account_id: ACCOUNT.kept }, { account_id: '0c000000-0000-4000-8000-00000000000c' }],
      blocked_principals: [],
      ...(padding ? { padding: [{ text: 'p'.repeat(padding) }] } : {}),
    },
  };
}

function objectsFor(database, { omit = [], corrupt = [] } = {}) {
  return new Map(database.tables.attachment_refs
    .filter(({ ref }) => !omit.includes(ref))
    .map(({ ref }) => [ref, corrupt.includes(ref) ? Buffer.from(`altered ${ref}`) : objectBytes(ref)]));
}

function jsonDump(value) {
  return { label: 'synthetic-json', dump: () => ({ stream: Readable.from([Buffer.from(JSON.stringify(value))]), done: Promise.resolve() }) };
}

// Accepts the plan object (accountIds, principalDigests, blocks) or, from older
// callers, a bare account-id list.
function memoryRestorer({ failRestore, skipErasure, skipDigests, host = '127.0.0.1' } = {}) {
  const calls = [];
  const databases = new Map();
  const dropped = new Map();
  const digestTables = new Set(['auth_event_receipts', 'security_reconcile_checks']);
  const owned = (table, row) => (table === 'accounts' ? row.id : row.account_id);
  const planOf = (plan) => (Array.isArray(plan) ? { accountIds: plan, principalDigests: [] } : plan);
  return {
    kind: 'memory',
    calls,
    dropped,
    endpoint: () => ({ host }),
    async create(target) {
      calls.push(['create', target.database]);
      if (databases.has(target.database)) throw new Error('exists');
      databases.set(target.database, null);
    },
    async restore(target, readable) {
      calls.push(['restore', target.database]);
      const chunks = [];
      for await (const chunk of readable) chunks.push(chunk);
      if (failRestore) throw failRestore;
      databases.set(target.database, JSON.parse(Buffer.concat(chunks).toString('utf8')));
    },
    async identities(target) {
      return databases.get(target.database).tables.account_identities.map(({ issuer, subject, account_id, created_at }) => ({ issuer, subject, account_id, created_at }));
    },
    async existingAccounts(target, accountIds) {
      const present = new Set(databases.get(target.database).tables.accounts.map((row) => row.id));
      return accountIds.filter((id) => present.has(id));
    },
    async applyErasure(target, rawPlan) {
      const plan = planOf(rawPlan);
      calls.push(['applyErasure', plan.accountIds.length]);
      if (skipErasure) return { principalsBlocked: 0 };
      const { tables } = databases.get(target.database);
      const ids = new Set(plan.accountIds);
      const digests = new Set(skipDigests ? [] : plan.principalDigests ?? []);
      const blocks = plan.blocks ?? tables.account_identities.filter((identity) => ids.has(identity.account_id)).map((identity) => ({ digest: digestOf(identity.subject), until: null }));
      for (const block of blocks) tables.blocked_principals.push({ principal_digest: block.digest, blocked_until: block.until });
      for (const [name, rows] of Object.entries(tables)) {
        if (name === 'blocked_principals') continue;
        tables[name] = rows.filter((row) => !ids.has(owned(name, row)) && !(digestTables.has(name) && digests.has(row.principal_digest)));
      }
      return { principalsBlocked: blocks.length };
    },
    async ownerRows(target, rawPlan) {
      const plan = planOf(rawPlan);
      const ids = new Set(plan.accountIds);
      const digests = new Set(plan.principalDigests ?? []);
      const { tables } = databases.get(target.database);
      return Object.entries(tables)
        .filter(([table]) => table !== 'blocked_principals')
        .map(([table, rows]) => ({ table, rows: rows.filter((row) => ids.has(owned(table, row)) || (digestTables.has(table) && digests.has(row.principal_digest))).length }))
        .filter((entry) => entry.rows > 0);
    },
    async attachmentReferences(target) {
      return databases.get(target.database).tables.attachment_refs.map(({ account_id, ref, sha256 }) => ({ account_id, ref, sha256 }));
    },
    async drop(target) {
      calls.push(['drop', target.database]);
      dropped.set(target.database, databases.get(target.database));
      databases.delete(target.database);
    },
  };
}

function spyStore(store) {
  const calls = [];
  const proxy = new Proxy(store, {
    get(target, property) {
      const value = target[property];
      if (typeof value !== 'function') return value;
      return (...args) => {
        calls.push(String(property));
        return value.apply(target, args);
      };
    },
  });
  return { store: proxy, calls };
}

function capture() {
  const lines = [];
  return { lines, log: { event: (name, fields) => lines.push(JSON.stringify({ name, ...fields })) } };
}

function assertLeaksNothing(...values) {
  const text = values.map((value) => (typeof value === 'string' ? value : `${inspect(value, { depth: 8 })} ${JSON.stringify(value)} ${value?.stack ?? ''} ${value?.cause ? inspect(value.cause) : ''}`)).join('\n');
  for (const secret of SECRETS) assert.ok(!text.includes(secret), `leaked ${secret}`);
}

async function rejectsWith(promise, code) {
  let caught;
  await assert.rejects(promise, (error) => {
    caught = error;
    assert.equal(error?.code, code, `expected ${code}, got ${error?.code}`);
    return true;
  });
  return caught;
}

async function withDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'gogospend-recovery-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// One encrypted backup set of the synthetic database, plus markers for the
// erased account (by id), the folded alias (by subject) and an account that
// is not in the backup at all.
async function scenario(dir, {
  omitObjects = [], corruptObjects = [], backupAt = BACKUP_AT, database = syntheticDatabase(), environment = 'non_production', synthetic = true,
  erasedExtras = {}, foldedExtras = {}, key = RecoveryKey.generate(),
} = {}) {
  const lookupKey = SubjectLookupKey.generate();
  const store = localRecoveryStore({ dir });
  const backup = await runDailyBackup({
    database: jsonDump(database), attachments: memoryAttachmentSource(objectsFor(database, { omit: omitObjects, corrupt: corruptObjects })),
    store, key, now: backupAt, environment, synthetic,
  });
  const marker = (accountId, subjects, recordedAt, extras = {}) => ({
    marker_id: randomUUID(), account_id: accountId, subject_lookups: subjects.map((subject) => lookupKey.lookup(ISSUER, subject)),
    lookup_key_id: lookupKey.id, recorded_at: recordedAt, ...extras,
  });
  const markers = [
    marker(ACCOUNT.erased, [SUBJECT.erased], '2026-10-16T20:00:00.000Z', erasedExtras),
    marker('0f000000-0000-4000-8000-00000000000f', [SUBJECT.folded, SUBJECT.reborn], '2026-10-16T06:00:00.000Z', foldedExtras),
    marker('0c000000-0000-4000-8000-00000000000c', ['apple|never-backed-up'], '2026-10-16T21:00:00.000Z'),
  ];
  return { key, lookupKey, store, backup, markers, ledger: localRestoreLedger({ dir }) };
}

function target(overrides = {}) {
  return { label: 'rehearsal', kind: 'memory', environment: 'rehearsal', serving: false, isolated: true, host: '127.0.0.1', database: 'gogospend_restore_0a1b2c3d', ...overrides };
}

function input(s, overrides = {}) {
  return {
    target: target(), restorer: memoryRestorer(), store: s.store, backupId: 'latest', recoveryKey: s.key,
    markers: memoryMarkerSource({ markers: s.markers, key: s.lookupKey }), ledger: s.ledger, now: NOW, log: capture().log,
    ...overrides,
  };
}

test('restore_reapplies_external_erasure_registry', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    const restorer = memoryRestorer();
    const { lines, log } = capture();
    const receipt = await restoreRehearsal(input(s, { restorer, log }));
    const erasedOwnerRows = receipt.erased_owner_rows;
    const missingRetainedObjects = receipt.missing_retained_objects;
    assert.deepEqual(erasedOwnerRows, []);
    assert.deepEqual(missingRetainedObjects, []);
    assert.deepEqual(receipt.markers, { total: 3, applied: 2, not_present: 1 });
    assert.equal(receipt.accounts_erased, 2);
    assert.equal(receipt.principals_blocked, 2);
    assert.deepEqual(receipt.attachments, { references_checked: 1, objects_in_copy: 3, unreferenced_objects_not_restored: 2, schema_has_references: true });
    assert.equal(receipt.ready_for_serving_switch, true);
    assert.equal(receipt.serving_switch, 'not_performed');
    assert.equal(receipt.target_dropped, true);
    assert.deepEqual(receipt.target, { label: 'rehearsal', kind: 'memory', isolated: true, serving: false });
    assert.equal(receipt.backup.id, s.backup.backup_id);
    const restored = restorer.dropped.get('gogospend_restore_0a1b2c3d').tables;
    assert.deepEqual(restored.accounts.map((row) => row.id).sort(), [ACCOUNT.kept, ACCOUNT.reborn]);
    assert.equal(restored.transactions.filter((row) => row.account_id === ACCOUNT.kept).length, 2);
    // No marker records a block end, so both erased aliases are blocked with
    // no end (see m7 / P5 TODO in erasure-markers.mjs).
    assert.deepEqual(restored.blocked_principals.map((row) => `${row.principal_digest}:${row.blocked_until}`).sort(), [`${digestOf(SUBJECT.erased)}:null`, `${digestOf(SUBJECT.folded)}:null`].sort());
    // Principal-digest rows of erased aliases go too, including the receipt
    // whose account link was already NULL.
    assert.deepEqual(restored.auth_event_receipts.map((row) => row.principal_digest), [digestOf(SUBJECT.kept)]);
    assert.deepEqual(restored.security_reconcile_checks.map((row) => row.principal_digest), [digestOf(SUBJECT.reborn)]);
    // A marker's account id is erased even when its account row is gone.
    assert.deepEqual(restored.jobs.map((row) => row.account_id), [ACCOUNT.kept]);
    assertLeaksNothing(receipt, lines.join('\n'));
    for (const subject of Object.values(SUBJECT)) assert.ok(!JSON.stringify(receipt).includes(subject));
    for (const subject of Object.values(SUBJECT)) assert.ok(!JSON.stringify(receipt).includes(digestOf(subject)));
  });
});

test('principal-digest rows left behind block the serving switch', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    const restorer = memoryRestorer({ skipDigests: true });
    const error = await rejectsWith(restoreRehearsal(input(s, { restorer })), 'ERASURE_NOT_APPLIED');
    assert.ok(error.details.tables.includes('auth_event_receipts'));
    assert.ok(error.details.tables.includes('security_reconcile_checks'));
    assert.deepEqual(restorer.calls.at(-1), ['drop', 'gogospend_restore_0a1b2c3d']);
  });
});

test('re-blocking replays the block end each marker records', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir, {
      erasedExtras: { blocked_until: '2026-10-01T00:00:00.000Z', purged_at: '2026-10-16T22:00:00.000Z' },
      foldedExtras: { blocked_until: '2026-10-20T00:00:00.000Z' },
    });
    const restorer = memoryRestorer();
    const receipt = await restoreRehearsal(input(s, { restorer }));
    const restored = restorer.dropped.get('gogospend_restore_0a1b2c3d').tables;
    // The erased alias's block already ended; the folded alias stays blocked until its recorded end.
    assert.deepEqual(restored.blocked_principals.map((row) => `${row.principal_digest}:${row.blocked_until}`), [`${digestOf(SUBJECT.folded)}:2026-10-20T00:00:00.000Z`]);
    assert.equal(receipt.principals_blocked, 1);
    assert.equal(receipt.accounts_erased, 2);
    assert.equal(restored.accounts.some((row) => row.id === ACCOUNT.erased), false);
  });
});

test('a real-data backup is never restored into a non-production target', async () => {
  for (const [environment, synthetic] of [['production', false], ['production', true], ['non_production', false]]) {
    await withDir(async (dir) => {
      const s = environment === 'non_production'
        ? await scenario(dir)
        : await scenario(dir, { environment, synthetic });
      if (environment === 'non_production') {
        // A non-synthetic non-production backup cannot be written; plant one
        // with a valid MAC, as a key holder could.
        const name = (await readdir(dir)).find((file) => file.endsWith('.manifest.json'));
        const manifest = JSON.parse(await readFile(join(dir, name), 'utf8'));
        manifest.synthetic = false;
        manifest.mac = manifestMac(s.key, manifest);
        await writeFile(join(dir, name), JSON.stringify(manifest));
      }
      const restorer = memoryRestorer();
      await rejectsWith(restoreRehearsal(input(s, { restorer })), 'RESTORE_DATA_CLASS_MISMATCH');
      assert.deepEqual(restorer.calls, []);
    });
  }
});

test('the isolation check uses the endpoint the restorer will really use', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    for (const restorer of [memoryRestorer({ host: '10.0.0.5' }), memoryRestorer({ host: 'db.prod.invalid' }), memoryRestorer({ host: '/var/run/postgresql' }), { ...memoryRestorer(), endpoint: undefined }]) {
      await rejectsWith(restoreRehearsal(input(s, { restorer })), 'RESTORE_TARGET_NOT_ISOLATED');
      assert.deepEqual(restorer.calls, []);
    }
  });
});

const ADMIN_URL_ENV = 'GOGOSPEND_TEST_ADMIN_URL';
async function withAdminUrl(value, extraEnv, fn) {
  const saved = { [ADMIN_URL_ENV]: process.env[ADMIN_URL_ENV], ...Object.fromEntries(Object.keys(extraEnv).map((name) => [name, process.env[name]])) };
  if (value === undefined) delete process.env[ADMIN_URL_ENV];
  else process.env[ADMIN_URL_ENV] = value;
  Object.assign(process.env, extraEnv);
  try {
    return await fn();
  } finally {
    for (const [name, previous] of Object.entries(saved)) {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
  }
}

test('the local adapter refuses any connection whose real host is not loopback, before connecting', async () => {
  const { localDockerRestorer } = await import('./local-postgres.mjs');
  const target = { database: 'gogospend_restore_0a1b2c3d' };
  for (const [url, env] of [
    ['postgres://u:p@127.0.0.1:55432/postgres?host=db.prod.invalid', {}],
    ['postgres://u:p@localhost/postgres?host=10.1.2.3&port=5432', {}],
    ['postgres://u:p@127.0.0.1/postgres?host=%2Fvar%2Frun%2Fother', {}],
    ['postgres://u:p@10.0.0.9:5432/postgres', {}],
    ['postgres:///postgres', { PGHOST: '10.1.2.3' }],
  ]) {
    await withAdminUrl(url, env, async () => {
      const restorer = localDockerRestorer();
      assert.throws(() => restorer.endpoint(), (error) => error.code === 'RESTORE_TARGET_NOT_ISOLATED', url);
      await rejectsWith(restorer.create(target), 'RESTORE_TARGET_NOT_ISOLATED');
      await rejectsWith(restorer.ownerRows(target, { accountIds: [], principalDigests: [] }), 'RESTORE_TARGET_NOT_ISOLATED');
    });
  }
  await withAdminUrl(undefined, {}, async () => {
    assert.deepEqual(localDockerRestorer().endpoint(), { host: '127.0.0.1', port: 55432 });
  });
});

test('a retained attachment whose bytes changed blocks the serving switch', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir, { corruptObjects: [`receipt/${ACCOUNT.kept}/r1.jpg`] });
    const restorer = memoryRestorer();
    const error = await rejectsWith(restoreRehearsal(input(s, { restorer })), 'ATTACHMENT_REFERENCES_MISSING');
    assert.equal(error.details.missing, 1);
  });
});

test('latest falls back past a planted future-dated or unverifiable manifest', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    const name = `${s.backup.backup_id}.manifest.json`;
    const real = JSON.parse(await readFile(join(dir, name), 'utf8'));
    // A store writer without the key plants a newer set (bad MAC) and a
    // future-dated one; neither may block or hijack the restore.
    for (const [id, created] of [['bk_20261017T020000Z_aaaaaa', '2026-10-17T02:00:00.000Z'], ['bk_20991231T000000Z_bbbbbb', '2099-12-31T00:00:00.000Z']]) {
      const planted = { ...real, id, created_at: created, expires_at: new Date(Date.parse(created) + 6 * DAY).toISOString() };
      await writeFile(join(dir, `${id}.manifest.json`), JSON.stringify(planted), { mode: 0o600 });
      for (const part of ['db', 'objects']) await writeFile(join(dir, `${id}.${part}.enc`), await readFile(join(dir, `${s.backup.backup_id}.${part}.enc`)), { mode: 0o600 });
    }
    const receipt = await restoreRehearsal(input(s));
    assert.equal(receipt.backup.id, s.backup.backup_id);
    // A future-dated set that does verify (a key holder's clock error) is skipped too.
    const future = { ...real, id: 'bk_20991231T000000Z_cccccc', created_at: '2099-12-31T00:00:00.000Z', expires_at: '2100-01-06T00:00:00.000Z' };
    future.mac = manifestMac(s.key, future);
    await writeFile(join(dir, `${future.id}.manifest.json`), JSON.stringify(future), { mode: 0o600 });
    assert.equal((await restoreRehearsal(input(s))).backup.id, s.backup.backup_id);
  });
});

test('a decryption failure closes the backup file it was reading', async () => {
  const openDescriptors = async () => (await readdir('/dev/fd')).length;
  await withDir(async (dir) => {
    const s = await scenario(dir, { database: syntheticDatabase({ padding: 4 * 1024 * 1024 }) });
    await corrupt(dir, '.db.enc', (bytes) => { bytes[200] ^= 0x01; return bytes; });
    const before = await openDescriptors();
    await rejectsWith(restoreRehearsal(input(s)), 'BACKUP_INTEGRITY');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(await openDescriptors() <= before, 'a descriptor stayed open after the failed restore');
  });
});

const REFUSED_TARGETS = [
  ['a serving target', { serving: true }, 'RESTORE_TARGET_SERVING'],
  ['a target that does not say it is not serving', { serving: undefined }, 'RESTORE_TARGET_SERVING'],
  ['the local dev database', { database: 'gogospend_v1' }, 'RESTORE_TARGET_SERVING'],
  ['a production target', { environment: 'production' }, 'RESTORE_TARGET_PRODUCTION'],
  ['a non-isolated target', { isolated: false }, 'RESTORE_TARGET_NOT_ISOLATED'],
  ['a target with no isolation claim', { isolated: undefined }, 'RESTORE_TARGET_NOT_ISOLATED'],
  ['a database outside the disposable restore names', { database: 'customers_main' }, 'RESTORE_TARGET_NOT_ISOLATED'],
  ['a non-loopback host', { host: '10.0.0.5' }, 'RESTORE_TARGET_NOT_ISOLATED'],
  ['a hosted target (E1 not authorized)', { kind: 'hosted' }, 'HOSTED_ADAPTER_NOT_AUTHORIZED'],
];

for (const [name, overrides, code] of REFUSED_TARGETS) {
  test(`refuses ${name} before reading any backup or creating anything`, async () => {
    await withDir(async (dir) => {
      const s = await scenario(dir);
      const restorer = memoryRestorer();
      const spy = spyStore(s.store);
      await rejectsWith(restoreRehearsal(input(s, { target: target(overrides), restorer, store: spy.store })), code);
      assert.deepEqual(restorer.calls, []);
      assert.deepEqual(spy.calls, []);
    });
  });
}

test('refuses a missing target description', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    await rejectsWith(restoreRehearsal(input(s, { target: undefined })), 'RESTORE_TARGET_NOT_ISOLATED');
  });
});

const REFUSED_CUSTODY = [
  ['a missing erasure registry', (s) => ({ markers: undefined }), 'ERASURE_REGISTRY_MISSING'],
  ['a registry kept inside the backup being restored', (s) => ({ markers: memoryMarkerSource({ markers: s.markers, key: s.lookupKey, independent: false }) }), 'ERASURE_REGISTRY_NOT_INDEPENDENT'],
  ['an unavailable registry (never read as zero markers)', (s) => ({ markers: { independent: true, location: 'memory', async listMarkers() { throw new Error(LEAKY); }, async lookupKey() { return s.lookupKey; } } }), 'ERASURE_REGISTRY_UNAVAILABLE'],
  ['missing registry key custody', (s) => ({ markers: memoryMarkerSource({ markers: s.markers, key: undefined }) }), 'REGISTRY_KEY_CUSTODY_MISSING'],
  ['markers keyed with a different lookup key', (s) => ({ markers: memoryMarkerSource({ markers: s.markers, key: SubjectLookupKey.generate() }) }), 'REGISTRY_KEY_MISMATCH'],
  ['a marker carrying more than opaque keys', (s) => ({ markers: memoryMarkerSource({ markers: [{ ...s.markers[0], email: 'someone@example.invalid', amount_minor: SYNTHETIC_AMOUNT }], key: s.lookupKey }) }), 'ERASURE_MARKER_INVALID'],
  ['missing recovery key custody', () => ({ recoveryKey: undefined }), 'RECOVERY_KEY_CUSTODY_MISSING'],
  ['a missing restore-copy ledger', () => ({ ledger: undefined }), 'RESTORE_LEDGER_MISSING'],
];

for (const [name, overrides, code] of REFUSED_CUSTODY) {
  test(`refuses ${name} before reading any backup or creating anything`, async () => {
    await withDir(async (dir) => {
      const s = await scenario(dir);
      const restorer = memoryRestorer();
      const spy = spyStore(s.store);
      const { lines, log } = capture();
      const error = await rejectsWith(restoreRehearsal(input(s, { ...overrides(s), restorer, store: spy.store, log })), code);
      assert.deepEqual(restorer.calls, []);
      assert.deepEqual(spy.calls, []);
      assertLeaksNothing(error, lines.join('\n'));
    });
  });
}

test('refuses a different recovery key before creating a target', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    const restorer = memoryRestorer();
    await rejectsWith(restoreRehearsal(input(s, { restorer, recoveryKey: RecoveryKey.generate() })), 'RECOVERY_KEY_MISMATCH');
    assert.deepEqual(restorer.calls, []);
  });
});

test('refuses when no backup exists', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    const restorer = memoryRestorer();
    await rejectsWith(restoreRehearsal(input(s, { restorer, backupId: 'bk_20261016T000000Z_000000' })), 'BACKUP_MISSING');
    await withDir(async (empty) => {
      await rejectsWith(restoreRehearsal(input(s, { restorer, store: localRecoveryStore({ dir: empty }) })), 'BACKUP_MISSING');
    });
    assert.deepEqual(restorer.calls, []);
  });
});

test('refuses an expired backup', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    const restorer = memoryRestorer();
    const later = new Date(BACKUP_AT.getTime() + 7 * DAY + 1000);
    await rejectsWith(restoreRehearsal(input(s, { restorer, backupId: s.backup.backup_id, now: later })), 'BACKUP_EXPIRED');
    assert.deepEqual(restorer.calls, []);
  });
});

test('refuses a manifest edited to extend its expiry', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    const name = (await readdir(dir)).find((file) => file.endsWith('.manifest.json'));
    const manifest = JSON.parse(await readFile(join(dir, name), 'utf8'));
    manifest.created_at = new Date(NOW.getTime() - 1000).toISOString();
    manifest.expires_at = new Date(NOW.getTime() + 6 * DAY).toISOString();
    await writeFile(join(dir, name), JSON.stringify(manifest));
    const restorer = memoryRestorer();
    await rejectsWith(restoreRehearsal(input(s, { restorer, now: new Date(BACKUP_AT.getTime() + 8 * DAY) })), 'BACKUP_INTEGRITY');
    assert.deepEqual(restorer.calls, []);
  });
});

test('latest selects the newest unexpired backup', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    const newer = await runDailyBackup({ database: jsonDump(syntheticDatabase()), attachments: memoryAttachmentSource(objectsFor(syntheticDatabase())), store: s.store, key: s.key, now: new Date(BACKUP_AT.getTime() + 3_600_000), environment: 'non_production', synthetic: true });
    const receipt = await restoreRehearsal(input(s));
    assert.equal(receipt.backup.id, newer.backup_id);
  });
});

async function corrupt(dir, suffix, mutate) {
  const name = (await readdir(dir)).find((file) => file.endsWith(suffix));
  const path = join(dir, name);
  await writeFile(path, mutate(await readFile(path)));
}

test('tampered ciphertext refuses and drops the private target', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    await corrupt(dir, '.db.enc', (bytes) => { bytes[bytes.length - 40] ^= 0x01; return bytes; });
    const restorer = memoryRestorer();
    await rejectsWith(restoreRehearsal(input(s, { restorer })), 'BACKUP_INTEGRITY');
    assert.deepEqual(restorer.calls.at(-1), ['drop', 'gogospend_restore_0a1b2c3d']);
    assert.equal(restorer.calls.some(([step]) => step === 'applyErasure'), false);
  });
});

test('truncated ciphertext refuses', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    await corrupt(dir, '.db.enc', (bytes) => bytes.subarray(0, bytes.length - 20));
    const restorer = memoryRestorer();
    await rejectsWith(restoreRehearsal(input(s, { restorer })), 'BACKUP_INTEGRITY');
    assert.deepEqual(restorer.calls.at(-1), ['drop', 'gogospend_restore_0a1b2c3d']);
  });
});

test('erasure that leaves owner rows blocks the serving switch', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    const restorer = memoryRestorer({ skipErasure: true });
    const error = await rejectsWith(restoreRehearsal(input(s, { restorer })), 'ERASURE_NOT_APPLIED');
    assert.ok(error.details.tables.includes('accounts'));
    assert.ok(error.details.tables.includes('transactions'));
    assert.deepEqual(restorer.calls.at(-1), ['drop', 'gogospend_restore_0a1b2c3d']);
  });
});

test('a retained attachment missing from the object copy blocks the serving switch', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir, { omitObjects: [`receipt/${ACCOUNT.kept}/r1.jpg`] });
    const restorer = memoryRestorer();
    const error = await rejectsWith(restoreRehearsal(input(s, { restorer })), 'ATTACHMENT_REFERENCES_MISSING');
    assert.equal(error.details.missing, 1);
    assert.deepEqual(restorer.calls.at(-1), ['drop', 'gogospend_restore_0a1b2c3d']);
  });
});

test('the restore-created copy is inventoried with a bounded expiry and released when dropped', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    await restoreRehearsal(input(s));
    const entries = await s.ledger.entries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'gogospend_restore_0a1b2c3d');
    assert.equal(entries[0].status, 'dropped');
    assert.ok(Date.parse(entries[0].expires_at) - Date.parse(entries[0].created_at) <= DAY);
  });
});

test('backup files hold no plaintext and are owner-only', async () => {
  await withDir(async (dir) => {
    await scenario(dir);
    const files = await readdir(dir);
    assert.ok(files.some((file) => file.endsWith('.db.enc')));
    assert.ok(files.some((file) => file.endsWith('.objects.enc')));
    for (const file of files) {
      const bytes = await readFile(join(dir, file));
      for (const secret of [CANARY, SYNTHETIC_AMOUNT, SUBJECT.kept, 'jpeg receipt']) assert.equal(bytes.includes(Buffer.from(secret)), false, `${secret} in ${file}`);
      assert.equal((await stat(join(dir, file))).mode & 0o077, 0, `${file} is readable by others`);
    }
  });
});

test('the recovery store refuses a shared or in-repository directory', async () => {
  await withDir(async (dir) => {
    await chmod(dir, 0o755);
    assert.throws(() => localRecoveryStore({ dir }), (error) => error.code === 'RECOVERY_STORE_NOT_ISOLATED');
  });
  const inside = await mkdtemp(join(REPO_ROOT, '.ops-store-test-'));
  try {
    await chmod(inside, 0o700);
    assert.throws(() => localRecoveryStore({ dir: inside }), (error) => error.code === 'RECOVERY_STORE_NOT_ISOLATED');
  } finally {
    await rm(inside, { recursive: true, force: true });
  }
});

test('backup retention beyond 7 days is refused', async () => {
  await withDir(async (dir) => {
    const store = localRecoveryStore({ dir });
    await rejectsWith(runDailyBackup({ database: jsonDump({}), attachments: memoryAttachmentSource(new Map()), store, key: RecoveryKey.generate(), now: NOW, retentionMs: 7 * DAY + 1, environment: 'non_production', synthetic: true }), 'RETENTION_EXCEEDS_LIMIT');
    assert.deepEqual(await readdir(dir), []);
  });
});

test('a non-production backup must be synthetic', async () => {
  await withDir(async (dir) => {
    const store = localRecoveryStore({ dir });
    await rejectsWith(runDailyBackup({ database: jsonDump({}), attachments: memoryAttachmentSource(new Map()), store, key: RecoveryKey.generate(), now: NOW, environment: 'non_production', synthetic: false }), 'NON_PRODUCTION_REAL_DATA');
  });
});

test('a backup without key custody is refused', async () => {
  await withDir(async (dir) => {
    const store = localRecoveryStore({ dir });
    await rejectsWith(runDailyBackup({ database: jsonDump({}), attachments: memoryAttachmentSource(new Map()), store, key: undefined, now: NOW, environment: 'non_production', synthetic: true }), 'RECOVERY_KEY_CUSTODY_MISSING');
  });
});

test('the recovery key is refused from a plaintext file and accepted from a pipe', async () => {
  await withDir(async (dir) => {
    const path = join(dir, 'key.txt');
    const encoded = Buffer.alloc(32, 9).toString('base64url');
    await writeFile(path, `${encoded}\n`, { mode: 0o600 });
    const handle = await open(path, 'r');
    try {
      assert.throws(() => readRecoveryKeyFromFd(handle.fd), (error) => error.code === 'KEY_SOURCE_PLAINTEXT_FILE');
    } finally {
      await handle.close();
    }
    const module = new URL('./recovery-crypto.mjs', import.meta.url).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(module)}); process.stdout.write(m.readRecoveryKeyFromFd(0).id);`], { input: `${encoded}\n`, encoding: 'utf8' });
    assert.equal(child.status, 0);
    assert.equal(child.stdout, RecoveryKey.fromBytes(Buffer.alloc(32, 9)).id);
  });
});

test('the recovery key is refused from a terminal', async () => {
  const handle = await open('/dev/null', 'r');
  try {
    assert.throws(() => readRecoveryKeyFromFd(handle.fd, { isatty: () => true }), (error) => error.code === 'KEY_SOURCE_TERMINAL');
  } finally {
    await handle.close();
  }
});

test('the encrypted stream round-trips exactly and refuses another key', async () => {
  const key = RecoveryKey.generate();
  const plain = Buffer.concat([Buffer.from(CANARY), Buffer.alloc(200_000, 7)]);
  const encrypted = [];
  for await (const chunk of Readable.from([plain]).pipe(encryptStream(key))) encrypted.push(chunk);
  const sealed = Buffer.concat(encrypted);
  assert.equal(sealed.includes(Buffer.from(CANARY)), false);
  const decrypted = [];
  for await (const chunk of Readable.from([sealed]).pipe(decryptStream(key))) decrypted.push(chunk);
  assert.deepEqual(Buffer.concat(decrypted), plain);
  const drain = (bytes, withKey = key) => (async () => { for await (const _ of Readable.from([bytes]).pipe(decryptStream(withKey))) void _; })();
  await rejectsWith(drain(sealed, RecoveryKey.generate()), 'RECOVERY_KEY_MISMATCH');
  // Cut exactly after three whole 64 KiB records: every record left is
  // authentic, but the final one is missing.
  const header = 8 + 16 + 32 + 7;
  const record = 4 + 64 * 1024 + 16;
  await rejectsWith(drain(sealed.subarray(0, header + 3 * record)), 'BACKUP_INTEGRITY');
  await rejectsWith(drain(sealed.subarray(0, header)), 'BACKUP_INTEGRITY');
  await rejectsWith(drain(Buffer.concat([sealed, sealed.subarray(header)])), 'BACKUP_INTEGRITY');
  // Cut at a record boundary and mark the last kept record final: the final
  // flag is bound into the nonce, so the forged flag fails authentication.
  const forged = Buffer.from(sealed.subarray(0, header + 2 * record));
  forged.writeUInt32BE((forged.readUInt32BE(header + record) | 0x8000_0000) >>> 0, header + record);
  await rejectsWith(drain(forged), 'BACKUP_INTEGRITY');
  // Clearing the real final record's flag fails the same way.
  const unflagged = Buffer.from(sealed);
  const last = header + 3 * record;
  unflagged.writeUInt32BE(unflagged.readUInt32BE(last) & 0x7fff_ffff, last);
  await rejectsWith(drain(unflagged), 'BACKUP_INTEGRITY');
  // An authentic final record sealed after the real final one (as a key
  // holder could write) is still refused: nothing may follow the final record.
  const fileKey = key.derive(sealed.subarray(24, 56), Buffer.from('gogospend-recovery-stream-v1'));
  const nonce = Buffer.concat([sealed.subarray(56, 63), Buffer.from([0, 0, 0, 4, 1])]);
  const cipher = createCipheriv('aes-256-gcm', fileKey, nonce);
  cipher.setAAD(sealed.subarray(0, header));
  const body = Buffer.concat([cipher.update(Buffer.from('smuggled after the end')), cipher.final()]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE((body.length | 0x8000_0000) >>> 0);
  await rejectsWith(drain(Buffer.concat([sealed, length, body, cipher.getAuthTag()])), 'BACKUP_INTEGRITY');
});

test('a part swapped in from another backup made with the same key is refused', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    const other = { ...syntheticDatabase(), tables: { ...syntheticDatabase().tables, accounts: [{ id: ACCOUNT.kept }] } };
    const second = await runDailyBackup({ database: jsonDump(other), attachments: memoryAttachmentSource(objectsFor(other)), store: s.store, key: s.key, now: new Date(BACKUP_AT.getTime() + 60_000), environment: 'non_production', synthetic: true });
    // Both parts are authentic ciphertext; only the manifest's digest tells them apart.
    await writeFile(join(dir, `${s.backup.backup_id}.db.enc`), await readFile(join(dir, `${second.backup_id}.db.enc`)));
    const restorer = memoryRestorer();
    await rejectsWith(restoreRehearsal(input(s, { restorer, backupId: s.backup.backup_id })), 'BACKUP_INTEGRITY');
    assert.equal(restorer.calls.some(([step]) => step === 'applyErasure'), false);
  });
});

function keyForms(bytes) {
  return [bytes.toString('hex'), bytes.toString('base64'), bytes.toString('base64url'), [...bytes].join(','), bytes.toString('hex').match(/../g).join(' ')];
}

test('key material never appears in JSON, inspection or strings', () => {
  const bytes = Buffer.alloc(32, 0xab);
  const key = RecoveryKey.fromBytes(bytes);
  const text = `${JSON.stringify(key)} ${inspect(key, { showHidden: true, depth: 5 })} ${String(key)} ${JSON.stringify({ key })} ${Object.values(key).join(' ')}`;
  for (const form of keyForms(bytes)) assert.ok(!text.includes(form), 'recovery key bytes exposed');
  const lookupBytes = Buffer.alloc(32, 0xcd);
  const lookup = SubjectLookupKey.fromBytes(lookupBytes);
  const lookupText = `${JSON.stringify(lookup)} ${inspect(lookup, { showHidden: true, depth: 5 })} ${String(lookup)} ${Object.values(lookup).join(' ')}`;
  for (const form of keyForms(lookupBytes)) assert.ok(!lookupText.includes(form), 'lookup key bytes exposed');
});

test('a dump failure leaves no partial copy and leaks no credentials or amounts', async () => {
  await withDir(async (dir) => {
    const store = localRecoveryStore({ dir });
    const { lines, log } = capture();
    const failing = {
      label: 'synthetic',
      dump: () => {
        const stream = new Readable({ read() { this.push(Buffer.from('partial')); this.destroy(new Error(LEAKY)); } });
        return { stream, done: Promise.reject(new Error(LEAKY)) };
      },
    };
    const error = await rejectsWith(runDailyBackup({ database: failing, attachments: memoryAttachmentSource(new Map()), store, key: RecoveryKey.generate(), now: NOW, environment: 'non_production', synthetic: true, log }), 'BACKUP_DUMP_FAILED');
    assertLeaksNothing(error, lines.join('\n'));
    assert.deepEqual(await readdir(dir), []);
  });
});

test('a dump that streams fully but exits non-zero is not stored', async () => {
  await withDir(async (dir) => {
    const store = localRecoveryStore({ dir });
    const exitedBadly = { label: 'synthetic', dump: () => ({ stream: Readable.from([Buffer.from('{"complete-looking":true}')]), done: Promise.reject(new OpsError('BACKUP_DUMP_FAILED', { exit_code: 1 })) }) };
    await rejectsWith(runDailyBackup({ database: exitedBadly, attachments: memoryAttachmentSource(new Map()), store, key: RecoveryKey.generate(), now: NOW, environment: 'non_production', synthetic: true }), 'BACKUP_DUMP_FAILED');
    assert.deepEqual(await readdir(dir), []);
    // The same through the local dump adapter: full stdout, then exit 1.
    const spawnImpl = () => {
      const child = new EventEmitter();
      child.stdout = Readable.from([Buffer.from('PGDMP complete-looking archive')]);
      child.stderr = Readable.from([]);
      child.stdout.on('end', () => setImmediate(() => child.emit('close', 1)));
      return child;
    };
    await rejectsWith(runDailyBackup({ database: localDockerDump({ database: 'gogospend_rehearsal_src_0a1b2c3d', spawnImpl }), attachments: memoryAttachmentSource(new Map()), store, key: RecoveryKey.generate(), now: NOW, environment: 'non_production', synthetic: true }), 'BACKUP_DUMP_FAILED');
    assert.deepEqual(await readdir(dir), []);
  });
});

test('logs and receipts never carry the recovery key or anything derived from it', async () => {
  await withDir(async (dir) => {
    const bytes = Buffer.alloc(32, 0x5a);
    const key = RecoveryKey.fromBytes(bytes);
    const macKey = key.derive(Buffer.alloc(32), Buffer.from('gogospend-recovery-manifest-v1'));
    const { lines, log } = capture();
    const opsLines = [];
    const opsLog = createOpsLog((line) => opsLines.push(line));
    const both = { event: (name, fields) => { log.event(name, fields); opsLog.event(name, fields); } };
    const s = await scenario(dir, { key });
    const backupReceipt = await runDailyBackup({ database: jsonDump(syntheticDatabase()), attachments: memoryAttachmentSource(objectsFor(syntheticDatabase())), store: s.store, key, now: new Date(BACKUP_AT.getTime() + 60_000), environment: 'non_production', synthetic: true, log: both });
    const receipt = await restoreRehearsal(input(s, { log: both }));
    const text = [JSON.stringify(backupReceipt), JSON.stringify(receipt), ...lines, ...opsLines].join('\n');
    for (const material of [bytes, macKey]) for (const form of keyForms(material)) assert.ok(!text.includes(form), 'key material in a log or receipt');
  });
});

test('the log filter refuses key-shaped values but keeps the identifiers it needs', () => {
  const lines = [];
  const log = createOpsLog((line) => lines.push(line));
  const secret = Buffer.alloc(32, 0x3c).toString('base64url');
  log.event('backup_written', {
    mac_key: secret, raw_hex: Buffer.alloc(32, 0x3c).toString('hex'), mixed: 'AbCdEfGhIjKlMnOpQrStUv0123456789',
    backup_id: 'bk_20261017T094000Z_f0b306', copy_id: 'bk_20261017T094000Z_f0b306.objects', key_id: '2f011ef0adb0ffe1efbb328af9734388',
    rehearsal_id: 'rh_c94a3bc9', code: 'BACKUP_INTEGRITY', table: 'auth_event_receipts', account: ACCOUNT.kept, at: NOW.toISOString(),
  });
  const logged = JSON.parse(lines[0]);
  assert.equal(logged.mac_key, '[redacted]');
  assert.equal(logged.raw_hex, '[redacted]');
  assert.equal(logged.mixed, '[redacted]');
  for (const field of ['backup_id', 'copy_id', 'key_id', 'rehearsal_id', 'code', 'table', 'account', 'at']) assert.notEqual(logged[field], '[redacted]', field);
});

test('an attachment copy failure leaves no partial copy and leaks nothing', async () => {
  await withDir(async (dir) => {
    const store = localRecoveryStore({ dir });
    const { lines, log } = capture();
    const attachments = { label: 'synthetic', async *list() { yield { ref: 'receipt/x/1.jpg', read: async () => { throw new Error(LEAKY); } }; } };
    const error = await rejectsWith(runDailyBackup({ database: jsonDump({}), attachments, store, key: RecoveryKey.generate(), now: NOW, environment: 'non_production', synthetic: true, log }), 'ATTACHMENT_COPY_FAILED');
    assertLeaksNothing(error, lines.join('\n'));
    assert.deepEqual(await readdir(dir), []);
  });
});

test('the local dump passes no secret in arguments and never echoes its stderr', async () => {
  const spawned = [];
  const spawnImpl = (command, args) => {
    spawned.push([command, ...args]);
    const child = new EventEmitter();
    child.stdout = Readable.from([Buffer.from('partial')]);
    child.stderr = Readable.from([Buffer.from(`pg_dump: error: ${LEAKY}`)]);
    setImmediate(() => child.emit('close', 1));
    return child;
  };
  const adapter = localDockerDump({ database: 'gogospend_rehearsal_src_0a1b2c3d', spawnImpl });
  const { stream, done } = adapter.dump();
  stream.resume();
  const error = await rejectsWith(done, 'BACKUP_DUMP_FAILED');
  assertLeaksNothing(error);
  const argv = spawned.flat().join(' ');
  assert.doesNotMatch(argv, /password|postgres:\/\/|PGPASSWORD/i);
  assert.throws(() => localDockerDump({ database: 'x; DROP DATABASE gogospend_v1' }), (failure) => failure.code === 'ARGUMENT_REFUSED');
});

test('a restore failure is reported without credentials, amounts or tool output', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    const restorer = memoryRestorer({ failRestore: new Error(`pg_restore: error: ${LEAKY}`) });
    const { lines, log } = capture();
    const error = await rejectsWith(restoreRehearsal(input(s, { restorer, log })), 'RESTORE_FAILED');
    assertLeaksNothing(error, lines.join('\n'));
    assert.deepEqual(restorer.calls.at(-1), ['drop', 'gogospend_restore_0a1b2c3d']);
  });
});

test('error details and log fields keep only short identifiers, counts and dates', () => {
  const lines = [];
  const log = createOpsLog((line) => lines.push(line));
  log.event('restore_failed', { code: 'RESTORE_FAILED', url: `postgres://u:${SYNTHETIC_PASSWORD}@h/db`, note: `amount ${SYNTHETIC_BAHT}`, nested: { why: LEAKY }, list: [LEAKY], count: 3, at: NOW.toISOString() });
  const error = new OpsError('RESTORE_FAILED', { source: LEAKY, tables: ['accounts', `x ${SYNTHETIC_AMOUNT} ${CANARY}`], 'Bad Key!': 'x' });
  assertLeaksNothing(lines.join('\n'), error);
  const logged = JSON.parse(lines[0]);
  assert.equal(logged.count, 3);
  assert.equal(logged.code, 'RESTORE_FAILED');
  assert.equal(logged.at, NOW.toISOString());
  assert.equal(logged.url, '[redacted]');
  assert.deepEqual(error.details.tables, ['accounts', '[redacted]']);
  assert.equal(error.message.includes(LEAKY), false);
  assert.equal(new OpsError('NOT_A_CODE').code, 'INTERNAL');
});

test('a credential-bearing target label never reaches the receipt', async () => {
  await withDir(async (dir) => {
    const s = await scenario(dir);
    const receipt = await restoreRehearsal(input(s, { target: target({ label: `postgres://u:${SYNTHETIC_PASSWORD}@h/db` }) }));
    assertLeaksNothing(receipt);
    assert.equal(receipt.target.label, '[redacted]');
  });
});

test('the API runtime holds no recovery-key or recovery-control credentials', async () => {
  const api = join(REPO_ROOT, 'apps/api');
  const envFiles = (await readdir(api)).filter((name) => name.startsWith('.env') && name.endsWith('.example'));
  assert.ok(envFiles.length >= 3);
  for (const name of envFiles) assert.deepEqual(findRecoveryCredentialNames(await readFile(join(api, name), 'utf8')), [], name);
  const sources = [];
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(join(path, entry.name));
      else if (entry.name.endsWith('.ts')) sources.push(join(path, entry.name));
    }
  }
  await walk(join(api, 'src'));
  for (const file of sources) {
    const text = await readFile(file, 'utf8');
    assert.deepEqual(findRecoveryCredentialNames(text), [], file);
    assert.doesNotMatch(text, /scripts\/ops/, file);
  }
  assert.deepEqual(findRecoveryCredentialNames('RECOVERY_KEY_REF=x\nERASURE_REGISTRY_KEY=y\nR2_RECOVERY_SECRET_ACCESS_KEY=z\nBACKUP_ENCRYPTION_KEY=w'), ['BACKUP_ENCRYPTION_KEY', 'ERASURE_REGISTRY_KEY', 'R2_RECOVERY_SECRET_ACCESS_KEY', 'RECOVERY_KEY_REF']);
});

function runCli(script, args) {
  return spawnSync(process.execPath, [join(REPO_ROOT, 'scripts/ops', script), ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } });
}

test('the CLIs refuse secret-bearing arguments without echoing them', () => {
  for (const [script, args] of [
    ['restore-rehearsal.mjs', ['--target', 'local-isolated-synthetic', '--database-url', `postgres://u:${SYNTHETIC_PASSWORD}@h/db`]],
    ['restore-rehearsal.mjs', [`--password=${SYNTHETIC_PASSWORD}`]],
    ['backup.mjs', ['--key', SYNTHETIC_ACCESS_KEY]],
    ['recovery-inventory.mjs', ['--token', SYNTHETIC_ACCESS_KEY]],
  ]) {
    const child = runCli(script, args);
    assert.equal(child.status, 2, `${script} ${child.stderr}`);
    assert.match(child.stderr, /ARGUMENT_REFUSED/);
    assertLeaksNothing(child.stderr, child.stdout);
  }
});

test('the hosted rehearsal target is SKIPPED until E1 authorizes it', () => {
  const child = runCli('restore-rehearsal.mjs', ['--target', 'isolated-synthetic']);
  assert.equal(child.status, 3);
  assert.match(child.stderr, /HOSTED_ADAPTER_NOT_AUTHORIZED/);
});
