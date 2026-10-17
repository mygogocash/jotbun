import { createHmac, randomUUID } from 'node:crypto';

import { isDeletionAccepted, isDeletionReceipt } from '@gogospend/contracts';
import type { DeletionAccepted } from '@gogospend/contracts';
import { Client, Pool } from 'pg';

import { ProblemException } from '../common/api-problem.filter';
import { JobRepository } from '../jobs/job.repository';
import { ObjectPublicationService } from '../storage/object-publication.service';
import { poolConfigFromUrl } from '../database/database-config';
import type { MemoryObjectStore } from '../storage/object-store';
import { OBJECT_STORE } from '../storage/storage.module';
import { authFixtures } from '../testing/auth-fixtures';
import type { SignedUp } from '../testing/auth-fixtures';
import { publishPolicies, startV1App } from '../testing/command-fixtures';
import { queueAccountJob } from '../testing/job-fixtures';
import { startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { builtinId, expectOk, moneyFixtures } from '../testing/money-fixtures';
import { createTestDatabase } from '../testing/postgres-harness';
import type { GroupRole, TestDatabase } from '../testing/postgres-harness';
import {
  accountTables,
  countDeletes,
  deletionJobOf,
  deletionRequestOf,
  deletionWorker,
  ownerRows,
  runNow,
  scriptedGateway,
  switchableRegistry,
} from '../testing/privacy-fixtures';
import { v1Client } from '../testing/v1-client';
import { LookupKey, PostgresErasureRegistry } from './erasure-registry';
import { ERASURE_HANDLED_TABLES, PrivacySteps } from './privacy-steps';

let db: TestDatabase;
let issuer: JwksFixture;
let pool: Pool;
let fx: ReturnType<typeof authFixtures>;
let v1: Awaited<ReturnType<typeof startV1App>>;
let as: ReturnType<typeof v1Client>;
let money: ReturnType<typeof moneyFixtures>;
let store: MemoryObjectStore;
const provider = scriptedGateway();
let registryControl: ReturnType<typeof switchableRegistry>;
let w: Awaited<ReturnType<typeof deletionWorker>>;

async function code(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'ok';
  } catch (error) {
    if (error instanceof ProblemException) return `${error.getStatus()} ${error.code}`;
    throw error;
  }
}

/** POST /v1/me/deletion with a fresh deletion proof bound to the key (unless one is given). */
async function requestDeletion(user: SignedUp, options: { key?: string; proofId?: string } = {}) {
  const key = options.key ?? randomUUID();
  const proofId = options.proofId ?? (await fx.proven(user.who, 'deletion', key));
  const res = await as(user).raw('post', '/v1/me/deletion', { proof_id: proofId }, { 'idempotency-key': key });
  return { res, key, proofId };
}

async function accepted(user: SignedUp): Promise<{ key: string; body: DeletionAccepted }> {
  const { res, key } = await requestDeletion(user);
  expect(res.status).toBe(202);
  expect(isDeletionAccepted(res.body)).toBe(true);
  return { key, body: res.body as DeletionAccepted };
}

const receipt = async (user: SignedUp, commandId: string) => as(user).raw('post', '/v1/auth/deletion-receipt', { command_id: commandId });
const accountOf = async (accountId: string) =>
  (await db.admin((client) => client.query('SELECT status, session_generation, lifecycle_generation FROM accounts WHERE id = $1', [accountId]))).rows[0];
const blocksOf = async (user: SignedUp) =>
  (await db.admin((client) => client.query('SELECT reason, blocked_until FROM blocked_principals WHERE principal_digest = gogospend_principal_digest($1, $2)', [user.who.issuer, user.who.subject]))).rows;
const markersOf = async (accountId: string) =>
  (await db.admin((client) => client.query('SELECT * FROM erasure_registry.erasure_markers WHERE account_id = $1', [accountId]))).rows;

