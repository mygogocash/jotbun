import { createRemoteJWKSet, errors } from 'jose';
import type { JWTVerifyGetKey } from 'jose';

export type JwksOptions = { timeoutMs?: number; cooldownMs?: number; cacheMaxAgeMs?: number };

// After a key-source failure, report `unavailable` without refetching.
const KEY_SOURCE_BACKOFF_MS = 5_000;

/**
 * The pinned issuer's JWKS, shared by access-token and ID-token verification.
 * Unknown key ids refetch at most once per cooldown; while the endpoint is
 * failing, callers are told it is unavailable without a fetch per request.
 */
export class Auth0KeySource {
  readonly getKey: JWTVerifyGetKey;
  private downUntil = 0;

  constructor(issuer: string, options: JwksOptions = {}) {
    this.getKey = createRemoteJWKSet(new URL('.well-known/jwks.json', issuer), {
      timeoutDuration: options.timeoutMs ?? 5_000,
      cooldownDuration: options.cooldownMs ?? 30_000,
      cacheMaxAge: options.cacheMaxAgeMs ?? 10 * 60_000,
    });
  }

  /** True while a recent key-source failure is being backed off. */
  isBackingOff(): boolean {
    return Date.now() < this.downUntil;
  }

  /** Classifies a verification error; starts the back-off for key-source failures. */
  isUnavailable(error: unknown): boolean {
    const failure =
      error instanceof errors.JWKSTimeout ||
      error instanceof errors.JWKSInvalid ||
      // fetch() reports network failures as TypeError; token parsing never reaches it.
      error instanceof TypeError ||
      // Non-200 or unparseable JWKS responses are plain JOSEErrors.
      (error instanceof errors.JOSEError && error.constructor === errors.JOSEError);
    if (failure) this.downUntil = Date.now() + KEY_SOURCE_BACKOFF_MS;
    return failure;
  }
}
