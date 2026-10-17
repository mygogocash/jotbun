import { createHash, createHmac } from 'node:crypto';

import { MAX_OBJECT_BYTES, ObjectStoreError, assertObjectKey, assertObjectPrefix, collectBody } from './object-store';
import type { ObjectBody, ObjectInfo, ObjectStore } from './object-store';

export type S3Config = { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string };

type SignInput = { method: string; url: URL; headers: Record<string, string>; payloadHash: string; service: string; region: string; accessKeyId: string; secretAccessKey: string; now: Date };

const sha256Hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();
// RFC 3986 encoding, as SigV4 requires for query strings.
const rfc3986 = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * AWS Signature Version 4 (header form). Signs host, every header given, and
 * x-amz-content-sha256 / x-amz-date, and returns them with `authorization`.
 * The path is used as already encoded (S3 does not double-encode).
 */
export function signV4(request: SignInput): Record<string, string> {
  const amzDate = request.now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { host: request.url.host };
  for (const [name, value] of Object.entries(request.headers)) headers[name.toLowerCase()] = value.trim().replace(/\s+/g, ' ');
  headers['x-amz-content-sha256'] = request.payloadHash;
  headers['x-amz-date'] = amzDate;
  const names = Object.keys(headers).sort();
  const query = [...request.url.searchParams.entries()]
    .map(([name, value]) => [rfc3986(name), rfc3986(value)])
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
  const canonical = [
    request.method,
    request.url.pathname || '/',
    query,
    names.map((name) => `${name}:${headers[name]}\n`).join(''),
    names.join(';'),
    request.payloadHash,
  ].join('\n');
  const scope = `${day}/${request.region}/${request.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${request.secretAccessKey}`, day), request.region), request.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${request.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
  };
}

const EMPTY_SHA256 = sha256Hex('');

/** Releases a response body, then throws `outcome` if it is an error or returns it. */
async function discard<T>(response: Response, outcome: T): Promise<Exclude<T, Error>> {
  await response.body?.cancel().catch(() => undefined);
  if (outcome instanceof Error) throw outcome;
  return outcome as Exclude<T, Error>;
}
const unescapeXml = (value: string) =>
  value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (xml: string, name: string) => {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return match ? unescapeXml(match[1]) : null;
};

/**
 * An S3-compatible adapter (Cloudflare R2 in production) with path-style
 * requests and SigV4 signing - no SDK. PUTs are conditional
 * (`If-None-Match: *`, 412 → `exists`) and carry the body's SHA-256 both as
 * the signed payload hash and as `x-amz-meta-sha256`, which `head` reports
 * and `get` verifies. Bodies are buffered (at most MAX_OBJECT_BYTES) so they
 * can be hashed before upload. Errors carry only a code: never the endpoint,
 * the credentials or the provider's response text.
 */
export class S3ObjectStore implements ObjectStore {
  constructor(private readonly config: S3Config, private readonly fetchImpl: typeof fetch = fetch, private readonly maxBytes = MAX_OBJECT_BYTES) {}

  async putStream(key: string, body: ObjectBody, options: { contentType?: string; signal?: AbortSignal } = {}): Promise<{ bytes: number; sha256: string }> {
    assertObjectKey(key);
    const data = await collectBody(body, this.maxBytes, options.signal);
    const sha256 = sha256Hex(data);
    const response = await this.send('PUT', this.address(key), {
      'if-none-match': '*',
      'x-amz-meta-sha256': sha256,
      'content-type': options.contentType ?? 'application/octet-stream',
    }, data, sha256, options.signal);
    if (response.status === 412) return discard(response, new ObjectStoreError('exists'));
    if (!response.ok) return discard(response, new ObjectStoreError('unavailable'));
    await response.body?.cancel();
    return { bytes: data.byteLength, sha256 };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    assertObjectKey(key);
    const response = await this.send('HEAD', this.address(key));
    if (response.status === 404) return discard(response, null);
    if (!response.ok) return discard(response, new ObjectStoreError('unavailable'));
    return {
      key,
      bytes: Number(response.headers.get('content-length') ?? 0),
      sha256: response.headers.get('x-amz-meta-sha256') ?? '',
      lastModified: new Date(response.headers.get('last-modified') ?? 0),
    };
  }

  async get(key: string): Promise<Uint8Array | null> {
    assertObjectKey(key);
    const response = await this.send('GET', this.address(key));
    if (response.status === 404) return discard(response, null);
    if (!response.ok) return discard(response, new ObjectStoreError('unavailable'));
    if (Number(response.headers.get('content-length') ?? 0) > this.maxBytes) return discard(response, new ObjectStoreError('too_large'));
    const data = response.body ? await collectBody(response.body as unknown as AsyncIterable<Uint8Array>, this.maxBytes) : Buffer.alloc(0);
    const expected = response.headers.get('x-amz-meta-sha256');
    if (expected && expected !== sha256Hex(data)) throw new ObjectStoreError('unavailable');
    return new Uint8Array(data);
  }