/** A member with money, a second signed-in device, an export file and a pending provider event receipt. */
async function populated() {
  const user = await money.member();
  const cash = await money.wallet(user, { name: 'Cash' });
  await money.record(user, { type: 'expense', amount_minor: '6500', occurred_on: '2026-03-01', wallet_id: cash, category_id: builtinId(user, 'food'), note: 'private lunch note' });
  await expectOk(await as(user).put('/v1/budgets/2026-03', { overall_limit_minor: '100000', category_limits: [] }));
  const otherDevice = await fx.signIn(user.who);
  await db.admin((client) => client.query(
    `INSERT INTO auth_event_receipts (event_id, source, type, principal_digest, occurred_at, outcome, account_id)
     VALUES ($1, 'event', 'password_changed', gogospend_principal_digest($2, $3), now() - interval '1 day', 'applied', $4)`,
    [`evt_${randomUUID().replace(/-/g, '')}`, user.who.issuer, user.who.subject, user.accountId],
  ));
  await db.admin((client) => client.query('INSERT INTO security_reconcile_checks (principal_digest, checked_at) VALUES (gogospend_principal_digest($1, $2), now())', [user.who.issuer, user.who.subject]));
  return { user, otherDevice, cash };
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
  store = v1.app.get<MemoryObjectStore>(OBJECT_STORE);
  const registryPool = await db.loginPool(['gogospend_erasure_registry'], 2);
  registryControl = switchableRegistry(new PostgresErasureRegistry(registryPool, new LookupKey(Buffer.alloc(32, 7))));
  w = await deletionWorker(db, store, provider.gateway, { registry: registryControl.registry });
});

afterAll(async () => {
  await v1?.close();
  await issuer?.close();
  await db?.drop();
});

beforeEach(async () => {
  provider.reset();
  registryControl.state.failing = false;
  w.handlerOptions.afterStage = undefined;
  // Each test runs only the deletions it requested.
  await db.admin((client) => client.query(`DELETE FROM jobs WHERE status IN ('queued', 'leased')`));
});

