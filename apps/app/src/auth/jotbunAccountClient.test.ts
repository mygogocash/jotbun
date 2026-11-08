import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAuthClient } from 'better-auth/client';

import { createBetterAuthPort } from './betterAuthPort.ts';
import type { ClientResult } from './betterAuthPort.ts';
import { jotbunAccountClient } from './jotbunAccountClient.ts';
import { NO_NATIVE_SIGN_IN } from './nativeSignIn.ts';
import { createFakeAuthServer } from './testing/fakeAuthServer.ts';

type Sent = { method: string; path: string; type: string | null; body: string | null };

/** Better Auth's own client with our plugin, over a fetch that records each request and answers 204 with no body (plan Task 4). */
function realClient() {
  const sent: Sent[] = [];
  const client = createAuthClient({
    baseURL: 'http://localhost:8092',
    fetchOptions: {
      customFetchImpl: async (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(input instanceof Request ? input.url : String(input), init);
        sent.push({ method: request.method, path: new URL(request.url).pathname, type: request.headers.get('content-type'), body: request.body === null ? null : await request.text() });
        return new Response(null, { status: 204 });
      },
    },
    plugins: [jotbunAccountClient()],
  });
  return { client, sent };
}

/** The same reading as `answered` in betterAuthClient.ts, which imports native modules and cannot load here. */
async function asRead(answer: Promise<{ data: unknown; error: { status: number } | null }>): Promise<ClientResult<unknown>> {
  const result = await answer;
  return result.error ? { data: null, error: { status: result.error.status } } : { data: result.data, error: null };
}

test('the jotbun sign-out routes are sent as JSON, with an empty object when there is nothing to send', async () => {
  const { client, sent } = realClient();
  await client.signOutDevice({ id: 'device-id' });
  await client.signOutOtherDevices();
  await client.signOutEverywhere();
  assert.deepEqual(sent, [
    { method: 'POST', path: '/api/auth/jotbun/devices/sign-out', type: 'application/json', body: '{"id":"device-id"}' },
    { method: 'POST', path: '/api/auth/jotbun/devices/sign-out-others', type: 'application/json', body: '{}' },
    { method: 'POST', path: '/api/auth/jotbun/sign-out-everywhere', type: 'application/json', body: '{}' },
  ]);
});

test("a 204 from a jotbun sign-out route, read by Better Auth's own client, is success at the port", async () => {
  const { client } = realClient();
  assert.deepEqual(await client.signOutDevice({ id: 'device-id' }), { data: null, error: null }, "Better Auth's client reads an empty 204 as null");
  const fake = createFakeAuthServer();
  const port = createBetterAuthPort({
    native: NO_NATIVE_SIGN_IN,
    client: {
      ...fake.client,
      signOutDevice: (id) => asRead(client.signOutDevice({ id })),
      signOutEverywhere: () => asRead(client.signOutEverywhere()),
    },
  });
  await assert.doesNotReject(() => port.signOutDevice('device-id'));
  await assert.doesNotReject(() => port.signOutEverywhere());
});
