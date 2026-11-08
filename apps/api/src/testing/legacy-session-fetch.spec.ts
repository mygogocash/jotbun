// R90: legacySessionFetch, without a database. The app's own transport sends
// no session header (K13); through this wrapper it sends the binding.
import { createV1Transport } from '../../../app/src/api/client';
import { legacySessionFetch } from './legacy-session-fetch';

const BINDING = 'b'.repeat(43);

function recorder() {
  const calls: { url: string; init: RequestInit }[] = [];
  const inner = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { calls, inner };
}

function transport(fetchImpl: typeof fetch) {
  return createV1Transport({
    baseUrl: 'http://127.0.0.1:9',
    client: { platform: 'ios', version: '1.0.0' },
    credentials: { getAccessToken: async () => 'token-1', getSessionSnapshot: () => ({ binding: BINDING, epoch: 1 }) },
    fetchImpl,
  });
}

const isOk = (value: unknown): value is { ok: boolean } => typeof value === 'object' && value !== null;

test('the wrapper adds the session header and keeps the method, body, redirect and other headers', async () => {
  const { calls, inner } = recorder();
  await legacySessionFetch(BINDING, inner)('http://127.0.0.1:9/v1/wallets', { method: 'POST', body: '{"a":1}', redirect: 'error', headers: { Authorization: 'Bearer t' } });
  const [call] = calls;
  const headers = new Headers(call.init.headers);
  expect([call.url, call.init.method, call.init.body, call.init.redirect, headers.get('authorization'), headers.get('x-gogospend-session')])
    .toEqual(['http://127.0.0.1:9/v1/wallets', 'POST', '{"a":1}', 'error', 'Bearer t', BINDING]);
});

test('the app transport alone sends no session header (K13)', async () => {
  const { calls, inner } = recorder();
  await transport(inner).request('GET', '/v1/wallets', { validate: isOk });
  expect(new Headers(calls[0].init.headers).get('x-gogospend-session')).toBeNull();
});

test('through the wrapper, the app transport sends its binding as X-GoGoSpend-Session', async () => {
  const { calls, inner } = recorder();
  await transport(legacySessionFetch(BINDING, inner)).request('GET', '/v1/wallets', { validate: isOk });
  const headers = new Headers(calls[0].init.headers);
  expect([headers.get('x-gogospend-session'), headers.get('authorization'), headers.get('x-gogospend-client')]).toEqual([BINDING, 'Bearer token-1', 'ios/1.0.0']);
});
