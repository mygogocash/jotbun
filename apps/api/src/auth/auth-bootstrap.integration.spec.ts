import { randomUUID } from 'node:crypto';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiIdentity, AuthChallenge, ReauthPurpose, SessionContext } from '@gogospend/contracts';
import type { JWTPayload } from 'jose';
import { Client } from 'pg';
import type { Pool } from 'pg';
import request from 'supertest';

import { ProblemException } from '../common/api-problem.filter';
import { setLogSink } from '../common/safe-request-logger';
import { poolConfigFromUrl } from '../database/database-config';
import { DatabaseService } from '../database/database.service';
import { lockAccount } from '../database/owner-transaction';
import { FAKE_PROFILE_CLIENT_ID, FAKE_PROFILE_CLIENT_SECRET, startManagementFake } from '../testing/auth0-management-fake';
import type { ManagementFake } from '../testing/auth0-management-fake';
import { TEST_AUDIENCE, TEST_CLIENT_ID, startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { V1AppModule, configureV1App } from '../v1/v1-app.module';
import { AuthBootstrapService } from './auth-bootstrap.service';
import { Auth0KeySource } from './auth0-key-source';
import type { Auth0ProfileGateway } from './auth0-profile.client';
import { OidcProofVerifier } from './oidc-proof-verifier';
import type { VerifiedOidcProof } from './oidc-proof-verifier';
import { ReauthenticationService, authorizePurpose } from './reauthentication.service';
import { SqlSessionResolver } from './session.repository';

const now = () => Math.floor(Date.now() / 1000);
const trusting: Auth0ProfileGateway = { getTrustedProfile: async (identity) => ({ subject: identity.subject, emailVerified: true, connection: 'test', blocked: false }) };

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let verifier: OidcProofVerifier;
let reauth: ReauthenticationService;
let bootstrapper: AuthBootstrapService;
let resolver: SqlSessionResolver;
let service: DatabaseService;

const identity = (subject = `auth0|${randomUUID()}`): ApiIdentity => ({ issuer: issuer.issuer, subject, clientId: TEST_CLIENT_ID, scopes: [] });

async function challengeFor(who: ApiIdentity, purpose: ReauthPurpose = 'bootstrap', commandId: string = randomUUID()): Promise<AuthChallenge> {
  return reauth.issueChallenge(who, { requestId: randomUUID(), purpose, commandId });
}

async function proofFor(who: ApiIdentity, challenge: AuthChallenge, claims: JWTPayload = {}): Promise<VerifiedOidcProof> {
  const token = await issuer.sign({ iss: issuer.issuer, sub: who.subject, aud: TEST_CLIENT_ID, nonce: challenge.nonce, auth_time: now(), iat: now(), exp: now() + 600, ...claims });
  return verifier.verifyChallenge(who, challenge.challenge_id, token);
}

async function signUp(who = identity()): Promise<{ who: ApiIdentity; accountId: string; binding: string }> {
  const result = await bootstrapper.bootstrap(who, await proofFor(who, await challengeFor(who)));
  return { who, accountId: result.account_id, binding: result.binding };
}

async function code(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'ok';
  } catch (error) {
    if (error instanceof ProblemException) return `${error.getStatus()} ${error.code}`;
    throw error;
  }
}

