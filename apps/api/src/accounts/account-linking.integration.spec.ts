import { randomUUID } from 'node:crypto';

import type { ApiIdentity } from '@gogospend/contracts';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Pool } from 'pg';
import request from 'supertest';

import { Auth0KeySource } from '../auth/auth0-key-source';
import { LinkForbiddenError, LinkRefusedError, ProfileUnavailableError } from '../auth/auth0-profile.client';
import type { Auth0LinkGateway, Auth0ProfileGateway, TrustedProfile } from '../auth/auth0-profile.client';
import type { IdentityMaintenanceGateway } from '../auth/auth0-management.client';
import { OidcProofVerifier } from '../auth/oidc-proof-verifier';
import { LINK_KIND, SecurityJobRepository, runSecurityJobsOnce } from '../auth/security-job.repository';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import { JobRepository } from '../jobs/job.repository';
import { PolicyService } from '../policies/policy.service';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { acceptPolicies, publishPolicies } from '../testing/command-fixtures';
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

/** Auth0's view of the other identity (sign-in rules). */
const profiles: Auth0ProfileGateway & { overrides: Map<string, Partial<TrustedProfile> | 'down'> } = {
  overrides: new Map(),
  async getTrustedProfile(identity) {
    const override = this.overrides.get(identity.subject);
    if (override === 'down') throw new ProfileUnavailableError();
    return { subject: identity.subject, emailVerified: true, connection: 'test', blocked: false, ...override };
  },
};
/** Auth0's merge of the two users, run by the security worker. */
const auth0: Auth0LinkGateway & { links: [string, string][]; mode: 'ok' | 'down' | 'refuse' | 'forbidden' } = {
  links: [],
  mode: 'ok',
  async link(primary, secondary) {
    if (this.mode === 'down') throw new ProfileUnavailableError();
    if (this.mode === 'refuse') throw new LinkRefusedError();
    if (this.mode === 'forbidden') throw new LinkForbiddenError();
    if (!this.links.some(([p, s]) => p === primary && s === secondary)) this.links.push([primary, secondary]);
  },
};
const grants: IdentityMaintenanceGateway = {
  revokeGrants: async () => ({ status: 'done', count: 1 }),
  deleteUser: async () => ({ status: 'done', count: 0 }),
  credentialState: async () => ({ status: 'done', lastPasswordReset: null }),
};
const runWorker = () => runSecurityJobsOnce({ jobs, security, gateway: grants, nativeClientIds: [TEST_CLIENT_ID], linker: auth0 });

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

