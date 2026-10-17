import { SignJWT, UnsecuredJWT } from 'jose';
import type { JWTPayload } from 'jose';

import { TEST_AUDIENCE, TEST_CLIENT_ID, startJwksFixture } from '../testing/jwks-server';
import type { JwksFixture } from '../testing/jwks-server';
import { Auth0KeySource } from './auth0-key-source';
import { OidcProofVerifier, ProofVerificationError, sha256 } from './oidc-proof-verifier';

const CHALLENGE = '0192f0c1-7b3a-7c3e-9d4f-0000000000c1';
const now = () => Math.floor(Date.now() / 1000);

let issuer: JwksFixture;
let verifier: OidcProofVerifier;
const identity = () => ({ issuer: issuer.issuer, subject: 'auth0|proof-user', clientId: TEST_CLIENT_ID, scopes: [] });
const idToken = (overrides: JWTPayload = {}) =>
  issuer.sign({ iss: issuer.issuer, sub: 'auth0|proof-user', aud: TEST_CLIENT_ID, nonce: 'nonce-1', auth_time: now() - 5, iat: now(), exp: now() + 600, ...overrides });

async function outcome(token: string, using = verifier): Promise<string> {
  try {
    await using.verifyChallenge(identity(), CHALLENGE, token);
    return 'ok';
  } catch (error) {
    if (error instanceof ProofVerificationError) return error.reason;
    return `threw ${(error as Error).name}`;
  }
}

beforeAll(async () => {
  issuer = await startJwksFixture();
  verifier = new OidcProofVerifier(issuer.issuer, new Auth0KeySource(issuer.issuer, { timeoutMs: 300 }));
});

afterAll(async () => {
  await issuer.close();
});

describe('OIDC proof verification', () => {
  it('turns a nonce-bound ID token into a proof for one challenge', async () => {
    const authTime = now() - 5;
    const proof = await verifier.verifyChallenge(identity(), CHALLENGE, await idToken({ auth_time: authTime }));
    expect(proof).toMatchObject({ challengeId: CHALLENGE, issuer: issuer.issuer, subject: 'auth0|proof-user', clientId: TEST_CLIENT_ID });
    expect(proof.nonceDigest.equals(sha256('nonce-1'))).toBe(true);
    expect(proof.authTime.getTime()).toBe(authTime * 1000);
  });

  const rejected: [string, () => Promise<string>][] = [
    ['an API access token presented as proof', () => issuer.accessToken()],
    ['an ID token for another client', () => idToken({ aud: 'another-native-client' })],
    ['an ID token for another user', () => idToken({ sub: 'auth0|someone-else' })],
    ['an ID token from another issuer', () => idToken({ iss: 'https://other-tenant.example/' })],
    ['a mismatched azp', () => idToken({ aud: [TEST_CLIENT_ID, 'extra'], azp: 'extra' })],
    ['a missing nonce', () => idToken({ nonce: undefined })],
    ['a missing auth_time', () => idToken({ auth_time: undefined })],
    ['an auth_time in the future', () => idToken({ auth_time: now() + 600 })],
    ['a stale ID token (issued 10 minutes ago)', () => idToken({ iat: now() - 600, auth_time: now() - 600 })],
    ['an expired ID token', () => idToken({ exp: now() - 120 })],
    ['a forged signature', async () => issuer.sign({ iss: issuer.issuer, sub: 'auth0|proof-user', aud: TEST_CLIENT_ID, nonce: 'n', auth_time: now(), iat: now(), exp: now() + 600 }, { key: (await issuer.unpublishedKey()).privateKey })],
    ['HS256', () => new SignJWT({ iss: issuer.issuer, sub: 'auth0|proof-user', aud: TEST_CLIENT_ID, nonce: 'n', auth_time: now(), iat: now(), exp: now() + 600 }).setProtectedHeader({ alg: 'HS256', kid: 'test-key-1' }).sign(new TextEncoder().encode('a-shared-secret-of-sufficient-length!'))],
    ['alg none', async () => new UnsecuredJWT({ iss: issuer.issuer, sub: 'auth0|proof-user', aud: TEST_CLIENT_ID, nonce: 'n', auth_time: now(), iat: now(), exp: now() + 600 }).encode()],
    ['garbage', async () => 'not.a.jwt'],
  ];

  it.each(rejected)('rejects %s', async (_name, makeToken) => {
    expect(await outcome(await makeToken())).toBe('invalid');
  });

  it('reports an unreachable key source as unavailable', async () => {
    const cold = new OidcProofVerifier(issuer.issuer, new Auth0KeySource(issuer.issuer, { timeoutMs: 300 }));
    issuer.mode = 'down';
    try {
      expect(await outcome(await idToken(), cold)).toBe('unavailable');
    } finally {
      issuer.mode = 'ok';
    }
  });

  it('never accepts the API audience, so an ID token and an access token cannot stand in for each other', async () => {
    expect(await outcome(await idToken({ aud: TEST_AUDIENCE }))).toBe('invalid');
  });
});
