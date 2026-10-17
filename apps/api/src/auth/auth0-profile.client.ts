import type { ApiIdentity } from '@gogospend/contracts';

import { ManagementApi, ManagementUnavailableError, managementConfigFromEnv } from './auth0-management-api';
import type { ManagementClientConfig } from './auth0-management-api';

/** Identity state read from Auth0, never from the client's request body. */
export type TrustedProfile = {
  subject: string;
  emailVerified: boolean;
  connection: string;
  blocked: boolean;
};

export class ProfileUnavailableError extends Error {
  constructor() {
    super('Auth0 profile lookup is unavailable.');
    this.name = 'ProfileUnavailableError';
  }
}

export const AUTH0_PROFILE_GATEWAY = Symbol('AUTH0_PROFILE_GATEWAY');

/** Auth0 refused the link (the secondary is unknown, malformed or linked elsewhere). */
export class LinkRefusedError extends Error {
  constructor() {
    super('Auth0 refused the account link.');
    this.name = 'LinkRefusedError';
  }
}

export interface Auth0ProfileGateway {
  getTrustedProfile(identity: ApiIdentity): Promise<TrustedProfile>;
}

export const AUTH0_LINK_GATEWAY = Symbol('AUTH0_LINK_GATEWAY');

/** F6c: the profile/link client's linking scope (`update:users`). */
export interface Auth0LinkGateway {
  /**
   * Links `secondary` into `primary` at Auth0. Idempotent: an existing link
   * is success. ProfileUnavailableError when Auth0 cannot answer;
   * LinkRefusedError when it refuses.
   */
  link(primary: string, secondary: string): Promise<void>;
}

type ManagementProfile = {
  user_id?: unknown;
  email_verified?: unknown;
  blocked?: unknown;
  identities?: { connection?: unknown; provider?: unknown; user_id?: unknown }[];
};

/**
 * Read-profile-only Auth0 Management API client (client-credentials grant
 * with the `read:users` scope). It holds the profile/link client credentials
 * only, never the maintenance client's deletion or revocation secrets. Any
 * failure is ProfileUnavailableError, so bootstrap fails closed.
 */
export class Auth0ProfileClient implements Auth0ProfileGateway, Auth0LinkGateway {
  private readonly api: ManagementApi;

  constructor(config: ManagementClientConfig, fetchImpl: typeof fetch = fetch, timeoutMs = 5_000) {
    this.api = new ManagementApi(config, fetchImpl, timeoutMs);
  }

  async link(primary: string, secondary: string): Promise<void> {
    const separator = secondary.indexOf('|');
    if (separator < 1 || separator === secondary.length - 1) throw new LinkRefusedError();
    const provider = secondary.slice(0, separator);
    const userId = secondary.slice(separator + 1);
    try {
      // Already linked (an earlier attempt whose response was lost): done.
      const current = await this.api.request(`api/v2/users/${encodeURIComponent(primary)}`, {}, { fields: 'identities', include_fields: 'true' });
      if (current.status >= 500 || current.status === 429) throw new ProfileUnavailableError();
      if (!current.ok) throw new LinkRefusedError();
      const profile = (await current.json().catch(() => null)) as ManagementProfile | null;
      if (profile?.identities?.some((identity) => identity?.provider === provider && identity?.user_id === userId)) return;
      const linked = await this.api.request(`api/v2/users/${encodeURIComponent(primary)}/identities`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, user_id: userId }),
      });
      if (linked.status >= 500 || linked.status === 429) throw new ProfileUnavailableError();
      if (!linked.ok) throw new LinkRefusedError();
    } catch (error) {
      if (error instanceof ManagementUnavailableError) throw new ProfileUnavailableError();
      throw error;
    }
  }

  async getTrustedProfile(identity: ApiIdentity): Promise<TrustedProfile> {
    let response: Response;
    try {
      response = await this.api.request(`api/v2/users/${encodeURIComponent(identity.subject)}`, {}, {
        fields: 'user_id,email_verified,blocked,identities',
        include_fields: 'true',
      });
    } catch (error) {
      if (error instanceof ManagementUnavailableError) throw new ProfileUnavailableError();
      throw error;
    }
    // Auth0 no longer has this user (deleted): treat as blocked, never as a new sign-up.
    if (response.status === 404) return { subject: identity.subject, emailVerified: false, connection: 'unknown', blocked: true };
    if (!response.ok) throw new ProfileUnavailableError();
    const profile = (await response.json().catch(() => null)) as ManagementProfile | null;
    if (!profile || profile.user_id !== identity.subject) throw new ProfileUnavailableError();
    const identities = Array.isArray(profile.identities) ? profile.identities : [];
    const matching = identities.find((entry) => `${String(entry.provider)}|${String(entry.user_id)}` === identity.subject) ?? identities[0];
    return {
      subject: identity.subject,
      emailVerified: profile.email_verified === true,
      connection: typeof matching?.connection === 'string' ? matching.connection : 'unknown',
      blocked: profile.blocked === true,
    };
  }
}

/** Without E1-authorized read-profile credentials, bootstrap fails closed. */
export class UnconfiguredProfileGateway implements Auth0ProfileGateway, Auth0LinkGateway {
  async getTrustedProfile(): Promise<TrustedProfile> {
    throw new ProfileUnavailableError();
  }

  async link(): Promise<void> {
    throw new ProfileUnavailableError();
  }
}

/** AUTH0_PROFILE_LINK_CLIENT_ID/SECRET (E1) enable the client; see managementConfigFromEnv. */
export function profileGatewayFromEnv(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch): Auth0ProfileGateway & Auth0LinkGateway {
  const config = managementConfigFromEnv(env, env.AUTH0_PROFILE_LINK_CLIENT_ID, env.AUTH0_PROFILE_LINK_CLIENT_SECRET);
  return config ? new Auth0ProfileClient(config, fetchImpl) : new UnconfiguredProfileGateway();
}
