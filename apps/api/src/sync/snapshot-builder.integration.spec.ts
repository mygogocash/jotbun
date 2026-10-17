import { createHash, randomUUID } from 'node:crypto';

import { isSnapshotChunk } from '@gogospend/contracts';
import type { EntityChange, SessionContext, SnapshotChunk, SnapshotDto } from '@gogospend/contracts';
import type { Pool } from 'pg';

import { CommandDigester, TEST_DIGEST_KEY } from '../commands/command-digest';
import { CommandExecutor } from '../commands/command-executor';
import { CommandReceiptRepository } from '../commands/command-receipts.repository';
import { CommandRegistry } from '../commands/command-registry';
import { DatabaseService } from '../database/database.service';
import { LeasedAccountRead } from '../database/leased-account-read';
import { HandlerRegistry } from '../jobs/handler-registry';
import { buildHandlers } from '../jobs/handlers';
import { JobRepository } from '../jobs/job.repository';
import type { ClaimedJob } from '../jobs/job-types';
import { JobWorker } from '../jobs/worker';
import { PolicyService } from '../policies/policy.service';
import { ObjectPublicationService } from '../storage/object-publication.service';
import { MemoryObjectStore } from '../storage/object-store';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { FIXTURE_ENTITY, acceptPolicies, createFixtureDomain, fixtureCommands, publishPolicies, purchase, registerFixtureDomain } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { ChangeWriter } from './change-writer';
import { SnapshotBuilder } from './snapshot-builder';
import type { SnapshotBuilderOptions } from './snapshot-builder';
import { SnapshotGrants } from './snapshot-grants';
import { SnapshotRepository } from './snapshot.repository';
import { decodeSyncCursor } from './sync-cursor';
import { SyncQuery } from './sync-query';

const HOUR = 3_600_000;

let db: TestDatabase;
let issuer: JwksFixture;
let service: DatabaseService;
let fx: ReturnType<typeof authFixtures>;
let commands: ReturnType<typeof fixtureCommands>;
let registry: CommandRegistry;
let jobs: JobRepository;
let jobsPool: Pool;
let reader: LeasedAccountRead;
let store: MemoryObjectStore;
let publication: ObjectPublicationService;
let snapshots: SnapshotRepository;
let query: SyncQuery;

const validators = () => ({ [FIXTURE_ENTITY]: (snapshot: unknown) => registry.entity(FIXTURE_ENTITY)?.validate(snapshot) ?? false });
const builder = (options: SnapshotBuilderOptions = {}) => new SnapshotBuilder({ reader, jobs, store, publication }, { validators: validators(), ...options });

async function member(): Promise<SignedUp> {
  const user = await fx.signUp();
  await acceptPolicies(db, user.accountId);
  return user;
}

const owner = <T>(session: SessionContext, fn: (tx: Parameters<Parameters<DatabaseService['withOwnerTransaction']>[1]>[0]) => Promise<T>) => service.withOwnerTransaction(session, fn);
const request = (user: SignedUp, key = randomUUID()) => owner(user.session, (tx) => snapshots.request(tx, key));
const status = (user: SignedUp, id: string, now?: Date) => owner(user.session, (tx) => snapshots.status(tx, id, now));

async function claimSnapshot(): Promise<ClaimedJob> {
  const [claimed] = await jobs.claim(['sync_snapshot'], { leaseSeconds: 60 });
  return claimed;
}

async function download(user: SignedUp, dto: SnapshotDto): Promise<SnapshotChunk[]> {
  if (dto.status !== 'ready') throw new Error(`snapshot is ${dto.status}`);
  const chunks: SnapshotChunk[] = [];
  for (const chunk of dto.chunks) {
    const stored = await owner(user.session, (tx) => snapshots.chunk(tx, chunk.grant));
    if (!stored) throw new Error('grant refused');
    const body = (await store.get(stored.key)) as Uint8Array;
    expect(createHash('sha256').update(body).digest('hex')).toBe(chunk.sha256);
    expect(body.byteLength).toBe(chunk.bytes);
    const parsed = JSON.parse(new TextDecoder().decode(body)) as unknown;
    expect(isSnapshotChunk(parsed, validators())).toBe(true);
    chunks.push(parsed as SnapshotChunk);
  }
  return chunks;
}

