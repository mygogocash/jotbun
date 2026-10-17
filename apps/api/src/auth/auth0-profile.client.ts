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

export interface Auth0ProfileGateway {
  getTrustedProfile(identity: ApiIdentity): Promise<TrustedProfile>;
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
export class Auth0ProfileClient implements Auth0ProfileGateway {
  private readonly api: ManagementApi;

  constructor(config: ManagementClientConfig, fetchImpl: typeof fetch = fetch, timeoutMs = 5_000) {
    this.api = new ManagementApi(config, fetchImpl, timeoutMs);
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
export class UnconfiguredProfileGateway implements Auth0ProfileGateway {
  async getTrustedProfile(): Promise<TrustedProfile> {
    throw new ProfileUnavailableError();
  }
}

/** AUTH0_PROFILE_LINK_CLIENT_ID/SECRET (E1) enable the client; see managementConfigFromEnv. */
export function profileGatewayFromEnv(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch): Auth0ProfileGateway {
  const config = managementConfigFromEnv(env, env.AUTH0_PROFILE_LINK_CLIENT_ID, env.AUTH0_PROFILE_LINK_CLIENT_SECRET);
  return config ? new Auth0ProfileClient(config, fetchImpl) : new UnconfiguredProfileGateway();
}
