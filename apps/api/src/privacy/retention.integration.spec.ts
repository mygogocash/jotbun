import { randomUUID } from 'node:crypto';

import type { CommandAck, SyncChangesPage } from '@gogospend/contracts';
import { Client } from 'pg';
import type { Pool } from 'pg';

import { poolConfigFromUrl } from '../database/database-config';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { publishPolicies, startV1App } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { builtinId, expectOk, moneyFixtures } from '../testing/money-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { v1Client } from '../testing/v1-client';
import { PrivacySteps, defaultPrivacySteps } from './privacy-steps';
import { RetentionHandler } from './retention-handler';

let db: TestDatabase;
let issuer: JwksFixture;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let as: ReturnType<typeof v1Client>;
let money: ReturnType<typeof moneyFixtures>;
let jobsPool: Pool;
let retention: RetentionHandler;

const NOTE = 'secret lunch with a private person';

async function diary() {
  const user = await money.member();
  const cash = await money.wallet(user);
  return { user, cash };
}

/** POST /v1/transactions with a fixed key and body (so it can be replayed). */
async function create(user: SignedUp, cash: string, overrides: Record<string, unknown> = {}) {
  const body = { id: randomUUID(), type: 'expense', amount_minor: '6500', occurred_on: '2026-03-01', wallet_id: cash, category_id: builtinId(user, 'food'), note: NOTE, ...overrides };
  const key = randomUUID();
  const res = await as(user).post('/v1/transactions', body, { key });
  expect(res.status).toBe(201);
  return { body, key, ack: res.body as CommandAck };
}

const remove = async (user: SignedUp, id: string, version = 1) => as(user).raw('delete', `/v1/transactions/${id}`, {}, { 'idempotency-key': randomUUID(), 'x-gogospend-command-schema': '1', 'if-match': `"${version}"` });

/** Moves an entity's history (and, for a record, its deletion) `days` into the past. */
async function age(accountId: string, entity: string, id: string, days: number): Promise<void> {
  await db.admin(async (client) => {
    await client.query(`UPDATE entity_changes SET committed_at = now() - make_interval(days => $3) WHERE account_id = $1 AND entity = $4 AND entity_id = $2`, [accountId, id, days, entity]);
    if (entity === 'transaction') await client.query(`UPDATE transactions SET deleted_at = now() - make_interval(days => $3) WHERE account_id = $1 AND id = $2 AND deleted_at IS NOT NULL`, [accountId, id, days]);
    if (entity === 'export') await client.query(`UPDATE exports SET requested_at = now() - make_interval(days => $3) WHERE account_id = $1 AND export_id = $2`, [accountId, id, days]);
  });
}

const changesOf = async (accountId: string, id: string) =>
  (await db.admin((client) => client.query('SELECT revision::text AS revision, version, state, snapshot FROM entity_changes WHERE account_id = $1 AND entity_id = $2 ORDER BY revision', [accountId, id]))).rows;
const headOf = async (accountId: string, id: string) =>
  (await db.admin((client) => client.query('SELECT version, state, revision::text AS revision FROM entity_heads WHERE account_id = $1 AND entity_id = $2', [accountId, id]))).rows[0];
const syncState = async (accountId: string) =>
  (await db.admin((client) => client.query('SELECT revision::text AS revision, pruned_through::text AS pruned_through FROM account_sync_state WHERE account_id = $1', [accountId]))).rows[0];
