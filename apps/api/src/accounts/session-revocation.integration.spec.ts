import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from 'pg';
import type { Pool } from 'pg';
import request from 'supertest';

import type { IdentityMaintenanceGateway, MaintenanceOutcome } from '../auth/auth0-management.client';
import { SecurityJobRepository, processRevocationJob, runSecurityJobsOnce } from '../auth/security-job.repository';
import { ProblemException } from '../common/api-problem.filter';
import { poolConfigFromUrl } from '../database/database-config';
import { DatabaseService } from '../database/database.service';
import { lockAccount } from '../database/owner-transaction';
import { JobRepository } from '../jobs/job.repository';
import { PolicyService } from '../policies/policy.service';
import { publishPolicies } from '../testing/command-fixtures';
import { authFixtures } from '../testing/auth-fixtures';
import { TEST_AUDIENCE, TEST_CLIENT_ID, startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { V1AppModule, configureV1App } from '../v1/v1-app.module';
import { assertActiveSession } from './active-session';
import { SessionRevocationService } from './session-revocation.service';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let service: DatabaseService;
let revocation: SessionRevocationService;
let jobs: JobRepository;
let security: SecurityJobRepository;

type Call = { subject: string; clientIds: readonly string[] };
const gateway: IdentityMaintenanceGateway & { calls: Call[]; outcome: MaintenanceOutcome } = {
  calls: [],
  outcome: { status: 'done', count: 1 },
  async revokeGrants(subject, clientIds) {
    this.calls.push({ subject, clientIds });
    return this.outcome;
  },
  async deleteUser() {
    return { status: 'done', count: 1 };
  },
};
const runWorker = (options: { leaseSeconds?: number } = {}) => runSecurityJobsOnce({ jobs, security, gateway, nativeClientIds: [TEST_CLIENT_ID] }, options);

async function code(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'ok';
  } catch (error) {
    if (error instanceof ProblemException) return `${error.getStatus()} ${error.code}`;
    throw error;
  }
}

/** Sign-ins after a logout must postdate reauth_after (whole seconds). */
async function afterReauthBoundary(accountId: string): Promise<void> {
  const row = (await db.admin((client) => client.query(`SELECT greatest(0, extract(epoch FROM reauth_after - clock_timestamp()) * 1000)::int AS wait FROM accounts WHERE id = $1`, [accountId]))).rows[0];
  await new Promise((resolve) => setTimeout(resolve, (row?.wait ?? 0) + 50));
}

async function logoutEverywhere(signedIn: Awaited<ReturnType<typeof fx.signUp>>) {
  const commandId = randomUUID();
  const proofId = await fx.proven(signedIn.who, 'global_logout', commandId);
  return revocation.revokeAll(signedIn.session, proofId, commandId);
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  fx = authFixtures(issuer, pool);
  service = new DatabaseService(pool);
  revocation = new SessionRevocationService(service);
  const workerPool = await db.loginPool(['gogospend_jobs', 'gogospend_security'], 3);
  jobs = new JobRepository(workerPool);
  security = new SecurityJobRepository(workerPool);
});

afterAll(async () => {
  await issuer?.close();
  await db?.drop();
});

beforeEach(async () => {
  gateway.calls = [];
  gateway.outcome = { status: 'done', count: 1 };
  // Each test sees only the cleanup jobs it queued.
  await db.admin((client) => client.query('DELETE FROM jobs'));
});

