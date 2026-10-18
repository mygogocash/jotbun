import { Inject, Injectable } from '@nestjs/common';
import { V1_HEADERS } from '@gogospend/contracts';
import type { ApiIdentity, SessionContext } from '@gogospend/contracts';
import type { Request } from 'express';

import { ProblemException } from '../common/api-problem.filter';
import { needsBinding } from './route-policy';
import type { RouteAccess } from './route-policy';

/** Resolves an opaque binding for a verified identity; F4 provides the SQL implementation. */
export interface SessionResolver {
  resolve(identity: ApiIdentity, binding: string): Promise<SessionContext | null>;
}
/**
 * The session's standing against the current required policies:
 * `accepted`, `pending` (a required version awaits acceptance) or
 * `unpublished` (nothing required is published, so writes cannot proceed).
 */
export type PolicyState = 'accepted' | 'pending' | 'unpublished';
export interface PolicyGate {
  currentPolicyState(session: SessionContext): Promise<PolicyState>;
}

/** Turns a non-accepted policy state into its problem (writes and the command executor). */
export function assertPolicyAccepted(state: PolicyState): void {
  if (state === 'unpublished') throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { messageKey: 'errors.policy_unpublished' });
  if (state === 'pending') throw new ProblemException(403, 'POLICY_ACCEPTANCE_REQUIRED');
}

export const SESSION_RESOLVER = Symbol('SESSION_RESOLVER');
export const POLICY_GATE = Symbol('POLICY_GATE');

/** Until F4 ships, no binding resolves: bound routes fail closed. */
export class NoSessionResolver implements SessionResolver {
  async resolve(): Promise<SessionContext | null> {
    return null;
  }
}

/** Without a policy store nothing counts as published: current-policy routes fail closed. */
export class NoPolicyGate implements PolicyGate {
  async currentPolicyState(): Promise<PolicyState> {
    return 'unpublished';
  }
}

// F4 issues 32 random bytes as base64url (43 characters).
const BINDING = /^[A-Za-z0-9_-]{43}$/;

/** Reads the `x-gogospend-session` binding; a missing, repeated or malformed value is null. */
export function bindingFrom(req: Request): string | null {
  const value = req.headers[V1_HEADERS.session];
  return typeof value === 'string' && BINDING.test(value) ? value : null;
}

@Injectable()
export class ApplicationSessionGuard {
  constructor(
    @Inject(SESSION_RESOLVER) private readonly resolver: SessionResolver,
    @Inject(POLICY_GATE) private readonly policies: PolicyGate,
  ) {}

  /** The active session for this identity and binding, or 401. Resolver failure is 503. */
  async resolve(identity: ApiIdentity, binding: string): Promise<SessionContext> {
    let session: SessionContext | null;
    try {
      session = await this.resolver.resolve(identity, binding);
    } catch {
      throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 });
    }
    if (!session) throw new ProblemException(401, 'SESSION_REQUIRED');
    return session;
  }

  /** The session for bound route classes; undefined for public/token-only. */
  async bind(access: RouteAccess, identity: ApiIdentity, req: Request): Promise<SessionContext | undefined> {
    if (!needsBinding(access)) return undefined;
    const binding = bindingFrom(req);
    if (!binding) throw new ProblemException(401, 'SESSION_REQUIRED');
    return this.resolve(identity, binding);
  }

  /**
   * current_policy routes need every current required policy accepted.
   * Nothing published is never implicit acceptance: it is 503, so clients do
   * not loop asking the user to accept a policy that does not exist.
   */
  async assertPolicy(access: RouteAccess, session: SessionContext | undefined): Promise<void> {
    if (access !== 'current_policy') return;
    if (!session) throw new ProblemException(401, 'SESSION_REQUIRED');
    let state: PolicyState;
    try {
      state = await this.policies.currentPolicyState(session);
    } catch {
      throw new ProblemException(503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 5 });
    }
    assertPolicyAccepted(state);
  }
}