const heads = async (accountId: string) =>
  (await db.admin((client) => client.query('SELECT entity_id AS id, version, state FROM entity_heads WHERE account_id = $1 ORDER BY entity_id', [accountId]))).rows as { id: string; version: number; state: string }[];

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  const appPool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 8);
  fx = authFixtures(issuer, appPool);
  await createFixtureDomain(db);
  await publishPolicies(db);
  service = new DatabaseService(appPool);
  registry = new CommandRegistry();
  registerFixtureDomain(registry);
  commands = fixtureCommands(new CommandExecutor(service, registry, new PolicyService(appPool, service, 0), new ChangeWriter(registry), new CommandReceiptRepository(), new CommandDigester(TEST_DIGEST_KEY)));
  jobsPool = await db.loginPool(['gogospend_jobs'], 4);
  jobs = new JobRepository(jobsPool);
  reader = new LeasedAccountRead(await db.loginPool(['gogospend_leased_read'], 3));
  snapshots = new SnapshotRepository(new SnapshotGrants(Buffer.alloc(32, 7)));
  query = new SyncQuery(registry);
});

afterAll(async () => {
  await issuer?.close();
  await db?.drop();
});

beforeEach(async () => {
  store = new MemoryObjectStore();
  publication = new ObjectPublicationService(jobsPool, store);
  await db.admin((client) => client.query('DELETE FROM jobs'));
});

