import { ManagementApi, ManagementUnavailableError, managementConfigFromEnv } from './auth0-management-api';
import type { ManagementClientConfig } from './auth0-management-api';

/** Typed outcome of a provider operation; never contains tokens or subjects. */
export type MaintenanceOutcome =
  | { status: 'done'; count: number }
  | { status: 'retryable'; code: string }
  | { status: 'permanent'; code: string };

export interface IdentityMaintenanceGateway {
  /** Revokes this user's refresh grants for the given native clients. Idempotent. */
  revokeGrants(subject: string, clientIds: readonly string[], signal?: AbortSignal): Promise<MaintenanceOutcome>;
  /** Deletes the Auth0 user; an already deleted user is done. */
  deleteUser(subject: string, signal?: AbortSignal): Promise<MaintenanceOutcome>;
}

// Auth0 lists refresh grants as device credentials of these types (rotating
// ones when refresh-token rotation is on).
const GRANT_TYPES = ['refresh_token', 'rotating_refresh_token'] as const;
// Listing again after deleting picks up anything past the first page.
const MAX_LIST_ROUNDS = 20;

function failure(status: number): MaintenanceOutcome {
  if (status === 429) return { status: 'retryable', code: 'provider_rate_limited' };
  if (status >= 500 || status === 401) return { status: 'retryable', code: 'provider_unavailable' };
  if (status === 403) return { status: 'permanent', code: 'provider_forbidden' };
  return { status: 'permanent', code: 'provider_rejected' };
}

/**
 * The worker-only Auth0 maintenance client (its own machine-to-machine
 * credentials, scoped to device credentials and user deletion). The API
 * process never holds these credentials. Outcomes carry only retryability and
 * a short code; nothing here logs subjects, ids or tokens.
 */
export class Auth0MaintenanceClient implements IdentityMaintenanceGateway {
  private readonly api: ManagementApi;

  constructor(config: ManagementClientConfig, fetchImpl: typeof fetch = fetch, timeoutMs = 5_000) {
    this.api = new ManagementApi(config, fetchImpl, timeoutMs);
  }

  revokeGrants(subject: string, clientIds: readonly string[], signal?: AbortSignal): Promise<MaintenanceOutcome> {
    return this.guarded(async () => {
      let count = 0;
      for (const clientId of clientIds) {
        for (const type of GRANT_TYPES) {
          for (let round = 0; ; round += 1) {
            // Re-checked before every call: past the lease deadline another
            // worker may already have finished and the user signed in again.
            if (signal?.aborted) return { status: 'retryable', code: 'lease_expired' };
            if (round === MAX_LIST_ROUNDS) return { status: 'retryable', code: 'provider_incomplete' };
            const listed = await this.api.request('api/v2/device-credentials', { signal }, { user_id: subject, client_id: clientId, type, fields: 'id', include_fields: 'true' });
            if (!listed.ok) return failure(listed.status);
            const ids = await this.credentialIds(listed);
            if (!ids) return { status: 'retryable', code: 'provider_bad_response' };
            if (ids.length === 0) break;
            for (const id of ids) {
              if (signal?.aborted) return { status: 'retryable', code: 'lease_expired' };
              const removed = await this.api.request(`api/v2/device-credentials/${encodeURIComponent(id)}`, { method: 'DELETE', signal });
              if (removed.status === 404) continue;
              if (!removed.ok) return failure(removed.status);
              count += 1;
            }
          }
        }
      }
      return { status: 'done', count };
    });
  }

  deleteUser(subject: string, signal?: AbortSignal): Promise<MaintenanceOutcome> {
    return this.guarded(async () => {
      const response = await this.api.request(`api/v2/users/${encodeURIComponent(subject)}`, { method: 'DELETE', signal });
      if (response.status === 404) return { status: 'done', count: 0 };
      if (!response.ok) return failure(response.status);
      return { status: 'done', count: 1 };
    });
  }

  private async credentialIds(response: Response): Promise<string[] | null> {
    const body = (await response.json().catch(() => null)) as unknown;
    if (!Array.isArray(body)) return null;
    const ids = body.map((item: { id?: unknown } | null) => item?.id);
    return ids.every((id): id is string => typeof id === 'string' && id.length > 0) ? ids : null;
  }

  private async guarded(run: () => Promise<MaintenanceOutcome>): Promise<MaintenanceOutcome> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ManagementUnavailableError) return { status: 'retryable', code: 'provider_unavailable' };
      throw error;
    }
  }
}

/**
 * The maintenance client, from `AUTH0_MAINTENANCE_CLIENT_ID/SECRET` only
 * (never the read-profile credentials). Null when unset; refuses a
 * configuration that reuses the profile client.
 */
export function maintenanceGatewayFromEnv(env: NodeJS.ProcessEnv): IdentityMaintenanceGateway | null {
  const clientId = env.AUTH0_MAINTENANCE_CLIENT_ID;
  if (clientId && clientId === env.AUTH0_PROFILE_LINK_CLIENT_ID) {
    throw new Error('AUTH0_MAINTENANCE_CLIENT_ID must be a separate Auth0 application from the profile client.');
  }
  const config = managementConfigFromEnv(env, clientId, env.AUTH0_MAINTENANCE_CLIENT_SECRET);
  return config ? new Auth0MaintenanceClient(config) : null;
}
