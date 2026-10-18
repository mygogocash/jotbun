import { Body, Controller, Get, Header, Headers, HttpCode, Post } from '@nestjs/common';
import { ContractValidationError, V1_HEADERS, assertKnownFields, isUuid } from '@gogospend/contracts';
import type { ApiIdentity, AuthChallenge, BootstrapResult, GlobalLogoutResult, LinkIdentityResult, MeDto, ProofResult, SessionContext } from '@gogospend/contracts';

import { AccountLifecycleService } from '../accounts/account-lifecycle.service';
import { AccountLinkingService } from '../accounts/account-linking.service';
import { SessionRevocationService } from '../accounts/session-revocation.service';
import { ProblemException } from '../common/api-problem.filter';
import { AuthBootstrapService } from './auth-bootstrap.service';
import { Access } from './auth-route.decorator';
import { MAX_TOKEN_LENGTH } from './auth0-token-verifier';
import { OidcProofVerifier, ProofVerificationError } from './oidc-proof-verifier';
import type { VerifiedOidcProof } from './oidc-proof-verifier';
import { ReauthenticationService } from './reauthentication.service';
import { CurrentIdentity, CurrentSession } from './request-context';

@Controller('v1')
export class AuthController {
  constructor(
    private readonly reauth: ReauthenticationService,
    private readonly proofs: OidcProofVerifier,
    private readonly bootstrapper: AuthBootstrapService,
    private readonly accounts: AccountLifecycleService,
    private readonly sessions: SessionRevocationService,
    private readonly linking: AccountLinkingService,
  ) {}

  /** Token-only: needs a verified access token and rate budget; returns no financial data. */
  @Post('auth/challenges')
  @Access('token_only')
  @Header('Cache-Control', 'no-store')
  challenge(@CurrentIdentity() identity: ApiIdentity, @Body() body: unknown): Promise<AuthChallenge> {
    const input = assertKnownFields(body, ['request_id', 'purpose', 'command_id']);
    return this.reauth.issueChallenge(identity, {
      requestId: input.request_id as string,
      purpose: input.purpose as string,
      commandId: input.command_id as string,
    });
  }

  /** The only place (with /auth/proofs) an ID token is accepted, as proof for one challenge. */
  @Post('auth/bootstrap')
  @Access('token_only')
  @Header('Cache-Control', 'no-store')
  async bootstrap(@CurrentIdentity() identity: ApiIdentity, @Body() body: unknown): Promise<BootstrapResult> {
    return this.bootstrapper.bootstrap(identity, await this.verify(identity, body));
  }

  @Post('auth/proofs')
  @Access('token_only')
  @Header('Cache-Control', 'no-store')
  async prove(@CurrentIdentity() identity: ApiIdentity, @Body() body: unknown): Promise<ProofResult> {
    return this.reauth.prove(await this.verify(identity, body));
  }

  @Get('me')
  @Access('bound_session')
  me(@CurrentSession() session: SessionContext): Promise<MeDto> {
    return this.accounts.describe(session);
  }

  /** Signs this device out (its binding only). */
  @Post('me/logout')
  @Access('bound_session')
  @HttpCode(204)
  async logout(@CurrentSession() session: SessionContext): Promise<void> {
    await this.sessions.revokeCurrent(session);
  }

  /** Links a second sign-in method (F6c); needs fresh logins of both identities for this Idempotency-Key. */
  @Post('me/identities')
  @Access('recent_proof')
  @HttpCode(202)
  linkIdentity(
    @CurrentSession() session: SessionContext,
    @CurrentIdentity() identity: ApiIdentity,
    @Headers(V1_HEADERS.idempotencyKey) commandId: string | undefined,
    @Body() body: unknown,
  ): Promise<LinkIdentityResult> {
    const input = assertKnownFields(body, ['proof_id', 'secondary_challenge_id', 'secondary_id_token']);
    if (!isUuid(commandId)) throw new ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency_key');
    if (!isUuid(input.proof_id)) throw new ContractValidationError('VALIDATION_FAILED', 'proof_id must be a UUID.', 'proof_id');
    if (!isUuid(input.secondary_challenge_id)) throw new ContractValidationError('VALIDATION_FAILED', 'secondary_challenge_id must be a UUID.', 'secondary_challenge_id');
    if (typeof input.secondary_id_token !== 'string' || input.secondary_id_token.length === 0 || input.secondary_id_token.length > MAX_TOKEN_LENGTH) {
      throw new ContractValidationError('VALIDATION_FAILED', 'secondary_id_token must be a token.', 'secondary_id_token');
    }
    return this.linking.link(session, identity, { proofId: input.proof_id, commandId, secondaryChallengeId: input.secondary_challenge_id, secondaryIdToken: input.secondary_id_token });
  }

  /** Signs out everywhere; needs a fresh global_logout proof bound to this Idempotency-Key. */
  @Post('me/global-logout')
  @Access('recent_proof')
  @HttpCode(202)
  globalLogout(
    @CurrentSession() session: SessionContext,
    @Headers(V1_HEADERS.idempotencyKey) commandId: string | undefined,
    @Body() body: unknown,
  ): Promise<GlobalLogoutResult> {
    const input = assertKnownFields(body, ['proof_id']);
    if (!isUuid(commandId)) throw new ContractValidationError('VALIDATION_FAILED', 'Idempotency-Key must be a UUID.', 'idempotency_key');
    if (!isUuid(input.proof_id)) throw new ContractValidationError('VALIDATION_FAILED', 'proof_id must be a UUID.', 'proof_id');
    return this.sessions.revokeAll(session, input.proof_id, commandId);
  }

  private async verify(identity: ApiIdentity, body: unknown): Promise<VerifiedOidcProof> {
    const input = assertKnownFields(body, ['challenge_id', 'id_token']);
    if (!isUuid(input.challenge_id)) throw new ContractValidationError('VALIDATION_FAILED', 'challenge_id must be a UUID.', 'challenge_id');
    if (typeof input.id_token !== 'string' || input.id_token.length === 0 || input.id_token.length > MAX_TOKEN_LENGTH) {
      throw new ContractValidationError('VALIDATION_FAILED', 'id_token is missing or too long.', 'id_token');
    }
    try {
      return await this.proofs.verifyChallenge(identity, input.challenge_id, input.id_token);
    } catch (error) {
      if (error instanceof ProofVerificationError && error.reason === 'unavailable') {
        throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 });
      }
      throw new ProblemException(401, 'PROOF_INVALID');
    }
  }
}
