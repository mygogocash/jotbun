// A loopback stand-in for Auth0's Management API: client-credentials tokens,
// user profiles, refresh-token device credentials and user deletion. Each
// client's token only works on its own endpoints, so tests can prove the
// read-profile and maintenance credentials stay separate. Synthetic only.
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

export const FAKE_PROFILE_CLIENT_ID = 'profile-client-test';
export const FAKE_PROFILE_CLIENT_SECRET = 'synthetic-profile-secret-not-real';
export const FAKE_MAINTENANCE_CLIENT_ID = 'maintenance-client-test';
export const FAKE_MAINTENANCE_CLIENT_SECRET = 'synthetic-maintenance-secret-not-real';

export type FakeProfile = { user_id: string; email_verified?: boolean; blocked?: boolean; last_password_reset?: string; identities?: { connection: string; provider: string; user_id: string }[] };
export type FakeDeviceCredential = { id: string; user_id: string; client_id: string; type: 'refresh_token' | 'public_key' };
export type RecordedRequest = { method: string; url: string; authorization?: string; body: string };

export type ManagementFake = {
  url: string;
  profiles: Map<string, FakeProfile>;
  deviceCredentials: Map<string, FakeDeviceCredential>;
  deletedUsers: string[];
  /** F6c: links made, primary <- secondary. */
  links: { primary: string; secondary: string }[];
  requests: RecordedRequest[];
  /** 'ok' answers; 'down' 503s data calls; 'token-down' fails tokens; 'hang' never answers; 'rate-limited' 429s data calls; 'forbidden' 403s data calls. */
  mode: 'ok' | 'down' | 'token-down' | 'hang' | 'rate-limited' | 'forbidden';
  close(): Promise<void>;
};

const CLIENTS: Record<string, { secret: string; role: 'profile' | 'maintenance' }> = {
  [FAKE_PROFILE_CLIENT_ID]: { secret: FAKE_PROFILE_CLIENT_SECRET, role: 'profile' },
  [FAKE_MAINTENANCE_CLIENT_ID]: { secret: FAKE_MAINTENANCE_CLIENT_SECRET, role: 'maintenance' },
};

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  return body;
}

export async function startManagementFake(): Promise<ManagementFake> {
  let tokens = 0;
  const fake = {
    mode: 'ok' as ManagementFake['mode'],
    profiles: new Map<string, FakeProfile>(),
    deviceCredentials: new Map<string, FakeDeviceCredential>(),
    deletedUsers: [] as string[],
    links: [] as { primary: string; secondary: string }[],
    requests: [] as RecordedRequest[],
  };
  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    fake.requests.push({ method: req.method ?? '', url: req.url ?? '', authorization: req.headers.authorization, body });
    if (fake.mode === 'hang') return;
    const url = new URL(req.url ?? '/', 'http://fake');
    if (req.method === 'POST' && url.pathname === '/oauth/token') {
      const grant = JSON.parse(body || '{}') as Record<string, string>;
      const client = CLIENTS[grant.client_id];
      if (fake.mode === 'token-down' || !client || client.secret !== grant.client_secret) {
        res.writeHead(fake.mode === 'token-down' ? 503 : 401).end();
        return;
      }
      tokens += 1;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: `mgmt-token-${client.role}-${tokens}`, expires_in: 86_400, token_type: 'Bearer' }));
      return;
    }
    const role = /^Bearer mgmt-token-(profile|maintenance)-\d+$/.exec(req.headers.authorization ?? '')?.[1];
    const deny = (status: number) => res.writeHead(status).end();
    if (fake.mode === 'down') return deny(503);
    if (fake.mode === 'rate-limited') return deny(429);
    if (fake.mode === 'forbidden') return deny(403);
    const user = /^\/api\/v2\/users\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && user) {
      // The maintenance client may read exactly one field: the last password change.
      const resetOnly = url.searchParams.get('fields') === 'last_password_reset' && url.searchParams.get('include_fields') === 'true';
      if (role !== 'profile' && !(role === 'maintenance' && resetOnly)) return deny(role ? 403 : 401);
      const profile = fake.profiles.get(decodeURIComponent(user[1]));
      if (!profile) return deny(404);
      const answer = resetOnly ? (profile.last_password_reset ? { last_password_reset: profile.last_password_reset } : {}) : profile;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(answer));
      return;
    }
    // F6c: link `{provider, user_id}` into the primary user (profile/link client only).
    const identities = /^\/api\/v2\/users\/([^/]+)\/identities$/.exec(url.pathname);
    if (req.method === 'POST' && identities) {
      if (role !== 'profile') return deny(role ? 403 : 401);
      const primary = fake.profiles.get(decodeURIComponent(identities[1]));
      const { provider, user_id: userId } = JSON.parse(body || '{}') as { provider?: string; user_id?: string };
      const secondaryId = `${provider}|${userId}`;
      const secondary = fake.profiles.get(secondaryId);
      if (!primary || !secondary || secondaryId === primary.user_id) return deny(primary ? 400 : 404);
      fake.links.push({ primary: primary.user_id, secondary: secondaryId });
      primary.identities = [...(primary.identities ?? []), { connection: String(provider), provider: String(provider), user_id: String(userId) }];
      fake.profiles.delete(secondaryId);
      res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify(primary.identities));
      return;
    }
    if (req.method === 'DELETE' && user) {
      if (role !== 'maintenance') return deny(role ? 403 : 401);
      const id = decodeURIComponent(user[1]);
      if (!fake.profiles.delete(id)) return deny(404);
      fake.deletedUsers.push(id);
      return deny(204);
    }
    if (req.method === 'GET' && url.pathname === '/api/v2/device-credentials') {
      if (role !== 'maintenance') return deny(role ? 403 : 401);
      const userId = url.searchParams.get('user_id');
      const clientId = url.searchParams.get('client_id');
      const type = url.searchParams.get('type');
      const list = [...fake.deviceCredentials.values()].filter((c) => c.user_id === userId && (!clientId || c.client_id === clientId) && (!type || c.type === type));
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(list.map(({ id, client_id, type: kind }) => ({ id, client_id, type: kind }))));
      return;
    }
    const credential = /^\/api\/v2\/device-credentials\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'DELETE' && credential) {
      if (role !== 'maintenance') return deny(role ? 403 : 401);
      return deny(fake.deviceCredentials.delete(decodeURIComponent(credential[1])) ? 204 : 404);
    }
    deny(404);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  return Object.assign(fake, {
    url: address,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  });
}
