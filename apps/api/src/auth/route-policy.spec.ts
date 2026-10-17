import { Controller, Get, HttpException, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { ApiIdentity, SessionContext } from '@gogospend/contracts';
import request from 'supertest';

import type { RateBudget, RateLimiter } from '../common/shared-rate-limit';
import { createV1TestApp } from '../testing/v1-test-app';
import { trustProxyHopsFromEnv } from '../v1/v1-app.module';
import { TokenVerificationError } from './auth0-token-verifier';
import type { TokenVerifier } from './auth0-token-verifier';
import type { PolicyGate, SessionResolver } from './application-session.guard';
import { Access, RequireScopes } from './auth-route.decorator';
import { CurrentIdentity, CurrentSession } from './request-context';
import { assertRoutesClassified, routeManifest } from './route-policy';

const ACCOUNT = '0192f0c1-7b3a-7c3e-9d4f-00000000000a';
const BINDING = 'b'.repeat(43);
const CLIENT = { 'x-gogospend-client': 'ios/1.4.0' };
const BEARER = { authorization: 'Bearer good-token' };

class InheritedRoutes {
  @Get('inherited') @Access('public') inherited() { return { ok: true }; }
}

@Controller('v1/fixture')
class FixtureController extends InheritedRoutes {
  @Get('public') @Access('public') open() { return { ok: true }; }
  @Post('challenge') @Access('token_only') challenge(@CurrentIdentity() identity: ApiIdentity) { return { subject: identity.subject }; }
  @Get('private') @Access('bound_session') read(@CurrentSession() session: SessionContext) { return { account: session.accountId }; }
  @Post('write') @Access('current_policy') write(@CurrentSession() session: SessionContext) { return { account: session.accountId }; }
  @Post('export') @Access('recent_proof') exportData(@CurrentSession() session: SessionContext) { return { account: session.accountId }; }
  @Get('scoped') @Access('token_only') @RequireScopes('read:diary') scoped() { return { ok: true }; }
  @Get('conflict') @Access('public') conflict() { throw new HttpException('conflict', 409); }
}

@Controller('v1/unclassified')
class UnclassifiedController {
  @Get() leak() { return { private: 'data' }; }
}

const verifier: TokenVerifier & { unavailable: boolean } = {
  unavailable: false,
  async verifyApiAccessToken(token: string) {
    if (this.unavailable) throw new TokenVerificationError('unavailable');
    if (token === 'scoped-token') return { issuer: 'https://tenant.example/', subject: 'auth0|user', clientId: 'native', scopes: ['openid', 'read:diary'] };
    if (token !== 'good-token') throw new TokenVerificationError('invalid');
    return { issuer: 'https://tenant.example/', subject: 'auth0|user', clientId: 'native', scopes: [] };
  },
};
let resolverCalls = 0;
const resolver: SessionResolver = {
  async resolve(identity, binding) {
    resolverCalls += 1;
    return binding === BINDING ? { accountId: ACCOUNT, subject: identity.subject, clientId: identity.clientId, bindingId: 'binding-1', sessionGeneration: 3 } : null;
  },
};
const policies: PolicyGate & { accepted: boolean; broken: boolean } = {
  accepted: false,
  broken: false,
  async hasAcceptedCurrentPolicy() {
    if (this.broken) throw new Error('policy store unreachable');
    return this.accepted;
  },
};
const PRINCIPAL = 'https://tenant.example/\u0000auth0|user';
const consumed: [RateBudget, string][] = [];
const limiter: RateLimiter & { deny: RateBudget | null } = {
  deny: null,
  async consume(budget, subject) {
    consumed.push([budget, subject]);
    return budget === this.deny ? { allowed: false, retryAfterSeconds: 17 } : { allowed: true, retryAfterSeconds: 0 };
  },
};

let app: INestApplication;

beforeAll(async () => {
  app = await createV1TestApp([FixtureController, UnclassifiedController], {
    verifier, resolver, policies, limiter, minimums: { ios: '1.4.0', android: '1.2.0' },
  });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  verifier.unavailable = false;
  policies.accepted = false;
  policies.broken = false;
  limiter.deny = null;
  consumed.length = 0;
  resolverCalls = 0;
});

describe('route manifest', () => {
  it('lists every route, including inherited ones, and refuses unclassified ones at startup', () => {
    expect(routeManifest(app).map((entry) => [entry.route, entry.access]).sort()).toEqual([
      ['GET /v1/fixture/conflict', 'public'],
      ['GET /v1/fixture/inherited', 'public'],
      ['GET /v1/fixture/private', 'bound_session'],
      ['GET /v1/fixture/public', 'public'],
      ['GET /v1/fixture/scoped', 'token_only'],
      ['GET /v1/unclassified', undefined],
      ['POST /v1/fixture/challenge', 'token_only'],
      ['POST /v1/fixture/export', 'recent_proof'],
      ['POST /v1/fixture/write', 'current_policy'],
    ]);
    expect(() => assertRoutesClassified(app)).toThrow('Unclassified v1 routes: GET /v1/unclassified');
  });

  it('an unclassified route fails closed even if it were registered', async () => {
    const res = await request(app.getHttpServer()).get('/v1/unclassified').set({ ...CLIENT, ...BEARER, 'x-gogospend-session': BINDING });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});

describe('access classes', () => {
  it('public needs no credentials or client header', async () => {
    expect((await request(app.getHttpServer()).get('/v1/fixture/public')).status).toBe(200);
  });

  it('token_only needs a verified token but no binding', async () => {
    const server = app.getHttpServer();
    expect((await request(server).post('/v1/fixture/challenge').set(CLIENT)).status).toBe(401);
    expect((await request(server).post('/v1/fixture/challenge').set({ ...CLIENT, authorization: 'Bearer forged' })).status).toBe(401);
    const ok = await request(server).post('/v1/fixture/challenge').set({ ...CLIENT, ...BEARER });
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ subject: 'auth0|user' });
  });

  it('a private route cannot be reached with a token alone', async () => {
    const res = await request(app.getHttpServer()).get('/v1/fixture/private').set({ ...CLIENT, ...BEARER });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it.each([['unknown binding', 'c'.repeat(43)], ['malformed binding', 'short'], ['binding with bad characters', `${'b'.repeat(42)}!`]])('rejects a %s', async (_name, binding) => {
    const res = await request(app.getHttpServer()).get('/v1/fixture/private').set({ ...CLIENT, ...BEARER, 'x-gogospend-session': binding });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_REQUIRED');
  });

  it('bound_session resolves the session for the handler', async () => {
    const res = await request(app.getHttpServer()).get('/v1/fixture/private').set({ ...CLIENT, ...BEARER, 'x-gogospend-session': BINDING });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ account: ACCOUNT });
  });

  it('a binding without a token is not a credential', async () => {
    const res = await request(app.getHttpServer()).get('/v1/fixture/private').set({ ...CLIENT, 'x-gogospend-session': BINDING });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('current_policy denies until the current policy is accepted', async () => {
    const send = () => request(app.getHttpServer()).post('/v1/fixture/write').set({ ...CLIENT, ...BEARER, 'x-gogospend-session': BINDING });
    const denied = await send();
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    policies.accepted = true;
    expect((await send()).status).toBe(201);
  });

  it('recent_proof stays reachable without newly required terms but still needs a binding', async () => {
    const server = app.getHttpServer();
    expect((await request(server).post('/v1/fixture/export').set({ ...CLIENT, ...BEARER, 'x-gogospend-session': BINDING })).status).toBe(201);
    expect((await request(server).post('/v1/fixture/export').set({ ...CLIENT, ...BEARER })).status).toBe(401);
  });

  it('an outdated client is told to upgrade before anything else', async () => {
    const res = await request(app.getHttpServer()).get('/v1/fixture/private').set({ 'x-gogospend-client': 'ios/1.0.0', 'x-gogospend-session': BINDING });
    expect(res.status).toBe(426);
    expect(res.body.code).toBe('CLIENT_UPGRADE_REQUIRED');
  });

  it('an unavailable verifier fails closed with 503, not as a bad token', async () => {
    verifier.unavailable = true;
    const res = await request(app.getHttpServer()).get('/v1/fixture/private').set({ ...CLIENT, ...BEARER, 'x-gogospend-session': BINDING });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('a failing policy store fails closed with 503, not 500', async () => {
    policies.broken = true;
    const res = await request(app.getHttpServer()).post('/v1/fixture/write').set({ ...CLIENT, ...BEARER, 'x-gogospend-session': BINDING });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('a scope-protected route needs every listed scope', async () => {
    const server = app.getHttpServer();
    const missing = await request(server).get('/v1/fixture/scoped').set({ ...CLIENT, ...BEARER });
    expect(missing.status).toBe(403);
    expect(missing.body.code).toBe('FORBIDDEN');
    expect((await request(server).get('/v1/fixture/scoped').set({ ...CLIENT, authorization: 'Bearer scoped-token' })).status).toBe(200);
  });

  it('keeps the status of HTTP errors it has no specific code for', async () => {
    const res = await request(app.getHttpServer()).get('/v1/fixture/conflict');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });
});

describe('rate limits', () => {
  it('charges token-only routes to the principal and the network address', async () => {
    await request(app.getHttpServer()).post('/v1/fixture/challenge').set({ ...CLIENT, ...BEARER });
    expect(consumed.map(([budget]) => budget).sort()).toEqual(['auth_network', 'auth_principal']);
    expect(consumed.find(([budget]) => budget === 'auth_principal')?.[1]).toBe('https://tenant.example/\u0000auth0|user');
  });

  it('charges bound requests to the principal, then reads and writes to the resolved session', async () => {
    const server = app.getHttpServer();
    await request(server).get('/v1/fixture/private').set({ ...CLIENT, ...BEARER, 'x-gogospend-session': BINDING });
    policies.accepted = true;
    await request(server).post('/v1/fixture/write').set({ ...CLIENT, ...BEARER, 'x-gogospend-session': BINDING });
    // Keyed by the server's binding id, never by the client-supplied string.
    expect(consumed).toEqual([['principal', PRINCIPAL], ['read', 'binding-1'], ['principal', PRINCIPAL], ['write', 'binding-1']]);
  });

  it('random bindings cost the principal budget and stop before the session lookup once it is spent', async () => {
    const server = app.getHttpServer();
    const unknown = await request(server).get('/v1/fixture/private').set({ ...CLIENT, ...BEARER, 'x-gogospend-session': 'r'.repeat(43) });
    expect(unknown.status).toBe(401);
    expect(consumed).toEqual([['principal', PRINCIPAL]]);
    limiter.deny = 'principal';
    resolverCalls = 0;
    const flood = await request(server).get('/v1/fixture/private').set({ ...CLIENT, ...BEARER, 'x-gogospend-session': 's'.repeat(43) });
    expect(flood.status).toBe(429);
    expect(resolverCalls).toBe(0);
  });

  it('returns 429 with Retry-After when a budget is exhausted', async () => {
    limiter.deny = 'read';
    const res = await request(app.getHttpServer()).get('/v1/fixture/private').set({ ...CLIENT, ...BEARER, 'x-gogospend-session': BINDING });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('17');
    expect(res.body).toMatchObject({ code: 'RATE_LIMITED', retry_after_seconds: 17 });
  });

  it('ignores a spoofed X-Forwarded-For unless a proxy hop is explicitly trusted', async () => {
    const networkKey = () => consumed.find(([budget]) => budget === 'auth_network')?.[1];
    await request(app.getHttpServer()).post('/v1/fixture/challenge').set({ ...CLIENT, ...BEARER, 'x-forwarded-for': '198.51.100.7' });
    expect(networkKey()).not.toBe('198.51.100.7');
    expect(networkKey()).toMatch(/127\.0\.0\.1|::\/64/);

    const saved = process.env.TRUST_PROXY_HOPS;
    process.env.TRUST_PROXY_HOPS = '1';
    const behindProxy = await createV1TestApp([FixtureController], { verifier, resolver, policies, limiter, minimums: { ios: '1.4.0', android: '1.2.0' } });
    try {
      consumed.length = 0;
      // One trusted hop: the proxy's own appended address is used, not the client-supplied first entry.
      await request(behindProxy.getHttpServer()).post('/v1/fixture/challenge').set({ ...CLIENT, ...BEARER, 'x-forwarded-for': '203.0.113.1, 198.51.100.7' });
      expect(networkKey()).toBe('198.51.100.7');
    } finally {
      await behindProxy.close();
      if (saved === undefined) delete process.env.TRUST_PROXY_HOPS;
      else process.env.TRUST_PROXY_HOPS = saved;
    }
  });

  it.each(['-1', '4', '1.5', 'true'])('refuses TRUST_PROXY_HOPS=%p', (value) => {
    expect(() => trustProxyHopsFromEnv(value)).toThrow();
  });

  it('requires TRUST_PROXY_HOPS to be set explicitly in production', () => {
    expect(() => trustProxyHopsFromEnv(undefined, 'production')).toThrow();
    expect(() => trustProxyHopsFromEnv('', 'production')).toThrow();
    expect(trustProxyHopsFromEnv('1', 'production')).toBe(1);
    expect(trustProxyHopsFromEnv(undefined, 'development')).toBe(0);
  });

  it('never charges public routes, so health checks do not touch the database', async () => {
    await request(app.getHttpServer()).get('/v1/fixture/public');
    expect(consumed).toEqual([]);
  });
});
