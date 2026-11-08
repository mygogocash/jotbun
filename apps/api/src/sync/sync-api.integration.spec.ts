import { createHash, randomUUID } from 'node:crypto';

import { SYNC_ENTITY_VALIDATORS, isCommittedChangeGroup, isSnapshotChunk, isSnapshotChunkGrant } from '@gogospend/contracts';
import type { SnapshotDto, SyncChangesPage } from '@gogospend/contracts';
import type { Pool } from 'pg';
import request from 'supertest';

import { CommandRegistry } from '../commands/command-registry';
import { LeasedAccountRead } from '../database/leased-account-read';
import { buildHandlers } from '../jobs/handlers';
import { JobRepository } from '../jobs/job.repository';
import { JobWorker } from '../jobs/worker';
import { ObjectPublicationService } from '../storage/object-publication.service';
import { SyncRetention } from './sync-retention';
import type { ObjectStore } from '../storage/object-store';
import { OBJECT_STORE } from '../storage/storage.module';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { publishPolicies, startV1App } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { builtinId, moneyFixtures } from '../testing/money-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { v1Client } from '../testing/v1-client';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let as: ReturnType<typeof v1Client>;
let money: ReturnType<typeof moneyFixtures>;
let worker: JobWorker;
let retention: SyncRetention;