const count = async (table: string) => (await db.admin((client) => client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`))).rows[0].n;
const sessionCtx = (who: ApiIdentity, accountId: string): SessionContext => ({ accountId, subject: who.subject, clientId: who.clientId, bindingId: 'test', sessionGeneration: 0 });

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  pool = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 6);
  verifier = new OidcProofVerifier(issuer.issuer, new Auth0KeySource(issuer.issuer));
  reauth = new ReauthenticationService(pool);
  bootstrapper = new AuthBootstrapService(pool, trusting);
  resolver = new SqlSessionResolver(pool);
  service = new DatabaseService(pool);
});

afterAll(async () => {
  await issuer?.close();
  await db?.drop();
});

describe('first sign-in bootstrap', () => {
  it('concurrent_bootstrap_has_one_account', async () => {
    const who = identity();
    const proofs = await Promise.all([1, 2].map(async () => proofFor(who, await challengeFor(who))));
    const before = await count('accounts');
    const results = await Promise.all(proofs.map((proof) => bootstrapper.bootstrap(who, proof)));
    expect(new Set(results.map((r) => r.account_id)).size).toBe(1);
    expect(await count('accounts')).toBe(before + 1);
    const rows = await db.admin((client) => client.query(
      `SELECT (SELECT count(*)::int FROM account_identities WHERE account_id = $1) AS identities,
              (SELECT count(*)::int FROM account_sync_state WHERE account_id = $1) AS sync_rows,
              (SELECT count(*)::int FROM auth_sessions WHERE account_id = $1) AS sessions`,
      [results[0].account_id],
    ));
    expect(rows.rows[0]).toEqual({ identities: 1, sync_rows: 1, sessions: 2 });
  });

  it('a replayed challenge is refused with a recoverable CHALLENGE_USED', async () => {
    const who = identity();
    const proof = await proofFor(who, await challengeFor(who));
    await bootstrapper.bootstrap(who, proof);
    expect(await code(() => bootstrapper.bootstrap(who, proof))).toBe('409 CHALLENGE_USED');
  });

  it('refuses an ID token whose nonce belongs to another challenge', async () => {
    const who = identity();
    const challenge = await challengeFor(who);
    expect(await code(async () => bootstrapper.bootstrap(who, await proofFor(who, challenge, { nonce: 'some-other-nonce' })))).toBe('401 PROOF_INVALID');
    // The genuine proof still works: a mismatched attempt does not burn the challenge.
    expect(await code(async () => bootstrapper.bootstrap(who, await proofFor(who, challenge)))).toBe('ok');
  });

  it('refuses a challenge issued for another purpose', async () => {
    const { who } = await signUp();
    const exportChallenge = await challengeFor(who, 'export');
    expect(await code(async () => bootstrapper.bootstrap(who, await proofFor(who, exportChallenge)))).toBe('401 PROOF_INVALID');
  });

  it("refuses another principal's challenge", async () => {
    const owner = identity();
    const intruder = identity();
    const challenge = await challengeFor(owner);
    expect(await code(async () => bootstrapper.bootstrap(intruder, await proofFor(intruder, challenge)))).toBe('401 PROOF_INVALID');
  });

  it('refuses an expired challenge', async () => {
    const who = identity();
    const challenge = await challengeFor(who);
    await db.admin((client) => client.query(`UPDATE reauth_challenges SET created_at = now() - interval '10 minutes', expires_at = now() - interval '5 minutes' WHERE id = $1`, [challenge.challenge_id]));
    expect(await code(async () => bootstrapper.bootstrap(who, await proofFor(who, challenge)))).toBe('401 PROOF_INVALID');
  });

  it('requires a login after the challenge was issued (max_age=0)', async () => {
    const who = identity();
    const challenge = await challengeFor(who);
    expect(await code(async () => bootstrapper.bootstrap(who, await proofFor(who, challenge, { auth_time: now() - 120 })))).toBe('401 REAUTH_REQUIRED');
  });

  it('requires a login after the last global logout (reauth_after)', async () => {
    const { who, accountId } = await signUp();
    await db.admin((client) => client.query(`UPDATE accounts SET reauth_after = now() + interval '1 minute' WHERE id = $1`, [accountId]));
    expect(await code(async () => bootstrapper.bootstrap(who, await proofFor(who, await challengeFor(who))))).toBe('401 REAUTH_REQUIRED');
  });

  it('a blocked principal can neither get a challenge nor bootstrap', async () => {
    const who = identity();
    const challenge = await challengeFor(who);
    await db.admin((client) => client.query(`INSERT INTO blocked_principals (principal_digest, reason) VALUES (gogospend_principal_digest($1, $2), 'disabled')`, [who.issuer, who.subject]));
    expect(await code(async () => bootstrapper.bootstrap(who, await proofFor(who, challenge)))).toBe('403 ACCOUNT_UNAVAILABLE');
    expect(await code(() => challengeFor(who))).toBe('403 ACCOUNT_UNAVAILABLE');
  });

  it('a deleted principal cannot recreate an account with an old token', async () => {
    const { who, accountId } = await signUp();
    const staleChallenge = await challengeFor(who);
    await db.admin(async (client) => {
      await client.query(`INSERT INTO blocked_principals (principal_digest, reason) VALUES (gogospend_principal_digest($1, $2), 'deleted')`, [who.issuer, who.subject]);
      await client.query('DELETE FROM accounts WHERE id = $1', [accountId]);
    });
    const before = await count('accounts');
    // The challenge issued before deletion went with the account; a new one is refused.
    expect(await code(async () => bootstrapper.bootstrap(who, await proofFor(who, staleChallenge)))).toBe('401 PROOF_INVALID');
    expect(await code(() => challengeFor(who))).toBe('403 ACCOUNT_UNAVAILABLE');
    expect(await count('accounts')).toBe(before);
  });

  it('an account being deleted cannot bootstrap a new session', async () => {
    const { who, accountId } = await signUp();
    const challenge = await challengeFor(who);
    await db.admin((client) => client.query(`UPDATE accounts SET status = 'deleting' WHERE id = $1`, [accountId]));
    expect(await code(async () => bootstrapper.bootstrap(who, await proofFor(who, challenge)))).toBe('403 ACCOUNT_UNAVAILABLE');
  });

  it('a block written under the account lock while a bootstrap waits stops that bootstrap', async () => {
    const { who, accountId } = await signUp();
    const proof = await proofFor(who, await challengeFor(who));
    const holder = new Client(poolConfigFromUrl(db.adminUrl, 1));
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT 1 FROM account_sync_state WHERE account_id = $1 FOR UPDATE', [accountId]);
      const waiting = code(() => bootstrapper.bootstrap(who, proof));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await holder.query(`INSERT INTO blocked_principals (principal_digest, reason) VALUES (gogospend_principal_digest($1, $2), 'revocation_pending')`, [who.issuer, who.subject]);
      await holder.query('COMMIT');
      expect(await waiting).toBe('403 ACCOUNT_UNAVAILABLE');
      expect((await db.admin((client) => client.query('SELECT count(*)::int AS n FROM auth_sessions WHERE account_id = $1', [accountId]))).rows[0].n).toBe(1);
    } finally {
      await holder.end();
    }
  });

  it('a bootstrap racing an account deletion never deadlocks', async () => {
    const { who, accountId } = await signUp();
    const proof = await proofFor(who, await challengeFor(who));
    const deleter = new Client(poolConfigFromUrl(db.adminUrl, 1));
    await deleter.connect();
    try {
      // Deletion takes the common account lock, then removes the account (cascading to its challenges).
      await deleter.query('BEGIN');
      await deleter.query('SELECT 1 FROM account_sync_state WHERE account_id = $1 FOR UPDATE', [accountId]);
      const racing = code(() => bootstrapper.bootstrap(who, proof));
      await new Promise((resolve) => setTimeout(resolve, 200));
      await deleter.query('DELETE FROM accounts WHERE id = $1', [accountId]);
      await deleter.query(`INSERT INTO blocked_principals (principal_digest, reason) VALUES (gogospend_principal_digest($1, $2), 'deleted')`, [who.issuer, who.subject]);
      await deleter.query('COMMIT');
      expect(['401 PROOF_INVALID', '403 ACCOUNT_UNAVAILABLE']).toContain(await racing);
      expect((await db.admin((client) => client.query('SELECT count(*)::int AS n FROM account_identities WHERE subject = $1', [who.subject]))).rows[0].n).toBe(0);
    } finally {
      await deleter.end();
    }
  });

  it('an unknown challenge is refused before any Auth0 profile lookup', async () => {
    let lookups = 0;
    const counting = new AuthBootstrapService(pool, { getTrustedProfile: async (who) => { lookups += 1; return trusting.getTrustedProfile(who); } });
    const who = identity();
    const fake = { challenge_id: randomUUID(), nonce: 'made-up', expires_at: new Date().toISOString() };
    expect(await code(async () => counting.bootstrap(who, await proofFor(who, fake)))).toBe('401 PROOF_INVALID');
    expect(lookups).toBe(0);
  });

  it('the app role cannot read challenge secrets or reopen a consumed proof', async () => {
    const appOnly = await db.loginPool(['gogospend_app'], 1);
    await expect(appOnly.query('SELECT nonce_digest FROM reauth_challenges')).rejects.toMatchObject({ code: '42501' });
    await expect(appOnly.query('UPDATE reauth_challenges SET consumed_at = NULL')).rejects.toMatchObject({ code: '42501' });
  });

  it('limits outstanding challenges per principal', async () => {
    const who = identity();
    for (let i = 0; i < 10; i++) await challengeFor(who);
    expect(await code(() => challengeFor(who))).toBe('429 RATE_LIMITED');
  });
});

describe('session bindings', () => {
  it('resolves an issued binding to its account and server-side session id', async () => {
    const { who, accountId, binding } = await signUp();
    const session = await resolver.resolve(who, binding);
    expect(session).toMatchObject({ accountId, subject: who.subject, clientId: TEST_CLIENT_ID, sessionGeneration: 0 });
    expect(session?.bindingId).toMatch(/^[0-9a-f-]{36}$/);
    expect(session?.bindingId).not.toBe(binding);
  });

  const invalidations: [string, (accountId: string, who: ApiIdentity) => string][] = [
    ['after a global logout (generation changed)', () => 'UPDATE accounts SET session_generation = session_generation + 1 WHERE id = $1'],
    ['once revoked', () => 'UPDATE auth_sessions SET revoked_at = now() WHERE account_id = $1'],
    ['after 7 idle days', () => `UPDATE auth_sessions SET idle_expires_at = now() - interval '1 second' WHERE account_id = $1`],
    ['after 30 days in total', () => `UPDATE auth_sessions SET created_at = now() - interval '31 days', idle_expires_at = now() - interval '1 day', absolute_expires_at = now() - interval '1 day' WHERE account_id = $1`],
    ['while the account is being deleted', () => `UPDATE accounts SET status = 'deleting' WHERE id = $1`],
  ];

  it.each(invalidations)('stops resolving %s', async (_name, statement) => {
    const { who, accountId, binding } = await signUp();
    expect(await resolver.resolve(who, binding)).not.toBeNull();
    await db.admin((client) => client.query(statement(accountId, who), [accountId]));
    expect(await resolver.resolve(who, binding)).toBeNull();
  });

  it('expires a binding that was never used within 5 minutes (lost bootstrap response)', async () => {
    const { who, accountId, binding } = await signUp();
    await db.admin((client) => client.query(`UPDATE auth_sessions SET created_at = now() - interval '6 minutes', absolute_expires_at = now() + interval '29 days', idle_expires_at = now() + interval '6 days' WHERE account_id = $1`, [accountId]));
    expect(await resolver.resolve(who, binding)).toBeNull();
  });

  it('keeps a binding that was used promptly beyond the 5-minute window', async () => {
    const { who, accountId, binding } = await signUp();
    expect(await resolver.resolve(who, binding)).not.toBeNull();
    await db.admin((client) => client.query(`UPDATE auth_sessions SET created_at = now() - interval '6 minutes', absolute_expires_at = now() + interval '29 days', idle_expires_at = now() + interval '6 days' WHERE account_id = $1`, [accountId]));
    expect(await resolver.resolve(who, binding)).not.toBeNull();
  });

  it('a binding is not usable by another principal, another client, or once the principal is blocked', async () => {
    const { who, binding } = await signUp();
    expect(await resolver.resolve(identity(), binding)).toBeNull();
    expect(await resolver.resolve({ ...who, clientId: 'another-client' }, binding)).toBeNull();
    await db.admin((client) => client.query(`INSERT INTO blocked_principals (principal_digest, reason) VALUES (gogospend_principal_digest($1, $2), 'revocation_pending')`, [who.issuer, who.subject]));
    expect(await resolver.resolve(who, binding)).toBeNull();
  });

  it('a database outage fails resolution closed (an error, never a session)', async () => {
    const outage = new SqlSessionResolver({ query: async () => { throw new Error('connection refused'); } } as unknown as Pool);
    await expect(outage.resolve(identity(), 'b'.repeat(43))).rejects.toThrow();
  });
});

describe('purpose-bound proofs', () => {
  async function provenExport(who: ApiIdentity, commandId: string, claims: JWTPayload = {}) {
    const challenge = await challengeFor(who, 'export', commandId);
    return reauth.prove(await proofFor(who, challenge, claims));
  }

  it('a fresh proof is consumed once by its own command inside the owner transaction', async () => {
    const { who, accountId } = await signUp();
    const commandId = randomUUID();
    const { proof_id } = await provenExport(who, commandId);
    const consume = () => service.withOwnerTransaction(sessionCtx(who, accountId), async (tx) => {
      await lockAccount(tx, accountId);
      await authorizePurpose(tx, sessionCtx(who, accountId), proof_id, commandId, 'export');
    });
    expect(await code(consume)).toBe('ok');
    expect(await code(consume)).toBe('401 REAUTH_REQUIRED');
  });

  it.each([
    ['another command', (proof: string, _command: string) => [proof, randomUUID(), 'export'] as const],
    ['another purpose', (proof: string, command: string) => [proof, command, 'deletion'] as const],
    ['an unknown proof', (_proof: string, command: string) => [randomUUID(), command, 'export'] as const],
  ])('refuses a proof presented for %s', async (_name, args) => {
    const { who, accountId } = await signUp();
    const commandId = randomUUID();
    const { proof_id } = await provenExport(who, commandId);
    const [proofId, command, purpose] = args(proof_id, commandId);
    expect(await code(() => service.withOwnerTransaction(sessionCtx(who, accountId), (tx) => authorizePurpose(tx, sessionCtx(who, accountId), proofId, command, purpose)))).toBe('401 REAUTH_REQUIRED');
  });

  it("refuses another account's proof", async () => {
    const owner = await signUp();
    const other = await signUp();
    const commandId = randomUUID();
    const { proof_id } = await provenExport(owner.who, commandId);
    expect(await code(() => service.withOwnerTransaction(sessionCtx(other.who, other.accountId), (tx) => authorizePurpose(tx, sessionCtx(other.who, other.accountId), proof_id, commandId, 'export')))).toBe('401 REAUTH_REQUIRED');
  });

  it('refuses a proof older than 5 minutes or older than the last global logout', async () => {
    const { who, accountId } = await signUp();
    const commandId = randomUUID();
    const { proof_id } = await provenExport(who, commandId);
    await db.admin((client) => client.query(`UPDATE reauth_challenges SET auth_time = now() - interval '6 minutes' WHERE id = $1`, [proof_id]));
    const consume = () => service.withOwnerTransaction(sessionCtx(who, accountId), (tx) => authorizePurpose(tx, sessionCtx(who, accountId), proof_id, commandId, 'export'));
    expect(await code(consume)).toBe('401 REAUTH_REQUIRED');
    await db.admin((client) => client.query(`UPDATE reauth_challenges SET auth_time = now() WHERE id = $1`, [proof_id]));
    await db.admin((client) => client.query(`UPDATE accounts SET reauth_after = now() + interval '1 second' WHERE id = $1`, [accountId]));
    expect(await code(consume)).toBe('401 REAUTH_REQUIRED');
  });

  it('a proof can be completed only once and not for an unknown account', async () => {
    const { who } = await signUp();
    const challenge = await challengeFor(who, 'export');
    const proof = await proofFor(who, challenge);
    expect(await code(() => reauth.prove(proof))).toBe('ok');
    expect(await code(() => reauth.prove(proof))).toBe('409 CHALLENGE_USED');
    expect(await code(() => challengeFor(identity(), 'export'))).toBe('403 ACCOUNT_UNAVAILABLE');
  });
});

describe('HTTP sign-in journey (synthetic issuer and Management API)', () => {
  let app: NestExpressApplication;
  let management: ManagementFake;
  const logs: string[] = [];
  let restoreSink: ReturnType<typeof setLogSink>;
  const SETTINGS = ['DATABASE_URL', 'AUTH0_ISSUER', 'AUTH0_AUDIENCE', 'AUTH0_ALLOWED_CLIENT_IDS', 'AUTH0_MANAGEMENT_URL', 'AUTH0_PROFILE_LINK_CLIENT_ID', 'AUTH0_PROFILE_LINK_CLIENT_SECRET', 'RATE_LIMIT_KEY', 'COMMAND_DIGEST_KEY', 'MIN_CLIENT_VERSION_IOS', 'MIN_CLIENT_VERSION_ANDROID'];
  const saved = Object.fromEntries(SETTINGS.map((key) => [key, process.env[key]]));
  const CLIENT = { 'x-gogospend-client': 'ios/1.0.0' };
  const SUBJECT = 'auth0|journey-user';

  beforeAll(async () => {
    management = await startManagementFake();
    management.profiles.set(SUBJECT, { user_id: SUBJECT, email_verified: true, identities: [{ connection: 'Username-Password-Authentication', provider: 'auth0', user_id: 'journey-user' }] });
    Object.assign(process.env, {
      DATABASE_URL: await db.loginUrl(['gogospend_app', 'gogospend_bootstrap']),
      AUTH0_ISSUER: issuer.issuer,
      AUTH0_AUDIENCE: TEST_AUDIENCE,
      AUTH0_ALLOWED_CLIENT_IDS: TEST_CLIENT_ID,
      AUTH0_MANAGEMENT_URL: management.url,
      AUTH0_PROFILE_LINK_CLIENT_ID: FAKE_PROFILE_CLIENT_ID,
      AUTH0_PROFILE_LINK_CLIENT_SECRET: FAKE_PROFILE_CLIENT_SECRET,
      RATE_LIMIT_KEY: 'synthetic-test-key-0123456789abcdef0123456789',
      COMMAND_DIGEST_KEY: 'synthetic-command-digest-key-0123456789abcdef',
      MIN_CLIENT_VERSION_IOS: '1.0.0',
      MIN_CLIENT_VERSION_ANDROID: '1.0.0',
    });
    app = await NestFactory.create<NestExpressApplication>(V1AppModule, { bodyParser: false, logger: false, abortOnError: false });
    configureV1App(app);
    await app.init();
    restoreSink = setLogSink((line) => logs.push(line));
  });

  afterAll(async () => {
    setLogSink(restoreSink);
    await app?.close();
    await management?.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('signs in, reaches /v1/me with the binding, and never logs credentials', async () => {
    const server = app.getHttpServer();
    const accessToken = await issuer.accessToken({ sub: SUBJECT });
    const auth = { ...CLIENT, authorization: `Bearer ${accessToken}` };

    const challenge = await request(server).post('/v1/auth/challenges').set(auth).send({ request_id: randomUUID(), purpose: 'bootstrap', command_id: randomUUID() });
    expect(challenge.status).toBe(201);
    expect(challenge.headers['cache-control']).toBe('no-store');
    const idToken = await issuer.sign({ iss: issuer.issuer, sub: SUBJECT, aud: TEST_CLIENT_ID, nonce: challenge.body.nonce, auth_time: now(), iat: now(), exp: now() + 600 });

    // The ID token is never an API credential.
    expect((await request(server).post('/v1/auth/challenges').set({ ...CLIENT, authorization: `Bearer ${idToken}` }).send({ request_id: randomUUID(), purpose: 'bootstrap', command_id: randomUUID() })).status).toBe(401);

    const bootstrap = await request(server).post('/v1/auth/bootstrap').set(auth).send({ challenge_id: challenge.body.challenge_id, id_token: idToken });
    expect(bootstrap.status).toBe(201);
    expect(bootstrap.body).toEqual({ account_id: expect.stringMatching(/^[0-9a-f-]{36}$/), binding: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), session_generation: 0 });

    const retried = await request(server).post('/v1/auth/bootstrap').set(auth).send({ challenge_id: challenge.body.challenge_id, id_token: idToken });
    expect(retried.status).toBe(409);
    expect(retried.body.code).toBe('CHALLENGE_USED');

    const me = await request(server).get('/v1/me').set({ ...auth, 'x-gogospend-session': bootstrap.body.binding });
    expect(me.status).toBe(200);
    expect(me.headers['cache-control']).toBe('no-store');
    expect(me.body).toEqual({ account_id: bootstrap.body.account_id, status: 'active', pending_policies: [], privacy: { analytics: false } });

    const logged = logs.join('\n');
    for (const secret of [accessToken, idToken, bootstrap.body.binding, challenge.body.nonce, SUBJECT]) expect(logged).not.toContain(secret);
  });
});