describe('consistent snapshots', () => {
  it('applying the snapshot and then later deltas yields every latest entity exactly once, from one view', async () => {
    const user = await member();
    const made: ReturnType<typeof purchase>[] = [];
    for (let i = 0; i < 6; i += 1) made.push(purchase({ note: `item ${i}` }));
    for (const p of made) await commands.create(user.session, p);
    await commands.remove(user.session, made[0].id, 1);
    const id = await request(user);
    expect(await status(user, id)).toEqual({ snapshot_id: id, status: 'pending' });
    const claimed = await claimSnapshot();
    expect(claimed.lease.jobId).toBe(id);
    let writes = 0;
    const manifest = await builder({
      chunkBytes: 400,
      pageSize: 2,
      // Mutations and a deletion commit while the snapshot is being read.
      afterPage: async (index) => {
        if (index !== 0) return;
        await commands.create(user.session, purchase({ note: 'late 1' }));
        await commands.create(user.session, purchase({ note: 'late 2' }));
        await commands.remove(user.session, made[1].id, 1);
        writes += 3;
      },
    }).build(claimed.lease);
    expect(writes).toBe(3);
    expect(manifest).not.toBeNull();
    expect(manifest?.high_water).toBe('7');
    expect(manifest?.chunks.length).toBeGreaterThan(1);

    const ready = await status(user, id);
    expect(ready).toMatchObject({ snapshot_id: id, status: 'ready', schema_version: 1, high_water: '7' });
    if (ready?.status !== 'ready') throw new Error('not ready');
    expect(decodeSyncCursor(user.accountId, ready.cursor)).toBe('7');
    expect(Math.abs(Date.parse(ready.expires_at) - (Date.now() + 24 * HOUR))).toBeLessThan(5 * 60_000);
    expect(ready.chunks.map((chunk) => chunk.index)).toEqual(ready.chunks.map((_, index) => index));
    expect(JSON.stringify(ready)).not.toContain('sync_snapshot/');

    const chunks = await download(user, ready);
    expect(chunks.every((chunk) => chunk.high_water === '7' && chunk.snapshot_id === id)).toBe(true);
    const state = new Map<string, EntityChange>();
    for (const entity of chunks.flatMap((chunk) => chunk.entities)) {
      expect(state.has(entity.id)).toBe(false);
      state.set(entity.id, entity);
    }
    // The view is the one at high-water 7: the concurrent delete is not in it.
    expect(state.size).toBe(6);
    expect(state.get(made[0].id)).toMatchObject({ version: 2, state: 'deleted' });
    expect(state.get(made[1].id)).toMatchObject({ version: 1, state: 'active' });

    const later = await service.withOwnerTransaction(user.session, (tx) => query.after(tx, ready.cursor), { snapshot: true });
    expect(later.groups.map((group) => group.revision)).toEqual(['8', '9', '10']);
    for (const change of later.groups.flatMap((group) => group.changes)) {
      const known = state.get(change.id);
      if (!known || known.version < change.version) state.set(change.id, change);
    }
    expect([...state.values()].map((e) => ({ id: e.id, version: e.version, state: e.state })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(await heads(user.accountId));

    const job = (await db.admin((client) => client.query('SELECT status FROM jobs WHERE id = $1', [id]))).rows[0];
    expect(job.status).toBe('succeeded');
    const published = (await db.admin((client) => client.query(`SELECT count(*)::int AS n, max(delete_after) AS until FROM object_publications WHERE job_id = $1 AND status = 'published'`, [id]))).rows[0];
    expect(published.n).toBe(manifest?.chunks.length);
    expect(Math.abs(new Date(published.until).getTime() - Date.parse(ready.expires_at))).toBeLessThan(1000);
  });

  it('an account deletion during the build publishes nothing, and its chunks are swept', async () => {
    const user = await member();
    for (let i = 0; i < 4; i += 1) await commands.create(user.session, purchase());
    const id = await request(user);
    const claimed = await claimSnapshot();
    const manifest = await builder({
      chunkBytes: 300,
      afterChunk: async (index) => {
        if (index === 0) await db.admin((client) => client.query(`UPDATE accounts SET status = 'deleting', lifecycle_generation = lifecycle_generation + 1 WHERE id = $1`, [user.accountId]));
      },
    }).build(claimed.lease);
    expect(manifest).toBeNull();
    expect((await db.admin((client) => client.query('SELECT count(*)::int AS n FROM snapshot_manifests WHERE snapshot_id = $1', [id]))).rows[0].n).toBe(0);
    expect((await db.admin((client) => client.query(`SELECT count(*)::int AS n FROM object_publications WHERE job_id = $1 AND status = 'published'`, [id]))).rows[0].n).toBe(0);
    expect((await store.list(`sync_snapshot/${user.accountId}/`)).length).toBeGreaterThan(0);
    await publication.sweep(user.accountId, new Date(Date.now() + 2 * HOUR));
    expect(await store.list(`sync_snapshot/${user.accountId}/`)).toEqual([]);
  });

  it('a build that runs out of time publishes no manifest', async () => {
    const user = await member();
    for (let i = 0; i < 4; i += 1) await commands.create(user.session, purchase());
    const id = await request(user);
    const claimed = await claimSnapshot();
    const deadline = new AbortController();
    await expect(builder({ chunkBytes: 300, afterChunk: async () => deadline.abort() }).build({ ...claimed.lease, signal: deadline.signal })).rejects.toThrow();
    expect((await db.admin((client) => client.query('SELECT count(*)::int AS n FROM snapshot_manifests WHERE snapshot_id = $1', [id]))).rows[0].n).toBe(0);
    expect((await db.admin((client) => client.query(`SELECT count(*)::int AS n FROM object_publications WHERE job_id = $1 AND status = 'published'`, [id]))).rows[0].n).toBe(0);
    expect(await status(user, id)).toEqual({ snapshot_id: id, status: 'pending' });
  });

  it('an empty account still gets a one-chunk snapshot at its high-water', async () => {
    const user = await member();
    const id = await request(user);
    const manifest = await builder().build((await claimSnapshot()).lease);
    expect(manifest?.chunks).toHaveLength(1);
    const ready = await status(user, id);
    const chunks = await download(user, ready as SnapshotDto);
    expect(chunks).toEqual([{ schema_version: 1, snapshot_id: id, high_water: '0', index: 0, entities: [] }]);
  });

  it('refuses to publish an entity that does not match its persisted DTO', async () => {
    const user = await member();
    await commands.create(user.session, purchase());
    const id = await request(user);
    await expect(new SnapshotBuilder({ reader, jobs, store, publication }, { validators: {} }).build((await claimSnapshot()).lease)).rejects.toThrow();
    expect((await db.admin((client) => client.query('SELECT count(*)::int AS n FROM snapshot_manifests WHERE snapshot_id = $1', [id]))).rows[0].n).toBe(0);
  });
});

describe('snapshot requests, status and grants', () => {
  it('requests are idempotent, share an open build, and reuse a snapshot from the last hour', async () => {
    const user = await member();
    const key = randomUUID();
    const first = await request(user, key);
    expect(await request(user, key)).toBe(first);
    expect(await request(user)).toBe(first);
    await builder().build((await claimSnapshot()).lease);
    expect(await request(user)).toBe(first);
    await db.admin((client) => client.query(`UPDATE snapshot_manifests SET created_at = now() - interval '2 hours', expires_at = now() + interval '22 hours' WHERE snapshot_id = $1`, [first]));
    const fresh = await request(user);
    expect(fresh).not.toBe(first);
    expect(await status(user, fresh)).toEqual({ snapshot_id: fresh, status: 'pending' });
  });

  it("grants are short-lived, bound to the owner, and refuse another account's snapshot", async () => {
    const user = await member();
    const other = await member();
    await commands.create(user.session, purchase());
    const id = await request(user);
    await builder().build((await claimSnapshot()).lease);
    const ready = await status(user, id);
    if (ready?.status !== 'ready') throw new Error('not ready');
    const [chunk] = ready.chunks;
    expect(Date.parse(chunk.grant_expires_at) - Date.now()).toBeLessThanOrEqual(5 * 60_000 + 1000);
    expect(await owner(user.session, (tx) => snapshots.chunk(tx, chunk.grant))).not.toBeNull();
    expect(await owner(other.session, (tx) => snapshots.chunk(tx, chunk.grant))).toBeNull();
    expect(await status(other, id)).toBeNull();
    expect(await owner(user.session, (tx) => snapshots.chunk(tx, chunk.grant, new Date(Date.now() + 6 * 60_000)))).toBeNull();
    const tampered = chunk.grant.slice(0, -2) + (chunk.grant.endsWith('AA') ? 'BB' : 'AA');
    expect(await owner(user.session, (tx) => snapshots.chunk(tx, tampered))).toBeNull();
    expect(await owner(user.session, (tx) => snapshots.chunk(tx, 'garbage'))).toBeNull();
  });

  it('reports failed and expired snapshots, and grants nothing for them', async () => {
    const user = await member();
    const failedId = await request(user);
    const claimed = await claimSnapshot();
    await jobs.fail(claimed.lease, { code: 'snapshot_error', retryable: false });
    expect(await status(user, failedId)).toEqual({ snapshot_id: failedId, status: 'failed' });
    const id = await request(user);
    await builder().build((await claimSnapshot()).lease);
    const ready = await status(user, id);
    if (ready?.status !== 'ready') throw new Error('not ready');
    await db.admin((client) => client.query(`UPDATE snapshot_manifests SET created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' WHERE snapshot_id = $1`, [id]));
    expect(await status(user, id)).toEqual({ snapshot_id: id, status: 'expired' });
    expect(await owner(user.session, (tx) => snapshots.chunk(tx, ready.chunks[0].grant))).toBeNull();
  });

  it('the worker runs snapshot jobs through the registered handler', async () => {
    const user = await member();
    await commands.create(user.session, purchase());
    const id = await request(user);
    const handlers = buildHandlers({ jobs, reader, store, publication, pool: jobsPool }, { snapshot: { validators: validators() } });
    expect(handlers.kinds()).toContain('sync_snapshot');
    expect(await new JobWorker(jobs, handlers).runOnce()).toBe('ran');
    expect((await status(user, id))?.status).toBe('ready');
    expect(new HandlerRegistry().kinds()).toEqual([]);
  });
});

describe('S1 review: one view, bounded work, generations', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const LATE = 'ffffffff-ffff-4fff-bfff-ffffffffffff';

  it('every entity comes from the high-water view even when writes land between single-entity pages', async () => {
    const user = await member();
    for (const n of [1, 2, 3]) await commands.create(user.session, purchase({ id: id(n) }));
    await commands.remove(user.session, id(1), 1);
    const snapshotId = await request(user);
    let writes = 0;
    const manifest = await builder({
      pageSize: 1,
      chunkBytes: 1,
      afterPage: async (index) => {
        if (index !== 0) return;
        await commands.create(user.session, purchase({ id: LATE, note: 'late' }));
        await commands.remove(user.session, id(3), 1);
        writes += 2;
      },
    }).build((await claimSnapshot()).lease);
    expect(writes).toBe(2);
    expect(manifest?.high_water).toBe('4');
    const chunks = await download(user, (await status(user, snapshotId)) as SnapshotDto);
    const entities = chunks.flatMap((chunk) => chunk.entities).map((e) => [e.id, e.version, e.state]);
    expect(entities).toEqual([[id(1), 2, 'deleted'], [id(2), 1, 'active'], [id(3), 1, 'active']]);
  });

  it('closes the read transaction before uploading chunks', async () => {
    const user = await member();
    for (let i = 0; i < 3; i += 1) await commands.create(user.session, purchase());
    await request(user);
    const readerLogin = (await db.admin((client) => client.query(`SELECT r.rolname FROM pg_roles r JOIN pg_auth_members m ON m.member = r.oid JOIN pg_roles g ON g.oid = m.roleid WHERE g.rolname = 'gogospend_leased_read' AND r.rolname LIKE 'gogospend_test_login_%'`))).rows.map((row) => row.rolname as string);
    const openDuringPut: number[] = [];
    const put = store.putStream.bind(store);
    store.putStream = async (key, body, options) => {
      const open = await db.admin((client) => client.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND usename = ANY($1) AND xact_start IS NOT NULL`, [readerLogin]));
      openDuringPut.push(open.rows[0].n);
      return put(key, body, options);
    };
    await builder({ chunkBytes: 300 }).build((await claimSnapshot()).lease);
    expect(openDuringPut.length).toBeGreaterThan(0);
    expect(openDuringPut.every((n) => n === 0)).toBe(true);
  });

  it('a head whose change row is missing fails the build instead of vanishing from it', async () => {
    const user = await member();
    const kept = purchase();
    await commands.create(user.session, kept);
    await commands.create(user.session, purchase());
    await db.admin((client) => client.query('DELETE FROM entity_changes WHERE account_id = $1 AND entity_id = $2', [user.accountId, kept.id]));
    const snapshotId = await request(user);
    await expect(builder().build((await claimSnapshot()).lease)).rejects.toThrow();
    expect((await db.admin((client) => client.query('SELECT count(*)::int AS n FROM snapshot_manifests WHERE snapshot_id = $1', [snapshotId]))).rows[0].n).toBe(0);
  });

  it("a snapshot from an earlier lifecycle generation is neither served nor reused", async () => {
    const user = await member();
    await commands.create(user.session, purchase());
    const first = await request(user);
    await builder().build((await claimSnapshot()).lease);
    const ready = await status(user, first);
    if (ready?.status !== 'ready') throw new Error('not ready');
    await db.admin((client) => client.query('UPDATE accounts SET lifecycle_generation = lifecycle_generation + 1 WHERE id = $1', [user.accountId]));
    expect(await status(user, first)).toEqual({ snapshot_id: first, status: 'expired' });
    expect(await owner(user.session, (tx) => snapshots.chunk(tx, ready.chunks[0].grant))).toBeNull();
    expect(await request(user)).not.toBe(first);
  });

  it('keeps chunks near their target size and grants within the snapshot expiry', async () => {
    const user = await member();
    for (let i = 0; i < 8; i += 1) await commands.create(user.session, purchase({ note: `entry ${i}` }));
    const snapshotId = await request(user);
    const manifest = await builder({ chunkBytes: 500 }).build((await claimSnapshot()).lease);
    expect(manifest?.chunks.length).toBeGreaterThan(2);
    expect(manifest?.chunks.every((chunk) => chunk.bytes <= 500 + 400)).toBe(true);
    await db.admin((client) => client.query(`UPDATE snapshot_manifests SET expires_at = now() + interval '2 minutes' WHERE snapshot_id = $1`, [snapshotId]));
    const ready = await status(user, snapshotId);
    if (ready?.status !== 'ready') throw new Error('not ready');
    expect(ready.chunks.every((chunk) => Date.parse(chunk.grant_expires_at) <= Date.parse(ready.expires_at))).toBe(true);
  });
});
