import { isLoopbackHost } from '../database/database-config';
import { ConfigurationError } from '../common/configuration-error';

export type ManagementClientConfig = { managementUrl: string; clientId: string; clientSecret: string };

/** Network failure, timeout, or no usable machine-to-machine token. */
export class ManagementUnavailableError extends Error {
  constructor() {
    super('Auth0 Management API is unavailable.');
    this.name = 'ManagementUnavailableError';
  }
}

// Renew the management token this long before Auth0 says it expires.
const TOKEN_RENEWAL_MARGIN_MS = 60_000;

/**
 * One Auth0 machine-to-machine client's view of the Management API: a cached
 * client-credentials token fetched single-flight (token issuance has its own
 * quota), bounded timeouts and no redirects. Each client (read-profile,
 * maintenance) gets its own instance and credentials. Never logs URLs,
 * subjects or tokens.
 */
export class ManagementApi {
  private token: { value: string; renewAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(private readonly config: ManagementClientConfig, private readonly fetchImpl: typeof fetch = fetch, private readonly timeoutMs = 5_000) {}

  /** Calls `path` (relative to the tenant, e.g. `api/v2/users/x`) with the client's token. */
  async request(path: string, init: RequestInit = {}, query: Record<string, string> = {}): Promise<Response> {
    const token = await this.managementToken();
    const url = new URL(path, this.config.managementUrl);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await this.call(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` } });
    if (response.status === 401) this.token = null;
    return response;
  }

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
    if (!response.ok) throw new ManagementUnavailableError();
    const grant = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    if (typeof grant?.access_token !== 'string' || typeof grant.expires_in !== 'number') throw new ManagementUnavailableError();
    this.token = { value: grant.access_token, renewAt: Date.now() + grant.expires_in * 1000 - TOKEN_RENEWAL_MARGIN_MS };
    return this.token.value;
  }

  private async call(url: URL, init: RequestInit): Promise<Response> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, redirect: 'error', signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
    } catch {
      throw new ManagementUnavailableError();
    }
  }
}

/**
 * Reads a management client's settings. `AUTH0_MANAGEMENT_URL` (default
 * `AUTH0_ISSUER`) is the tenant's canonical domain: https and ending in "/"
 * (loopback http only outside production). Null when credentials are absent.
 */
export function managementConfigFromEnv(env: NodeJS.ProcessEnv, clientId: string | undefined, clientSecret: string | undefined): ManagementClientConfig | null {
  if (!clientId || !clientSecret) return null;
  const managementUrl = env.AUTH0_MANAGEMENT_URL || env.AUTH0_ISSUER || '';
  let url: URL;
  try {
    url = new URL(managementUrl);
  } catch {
    throw new ConfigurationError('AUTH0_MANAGEMENT_URL must be an absolute URL.');
  }
  const loopbackTest = url.protocol === 'http:' && isLoopbackHost(url.hostname) && env.NODE_ENV !== 'production';
  if ((url.protocol !== 'https:' && !loopbackTest) || !managementUrl.endsWith('/') || url.search || url.hash) {
    throw new ConfigurationError('AUTH0_MANAGEMENT_URL must be an https URL ending in "/".');
  }
  return { managementUrl, clientId, clientSecret };
}
