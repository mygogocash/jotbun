import { V1_HEADERS, compareVersions, parseClientHeader } from '@gogospend/contracts';
import type { ClientPlatform } from '@gogospend/contracts';
import type { Request } from 'express';

import type { RouteAccess } from '../auth/route-policy';
import { ProblemException } from './api-problem.filter';
import { ConfigurationError } from './configuration-error';

export type MinimumClientVersions = Record<ClientPlatform, string>;

export const MIN_CLIENT_VERSIONS = Symbol('MIN_CLIENT_VERSIONS');

const VERSION = /^(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})\.(?:0|[1-9][0-9]{0,5})$/;

/** MIN_CLIENT_VERSION_IOS / _ANDROID are required; startup fails without them. */
export function minimumClientVersionsFromEnv(env: NodeJS.ProcessEnv): MinimumClientVersions {
  const ios = env.MIN_CLIENT_VERSION_IOS ?? '';
  const android = env.MIN_CLIENT_VERSION_ANDROID ?? '';
  if (!VERSION.test(ios) || !VERSION.test(android)) {
    throw new ConfigurationError('MIN_CLIENT_VERSION_IOS and MIN_CLIENT_VERSION_ANDROID must be major.minor.patch versions.');
  }
  return { ios, android };
}

/**
 * Non-public requests must name a supported app build in `x-gogospend-client`.
 * Missing, malformed or outdated → 426, so old clients pause and keep drafts
 * instead of sending commands the server may no longer accept.
 */
export class ClientVersionGuard {
  constructor(private readonly minimums: MinimumClientVersions) {}

  check(access: RouteAccess, req: Request): void {
    if (access === 'public') return;
    const client = parseClientHeader(req.headers[V1_HEADERS.client]);
    if (!client || compareVersions(client.version, this.minimums[client.platform]) < 0) {
      throw new ProblemException(426, 'CLIENT_UPGRADE_REQUIRED');
    }
  }
}
