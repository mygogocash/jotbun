// The ObjectStore contract. In the normal suite it runs against the
// deterministic failure adapter and against S3ObjectStore talking to a
// loopback fake S3 - never a real bucket, whatever R2 settings exist. Only
// `npm run test:storage-contract` with STORAGE_CONTRACT_TARGET=r2-test and the
// authorized test-scope configuration targets real R2 (hosted gate).
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { MemoryObjectStore, ObjectStoreError } from './object-store';
import type { ObjectStore } from './object-store';
import { S3ObjectStore, signV4, storageContractTarget } from './s3-object-store';
import type { S3Config } from './s3-object-store';

const ACCOUNT = '0b8a4d1e-6f0a-4c51-9a8e-2f5f6d1f9c11';
const JOB = '5f2c9d64-3b1e-4f7a-8c2d-9e0a1b2c3d4e';
const LEASE = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const key = (name: string) => `sync_snapshot/${ACCOUNT}/${JOB}/${LEASE}/${name}`;
const text = (value: string) => new TextEncoder().encode(value);
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
async function* chunks(...parts: string[]) {
  for (const part of parts) yield text(part);
}

/** A loopback S3 subset: conditional PUT, HEAD, GET, DELETE, ListObjectsV2. */
async function startFakeS3() {
  const objects = new Map<string, { body: Buffer; meta: Record<string, string>; modified: Date }>();
  const seen: { method: string; path: string; headers: Record<string, string | string[] | undefined> }[] = [];
  const server = createServer(async (req, res) => {
    let body = Buffer.alloc(0);
    for await (const chunk of req) body = Buffer.concat([body, chunk as Buffer]);
    const url = new URL(req.url ?? '/', 'http://fake');
    seen.push({ method: req.method ?? '', path: url.pathname, headers: req.headers });
    const auth = req.headers.authorization ?? '';
    if (!/^AWS4-HMAC-SHA256 Credential=test-access-key\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/.test(auth)) {
      res.writeHead(403).end();
      return;
    }
    const objectKey = decodeURIComponent(url.pathname.replace(/^\/test-bucket\/?/, ''));
    if (req.method === 'PUT') {
      if (req.headers['if-none-match'] === '*' && objects.has(objectKey)) return void res.writeHead(412).end();
      if (req.headers['x-amz-content-sha256'] !== createHash('sha256').update(body).digest('hex')) return void res.writeHead(400).end();
      objects.set(objectKey, { body, meta: { sha256: String(req.headers['x-amz-meta-sha256'] ?? '') }, modified: new Date() });
      return void res.writeHead(200).end();
    }
    if (req.method === 'GET' && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const contents = [...objects.entries()].filter(([k]) => k.startsWith(prefix))
        .map(([k, o]) => `<Contents><Key>${k}</Key><Size>${o.body.length}</Size><LastModified>${o.modified.toISOString()}</LastModified></Contents>`).join('');
      res.writeHead(200, { 'content-type': 'application/xml' });
      return void res.end(`<?xml version="1.0"?><ListBucketResult><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`);
    }
    const object = objects.get(objectKey);
    if (req.method === 'DELETE') {
      objects.delete(objectKey);
      return void res.writeHead(204).end();
    }
    if (!object) return void res.writeHead(404).end();
    const headers = { 'content-length': String(object.body.length), 'x-amz-meta-sha256': object.meta.sha256, 'last-modified': object.modified.toUTCString() };
    if (req.method === 'HEAD') return void res.writeHead(200, headers).end();
    res.writeHead(200, headers).end(object.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    endpoint: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    objects,
    seen,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let fake: Awaited<ReturnType<typeof startFakeS3>>;
beforeAll(async () => {
  fake = await startFakeS3();
});
afterAll(async () => {
  await fake.close();
});

const s3Config = (): S3Config => ({ endpoint: fake.endpoint, region: 'auto', bucket: 'test-bucket', accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key-not-real' });

// The hosted gate only (test:storage-contract with the authorized test scope).
const hosted = storageContractTarget(process.env);
const targets: [string, () => ObjectStore][] = [
  ['failure adapter', () => new MemoryObjectStore()],
  ['S3 adapter against a loopback fake', () => new S3ObjectStore(s3Config())],
];
if (hosted.target === 'r2-test') targets.push(['R2 test scope', () => new S3ObjectStore(hosted.config)]);

describe.each(targets)('ObjectStore contract: %s', (_name, make) => {
  let store: ObjectStore;
  const clear = async () => {
    for (const object of await store.list(`sync_snapshot/${ACCOUNT}/`)) await store.delete(object.key);
  };
  beforeEach(async () => {
    store = make();
    fake.objects.clear();
    await clear();
  });
  afterEach(async () => {
    await clear();
  });

  it('streams an object in, reports its size and sha256, and reads it back', async () => {
    const result = await store.putStream(key('a.json'), chunks('{"a":', '1}'), { contentType: 'application/json' });
    expect(result).toEqual({ bytes: 7, sha256: sha('{"a":1}') });
    expect(await store.head(key('a.json'))).toMatchObject({ key: key('a.json'), bytes: 7, sha256: sha('{"a":1}') });
    expect(new TextDecoder().decode((await store.get(key('a.json'))) as Uint8Array)).toBe('{"a":1}');
  });

  it('never overwrites an existing key', async () => {
    await store.putStream(key('a.json'), text('first'));
    await expect(store.putStream(key('a.json'), text('second'))).rejects.toMatchObject({ code: 'exists' });
    expect(new TextDecoder().decode((await store.get(key('a.json'))) as Uint8Array)).toBe('first');
  });

  it('lists by prefix, and deletes idempotently', async () => {
    await store.putStream(key('a.json'), text('a'));
    await store.putStream(key('b.json'), text('bb'));
    expect((await store.list(`sync_snapshot/${ACCOUNT}/`)).map((o) => [o.key, o.bytes]).sort()).toEqual([[key('a.json'), 1], [key('b.json'), 2]]);
    await store.delete(key('a.json'));
    await store.delete(key('a.json'));
    expect(await store.head(key('a.json'))).toBeNull();
    expect(await store.get(key('a.json'))).toBeNull();
  });

  it.each([['../escape'], ['/abs/path'], ['sync_snapshot/x/../y'], [''], ['UPPER/case'], ['a b']])('refuses the key %p', async (bad) => {
    await expect(store.putStream(bad, text('x'))).rejects.toBeInstanceOf(ObjectStoreError);
  });

  it('has no way to produce a public URL', () => {
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(store)).filter((name) => /url|presign|public/i.test(name))).toEqual([]);
  });
});

describe('deterministic failures', () => {
  it('can fail a PUT before writing, or crash after the write landed', async () => {
    const store = new MemoryObjectStore();
    store.failNext('put');
    await expect(store.putStream(key('a.json'), text('x'))).rejects.toMatchObject({ code: 'unavailable' });
    expect(await store.head(key('a.json'))).toBeNull();
    store.failNext('put', 'crash_after_write');
    await expect(store.putStream(key('a.json'), text('x'))).rejects.toThrow();
    expect(await store.head(key('a.json'))).not.toBeNull();
  });
});

describe('S3 request signing', () => {
  it("matches AWS's published SigV4 example (GET Object)", () => {
    const headers = signV4({
      method: 'GET',
      url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'),
      headers: { range: 'bytes=0-9' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      service: 's3',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(headers.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });

  it('sends signed, conditional, checksummed PUTs and never puts credentials in errors', async () => {
    const store = new S3ObjectStore(s3Config());
    fake.objects.clear();
    fake.seen.length = 0;
    await store.putStream(key('a.json'), text('x'));
    const put = fake.seen.find((request) => request.method === 'PUT');
    expect(put?.headers['if-none-match']).toBe('*');
    expect(put?.headers['x-amz-content-sha256']).toBe(sha('x'));
    const broken = new S3ObjectStore({ ...s3Config(), accessKeyId: 'wrong-key' });
    const error = await broken.putStream(key('b.json'), text('x')).catch((caught: unknown) => caught as Error);
    expect(error).toBeInstanceOf(ObjectStoreError);
    expect(String((error as Error).message)).not.toMatch(/wrong-key|test-secret/);
  });
});

describe('which store the contract targets', () => {
  const r2 = { R2_TEST_ENDPOINT: 'https://acct.r2.cloudflarestorage.com', R2_TEST_BUCKET: 'gogospend-test-contract', R2_TEST_ACCESS_KEY_ID: 'id', R2_TEST_SECRET_ACCESS_KEY: 'secret' };

  it('the normal suite always uses the failure adapter, even with R2 settings present', () => {
    expect(storageContractTarget({ ...r2 }).target).toBe('failure-adapter');
    expect(storageContractTarget({ ...r2, STORAGE_CONTRACT_TARGET: 'r2-test' }).target).toBe('failure-adapter');
  });

  it('the hosted run refuses missing configuration or a bucket outside the test scope', () => {
    const script = { STORAGE_CONTRACT_SCRIPT: '1', STORAGE_CONTRACT_TARGET: 'r2-test' };
    expect(() => storageContractTarget(script)).toThrow(/R2_TEST_/);
    expect(() => storageContractTarget({ ...script, ...r2, R2_TEST_BUCKET: 'gogospend-production' })).toThrow(/test scope/);
    expect(() => storageContractTarget({ ...script, ...r2, R2_TEST_ENDPOINT: 'http://acct.r2.cloudflarestorage.com' })).toThrow(/https/);
    expect(storageContractTarget({ ...script, ...r2 })).toMatchObject({ target: 'r2-test', config: { bucket: 'gogospend-test-contract', region: 'auto' } });
  });
});