describe('global logout over HTTP', () => {
  let app: NestExpressApplication;
  const SETTINGS = ['DATABASE_URL', 'AUTH0_ISSUER', 'AUTH0_AUDIENCE', 'AUTH0_ALLOWED_CLIENT_IDS', 'RATE_LIMIT_KEY', 'COMMAND_DIGEST_KEY', 'MIN_CLIENT_VERSION_IOS', 'MIN_CLIENT_VERSION_ANDROID', 'OBJECT_STORE'];
  const saved = Object.fromEntries(SETTINGS.map((key) => [key, process.env[key]]));

  beforeAll(async () => {
    Object.assign(process.env, {
      DATABASE_URL: await db.loginUrl(['gogospend_app', 'gogospend_bootstrap']),
      AUTH0_ISSUER: issuer.issuer,
      AUTH0_AUDIENCE: TEST_AUDIENCE,
      AUTH0_ALLOWED_CLIENT_IDS: TEST_CLIENT_ID,
      RATE_LIMIT_KEY: 'synthetic-test-key-0123456789abcdef0123456789',
      COMMAND_DIGEST_KEY: 'synthetic-command-digest-key-0123456789abcdef',
      MIN_CLIENT_VERSION_IOS: '1.0.0',
      MIN_CLIENT_VERSION_ANDROID: '1.0.0',
      OBJECT_STORE: 'memory',
    });
    app = await NestFactory.create<NestExpressApplication>(V1AppModule, { bodyParser: false, logger: false, abortOnError: false });
    configureV1App(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('logout_invalidates_existing_binding_before_provider_cleanup', async () => {
    const who = fx.identity();
    const phone = await fx.signIn(who);
    const tablet = await fx.signIn(who);
    const headers = async (binding: string) => ({ 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await issuer.accessToken({ sub: who.subject })}`, 'x-gogospend-session': binding });

    const commandId = randomUUID();
    const proofId = await fx.proven(who, 'global_logout', commandId);
    const logout = await request(app.getHttpServer()).post('/v1/me/global-logout').set({ ...(await headers(phone.binding)), 'idempotency-key': commandId }).send({ proof_id: proofId });
    expect(logout.status).toBe(202);
    expect(logout.body).toEqual({ generation: 1, provider_cleanup: 'pending' });

    // A freshly refreshed access token does not bring either old binding back.
    const oldBindingResponse = await request(app.getHttpServer()).get('/v1/me').set(await headers(tablet.binding));
    expect(oldBindingResponse.status).toBe(401);
    expect((await request(app.getHttpServer()).get('/v1/me').set(await headers(phone.binding))).status).toBe(401);
    expect(gateway.calls).toEqual([]);
  });

  it('signing out one device leaves the other signed in', async () => {
    const who = fx.identity();
    const phone = await fx.signIn(who);
    const tablet = await fx.signIn(who);
    const headers = async (binding: string) => ({ 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await issuer.accessToken({ sub: who.subject })}`, 'x-gogospend-session': binding });
    expect((await request(app.getHttpServer()).post('/v1/me/logout').set(await headers(phone.binding))).status).toBe(204);
    expect((await request(app.getHttpServer()).get('/v1/me').set(await headers(phone.binding))).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/v1/me').set(await headers(tablet.binding))).status).toBe(200);
  });
});

describe('provider cleanup hold', () => {
  it('holds new sign-ins until Auth0 cleanup succeeds, then lets the user back in', async () => {
    const user = await fx.signUp();
    await logoutEverywhere(user);
    expect(await code(() => fx.signIn(user.who))).toBe('403 ACCOUNT_UNAVAILABLE');
    expect(await runWorker()).toMatchObject({ revoked: 1 });
    expect(gateway.calls).toEqual([{ subject: user.who.subject, clientIds: [TEST_CLIENT_ID] }]);
    await afterReauthBoundary(user.accountId);
    const back = await fx.signIn(user.who);
    expect(back.accountId).toBe(user.accountId);
    expect(back.session.sessionGeneration).toBe(1);
  });

  it('a provider outage keeps the hold visible and retries, never falling back to old authority', async () => {
    const user = await fx.signUp();
    await logoutEverywhere(user);
    gateway.outcome = { status: 'retryable', code: 'provider_unavailable' };
    expect(await runWorker()).toMatchObject({ retrying: 1 });
    const job = (await db.admin((client) => client.query(`SELECT status, last_error, run_after > now() AS deferred FROM jobs WHERE account_id = $1`, [user.accountId]))).rows[0];
    expect(job).toEqual({ status: 'queued', last_error: 'provider_unavailable', deferred: true });
    expect(await code(() => fx.signIn(user.who))).toBe('403 ACCOUNT_UNAVAILABLE');
  });

  it('a permanent provider failure is a visible failed job and the hold stays', async () => {
    const user = await fx.signUp();
    await logoutEverywhere(user);
    gateway.outcome = { status: 'permanent', code: 'forbidden' };
    expect(await runWorker()).toMatchObject({ failed: 1 });
    expect((await db.admin((client) => client.query(`SELECT status FROM jobs WHERE account_id = $1`, [user.accountId]))).rows[0].status).toBe('failed');
    expect(await code(() => fx.signIn(user.who))).toBe('403 ACCOUNT_UNAVAILABLE');
  });

  it('a delayed old run of the job cannot revoke grants issued after cleanup finished', async () => {
    const user = await fx.signUp();
    await logoutEverywhere(user);
    const [stale] = await jobs.claim(['auth0_revoke_grants']);
    await db.admin((client) => client.query(`UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`, [stale.lease.jobId]));
    expect(await runWorker()).toMatchObject({ revoked: 1 });
    await afterReauthBoundary(user.accountId);
    await fx.signIn(user.who);
    gateway.calls = [];
    expect(await processRevocationJob(stale, { jobs, security, gateway })).toBe('stale');
    expect(gateway.calls).toEqual([]);
  });
});

describe('races with the account lock', () => {
  it('a request that passed the guard but waited behind a logout writes nothing', async () => {
    const user = await fx.signUp();
    const logout = new Client(poolConfigFromUrl(db.adminUrl, 1));
    await logout.connect();
    try {
      await logout.query('BEGIN');
      await logout.query(`SELECT set_config('gogospend.account_id', $1, true)`, [user.accountId]);
      await logout.query('SELECT * FROM gogospend_global_logout($1)', [randomUUID()]);
      const waiting = code(() => service.withOwnerTransaction(user.session, async (tx) => {
        const state = await lockAccount(tx, user.accountId);
        await assertActiveSession(tx, user.session, state);
      }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await logout.query('COMMIT');
      expect(await waiting).toBe('401 SESSION_REQUIRED');
    } finally {
      await logout.end();
    }
  });

  it('a revoked binding fails the under-lock check even before its generation changes', async () => {
    const user = await fx.signUp();
    await revocation.revokeCurrent(user.session);
    expect(await code(() => service.withOwnerTransaction(user.session, async (tx) => assertActiveSession(tx, user.session, await lockAccount(tx, user.accountId))))).toBe('401 SESSION_REQUIRED');
  });

  it('global logout needs a fresh proof for this command', async () => {
    const user = await fx.signUp();
    const proofId = await fx.proven(user.who, 'global_logout', randomUUID());
    expect(await code(() => revocation.revokeAll(user.session, proofId, randomUUID()))).toBe('401 REAUTH_REQUIRED');
  });
});

describe('review hardening', () => {
  const jobOf = async (accountId: string) => (await db.admin((client) => client.query(`SELECT * FROM jobs WHERE account_id = $1`, [accountId]))).rows[0];

  it('a job that global logout did not write cannot lift a hold', async () => {
    const user = await fx.signUp();
    await logoutEverywhere(user);
    const real = await jobOf(user.accountId);
    await db.admin(async (client) => {
      await client.query(`UPDATE jobs SET run_after = now() + interval '1 hour' WHERE id = $1`, [real.id]);
      await client.query(`INSERT INTO jobs (id, kind, account_id, payload, max_attempts) VALUES ($1, 'auth0_revoke_grants', $2, $3, 3)`, [randomUUID(), user.accountId, JSON.stringify({ ...real.payload, client_ids: [] })]);
    });
    await runWorker();
    await afterReauthBoundary(user.accountId);
    expect(await code(() => fx.signIn(user.who))).toBe('403 ACCOUNT_UNAVAILABLE');
  });

  it('a login with only the generic jobs role cannot see or create security jobs', async () => {
    const user = await fx.signUp();
    await logoutEverywhere(user);
    const generic = await db.loginPool(['gogospend_jobs'], 1);
    expect((await generic.query(`SELECT count(*)::int AS n FROM jobs WHERE kind = 'auth0_revoke_grants'`)).rows[0].n).toBe(0);
    await expect(generic.query(`INSERT INTO jobs (id, kind, account_id, payload, max_attempts) VALUES ($1, 'auth0_revoke_grants', $2, '{}', 1)`, [randomUUID(), user.accountId])).rejects.toMatchObject({ code: '42501' });
  });

  it('the queue never stores provider subjects', async () => {
    const user = await fx.signUp();
    await logoutEverywhere(user);
    expect(JSON.stringify((await jobOf(user.accountId)).payload)).not.toContain(user.who.subject);
  });

  it('revokes grants for every configured native client, not only those that held sessions', async () => {
    const user = await fx.signUp();
    await logoutEverywhere(user);
    await runSecurityJobsOnce({ jobs, security, gateway, nativeClientIds: ['native-android-test', TEST_CLIENT_ID] });
    expect(gateway.calls).toEqual([{ subject: user.who.subject, clientIds: ['native-android-test', TEST_CLIENT_ID].sort() }]);
  });

  it('each job gets its own lease when processing starts, so a slow first job cannot starve the next', async () => {
    const [first, second] = [await fx.signUp(), await fx.signUp()];
    await logoutEverywhere(first);
    await logoutEverywhere(second);
    const slow: IdentityMaintenanceGateway = {
      revokeGrants: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return { status: 'done', count: 1 };
      },
      deleteUser: async () => ({ status: 'done', count: 0 }),
    };
    expect(await runSecurityJobsOnce({ jobs, security, gateway: slow, nativeClientIds: [TEST_CLIENT_ID] }, { leaseSeconds: 2 })).toMatchObject({ revoked: 2, stale: 0 });
  });

  it('a lease past its expiry can neither start nor finish provider work, even if nobody reclaimed it', async () => {
    const user = await fx.signUp();
    await logoutEverywhere(user);
    const [claimed] = await jobs.claim(['auth0_revoke_grants'], { leaseSeconds: 60 });
    await db.admin((client) => client.query(`UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`, [claimed.lease.jobId]));
    expect(await security.state(claimed.lease)).toBe('stale_lease');
    expect(await security.finishRevocation(claimed.lease)).toBe('stale_lease');
  });

  it('cleanup keeps retrying through a long provider outage (20 attempts, about 15 hours)', async () => {
    const user = await fx.signUp();
    await logoutEverywhere(user);
    expect((await jobOf(user.accountId)).max_attempts).toBe(20);
  });

  it('reauth_after rounds up, so no login from the logout second counts', async () => {
    const user = await fx.signUp();
    const before = (await db.admin((client) => client.query('SELECT clock_timestamp() AS t'))).rows[0].t as Date;
    await logoutEverywhere(user);
    const { reauth_after: after } = (await db.admin((client) => client.query('SELECT reauth_after FROM accounts WHERE id = $1', [user.accountId]))).rows[0];
    expect(after.getTime()).toBeGreaterThan(before.getTime());
    expect(after.getMilliseconds()).toBe(0);
  });

  it('a bootstrap waiting behind the logout lock comes back blocked', async () => {
    const user = await fx.signUp();
    const logout = new Client(poolConfigFromUrl(db.adminUrl, 1));
    await logout.connect();
    try {
      await logout.query('BEGIN');
      await logout.query(`SELECT set_config('gogospend.account_id', $1, true)`, [user.accountId]);
      await logout.query('SELECT * FROM gogospend_global_logout($1)', [randomUUID()]);
      const waiting = code(() => fx.signIn(user.who));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await logout.query('COMMIT');
      expect(await waiting).toBe('403 ACCOUNT_UNAVAILABLE');
    } finally {
      await logout.end();
    }
  });

  it('a policy acceptance that waited behind a logout writes nothing', async () => {
    await publishPolicies(db);
    const user = await fx.signUp();
    const logout = new Client(poolConfigFromUrl(db.adminUrl, 1));
    await logout.connect();
    try {
      await logout.query('BEGIN');
      await logout.query(`SELECT set_config('gogospend.account_id', $1, true)`, [user.accountId]);
      await logout.query('SELECT * FROM gogospend_global_logout($1)', [randomUUID()]);
      const waiting = code(() => new PolicyService(pool, service, 0).accept(user.session, 'terms', 1));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await logout.query('COMMIT');
      expect(await waiting).toBe('401 SESSION_REQUIRED');
      expect((await db.admin((client) => client.query('SELECT count(*)::int AS n FROM consents WHERE account_id = $1', [user.accountId]))).rows[0].n).toBe(0);
    } finally {
      await logout.end();
    }
  });

  it('each role reaches only its own security routines', async () => {
    const app = await db.loginPool(['gogospend_app'], 1);
    const generic = await db.loginPool(['gogospend_jobs'], 1);
    const securityOnly = await db.loginPool(['gogospend_security'], 1);
    const id = randomUUID();
    for (const caller of [app, generic]) {
      await expect(caller.query('SELECT gogospend_finish_revocation($1, $1)', [id])).rejects.toMatchObject({ code: '42501' });
      await expect(caller.query('SELECT gogospend_revocation_job_is_current($1, $1)', [id])).rejects.toMatchObject({ code: '42501' });
    }
    await expect(securityOnly.query('SELECT * FROM gogospend_global_logout($1)', [id])).rejects.toMatchObject({ code: '42501' });
  });

  it('the worker refuses to run as anything but a jobs+security login', async () => {
    await expect(new SecurityJobRepository(await db.loginPool(['gogospend_app'], 1)).assertLeastPrivilegeWorker()).rejects.toThrow();
    await expect(new SecurityJobRepository(await db.loginPool(['gogospend_jobs', 'gogospend_security', 'gogospend_app'], 1)).assertLeastPrivilegeWorker()).rejects.toThrow();
    await expect(security.assertLeastPrivilegeWorker()).resolves.toBeUndefined();
  });
});
