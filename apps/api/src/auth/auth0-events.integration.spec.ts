import { randomUUID } from 'node:crypto';

import type { ApiIdentity } from '@gogospend/contracts';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';

import { ProblemException } from '../common/api-problem.filter';
import { JobRepository } from '../jobs/job.repository';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { publishPolicies } from '../testing/command-fixtures';
import { TEST_AUDIENCE, TEST_CLIENT_ID, startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { V1AppModule, configureV1App } from '../v1/v1-app.module';
import { SessionRevocationService } from '../accounts/session-revocation.service';
import { DatabaseService } from '../database/database.service';
import { EVENT_SIGNATURE_HEADER, signSecurityEvent } from './auth0-event-verifier';
import { SecurityEventService } from './auth0-events.service';
import type { CredentialStateOutcome, IdentityMaintenanceGateway, MaintenanceOutcome } from './auth0-management.client';
import { RECONCILE_KIND, SecurityJobRepository, runSecurityJobsOnce } from './security-job.repository';

const SECRET = 'synthetic-event-secret-0123456789abcdef0123456789';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let events: SecurityEventService;
let jobs: JobRepository;
let security: SecurityJobRepository;

const gateway: IdentityMaintenanceGateway & { revoked: string[]; resets: Map<string, string>; state: CredentialStateOutcome | null; perSubject: Map<string, CredentialStateOutcome>; asked: string[]; outcome: MaintenanceOutcome } = {
  revoked: [],
  resets: new Map(),
  state: null,
  perSubject: new Map(),
  asked: [],
  outcome: { status: 'done', count: 1 },
  async revokeGrants(subject) {
    this.revoked.push(subject);
    return this.outcome;
  },
  async deleteUser() {
    return { status: 'done', count: 0 };
  },
  async credentialState(subject) {
    this.asked.push(subject);
    return this.perSubject.get(subject) ?? this.state ?? { status: 'done', lastPasswordReset: this.resets.get(subject) ?? null };
  },
};
const runWorker = (reconcile = false) =>
  runSecurityJobsOnce({ jobs, security, gateway, nativeClientIds: [TEST_CLIENT_ID], ...(reconcile ? { reconcile: { everySeconds: 60, batch: 1000 } } : {}) });

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Signs in with a chosen login time (the routine accepts up to 30 seconds before the challenge). */
async function signInAt(who: ApiIdentity, authTime: number): Promise<SignedUp> {
  const result = await fx.bootstrapper.bootstrap(who, await fx.proofFor(who, await fx.challengeFor(who), { auth_time: authTime }));
  const session = await fx.resolver.resolve(who, result.binding);
  if (!session) throw new Error('fresh binding did not resolve');
  return { who, accountId: result.account_id, binding: result.binding, session };
}

const active = async (user: SignedUp) => (await fx.resolver.resolve(user.who, user.binding)) !== null;

function envelope(fields: { subject: string; occurredAt: Date; id?: string; type?: string; issuer?: string }) {
  return JSON.stringify({
    id: fields.id ?? `evt_${randomUUID().replace(/-/g, '')}`,
    type: fields.type ?? 'password_changed',
    issuer: fields.issuer ?? issuer.issuer,
    subject: fields.subject,
    occurred_at: fields.occurredAt.toISOString(),
  });
}

const deliver = (raw: string, secret = SECRET) => events.handleSecurityEvent({ rawBody: Buffer.from(raw, 'utf8'), signature: signSecurityEvent(raw, secret, nowSeconds()) });

async function problem(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'ok';
  } catch (error) {
    if (error instanceof ProblemException) return `${error.getStatus()} ${error.code}`;
    throw error;
  }
}

const receipt = async (raw: string) =>
  (await db.admin((client) => client.query<{ outcome: string; job_id: string | null }>('SELECT outcome, job_id FROM auth_event_receipts WHERE event_id = $1', [JSON.parse(raw).id]))).rows[0];
const revocationJobs = async (accountId: string) =>
  (await db.admin((client) => client.query<{ n: number }>(`SELECT count(*)::int AS n FROM jobs WHERE kind = 'auth0_revoke_grants' AND account_id = $1`, [accountId]))).rows[0].n;

