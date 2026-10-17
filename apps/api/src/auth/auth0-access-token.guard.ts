import { Inject, Injectable } from '@nestjs/common';
import type { ApiIdentity } from '@gogospend/contracts';
import type { Request } from 'express';

import { ProblemException } from '../common/api-problem.filter';
import { TOKEN_VERIFIER, TokenVerificationError } from './auth0-token-verifier';
import type { TokenVerifier } from './auth0-token-verifier';

const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]+)$/;

/** Verifies `Authorization: Bearer <API access token>`; anything else is 401. */
@Injectable()
export class Auth0AccessTokenGuard {
  constructor(@Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier) {}

  async authenticate(req: Request): Promise<ApiIdentity> {
    const header = req.headers.authorization;
    const match = typeof header === 'string' ? BEARER.exec(header) : null;
    if (!match) throw new ProblemException(401, 'UNAUTHENTICATED');
    try {
      return await this.verifier.verifyApiAccessToken(match[1]);
    } catch (error) {
      if (error instanceof TokenVerificationError && error.reason === 'unavailable') {
        throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 });
      }
      throw new ProblemException(401, 'UNAUTHENTICATED');
    }
  }
}
