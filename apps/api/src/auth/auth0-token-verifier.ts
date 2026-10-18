import type { ApiIdentity } from '@gogospend/contracts';
import { jwtVerify } from 'jose';

import { isLoopbackHost } from '../database/database-config';
import { Auth0KeySource } from './auth0-key-source';
import type { JwksOptions } from './auth0-key-source';
import { ConfigurationError } from '../common/configuration-error';

export type Auth0Config = {
  issuer: string;
  audience: string;
  allowedClientIds: readonly string[];
};

export class TokenVerificationError extends Error {
  readonly reason: 'invalid' | 'unavailable';

  constructor(reason: 'invalid' | 'unavailable') {
    super(reason === 'invalid' ? 'Access token rejected.' : 'Token verification is unavailable.');
    this.name = 'TokenVerificationError';
    this.reason = reason;
  }
}

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');

export interface TokenVerifier {
  verifyApiAccessToken(token: string): Promise<ApiIdentity>;
}

// Real Auth0 access tokens are a few KB at most.
export const MAX_TOKEN_LENGTH = 8192;
export const CLOCK_TOLERANCE_SECONDS = 30;
// The tenant target is 5 minutes; anything over 15 minutes is a
// misconfiguration and would weaken how quickly a blocked user loses access.
const MAX_TOKEN_LIFETIME_SECONDS = 15 * 60;

/**
 * Verifies Auth0 API access tokens: RS256 only, signature from the pinned
 * issuer's JWKS, exact issuer, the API audience, an allowed native client,
 * a subject and expiry. ID tokens (client audience, or carrying a nonce) and
 * opaque tokens are never API credentials. A JWKS outage is reported as
 * `unavailable`, so it fails closed without looking like a bad token.
 */
export class Auth0TokenVerifier implements TokenVerifier {
  private readonly keys: Auth0KeySource;

  constructor(private readonly config: Auth0Config, keys: Auth0KeySource | JwksOptions = {}) {
    this.keys = keys instanceof Auth0KeySource ? keys : new Auth0KeySource(config.issuer, keys);
  }

  async verifyApiAccessToken(token: string): Promise<ApiIdentity> {
    if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH || token.split('.').length !== 3) {
      throw new TokenVerificationError('invalid');
    }
    if (this.keys.isBackingOff()) throw new TokenVerificationError('unavailable');
    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      ({ payload } = await jwtVerify(token, this.keys.getKey, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['RS256'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        maxTokenAge: MAX_TOKEN_LIFETIME_SECONDS + CLOCK_TOLERANCE_SECONDS,
        requiredClaims: ['sub', 'exp', 'iat'],
      }));
    } catch (error) {
      throw new TokenVerificationError(this.keys.isUnavailable(error) ? 'unavailable' : 'invalid');
    }
    // azp wins when present; client_id (RFC 9068) is used only when azp is absent.
    const clientId = payload.azp === undefined ? payload.client_id : payload.azp;
    const subject = payload.sub;
    const now = Math.floor(Date.now() / 1000);
    const issuedAt = payload.iat as number;
    const expiresAt = payload.exp as number;
    if (
      typeof clientId !== 'string' ||
      !this.config.allowedClientIds.includes(clientId) ||
      typeof subject !== 'string' ||
      subject.length === 0 ||
      subject.length > 255 ||
      // Machine-to-machine tokens are never a user's API credential.
      payload.gty === 'client-credentials' ||
      subject.endsWith('@clients') ||
      // ID tokens are proof for one challenge (F4), never API authorization.
      'nonce' in payload ||
      issuedAt > now + CLOCK_TOLERANCE_SECONDS ||
      expiresAt - issuedAt > MAX_TOKEN_LIFETIME_SECONDS
    ) {
      throw new TokenVerificationError('invalid');
    }
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : [];
    return { issuer: this.config.issuer, subject, clientId, scopes };
  }
}

/**
 * AUTH0_ISSUER (https, trailing slash), AUTH0_AUDIENCE and
 * AUTH0_ALLOWED_CLIENT_IDS (comma-separated). A plain-http loopback issuer is
 * accepted only outside production, for the synthetic test issuer.
 */
export function auth0ConfigFromEnv(env: NodeJS.ProcessEnv): Auth0Config {
  const issuer = env.AUTH0_ISSUER ?? '';
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new ConfigurationError('AUTH0_ISSUER must be an absolute URL.');
  }
  const loopbackTest = url.protocol === 'http:' && isLoopbackHost(url.hostname) && env.NODE_ENV !== 'production';
  if ((url.protocol !== 'https:' && !loopbackTest) || !issuer.endsWith('/') || url.search || url.hash) {
    throw new ConfigurationError('AUTH0_ISSUER must be an https URL ending in "/".');
  }
  const audience = (env.AUTH0_AUDIENCE ?? '').trim();
  if (!audience) throw new ConfigurationError('AUTH0_AUDIENCE is not configured.');
  const allowedClientIds = (env.AUTH0_ALLOWED_CLIENT_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean);
  if (allowedClientIds.length === 0) throw new ConfigurationError('AUTH0_ALLOWED_CLIENT_IDS is not configured.');
  return { issuer, audience, allowedClientIds };
}