describe('the deletion request', () => {
  it('commits deleting status, dead bindings, held aliases, cancelled publishers and the cleanup intent at once', async () => {
    const { user, otherDevice } = await populated();
    const exportJob = await queueAccountJob(db, user.accountId, 'export');
    const before = await accountOf(user.accountId);
    const { body } = await accepted(user);

    const after = await accountOf(user.accountId);
    expect(after.status).toBe('deleting');
    expect(after.session_generation).toBe(before.session_generation + 1);
    expect(after.lifecycle_generation).toBe(before.lifecycle_generation + 1);
    // Every device's binding is dead at once, including the one that asked.
    expect((await as(user).get('/v1/me')).status).toBe(401);
    expect((await as(otherDevice).get('/v1/me')).status).toBe(401);
    expect(await blocksOf(user)).toEqual([{ reason: 'deleted', blocked_until: null }]);
    // No new challenge (sign-in, proof or link) for any alias.
    expect(await code(() => fx.challengeFor(user.who))).toBe('403 ACCOUNT_UNAVAILABLE');
    // Publishers are cancelled under the same lock.
    expect((await db.admin((client) => client.query('SELECT status FROM jobs WHERE id = $1', [exportJob]))).rows[0].status).toBe('cancelled');
    // The durable cleanup intent: the request and its security-kind job.
    const request = await deletionRequestOf(db, user.accountId);
    expect(request?.request_id).toBe(body.request_id);
    expect(request?.marker_recorded_at).toBeNull();
    expect(await deletionJobOf(db, user.accountId)).toEqual([expect.objectContaining({ id: body.request_id, status: 'queued' })]);
    // Nothing destructive has happened yet: data is still there for the worker.
    expect(provider.calls).toEqual([]);
    expect((await ownerRows(db, user.accountId)).transactions).toBe(1);
  });

  it('a generic jobs login can neither see nor create a deletion job', async () => {
    const user = await money.member();
    await accepted(user);
    const generic = await db.loginPool(['gogospend_jobs'], 1);
    expect((await generic.query(`SELECT id FROM jobs WHERE kind = 'account_deletion'`)).rows).toEqual([]);
    await expect(generic.query(`INSERT INTO jobs (id, kind, account_id, payload, max_attempts) VALUES ($1, 'account_deletion', $2, '{}', 3)`, [randomUUID(), user.accountId]))
      .rejects.toMatchObject({ code: '42501' });
    const app = await db.loginPool(['gogospend_app'], 1);
    await expect(app.query('SELECT * FROM deletion_requests')).rejects.toMatchObject({ code: '42501' });
  });

  it('needs a fresh deletion proof for this command; anything else requests nothing', async () => {
    const user = await money.member();
    const key = randomUUID();
    const wrongPurpose = await fx.proven(user.who, 'global_logout', key);
    expect((await requestDeletion(user, { key, proofId: wrongPurpose })).res.status).toBe(401);
    const otherCommand = await fx.proven(user.who, 'deletion', randomUUID());
    expect((await requestDeletion(user, { key, proofId: otherCommand })).res.body.code).toBe('REAUTH_REQUIRED');
    expect((await requestDeletion(user, { key: 'not-a-uuid', proofId: randomUUID() })).res.status).toBe(422);
    expect((await accountOf(user.accountId)).status).toBe('active');
    expect(await deletionRequestOf(db, user.accountId)).toBeUndefined();
    expect(await deletionJobOf(db, user.accountId)).toEqual([]);
  });

  it('a lost acceptance: the retry cannot run again, and only the initiating device learns it was accepted', async () => {
    const user = await money.member();
    const otherDevice = await fx.signIn(user.who);
    const { res: first, key, proofId } = await requestDeletion(user);
    expect(first.status).toBe(202);
    // The response is lost; the app resends the identical request.
    const retry = await requestDeletion(user, { key, proofId });
    expect(retry.res.status).toBe(401);
    expect(retry.res.body.code).toBe('SESSION_REQUIRED');
    expect(await deletionJobOf(db, user.accountId)).toHaveLength(1);
    const confirmed = await receipt(user, key);
    expect(confirmed.status).toBe(200);
    expect(isDeletionReceipt(confirmed.body)).toBe(true);
    expect(confirmed.body).toEqual({ request_id: first.body.request_id, status: 'accepted' });
    // Another device of the same person, or another command id, learns nothing.
    expect((await receipt(otherDevice, key)).status).toBe(404);
    expect((await receipt(user, randomUUID())).status).toBe(404);
    // Once erased, the same device's receipt says completed.
    await w.drain();
    expect((await receipt(user, key)).body).toEqual({ request_id: first.body.request_id, status: 'completed' });
  });

  it('a save waiting behind the deletion writes nothing', async () => {
    const user = await money.member();
    const cash = await money.wallet(user);
    const deleting = new Client(poolConfigFromUrl(db.adminUrl, 1));
    await deleting.connect();
    try {
      await deleting.query('BEGIN');
      await deleting.query(`SELECT set_config('gogospend.account_id', $1, true)`, [user.accountId]);
      expect((await deleting.query('SELECT gogospend_request_deletion($1, $2, $3) AS outcome', [randomUUID(), randomUUID(), user.session.bindingId])).rows[0].outcome).toBe('accepted');
      // The save passed its guard before the deletion committed, then waits on the lock.
      const recordId = randomUUID();
      const save = as(user).post('/v1/transactions', { id: recordId, type: 'expense', amount_minor: '100', occurred_on: '2026-03-02', wallet_id: cash, category_id: builtinId(user, 'food') });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await deleting.query('COMMIT');
      const res = await save;
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ACCOUNT_UNAVAILABLE');
      expect((await db.admin((client) => client.query('SELECT 1 FROM transactions WHERE id = $1', [recordId]))).rowCount).toBe(0);
    } finally {
      await deleting.end();
    }
  });

  it('an export queued before the deletion is cancelled and never runs', async () => {
    const user = await money.member();
    const key = randomUUID();
    const exportProof = await fx.proven(user.who, 'export', key);
    const queued = await as(user).post('/v1/exports', { proof_id: exportProof, from: '2026-03-01', through: '2026-03-31' }, { key });
    expect(queued.status).toBe(202);
    await accepted(user);
    const generic = await db.loginPool(['gogospend_jobs'], 1);
    expect((await generic.query(`SELECT status FROM jobs WHERE id = $1`, [queued.body.entity_id])).rows[0].status).toBe('cancelled');
    // After the deletion request no new export can be asked for.
    expect((await as(user).post('/v1/exports', { proof_id: randomUUID(), from: '2026-03-01', through: '2026-03-31' })).status).toBe(401);
  });
});