async function diary(): Promise<{ user: SignedUp; wallet: string }> {
  const user = await money.member();
  const wallet = await money.wallet(user);
  await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-03-01', wallet_id: wallet, category_id: builtinId(user, 'food'), note: 'coffee' });
  return { user, wallet };
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  fx = authFixtures(issuer, pool);
  await publishPolicies(db);
  v1 = await startV1App(db, issuer);
  as = v1Client(v1.app, issuer);
  money = moneyFixtures(db, fx, as);
  // The worker shares the API's object store (one process's memory store here).
  const store = v1.app.get<ObjectStore>(OBJECT_STORE);
  const jobsPool = await db.loginPool(['gogospend_jobs'], 3);
  const jobs = new JobRepository(jobsPool);
  const deps = { jobs, reader: new LeasedAccountRead(await db.loginPool(['gogospend_leased_read'], 2)), store, publication: new ObjectPublicationService(jobsPool, store), pool: jobsPool };
  worker = new JobWorker(jobs, buildHandlers(deps));
  retention = new SyncRetention(jobsPool);
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

describe('GET /v1/sync/changes', () => {
  it('serves whole, valid change groups and refuses bad parameters', async () => {
    const { user } = await diary();
    const res = await as(user).get('/v1/sync/changes');
    expect(res.status).toBe(200);
    const body = res.body as SyncChangesPage;
    expect(body.groups.length).toBeGreaterThan(2);
    expect(body.groups.every((group) => isCommittedChangeGroup(group))).toBe(true);
    expect(body.has_more).toBe(false);
    const again = await as(user).get(`/v1/sync/changes?cursor=${encodeURIComponent(body.next_cursor)}`);
    expect(again.body).toEqual({ groups: [], next_cursor: body.next_cursor, has_more: false });
    expect((await as(user).get('/v1/sync/changes?limit=1001')).status).toBe(422);
    expect((await as(user).get('/v1/sync/changes?cursor=nonsense')).body.code).toBe('VALIDATION_FAILED');
    await db.admin((client) => client.query('UPDATE account_sync_state SET pruned_through = 1 WHERE account_id = $1', [user.accountId]));
    const gone = await as(user).get('/v1/sync/changes');
    expect(gone.status).toBe(410);
    expect(gone.body.code).toBe('RESYNC_REQUIRED');
  });
});

describe('snapshots over HTTP', () => {
  it('requests, builds, and downloads a snapshot through short-lived grants, then continues with deltas', async () => {
    const { user, wallet } = await diary();
    const other = await money.member();
    expect((await as(user).post('/v1/sync/snapshots', {}, { key: 'not-a-uuid' })).status).toBe(422);
    const key = randomUUID();
    const requested = await as(user).post('/v1/sync/snapshots', {}, { key });
    expect(requested.status).toBe(202);
    const id = (requested.body as SnapshotDto).snapshot_id;
    expect(requested.body).toEqual({ snapshot_id: id, status: 'pending' });
    expect((await as(user).post('/v1/sync/snapshots', {}, { key })).body.snapshot_id).toBe(id);
    expect((await as(other).get(`/v1/sync/snapshots/${id}`)).status).toBe(404);

    expect(await worker.runOnce()).toBe('ran');
    await money.record(user, { type: 'expense', amount_minor: '100', occurred_on: '2026-03-02', wallet_id: wallet, category_id: builtinId(user, 'food') });

    const ready = (await as(user).get(`/v1/sync/snapshots/${id}`)).body as SnapshotDto;
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') return;
    expect(ready.chunks.every(isSnapshotChunkGrant)).toBe(true);
    const entities = [];
    for (const chunk of ready.chunks) {
      const res = await as(user).get(`/v1/sync/snapshot-chunks/${chunk.grant}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^application\/json/);
      expect(res.headers['cache-control']).toBe('no-store');
      const raw = Buffer.from(res.text, 'utf8');
      expect(createHash('sha256').update(raw).digest('hex')).toBe(chunk.sha256);
      const parsed = JSON.parse(res.text) as unknown;
      expect(isSnapshotChunk(parsed)).toBe(true);
      entities.push(...(parsed as { entities: { entity: string }[] }).entities);
      expect((await as(other).get(`/v1/sync/snapshot-chunks/${chunk.grant}`)).status).toBe(404);
    }
    expect(entities.filter((e) => e.entity === 'transaction')).toHaveLength(1);
    expect(entities.filter((e) => e.entity === 'wallet')).toHaveLength(1);
    expect((await as(user).get('/v1/sync/snapshot-chunks/AAAAAAAAAAAAAAAAAAAAAAAA')).status).toBe(404);
    // Unauthenticated chunk requests are refused before any lookup.
    expect((await request(v1.app.getHttpServer()).get(`/v1/sync/snapshot-chunks/${ready.chunks[0].grant}`).set('x-gogospend-client', 'ios/1.0.0')).status).toBe(401);

    const after = (await as(user).get(`/v1/sync/changes?cursor=${encodeURIComponent(ready.cursor)}`)).body as SyncChangesPage;
    expect(after.groups).toHaveLength(1);
    expect(after.groups[0].changes[0]).toMatchObject({ entity: 'transaction', state: 'active' });
  });
});

describe('S1 review: contract parity and recovery', () => {
  it('snapshots validate exactly the entities the API registers', () => {
    // The Jotbun vault (apps/edge) also syncs entities this frozen API never
    // writes; each is left out here by name (P4-T1: the slip inbox count; P5-T3: trips and settings).
    const { slip_inbox: _slipInbox, trip: _trip, settings: _settings, ...apiEntities } = SYNC_ENTITY_VALIDATORS;
    expect(v1.app.get(CommandRegistry).entityNames().sort()).toEqual(Object.keys(apiEntities).sort());
  });

  it('asking again while a snapshot is ready answers 200 with it', async () => {
    const { user } = await diary();
    const requested = await as(user).post('/v1/sync/snapshots', {});
    expect(requested.status).toBe(202);
    await worker.runOnce();
    const again = await as(user).post('/v1/sync/snapshots', {});
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ snapshot_id: requested.body.snapshot_id, status: 'ready' });
  });

  it('a client behind retention recovers: 410, then a snapshot, then deltas from its cursor', async () => {
    const { user, wallet } = await diary();
    const old = (await as(user).get('/v1/sync/changes')).body as SyncChangesPage;
    await money.record(user, { type: 'income', amount_minor: '500', occurred_on: '2026-03-03', wallet_id: wallet, category_id: builtinId(user, 'salary') });
    await db.admin((client) => client.query(`UPDATE entity_changes SET committed_at = now() - interval '31 days' WHERE account_id = $1`, [user.accountId]));
    await retention.prune();
    const gone = await as(user).get(`/v1/sync/changes?cursor=${encodeURIComponent(old.next_cursor)}`);
    expect(gone.status).toBe(410);
    const requested = await as(user).post('/v1/sync/snapshots', {});
    await worker.runOnce();
    const ready = (await as(user).get(`/v1/sync/snapshots/${requested.body.snapshot_id}`)).body as SnapshotDto;
    if (ready.status !== 'ready') throw new Error(`snapshot is ${ready.status}`);
    const chunk = await as(user).get(`/v1/sync/snapshot-chunks/${ready.chunks[0].grant}`);
    expect((JSON.parse(chunk.text) as { entities: { entity: string }[] }).entities.filter((e) => e.entity === 'transaction')).toHaveLength(2);
    await money.record(user, { type: 'expense', amount_minor: '200', occurred_on: '2026-03-04', wallet_id: wallet, category_id: builtinId(user, 'food') });
    const after = (await as(user).get(`/v1/sync/changes?cursor=${encodeURIComponent(ready.cursor)}`)).body as SyncChangesPage;
    expect(after.groups).toHaveLength(1);
  });
});
