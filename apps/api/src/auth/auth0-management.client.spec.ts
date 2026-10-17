import { FAKE_MAINTENANCE_CLIENT_ID, FAKE_MAINTENANCE_CLIENT_SECRET, FAKE_PROFILE_CLIENT_ID, FAKE_PROFILE_CLIENT_SECRET, startManagementFake } from '../testing/auth0-management-fake';
import type { ManagementFake } from '../testing/auth0-management-fake';
import { Auth0MaintenanceClient, maintenanceGatewayFromEnv } from './auth0-management.client';

let management: ManagementFake;
const client = () => new Auth0MaintenanceClient({ managementUrl: management.url, clientId: FAKE_MAINTENANCE_CLIENT_ID, clientSecret: FAKE_MAINTENANCE_CLIENT_SECRET }, fetch, 300);

beforeAll(async () => {
  management = await startManagementFake();
});

afterAll(async () => {
  await management.close();
});

beforeEach(() => {
  management.mode = 'ok';
  management.deviceCredentials.clear();
  for (const [id, user, clientId, type] of [
    ['dc1', 'auth0|alice', 'native-ios', 'refresh_token'],
    ['dc2', 'auth0|alice', 'native-android', 'refresh_token'],
    ['dc3', 'auth0|alice', 'native-ios', 'public_key'],
    ['dc4', 'auth0|bob', 'native-ios', 'refresh_token'],
  ] as const) {
    management.deviceCredentials.set(id, { id, user_id: user, client_id: clientId, type });
  }
});

describe('Auth0 maintenance client', () => {
  it("revokes only this user's refresh tokens for the given clients, and repeating is harmless", async () => {
    expect(await client().revokeGrants('auth0|alice', ['native-ios', 'native-android'])).toEqual({ status: 'done', count: 2 });
    expect([...management.deviceCredentials.keys()].sort()).toEqual(['dc3', 'dc4']);
    expect(await client().revokeGrants('auth0|alice', ['native-ios', 'native-android'])).toEqual({ status: 'done', count: 0 });
  });

  it('keeps refresh tokens of clients it was not asked about', async () => {
    expect(await client().revokeGrants('auth0|alice', ['native-ios'])).toEqual({ status: 'done', count: 1 });
    expect(management.deviceCredentials.has('dc2')).toBe(true);
  });

  it.each([
    ['down', 'retryable'],
    ['rate-limited', 'retryable'],
    ['hang', 'retryable'],
    ['token-down', 'retryable'],
    ['forbidden', 'permanent'],
  ] as const)('reports a %s Management API as %s, without raw identifiers', async (mode, status) => {
    management.mode = mode;
    const outcome = await client().revokeGrants('auth0|alice', ['native-ios']);
    expect(outcome.status).toBe(status);
    expect(JSON.stringify(outcome)).not.toMatch(/alice|token/);
  });

  it('reads only the last password change, and treats a deleted user as having none', async () => {
    management.profiles.set('auth0|dana', { user_id: 'auth0|dana', email_verified: true, last_password_reset: '2026-10-17T08:00:00.000Z' });
    management.requests.length = 0;
    expect(await client().credentialState('auth0|dana')).toEqual({ status: 'done', lastPasswordReset: '2026-10-17T08:00:00.000Z' });
    const read = management.requests.find((request) => request.url.startsWith('/api/v2/users/'));
    expect(read?.url).toBe('/api/v2/users/auth0%7Cdana?fields=last_password_reset&include_fields=true');
    management.profiles.set('auth0|erin', { user_id: 'auth0|erin' });
    expect(await client().credentialState('auth0|erin')).toEqual({ status: 'done', lastPasswordReset: null });
    expect(await client().credentialState('auth0|nobody')).toEqual({ status: 'done', lastPasswordReset: null });
    management.mode = 'down';
    expect(await client().credentialState('auth0|dana')).toEqual({ status: 'retryable', code: 'provider_unavailable' });
    management.mode = 'forbidden';
    expect(await client().credentialState('auth0|dana')).toEqual({ status: 'permanent', code: 'provider_forbidden' });
  });

  it('deletes a user, and treats an already deleted user as done', async () => {
    management.profiles.set('auth0|carol', { user_id: 'auth0|carol' });
    expect(await client().deleteUser('auth0|carol')).toEqual({ status: 'done', count: 1 });
    expect(await client().deleteUser('auth0|carol')).toEqual({ status: 'done', count: 0 });
    expect(management.deletedUsers).toEqual(['auth0|carol']);
  });

  it('cannot act with the read-profile credentials', async () => {
    const profileCreds = new Auth0MaintenanceClient({ managementUrl: management.url, clientId: FAKE_PROFILE_CLIENT_ID, clientSecret: FAKE_PROFILE_CLIENT_SECRET }, fetch, 300);
    expect((await profileCreds.revokeGrants('auth0|alice', ['native-ios'])).status).toBe('permanent');
    expect(management.deviceCredentials.has('dc1')).toBe(true);
  });

  it('is only configured from the maintenance credentials, never the profile ones', () => {
    expect(maintenanceGatewayFromEnv({ AUTH0_ISSUER: 'https://tenant.example/', AUTH0_PROFILE_LINK_CLIENT_ID: 'a', AUTH0_PROFILE_LINK_CLIENT_SECRET: 'b' })).toBeNull();
    expect(maintenanceGatewayFromEnv({ AUTH0_ISSUER: 'https://tenant.example/', AUTH0_MAINTENANCE_CLIENT_ID: 'a', AUTH0_MAINTENANCE_CLIENT_SECRET: 'b' })).toBeInstanceOf(Auth0MaintenanceClient);
  });
});
