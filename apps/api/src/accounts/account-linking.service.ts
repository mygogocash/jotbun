import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { ApiIdentity, LinkIdentityResult, SessionContext } from '@gogospend/contracts';

import { assertPolicyAccepted } from '../auth/application-session.guard';
import { AUTH0_PROFILE_GATEWAY, ProfileUnavailableError } from '../auth/auth0-profile.client';
import type { Auth0ProfileGateway, TrustedProfile } from '../auth/auth0-profile.client';
import { OidcProofVerifier, ProofVerificationError } from '../auth/oidc-proof-verifier';
import { ProblemException } from '../common/api-problem.filter';
import { DatabaseService } from '../database/database.service';
import { lockAccount } from '../database/owner-transaction';
import { PolicyService } from '../policies/policy.service';
import { assertActiveSession } from './active-session';

export type LinkInput = { proofId: string; commandId: string; secondaryChallengeId: string; secondaryIdToken: string };

type Linked = 'linked' | 'proof_invalid' | 'secondary_invalid' | 'unavailable' | 'conflict' | 'not_an_alias';

function refuse(outcome: Exclude<Linked, 'linked'>): ProblemException {
  switch (outcome) {
    case 'conflict': return new ProblemException(409, 'ACCOUNT_LINK_CONFLICT');
    case 'unavailable': return new ProblemException(403, 'ACCOUNT_UNAVAILABLE');
    case 'secondary_invalid': return new ProblemException(401, 'PROOF_INVALID');
    default: return new ProblemException(401, 'REAUTH_REQUIRED');
  }
}

/**
 * F6c: explicit account linking. Both identities prove a fresh login for the
 * same command: the signed-in one with a `link` proof, the other with an ID
 * token answering a second `link` challenge of this account. The other
 * identity must also pass what its own sign-in would: Auth0 reports it
 * unblocked with a verified email, and its login postdates every credential
 * change recorded for it.
 *
 * The database then decides everything in one transaction under the account
 * lock (and the current policy): both proofs are consumed, the other
 * identity becomes an alias of this account (its own empty account is folded
 * in; one holding data is refused with 409), every binding ends with F6a's
 * hold and refresh-grant revocation, and merging the two Auth0 users is
 * queued for the security worker. Nothing irreversible happens at Auth0
 * before that commit; until the merge runs, either login reaches this account
 * through its alias.
 */
@Injectable()
export class AccountLinkingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly proofs: OidcProofVerifier,
    @Inject(AUTH0_PROFILE_GATEWAY) private readonly profiles: Auth0ProfileGateway,
    private readonly policies: PolicyService,
  ) {}

  async link(ctx: SessionContext, identity: ApiIdentity, input: LinkInput): Promise<LinkIdentityResult> {
    let secondary;
    try {
      secondary = await this.proofs.verifyLinkedIdentity(identity.clientId, input.secondaryChallengeId, input.secondaryIdToken);
    } catch (error) {
      if (error instanceof ProofVerificationError) {
        throw error.reason === 'unavailable' ? new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 }) : new ProblemException(401, 'PROOF_INVALID');
      }
      throw error;
    }
    if (secondary.subject === identity.subject && secondary.issuer === identity.issuer) {
      throw new ProblemException(422, 'VALIDATION_FAILED', { fields: { secondary_id_token: 'same_identity' } });
    }
    let profile: TrustedProfile;
    try {
      profile = await this.profiles.getTrustedProfile({ issuer: secondary.issuer, subject: secondary.subject, clientId: secondary.clientId, scopes: [] });
    } catch (error) {
      if (error instanceof ProfileUnavailableError) throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 });
      throw error;
    }
    // The same rule as a sign-in: an unverified or blocked identity is never linked.
    if (profile.subject !== secondary.subject || profile.blocked) throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE');
    if (!profile.emailVerified) throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE', { messageKey: 'errors.email_unverified' });

    return this.db.withOwnerTransaction(ctx, async (tx) => {
      const state = await lockAccount(tx, ctx.accountId);
      await assertActiveSession(tx, ctx, state);
      // Linking is not a privacy operation: it needs the current policy accepted.
      assertPolicyAccepted(await this.policies.stateIn(tx));
      const [row] = await tx.query<{ outcome: Linked; session_generation: number | null }>(
        'SELECT outcome, session_generation FROM gogospend_link_identity($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
        [input.proofId, input.commandId, identity.issuer, identity.subject, input.secondaryChallengeId, secondary.issuer, secondary.subject, secondary.clientId, secondary.nonceDigest, secondary.authTime, randomUUID(), randomUUID()],
      );
      if (row.outcome !== 'linked') throw refuse(row.outcome);
      return { generation: row.session_generation as number, provider_cleanup: 'pending' as const, provider_link: 'pending' as const };
    });
  }
}
