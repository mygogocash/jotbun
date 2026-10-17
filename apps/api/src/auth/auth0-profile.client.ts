import type { ApiIdentity } from '@gogospend/contracts';

import { isLoopbackHost } from '../database/database-config';

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

export type ProfileClientConfig = { managementUrl: string; clientId: string; clientSecret: string };

type ManagementProfile = {
  user_id?: unknown;
  email_verified?: unknown;
  blocked?: unknown;
  identities?: { connection?: unknown; provider?: unknown; user_id?: unknown }[];
};

// Renew the management token this long before Auth0 says it expires.
const TOKEN_RENEWAL_MARGIN_MS = 60_000;

/**
 * Read-profile-only Auth0 Management API client (client-credentials grant
 * with the `read:users` scope). It holds the profile/link client credentials
 * only, never the maintenance client's deletion or revocation secrets. Any
 * failure is ProfileUnavailableError, so bootstrap fails closed. Never logs
 * subjects or tokens.
 */
export class Auth0ProfileClient implements Auth0ProfileGateway {
  private token: { value: string; renewAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(private readonly config: ProfileClientConfig, private readonly fetchImpl: typeof fetch = fetch, private readonly timeoutMs = 5_000) {}

  async getTrustedProfile(identity: ApiIdentity): Promise<TrustedProfile> {
    const token = await this.managementToken();
    const url = new URL(`api/v2/users/${encodeURIComponent(identity.subject)}`, this.config.managementUrl);
    url.searchParams.set('fields', 'user_id,email_verified,blocked,identities');
    url.searchParams.set('include_fields', 'true');
    const response = await this.call(url, { headers: { authorization: `Bearer ${token}` } });
    // Auth0 no longer has this user (deleted): treat as blocked, never as a new sign-up.
    if (response.status === 404) return { subject: identity.subject, emailVerified: false, connection: 'unknown', blocked: true };
    if (response.status === 401) this.token = null;
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

  // Single flight: concurrent cache misses share one token request, since
  // machine-to-machine token issuance has its own Auth0 quota.
  private async managementToken(): Promise<string> {
    if (this.token && Date.now() < this.token.renewAt) return this.token.value;
    this.tokenRequest ??= this.requestToken().finally(() => {
      this.tokenRequest = null;
    });
    return this.tokenRequest;
  }

  private async requestToken(): Promise<string> {
    const response = await this.call(new URL('oauth/token', this.config.managementUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        audience: new URL('api/v2/', this.config.managementUrl).href,
      }),
    });
    if (!response.ok) throw new ProfileUnavailableError();
    const grant = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    if (typeof grant?.access_token !== 'string' || typeof grant.expires_in !== 'number') throw new ProfileUnavailableError();
    this.token = { value: grant.access_token, renewAt: Date.now() + grant.expires_in * 1000 - TOKEN_RENEWAL_MARGIN_MS };
    return this.token.value;
  }

  private async call(url: URL, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs) });
    } catch {
      throw new ProfileUnavailableError();
    }
  }
}

/** Without E1-authorized read-profile credentials, bootstrap fails closed. */
export class UnconfiguredProfileGateway implements Auth0ProfileGateway {
  async getTrustedProfile(): Promise<TrustedProfile> {
    throw new ProfileUnavailableError();
  }
}

/**
 * AUTH0_PROFILE_LINK_CLIENT_ID/SECRET (E1) enable the client;
 * AUTH0_MANAGEMENT_URL (default AUTH0_ISSUER) is the tenant's canonical
 * domain, https and ending in "/" (loopback http only outside production).
 */
export function profileGatewayFromEnv(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch): Auth0ProfileGateway {
  const clientId = env.AUTH0_PROFILE_LINK_CLIENT_ID ?? '';
  const clientSecret = env.AUTH0_PROFILE_LINK_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) return new UnconfiguredProfileGateway();
  const managementUrl = env.AUTH0_MANAGEMENT_URL || env.AUTH0_ISSUER || '';
  let url: URL;
  try {
    url = new URL(managementUrl);
  } catch {
    throw new Error('AUTH0_MANAGEMENT_URL must be an absolute URL.');
  }
  const loopbackTest = url.protocol === 'http:' && isLoopbackHost(url.hostname) && env.NODE_ENV !== 'production';
  if ((url.protocol !== 'https:' && !loopbackTest) || !managementUrl.endsWith('/') || url.search || url.hash) {
    throw new Error('AUTH0_MANAGEMENT_URL must be an https URL ending in "/".');
  }
  return new Auth0ProfileClient({ managementUrl, clientId, clientSecret }, fetchImpl);
}
