// The real AuthModule wiring (global guard, verifier, PostgreSQL rate limiter,
// fail-closed session defaults) against a synthetic issuer and a disposable
// local database. Test doubles are not used here.
import { Controller, Get, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { TEST_AUDIENCE, TEST_CLIENT_ID, startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createTestDatabase } from '../testing/postgres-harness';
import type { TestDatabase } from '../testing/postgres-harness';
import { configureV1App } from '../v1/v1-app.module';
import { Access } from './auth-route.decorator';
import { AuthModule } from './auth.module';

@Controller('v1/wired')
class WiredController {
  @Post('challenge') @Access('token_only') challenge() { return { ok: true }; }
  @Get('private') @Access('bound_session') read() { return { leaked: true }; }
  @Get('unclassified') leak() { return { leaked: true }; }
}

@Module({ imports: [AuthModule], controllers: [WiredController] })
class WiredModule {}

const SETTINGS = ['DATABASE_URL', 'AUTH0_ISSUER', 'AUTH0_AUDIENCE', 'AUTH0_ALLOWED_CLIENT_IDS', 'RATE_LIMIT_KEY', 'MIN_CLIENT_VERSION_IOS', 'MIN_CLIENT_VERSION_ANDROID'];
const saved = Object.fromEntries(SETTINGS.map((key) => [key, process.env[key]]));
const CLIENT = { 'x-gogospend-client': 'android/1.0.0' };

let db: TestDatabase;
let issuer: JwksFixture;
let app: NestExpressApplication;

beforeAll(async () => {
  db = await createTestDatabase();
  issuer = await startJwksFixture();
  Object.assign(process.env, {
    DATABASE_URL: await db.loginUrl(['gogospend_app', 'gogospend_bootstrap']),
    AUTH0_ISSUER: issuer.issuer,
    AUTH0_AUDIENCE: TEST_AUDIENCE,
    AUTH0_ALLOWED_CLIENT_IDS: TEST_CLIENT_ID,
    RATE_LIMIT_KEY: 'synthetic-test-key-0123456789abcdef0123456789',
    MIN_CLIENT_VERSION_IOS: '1.0.0',
    MIN_CLIENT_VERSION_ANDROID: '1.0.0',
  });
  app = await NestFactory.create<NestExpressApplication>(WiredModule, { bodyParser: false, logger: false, abortOnError: false });
  configureV1App(app);
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await issuer?.close();
  await db?.drop();
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('AuthModule wiring', () => {
  it('accepts a real access token on a token-only route and charges the shared database budget', async () => {
    const res = await request(app.getHttpServer()).post('/v1/wired/challenge').set({ ...CLIENT, authorization: `Bearer ${await issuer.accessToken()}` });
    expect(res.status).toBe(201);
    const buckets = await db.admin((client) => client.query<{ n: number }>('SELECT count(*)::int AS n FROM rate_limit_buckets'));
    expect(buckets.rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it('rejects a token from an unpublished key', async () => {
    const forged = await issuer.sign(
      { iss: issuer.issuer, sub: 'auth0|x', aud: TEST_AUDIENCE, azp: TEST_CLIENT_ID, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 },
      { key: (await issuer.unpublishedKey()).privateKey },
    );
    expect((await request(app.getHttpServer()).post('/v1/wired/challenge').set({ ...CLIENT, authorization: `Bearer ${forged}` })).status).toBe(401);
  });

  it('keeps bound routes closed until F4 provides session lookup', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/wired/private')
      .set({ ...CLIENT, authorization: `Bearer ${await issuer.accessToken()}`, 'x-gogospend-session': 'b'.repeat(43) });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it('refuses an unclassified route', async () => {
    const res = await request(app.getHttpServer()).get('/v1/wired/unclassified').set({ ...CLIENT, authorization: `Bearer ${await issuer.accessToken()}` });
    expect(res.status).toBe(403);
  });
});
