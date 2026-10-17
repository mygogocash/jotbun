import { randomUUID } from 'node:crypto';

import type { ApiIdentity, SessionContext } from '@gogospend/contracts';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';

import { Auth0KeySource } from '../auth/auth0-key-source';
import { LinkRefusedError, ProfileUnavailableError } from '../auth/auth0-profile.client';
import type { Auth0LinkGateway } from '../auth/auth0-profile.client';
import type { IdentityMaintenanceGateway } from '../auth/auth0-management.client';
import { OidcProofVerifier } from '../auth/oidc-proof-verifier';
import { SecurityJobRepository, runSecurityJobsOnce } from '../auth/security-job.repository';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import { JobRepository } from '../jobs/job.repository';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { publishPolicies } from '../testing/command-fixtures';
import { TEST_AUDIENCE, TEST_CLIENT_ID, startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { V1AppModule, configureV1App } from '../v1/v1-app.module';
import { AccountLinkingService } from './account-linking.service';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let linking: AccountLinkingService;
let jobs: JobRepository;
let security: SecurityJobRepository;

/** Auth0 stand-in: after a link, logins of the secondary come back as the primary. */
const auth0: Auth0LinkGateway & { links: [string, string][]; mode: 'ok' | 'down' | 'refuse'; during: (() => Promise<void>) | null } = {
  links: [],
  mode: 'ok',
  during: null,
  async link(primary, secondary) {
    if (this.mode === 'down') throw new ProfileUnavailableError();
    if (this.mode === 'refuse') throw new LinkRefusedError();
    await this.during?.();
    if (!this.links.some(([p, s]) => p === primary && s === secondary)) this.links.push([primary, secondary]);
  },
};
const grants: IdentityMaintenanceGateway = {
  revokeGrants: async () => ({ status: 'done', count: 1 }),
  deleteUser: async () => ({ status: 'done', count: 0 }),
  credentialState: async () => ({ status: 'done', lastPasswordReset: null }),
};
const runCleanup = () => runSecurityJobsOnce({ jobs, security, gateway: grants, nativeClientIds: [TEST_CLIENT_ID] });

const now = () => Math.floor(Date.now() / 1000);

async function problem(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'ok';
  } catch (error) {
    if (error instanceof ProblemException) return `${error.getStatus()} ${error.code}`;
    throw error;
  }
}

/** Both fresh logins for one link command: the primary's proof and the secondary's ID token. */
async function linkInput(primary: SignedUp, secondary: ApiIdentity, options: { secondaryAuthTime?: number; command?: string; secondaryCommand?: string } = {}) {
  const commandId = options.command ?? randomUUID();
  const proofId = await fx.proven(primary.who, 'link', commandId);
  const challenge = await fx.challengeFor(primary.who, 'link', options.secondaryCommand ?? commandId);
  const token = await issuer.sign({ iss: issuer.issuer, sub: secondary.subject, aud: TEST_CLIENT_ID, nonce: challenge.nonce, auth_time: options.secondaryAuthTime ?? now(), iat: now(), exp: now() + 600 });
  return { proofId, commandId, secondaryChallengeId: challenge.challenge_id, secondaryIdToken: token };
}

const link = (primary: SignedUp, input: Awaited<ReturnType<typeof linkInput>>) => linking.link(primary.session, primary.who, input);
const accountOf = async (who: ApiIdentity) =>
  (await db.admin((client) => client.query<{ account_id: string }>('SELECT account_id FROM account_identities WHERE issuer = $1 AND subject = $2', [who.issuer, who.subject]))).rows[0]?.account_id ?? null;
const accountCount = async () => (await db.admin((client) => client.query<{ n: number }>('SELECT count(*)::int AS n FROM accounts'))).rows[0].n;
const active = async (user: SignedUp) => (await fx.resolver.resolve(user.who, user.binding)) !== null;

