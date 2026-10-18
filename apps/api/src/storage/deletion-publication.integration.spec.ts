import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { JobRepository } from '../jobs/job.repository';
import type { ClaimedJob } from '../jobs/job-types';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { publishPolicies, startV1App } from '../testing/command-fixtures';
import { queueAccountJob } from '../testing/job-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { moneyFixtures } from '../testing/money-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { deletionJobOf, deletionRequestOf, deletionWorker, ownerRows, scriptedGateway } from '../testing/privacy-fixtures';
import { v1Client } from '../testing/v1-client';
import { ObjectPublicationService } from './object-publication.service';
import type { MemoryObjectStore } from './object-store';
import { OBJECT_STORE } from './storage.module';

const HOUR = 3_600_000;
const bytes = (text: string) => new TextEncoder().encode(text);

let db: TestDatabase;
let issuer: JwksFixture;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let as: ReturnType<typeof v1Client>;
let money: ReturnType<typeof moneyFixtures>;
let store: MemoryObjectStore;
let genericPool: Pool;
let generic: JobRepository;
let publication: ObjectPublicationService;
const provider = scriptedGateway();
let w: Awaited<ReturnType<typeof deletionWorker>>;

async function requestDeletion(user: SignedUp): Promise<void> {
  const key = randomUUID();
  const proofId = await fx.proven(user.who, 'deletion', key);
  const res = await as(user).raw('post', '/v1/me/deletion', { proof_id: proofId }, { 'idempotency-key': key });
  expect(res.status).toBe(202);
}

/** A generic worker's lease on a new job of the account (snapshot or export). */
async function leaseFor(user: SignedUp, kind: 'sync_snapshot' | 'export' = 'sync_snapshot'): Promise<ClaimedJob> {
  const id = await queueAccountJob(db, user.accountId, kind, { maxRuntimeSeconds: 120 });
  const [claimed] = await generic.claim([kind], { leaseSeconds: 60 });
  expect(claimed.lease.jobId).toBe(id);
  return claimed;
}

const keysOf = async (user: SignedUp) => [
  ...(await store.list(`sync_snapshot/${user.accountId}/`)),
  ...(await store.list(`export/${user.accountId}/`)),
].map((object) => object.key);
const publishedKeys = async (user: SignedUp) =>
  (await db.admin((client) => client.query(`SELECT key FROM object_publications WHERE account_id = $1 AND status = 'published'`, [user.accountId]))).rows.map((row) => row.key as string);