/** Sign-ins after a credential change must postdate reauth_after (whole seconds). */
async function afterReauthBoundary(accountId: string): Promise<void> {
  const row = (await db.admin((client) => client.query(`SELECT greatest(0, extract(epoch FROM reauth_after - clock_timestamp()) * 1000)::int AS wait FROM accounts WHERE id = $1`, [accountId]))).rows[0];
  await new Promise((resolve) => setTimeout(resolve, (row?.wait ?? 0) + 50));
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  fx = authFixtures(issuer, pool);
  events = new SecurityEventService(pool, { secrets: [SECRET], issuer: issuer.issuer });
  const workerPool = await db.loginPool(['gogospend_jobs', 'gogospend_security'], 3);
  jobs = new JobRepository(workerPool);
  security = new SecurityJobRepository(workerPool);
});

afterAll(async () => {
  await issuer?.close();
  await db?.drop();
});

beforeEach(async () => {
  gateway.revoked = [];
  gateway.resets.clear();
  gateway.state = null;
  gateway.perSubject.clear();
  gateway.asked = [];
  gateway.outcome = { status: 'done', count: 1 };
  await db.admin((client) => client.query('DELETE FROM jobs'));
});

describe('verified password-change events', () => {
  it('end sessions signed in before the change, keep later ones, and queue provider cleanup behind a hold', async () => {
    const who = fx.identity();
    const before = await signInAt(who, nowSeconds() - 25);
    const after = await signInAt(who, nowSeconds());
    const raw = envelope({ subject: who.subject, occurredAt: new Date(Date.now() - 12_000) });
    expect(await deliver(raw)).toBe('applied');
    expect(await active(before)).toBe(false);
    // Held (not revoked) until Auth0 has revoked the old refresh grants.
    expect(await active(after)).toBe(false);
    expect(await revocationJobs(before.accountId)).toBe(1);
    expect(await problem(() => signInAt(who, nowSeconds()))).toBe('403 ACCOUNT_UNAVAILABLE');
    expect(await runWorker()).toMatchObject({ revoked: 1 });
    expect(gateway.revoked).toEqual([who.subject]);
    expect(await active(after)).toBe(true);
    expect(await active(before)).toBe(false);
    // A login from before the change (an old refresh grant's auth_time) cannot bind again.
    expect(await problem(() => signInAt(who, nowSeconds() - 20))).toBe('401 REAUTH_REQUIRED');
    await afterReauthBoundary(before.accountId);
    expect(await active(await signInAt(who, nowSeconds()))).toBe(true);
  });

  it('a change after every live session ends no session, but old refresh grants are still revoked', async () => {
    const user = await signInAt(fx.identity(), nowSeconds() - 25);
    // Two days old (events are accepted for seven): still a reason to revoke grants.
    const raw = envelope({ subject: user.who.subject, occurredAt: new Date(Date.now() - 2 * 86_400_000) });
    expect(await deliver(raw)).toBe('applied');
    expect(await revocationJobs(user.accountId)).toBe(1);
    expect(await runWorker()).toMatchObject({ revoked: 1 });
    expect(await active(user)).toBe(true);
  });

  it('a duplicate delivery changes nothing, and concurrent duplicates apply once', async () => {
    const user = await signInAt(fx.identity(), nowSeconds() - 25);
    const raw = envelope({ subject: user.who.subject, occurredAt: new Date(Date.now() - 10_000) });
    expect(await deliver(raw)).toBe('applied');
    expect(await deliver(raw)).toBe('duplicate');
    expect(await revocationJobs(user.accountId)).toBe(1);

    const other = await signInAt(fx.identity(), nowSeconds() - 25);
    const twice = envelope({ subject: other.who.subject, occurredAt: new Date(Date.now() - 10_000) });
    expect((await Promise.all([deliver(twice), deliver(twice)])).sort()).toEqual(['applied', 'duplicate']);
    expect(await revocationJobs(other.accountId)).toBe(1);
  });

  it('the same event id with different content is refused and changes nothing', async () => {
    const [victim, target] = [await signInAt(fx.identity(), nowSeconds() - 25), await signInAt(fx.identity(), nowSeconds() - 25)];
    const id = `evt_${randomUUID().replace(/-/g, '')}`;
    expect(await deliver(envelope({ id, subject: target.who.subject, occurredAt: new Date(Date.now() - 10_000) }))).toBe('applied');
    expect(await problem(() => deliver(envelope({ id, subject: victim.who.subject, occurredAt: new Date(Date.now() - 10_000) })))).toBe('409 IDEMPOTENCY_MISMATCH');
    expect(await active(victim)).toBe(true);
    expect(await revocationJobs(victim.accountId)).toBe(0);
  });

  it('an older event arriving after a newer one is superseded and changes nothing', async () => {
    const who = fx.identity();
    const first = await signInAt(who, nowSeconds() - 25);
    const newer = envelope({ subject: who.subject, occurredAt: new Date(Date.now() - 5_000) });
    expect(await deliver(newer)).toBe('applied');
    await runWorker();
    await afterReauthBoundary(first.accountId);
    const later = await signInAt(who, nowSeconds());
    const jobsBefore = await revocationJobs(first.accountId);
    const older = envelope({ subject: who.subject, occurredAt: new Date(Date.now() - 15_000) });
    expect(await deliver(older)).toBe('applied');
    expect(await receipt(older)).toEqual({ outcome: 'superseded', job_id: null });
    expect(await active(later)).toBe(true);
    expect(await revocationJobs(first.accountId)).toBe(jobsBefore);
  });

  it('an event for a principal without an account is recorded and changes nothing', async () => {
    const raw = envelope({ subject: `auth0|${randomUUID()}`, occurredAt: new Date(Date.now() - 1_000) });
    expect(await deliver(raw)).toBe('applied');
    expect(await receipt(raw)).toEqual({ outcome: 'no_account', job_id: null });
  });

  it('a blocked user is treated like a credential change', async () => {
    const user = await signInAt(fx.identity(), nowSeconds() - 25);
    expect(await deliver(envelope({ type: 'user_blocked', subject: user.who.subject, occurredAt: new Date(Date.now() - 10_000) }))).toBe('applied');
    expect(await active(user)).toBe(false);
  });

  it('forged, stale and unconfigured deliveries are refused before anything is recorded', async () => {
    const user = await signInAt(fx.identity(), nowSeconds() - 25);
    const raw = envelope({ subject: user.who.subject, occurredAt: new Date(Date.now() - 10_000) });
    expect(await problem(() => deliver(raw, 'forged-secret-0123456789abcdef0123456789abcdef'))).toBe('401 UNAUTHENTICATED');
    expect(await problem(() => events.handleSecurityEvent({ rawBody: Buffer.from(raw), signature: signSecurityEvent(raw, SECRET, nowSeconds() - 600) }))).toBe('401 UNAUTHENTICATED');
    expect(await problem(() => deliver(envelope({ subject: user.who.subject, occurredAt: new Date(), issuer: 'https://elsewhere.example/' })))).toBe('422 VALIDATION_FAILED');
    expect(await problem(() => new SecurityEventService(pool, null).handleSecurityEvent({ rawBody: Buffer.from(raw), signature: signSecurityEvent(raw, SECRET, nowSeconds()) }))).toBe('404 NOT_FOUND');
    expect(await receipt(raw)).toBeUndefined();
    expect(await active(user)).toBe(true);
  });

  it('the database refuses events from the future even past the verifier', async () => {
    const user = await signInAt(fx.identity(), nowSeconds() - 25);
    await expect(pool.query('SELECT gogospend_record_security_event($1, $2, $3, $4, $5, $6)', [`evt_${randomUUID().replace(/-/g, '')}`, 'password_changed', issuer.issuer, user.who.subject, new Date(Date.now() + 3_600_000), randomUUID()])).rejects.toThrow();
    expect(await active(user)).toBe(true);
  });
});

