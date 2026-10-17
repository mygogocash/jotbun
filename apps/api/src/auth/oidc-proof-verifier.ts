import { createHash } from 'node:crypto';

import type { ApiIdentity } from '@gogospend/contracts';
import { decodeJwt, jwtVerify } from 'jose';

import { Auth0KeySource } from './auth0-key-source';
import { CLOCK_TOLERANCE_SECONDS, MAX_TOKEN_LENGTH } from './auth0-token-verifier';

// With max_age=0 the user has just signed in, so the ID token must be new.
const MAX_ID_TOKEN_AGE_SECONDS = 5 * 60;
const MAX_NONCE_LENGTH = 256;

const ISSUE = Symbol('issue');

/**
 * A nonce-bound ID token verified for one challenge. Only
 * OidcProofVerifier.verifyChallenge can create one; clients cannot.
 */
export class VerifiedOidcProof {
  private constructor(
    readonly challengeId: string,
    readonly issuer: string,
    readonly subject: string,
    readonly clientId: string,
    readonly nonceDigest: Buffer,
    readonly authTime: Date,
  ) {}

  static [ISSUE](challengeId: string, identity: ApiIdentity, nonceDigest: Buffer, authTime: Date): VerifiedOidcProof {
    return new VerifiedOidcProof(challengeId, identity.issuer, identity.subject, identity.clientId, nonceDigest, authTime);
  }
}

export class ProofVerificationError extends Error {
  readonly reason: 'invalid' | 'unavailable';

  constructor(reason: 'invalid' | 'unavailable') {
    super(reason === 'invalid' ? 'ID token proof rejected.' : 'ID token verification is unavailable.');
    this.name = 'ProofVerificationError';
    this.reason = reason;
  }
}

export const sha256 = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/**
 * Verifies the ID token returned by a challenge's re-authorization:
 * - RS256 from the pinned issuer's JWKS;
 * - audience is exactly the requesting native client (never the API
 *   audience), and `azp`, if present, names that client;
 * - same subject as the verified access token;
 * - issued within 5 minutes, with `auth_time` not in the future;
 * - carries a `nonce`.
 * The nonce is compared by digest with the challenge in SQL, which also
 * checks `auth_time` against the challenge and the account's `reauth_after`.
 * This is the only place an ID token is accepted.
 */
export class OidcProofVerifier {
  constructor(private readonly issuer: string, private readonly keys: Auth0KeySource) {}

  async verifyChallenge(identity: ApiIdentity, challengeId: string, idToken: string): Promise<VerifiedOidcProof> {
    if (typeof idToken !== 'string' || idToken.length === 0 || idToken.length > MAX_TOKEN_LENGTH || idToken.split('.').length !== 3) {
      throw new ProofVerificationError('invalid');
    }
    if (this.keys.isBackingOff()) throw new ProofVerificationError('unavailable');
    let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'];
    try {
      ({ payload } = await jwtVerify(idToken, this.keys.getKey, {
        issuer: this.issuer,
        audience: identity.clientId,
        subject: identity.subject,
        algorithms: ['RS256'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        maxTokenAge: MAX_ID_TOKEN_AGE_SECONDS,
        requiredClaims: ['sub', 'exp', 'iat', 'nonce', 'auth_time'],
      }));
    } catch (error) {
      throw new ProofVerificationError(this.keys.isUnavailable(error) ? 'unavailable' : 'invalid');
    }
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const authTime = payload.auth_time;
    const nonce = payload.nonce;
    if (
      (payload.azp !== undefined && payload.azp !== identity.clientId) ||
      (audiences.length > 1 && payload.azp !== identity.clientId) ||
      typeof nonce !== 'string' ||
      nonce.length === 0 ||
      nonce.length > MAX_NONCE_LENGTH ||
      typeof authTime !== 'number' ||
      !Number.isFinite(authTime) ||
      authTime > Math.floor(Date.now() / 1000) + CLOCK_TOLERANCE_SECONDS
    ) {
      throw new ProofVerificationError('invalid');
    }
    return VerifiedOidcProof[ISSUE](challengeId, identity, sha256(nonce), new Date(authTime * 1000));
  }

  /**
   * F6c: the other identity's fresh login for account linking. The same
   * checks as a challenge proof, except that the subject is whoever signed
   * in (it is the identity being linked); the nonce must belong to a `link`
   * challenge issued to the signed-in account, which SQL checks.
   */
  async verifyLinkedIdentity(clientId: string, challengeId: string, idToken: string): Promise<VerifiedOidcProof> {
    if (typeof idToken !== 'string' || idToken.length === 0 || idToken.length > MAX_TOKEN_LENGTH || idToken.split('.').length !== 3) {
      throw new ProofVerificationError('invalid');
    }
    let subject: unknown;
    try {
      // Only to learn whom to verify for; verifyChallenge checks the signature and every claim.
      subject = decodeJwt(idToken).sub;
    } catch {
      throw new ProofVerificationError('invalid');
    }
    if (typeof subject !== 'string' || subject.length === 0 || subject.length > 255) throw new ProofVerificationError('invalid');
    return this.verifyChallenge({ issuer: this.issuer, subject, clientId, scopes: [] }, challengeId, idToken);
  }
}