  async delete(key: string): Promise<void> {
    assertObjectKey(key);
    const response = await this.send('DELETE', this.address(key));
    await discard(response, !response.ok && response.status !== 404 ? new ObjectStoreError('unavailable') : null);
  }

  async list(prefix: string): Promise<ObjectInfo[]> {
    assertObjectPrefix(prefix);
    const found: ObjectInfo[] = [];
    let token: string | null = null;
    do {
      const address = new URL(`${this.base()}/${encodeURIComponent(this.config.bucket)}`);
      address.searchParams.set('list-type', '2');
      address.searchParams.set('prefix', prefix);
      if (token) address.searchParams.set('continuation-token', token);
      const response = await this.send('GET', address);
      if (!response.ok) return discard(response, new ObjectStoreError('unavailable'));
      const xml = (await collectBody(response.body as unknown as AsyncIterable<Uint8Array>, 16 * 1024 * 1024)).toString('utf8');
      for (const [, entry] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const key = tag(entry, 'Key');
        if (key === null || !key.startsWith(prefix)) continue;
        found.push({ key, bytes: Number(tag(entry, 'Size') ?? 0), sha256: '', lastModified: new Date(tag(entry, 'LastModified') ?? 0) });
      }
      token = tag(xml, 'IsTruncated') === 'true' ? tag(xml, 'NextContinuationToken') : null;
    } while (token);
    return found.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  private base(): string {
    return this.config.endpoint.replace(/\/+$/, '');
  }

  private address(key: string): URL {
    return new URL(`${this.base()}/${encodeURIComponent(this.config.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`);
  }

  private async send(method: string, address: URL, headers: Record<string, string> = {}, body?: Buffer, payloadHash = EMPTY_SHA256, signal?: AbortSignal): Promise<Response> {
    const signed = signV4({ method, url: address, headers, payloadHash, service: 's3', region: this.config.region, accessKeyId: this.config.accessKeyId, secretAccessKey: this.config.secretAccessKey, now: new Date() });
    // fetch sets Host itself (from the URL, as signed).
    const { host: _host, ...sent } = signed;
    try {
      // Never follow a redirect: it could send the body (or the request) elsewhere.
      return await this.fetchImpl(address, { method, headers: sent, body: body ? new Uint8Array(body) : undefined, redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) });
    } catch {
      throw new ObjectStoreError('unavailable');
    }
  }
}

const R2_SETTINGS = ['R2_TEST_ENDPOINT', 'R2_TEST_BUCKET', 'R2_TEST_ACCESS_KEY_ID', 'R2_TEST_SECRET_ACCESS_KEY'] as const;
const TEST_BUCKET_PREFIX = 'gogospend-test-';

/**
 * Which store the storage contract runs against. The normal suite always uses
 * the failure adapter, whatever R2 settings exist. Only the hosted gate
 * (`npm run test:storage-contract`, which sets STORAGE_CONTRACT_SCRIPT=1) with
 * STORAGE_CONTRACT_TARGET=r2-test targets R2 - and only an https endpoint and
 * a bucket in the test scope (`gogospend-test-*`).
 */
export function storageContractTarget(env: NodeJS.ProcessEnv): { target: 'failure-adapter' } | { target: 'r2-test'; config: S3Config } {
  if (env.STORAGE_CONTRACT_SCRIPT !== '1' || env.STORAGE_CONTRACT_TARGET !== 'r2-test') return { target: 'failure-adapter' };
  const missing = R2_SETTINGS.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`The hosted storage contract needs ${missing.join(', ')}.`);
  const endpoint = env.R2_TEST_ENDPOINT as string;
  const bucket = env.R2_TEST_BUCKET as string;
  if (!/^https:\/\/[^/\s]+\/?$/.test(endpoint)) throw new Error('R2_TEST_ENDPOINT must be an https origin.');
  if (!bucket.startsWith(TEST_BUCKET_PREFIX)) throw new Error(`R2_TEST_BUCKET must be in the test scope (${TEST_BUCKET_PREFIX}*).`);
  return {
    target: 'r2-test',
    config: { endpoint, bucket, region: env.R2_TEST_REGION || 'auto', accessKeyId: env.R2_TEST_ACCESS_KEY_ID as string, secretAccessKey: env.R2_TEST_SECRET_ACCESS_KEY as string },
  };
}
