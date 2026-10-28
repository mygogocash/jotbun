import { CLOCK_TOLERANCE_SECONDS } from '@api/auth/auth0-token-verifier'
import { ProblemException } from '@api/common/api-problem.filter'

import type { VaultClaims } from './protocol'

/** How recently the member signed in, in seconds. The API's proof window is five minutes. */
export const FRESH_SIGN_IN_SECONDS = 300

/**
 * A fresh sign-in is `auth_time` within the last 300 seconds, plus the API's
 * 30-second clock tolerance into the future. A missing, older or further-future
 * sign-in is 401 REAUTH_REQUIRED.
 */
export function assertFreshSignIn(claims: Pick<VaultClaims, 'authTime'>, nowSeconds: number): void {
  const authTime = claims.authTime
  if (authTime === undefined || authTime < nowSeconds - FRESH_SIGN_IN_SECONDS || authTime > nowSeconds + CLOCK_TOLERANCE_SECONDS) {
    throw new ProblemException(401, 'REAUTH_REQUIRED')
  }
}