/** A signed-in member who accepted the current terms. */
async function member(): Promise<SignedUp> {
  const user = await fx.signUp();
  await acceptPolicies(db, user.accountId);
  return user;
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
const linkJobs = async (accountId: string) =>
  (await db.admin((client) => client.query<{ status: string; last_error: string | null }>('SELECT status, last_error FROM jobs WHERE kind = $1 AND account_id = $2', [LINK_KIND, accountId]))).rows;
const active = async (user: SignedUp) => (await fx.resolver.resolve(user.who, user.binding)) !== null;

async function afterReauthBoundary(accountId: string): Promise<void> {
  const row = (await db.admin((client) => client.query(`SELECT greatest(0, extract(epoch FROM reauth_after - clock_timestamp()) * 1000)::int AS wait FROM accounts WHERE id = $1`, [accountId]))).rows[0];
  await new Promise((resolve) => setTimeout(resolve, (row?.wait ?? 0) + 50));
}

/** Gives an account data (a committed entity), as any command would. */
async function populate(accountId: string): Promise<void> {
  await db.admin(async (client) => {
    const { rows } = await client.query<{ revision: string }>('UPDATE account_sync_state SET revision = revision + 1 WHERE account_id = $1 RETURNING revision', [accountId]);
    await client.query(`INSERT INTO entity_heads (account_id, entity, entity_id, version, state, revision) VALUES ($1, 'wallet', $2, 1, 'active', $3)`, [accountId, randomUUID(), rows[0].revision]);
  });
}

/** What opening Add does: seeds an untouched built-in category. Not data. */
async function seedBuiltin(accountId: string): Promise<void> {
  await db.admin(async (client) => {
    const id = randomUUID();
    const { rows } = await client.query<{ revision: string }>('UPDATE account_sync_state SET revision = revision + 1 WHERE account_id = $1 RETURNING revision', [accountId]);
    await client.query(`INSERT INTO categories (account_id, id, type, builtin_key) VALUES ($1, $2, 'expense', 'food')`, [accountId, id]);
    await client.query(`INSERT INTO entity_heads (account_id, entity, entity_id, version, state, revision) VALUES ($1, 'category', $2, 1, 'active', $3)`, [accountId, id, rows[0].revision]);
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  fx = authFixtures(issuer, pool);
  await publishPolicies(db);
  const database = new DatabaseService(pool);
  linking = new AccountLinkingService(database, new OidcProofVerifier(issuer.issuer, new Auth0KeySource(issuer.issuer)), profiles, new PolicyService(pool, database, 0));
  const workerPool = await db.loginPool(['gogospend_jobs', 'gogospend_security'], 3);
  jobs = new JobRepository(workerPool);
  security = new SecurityJobRepository(workerPool);
});

afterAll(async () => {
  await issuer?.close();
  await db?.drop();
});

beforeEach(async () => {
  auth0.links = [];
  auth0.mode = 'ok';
  profiles.overrides.clear();
  // Each test sees only the jobs it queued.
  await db.admin((client) => client.query('DELETE FROM jobs'));
});

describe('explicit account linking', () => {
  it('links a new sign-in method in the database first, ends every binding, then merges at Auth0', async () => {
    const primary = await member();
    const tablet = await fx.signIn(primary.who);
    const secondary = fx.identity();
    const accounts = await accountCount();
    const result = await link(primary, await linkInput(primary, secondary));
    expect(result).toEqual({ generation: 1, provider_cleanup: 'pending', provider_link: 'pending' });
    expect(auth0.links).toEqual([]);
    expect(await accountOf(secondary)).toBe(primary.accountId);
    expect(await accountCount()).toBe(accounts);
    expect(await active(primary)).toBe(false);
    expect(await active(tablet)).toBe(false);
    expect(await problem(() => fx.signIn(secondary))).toBe('403 ACCOUNT_UNAVAILABLE');
    expect(await runWorker()).toMatchObject({ revoked: 1, linked: 1 });
    expect(auth0.links).toEqual([[primary.who.subject, secondary.subject]]);
    await afterReauthBoundary(primary.accountId);
    expect((await fx.signIn(secondary)).accountId).toBe(primary.accountId);
    expect((await fx.signIn(primary.who)).accountId).toBe(primary.accountId);
  });

  it("folds the other identity's empty account in, even after it seeded built-in categories", async () => {
    const primary = await member();
    const other = await fx.signUp();
    await seedBuiltin(other.accountId);
    const accounts = await accountCount();
    await link(primary, await linkInput(primary, other.who));
    expect(await accountOf(other.who)).toBe(primary.accountId);
    expect(await accountCount()).toBe(accounts - 1);
    expect(await active(other)).toBe(false);
  });

  it('two populated accounts are refused with 409, and nothing changes here or at Auth0', async () => {
    const primary = await member();
    const other = await fx.signUp();
    await populate(other.accountId);
    expect(await problem(async () => link(primary, await linkInput(primary, other.who)))).toBe('409 ACCOUNT_LINK_CONFLICT');
    expect(await accountOf(other.who)).toBe(other.accountId);
    expect(await linkJobs(primary.accountId)).toEqual([]);
    expect(await active(primary)).toBe(true);
    expect(await active(other)).toBe(true);
  });

  it('data written to the other account while the link waits on its lock is still refused', async () => {
    const primary = await member();
    const other = await fx.signUp();
    const input = await linkInput(primary, other.who);
    let refused = '';
    await db.admin(async (client) => {
      await client.query('BEGIN');
      await client.query('SELECT 1 FROM account_sync_state WHERE account_id = $1 FOR UPDATE', [other.accountId]);
      const pending = problem(() => link(primary, input)).then((result) => (refused = result));
      await new Promise((resolve) => setTimeout(resolve, 300));
      const { rows } = await client.query<{ revision: string }>('UPDATE account_sync_state SET revision = revision + 1 WHERE account_id = $1 RETURNING revision', [other.accountId]);
      await client.query(`INSERT INTO entity_heads (account_id, entity, entity_id, version, state, revision) VALUES ($1, 'wallet', $2, 1, 'active', $3)`, [other.accountId, randomUUID(), rows[0].revision]);
      await client.query('COMMIT');
      await pending;
    });
    expect(refused).toBe('409 ACCOUNT_LINK_CONFLICT');
    expect(await accountOf(other.who)).toBe(other.accountId);
  });

  it('needs a fresh proof of both identities, for the same command', async () => {
    const primary = await member();
    const secondary = fx.identity();
    const good = await linkInput(primary, secondary);
    expect(await problem(() => link(primary, { ...good, proofId: randomUUID() }))).toBe('401 REAUTH_REQUIRED');
    expect(await problem(async () => link(primary, await linkInput(primary, secondary, { secondaryCommand: randomUUID() })))).toBe('401 PROOF_INVALID');
    expect(await problem(async () => link(primary, await linkInput(primary, secondary, { secondaryAuthTime: now() - 400 })))).toBe('401 PROOF_INVALID');
    const stranger = await member();
    const theirs = await linkInput(stranger, secondary, { command: good.commandId });
    expect(await problem(() => link(primary, { ...good, secondaryChallengeId: theirs.secondaryChallengeId, secondaryIdToken: theirs.secondaryIdToken }))).toBe('401 PROOF_INVALID');
    expect(await problem(() => link(primary, { ...good, secondaryIdToken: 'a.b.c' }))).toBe('401 PROOF_INVALID');
    expect(await problem(async () => link(primary, await linkInput(primary, primary.who)))).toBe('422 VALIDATION_FAILED');
    expect(await accountOf(secondary)).toBeNull();
    expect(await active(primary)).toBe(true);
  });

  it("the other identity's token must answer this exact challenge: its nonce and its client", async () => {
    const primary = await member();
    const secondary = fx.identity();
    const commandId = randomUUID();
    const proofId = await fx.proven(primary.who, 'link', commandId);
    const asked = await fx.challengeFor(primary.who, 'link', commandId);
    const other = await fx.challengeFor(primary.who, 'link', commandId);
    // A token carrying another open challenge's nonce.
    const wrongNonce = await issuer.sign({ iss: issuer.issuer, sub: secondary.subject, aud: TEST_CLIENT_ID, nonce: other.nonce, auth_time: now(), iat: now(), exp: now() + 600 });
    expect(await problem(() => link(primary, { proofId, commandId, secondaryChallengeId: asked.challenge_id, secondaryIdToken: wrongNonce }))).toBe('401 PROOF_INVALID');
    // A challenge issued to another client of this account.
    const elsewhere = await fx.challengeFor({ ...primary.who, clientId: 'native-android-test' }, 'link', commandId);
    const token = await issuer.sign({ iss: issuer.issuer, sub: secondary.subject, aud: TEST_CLIENT_ID, nonce: elsewhere.nonce, auth_time: now(), iat: now(), exp: now() + 600 });
    expect(await problem(() => link(primary, { proofId, commandId, secondaryChallengeId: elsewhere.challenge_id, secondaryIdToken: token }))).toBe('401 PROOF_INVALID');
    expect(await accountOf(secondary)).toBeNull();
  });

  it('a login of the other identity older than five minutes proves nothing', async () => {
    const primary = await member();
    const input = await linkInput(primary, fx.identity(), { secondaryAuthTime: now() - 315 });
    await db.admin((client) => client.query(`UPDATE reauth_challenges SET created_at = now() - interval '290 seconds', expires_at = now() + interval '10 seconds' WHERE id = $1`, [input.secondaryChallengeId]));
    expect(await problem(() => link(primary, input))).toBe('401 PROOF_INVALID');
  });

  it('the other identity meets its own sign-in rules: verified, unblocked, and after its own credential changes', async () => {
    const primary = await member();
    const unverified = fx.identity();
    profiles.overrides.set(unverified.subject, { emailVerified: false });
    expect(await problem(async () => link(primary, await linkInput(primary, unverified)))).toBe('403 ACCOUNT_UNAVAILABLE');
    const blocked = fx.identity();
    profiles.overrides.set(blocked.subject, { blocked: true });
    expect(await problem(async () => link(primary, await linkInput(primary, blocked)))).toBe('403 ACCOUNT_UNAVAILABLE');
    const down = fx.identity();
    profiles.overrides.set(down.subject, 'down');
    expect(await problem(async () => link(primary, await linkInput(primary, down)))).toBe('503 SERVICE_UNAVAILABLE');
    // Its own account had a password change after this login (F6b).
    const changed = await fx.signUp();
    await db.admin((client) => client.query(`UPDATE accounts SET reauth_after = now() - interval '5 seconds' WHERE id = $1`, [changed.accountId]));
    expect(await problem(async () => link(primary, await linkInput(primary, changed.who, { secondaryAuthTime: now() - 20 })))).toBe('401 PROOF_INVALID');
    // A change recorded before it ever had an account (F6b's principal watermark).
    const fresh = fx.identity();
    await pool.query('SELECT gogospend_record_security_event($1, $2, $3, $4, $5, $6)', [`evt_${randomUUID().replace(/-/g, '')}`, 'password_changed', fresh.issuer, fresh.subject, new Date(Date.now() - 10_000), randomUUID()]);
    expect(await problem(async () => link(primary, await linkInput(primary, fresh, { secondaryAuthTime: now() - 20 })))).toBe('401 PROOF_INVALID');
    for (const who of [unverified, blocked, down, fresh]) expect(await accountOf(who)).toBeNull();
    expect(await accountOf(changed.who)).toBe(changed.accountId);
    expect(await active(primary)).toBe(true);
  });

  it('needs the current terms accepted', async () => {
    const primary = await fx.signUp();
    expect(await problem(async () => link(primary, await linkInput(primary, fx.identity())))).toBe('403 POLICY_ACCEPTANCE_REQUIRED');
  });

  it('a used primary proof cannot link anything else', async () => {
    const primary = await member();
    const input = await linkInput(primary, fx.identity());
    await link(primary, input);
    await runWorker();
    const challenge = await fx.challengeFor(primary.who, 'link', input.commandId);
    const another = fx.identity();
    const token = await issuer.sign({ iss: issuer.issuer, sub: another.subject, aud: TEST_CLIENT_ID, nonce: challenge.nonce, auth_time: now(), iat: now(), exp: now() + 600 });
    expect(await problem(() => link(primary, { ...input, secondaryChallengeId: challenge.challenge_id, secondaryIdToken: token }))).not.toBe('ok');
    expect(await accountOf(another)).toBeNull();
  });

  it('a held or deleted other account cannot be linked', async () => {
    const primary = await member();
    const other = await fx.signUp();
    await db.admin((client) => client.query(`UPDATE accounts SET status = 'deleting' WHERE id = $1`, [other.accountId]));
    expect(await problem(async () => link(primary, await linkInput(primary, other.who)))).toBe('403 ACCOUNT_UNAVAILABLE');
    expect(await accountOf(other.who)).toBe(other.accountId);
  });

  it('linking an identity that is already an alias of this account is harmless', async () => {
    const primary = await member();
    const secondary = fx.identity();
    await link(primary, await linkInput(primary, secondary));
    await runWorker();
    await afterReauthBoundary(primary.accountId);
    const again = await fx.signIn(primary.who);
    expect(await problem(async () => link(again, await linkInput(again, secondary)))).toBe('ok');
    expect(await accountOf(secondary)).toBe(primary.accountId);
  });
});

describe('the Auth0 merge job', () => {
  it('an Auth0 outage retries; the database link already works meanwhile', async () => {
    const primary = await member();
    const secondary = fx.identity();
    await link(primary, await linkInput(primary, secondary));
    auth0.mode = 'down';
    expect(await runWorker()).toMatchObject({ revoked: 1, retrying: 1 });
    expect(await linkJobs(primary.accountId)).toEqual([{ status: 'queued', last_error: 'provider_unavailable' }]);
    await afterReauthBoundary(primary.accountId);
    expect((await fx.signIn(secondary)).accountId).toBe(primary.accountId);
  });

  it('a refusal or a missing scope fails visibly, never as a user conflict', async () => {
    for (const [mode, code] of [['refuse', 'provider_rejected'], ['forbidden', 'provider_forbidden']] as const) {
      const primary = await member();
      await link(primary, await linkInput(primary, fx.identity()));
      auth0.mode = mode;
      expect(await runWorker()).toMatchObject({ failed: 1 });
      expect(await linkJobs(primary.accountId)).toEqual([{ status: 'failed', last_error: code }]);
    }
  });

  it('a merge whose identities are no longer both aliases is superseded without calling Auth0', async () => {
    const primary = await member();
    const secondary = fx.identity();
    await link(primary, await linkInput(primary, secondary));
    await db.admin((client) => client.query('DELETE FROM account_identities WHERE subject = $1', [secondary.subject]));
    expect(await runWorker()).toMatchObject({ superseded: 1 });
    expect(auth0.links).toEqual([]);
  });

  it('only the security worker sees merge jobs, and a generic jobs login cannot create one', async () => {
    const primary = await member();
    await link(primary, await linkInput(primary, fx.identity()));
    const generic = await db.loginPool(['gogospend_jobs'], 1);
    expect((await generic.query('SELECT count(*)::int AS n FROM jobs WHERE kind = $1', [LINK_KIND])).rows[0].n).toBe(0);
    expect(await new JobRepository(generic).claim([LINK_KIND])).toEqual([]);
    await expect(generic.query(`INSERT INTO jobs (id, kind, payload, max_attempts) VALUES ($1, $2, '{}', 1)`, [randomUUID(), LINK_KIND])).rejects.toThrow();
    await expect(pool.query('SELECT * FROM gogospend_link_job_subjects($1, $2)', [randomUUID(), randomUUID()])).rejects.toThrow(/permission denied/);
  });

  it('the app role cannot call the link routine outside its own owner transaction', async () => {
    await expect(pool.query('SELECT * FROM gogospend_link_identity($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)', [randomUUID(), randomUUID(), issuer.issuer, 'auth0|a', randomUUID(), issuer.issuer, 'auth0|x', TEST_CLIENT_ID, Buffer.alloc(32), new Date(), randomUUID(), randomUUID()])).rejects.toThrow();
  });
});

describe('over HTTP', () => {
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

  it('is a recent-proof route that validates its body; without Auth0 credentials it fails closed', async () => {
    const primary = await member();
    const input = await linkInput(primary, fx.identity());
    const headers = async () => ({ 'x-gogospend-client': 'ios/1.0.0', authorization: `Bearer ${await issuer.accessToken({ sub: primary.who.subject })}`, 'x-gogospend-session': primary.binding, 'idempotency-key': input.commandId });
    const empty = await request(app.getHttpServer()).post('/v1/me/identities').set(await headers()).send({ proof_id: input.proofId, secondary_challenge_id: input.secondaryChallengeId, secondary_id_token: '' });
    expect(empty.status).toBe(422);
    const res = await request(app.getHttpServer()).post('/v1/me/identities').set(await headers()).send({ proof_id: input.proofId, secondary_challenge_id: input.secondaryChallengeId, secondary_id_token: input.secondaryIdToken });
    // No profile credentials in this environment: the other identity cannot be checked, so nothing links.
    expect([res.status, res.body.code]).toEqual([503, 'SERVICE_UNAVAILABLE']);
  });
});
