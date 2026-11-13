import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ApiError, V1Error, createMobileApiClient, createV1Transport } from './client.ts';
import type { V1Credentials } from './client.ts';

let baseUrl = '';
let requests = 0;
const server = createServer(async (req, res) => {
  requests += 1;
  if (req.url === '/spend/denied') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Spend access is off', code: 'SPEND_DISABLED' }));
    return;
  }
  let body = '';
  for await (const chunk of req) body += chunk.toString();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ authorization: req.headers.authorization, contentType: req.headers['content-type'], method: req.method, body, session: req.headers['x-gogospend-session'] ?? null, analytics: req.headers['x-gogospend-analytics'] ?? null }));
});
before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(() => new Promise<void>((resolve) => server.close(() => resolve())));

test('signed-out reads fail before any network request', async () => {
  const before = requests;
  const client = createMobileApiClient({ baseUrl, getToken: async () => null });
  await assert.rejects(client.get('/spend/summary'), (error: unknown) => error instanceof ApiError && error.status === 401 && error.code === 'SESSION_REQUIRED');
  assert.equal(requests, before);
});

test('JSON writes send the active bearer credential and preserve integer satang', async () => {
  const client = createMobileApiClient({ baseUrl, getToken: async () => 'synthetic-test-session' });
  const result = await client.post<{authorization: string; contentType: string; method: string; body: string}>('/spend/txs', { amount_minor: 12345 });
  assert.equal(result.authorization, 'Bearer synthetic-test-session');
  assert.equal(result.contentType, 'application/json');
  assert.equal(result.method, 'POST');
  assert.deepEqual(JSON.parse(result.body), { amount_minor: 12345 });
});

test('multipart uploads let the runtime generate a matching boundary', async () => {
  const client = createMobileApiClient({ baseUrl, getToken: async () => 'synthetic-test-session' });
  const form = new FormData();
  form.append('file', new Blob(['amount\n100']), 'sample.csv');
  const result = await client.postFormData<{contentType: string; body: string}>('/spend/imports', form);
  assert.match(result.contentType, /^multipart\/form-data; boundary=/);
  assert.ok(result.body.includes(result.contentType.split('boundary=')[1]));
  assert.ok(result.body.includes('filename="sample.csv"'));
});

