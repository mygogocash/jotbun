// A synthetic Auth0-like issuer for tests: a loopback JWKS endpoint plus RS256
// signing with its keys. Never a real tenant and never real tokens.
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { JWK, JWTPayload } from 'jose';

export const TEST_AUDIENCE = 'https://api.gogospend.test';
export const TEST_CLIENT_ID = 'native-client-test';

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

export type JwksFixture = {
  issuer: string;
  /** Requests the JWKS endpoint has served. */
  readonly requests: number;
  /** 'ok' serves keys; 'down' returns 503; 'hang' never answers; 'malformed' serves a non-JWKS body. */
  mode: 'ok' | 'down' | 'hang' | 'malformed';
  /** Signs with the published key unless another key/kid is given. */
  sign(claims: JWTPayload, options?: { kid?: string; key?: KeyPair['privateKey']; alg?: string; header?: Record<string, unknown> }): Promise<string>;
  /** A valid API access token for TEST_AUDIENCE/TEST_CLIENT_ID, overridable per claim. */
  accessToken(overrides?: JWTPayload): Promise<string>;
  /** A key pair that is not published. */
  unpublishedKey(): Promise<KeyPair>;
  close(): Promise<void>;
};

export async function startJwksFixture(): Promise<JwksFixture> {
  const published = await generateKeyPair('RS256', { extractable: true });
  const publicJwk: JWK = { ...(await exportJWK(published.publicKey)), kid: 'test-key-1', alg: 'RS256', use: 'sig' };
  let requests = 0;
  const fixture = { mode: 'ok' as JwksFixture['mode'] };
  const server: Server = createServer((req, res) => {
    if (req.url !== '/.well-known/jwks.json') {
      res.writeHead(404).end();
      return;
    }
    requests += 1;
    if (fixture.mode === 'hang') return;
    if (fixture.mode === 'down') {
      res.writeHead(503).end();
      return;
    }
    if (fixture.mode === 'malformed') {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"keys":"not-a-list"}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

  async function sign(claims: JWTPayload, options: Parameters<JwksFixture['sign']>[1] = {}): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: options.alg ?? 'RS256', kid: options.kid ?? 'test-key-1', typ: 'JWT', ...options.header })
      .sign(options.key ?? published.privateKey);
  }

  return {
    issuer,
    get requests() {
      return requests;
    },
    get mode() {
      return fixture.mode;
    },
    set mode(next) {
      fixture.mode = next;
    },
    sign,
    accessToken(overrides = {}) {
      const now = Math.floor(Date.now() / 1000);
      return sign({
        iss: issuer,
        sub: 'auth0|test-user',
        aud: [TEST_AUDIENCE, `${issuer}userinfo`],
        azp: TEST_CLIENT_ID,
        scope: 'openid profile email offline_access',
        iat: now,
        exp: now + 300,
        ...overrides,
      });
    },
    unpublishedKey: () => generateKeyPair('RS256', { extractable: true }),
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
