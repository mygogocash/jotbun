import { MemoryObjectStore } from './object-store';
import { objectStoreFromEnv } from './object-store-config';
import { S3ObjectStore } from './s3-object-store';

const r2 = { R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com', R2_BUCKET: 'gogospend-private', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret' };

describe('object store configuration', () => {
  it('uses the configured private R2 bucket', () => {
    expect(objectStoreFromEnv({ NODE_ENV: 'production', ...r2 })).toBeInstanceOf(S3ObjectStore);
  });

  it('fails visibly when production storage is missing, partial or not https', () => {
    expect(() => objectStoreFromEnv({ NODE_ENV: 'production' })).toThrow(/R2_ENDPOINT/);
    expect(() => objectStoreFromEnv({ NODE_ENV: 'production', ...r2, R2_SECRET_ACCESS_KEY: '' })).toThrow(/R2_SECRET_ACCESS_KEY/);
    expect(() => objectStoreFromEnv({ NODE_ENV: 'production', ...r2, R2_ENDPOINT: 'http://acct.r2.cloudflarestorage.com' })).toThrow(/https/);
  });

  it('allows the in-memory store only outside production, and only when asked for', () => {
    expect(objectStoreFromEnv({ NODE_ENV: 'development', OBJECT_STORE: 'memory' })).toBeInstanceOf(MemoryObjectStore);
    expect(() => objectStoreFromEnv({ NODE_ENV: 'production', OBJECT_STORE: 'memory', ...r2 })).toThrow(/production/);
    expect(() => objectStoreFromEnv({ NODE_ENV: 'development' })).toThrow(/R2_ENDPOINT/);
    expect(objectStoreFromEnv({ NODE_ENV: 'test', OBJECT_STORE: 'memory' })).toBeInstanceOf(MemoryObjectStore);
    for (const env of [undefined, 'staging', 'Production']) expect(() => objectStoreFromEnv({ NODE_ENV: env, OBJECT_STORE: 'memory' })).toThrow();
  });

  it('never accepts the hosted contract test bucket as the service bucket', () => {
    expect(() => objectStoreFromEnv({ NODE_ENV: 'production', ...r2, R2_BUCKET: 'gogospend-test-contract' })).toThrow(/test/);
  });
});
