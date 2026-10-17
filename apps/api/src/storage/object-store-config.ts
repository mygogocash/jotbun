import { MemoryObjectStore } from './object-store';
import type { ObjectStore } from './object-store';
import { S3ObjectStore } from './s3-object-store';

const SETTINGS = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const;

/**
 * The service's private object store: the R2 bucket in R2_* (https only, never
 * the hosted contract's `gogospend-test-*` scope). `OBJECT_STORE=memory` is a
 * local-development store that loses everything on restart, refused in
 * production. Missing configuration fails at startup, not on first use.
 */
export function objectStoreFromEnv(env: NodeJS.ProcessEnv): ObjectStore {
  if (env.OBJECT_STORE === 'memory') {
    if (env.NODE_ENV === 'production') throw new Error('OBJECT_STORE=memory is not allowed in production.');
    return new MemoryObjectStore();
  }
  const missing = SETTINGS.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Object storage is not configured: set ${missing.join(', ')}.`);
  const endpoint = env.R2_ENDPOINT as string;
  const bucket = env.R2_BUCKET as string;
  if (!/^https:\/\/[^/\s]+\/?$/.test(endpoint)) throw new Error('R2_ENDPOINT must be an https origin.');
  if (bucket.startsWith('gogospend-test-')) throw new Error('R2_BUCKET names a test-scope bucket.');
  return new S3ObjectStore({ endpoint, bucket, region: env.R2_REGION || 'auto', accessKeyId: env.R2_ACCESS_KEY_ID as string, secretAccessKey: env.R2_SECRET_ACCESS_KEY as string });
}