describe('erasure', () => {
  it('failed_erasure_marker_blocks_destructive_cleanup', async () => {
    const { user } = await populated();
    const deletes = countDeletes(store);
    const before = deletes.deletes;
    await accepted(user);
    registryControl.state.failing = true;
    await w.drain(1);
    const destructiveCalls = provider.calls.filter((call) => call.op !== 'confirmDeleted').length + (deletes.deletes - before);
    const request = await deletionRequestOf(db, user.accountId);
    const cleanupComplete = request?.purged_at !== null;
    expect(destructiveCalls).toBe(0);
    expect(cleanupComplete).toBe(false);
    expect(request?.marker_recorded_at).toBeNull();
    expect((await ownerRows(db, user.accountId)).transactions).toBe(1);
    expect(await deletionJobOf(db, user.accountId)).toEqual([expect.objectContaining({ status: 'queued', last_error: 'registry_unavailable' })]);
    // Once the registry is back, the same job finishes.
    registryControl.state.failing = false;
    await runNow(db, (await deletionJobOf(db, user.accountId))[0].id);
    await w.drain();
    expect((await deletionRequestOf(db, user.accountId))?.purged_at).toBeInstanceOf(Date);
  });

  it('records the marker, verifies provider deletion, removes objects and purges every private row', async () => {
    const { user, otherDevice } = await populated();
    // A published export file: deleted at erasure, not at its 24-hour expiry.
    const genericPool = await db.loginPool(['gogospend_jobs'], 2);
    const generic = new JobRepository(genericPool);
    const publication = new ObjectPublicationService(genericPool, store);
    await queueAccountJob(db, user.accountId, 'export');
    const [claimed] = await generic.claim(['export'], { leaseSeconds: 30 });
    const fileKey = await publication.reserve(claimed.lease, 'export', 'export.csv');
    const put = await store.putStream(fileKey, new TextEncoder().encode('record_id\r\n'));
    expect(await publication.finishWithObjects(generic, claimed.lease, [{ key: fileKey, ...put }], new Date(Date.now() + 24 * 3_600_000))).toBe(true);
    const registryBefore = registryControl.state.records;
    const { key } = await accepted(user);
    await w.drain();

    // 1. The independent marker, in P6a's shape, keyed - no raw subject.
    const markers = await markersOf(user.accountId);
    expect(markers).toHaveLength(1);
    expect(Object.keys(markers[0]).sort()).toEqual(['account_id', 'lookup_key_id', 'marker_id', 'recorded_at', 'subject_lookups']);
    const expectedLookup = createHmac('sha256', Buffer.alloc(32, 7)).update(`gogospend-erasure-subject-v1\u0000${user.who.issuer}\u0000${user.who.subject}`).digest('base64url');
    expect(markers[0].subject_lookups).toEqual([expectedLookup]);
    expect(JSON.stringify(markers)).not.toContain(user.who.subject);
    expect(registryControl.state.records).toBeGreaterThan(registryBefore);
    // 2. Provider: revoke, delete and confirm, in that order, per alias.
    expect(provider.calls).toEqual([
      { op: 'revokeGrants', subject: user.who.subject },
      { op: 'deleteUser', subject: user.who.subject },
      { op: 'confirmDeleted', subject: user.who.subject },
    ]);
    // 3. Objects: the published file is gone now.
    expect(await store.head(fileKey)).toBeNull();
    expect((await store.list(`export/${user.accountId}/`))).toEqual([]);
    // 5. Every private row is gone; what stays is the deletion's own bookkeeping.
    expect(await ownerRows(db, user.accountId, ['deletion_requests', 'jobs', 'object_publications'])).toEqual({});
    const jobs = (await db.admin((client) => client.query('SELECT kind, status FROM jobs WHERE account_id = $1', [user.accountId]))).rows;
    expect(jobs).toEqual([{ kind: 'account_deletion', status: 'succeeded' }]);
    const principal = [user.who.issuer, user.who.subject];
    expect((await db.admin((client) => client.query('SELECT 1 FROM auth_event_receipts WHERE principal_digest = gogospend_principal_digest($1, $2)', principal))).rowCount).toBe(0);
    expect((await db.admin((client) => client.query('SELECT 1 FROM security_reconcile_checks WHERE principal_digest = gogospend_principal_digest($1, $2)', principal))).rowCount).toBe(0);
    const request = await deletionRequestOf(db, user.accountId);
    expect(request?.marker_recorded_at).toBeInstanceOf(Date);
    expect(request?.provider_verified_at).toBeInstanceOf(Date);
    expect(request?.objects_swept_at).toBeInstanceOf(Date);
    expect(request?.purged_at).toBeInstanceOf(Date);
    // The alias stays blocked for an hour past provider verification: no stale token bootstraps.
    const [block] = await blocksOf(user);
    expect(block.reason).toBe('deleted');
    expect(block.blocked_until.getTime()).toBeGreaterThan(Date.now() + 55 * 60_000);
    expect(await code(() => fx.signIn(user.who))).toBe('403 ACCOUNT_UNAVAILABLE');
    expect(await code(() => fx.signIn(otherDevice.who))).toBe('403 ACCOUNT_UNAVAILABLE');
    expect(key).toBeDefined();
  });

  it('a crash right after the registry write: the retry resumes, writes no second marker and re-creates nothing', async () => {
    const { user } = await populated();
    await accepted(user);
    let crashes = 0;
    w.handlerOptions.afterStage = async (stage) => {
      if (stage === 'marker' && crashes === 0) {
        crashes += 1;
        throw new Error('synthetic crash after the marker');
      }
    };
    await w.drain(1);
    const [job] = await deletionJobOf(db, user.accountId);
    expect(job).toEqual(expect.objectContaining({ status: 'queued', last_error: 'handler_error' }));
    expect((await deletionRequestOf(db, user.accountId))?.marker_recorded_at).toBeInstanceOf(Date);
    expect(provider.calls).toEqual([]);
    await runNow(db, job.id);
    await w.drain();
    expect(await markersOf(user.accountId)).toHaveLength(1);
    expect(await ownerRows(db, user.accountId, ['deletion_requests', 'jobs', 'object_publications'])).toEqual({});
    expect((await db.admin((client) => client.query('SELECT count(*)::int AS n FROM account_identities WHERE subject = $1', [user.who.subject]))).rows[0].n).toBe(0);
  });

  it('a crash during provider deletion stays pending, never complete, and resumes', async () => {
    const { user } = await populated();
    await accepted(user);
    provider.next.deleteUser = ['throw'];
    await w.drain(1);
    const request = await deletionRequestOf(db, user.accountId);
    expect(request?.provider_verified_at).toBeNull();
    expect(request?.purged_at).toBeNull();
    expect((await ownerRows(db, user.accountId)).transactions).toBe(1);
    const [job] = await deletionJobOf(db, user.accountId);
    expect(job).toEqual(expect.objectContaining({ status: 'queued', last_error: 'worker_error' }));
    // A user still present at the provider is not "deleted" either.
    provider.next.confirmDeleted = [{ status: 'retryable', code: 'provider_user_present' }];
    await runNow(db, job.id);
    await w.drain(1);
    expect((await deletionRequestOf(db, user.accountId))?.provider_verified_at).toBeNull();
    expect((await deletionJobOf(db, user.accountId))[0].last_error).toBe('provider_user_present');
    await runNow(db, job.id);
    await w.drain();
    expect((await deletionRequestOf(db, user.accountId))?.purged_at).toBeInstanceOf(Date);
  });

  it('a crash after identity removal: stale sign-ins stay refused and the retry finishes without the provider', async () => {
    const { user } = await populated();
    // A sign-in that started before the deletion (its challenge already issued).
    const staleChallenge = await fx.challengeFor(user.who);
    await accepted(user);
    w.handlerOptions.afterStage = async (stage) => {
      if (stage === 'provider') throw new Error('synthetic crash after provider deletion');
    };
    await w.drain(1);
    expect((await deletionRequestOf(db, user.accountId))?.provider_verified_at).toBeInstanceOf(Date);
    // The provider user is gone, but its old tokens cannot bootstrap a new account.
    expect(await code(async () => fx.bootstrapper.bootstrap(user.who, await fx.proofFor(user.who, staleChallenge)))).toBe('403 ACCOUNT_UNAVAILABLE');
    expect((await db.admin((client) => client.query('SELECT count(*)::int AS n FROM accounts WHERE id = $1', [user.accountId]))).rows[0].n).toBe(1);
    w.handlerOptions.afterStage = undefined;
    provider.calls.length = 0;
    await runNow(db, (await deletionJobOf(db, user.accountId))[0].id);
    await w.drain();
    expect(provider.calls).toEqual([]);
    expect(await ownerRows(db, user.accountId, ['deletion_requests', 'jobs', 'object_publications'])).toEqual({});
    expect(await code(() => fx.signIn(user.who))).toBe('403 ACCOUNT_UNAVAILABLE');
    // Once the stale-token window has passed, the same login is a new person with an empty account.
    await db.admin((client) => client.query(`UPDATE blocked_principals SET blocked_until = now() - interval '1 second' WHERE principal_digest = gogospend_principal_digest($1, $2)`, [user.who.issuer, user.who.subject]));
    const again = await fx.signIn(user.who);
    expect(again.accountId).not.toBe(user.accountId);
    expect((await as(again).get('/v1/wallets')).body).toEqual([]);
  });

  it('a provider outage stays pending and is alerted, never reported complete', async () => {
    const { user } = await populated();
    await accepted(user);
    provider.always.revokeGrants = { status: 'retryable', code: 'provider_unavailable' };
    const jobs = await deletionJobOf(db, user.accountId);
    expect(jobs).toHaveLength(1);
    const [job] = jobs;
    await db.admin((client) => client.query('UPDATE jobs SET max_attempts = 2 WHERE id = $1', [job.id]));
    await w.drain(1);
    expect((await deletionJobOf(db, user.accountId))[0]).toEqual(expect.objectContaining({ status: 'queued', last_error: 'provider_unavailable' }));
    await runNow(db, job.id);
    await w.drain(1);
    expect((await deletionJobOf(db, user.accountId))[0]).toEqual(expect.objectContaining({ status: 'failed', last_error: 'provider_unavailable' }));
    const request = await deletionRequestOf(db, user.accountId);
    expect(request?.provider_verified_at).toBeNull();
    expect(request?.purged_at).toBeNull();
    await db.admin((client) => client.query(`UPDATE deletion_requests SET requested_at = now() - interval '21 hours' WHERE account_id = $1`, [user.accountId]));
    const backlog = await w.repository.backlog();
    expect(backlog.failed).toBeGreaterThanOrEqual(1);
    expect(backlog.overdue).toBeGreaterThanOrEqual(1);
    expect(backlog.open).toBeGreaterThanOrEqual(1);
    // The runbook's requeue resumes it once the provider is back.
    provider.always.revokeGrants = undefined;
    expect(await w.jobs.requeue(job.id)).toBe(true);
    await w.drain();
    expect((await deletionRequestOf(db, user.accountId))?.purged_at).toBeInstanceOf(Date);
    // Clean up the alert fixture for later tests.
    expect((await w.repository.backlog()).failed).toBe(0);
  });

  it('runs registered erasure steps before the purge; a failing step stops it', async () => {
    const steps = new PrivacySteps();
    const seen: string[] = [];
    let fail = true;
    steps.erasure({ name: 'fixture.step', run: async ({ accountId }) => {
      seen.push(accountId);
      if (fail) throw new Error('synthetic step failure');
    } });
    const stepped = await deletionWorker(db, store, provider.gateway, { steps });
    const user = await money.member();
    await accepted(user);
    await stepped.drain(1);
    expect(seen).toEqual([user.accountId]);
    expect((await deletionRequestOf(db, user.accountId))?.purged_at).toBeNull();
    expect((await deletionJobOf(db, user.accountId))[0].last_error).toBe('erasure_step_failed');
    fail = false;
    await runNow(db, (await deletionJobOf(db, user.accountId))[0].id);
    await stepped.drain();
    expect((await deletionRequestOf(db, user.accountId))?.purged_at).toBeInstanceOf(Date);
  });

  it('a restore can re-queue the whole erasure of a marked account (P6a)', async () => {
    const user = await money.member();
    // The restored copy holds the account as it was before its deletion was asked for.
    const outcome = (await db.admin((client) => client.query('SELECT gogospend_reapply_erasure($1, $2) AS outcome', [user.accountId, randomUUID()]))).rows[0].outcome;
    expect(outcome).toBe('requeued');
    expect((await accountOf(user.accountId)).status).toBe('deleting');
    expect((await as(user).get('/v1/me')).status).toBe(401);
    expect(await blocksOf(user)).toEqual([{ reason: 'deleted', blocked_until: null }]);
    expect((await db.admin((client) => client.query('SELECT gogospend_reapply_erasure($1, $2) AS outcome', [user.accountId, randomUUID()]))).rows[0].outcome).toBe('running');
    await w.drain();
    expect(provider.calls.map((call) => call.op)).toEqual(['revokeGrants', 'deleteUser', 'confirmDeleted']);
    expect(await ownerRows(db, user.accountId, ['deletion_requests', 'jobs', 'object_publications'])).toEqual({});
    expect((await db.admin((client) => client.query('SELECT gogospend_reapply_erasure($1, $2) AS outcome', [user.accountId, randomUUID()]))).rows[0].outcome).toBe('absent');
    // No serving role can call it.
    const app = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 1);
    await expect(app.query('SELECT gogospend_reapply_erasure($1, $2)', [user.accountId, randomUUID()])).rejects.toMatchObject({ code: '42501' });
  });
});