async function afterReauthBoundary(accountId: string): Promise<void> {
  const row = (await db.admin((client) => client.query(`SELECT greatest(0, extract(epoch FROM reauth_after - clock_timestamp()) * 1000)::int AS wait FROM accounts WHERE id = $1`, [accountId]))).rows[0];
  await new Promise((resolve) => setTimeout(resolve, (row?.wait ?? 0) + 50));
}

/** Gives an account data (a committed entity), as any command would. */
async function populate(accountId: string): Promise<void> {
  await db.admin(async (client) => {
    const { rows } = await client.query<{ revision: string }>('UPDATE account_sync_state SET revision = revision + 1 WHERE account_id = $1 RETURNING revision', [accountId]);
    await client.query(
      `INSERT INTO entity_heads (account_id, entity, entity_id, version, state, revision) VALUES ($1, 'wallet', $2, 1, 'active', $3)`,
      [accountId, randomUUID(), rows[0].revision],
    );
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  fx = authFixtures(issuer, pool);
  linking = new AccountLinkingService(new DatabaseService(pool), new OidcProofVerifier(issuer.issuer, new Auth0KeySource(issuer.issuer)), auth0);
  const workerPool = await db.loginPool(['gogospend_jobs', 'gogospend_security'], 3);
  jobs = new JobRepository(workerPool);
  security = new SecurityJobRepository(workerPool);
});

afterAll(async () => {
  await issuer?.close();
  await db?.drop();
});

beforeEach(() => {
  auth0.links = [];
  auth0.mode = 'ok';
  auth0.during = null;
});

describe('explicit account linking', () => {
  it('links a new sign-in method: it resolves to the same account, and every binding ends', async () => {
    const primary = await fx.signUp();
    const tablet = await fx.signIn(primary.who);
    const secondary = fx.identity();
    const accounts = await accountCount();
    const result = await link(primary, await linkInput(primary, secondary));
    expect(result).toEqual({ generation: 1, provider_cleanup: 'pending' });
    expect(auth0.links).toEqual([[primary.who.subject, secondary.subject]]);
    expect(await accountOf(secondary)).toBe(primary.accountId);
    expect(await accountCount()).toBe(accounts);
    expect(await active(primary)).toBe(false);
    expect(await active(tablet)).toBe(false);
    // Sign-ins wait for the provider cleanup (F6a's hold), then both methods reach the one account.
    expect(await problem(() => fx.signIn(secondary))).toBe('403 ACCOUNT_UNAVAILABLE');
    expect(await runCleanup()).toMatchObject({ revoked: 1 });
    await afterReauthBoundary(primary.accountId);
    expect((await fx.signIn(secondary)).accountId).toBe(primary.accountId);
    expect((await fx.signIn(primary.who)).accountId).toBe(primary.accountId);
  });

  it("folds the other identity's empty account into this one", async () => {
    const primary = await fx.signUp();
    const other = await fx.signUp();
    const accounts = await accountCount();
    await link(primary, await linkInput(primary, other.who));
    expect(await accountOf(other.who)).toBe(primary.accountId);
    expect(await accountCount()).toBe(accounts - 1);
    expect(await active(other)).toBe(false);
  });

  it('two populated accounts are refused with 409, before Auth0 is asked, and nothing changes', async () => {
    const primary = await fx.signUp();
    const other = await fx.signUp();
    await populate(other.accountId);
    expect(await problem(async () => link(primary, await linkInput(primary, other.who)))).toBe('409 ACCOUNT_LINK_CONFLICT');
    expect(auth0.links).toEqual([]);
    expect(await accountOf(other.who)).toBe(other.accountId);
    expect(await active(primary)).toBe(true);
    expect(await active(other)).toBe(true);
  });

  it('data written to the other account while Auth0 links is still refused under the lock', async () => {
    const primary = await fx.signUp();
    const other = await fx.signUp();
    auth0.during = () => populate(other.accountId);
    expect(await problem(async () => link(primary, await linkInput(primary, other.who)))).toBe('409 ACCOUNT_LINK_CONFLICT');
    expect(await accountOf(other.who)).toBe(other.accountId);
    expect(await active(primary)).toBe(true);
  });

  it("another account's challenge does not prove the other identity, even for the same command id", async () => {
    const primary = await fx.signUp();
    const stranger = await fx.signUp();
    const secondary = fx.identity();
    const good = await linkInput(primary, secondary);
    const theirs = await linkInput(stranger, secondary, { command: good.commandId });
    expect(await problem(() => link(primary, { ...good, secondaryChallengeId: theirs.secondaryChallengeId, secondaryIdToken: theirs.secondaryIdToken }))).toBe('401 REAUTH_REQUIRED');
    expect(auth0.links).toEqual([]);
  });

  it('a login of the other identity older than five minutes proves nothing', async () => {
    const primary = await fx.signUp();
    const secondary = fx.identity();
    const input = await linkInput(primary, secondary, { secondaryAuthTime: now() - 315 });
    // The challenge itself is still open (issued 290 s ago), so only the login's age refuses it.
    await db.admin((client) => client.query(`UPDATE reauth_challenges SET created_at = now() - interval '290 seconds', expires_at = now() + interval '10 seconds' WHERE id = $1`, [input.secondaryChallengeId]));
    expect(await problem(() => link(primary, input))).toBe('401 REAUTH_REQUIRED');
    expect(auth0.links).toEqual([]);
  });

  it('a used primary proof cannot link anything else', async () => {
    const primary = await fx.signUp();
    const input = await linkInput(primary, fx.identity());
    await link(primary, input);
    await runCleanup();
    const challenge = await fx.challengeFor(primary.who, 'link', input.commandId);
    const another = fx.identity();
    const token = await issuer.sign({ iss: issuer.issuer, sub: another.subject, aud: TEST_CLIENT_ID, nonce: challenge.nonce, auth_time: now(), iat: now(), exp: now() + 600 });
    expect(await problem(() => link(primary, { ...input, secondaryChallengeId: challenge.challenge_id, secondaryIdToken: token }))).toBe('401 REAUTH_REQUIRED');
    expect(auth0.links).toHaveLength(1);
    expect(await accountOf(another)).toBeNull();
  });

  it('needs a fresh proof of both identities, for the same command', async () => {
    const primary = await fx.signUp();
    const secondary = fx.identity();
    const good = await linkInput(primary, secondary);
    expect(await problem(() => link(primary, { ...good, proofId: randomUUID() }))).toBe('401 REAUTH_REQUIRED');
    expect(await problem(async () => link(primary, await linkInput(primary, secondary, { secondaryCommand: randomUUID() })))).toBe('401 REAUTH_REQUIRED');
    expect(await problem(async () => link(primary, await linkInput(primary, secondary, { secondaryAuthTime: now() - 400 })))).toBe('401 REAUTH_REQUIRED');
    // A token for another account's challenge, or a forged one, proves nothing.
    const stranger = await fx.signUp();
    const theirs = await linkInput(stranger, secondary);
    expect(await problem(() => link(primary, { ...good, secondaryChallengeId: theirs.secondaryChallengeId, secondaryIdToken: theirs.secondaryIdToken }))).toBe('401 REAUTH_REQUIRED');
    expect(await problem(() => link(primary, { ...good, secondaryIdToken: 'a.b.c' }))).toBe('401 REAUTH_REQUIRED');
    expect(await problem(async () => link(primary, await linkInput(primary, primary.who)))).toBe('422 VALIDATION_FAILED');
    expect(auth0.links).toEqual([]);
    expect(await accountOf(secondary)).toBeNull();
    expect(await active(primary)).toBe(true);
  });

  it('an Auth0 outage or refusal changes nothing, and the same proofs still work afterwards', async () => {
    const primary = await fx.signUp();
    const secondary = fx.identity();
    const input = await linkInput(primary, secondary);
    auth0.mode = 'down';
    expect(await problem(() => link(primary, input))).toBe('503 SERVICE_UNAVAILABLE');
    auth0.mode = 'refuse';
    expect(await problem(() => link(primary, input))).toBe('409 ACCOUNT_LINK_CONFLICT');
    expect(await accountOf(secondary)).toBeNull();
    expect(await active(primary)).toBe(true);
    auth0.mode = 'ok';
    await link(primary, input);
    expect(await accountOf(secondary)).toBe(primary.accountId);
  });

  it('an interrupted link (Auth0 linked, database not) recovers without a second account', async () => {
    const primary = await fx.signUp();
    const secondary = fx.identity();
    const accounts = await accountCount();
    // The request died after Auth0 linked: logins of the secondary now come back as the primary.
    await auth0.link(primary.who.subject, secondary.subject);
    expect((await fx.signIn(primary.who)).accountId).toBe(primary.accountId);
    expect(await accountCount()).toBe(accounts);
    // A retry with fresh proofs completes the database side; Auth0 is already linked.
    await link(primary, await linkInput(primary, secondary));
    expect(auth0.links).toHaveLength(1);
    expect(await accountOf(secondary)).toBe(primary.accountId);
    expect(await accountCount()).toBe(accounts);
  });

  it('linking an identity that is already an alias of this account is harmless', async () => {
    const primary = await fx.signUp();
    const secondary = fx.identity();
    await link(primary, await linkInput(primary, secondary));
    await runCleanup();
    await afterReauthBoundary(primary.accountId);
    const again = await fx.signIn(primary.who);
    expect(await problem(async () => link(again, await linkInput(again, secondary)))).toBe('ok');
    expect(await accountOf(secondary)).toBe(primary.accountId);
  });

  it('a held or deleted secondary cannot be linked', async () => {
    const primary = await fx.signUp();
    const other = await fx.signUp();
    await db.admin((client) => client.query(`UPDATE accounts SET status = 'deleting' WHERE id = $1`, [other.accountId]));
    expect(await problem(async () => link(primary, await linkInput(primary, other.who)))).toBe('403 ACCOUNT_UNAVAILABLE');
    expect(auth0.links).toEqual([]);
  });

  it('the app role cannot call the link routines outside its own owner transaction', async () => {
    await expect(pool.query('SELECT * FROM gogospend_link_identity($1, $2, $3, $4, $5, $6, $7, $8)', [randomUUID(), randomUUID(), issuer.issuer, 'auth0|x', TEST_CLIENT_ID, Buffer.alloc(32), new Date(), randomUUID()])).rejects.toThrow();
    const ctx: SessionContext = (await fx.signUp()).session;
    expect(ctx.accountId).toBeTruthy();
  });
});

describe('over HTTP', () => {
  let app: NestExpressApplication;
  const SETTINGS = ['DATABASE_URL', 'AUTH0_ISSUER', 'AUTH0_AUDIENCE', 'AUTH0_ALLOWED_CLIENT_IDS', 'RATE_LIMIT_KEY', 'COMMAND_DIGEST_KEY', 'MIN_CLIENT_VERSION_IOS', 'MIN_CLIENT_VERSION_ANDROID', 'OBJECT_STORE'];
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

  it('is a recent-proof route that refuses a populated other account with 409, as an ApiProblem', async () => {
    const primary = await fx.signUp();
    const other = await fx.signUp();
    await populate(other.accountId);
    const input = await linkInput(primary, other.who);
    const res = await request(app.getHttpServer())
      .post('/v1/me/identities')
      .set({ 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await issuer.accessToken({ sub: primary.who.subject })}`, 'x-gogospend-session': primary.binding, 'idempotency-key': input.commandId })
      .send({ proof_id: input.proofId, secondary_challenge_id: input.secondaryChallengeId, secondary_id_token: input.secondaryIdToken });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ACCOUNT_LINK_CONFLICT');
    const missing = await request(app.getHttpServer())
      .post('/v1/me/identities')
      .set({ 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await issuer.accessToken({ sub: primary.who.subject })}`, 'x-gogospend-session': primary.binding, 'idempotency-key': input.commandId })
      .send({ proof_id: input.proofId });
    expect(missing.status).toBe(422);
  });
});
