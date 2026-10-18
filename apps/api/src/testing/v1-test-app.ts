// A v1 app with the real access guard, problem filter, middleware and body
// parsing, but test doubles for the token verifier, session/policy ports and
// rate limiter. No database or provider is touched.
import { Module } from '@nestjs/common';
import type { Provider, Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { Auth0AccessTokenGuard } from '../auth/auth0-access-token.guard';
import { TOKEN_VERIFIER, TokenVerificationError } from '../auth/auth0-token-verifier';
import type { TokenVerifier } from '../auth/auth0-token-verifier';
import { ApplicationSessionGuard, NoPolicyGate, NoSessionResolver, POLICY_GATE, SESSION_RESOLVER } from '../auth/application-session.guard';
import type { PolicyGate, SessionResolver } from '../auth/application-session.guard';
import { V1AccessGuard } from '../auth/auth.module';
import { ApiProblemFilter } from '../common/api-problem.filter';
import { MIN_CLIENT_VERSIONS } from '../common/client-version.guard';
import type { MinimumClientVersions } from '../common/client-version.guard';
import { RATE_LIMITER } from '../common/shared-rate-limit';
import type { RateLimiter } from '../common/shared-rate-limit';
import { configureV1App } from '../v1/v1-app.module';

export type V1TestDoubles = {
  verifier?: TokenVerifier;
  resolver?: SessionResolver;
  policies?: PolicyGate;
  limiter?: RateLimiter;
  minimums?: MinimumClientVersions;
  /** Extra providers the controllers under test need. */
  providers?: Provider[];
};

const rejectAll: TokenVerifier = {
  async verifyApiAccessToken() {
    throw new TokenVerificationError('invalid');
  },
};
const allowAll: RateLimiter = { consume: async () => ({ allowed: true, retryAfterSeconds: 0 }) };

export async function createV1TestApp(controllers: Type[], doubles: V1TestDoubles = {}): Promise<NestExpressApplication> {
  @Module({
    controllers,
    providers: [
      { provide: TOKEN_VERIFIER, useValue: doubles.verifier ?? rejectAll },
      doubles.resolver ? { provide: SESSION_RESOLVER, useValue: doubles.resolver } : { provide: SESSION_RESOLVER, useClass: NoSessionResolver },
      doubles.policies ? { provide: POLICY_GATE, useValue: doubles.policies } : { provide: POLICY_GATE, useClass: NoPolicyGate },
      { provide: RATE_LIMITER, useValue: doubles.limiter ?? allowAll },
      { provide: MIN_CLIENT_VERSIONS, useValue: doubles.minimums ?? { ios: '1.0.0', android: '1.0.0' } },
      Auth0AccessTokenGuard,
      ApplicationSessionGuard,
      { provide: APP_GUARD, useClass: V1AccessGuard },
      { provide: APP_FILTER, useClass: ApiProblemFilter },
      ...(doubles.providers ?? []),
    ],
  })
  class V1TestModule {}
  const app = await NestFactory.create<NestExpressApplication>(V1TestModule, { bodyParser: false, logger: false, abortOnError: false });
  configureV1App(app);
  await app.init();
  return app;
}
