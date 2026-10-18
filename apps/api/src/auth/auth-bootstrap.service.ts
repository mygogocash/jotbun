import { randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { ApiIdentity, BootstrapResult } from '@gogospend/contracts';
import type { Pool } from 'pg';

import { ProblemException } from '../common/api-problem.filter';
import { PG_POOL } from '../database/database.service';
import { AUTH0_PROFILE_GATEWAY, ProfileUnavailableError } from './auth0-profile.client';
import type { Auth0ProfileGateway, TrustedProfile } from './auth0-profile.client';
import { sha256 } from './oidc-proof-verifier';
import type { VerifiedOidcProof } from './oidc-proof-verifier';

/**
 * Creates (first sign-in) or renews an application binding from a verified,
 * nonce-bound proof. The trusted Auth0 profile is checked first; an outage
 * fails closed before the challenge is consumed, so the same challenge can
 * be retried. `gogospend_bootstrap` then serializes on the principal,
 * consumes the challenge, creates the account once and issues the session,
 * all in one transaction.
 *
 * The 32-byte binding is returned once and only its digest is stored. If
 * that response is lost, a retry with the same challenge gets CHALLENGE_USED
 * and must start a fresh challenge; the undisclosed binding expires unused
 * after 5 minutes.
 */
@Injectable()
export class AuthBootstrapService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AUTH0_PROFILE_GATEWAY) private readonly profiles: Auth0ProfileGateway,
  ) {}

  async bootstrap(identity: ApiIdentity, proof: VerifiedOidcProof): Promise<BootstrapResult> {
    if (proof.issuer !== identity.issuer || proof.subject !== identity.subject || proof.clientId !== identity.clientId) {
      throw new ProblemException(401, 'PROOF_INVALID');
    }
    // Read-only pre-check so invented or spent challenges never reach the
    // Auth0 Management API; the bootstrap routine re-checks under lock.
    const { rows: check } = await this.pool.query<{ state: string }>(
      'SELECT gogospend_check_challenge($1, $2, $3, $4, $5, $6) AS state',
      [identity.issuer, identity.subject, identity.clientId, proof.challengeId, proof.nonceDigest, 'bootstrap'],
    );
    if (check[0]?.state === 'used') throw new ProblemException(409, 'CHALLENGE_USED');
    if (check[0]?.state !== 'open') throw new ProblemException(401, 'PROOF_INVALID');
    let profile: TrustedProfile;
    try {
      profile = await this.profiles.getTrustedProfile(identity);
    } catch (error) {
      if (error instanceof ProfileUnavailableError) throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 });
      throw error;
    }
    if (profile.subject !== identity.subject || profile.blocked) throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE');
    if (!profile.emailVerified) throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE', { messageKey: 'errors.email_unverified' });

    const binding = randomBytes(32).toString('base64url');
    const { rows } = await this.pool.query<{ outcome: string; account_id: string | null; session_generation: number | null }>(
      'SELECT outcome, account_id, session_generation FROM gogospend_bootstrap($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [identity.issuer, identity.subject, identity.clientId, proof.challengeId, proof.nonceDigest, proof.authTime, randomUUID(), randomUUID(), sha256(binding)],
    );
    const result = rows[0];
    switch (result?.outcome) {
      case 'created':
      case 'renewed':
        return { account_id: result.account_id as string, binding, session_generation: result.session_generation as number };
      case 'challenge_used':
        throw new ProblemException(409, 'CHALLENGE_USED');
      case 'reauth_required':
        throw new ProblemException(401, 'REAUTH_REQUIRED');
      case 'blocked':
      case 'account_unavailable':
        throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE');
      default:
        throw new ProblemException(401, 'PROOF_INVALID');
    }
  }
}
