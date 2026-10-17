import { Controller, Post } from '@nestjs/common';
import { SignJWT, UnsecuredJWT } from 'jose';
import request from 'supertest';

import { TEST_AUDIENCE, TEST_CLIENT_ID, startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { createV1TestApp } from '../testing/v1-test-app';
import { Auth0TokenVerifier, TokenVerificationError, auth0ConfigFromEnv } from './auth0-token-verifier';
import { Access } from './auth-route.decorator';

let issuer: JwksFixture;
let verifier: Auth0TokenVerifier;
const now = () => Math.floor(Date.now() / 1000);

function newVerifier(): Auth0TokenVerifier {
  return new Auth0TokenVerifier(
    { issuer: issuer.issuer, audience: TEST_AUDIENCE, allowedClientIds: [TEST_CLIENT_ID] },
    { timeoutMs: 300, cooldownMs: 60_000 },
  );
}

async function outcome(token: string, using = verifier): Promise<'ok' | 'invalid' | 'unavailable'> {
  try {
    await using.verifyApiAccessToken(token);
    return 'ok';
  } catch (error) {
    if (error instanceof TokenVerificationError) return error.reason;
    throw error;
  }
}

beforeAll(async () => {
  issuer = await startJwksFixture();
  verifier = newVerifier();
});

afterAll(async () => {
  await issuer.close();
});

describe('Auth0 access-token verification', () => {
  it('accepts a correct API access token and maps its identity', async () => {
    await expect(verifier.verifyApiAccessToken(await issuer.accessToken())).resolves.toEqual({
      issuer: issuer.issuer,
      subject: 'auth0|test-user',
      clientId: TEST_CLIENT_ID,
      scopes: ['openid', 'profile', 'email', 'offline_access'],
    });
  });

  it('rejects ID tokens, including one that also names the API audience', async () => {
    const idToken = await issuer.sign({ iss: issuer.issuer, sub: 'auth0|test-user', aud: TEST_CLIENT_ID, nonce: 'n-1', iat: now(), exp: now() + 300 });
    expect(await outcome(idToken)).toBe('invalid');
    const idTokenWithApiAudience = await issuer.accessToken({ nonce: 'n-1' });
    expect(await outcome(idTokenWithApiAudience)).toBe('invalid');
  });

  it('id_token_is_not_api_authorization', async () => {
    @Controller('v1/probe')
    class ProbeController {
      @Post('challenge') @Access('token_only') challenge() { return { ok: true }; }
    }
    const app = await createV1TestApp([ProbeController], { verifier });
    try {
      const idToken = await issuer.sign({ iss: issuer.issuer, sub: 'auth0|test-user', aud: TEST_CLIENT_ID, nonce: 'n-1', iat: now(), exp: now() + 300 });
      const response = await request(app.getHttpServer())
        .post('/v1/probe/challenge')
        .set({ authorization: `Bearer ${idToken}`, 'x-gogospend-client': 'ios/1.0.0' });
      expect(response.status).toBe(401);
      const accepted = await request(app.getHttpServer())
        .post('/v1/probe/challenge')
        .set({ authorization: `Bearer ${await issuer.accessToken()}`, 'x-gogospend-client': 'ios/1.0.0' });
      expect(accepted.status).toBe(201);
    } finally {
      await app.close();
    }
  });

  const rejected: [string, () => Promise<string>][] = [
    ['wrong issuer', () => issuer.accessToken({ iss: 'https://other-tenant.example/' })],
    ['wrong audience', () => issuer.accessToken({ aud: 'https://another-api.example' })],
    ['unlisted client', () => issuer.accessToken({ azp: 'some-other-client' })],
    ['missing client', () => issuer.accessToken({ azp: undefined })],
    ['missing subject', () => issuer.accessToken({ sub: undefined })],
    ['empty subject', () => issuer.accessToken({ sub: '' })],
    ['expired beyond clock skew', () => issuer.accessToken({ exp: now() - 120 })],
    ['not yet valid', () => issuer.accessToken({ nbf: now() + 120 })],
    ['missing expiry', () => issuer.accessToken({ exp: undefined })],
    ['a 30-day lifetime', () => issuer.accessToken({ exp: now() + 30 * 24 * 3600 })],
    ['issued in the future', () => issuer.accessToken({ iat: now() + 3600, exp: now() + 3900 })],
    ['a machine-to-machine token from an allowed client', () => issuer.accessToken({ gty: 'client-credentials', sub: `${TEST_CLIENT_ID}@clients` })],
    ['a non-string azp falling back to an allowed client_id', () => issuer.accessToken({ azp: 42, client_id: TEST_CLIENT_ID })],
    ['signed by an unpublished key under the published kid', async () => issuer.sign({ iss: issuer.issuer, sub: 'auth0|x', aud: TEST_AUDIENCE, azp: TEST_CLIENT_ID, iat: now(), exp: now() + 300 }, { key: (await issuer.unpublishedKey()).privateKey })],
    ['HS256 with the published kid', () => new SignJWT({ iss: issuer.issuer, sub: 'auth0|x', aud: TEST_AUDIENCE, azp: TEST_CLIENT_ID, iat: now(), exp: now() + 300 }).setProtectedHeader({ alg: 'HS256', kid: 'test-key-1' }).sign(new TextEncoder().encode('a-shared-secret-of-sufficient-length!'))],
    ['alg none', async () => new UnsecuredJWT({ iss: issuer.issuer, sub: 'auth0|x', aud: TEST_AUDIENCE, azp: TEST_CLIENT_ID, iat: now(), exp: now() + 300 }).encode()],
    ['opaque token', async () => 'v2.local.opaque-access-token-value'],
    ['malformed token', async () => 'a.b.c'],
    ['empty token', async () => ''],
    ['oversized token', async () => `${'a'.repeat(9000)}.b.c`],
  ];

  it.each(rejected)('rejects %s', async (_name, makeToken) => {
    expect(await outcome(await makeToken())).toBe('invalid');
  });

  it('bounds JWKS refetches for unknown key ids', async () => {
    const before = issuer.requests;
    const stranger = await issuer.unpublishedKey();
    for (let i = 0; i < 5; i++) {
      const token = await issuer.sign({ iss: issuer.issuer, sub: 'auth0|x', aud: TEST_AUDIENCE, azp: TEST_CLIENT_ID, iat: now(), exp: now() + 300 }, { kid: `unknown-${i}`, key: stranger.privateKey });
      expect(await outcome(token)).toBe('invalid');
    }
    expect(issuer.requests - before).toBeLessThanOrEqual(1);
  });

  it('accepts client_id when azp is absent (RFC 9068 tokens)', async () => {
    expect(await outcome(await issuer.accessToken({ azp: undefined, client_id: TEST_CLIENT_ID }))).toBe('ok');
  });

  it('does not refetch the JWKS on every request while the endpoint is down', async () => {
    const cold = newVerifier();
    issuer.mode = 'down';
    try {
      const before = issuer.requests;
      const token = await issuer.accessToken();
      for (let i = 0; i < 20; i++) expect(await outcome(token, cold)).toBe('unavailable');
      expect(issuer.requests - before).toBeLessThanOrEqual(2);
    } finally {
      issuer.mode = 'ok';
    }
  });

  it.each(['down', 'hang', 'malformed'] as const)('fails closed as unavailable when the JWKS endpoint is %s', async (mode) => {
    const cold = newVerifier();
    issuer.mode = mode;
    try {
      expect(await outcome(await issuer.accessToken(), cold)).toBe('unavailable');
    } finally {
      issuer.mode = 'ok';
    }
  });
});

describe('Auth0 configuration', () => {
  const valid = {
    AUTH0_ISSUER: 'https://gogospend-dev.jp.auth0.com/',
    AUTH0_AUDIENCE: 'https://api.gogospend.example',
    AUTH0_ALLOWED_CLIENT_IDS: 'native-ios,native-android',
  };

  it('pins issuer, audience and allowed clients', () => {
    expect(auth0ConfigFromEnv({ ...valid })).toEqual({
      issuer: 'https://gogospend-dev.jp.auth0.com/',
      audience: 'https://api.gogospend.example',
      allowedClientIds: ['native-ios', 'native-android'],
    });
  });

  it.each([
    ['missing issuer', { AUTH0_ISSUER: undefined }],
    ['plain-http remote issuer', { AUTH0_ISSUER: 'http://gogospend-dev.jp.auth0.com/' }],
    ['issuer without trailing slash', { AUTH0_ISSUER: 'https://gogospend-dev.jp.auth0.com' }],
    ['missing audience', { AUTH0_AUDIENCE: '' }],
    ['no allowed clients', { AUTH0_ALLOWED_CLIENT_IDS: ' , ' }],
    ['loopback issuer in production', { AUTH0_ISSUER: 'http://127.0.0.1:9999/', NODE_ENV: 'production' }],
  ])('refuses %s', (_name, override) => {
    expect(() => auth0ConfigFromEnv({ ...valid, ...override })).toThrow();
  });

  it('allows a loopback test issuer outside production', () => {
    expect(auth0ConfigFromEnv({ ...valid, AUTH0_ISSUER: 'http://127.0.0.1:9999/' }).issuer).toBe('http://127.0.0.1:9999/');
  });
});
