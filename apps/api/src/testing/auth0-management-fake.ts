// A loopback stand-in for Auth0's Management API (client-credentials token
// and GET /api/v2/users/:id). Synthetic only; never a real tenant.
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

export const FAKE_PROFILE_CLIENT_ID = 'profile-client-test';
export const FAKE_PROFILE_CLIENT_SECRET = 'synthetic-profile-secret-not-real';

export type FakeProfile = { user_id: string; email_verified?: boolean; blocked?: boolean; identities?: { connection: string; provider: string; user_id: string }[] };
export type RecordedRequest = { method: string; url: string; authorization?: string; body: string };

export type ManagementFake = {
  url: string;
  profiles: Map<string, FakeProfile>;
  requests: RecordedRequest[];
  /** 'ok' answers; 'down' returns 503 for profiles; 'token-down' fails the token endpoint; 'hang' never answers. */
  mode: 'ok' | 'down' | 'token-down' | 'hang';
  close(): Promise<void>;
};

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  return body;
}

export async function startManagementFake(): Promise<ManagementFake> {
  let tokens = 0;
  const fake = { mode: 'ok' as ManagementFake['mode'], profiles: new Map<string, FakeProfile>(), requests: [] as RecordedRequest[] };
  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    fake.requests.push({ method: req.method ?? '', url: req.url ?? '', authorization: req.headers.authorization, body });
    if (fake.mode === 'hang') return;
    if (req.method === 'POST' && req.url === '/oauth/token') {
      const grant = JSON.parse(body || '{}') as Record<string, string>;
      if (fake.mode === 'token-down' || grant.client_id !== FAKE_PROFILE_CLIENT_ID || grant.client_secret !== FAKE_PROFILE_CLIENT_SECRET) {
        res.writeHead(fake.mode === 'token-down' ? 503 : 401).end();
        return;
      }
      tokens += 1;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ access_token: `mgmt-token-${tokens}`, expires_in: 86_400, token_type: 'Bearer' }));
      return;
    }
    const match = /^\/api\/v2\/users\/([^?]+)/.exec(req.url ?? '');
    if (req.method === 'GET' && match) {
      if (fake.mode === 'down') {
        res.writeHead(503).end();
        return;
      }
      if (!/^Bearer mgmt-token-\d+$/.test(req.headers.authorization ?? '')) {
        res.writeHead(401).end();
        return;
      }
      const profile = fake.profiles.get(decodeURIComponent(match[1]));
      if (!profile) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(profile));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  return Object.assign(fake, {
    url,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  });
}