const latestCursor = async (user: SignedUp): Promise<string> => {
  let cursor: string | undefined;
  for (;;) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}&limit=1000` : '?limit=1000';
    const page = (await as(user).get(`/v1/sync/changes${query}`)).body as SyncChangesPage;
    cursor = page.next_cursor;
    if (!page.has_more) return cursor;
  }
};

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  const pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  fx = authFixtures(issuer, pool);
  await publishPolicies(db);
  v1 = await startV1App(db, issuer);
  as = v1Client(v1.app, issuer);
  money = moneyFixtures(db, fx, as);
  // Retention runs on the generic worker's login, as deployed.
  jobsPool = await db.loginPool(['gogospend_jobs'], 3);
  retention = new RetentionHandler(jobsPool);
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

describe('deleted records', () => {
  it('purged_transactions_are_not_resurrected_by_receipts', async () => {
    const { user, cash } = await diary();
    const record = await create(user, cash);
    await expectOk(await remove(user, record.body.id));
    await age(user.accountId, 'transaction', record.body.id, 31);
    const report = await retention.run();
    expect(report.failed).toEqual([]);
    expect(report.counts['records.purge']).toBeGreaterThanOrEqual(1);

    // The private row and every earlier change payload are gone; the head is a purged tombstone.
    expect((await db.admin((client) => client.query('SELECT 1 FROM transactions WHERE id = $1', [record.body.id]))).rowCount).toBe(0);
    expect(await headOf(user.accountId, record.body.id)).toEqual(expect.objectContaining({ version: 3, state: 'purged' }));
    expect(await changesOf(user.accountId, record.body.id)).toEqual([expect.objectContaining({ version: 3, state: 'purged', snapshot: null })]);
    const leaked = await db.admin((client) => client.query(`SELECT count(*)::int AS n FROM entity_changes WHERE account_id = $1 AND snapshot::text LIKE $2`, [user.accountId, `%${NOTE}%`]));
    expect(leaked.rows[0].n).toBe(0);

    // The compact receipt answers a replay with the original outcome and the current (purged) state - and writes nothing.
    const replay = await as(user).post('/v1/transactions', record.body, { key: record.key });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual({ ...record.ack, entity_state: 'purged' });
    expect((await db.admin((client) => client.query('SELECT 1 FROM transactions WHERE id = $1', [record.body.id]))).rowCount).toBe(0);
    // A new command for the same id cannot bring it back either.
    expect((await as(user).post('/v1/transactions', record.body)).status).toBe(410);
    expect((await as(user).post(`/v1/transactions/${record.body.id}/restore`, {}, { ifMatch: 2 })).status).toBe(410);
    expect((await as(user).patch(`/v1/transactions/${record.body.id}`, { amount_minor: '1' }, { ifMatch: 2 })).status).toBe(410);
    expect((await as(user).get(`/v1/transactions/${record.body.id}`)).status).toBe(404);
    const status = await as(user).post('/v1/commands/status', { command_ids: [record.key] });
    expect(status.body.statuses[0]).toEqual({ command_id: record.key, state: 'known', ack: { ...record.ack, entity_state: 'purged' } });
    // Purging again changes nothing.
    const head = await headOf(user.accountId, record.body.id);
    await retention.run();
    expect(await headOf(user.accountId, record.body.id)).toEqual(head);
  });

  it('a deleted record stops counting at once and can be undone within 30 days; nothing is purged early', async () => {
    const { user, cash } = await diary();
    const kept = await create(user, cash, { amount_minor: '1000' });
    const undone = await create(user, cash, { amount_minor: '2000' });
    await expectOk(await remove(user, undone.body.id));
    expect((await money.balances(user))[cash]).toBe('-1000');
    await age(user.accountId, 'transaction', undone.body.id, 29);
    await retention.run();
    expect((await headOf(user.accountId, undone.body.id)).state).toBe('deleted');
    await expectOk(await as(user).post(`/v1/transactions/${undone.body.id}/restore`, {}, { ifMatch: 2 }));
    expect((await money.balances(user))[cash]).toBe('-3000');
    expect((await headOf(user.accountId, kept.body.id)).state).toBe('active');
  });

  it('tombstones reach delta readers, older cursors resync, and snapshots built before the purge are dropped', async () => {
    const { user, cash } = await diary();
    const beforeRecord = await latestCursor(user);
    const record = await create(user, cash);
    await expectOk(await remove(user, record.body.id));
    const afterDelete = await latestCursor(user);
    const deletedAt = (await syncState(user.accountId)).revision;
    // A snapshot built after the deletion still carries the deleted record's data.
    const snapshotId = randomUUID();
    const chunkKey = `sync_snapshot/${user.accountId}/${snapshotId}/${randomUUID()}/chunk-0000.json`;
    await db.admin(async (client) => {
      await client.query(`INSERT INTO snapshot_manifests (snapshot_id, account_id, lifecycle_generation, high_water, schema_version, chunk_count, expires_at)
                          VALUES ($1, $2, 0, $3, 1, 1, now() + interval '20 hours')`, [snapshotId, user.accountId, deletedAt]);
      await client.query(`INSERT INTO object_publications (key, job_id, account_id, lease_token, lifecycle_generation, purpose, status, delete_after, bytes, sha256, published_at)
                          VALUES ($1, $2, $3, $4, 0, 'sync_snapshot', 'published', now() + interval '20 hours', 10, sha256('x'), now())`,
        [chunkKey, snapshotId, user.accountId, chunkKey.split('/')[3]]);
      await client.query(`INSERT INTO snapshot_chunks (snapshot_id, account_id, chunk_index, object_key, bytes, sha256) VALUES ($1, $2, 0, $3, 10, sha256('x'))`, [snapshotId, user.accountId, chunkKey]);
    });
    await age(user.accountId, 'transaction', record.body.id, 31);
    await retention.run();

    // A reader that had seen the deletion gets the tombstone as one more group.
    const next = await as(user).get(`/v1/sync/changes?cursor=${encodeURIComponent(afterDelete)}`);
    expect(next.status).toBe(200);
    const groups = (next.body as SyncChangesPage).groups;
    expect(groups.flatMap((group) => group.changes)).toEqual([{ entity: 'transaction', id: record.body.id, version: 3, state: 'purged', snapshot: null }]);
    // A reader from before the record's changes resyncs (they no longer exist), as S1 does after 30 days.
    const stale = await as(user).get(`/v1/sync/changes?cursor=${encodeURIComponent(beforeRecord)}`);
    expect(stale.status).toBe(410);
    expect(stale.body.code).toBe('RESYNC_REQUIRED');
    expect(BigInt((await syncState(user.accountId)).pruned_through)).toBeGreaterThanOrEqual(BigInt(deletedAt));
    // The older snapshot is gone and its objects are due for the sweep.
    expect((await db.admin((client) => client.query('SELECT 1 FROM snapshot_manifests WHERE snapshot_id = $1', [snapshotId]))).rowCount).toBe(0);
    const due = (await db.admin((client) => client.query('SELECT delete_after <= now() AS due FROM object_publications WHERE key = $1', [chunkKey]))).rows[0];
    expect(due.due).toBe(true);
    // A new snapshot reads the head's own change: a tombstone without data.
    const head = await headOf(user.accountId, record.body.id);
    const changeAtHead = (await db.admin((client) => client.query('SELECT snapshot FROM entity_changes WHERE account_id = $1 AND entity_id = $2 AND revision = $3', [user.accountId, record.body.id, head.revision]))).rows;
    expect(changeAtHead).toEqual([{ snapshot: null }]);
  });

  it('export requests are purged 30 days after the request; the receipt stays compact', async () => {
    const user = await money.member();
    const key = randomUUID();
    const proofId = await fx.proven(user.who, 'export', key);
    const requested = await as(user).post('/v1/exports', { proof_id: proofId, from: '2026-03-01', through: '2026-03-31' }, { key });
    expect(requested.status).toBe(202);
    const exportId = (requested.body as CommandAck).entity_id;
    await age(user.accountId, 'export', exportId, 31);
    await retention.run();
    expect((await db.admin((client) => client.query('SELECT 1 FROM exports WHERE export_id = $1', [exportId]))).rowCount).toBe(0);
    expect((await headOf(user.accountId, exportId)).state).toBe('purged');
    expect(await changesOf(user.accountId, exportId)).toEqual([expect.objectContaining({ state: 'purged', snapshot: null })]);
    expect((await as(user).get(`/v1/exports/${exportId}`)).status).toBe(404);
    const status = await as(user).post('/v1/commands/status', { command_ids: [key] });
    expect(status.body.statuses[0].ack.entity_state).toBe('purged');
  });

  it('skips an account while a user write holds its lock, and purges it on the next run', async () => {
    const { user, cash } = await diary();
    const record = await create(user, cash);
    await expectOk(await remove(user, record.body.id));
    await age(user.accountId, 'transaction', record.body.id, 31);
    const holder = new Client(poolConfigFromUrl(db.adminUrl, 1));
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM account_sync_state WHERE account_id = $1 FOR UPDATE', [user.accountId]);
      const started = Date.now();
      await retention.run();
      expect(Date.now() - started).toBeLessThan(5_000);
      expect((await headOf(user.accountId, record.body.id)).state).toBe('deleted');
    } finally {
      await holder.query('ROLLBACK');
      await holder.end();
    }
    await retention.run();
    expect((await headOf(user.accountId, record.body.id)).state).toBe('purged');
  });
});

describe('other retention', () => {
  it('drops receipt digests after the outbox lifetime: a replay is refused and never re-run; status still answers', async () => {
    const { user, cash } = await diary();
    const old = await create(user, cash);
    const fresh = await create(user, cash);
    await db.admin((client) => client.query(`UPDATE command_receipts SET committed_at = now() - interval '31 days' WHERE command_id = $1`, [old.key]));
    const report = await retention.run();
    expect(report.counts['commands.receipt_digests']).toBeGreaterThanOrEqual(1);
    const digests = (await db.admin((client) => client.query('SELECT command_id, request_digest IS NULL AS dropped FROM command_receipts WHERE command_id = ANY($1)', [[old.key, fresh.key]]))).rows;
    expect(Object.fromEntries(digests.map((row) => [row.command_id, row.dropped]))).toEqual({ [old.key]: true, [fresh.key]: false });
    const replay = await as(user).post('/v1/transactions', old.body, { key: old.key });
    expect(replay.status).toBe(409);
    expect(replay.body.code).toBe('IDEMPOTENCY_MISMATCH');
    expect((await db.admin((client) => client.query('SELECT count(*)::int AS n FROM transactions WHERE account_id = $1', [user.accountId]))).rows[0].n).toBe(2);
    const status = await as(user).post('/v1/commands/status', { command_ids: [old.key] });
    expect(status.body.statuses[0]).toEqual({ command_id: old.key, state: 'known', ack: old.ack });
    // The fresh receipt still replays.
    expect((await as(user).post('/v1/transactions', fresh.body, { key: fresh.key })).body).toEqual(fresh.ack);
  });

  it('ages out provider-event receipts, reconcile checks, expired challenges, finished jobs, lapsed holds and completed deletion requests', async () => {
    const digest = (n: number) => Buffer.alloc(32, n);
    const oldJob = randomUUID();
    const freshJob = randomUUID();
    const failedJob = randomUUID();
    const oldRequest = randomUUID();
    const freshRequest = randomUUID();
    await db.admin(async (client) => {
      await client.query(`INSERT INTO auth_event_receipts (event_id, source, type, principal_digest, occurred_at, received_at, outcome)
                          VALUES ('evt_old_000000001', 'event', 'password_changed', $1, now() - interval '40 days', now() - interval '31 days', 'no_account'),
                                 ('evt_fresh_0000001', 'event', 'password_changed', $1, now() - interval '2 days', now() - interval '2 days', 'no_account')`, [digest(1)]);
      await client.query(`INSERT INTO security_reconcile_checks (principal_digest, checked_at) VALUES ($1, now() - interval '31 days'), ($2, now())`, [digest(2), digest(3)]);
      await client.query(`INSERT INTO blocked_principals (principal_digest, reason, blocked_until) VALUES ($1, 'deleted', now() - interval '1 minute'), ($2, 'deleted', now() + interval '1 hour'), ($3, 'deleted', NULL)`, [digest(4), digest(5), digest(6)]);
      await client.query(`INSERT INTO jobs (id, kind, payload, max_attempts, status, finished_at) VALUES
                            ($1, 'sync_snapshot', '{}', 3, 'succeeded', now() - interval '31 days'),
                            ($2, 'sync_snapshot', '{}', 3, 'succeeded', now() - interval '1 day'),
                            ($3, 'sync_snapshot', '{}', 3, 'failed', now() - interval '40 days')`, [oldJob, freshJob, failedJob]);
      await client.query(`INSERT INTO deletion_requests (request_id, account_id, command_id, requested_at, marker_recorded_at, provider_verified_at, objects_swept_at, purged_at) VALUES
                            ($1, $1, $1, now() - interval '40 days', now() - interval '40 days', now() - interval '40 days', now() - interval '40 days', now() - interval '31 days'),
                            ($2, $2, $2, now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', now() - interval '2 days', now() - interval '1 day')`, [oldRequest, freshRequest]);
    });
    const report = await retention.run();
    expect(report.failed).toEqual([]);
    const left = await db.admin(async (client) => ({
      receipts: (await client.query(`SELECT event_id FROM auth_event_receipts WHERE event_id LIKE 'evt_%0001' ORDER BY event_id`)).rows.map((row) => row.event_id),
      checks: (await client.query('SELECT principal_digest FROM security_reconcile_checks WHERE principal_digest = ANY($1)', [[digest(2), digest(3)]])).rows.length,
      holds: (await client.query('SELECT principal_digest FROM blocked_principals WHERE principal_digest = ANY($1) ORDER BY principal_digest', [[digest(4), digest(5), digest(6)]])).rows.map((row) => row.principal_digest[0]),
      jobs: (await client.query('SELECT id FROM jobs WHERE id = ANY($1)', [[oldJob, freshJob, failedJob]])).rows.map((row) => row.id).sort(),
      requests: (await client.query('SELECT request_id FROM deletion_requests WHERE request_id = ANY($1)', [[oldRequest, freshRequest]])).rows.map((row) => row.request_id),
    }));
    expect(left.receipts).toEqual(['evt_fresh_0000001']);
    expect(left.checks).toBe(1);
    expect(left.holds).toEqual([5, 6]);
    expect(left.jobs).toEqual([freshJob, failedJob].sort());
    expect(left.requests).toEqual([freshRequest]);
  });

  it('removes a superseded change that sat below the retention line (S1 change log)', async () => {
    const { user, cash } = await diary();
    const record = await create(user, cash);
    await db.admin((client) => client.query(`UPDATE entity_changes SET committed_at = now() - interval '40 days' WHERE account_id = $1`, [user.accountId]));
    await retention.run();
    // The create is the head, so it survived and the retention line moved past it.
    expect(BigInt((await syncState(user.accountId)).pruned_through)).toBeGreaterThanOrEqual(BigInt((await headOf(user.accountId, record.body.id)).revision));
    expect(await changesOf(user.accountId, record.body.id)).toHaveLength(1);
    await expectOk(await as(user).patch(`/v1/transactions/${record.body.id}`, { note: 'edited' }, { ifMatch: 1 }));
    await db.admin((client) => client.query(`UPDATE entity_changes SET committed_at = now() - interval '31 days' WHERE account_id = $1 AND entity_id = $2 AND version = 2`, [user.accountId, record.body.id]));
    await retention.run();
    const left = await changesOf(user.accountId, record.body.id);
    expect(left.map((change) => change.version)).toEqual([2]);
    const leaked = await db.admin((client) => client.query(`SELECT count(*)::int AS n FROM entity_changes WHERE account_id = $1 AND snapshot::text LIKE $2`, [user.accountId, `%${NOTE}%`]));
    expect(leaked.rows[0].n).toBe(0);
  });

  it('a failing step is reported and does not stop the others', async () => {
    const steps = new PrivacySteps()
      .retention({ name: 'fixture.broken', run: async () => {
        throw new Error('synthetic failure with private text');
      } })
      .retention({ name: 'fixture.counted', run: async () => 3 });
    const report = await new RetentionHandler(jobsPool, steps).run();
    expect(report).toEqual({ counts: { 'fixture.counted': 3 }, failed: ['fixture.broken'] });
    // The default steps in their order.
    expect(defaultPrivacySteps().retentionSteps().map((step) => step.name)).toEqual([
      'records.purge', 'sync.change_log', 'commands.receipt_digests', 'auth.security_records', 'jobs.finished', 'privacy.deletion_requests',
    ]);
  });
});
