import { Inject, Injectable, Module } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Pool } from 'pg';

import { ApiProblemFilter, ProblemException } from '../common/api-problem.filter';
import { ClientVersionGuard, MIN_CLIENT_VERSIONS, minimumClientVersionsFromEnv } from '../common/client-version.guard';
import type { MinimumClientVersions } from '../common/client-version.guard';
import { PostgresRateLimiter, RATE_LIMITER, chargeBeforeSession, chargeSession, rateLimitKeyFromEnv } from '../common/shared-rate-limit';
import type { RateLimiter } from '../common/shared-rate-limit';
import { DatabaseModule } from '../database/database.module';
import { PG_POOL } from '../database/database.service';
import { Auth0AccessTokenGuard } from './auth0-access-token.guard';
import { Auth0TokenVerifier, TOKEN_VERIFIER, auth0ConfigFromEnv } from './auth0-token-verifier';
import { ApplicationSessionGuard, NoPolicyGate, NoSessionResolver, POLICY_GATE, SESSION_RESOLVER } from './application-session.guard';
import { ROUTE_SCOPES_METADATA } from './auth-route.decorator';
import { requestContext } from './request-context';
import { routeAccessOf } from './route-policy';

/**
 * The single global v1 guard, in a fixed order: route classification →
 * client version → access token → route scopes → principal/network budget →
 * binding → per-session budget → current policy. An unclassified route is
 * refused here even if the startup check was skipped. Charging the principal
 * before the session lookup means random bindings cannot bypass rate limits.
 */
@Injectable()
export class V1AccessGuard implements CanActivate {
  private readonly clientVersions: ClientVersionGuard;

  constructor(
    private readonly reflector: Reflector,
    @Inject(MIN_CLIENT_VERSIONS) minimums: MinimumClientVersions,
    @Inject(RATE_LIMITER) private readonly limiter: RateLimiter,
    private readonly tokens: Auth0AccessTokenGuard,
    private readonly sessions: ApplicationSessionGuard,
  ) {
    this.clientVersions = new ClientVersionGuard(minimums);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const access = routeAccessOf(this.reflector, context);
    if (!access) throw new ProblemException(403, 'FORBIDDEN');
    if (access === 'public') return true;
    const req = context.switchToHttp().getRequest<Request>();
    this.clientVersions.check(access, req);
    const state = requestContext(req);
    state.identity = await this.tokens.authenticate(req);
    const scopes = this.reflector.getAllAndOverride<string[] | undefined>(ROUTE_SCOPES_METADATA, [context.getHandler(), context.getClass()]) ?? [];
    if (!scopes.every((scope) => state.identity?.scopes.includes(scope))) {
      throw new ProblemException(403, 'FORBIDDEN', { messageKey: 'errors.insufficient_scope' });
    }
    await chargeBeforeSession(this.limiter, access, state.identity, req);
    state.session = await this.sessions.bind(access, state.identity, req);
    if (state.session) await chargeSession(this.limiter, req, state.session);
    await this.sessions.assertPolicy(access, state.session);
    return true;
  }
}

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: TOKEN_VERIFIER, useFactory: () => new Auth0TokenVerifier(auth0ConfigFromEnv(process.env)) },
    { provide: MIN_CLIENT_VERSIONS, useFactory: () => minimumClientVersionsFromEnv(process.env) },
    { provide: RATE_LIMITER, inject: [PG_POOL], useFactory: (pool: Pool) => new PostgresRateLimiter(pool, rateLimitKeyFromEnv(process.env)) },
    // F4 replaces these with SQL-backed implementations; until then bound
    // and current-policy routes fail closed.
    { provide: SESSION_RESOLVER, useClass: NoSessionResolver },
    { provide: POLICY_GATE, useClass: NoPolicyGate },
    Auth0AccessTokenGuard,
    ApplicationSessionGuard,
    { provide: APP_GUARD, useClass: V1AccessGuard },
    { provide: APP_FILTER, useClass: ApiProblemFilter },
  ],
})
export class AuthModule {}
