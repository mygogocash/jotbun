import { randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ContractValidationError, REAUTH_PURPOSES, isUuid } from '@gogospend/contracts';
import type { ApiIdentity, AuthChallenge, ProofResult, ReauthPurpose, SessionContext } from '@gogospend/contracts';
import type { Pool } from 'pg';

import { ProblemException } from '../common/api-problem.filter';
import { PG_POOL } from '../database/database.service';
import type { OwnerTx } from '../database/owner-transaction';
import { sha256 } from './oidc-proof-verifier';
import type { VerifiedOidcProof } from './oidc-proof-verifier';

export type ChallengeInput = { requestId: string; purpose: string; commandId: string };

/**
 * One-use OIDC challenges, provisional until the F4 native spike: the server
 * issues a 5-minute challenge bound to the principal, client, purpose and
 * command; the client re-authorizes with its nonce and `max_age=0`. Only a
 * digest of the nonce is stored.
 */
@Injectable()
export class ReauthenticationService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async issueChallenge(identity: ApiIdentity, input: ChallengeInput): Promise<AuthChallenge> {
    if (!isUuid(input.requestId)) throw new ContractValidationError('VALIDATION_FAILED', 'request_id must be a UUID.', 'request_id');
    if (!isUuid(input.commandId)) throw new ContractValidationError('VALIDATION_FAILED', 'command_id must be a UUID.', 'command_id');
    if (!REAUTH_PURPOSES.includes(input.purpose as ReauthPurpose)) {
      throw new ContractValidationError('VALIDATION_FAILED', 'Unknown purpose.', 'purpose');
    }
    const challengeId = randomUUID();
    const nonce = randomBytes(32).toString('base64url');
    const { rows } = await this.pool.query<{ outcome: string; expires_at: Date }>(
      'SELECT outcome, expires_at FROM gogospend_issue_challenge($1, $2, $3, $4, $5, $6, $7, $8)',
      [challengeId, identity.issuer, identity.subject, identity.clientId, input.purpose, input.commandId, input.requestId, sha256(nonce)],
    );
    const result = rows[0];
    if (result?.outcome === 'issued') return { challenge_id: challengeId, nonce, expires_at: result.expires_at.toISOString() };
    if (result?.outcome === 'too_many') throw new ProblemException(429, 'RATE_LIMITED', { retryAfterSeconds: 60 });
    throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE');
  }

  /** Completes a non-bootstrap challenge; its command then consumes it with authorizePurpose. */
  async prove(proof: VerifiedOidcProof): Promise<ProofResult> {
    const { rows } = await this.pool.query<{ outcome: string; expires_at: Date }>(
      'SELECT outcome, expires_at FROM gogospend_prove_challenge($1, $2, $3, $4, $5, $6)',
      [proof.issuer, proof.subject, proof.clientId, proof.challengeId, proof.nonceDigest, proof.authTime],
    );
    const result = rows[0];
    switch (result?.outcome) {
      case 'proven':
        return { proof_id: proof.challengeId, expires_at: result.expires_at.toISOString() };
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

/**
 * Consumes a fresh (≤5 minutes) proof for this account, purpose and command
 * inside the command's owner transaction, after the caller has taken the
 * account lock. The proof must postdate any global logout (`reauth_after`).
 * A missing, stale, reused or mismatched proof is REAUTH_REQUIRED.
 */
export async function authorizePurpose(tx: OwnerTx, ctx: SessionContext, proofId: string, commandId: string, purpose: ReauthPurpose): Promise<void> {
  if (!isUuid(proofId) || !isUuid(commandId) || ctx.accountId !== tx.accountId) throw new ProblemException(401, 'REAUTH_REQUIRED');
  // The app role cannot touch challenge rows; this SECURITY DEFINER routine
  // consumes the proof for the transaction's own account only.
  const [result] = await tx.query<{ consumed: boolean }>('SELECT gogospend_consume_proof($1, $2, $3) AS consumed', [proofId, purpose, commandId]);
  if (!result?.consumed) throw new ProblemException(401, 'REAUTH_REQUIRED');
}
