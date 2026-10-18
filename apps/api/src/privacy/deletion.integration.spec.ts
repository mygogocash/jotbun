import { createHmac, randomUUID } from 'node:crypto';

import { isDeletionAccepted, isDeletionReceipt } from '@gogospend/contracts';
import type { DeletionAccepted } from '@gogospend/contracts';
import { Client, Pool } from 'pg';

import { sha256 } from '../auth/oidc-proof-verifier';
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
  capturedSubjectsOf,
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
  (await db.admin((client) => client.query('SELECT * FROM erasure_registry.erasure_markers WHERE account_id = $1 ORDER BY recorded_at', [accountId]))).rows;

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
  registryControl.state.failingPurge = false;
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
    // A sign-in that had started (its bootstrap challenge has no account) is purged too.
    await fx.challengeFor(user.who);
    const registryBefore = registryControl.state.records;
    const { key } = await accepted(user);
    await w.drain();

    // 1. The independent marker, in P6a's shape, keyed - no raw subject.
    const markers = await markersOf(user.accountId);
    expect(markers).toHaveLength(1);
    expect(Object.keys(markers[0]).sort()).toEqual(['account_id', 'blocked_until', 'lookup_key_id', 'marker_id', 'purged_at', 'recorded_at', 'subject_lookups']);
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
    expect((await db.admin((client) => client.query('SELECT 1 FROM reauth_challenges WHERE principal_digest = gogospend_principal_digest($1, $2)', principal))).rowCount).toBe(0);
    const request = await deletionRequestOf(db, user.accountId);
    expect(request?.marker_recorded_at).toBeInstanceOf(Date);
    expect(request?.provider_verified_at).toBeInstanceOf(Date);
    expect(request?.objects_swept_at).toBeInstanceOf(Date);
    expect(request?.purged_at).toBeInstanceOf(Date);
    expect(request?.marker_purge_recorded_at).toBeInstanceOf(Date);
    // 6. The registry learned the purge and the hold end (a restore replays it; the marker can now be cleared).
    expect(markers[0].purged_at).toBeInstanceOf(Date);
    expect(markers[0].blocked_until?.toISOString()).toBe(request?.blocked_until?.toISOString());
    // No pseudonymous identifier of the person outlives the purge: only the device's binding digest stays for its receipt.
    expect(request?.initiator_principal_digest).toBeNull();
    expect(request?.initiator_binding_digest).toBeInstanceOf(Buffer);
    expect(await capturedSubjectsOf(db, user.accountId)).toEqual([]);
    // The alias stays blocked for an hour past provider verification: no stale token bootstraps.
    const [block] = await blocksOf(user);
    expect(block.reason).toBe('deleted');
    expect(block.blocked_until.getTime()).toBeGreaterThan(Date.now() + 55 * 60_000);
    expect(block.blocked_until.toISOString()).toBe(request?.blocked_until?.toISOString());
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
    await db.admin((client) => client.query(`UPDATE deletion_requests SET requested_at = now() - interval '21 hours' WHERE erased_account_id = $1`, [user.accountId]));
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

  it('a crash after the purge, before the registry learned it: the marker stays unclearable until the retry records it', async () => {
    const { user } = await populated();
    await accepted(user);
    registryControl.state.failingPurge = true;
    await w.drain(1);
    const request = await deletionRequestOf(db, user.accountId);
    expect(request?.purged_at).toBeInstanceOf(Date);
    expect(request?.marker_purge_recorded_at).toBeNull();
    expect((await markersOf(user.accountId))[0].purged_at).toBeNull();
    const [job] = await deletionJobOf(db, user.accountId);
    expect(job).toEqual(expect.objectContaining({ status: 'queued', last_error: 'registry_unavailable' }));
    expect((await w.repository.backlog()).open).toBeGreaterThanOrEqual(1);
    registryControl.state.failingPurge = false;
    provider.calls.length = 0;
    await runNow(db, job.id);
    await w.drain();
    expect(provider.calls).toEqual([]);
    expect((await deletionRequestOf(db, user.accountId))?.marker_purge_recorded_at).toBeInstanceOf(Date);
    expect((await markersOf(user.accountId))[0].purged_at).toBeInstanceOf(Date);
    expect((await deletionJobOf(db, user.accountId))[0].status).toBe('succeeded');
  });

  it('an expired deletion lease can neither read, mark, shed, purge nor finish', async () => {
    const user = await money.member();
    await accepted(user);
    const [claimed] = await w.jobs.claim(['account_deletion'], { leaseSeconds: 30 });
    expect(claimed.lease.jobId).toBe((await deletionJobOf(db, user.accountId))[0].id);
    expect(await w.repository.progress(claimed.lease)).not.toBeNull();
    await db.admin((client) => client.query(`UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = $1`, [claimed.lease.jobId]));
    expect(await w.repository.progress(claimed.lease)).toBeNull();
    expect(await w.repository.identities(claimed.lease)).toEqual([]);
    expect(await w.repository.clientIds(claimed.lease)).toEqual([]);
    expect(await w.repository.mark(claimed.lease, 'marker')).toBe(false);
    expect(await w.repository.objects(claimed.lease)).toBeNull();
    expect(await w.repository.shed(claimed.lease, 10)).toBeNull();
    expect(await w.repository.purge(claimed.lease)).toBe('stale_lease');
    expect(await w.repository.finish(claimed.lease)).toBe('stale_lease');
    expect((await deletionRequestOf(db, user.accountId))?.marker_recorded_at).toBeNull();
    expect((await accountOf(user.accountId)).status).toBe('deleting');
  });

  it('sheds the largest tables in short batches before a small purge', async () => {
    const { user, cash } = await populated();
    for (let i = 0; i < 4; i += 1) {
      await money.record(user, { type: 'expense', amount_minor: String(100 + i), occurred_on: '2026-03-02', wallet_id: cash, category_id: builtinId(user, 'food') });
    }
    await accepted(user);
    w.handlerOptions.afterStage = async (stage) => {
      if (stage === 'steps') throw new Error('synthetic stop before the shed');
    };
    await w.drain(1);
    w.handlerOptions.afterStage = undefined;
    await runNow(db, (await deletionJobOf(db, user.accountId))[0].id);
    const [claimed] = await w.jobs.claim(['account_deletion'], { leaseSeconds: 30 });
    const rowsLeft = async () => Number((await db.admin((client) => client.query(
      `SELECT (SELECT count(*) FROM entity_changes WHERE account_id = $1) + (SELECT count(*) FROM audit_events WHERE account_id = $1)
            + (SELECT count(*) FROM command_receipts WHERE account_id = $1) + (SELECT count(*) FROM transactions WHERE account_id = $1)
            + (SELECT count(*) FROM entity_heads WHERE account_id = $1) AS n`,
      [user.accountId],
    ))).rows[0].n);
    const before = await rowsLeft();
    expect(before).toBeGreaterThan(6);
    expect(await w.repository.shed(claimed.lease, 3)).toBe(3);
    expect(await rowsLeft()).toBe(before - 3);
    let passes = 0;
    while ((await w.repository.shed(claimed.lease, 3)) !== 0) passes += 1;
    expect(passes).toBeGreaterThan(1);
    expect(await rowsLeft()).toBe(0);
    await w.handler.run(claimed.lease);
    expect((await deletionRequestOf(db, user.accountId))?.marker_purge_recorded_at).toBeInstanceOf(Date);
    expect(await ownerRows(db, user.accountId, ['jobs', 'object_publications'])).toEqual({});
  });

  it('the worker sheds until nothing is left, one bounded batch per transaction, before it purges', async () => {
    const { user, cash } = await populated();
    for (let i = 0; i < 3; i += 1) {
      await money.record(user, { type: 'expense', amount_minor: String(200 + i), occurred_on: '2026-03-03', wallet_id: cash, category_id: builtinId(user, 'food') });
    }
    await accepted(user);
    const shed: (number | null)[] = [];
    const original = w.repository.shed.bind(w.repository);
    w.repository.shed = async (lease, limit) => {
      const n = await original(lease, limit);
      shed.push(n);
      return n;
    };
    w.handlerOptions.shedBatch = 4;
    try {
      await w.drain();
    } finally {
      w.repository.shed = original;
      w.handlerOptions.shedBatch = undefined;
    }
    expect(shed.length).toBeGreaterThan(2);
    expect(shed[shed.length - 1]).toBe(0);
    expect(shed.slice(0, -1).every((n) => n !== null && n > 0 && n <= 4)).toBe(true);
    expect((await deletionRequestOf(db, user.accountId))?.marker_purge_recorded_at).toBeInstanceOf(Date);
  });

  it('the account cancel routine never cancels the deletion job', async () => {
    const user = await money.member();
    await accepted(user);
    const owner = new Client(poolConfigFromUrl(db.adminUrl, 1));
    await owner.connect();
    try {
      await owner.query('BEGIN');
      await owner.query(`SELECT set_config('gogospend.account_id', $1, true)`, [user.accountId]);
      await owner.query('SELECT gogospend_cancel_account_jobs()');
      await owner.query('COMMIT');
    } finally {
      await owner.end();
    }
    expect(await deletionJobOf(db, user.accountId)).toEqual([expect.objectContaining({ status: 'queued', account_id: user.accountId })]);
  });

  it('the receipt needs the initiating binding, principal and client; after the purge only binding and client remain to match', async () => {
    const user = await money.member();
    const { key } = await accepted(user);
    const boot = await db.loginPool(['gogospend_bootstrap'], 1);
    const receiptRows = async (subject: string, client: string, commandId = key, binding = user.binding) =>
      (await boot.query('SELECT request_id, status FROM gogospend_deletion_receipt($1, $2, $3, $4, $5)', [sha256(binding), user.who.issuer, subject, client, commandId])).rows;
    expect(await receiptRows(user.who.subject, user.who.clientId)).toEqual([{ request_id: expect.any(String), status: 'accepted' }]);
    expect(await receiptRows(`auth0|${randomUUID()}`, user.who.clientId)).toEqual([]);
    expect(await receiptRows(user.who.subject, 'another-client')).toEqual([]);
    expect(await receiptRows(user.who.subject, user.who.clientId, randomUUID())).toEqual([]);
    expect(await receiptRows(user.who.subject, user.who.clientId, key, 'x'.repeat(43))).toEqual([]);
    await w.drain();
    // The principal digest is gone with the purge; the device's binding and client still have to match.
    expect((await deletionRequestOf(db, user.accountId))?.initiator_principal_digest).toBeNull();
    expect(await receiptRows(user.who.subject, user.who.clientId)).toEqual([{ request_id: expect.any(String), status: 'completed' }]);
    expect(await receiptRows(user.who.subject, 'another-client')).toEqual([]);
  });

  it('a provider event for an erased principal keeps no new receipt while the hold lasts', async () => {
    const user = await money.member();
    await accepted(user);
    await w.drain();
    const boot = await db.loginPool(['gogospend_bootstrap'], 1);
    const event = async () => (await boot.query(
      `SELECT gogospend_record_security_event($1, 'password_changed', $2, $3, now() - interval '1 second', $4) AS outcome`,
      [`evt_${randomUUID().replace(/-/g, '')}`, user.who.issuer, user.who.subject, randomUUID()],
    )).rows[0].outcome as string;
    const receipts = async () => (await db.admin((client) => client.query(
      'SELECT count(*)::int AS n FROM auth_event_receipts WHERE principal_digest = gogospend_principal_digest($1, $2)', [user.who.issuer, user.who.subject],
    ))).rows[0].n as number;
    expect(await event()).toBe('no_account');
    expect(await receipts()).toBe(0);
    // Once the hold has lapsed the login is nobody's; F6b's ordinary watermark applies again.
    await db.admin((client) => client.query(`UPDATE blocked_principals SET blocked_until = now() - interval '1 second' WHERE principal_digest = gogospend_principal_digest($1, $2)`, [user.who.issuer, user.who.subject]));
    expect(await event()).toBe('no_account');
    expect(await receipts()).toBe(1);
  });
});

