import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import { ChangeWriter } from '../sync/change-writer';
import { CommandDigester, TEST_DIGEST_KEY } from '../commands/command-digest';
import { CommandExecutor } from '../commands/command-executor';
import { CommandReceiptRepository } from '../commands/command-receipts.repository';
import { CommandRegistry } from '../commands/command-registry';
import { JobRepository } from '../jobs/job.repository';
import type { ClaimedJob } from '../jobs/job-types';
import { PolicyService } from '../policies/policy.service';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { acceptPolicies, createFixtureDomain, fixtureCommands, publishPolicies, purchase, registerFixtureDomain } from '../testing/command-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { queueAccountJob } from '../testing/job-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { DatabaseService } from './database.service';
import { LeasedAccountRead, LeasedReadDenied } from './leased-account-read';

let db: TestDatabase;
let issuer: JwksFixture;
let appPool: Pool;
let fx: ReturnType<typeof authFixtures>;
let commands: ReturnType<typeof fixtureCommands>;
let jobs: JobRepository;
let reader: LeasedAccountRead;
let readerPool: Pool;

async function member(): Promise<SignedUp> {
  const user = await fx.signUp();
  await acceptPolicies(db, user.accountId);
  return user;
}

async function leaseFor(user: SignedUp, kind: 'sync_snapshot' | 'export' = 'sync_snapshot', leaseSeconds = 60): Promise<ClaimedJob> {
  await queueAccountJob(db, user.accountId, kind, { maxRuntimeSeconds: 120 });
  const [claimed] = await jobs.claim([kind], { leaseSeconds });
  return claimed;
}

async function denied(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return false;
  } catch (error) {
    if (error instanceof LeasedReadDenied) return true;
    throw error;
  }
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  appPool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  fx = authFixtures(issuer, appPool);
  await createFixtureDomain(db);
  await publishPolicies(db);
  const service = new DatabaseService(appPool);
  const registry = new CommandRegistry();
  registerFixtureDomain(registry);
  commands = fixtureCommands(new CommandExecutor(service, registry, new PolicyService(appPool, service, 0), new ChangeWriter(registry), new CommandReceiptRepository(), new CommandDigester(TEST_DIGEST_KEY)));
  jobs = new JobRepository(await db.loginPool(['gogospend_jobs'], 2));
  readerPool = await db.loginPool(['gogospend_leased_read'], 3);
  reader = new LeasedAccountRead(readerPool);
});

afterAll(async () => {
  await issuer?.close();
  await db?.drop();
});

beforeEach(async () => {
  await db.admin((client) => client.query('DELETE FROM jobs'));
});

