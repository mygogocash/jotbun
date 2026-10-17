import { FAKE_PROFILE_CLIENT_ID, FAKE_PROFILE_CLIENT_SECRET, startManagementFake } from '../testing/auth0-management-fake';
import type { ManagementFake } from '../testing/auth0-management-fake';
import { Auth0ProfileClient, ProfileUnavailableError, UnconfiguredProfileGateway, profileGatewayFromEnv } from './auth0-profile.client';

let management: ManagementFake;
let client: Auth0ProfileClient;
const identity = (subject: string) => ({ issuer: 'https://tenant.example/', subject, clientId: 'native', scopes: [] });

async function outcome(subject: string, using: { getTrustedProfile: Auth0ProfileClient['getTrustedProfile'] } = client): Promise<unknown> {
  try {
    return await using.getTrustedProfile(identity(subject));
  } catch (error) {
    return error instanceof ProfileUnavailableError ? 'unavailable' : `threw ${(error as Error).message}`;
  }
}

beforeAll(async () => {
  management = await startManagementFake();
  management.profiles.set('google-oauth2|111', {
    user_id: 'google-oauth2|111',
    email_verified: true,
    identities: [{ connection: 'google-oauth2', provider: 'google-oauth2', user_id: '111' }],
  });
  management.profiles.set('auth0|222', {
    user_id: 'auth0|222',
    email_verified: false,
    blocked: true,
    identities: [
      { connection: 'apple', provider: 'apple', user_id: 'zzz' },
      { connection: 'Username-Password-Authentication', provider: 'auth0', user_id: '222' },
    ],
  });
  management.profiles.set('auth0|mismatch', { user_id: 'auth0|someone-else', email_verified: true });
  client = new Auth0ProfileClient({ managementUrl: management.url, clientId: FAKE_PROFILE_CLIENT_ID, clientSecret: FAKE_PROFILE_CLIENT_SECRET }, fetch, 300);
});

afterAll(async () => {
  await management.close();
});

beforeEach(() => {
  management.mode = 'ok';
});

describe('Auth0 read-profile client', () => {
  it('reads subject, verified email, block state and the matching identity connection from Auth0', async () => {
    expect(await outcome('google-oauth2|111')).toEqual({ subject: 'google-oauth2|111', emailVerified: true, connection: 'google-oauth2', blocked: false });
    expect(await outcome('auth0|222')).toEqual({ subject: 'auth0|222', emailVerified: false, connection: 'Username-Password-Authentication', blocked: true });
  });

  it('reuses one management token and sends the client secret only to the token endpoint', async () => {
    management.requests.length = 0;
    const fresh = new Auth0ProfileClient({ managementUrl: management.url, clientId: FAKE_PROFILE_CLIENT_ID, clientSecret: FAKE_PROFILE_CLIENT_SECRET }, fetch, 300);
    await fresh.getTrustedProfile(identity('google-oauth2|111'));
    await fresh.getTrustedProfile(identity('google-oauth2|111'));
    expect(management.requests.filter((r) => r.url === '/oauth/token')).toHaveLength(1);
    const profileCalls = management.requests.filter((r) => r.url.startsWith('/api/v2/users/'));
    expect(profileCalls).toHaveLength(2);
    expect(JSON.stringify(profileCalls)).not.toContain(FAKE_PROFILE_CLIENT_SECRET);
    expect(profileCalls[0].url.startsWith('/api/v2/users/google-oauth2%7C111')).toBe(true);
  });

  it('requests one management token for concurrent lookups', async () => {
    management.requests.length = 0;
    const fresh = new Auth0ProfileClient({ managementUrl: management.url, clientId: FAKE_PROFILE_CLIENT_ID, clientSecret: FAKE_PROFILE_CLIENT_SECRET }, fetch, 300);
    await Promise.all([1, 2, 3].map(() => fresh.getTrustedProfile(identity('google-oauth2|111'))));
    expect(management.requests.filter((r) => r.url === '/oauth/token')).toHaveLength(1);
  });

  it('treats a user Auth0 no longer has as blocked', async () => {
    expect(await outcome('auth0|deleted-user')).toMatchObject({ blocked: true });
  });

  it('refuses a profile for a different user', async () => {
    expect(await outcome('auth0|mismatch')).toBe('unavailable');
  });

  it.each(['down', 'token-down', 'hang'] as const)('fails closed when the Management API is %s', async (mode) => {
    const fresh = new Auth0ProfileClient({ managementUrl: management.url, clientId: FAKE_PROFILE_CLIENT_ID, clientSecret: FAKE_PROFILE_CLIENT_SECRET }, fetch, 300);
    management.mode = mode;
    expect(await outcome('google-oauth2|111', fresh)).toBe('unavailable');
  });

  it('fails closed with wrong client credentials', async () => {
    const wrong = new Auth0ProfileClient({ managementUrl: management.url, clientId: FAKE_PROFILE_CLIENT_ID, clientSecret: 'wrong' }, fetch, 300);
    expect(await outcome('google-oauth2|111', wrong)).toBe('unavailable');
  });

  it('is unavailable until E1 credentials are configured', async () => {
    expect(profileGatewayFromEnv({ AUTH0_ISSUER: 'https://tenant.example/' })).toBeInstanceOf(UnconfiguredProfileGateway);
    expect(await outcome('google-oauth2|111', new UnconfiguredProfileGateway())).toBe('unavailable');
  });

  it('refuses a plain-http remote management URL', () => {
    expect(() => profileGatewayFromEnv({ AUTH0_MANAGEMENT_URL: 'http://tenant.example/', AUTH0_PROFILE_LINK_CLIENT_ID: 'a', AUTH0_PROFILE_LINK_CLIENT_SECRET: 'b' })).toThrow();
    expect(() => profileGatewayFromEnv({ AUTH0_MANAGEMENT_URL: 'https://tenant.example', AUTH0_PROFILE_LINK_CLIENT_ID: 'a', AUTH0_PROFILE_LINK_CLIENT_SECRET: 'b' })).toThrow();
  });
});