describe('an account with a linked second sign-in method', () => {
  it('holds, captures, marks, revokes, deletes and finally blocks every alias', async () => {
    const user = await money.member();
    const second = { issuer: user.who.issuer, subject: `apple|${randomUUID()}` };
    await db.admin((client) => client.query('INSERT INTO account_identities (issuer, subject, account_id) VALUES ($1, $2, $3)', [second.issuer, second.subject, user.accountId]));
    const secondWho = { ...user.who, subject: second.subject };
    const both = [user.who.subject, second.subject].sort();
    const holdsOf = async () => (await db.admin((client) => client.query(
      `SELECT reason, blocked_until IS NOT NULL AS lapses FROM blocked_principals
        WHERE principal_digest IN (gogospend_principal_digest($1, $2), gogospend_principal_digest($3, $4))`,
      [user.who.issuer, user.who.subject, second.issuer, second.subject],
    ))).rows;
    await accepted(user);
    // Held at once, and captured for the provider stage.
    expect(await holdsOf()).toEqual([{ reason: 'deleted', lapses: false }, { reason: 'deleted', lapses: false }]);
    expect((await capturedSubjectsOf(db, user.accountId)).map((row) => row.subject).sort()).toEqual(both);
    expect(await code(() => fx.signIn(secondWho))).toBe('403 ACCOUNT_UNAVAILABLE');
    await w.drain();
    // Marked: one keyed lookup per alias.
    const lookup = (subject: string) => createHmac('sha256', Buffer.alloc(32, 7)).update(`gogospend-erasure-subject-v1\u0000${user.who.issuer}\u0000${subject}`).digest('base64url');
    expect((await markersOf(user.accountId)).flatMap((marker) => marker.subject_lookups).sort()).toEqual([lookup(user.who.subject), lookup(second.subject)].sort());
    // Revoked, deleted and confirmed at the provider, per alias.
    for (const subject of both) {
      expect(provider.calls.filter((call) => call.subject === subject).map((call) => call.op)).toEqual(['revokeGrants', 'deleteUser', 'confirmDeleted']);
    }
    // Blocked after the purge until the stale-token window passes.
    expect(await holdsOf()).toEqual([{ reason: 'deleted', lapses: true }, { reason: 'deleted', lapses: true }]);
    expect(await code(() => fx.signIn(secondWho))).toBe('403 ACCOUNT_UNAVAILABLE');
    expect(await ownerRows(db, user.accountId, ['jobs', 'object_publications'])).toEqual({});
  });
});

