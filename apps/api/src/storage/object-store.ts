import { createHash } from 'node:crypto';

/** `sha256` is lowercase hex; listings that cannot carry it report ''. */
export type ObjectInfo = { key: string; bytes: number; sha256: string; lastModified: Date };
export type ObjectBody = Uint8Array | AsyncIterable<Uint8Array>;

/**
 * Private object storage on server-generated keys. Never returns a public URL.
 * `putStream` refuses to overwrite an existing key.
 */
export interface ObjectStore {
  putStream(key: string, body: ObjectBody, options?: { contentType?: string; signal?: AbortSignal }): Promise<{ bytes: number; sha256: string }>;
  head(key: string): Promise<ObjectInfo | null>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<ObjectInfo[]>;
}

export class ObjectStoreError extends Error {
  readonly code: 'exists' | 'invalid_key' | 'unavailable' | 'too_large';
  constructor(code: ObjectStoreError['code']) {
    super(`Object store: ${code}`);
    this.name = 'ObjectStoreError';
    this.code = code;
  }
}

// <purpose>/<segment>/.../<segment>: a lowercase purpose, then up to eight
// segments that start with a letter or digit - so no `..`, no leading `/`, no
// spaces. Server-generated; never derived from a user-supplied file name.
const KEY = /^[a-z][a-z0-9_]{0,31}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}){1,8}$/;
const PREFIX = /^[a-z][a-z0-9_]{0,31}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}){0,8}\/?$/;

export function assertObjectKey(key: string): void {
  if (typeof key !== 'string' || !KEY.test(key)) throw new ObjectStoreError('invalid_key');
}

export function assertObjectPrefix(prefix: string): void {
  if (typeof prefix !== 'string' || !PREFIX.test(prefix)) throw new ObjectStoreError('invalid_key');
}

/** The largest object any adapter accepts (bodies are hashed before upload). */
export const MAX_OBJECT_BYTES = 64 * 1024 * 1024;

/** Reads a body into memory, refusing more than `maxBytes`. */
export async function collectBody(body: ObjectBody, maxBytes = MAX_OBJECT_BYTES, signal?: AbortSignal): Promise<Buffer> {
  if (body instanceof Uint8Array) {
    if (body.byteLength > maxBytes) throw new ObjectStoreError('too_large');
    return Buffer.from(body);
  }
  const parts: Buffer[] = [];
  let total = 0;
  for await (const part of body) {
    signal?.throwIfAborted();
    total += part.byteLength;
    if (total > maxBytes) throw new ObjectStoreError('too_large');
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts, total);
}

export type FailureMode = 'error' | 'crash_after_write';

type Stored = { body: Buffer; sha256: string; lastModified: Date };

/**
 * The in-memory adapter: the contract's reference and the deterministic
 * failure adapter for tests. `failNext` makes the next call of an operation
 * fail before it acts, or (PUT only) after the write landed - a worker that
 * died between its PUT and its database commit.
 */
export class MemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, Stored>();
  private readonly failures = new Map<'put' | 'delete' | 'list', FailureMode>();

  constructor(private readonly maxBytes = MAX_OBJECT_BYTES) {}

  failNext(operation: 'put' | 'delete' | 'list', mode: FailureMode = 'error'): void {
    if (mode === 'crash_after_write' && operation !== 'put') throw new RangeError('only a PUT can crash after writing');
    this.failures.set(operation, mode);
  }

  async putStream(key: string, body: ObjectBody, options: { contentType?: string; signal?: AbortSignal } = {}): Promise<{ bytes: number; sha256: string }> {
    assertObjectKey(key);
    const failure = this.take('put');
    if (failure === 'error') throw new ObjectStoreError('unavailable');
    const data = await collectBody(body, this.maxBytes, options.signal);
    if (this.objects.has(key)) throw new ObjectStoreError('exists');
    const sha256 = createHash('sha256').update(data).digest('hex');
    this.objects.set(key, { body: data, sha256, lastModified: new Date() });
    if (failure === 'crash_after_write') throw new ObjectStoreError('unavailable');
    return { bytes: data.byteLength, sha256 };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    assertObjectKey(key);
    const object = this.objects.get(key);
    return object ? { key, bytes: object.body.byteLength, sha256: object.sha256, lastModified: object.lastModified } : null;
  }

  async get(key: string): Promise<Uint8Array | null> {
    assertObjectKey(key);
    const object = this.objects.get(key);
    return object ? new Uint8Array(object.body) : null;
  }

  async delete(key: string): Promise<void> {
    assertObjectKey(key);
    if (this.take('delete')) throw new ObjectStoreError('unavailable');
    this.objects.delete(key);
  }

  async list(prefix: string): Promise<ObjectInfo[]> {
    assertObjectPrefix(prefix);
    if (this.take('list')) throw new ObjectStoreError('unavailable');
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, object]) => ({ key, bytes: object.body.byteLength, sha256: object.sha256, lastModified: object.lastModified }));
  }

  private take(operation: 'put' | 'delete' | 'list'): FailureMode | undefined {
    const mode = this.failures.get(operation);
    this.failures.delete(operation);
    return mode;
  }
}