describe('extension point and registry isolation', () => {
  it('every table with an account_id cascades from accounts or is handled by a named erasure step', async () => {
    const tables = await accountTables(db);
    expect(tables.length).toBeGreaterThan(10);
    const unhandled = tables.filter((row) => !row.cascades && !(row.table in ERASURE_HANDLED_TABLES)).map((row) => row.table);
    expect(unhandled).toEqual([]);
    // The allowlist names only tables that exist and do not cascade.
    for (const table of Object.keys(ERASURE_HANDLED_TABLES)) expect(tables).toContainEqual({ table, cascades: false });
  });

  it.each<GroupRole[]>([['gogospend_app', 'gogospend_bootstrap'], ['gogospend_jobs'], ['gogospend_security'], ['gogospend_leased_read']])('%s cannot read or write the erasure registry', async (...roles) => {
    const login = await db.loginPool(roles, 1);
    await expect(login.query('SELECT * FROM erasure_registry.erasure_markers')).rejects.toMatchObject({ code: '42501' });
    await expect(login.query(`INSERT INTO erasure_registry.erasure_markers (marker_id, account_id, subject_lookups, lookup_key_id) VALUES ($1, $1, ARRAY[repeat('a', 43)], repeat('a', 32))`, [randomUUID()]))
      .rejects.toMatchObject({ code: '42501' });
  });

  it('the registry is append-only, and an unreadable registry throws instead of reading as empty', async () => {
    const login = await db.loginPool(['gogospend_erasure_registry'], 1);
    const registry = new PostgresErasureRegistry(login, new LookupKey(Buffer.alloc(32, 9)));
    const accountId = randomUUID();
    const first = await registry.record(accountId, [{ issuer: 'https://issuer.test/', subject: 'auth0|synthetic' }]);
    expect(await registry.record(accountId, [{ issuer: 'https://issuer.test/', subject: 'auth0|synthetic' }])).toEqual(first);
    expect(first.lookup_key_id).toMatch(/^[0-9a-f]{32}$/);
    expect((await registry.listMarkers()).some((marker) => marker.marker_id === first.marker_id)).toBe(true);
    await expect(login.query('UPDATE erasure_registry.erasure_markers SET account_id = $1', [randomUUID()])).rejects.toMatchObject({ code: '42501' });
    await expect(login.query('DELETE FROM erasure_registry.erasure_markers')).rejects.toMatchObject({ code: '42501' });
    const broken = new Pool(poolConfigFromUrl(db.adminUrl.replace(/\/[^/]+$/, '/gogospend_no_such_database'), 1));
    try {
      await expect(new PostgresErasureRegistry(broken, new LookupKey(Buffer.alloc(32, 9))).listMarkers()).rejects.toThrow();
    } finally {
      await broken.end();
    }
  });
});