describe('restores (P6a)', () => {
  /** What P6a's row-level erase does to the restored copy: digest rows, rows that do not follow accounts, then the accounts. */
  async function restoreErase(accountId: string): Promise<void> {
    const loose = (await accountTables(db)).filter((row) => !row.cascades).map((row) => row.table);
    await db.admin(async (client) => {
      await client.query('BEGIN');
      await client.query(`DELETE FROM auth_event_receipts WHERE principal_digest IN (SELECT gogospend_principal_digest(issuer, subject) FROM account_identities WHERE account_id = $1)`, [accountId]);
      for (const table of loose) await client.query(`DELETE FROM ${client.escapeIdentifier(table)} WHERE account_id = $1`, [accountId]);
      await client.query('DELETE FROM accounts WHERE id = $1', [accountId]);
      await client.query('COMMIT');
    });
  }

  it('re-queues an in-progress erasure whose rows the restore then deletes: provider cleanup still runs from the captured aliases', async () => {
    const user = await money.member();
    const reapply = async () => (await db.admin((client) => client.query('SELECT gogospend_reapply_erasure($1, $2) AS outcome', [user.accountId, randomUUID()]))).rows[0].outcome as string;
    expect(await reapply()).toBe('requeued');
    expect((await accountOf(user.accountId)).status).toBe('deleting');
    expect((await as(user).get('/v1/me')).status).toBe(401);
    expect(await blocksOf(user)).toEqual([{ reason: 'deleted', blocked_until: null }]);
    expect(await capturedSubjectsOf(db, user.accountId)).toEqual([{ issuer: user.who.issuer, subject: user.who.subject }]);
    const [first] = await deletionJobOf(db, user.accountId);
    expect(first).toEqual(expect.objectContaining({ status: 'queued', account_id: null }));
    // A second reapply replaces the job: exactly one stays open.
    expect(await reapply()).toBe('requeued');
    const [second] = await deletionJobOf(db, user.accountId);
    expect(second.id).not.toBe(first.id);
    expect((await db.admin((client) => client.query('SELECT status FROM jobs WHERE id = $1', [first.id]))).rows[0].status).toBe('cancelled');

    await restoreErase(user.accountId);
    // The work items survive the row-level erase (no account_id), and no owner row is left.
    expect(await ownerRows(db, user.accountId)).toEqual({});
    expect(await deletionJobOf(db, user.accountId)).toEqual([expect.objectContaining({ id: second.id, status: 'queued' })]);
    await w.drain();
    expect(provider.calls).toEqual([
      { op: 'revokeGrants', subject: user.who.subject },
      { op: 'deleteUser', subject: user.who.subject },
      { op: 'confirmDeleted', subject: user.who.subject },
    ]);
    const request = await deletionRequestOf(db, user.accountId);
    expect(request?.marker_purge_recorded_at).toBeInstanceOf(Date);
    expect(await capturedSubjectsOf(db, user.accountId)).toEqual([]);
    // P5's hold semantics: an end one hour past verification, also on the marker.
    const [block] = await blocksOf(user);
    expect(block.blocked_until).toBeInstanceOf(Date);
    const markers = await markersOf(user.accountId);
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((marker) => marker.purged_at instanceof Date && marker.blocked_until?.toISOString() === block.blocked_until.toISOString())).toBe(true);
    expect(await reapply()).toBe('absent');
    // No serving role can call it.
    const app = await db.loginPool(['gogospend_app', 'gogospend_bootstrap'], 1);
    await expect(app.query('SELECT gogospend_reapply_erasure($1, $2)', [user.accountId, randomUUID()])).rejects.toMatchObject({ code: '42501' });
  });

  it('a re-run after an earlier purge appends a new marker, so the account stays unclearable until this run is purged too', async () => {
    const user = await money.member();
    await accepted(user);
    await w.drain();
    expect(await markersOf(user.accountId)).toHaveLength(1);
    // An older backup brings the account back; the restore re-queues its erasure.
    await db.admin(async (client) => {
      await client.query('DELETE FROM blocked_principals WHERE principal_digest = gogospend_principal_digest($1, $2)', [user.who.issuer, user.who.subject]);
      await client.query('INSERT INTO accounts (id) VALUES ($1)', [user.accountId]);
      await client.query('INSERT INTO account_sync_state (account_id) VALUES ($1)', [user.accountId]);
      await client.query('INSERT INTO account_identities (issuer, subject, account_id) VALUES ($1, $2, $3)', [user.who.issuer, user.who.subject, user.accountId]);
    });
    expect((await db.admin((client) => client.query('SELECT gogospend_reapply_erasure($1, $2) AS outcome', [user.accountId, randomUUID()]))).rows[0].outcome).toBe('requeued');
    registryControl.state.failingPurge = true;
    await w.drain(1);
    const markers = await markersOf(user.accountId);
    expect(markers).toHaveLength(2);
    expect(markers.map((marker) => marker.purged_at === null)).toEqual([false, true]);
    registryControl.state.failingPurge = false;
    await runNow(db, (await deletionJobOf(db, user.accountId))[0].id);
    await w.drain();
    expect((await markersOf(user.accountId)).every((marker) => marker.purged_at instanceof Date)).toBe(true);
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
    expect(first).toEqual(expect.objectContaining({ purged_at: null, blocked_until: null }));
    // Not independent here (same database as the data); production says so explicitly.
    expect(registry.independent).toBe(false);
    expect(new PostgresErasureRegistry(login, new LookupKey(Buffer.alloc(32, 9)), { independent: true, location: 'r2-recovery-control' })).toEqual(
      expect.objectContaining({ independent: true, location: 'r2-recovery-control', lookupKeyId: first.lookup_key_id }),
    );
    await expect(login.query('UPDATE erasure_registry.erasure_markers SET account_id = $1', [randomUUID()])).rejects.toMatchObject({ code: '42501' });
    await expect(login.query('DELETE FROM erasure_registry.erasure_markers')).rejects.toMatchObject({ code: '42501' });
    // The purge is recorded once; after that the marker is final.
    const purgedAt = new Date(Date.now() + 1_000);
    const until = new Date(Date.now() + 3_600_000);
    await registry.recordPurge(accountId, purgedAt, until);
    const [purged] = (await registry.listMarkers()).filter((marker) => marker.account_id === accountId);
    expect(purged).toEqual(expect.objectContaining({ purged_at: purgedAt.toISOString(), blocked_until: until.toISOString() }));
    await expect(login.query(`UPDATE erasure_registry.erasure_markers SET blocked_until = NULL WHERE account_id = $1`, [accountId])).rejects.toMatchObject({ code: '42501' });
    await expect(login.query(`UPDATE erasure_registry.erasure_markers SET purged_at = NULL WHERE account_id = $1`, [accountId])).rejects.toMatchObject({ code: '42501' });
    await expect(registry.recordPurge(randomUUID(), purgedAt, null)).rejects.toThrow();
    const broken = new Pool(poolConfigFromUrl(db.adminUrl.replace(/\/[^/]+$/, '/gogospend_no_such_database'), 1));
    try {
      await expect(new PostgresErasureRegistry(broken, new LookupKey(Buffer.alloc(32, 9))).listMarkers()).rejects.toThrow();
    } finally {
      await broken.end();
    }
  });
});