/** Time passes: every reservation of the account reaches its final publisher deadline, and a deferred job is due. */
async function pastDeadlines(user: SignedUp): Promise<void> {
  await db.admin(async (client) => {
    await client.query(`UPDATE object_publications SET delete_after = now() - interval '1 second' WHERE account_id = $1 AND status = 'reserved'`, [user.accountId]);
    await client.query(`UPDATE jobs SET run_after = now() WHERE account_id = $1 AND kind = 'account_deletion' AND status = 'queued'`, [user.accountId]);
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  const pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  fx = authFixtures(issuer, pool);
  await publishPolicies(db);
  v1 = await startV1App(db, issuer);
  as = v1Client(v1.app, issuer);
  money = moneyFixtures(db, fx, as);
  store = v1.app.get<MemoryObjectStore>(OBJECT_STORE);
  genericPool = await db.loginPool(['gogospend_jobs'], 3);
  generic = new JobRepository(genericPool);
  publication = new ObjectPublicationService(genericPool, store);
  w = await deletionWorker(db, store, provider.gateway);
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

beforeEach(async () => {
  provider.reset();
  await db.admin((client) => client.query(`DELETE FROM jobs WHERE status IN ('queued', 'leased')`));
});

describe('publishers after an account deletion', () => {
  it('a worker lease cannot publish after the deletion, and its object is swept', async () => {
    const user = await money.member();
    const claimed = await leaseFor(user);
    const key = await publication.reserve(claimed.lease, 'sync_snapshot', 'chunk-0000.json');
    const put = await store.putStream(key, bytes('{"chunk":0}'));
    await requestDeletion(user);
    expect(await publication.finishWithObjects(generic, claimed.lease, [{ key, ...put }], new Date(Date.now() + 24 * HOUR))).toBe(false);
    expect(await publishedKeys(user)).not.toContain(key);
    expect(await generic.isHeld(claimed.lease)).toBe(false);
    await pastDeadlines(user);
    await w.drain();
    expect(await keysOf(user)).not.toContain(key);
    expect((await deletionRequestOf(db, user.accountId))?.purged_at).toBeInstanceOf(Date);
  });

  it('late keys are swept after their deadlines: a PUT that lands after the deletion (worker crashed mid-PUT)', async () => {
    const user = await money.member();
    const claimed = await leaseFor(user, 'export');
    const lateKey = await publication.reserve(claimed.lease, 'export', 'export.csv');
    await requestDeletion(user);
    // The worker's PUT lands, then the worker dies before it could finish.
    store.failNext('put', 'crash_after_write');
    await expect(store.putStream(lateKey, bytes('late,output\r\n'))).rejects.toThrow();
    expect(await keysOf(user)).toContain(lateKey);

    // Erasure waits for the publisher's final deadline before the purge.
    await w.drain(1);
    const deadline = (await db.admin((client) => client.query('SELECT delete_after FROM object_publications WHERE key = $1', [lateKey]))).rows[0].delete_after as Date;
    const [job] = await deletionJobOf(db, user.accountId);
    expect(job).toEqual(expect.objectContaining({ status: 'queued', last_error: 'deferred' }));
    expect(job.run_after.getTime()).toBeGreaterThanOrEqual(deadline.getTime());
    const request = await deletionRequestOf(db, user.accountId);
    expect(request?.provider_verified_at).toBeInstanceOf(Date);
    expect(request?.objects_swept_at).toBeNull();
    expect(request?.purged_at).toBeNull();
    expect((await ownerRows(db, user.accountId)).accounts).toBe(1);

    await pastDeadlines(user);
    await w.drain();
    const keysAfterSweep = await keysOf(user);
    expect(keysAfterSweep).not.toContain(lateKey);
    expect((await deletionRequestOf(db, user.accountId))?.purged_at).toBeInstanceOf(Date);
  });

  it('an object written even after the final sweep is removed by the next sweep', async () => {
    const user = await money.member();
    const claimed = await leaseFor(user);
    const key = await publication.reserve(claimed.lease, 'sync_snapshot', 'chunk-0000.json');
    await requestDeletion(user);
    await pastDeadlines(user);
    await w.drain();
    expect((await deletionRequestOf(db, user.accountId))?.purged_at).toBeInstanceOf(Date);
    // A hung writer finally lands its PUT under the old key.
    await store.putStream(key, bytes('very late'));
    expect(await publication.sweep(null)).toContain(key);
    expect(await keysOf(user)).toEqual([]);
  });

  it('published objects are deleted at erasure, and a failing storage delete keeps it pending', async () => {
    const user = await money.member();
    const claimed = await leaseFor(user);
    const key = await publication.reserve(claimed.lease, 'sync_snapshot', 'chunk-0000.json');
    const put = await store.putStream(key, bytes('{"chunk":0}'));
    expect(await publication.finishWithObjects(generic, claimed.lease, [{ key, ...put }], new Date(Date.now() + 24 * HOUR))).toBe(true);
    await requestDeletion(user);
    store.failNext('delete');
    await w.drain(1);
    expect(await keysOf(user)).toContain(key);
    const [job] = await deletionJobOf(db, user.accountId);
    expect(job).toEqual(expect.objectContaining({ status: 'queued', last_error: 'objects_pending' }));
    expect((await deletionRequestOf(db, user.accountId))?.purged_at).toBeNull();
    await db.admin((client) => client.query('UPDATE jobs SET run_after = now() WHERE id = $1', [job.id]));
    await w.drain();
    expect(await keysOf(user)).toEqual([]);
    expect((await deletionRequestOf(db, user.accountId))?.purged_at).toBeInstanceOf(Date);
  });
});