describe('leased account reads', () => {
  it("a current lease reads exactly its own account's latest entities at one high-water", async () => {
    const user = await member();
    const other = await member();
    const coffee = purchase();
    await commands.create(user.session, coffee);
    await commands.remove(user.session, coffee.id, 1);
    const tea = purchase({ note: 'tea' });
    await commands.create(user.session, tea);
    await commands.create(other.session, purchase());
    const claimed = await leaseFor(user);
    const result = await reader.withSnapshot(claimed.lease, 'sync_snapshot', async (read) => ({ account: read.accountId, high: await read.highWater(), entities: await read.entities(null, 100) }));
    expect(result.account).toBe(user.accountId);
    expect(result.high).toBe('3');
    expect(result.entities.map((entity) => [entity.id, entity.version, entity.state]).sort()).toEqual([[coffee.id, 2, 'deleted'], [tea.id, 1, 'active']].sort());
    for (const entity of result.entities) expect(Object.keys(entity).sort()).toEqual(['entity', 'id', 'snapshot', 'state', 'version']);
    expect(result.entities.find((entity) => entity.id === tea.id)?.snapshot).toEqual(tea);
  });

  it('pages entities in a stable order', async () => {
    const user = await member();
    for (let i = 0; i < 5; i += 1) await commands.create(user.session, purchase());
    const claimed = await leaseFor(user);
    const pages = await reader.withSnapshot(claimed.lease, 'sync_snapshot', async (read) => {
      const first = await read.entities(null, 3);
      const last = first[first.length - 1];
      const second = await read.entities({ entity: last.entity, id: last.id }, 3);
      return [first, second];
    });
    expect(pages.map((page) => page.length)).toEqual([3, 2]);
    expect(new Set(pages.flat().map((entity) => entity.id)).size).toBe(5);
  });

  it('rows committed after the snapshot began are invisible inside it', async () => {
    const user = await member();
    await commands.create(user.session, purchase());
    const claimed = await leaseFor(user);
    const seen = await reader.withSnapshot(claimed.lease, 'sync_snapshot', async (read) => {
      const before = await read.highWater();
      await commands.create(user.session, purchase());
      return [before, await read.highWater(), (await read.entities(null, 100)).length];
    });
    expect(seen).toEqual(['1', '1', 1]);
  });

  it('a missing, foreign, expired or cancelled lease, or the wrong purpose, cannot read', async () => {
    const user = await member();
    const claimed = await leaseFor(user);
    const read = (lease = claimed.lease, purpose: 'sync_snapshot' | 'export' = 'sync_snapshot') => reader.withSnapshot(lease, purpose, (tx) => tx.highWater());
    expect(await denied(() => read({ ...claimed.lease, jobId: randomUUID() }))).toBe(true);
    expect(await denied(() => read({ ...claimed.lease, leaseToken: randomUUID() }))).toBe(true);
    expect(await denied(() => read(claimed.lease, 'export'))).toBe(true);
    await db.admin((client) => client.query(`UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`, [claimed.lease.jobId]));
    expect(await denied(() => read())).toBe(true);
    const again = await leaseFor(user);
    await jobs.cancelAccount(user.accountId);
    expect(await denied(() => read(again.lease))).toBe(true);
  });

  it('an account that is being deleted, or a changed lifecycle generation, cannot be read', async () => {
    const user = await member();
    const claimed = await leaseFor(user);
    await db.admin((client) => client.query('UPDATE accounts SET lifecycle_generation = lifecycle_generation + 1 WHERE id = $1', [user.accountId]));
    expect(await denied(() => reader.withSnapshot(claimed.lease, 'sync_snapshot', (tx) => tx.highWater()))).toBe(true);
    const deleting = await member();
    const lease = await leaseFor(deleting);
    await db.admin((client) => client.query(`UPDATE accounts SET status = 'deleting' WHERE id = $1`, [deleting.accountId]));
    expect(await denied(() => reader.withSnapshot(lease.lease, 'sync_snapshot', (tx) => tx.highWater()))).toBe(true);
  });

  it('a long snapshot stays readable while heartbeats extend its lease, until the attempt runtime bound', async () => {
    const user = await member();
    await commands.create(user.session, purchase());
    const claimed = await leaseFor(user, 'sync_snapshot', 2);
    expect(await jobs.heartbeat(claimed.lease, 30)).not.toBeNull();
    const result = await reader.withSnapshot(claimed.lease, 'sync_snapshot', async (read) => {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      return [await read.highWater(), (await read.entities(null, 10)).length];
    });
    expect(result).toEqual(['1', 1]);
    await db.admin((client) => client.query(`UPDATE jobs SET attempt_started_at = now() - interval '1 hour' WHERE id = $1`, [claimed.lease.jobId]));
    expect(await denied(() => reader.withSnapshot(claimed.lease, 'sync_snapshot', (tx) => tx.highWater()))).toBe(true);
  });

  it('a key position needs both its entity and id', async () => {
    const user = await member();
    const claimed = await leaseFor(user);
    await expect(reader.withSnapshot(claimed.lease, 'sync_snapshot', (tx) => tx.entities({ entity: 'fixture_purchase', id: null as unknown as string }, 10))).rejects.toThrow();
  });

  it('the leased-read role has no direct access to financial or identity tables', async () => {
    for (const table of ['transactions', 'wallets', 'entity_changes', 'entity_heads', 'accounts', 'jobs']) {
      await expect(readerPool.query(`SELECT 1 FROM ${table} LIMIT 1`)).rejects.toMatchObject({ code: '42501' });
    }
  });
});