describe('over HTTP', () => {
  let app: NestExpressApplication;
  const SETTINGS = ['DATABASE_URL', 'AUTH0_ISSUER', 'AUTH0_AUDIENCE', 'AUTH0_ALLOWED_CLIENT_IDS', 'RATE_LIMIT_KEY', 'COMMAND_DIGEST_KEY', 'MIN_CLIENT_VERSION_IOS', 'MIN_CLIENT_VERSION_ANDROID', 'OBJECT_STORE', 'AUTH0_EVENTS_SIGNING_SECRETS'];
  const saved = Object.fromEntries(SETTINGS.map((key) => [key, process.env[key]]));

  beforeAll(async () => {
    await publishPolicies(db);
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
      AUTH0_EVENTS_SIGNING_SECRETS: SECRET,
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

  it('refuses a large body at the 8 KiB limit, before any JSON parsing', async () => {
    const res = await request(app.getHttpServer()).post('/v1/auth/provider-events').set('content-type', 'application/json').send(`{"x":${'['.repeat(20_000)}`);
    expect([res.status, res.body.code]).toEqual([413, 'COMMAND_TOO_LARGE']);
  });

  it('accepts a signed event as sent, and refuses a forged or re-serialized one', async () => {
    const user = await signInAt(fx.identity(), nowSeconds() - 25);
    const raw = envelope({ subject: user.who.subject, occurredAt: new Date(Date.now() - 10_000) });
    const post = (body: string, signature: string) =>
      request(app.getHttpServer()).post('/v1/auth/provider-events').set('content-type', 'application/json').set(EVENT_SIGNATURE_HEADER, signature).send(body);
    const forged = await post(raw, signSecurityEvent(raw, 'forged-secret-0123456789abcdef0123456789abcdef', nowSeconds()));
    expect(forged.status).toBe(401);
    expect(forged.body.code).toBe('UNAUTHENTICATED');
    // The same JSON with different spacing is not what was signed.
    expect((await post(JSON.stringify(JSON.parse(raw), null, 1), signSecurityEvent(raw, SECRET, nowSeconds()))).status).toBe(401);
    expect(await active(user)).toBe(true);
    const accepted = await post(raw, signSecurityEvent(raw, SECRET, nowSeconds()));
    expect([accepted.status, accepted.body]).toEqual([200, { result: 'applied' }]);
    expect(await active(user)).toBe(false);
  });
});

describe('reconciliation of lost events', () => {
  it('finds a password change Auth0 recorded but never delivered, and applies it once', async () => {
    const who = fx.identity();
    const user = await signInAt(who, nowSeconds() - 25);
    gateway.resets.set(who.subject, new Date(Date.now() - 12_000).toISOString());
    expect(await runWorker(true)).toMatchObject({ reconciled: 1 });
    expect(await active(user)).toBe(false);
    expect(await revocationJobs(user.accountId)).toBe(1);
    expect(await runWorker()).toMatchObject({ revoked: 1 });
    // Another pass finds the same change already applied.
    await db.admin((client) => client.query('DELETE FROM jobs WHERE kind = $1', [RECONCILE_KIND]));
    expect(await runWorker(true)).toMatchObject({ reconciled: 1 });
    expect(await revocationJobs(user.accountId)).toBe(1);
  });

  it('ignores a password change from days before every live session', async () => {
    const user = await signInAt(fx.identity(), nowSeconds() - 25);
    gateway.resets.set(user.who.subject, new Date(Date.now() - 2 * 86_400_000).toISOString());
    expect(await runWorker(true)).toMatchObject({ reconciled: 1 });
    expect(await active(user)).toBe(true);
    expect(await revocationJobs(user.accountId)).toBe(0);
  });

  it('a provider outage keeps sessions as they are and retries the pass', async () => {
    const user = await signInAt(fx.identity(), nowSeconds() - 25);
    gateway.state = { status: 'retryable', code: 'provider_unavailable' };
    expect(await runWorker(true)).toMatchObject({ retrying: 1 });
    expect(await active(user)).toBe(true);
    const [job] = (await db.admin((client) => client.query(`SELECT status, last_error FROM jobs WHERE kind = $1`, [RECONCILE_KIND]))).rows;
    expect(job).toEqual({ status: 'queued', last_error: 'provider_unavailable' });
  });

  it('passes are queued at most once per interval', async () => {
    expect(await security.scheduleReconcile(randomUUID(), 60)).toBe(true);
    expect(await security.scheduleReconcile(randomUUID(), 60)).toBe(false);
  });

  it('only the security worker, with its current lease, can read candidates or apply changes', async () => {
    await signInAt(fx.identity(), nowSeconds() - 25);
    await expect(pool.query('SELECT * FROM gogospend_reconcile_candidates($1, $2, 10)', [randomUUID(), randomUUID()])).rejects.toThrow(/permission denied/);
    await security.scheduleReconcile(randomUUID(), 60);
    const [claimed] = await jobs.claim([RECONCILE_KIND]);
    const forged = { ...claimed.lease, leaseToken: randomUUID() };
    expect(await security.reconcileCandidates(forged, 10)).toEqual([]);
    expect((await security.reconcileCandidates(claimed.lease, 1000)).length).toBeGreaterThan(0);
    const generic = new JobRepository(await db.loginPool(['gogospend_jobs'], 1));
    await security.scheduleReconcile(randomUUID(), 0).catch(() => undefined);
    expect(await generic.claim([RECONCILE_KIND])).toEqual([]);
  });
});

describe('F6b review fixes', () => {
  const reconcileWith = (batch: number) => runSecurityJobsOnce({ jobs, security, gateway, nativeClientIds: [TEST_CLIENT_ID], reconcile: { everySeconds: 60, batch } });
  const account = async (accountId: string) =>
    (await db.admin((client) => client.query<{ reauth_after: Date | null; credentials_changed_at: Date | null }>('SELECT reauth_after, credentials_changed_at FROM accounts WHERE id = $1', [accountId]))).rows[0];

  it('an event that arrives before the account exists still stops a pre-change login from binding', async () => {
    const who = fx.identity();
    const challenge = await fx.challengeFor(who);
    expect(await deliver(envelope({ subject: who.subject, occurredAt: new Date(Date.now() - 5_000) }))).toBe('applied');
    expect(await problem(async () => fx.bootstrapper.bootstrap(who, await fx.proofFor(who, challenge, { auth_time: nowSeconds() - 20 })))).toBe('401 REAUTH_REQUIRED');
    // Refused before anything is created: no stray empty account.
    expect((await db.admin((client) => client.query('SELECT count(*)::int AS n FROM account_identities WHERE subject = $1', [who.subject]))).rows[0].n).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const fresh = await signInAt(who, nowSeconds());
    expect(await active(fresh)).toBe(true);
  });

  it('a provider time the database cannot take is skipped; the pass still reaches everyone', async () => {
    const poison = await signInAt(fx.identity('auth0|0000-poison'), nowSeconds() - 25);
    const victim = await signInAt(fx.identity(), nowSeconds() - 25);
    gateway.resets.set(poison.who.subject, new Date(Date.now() + 3_600_000).toISOString());
    gateway.resets.set(victim.who.subject, new Date(Date.now() - 10_000).toISOString());
    expect(await runWorker(true)).toMatchObject({ reconciled: 1 });
    expect(await active(victim)).toBe(false);
    expect(await active(poison)).toBe(true);
    for (const bad of ['+275760-09-13T00:00:00.000Z', 'not a date']) {
      gateway.resets.set(poison.who.subject, bad);
      await db.admin((client) => client.query('DELETE FROM jobs WHERE kind = $1', [RECONCILE_KIND]));
      expect(await runWorker(true)).toMatchObject({ reconciled: 1 });
    }
    expect(await active(poison)).toBe(true);
  });

  it('a permanent provider error for one identity skips it; the others are still reconciled', async () => {
    const odd = await signInAt(fx.identity(), nowSeconds() - 25);
    const victim = await signInAt(fx.identity(), nowSeconds() - 25);
    gateway.perSubject.set(odd.who.subject, { status: 'permanent', code: 'provider_rejected' });
    gateway.resets.set(victim.who.subject, new Date(Date.now() - 10_000).toISOString());
    expect(await runWorker(true)).toMatchObject({ reconciled: 1 });
    expect(await active(victim)).toBe(false);
    expect(await active(odd)).toBe(true);
  });

  it('a change at the same instant under a new id is superseded', async () => {
    const user = await signInAt(fx.identity(), nowSeconds() - 25);
    const at = new Date(Date.now() - 10_000);
    expect(await deliver(envelope({ subject: user.who.subject, occurredAt: at }))).toBe('applied');
    const again = envelope({ subject: user.who.subject, occurredAt: at });
    expect(await deliver(again)).toBe('applied');
    expect(await receipt(again)).toEqual({ outcome: 'superseded', job_id: null });
  });

  it('the same id with the same subject but another time is refused', async () => {
    const user = await signInAt(fx.identity(), nowSeconds() - 25);
    const id = `evt_${randomUUID().replace(/-/g, '')}`;
    expect(await deliver(envelope({ id, subject: user.who.subject, occurredAt: new Date(Date.now() - 10_000) }))).toBe('applied');
    expect(await problem(() => deliver(envelope({ id, subject: user.who.subject, occurredAt: new Date(Date.now() - 9_000) })))).toBe('409 IDEMPOTENCY_MISMATCH');
  });

  it('a session signed in during the second of the change ends; one from the next second stays', async () => {
    const who = fx.identity();
    const second = nowSeconds() - 20;
    const during = await signInAt(who, second);
    const next = await signInAt(who, second + 1);
    // Exactly on the second: a login stamped with that same second may predate the change.
    expect(await deliver(envelope({ subject: who.subject, occurredAt: new Date(second * 1000) }))).toBe('applied');
    await runWorker();
    expect(await active(during)).toBe(false);
    expect(await active(next)).toBe(true);
  });

  it('a delayed event never lowers a later global logout\'s reauth_after', async () => {
    const user = await signInAt(fx.identity(), nowSeconds() - 25);
    const commandId = randomUUID();
    const proofId = await fx.proven(user.who, 'global_logout', commandId);
    await new SessionRevocationService(new DatabaseService(pool)).revokeAll(user.session, proofId, commandId);
    const logout = (await account(user.accountId)).reauth_after;
    expect(await deliver(envelope({ subject: user.who.subject, occurredAt: new Date(Date.now() - 15_000) }))).toBe('applied');
    expect((await account(user.accountId)).reauth_after).toEqual(logout);
  });

  it('an event for a disabled account still applies, so re-enabling it revives nothing', async () => {
    const user = await signInAt(fx.identity(), nowSeconds() - 25);
    await db.admin((client) => client.query(`UPDATE accounts SET status = 'disabled' WHERE id = $1`, [user.accountId]));
    const raw = envelope({ subject: user.who.subject, occurredAt: new Date(Date.now() - 10_000) });
    expect(await deliver(raw)).toBe('applied');
    expect((await receipt(raw)).outcome).toBe('applied');
    await db.admin((client) => client.query(`UPDATE accounts SET status = 'active' WHERE id = $1`, [user.accountId]));
    expect(await active(user)).toBe(false);
  });

  it('a checked identity goes to the back of the queue, and one without a live session is never asked', async () => {
    // Subjects sort opposite to sign-in order, so only waiting time can order them.
    const first = await signInAt(fx.identity(`auth0|zzzz-${randomUUID()}`), nowSeconds() - 25);
    const second = await signInAt(fx.identity(`auth0|0000-${randomUUID()}`), nowSeconds() - 25);
    const gone = await signInAt(fx.identity(), nowSeconds() - 25);
    await db.admin((client) => client.query('UPDATE auth_sessions SET revoked_at = now() WHERE account_id = $1', [gone.accountId]));
    await security.scheduleReconcile(randomUUID(), 60);
    const [claimed] = await jobs.claim([RECONCILE_KIND]);
    const order = async () => (await security.reconcileCandidates(claimed.lease, 1000)).map((candidate) => candidate.subject);
    const before = await order();
    expect(before).not.toContain(gone.who.subject);
    expect(before.indexOf(first.who.subject)).toBeLessThan(before.indexOf(second.who.subject));
    expect(await security.reconcileIdentity(claimed.lease, { issuer: issuer.issuer, subject: first.who.subject, credentialsChangedAt: null }, null, randomUUID())).toBe('checked');
    const after = await order();
    expect(after.indexOf(first.who.subject)).toBeGreaterThan(after.indexOf(second.who.subject));
    expect(await security.reconcileIdentity({ ...claimed.lease, leaseToken: randomUUID() }, { issuer: issuer.issuer, subject: second.who.subject, credentialsChangedAt: null }, null, randomUUID())).toBe('stale_lease');
  });

  it('a generic jobs login can neither see, claim nor create a queued reconciliation pass', async () => {
    expect(await security.scheduleReconcile(randomUUID(), 60)).toBe(true);
    const generic = await db.loginPool(['gogospend_jobs'], 1);
    expect((await generic.query('SELECT count(*)::int AS n FROM jobs WHERE kind = $1', [RECONCILE_KIND])).rows[0].n).toBe(0);
    expect(await new JobRepository(generic).claim([RECONCILE_KIND])).toEqual([]);
    await expect(generic.query(`INSERT INTO jobs (id, kind, payload, max_attempts) VALUES ($1, $2, '{}', 1)`, [randomUUID(), RECONCILE_KIND])).rejects.toThrow();
  });

  it('a finished pass is not queued again within the interval', async () => {
    expect(await security.scheduleReconcile(randomUUID(), 60)).toBe(true);
    const [claimed] = await jobs.claim([RECONCILE_KIND]);
    expect(await jobs.complete(claimed.lease)).toBe(true);
    expect(await security.scheduleReconcile(randomUUID(), 60)).toBe(false);
    expect(await security.scheduleReconcile(randomUUID(), 0)).toBe(true);
    void reconcileWith;
  });
});
