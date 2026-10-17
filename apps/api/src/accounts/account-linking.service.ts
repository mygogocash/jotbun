import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { ApiIdentity, LinkIdentityResult, SessionContext } from '@gogospend/contracts';

import { AUTH0_LINK_GATEWAY, LinkRefusedError, ProfileUnavailableError } from '../auth/auth0-profile.client';
import type { Auth0LinkGateway } from '../auth/auth0-profile.client';
import { OidcProofVerifier, ProofVerificationError } from '../auth/oidc-proof-verifier';
import { authorizePurpose } from '../auth/reauthentication.service';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import { lockAccount } from '../database/owner-transaction';
import { assertActiveSession } from './active-session';

export type LinkInput = { proofId: string; commandId: string; secondaryChallengeId: string; secondaryIdToken: string };

type Precheck = 'linkable' | 'already_linked' | 'conflict' | 'unavailable' | 'proof_invalid' | 'secondary_invalid' | 'same_identity';
type Linked = 'linked' | 'conflict' | 'unavailable' | 'secondary_invalid' | 'same_identity';

function refuse(outcome: Exclude<Precheck | Linked, 'linkable' | 'already_linked' | 'linked'>): ProblemException {
  switch (outcome) {
    case 'conflict': return new ProblemException(409, 'ACCOUNT_LINK_CONFLICT');
    case 'unavailable': return new ProblemException(403, 'ACCOUNT_UNAVAILABLE');
    case 'same_identity': return new ProblemException(422, 'VALIDATION_FAILED', { fields: { secondary_id_token: 'same_identity' } });
    default: return new ProblemException(401, 'REAUTH_REQUIRED');
  }
}

/**
 * F6c: explicit account linking. Both identities prove a fresh login for the
 * same command: the signed-in one with a `link` proof, the other with an ID
 * token answering a second `link` challenge of this account. Then:
 *   1. a read-only precheck (proofs, the other identity's account), so Auth0
 *      is never asked to link something the database would refuse;
 *   2. the link at Auth0 (idempotent). If the request dies here, logins of
 *      the other identity already come back as the primary - no second
 *      account appears - and a retry with fresh proofs completes step 3;
 *   3. one transaction under the account lock: both proofs are consumed, the
 *      other identity becomes an alias of this account (its own empty account
 *      is folded in; one holding data is refused with 409), and every
 *      binding ends with F6a's hold and refresh-grant revocation.
 */
@Injectable()
export class AccountLinkingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly proofs: OidcProofVerifier,
    @Inject(AUTH0_LINK_GATEWAY) private readonly auth0: Auth0LinkGateway,
  ) {}

  async link(ctx: SessionContext, identity: ApiIdentity, input: LinkInput): Promise<LinkIdentityResult> {
    let secondary;
    try {
      secondary = await this.proofs.verifyLinkedIdentity(identity.clientId, input.secondaryChallengeId, input.secondaryIdToken);
    } catch (error) {
      if (error instanceof ProofVerificationError) throw error.reason === 'unavailable' ? new ProblemException(503, 'SERVICE_UNAVAILABLE') : new ProblemException(401, 'REAUTH_REQUIRED');
      throw error;
    }
    if (secondary.subject === identity.subject && secondary.issuer === identity.issuer) throw refuse('same_identity');
    const args = [input.secondaryChallengeId, secondary.issuer, secondary.subject, secondary.clientId, secondary.nonceDigest, secondary.authTime] as const;
    const precheck = await this.db.withOwnerTransaction(ctx, async (tx) => {
      const [row] = await tx.query<{ outcome: Precheck }>('SELECT gogospend_link_precheck($1, $2, $3, $4, $5, $6, $7, $8) AS outcome', [input.proofId, input.commandId, ...args]);
      return row.outcome;
    });
    if (precheck !== 'linkable' && precheck !== 'already_linked') throw refuse(precheck);
    if (precheck === 'linkable') {
      try {
        await this.auth0.link(identity.subject, secondary.subject);
      } catch (error) {
        if (error instanceof ProfileUnavailableError) throw new ProblemException(503, 'SERVICE_UNAVAILABLE');
        if (error instanceof LinkRefusedError) throw new ProblemException(409, 'ACCOUNT_LINK_CONFLICT');
        throw error;
      }
    }
    return this.db.withOwnerTransaction(ctx, async (tx) => {
      const state = await lockAccount(tx, ctx.accountId);
      await assertActiveSession(tx, ctx, state);
      await authorizePurpose(tx, ctx, input.proofId, input.commandId, 'link');
      const [row] = await tx.query<{ outcome: Linked; session_generation: number | null }>(
        'SELECT outcome, session_generation FROM gogospend_link_identity($1, $2, $3, $4, $5, $6, $7, $8)',
        [input.commandId, ...args, randomUUID()],
      );
      if (row.outcome !== 'linked') throw refuse(row.outcome);
      return { generation: row.session_generation as number, provider_cleanup: 'pending' as const };
    });
  }
}
