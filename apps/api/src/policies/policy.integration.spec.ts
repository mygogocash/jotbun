import { Controller, Get, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { SessionContext } from '@gogospend/contracts';
import request from 'supertest';

import { Access } from '../auth/auth-route.decorator';
import { DatabaseService } from '../database/database.service';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { createV1TestApp } from '../testing/v1-test-app';
import { PolicyService } from './policy.service';

const ACCOUNT = '0192f0c1-7b3a-7c3e-9d4f-0000000000d1';
const OTHER = '0192f0c1-7b3a-7c3e-9d4f-0000000000d2';
// Writes re-check the binding under the account lock, so each account has a real session row.
const SESSIONS: Record<string, string> = { [ACCOUNT]: '0192f0c1-7b3a-7c3e-9d4f-0000000000e1', [OTHER]: '0192f0c1-7b3a-7c3e-9d4f-0000000000e2' };
const ctx = (accountId: string): SessionContext => ({ accountId, subject: `auth0|${accountId}`, clientId: 'native', bindingId: SESSIONS[accountId], sessionGeneration: 0 });

let db: TestDatabase;
let policies: PolicyService;
let service: DatabaseService;

async function publish(kind: string, version: number, required: boolean, publishedAt = "now() - interval '1 minute'"): Promise<void> {
  await db.admin((client) => client.query(
    `INSERT INTO policy_versions (kind, version, required, published_at, text_th, text_en) VALUES ($1, $2, $3, ${publishedAt}, $4, $5)`,
    [kind, version, required, `ข้อกำหนด ${kind} ${version}`, `${kind} text ${version}`],
  ));
}
const state = (accountId = ACCOUNT) => policies.currentPolicyState(ctx(accountId));
const pending = (accountId = ACCOUNT) => service.withOwnerTransaction(ctx(accountId), (tx) => policies.pending(tx));

beforeAll(async () => {
  db = await createTestDatabase();
  await db.admin(async (client) => {
    for (const id of [ACCOUNT, OTHER]) {
      await client.query('INSERT INTO accounts (id) VALUES ($1)', [id]);
      await client.query('INSERT INTO account_sync_state (account_id) VALUES ($1)', [id]);
      await client.query(
        `INSERT INTO auth_sessions (id, account_id, binding_digest, principal_digest, client_id, session_generation, authenticated_at, first_used_at, idle_expires_at, absolute_expires_at)
         VALUES ($1::uuid, $2::uuid, sha256(convert_to($1::text, 'UTF8')), sha256(convert_to($2::text, 'UTF8')), 'native', 0, now(), now(), now() + interval '7 days', now() + interval '30 days')`,
        [SESSIONS[id], id],
      );
    }
  });
  const pool = await db.loginPool(['gogospend_app']);
  service = new DatabaseService(pool);
  policies = new PolicyService(pool, service, 0);
});

afterAll(async () => {
  await db?.drop();
});

describe('policy acknowledgement', () => {
  it('denies writes while no required policy is published, and never invents text', async () => {
    expect(await state()).toBe('unpublished');
    expect(await policies.published()).toEqual([]);
  });

  it('stays unpublished until terms are required and a privacy policy is published', async () => {
    await publish('terms', 1, true);
    expect(await state()).toBe('unpublished');
    await publish('privacy', 1, false);
    expect(await state()).not.toBe('unpublished');
  });

  it('a published required policy is pending until this account accepts it', async () => {
    expect(await state()).toBe('pending');
    expect(await pending()).toEqual([{ kind: 'terms', version: 1 }]);
    await policies.accept(ctx(ACCOUNT), 'terms', 1);
    await policies.accept(ctx(ACCOUNT), 'terms', 1);
    expect(await state()).toBe('accepted');
    expect(await pending()).toEqual([]);
    expect(await state(OTHER)).toBe('pending');
  });

  it('a newer required version is pending again until accepted', async () => {
    await publish('terms', 2, true);
    expect(await state()).toBe('pending');
    expect(await pending()).toEqual([{ kind: 'terms', version: 2 }]);
    await policies.accept(ctx(ACCOUNT), 'terms', 2);
    expect(await state()).toBe('accepted');
  });

  it('a non-required version does not block, and a required privacy policy does', async () => {
    await publish('privacy', 2, false);
    expect(await state()).toBe('accepted');
    await publish('privacy', 3, true);
    expect(await pending()).toEqual([{ kind: 'privacy', version: 3 }]);
    await policies.accept(ctx(ACCOUNT), 'privacy', 3);
    expect(await state()).toBe('accepted');
  });

  it('a version scheduled for later is invisible and cannot be accepted', async () => {
    await publish('terms', 3, true, "now() + interval '1 day'");
    expect((await policies.published()).find((p) => p.kind === 'terms')?.version).toBe(2);
    expect(await state()).toBe('accepted');
    await expect(policies.accept(ctx(ACCOUNT), 'terms', 3)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', field: 'version' });
  });

  it('after a non-required revision, a new user is asked for the latest text, which satisfies the requirement', async () => {
    await publish('terms', 4, false);
    expect(await state()).toBe('accepted');
    expect(await pending(OTHER)).toEqual([{ kind: 'privacy', version: 3 }, { kind: 'terms', version: 4 }]);
    expect((await policies.published()).find((p) => p.kind === 'terms')?.version).toBe(4);
    await policies.accept(ctx(OTHER), 'terms', 4);
    await policies.accept(ctx(OTHER), 'privacy', 3);
    expect(await state(OTHER)).toBe('accepted');
  });

  it('the database refuses a consent for a policy version that does not exist', async () => {
    await expect(
      service.withOwnerTransaction(ctx(ACCOUNT), (tx) => tx.query(`INSERT INTO consents (account_id, kind, version, granted) VALUES ($1, 'terms', 99, true)`, [ACCOUNT])),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('returns the latest published text for each kind in Thai and English', async () => {
    const terms = (await policies.published()).find((p) => p.kind === 'terms');
    expect(terms).toMatchObject({ kind: 'terms', version: 4, required: false, text: { th: 'ข้อกำหนด terms 4', en: 'terms text 4' } });
  });

  it('optional analytics is off by default and private to the account', async () => {
    const privacy = (accountId: string) => service.withOwnerTransaction(ctx(accountId), (tx) => policies.privacy(tx));
    expect(await privacy(ACCOUNT)).toEqual({ analytics: false });
    expect(await policies.setPrivacy(ctx(ACCOUNT), true)).toEqual({ analytics: true });
    expect(await privacy(ACCOUNT)).toEqual({ analytics: true });
    expect(await privacy(OTHER)).toEqual({ analytics: false });
    await policies.setPrivacy(ctx(ACCOUNT), false);
    expect(await privacy(ACCOUNT)).toEqual({ analytics: false });
  });
});

describe('routes while a newer required version is pending', () => {
  @Controller('v1/probe')
  class ProbeController {
    @Post('write') @Access('current_policy') write() { return { ok: true }; }
    @Post('export') @Access('recent_proof') exportData() { return { ok: true }; }
    @Get('read') @Access('bound_session') read() { return { ok: true }; }
  }

  let app: INestApplication;
  const BINDING = 'b'.repeat(43);
  const headers = { 'x-gogospend-client': 'ios/1.0.0', authorization: 'Bearer good-token', 'x-gogospend-session': BINDING };

  beforeAll(async () => {
    await publish('terms', 9, true);
    app = await createV1TestApp([ProbeController], {
      verifier: { verifyApiAccessToken: async () => ({ issuer: 'https://tenant.example/', subject: `auth0|${ACCOUNT}`, clientId: 'native', scopes: [] }) },
      resolver: { resolve: async () => ctx(ACCOUNT) },
      policies,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks writes but keeps reads, export and policy review reachable', async () => {
    const server = app.getHttpServer();
    const write = await request(server).post('/v1/probe/write').set(headers);
    expect(write.status).toBe(403);
    expect(write.body.code).toBe('POLICY_ACCEPTANCE_REQUIRED');
    expect((await request(server).post('/v1/probe/export').set(headers)).status).toBe(201);
    expect((await request(server).get('/v1/probe/read').set(headers)).status).toBe(200);
    await policies.accept(ctx(ACCOUNT), 'terms', 9);
    expect((await request(server).post('/v1/probe/write').set(headers)).status).toBe(201);
  });
});
