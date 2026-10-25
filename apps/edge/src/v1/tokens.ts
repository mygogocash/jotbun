import { createRemoteJWKSet, errors, jwtVerify } from 'jose'
import type { JWTPayload, JWTVerifyGetKey } from 'jose'

import { CLOCK_TOLERANCE_SECONDS, MAX_TOKEN_LENGTH } from '@api/auth/auth0-token-verifier'
import { ProblemException } from '@api/common/api-problem.filter'
import { ConfigurationError } from '@api/common/configuration-error'
import { isUuid } from '@gogospend/contracts'

import type { V1Env } from './env'
import { MAX_TOKEN_LIFETIME_SECONDS } from './protocol'
import type { VaultClaims } from './protocol'

export type TokenVerifier = {
  verify(authorization: string | undefined, clientId: string): Promise<VaultClaims>
}

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/

/**
 * Verifies `Authorization: Bearer <access token>` (§6.4). The signature is
 * checked against the JWKS, with EdDSA or RS256 only, and the issuer, audience
 * and required claims must hold. jose also checks the clock with the API's
 * 30-second tolerance: `iat` may not lie further ahead than that, and a token
 * may be at most its lifetime plus that tolerance old (`maxTokenAge` is what
 * checks `iat`). Then `exp` must come after `iat`, the lifetime is at most 900
 * seconds, `sub` is the account (a UUID) and `sid` is the session (a UUID).
 *
 * A failing key source answers 503 with a retry. Any other bad token, including
 * a claim jose rejects, is 401, the same split the API's Auth0AccessTokenGuard makes.
 */
export function createTokenVerifier(o: { issuer: string; audience: string; keys: JWTVerifyGetKey; maxLifetimeSeconds?: number }): TokenVerifier {
  const lifetime = o.maxLifetimeSeconds ?? MAX_TOKEN_LIFETIME_SECONDS
  return {
    async verify(authorization, clientId) {
      const match = typeof authorization === 'string' ? BEARER.exec(authorization) : null
      if (!match || match[1].length > MAX_TOKEN_LENGTH) throw new ProblemException(401, 'UNAUTHENTICATED')
      let verified: { payload: JWTPayload }
      try {
        verified = await jwtVerify(match[1], o.keys, {
          issuer: o.issuer,
          audience: o.audience,
          algorithms: ['EdDSA', 'RS256'],
          clockTolerance: CLOCK_TOLERANCE_SECONDS,
          maxTokenAge: lifetime + CLOCK_TOLERANCE_SECONDS,
          requiredClaims: ['sub', 'iat', 'exp'],
        })
      } catch (error) {
        if (isKeySourceFailure(error)) throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 })
        throw new ProblemException(401, 'UNAUTHENTICATED')
      }
      const { sub, sid, iat, exp } = verified.payload
      if (typeof sub !== 'string' || !isUuid(sub) || typeof iat !== 'number' || typeof exp !== 'number' || exp <= iat || exp - iat > lifetime) {
        throw new ProblemException(401, 'UNAUTHENTICATED')
      }
      if (typeof sid !== 'string' || !isUuid(sid)) throw new ProblemException(401, 'SESSION_REQUIRED')
      return { accountId: sub, sessionId: sid, issuedAt: iat, clientId }
    },
  }
}

/**
 * The same classification as the API's Auth0KeySource: a fetch that could not
 * reach the key set, a key set that timed out or was invalid, and jose's plain
 * JOSEError from a non-200 or unparseable response. A bad token is none of these.
 */
function isKeySourceFailure(error: unknown): boolean {
  return (
    error instanceof errors.JWKSTimeout ||
    error instanceof errors.JWKSInvalid ||
    error instanceof TypeError ||
    (error instanceof errors.JOSEError && error.constructor === errors.JOSEError)
  )
}

/**
 * The verifier for this Worker's settings. AUTH_JWKS_URL must be https, except
 * over plain http for a local or test environment. A missing or invalid setting
 * throws, and the caller answers 503.
 */
export function tokenVerifierFromEnv(env: V1Env): TokenVerifier {
  const issuer = env.AUTH_ISSUER ?? ''
  const audience = env.AUTH_AUDIENCE ?? ''
  const jwks = env.AUTH_JWKS_URL ?? ''
  if (!issuer || !audience || !jwks) throw new ConfigurationError('AUTH_ISSUER, AUTH_AUDIENCE and AUTH_JWKS_URL must be set.')
  const url = new URL(jwks)
  const local = env.JOTBUN_ENV === 'local' || env.JOTBUN_ENV === 'test'
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new ConfigurationError('AUTH_JWKS_URL must be an https URL.')
  return createTokenVerifier({ issuer, audience, keys: createRemoteJWKSet(url) })
}