test('server failures stay failures with their actionable code', async () => {
  const client = createMobileApiClient({ baseUrl, getToken: async () => 'synthetic-test-session' });
  await assert.rejects(client.get('/spend/denied'), (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === 'SPEND_DISABLED');
});

test('absolute URLs cannot receive session credentials', async () => {
  const before = requests;
  const client = createMobileApiClient({ baseUrl, getToken: async () => 'synthetic-test-session' });
  await assert.rejects(client.get('https://example.com/steal'), /relative API path/i);
  assert.equal(requests, before);
});

test('a development build may reach wrangler dev on the LAN; a release build may not', () => {
  const credentials: V1Credentials = { getAccessToken: async () => null, getSessionSnapshot: () => ({ binding: null, epoch: 1 }) };
  const refused = (error: unknown) => error instanceof V1Error && error.code === 'CONFIG_REQUIRED';
  const transport = (baseUrl: string, allowLanHttp?: boolean) => () => createV1Transport({ baseUrl, credentials, client: null, allowLanHttp });
  for (const url of ['http://192.168.1.20:8787', 'http://10.0.0.5:8787', 'http://172.16.4.2:8787']) {
    assert.doesNotThrow(transport(url, true), url);
  }
  for (const url of ['http://172.32.0.1:8787', 'http://8.8.8.8', 'http://jotbun.local:8787']) {
    assert.throws(transport(url, true), refused, url);
  }
  for (const url of ['http://192.168.1.20:8787', 'http://10.0.0.5:8787', 'http://172.16.4.2:8787', 'http://8.8.8.8']) {
    assert.throws(transport(url, false), refused, `${url} with allowLanHttp false`);
    assert.throws(transport(url), refused, `${url} with allowLanHttp absent`);
  }
  assert.doesNotThrow(transport('http://localhost:8787'));
  assert.doesNotThrow(transport('https://api.example.com'));
});

test('a v1 request with no session id is refused before anything is sent', async () => {
  const before = requests;
  const transport = createV1Transport({
    baseUrl,
    client: { platform: 'ios', version: '1.2.3' },
    credentials: { getAccessToken: async () => 'token-1', getSessionSnapshot: () => ({ binding: null, epoch: 1 }) },
  });
  await assert.rejects(
    () => transport.request('GET', '/v1/wallets', { validate: (value): value is { ok: boolean } => typeof value === 'object' && value !== null }),
    (error: unknown) => error instanceof V1Error && error.outcome === 'signed_out' && error.status === 0,
  );
  assert.equal(requests, before);
});

test('a bound v1 request sends no X-GoGoSpend-Session header', async () => {
  const transport = createV1Transport({
    baseUrl,
    client: { platform: 'ios', version: '1.2.3' },
    credentials: { getAccessToken: async () => 'token-1', getSessionSnapshot: () => ({ binding: 'b'.repeat(43), epoch: 1 }) },
  });
  const result = await transport.request('GET', '/v1/wallets', {
    validate: (value): value is { session: string | null } => typeof value === 'object' && value !== null && 'session' in value,
  });
  assert.equal(result.session, null);
});

test('acceptLanguage sends Accept-Language and nothing else changes', async () => {
  const sent: Record<string, string>[] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    sent.push(Object.fromEntries(new Headers(init?.headers).entries()));
    return new Response('{}', { status: 202, headers: { 'Content-Type': 'application/json' } });
  };
  const transport = createV1Transport({
    baseUrl,
    client: { platform: 'ios', version: '1.2.3' },
    credentials: { getAccessToken: async () => 'token-1', getSessionSnapshot: () => ({ binding: 'b'.repeat(43), epoch: 1 }) },
    fetchImpl,
  });
  const send = (acceptLanguage?: 'th' | 'en') =>
    transport.request('POST', '/v1/me/deletion', {
      body: { proof_id: '0a000000-0000-4000-8000-00000000000a' },
      command: { id: '0c000000-0000-4000-8000-00000000000c', schemaVersion: 1 },
      acceptLanguage,
      validate: (value): value is object => typeof value === 'object' && value !== null,
    });
  await send();
  await send('th');
  await send('en');
  const [without, thai, english] = sent;
  assert.equal(without['accept-language'], undefined);
  assert.deepEqual(thai, { ...without, 'accept-language': 'th' });
  assert.deepEqual(english, { ...without, 'accept-language': 'en' });
});

test('a response from the previous account cannot become the current diary', async () => {
  let reads = 0;
  const client = createMobileApiClient({ baseUrl, getToken: async () => ++reads === 1 ? 'account-a' : 'account-b' });
  await assert.rejects(client.get('/spend/summary'), (error: unknown) => error instanceof ApiError && error.code === 'SESSION_CHANGED');
});

test("requests carry X-GoGoSpend-Analytics: off unless this phone's answer is yes", async () => {
  const send = async (analyticsOff?: () => boolean) => {
    const transport = createV1Transport({
      baseUrl,
      client: { platform: 'ios', version: '1.2.3' },
      credentials: { getAccessToken: async () => 'token-1', getSessionSnapshot: () => ({ binding: 'b'.repeat(43), epoch: 1 }) },
      analyticsOff,
    });
    const result = await transport.request('GET', '/v1/wallets', {
      validate: (value): value is { analytics: string | null } => typeof value === 'object' && value !== null && 'analytics' in value,
    });
    return result.analytics;
  };
  assert.equal(await send(() => true), 'off');
  assert.equal(await send(() => false), null);
  assert.equal(await send(), null);
  // Read at each request: an answer that changes applies to the next one.
  let off = true;
  const transport = createV1Transport({
    baseUrl,
    client: { platform: 'ios', version: '1.2.3' },
    credentials: { getAccessToken: async () => 'token-1', getSessionSnapshot: () => ({ binding: 'b'.repeat(43), epoch: 1 }) },
    analyticsOff: () => off,
  });
  const read = () => transport.request('GET', '/v1/wallets', {
    validate: (value): value is { analytics: string | null } => typeof value === 'object' && value !== null && 'analytics' in value,
  });
  assert.equal((await read()).analytics, 'off');
  off = false;
  assert.equal((await read()).analytics, null);
});
