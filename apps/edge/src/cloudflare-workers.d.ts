// The Workers runtime module the Cloudflare Vite plugin provides. Typed here
// with the bindings the edge reads (see src/server/env.ts and wrangler.jsonc).
// The Durable Object and KV names below are the global ones drizzle-orm's
// durable-sqlite types and @cloudflare/vitest-plugin's types refer to. They
// are declared here, not taken from @cloudflare/workers-types, which clashes
// with the DOM lib. Only what the vault and its tests use is declared.

// Durable Object SQLite storage.
type SqlStorageValue = ArrayBuffer | string | number | null

interface SqlStorageCursor<T> {
  toArray(): T[]
  one(): T
  next(): IteratorResult<T>
  raw(): IterableIterator<SqlStorageValue[]>
  [Symbol.iterator](): IterableIterator<T>
}

interface SqlStorage {
  // The database's size in bytes (the vault's SQLite file).
  readonly databaseSize: number
  // Rows are loosely typed: the schema, not the driver, says what a column holds.
  exec<T = Record<string, any>>(query: string, ...bindings: unknown[]): SqlStorageCursor<T>
}

interface DurableObjectStorage {
  readonly sql: SqlStorage
  transactionSync<T>(closure: () => T): T
  getAlarm(): Promise<number | null>
  setAlarm(scheduledTime: number | Date): Promise<void>
  deleteAlarm(): Promise<void>
  // Deletes every stored key, the SQLite database included.
  deleteAll(): Promise<void>
}

// Durable Object bindings. T names the class a stub reaches.
interface DurableObjectId {
  toString(): string
}

type DurableObjectLocationHint = 'wnam' | 'enam' | 'sam' | 'weur' | 'eeur' | 'apac' | 'oc' | 'afr' | 'me'

// The public methods of the class T, as a stub calls them over RPC: each one resolves with its result.
// A stub with no class (T = undefined) adds nothing; the object guard keeps the mapped type from turning undefined into never.
type DurableObjectRpc<T> = T extends object
  ? { [K in keyof T as T[K] extends (...args: never[]) => unknown ? K : never]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never }
  : unknown

type DurableObjectStub<T = undefined> = {
  readonly id: DurableObjectId
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
} & DurableObjectRpc<T>

interface DurableObjectNamespace<T = undefined> {
  idFromName(name: string): DurableObjectId
  idFromString(id: string): DurableObjectId
  get(id: DurableObjectId, options?: { locationHint?: DurableObjectLocationHint }): DurableObjectStub<T>
  getByName(name: string, options?: { locationHint?: DurableObjectLocationHint }): DurableObjectStub<T>
}

// Workflows and Queues bindings, as far as the vault's pending-work starters use them (1B-T4).
interface WorkflowInstanceCreateOptions<PARAMS = unknown> {
  id?: string
  params?: PARAMS
}

interface InstanceStatus {
  status: 'queued' | 'running' | 'paused' | 'errored' | 'terminated' | 'complete' | 'waiting' | 'waitingForPause' | 'unknown'
  error?: { name: string; message: string }
  output?: unknown
}

interface WorkflowInstance {
  readonly id: string
  status(): Promise<InstanceStatus>
}

interface Workflow<PARAMS = unknown> {
  // Throws when an instance with this id already exists.
  create(options?: WorkflowInstanceCreateOptions<PARAMS>): Promise<WorkflowInstance>
  // Throws when no instance has this id.
  get(id: string): Promise<WorkflowInstance>
}

interface Queue<Body = unknown> {
  send(message: Body, options?: { contentType?: 'json' | 'text' | 'bytes' | 'v8'; delaySeconds?: number }): Promise<void>
}

interface KVNamespace {
  get(key: string, type: 'text'): Promise<string | null>
  get(key: string, type: 'json'): Promise<unknown>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

// D1, as far as Better Auth's adapter and the auth tests use it.
interface D1Result<T = Record<string, unknown>> {
  results: T[]
  meta: {
    changes: number
    last_row_id: number
  }
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>
  exec(query: string): Promise<unknown>
}

// Email Service Workers API, as far as the mailer calls it (Task 2 sends).
interface EmailBinding {
  send(message: { to: string; from: string; subject: string; html: string; text: string }): Promise<{ messageId: string }>
}

// WebSockets in workerd, as far as the live socket and its tests use them
// (1D-T10; developers.cloudflare.com/durable-objects/best-practices/websockets).
// readyState is the DOM's.
interface WebSocket {
  /** Accepts the socket of a 101 response this Worker received, so it can send and receive. */
  accept(): void
  /** Kept with a hibernatable socket through hibernation: at most 16,384 bytes, structured-cloned. */
  serializeAttachment(value: unknown): void
  deserializeAttachment(): unknown
}

/** The two ends of a new socket: [client, server]. */
declare const WebSocketPair: { new (): { 0: WebSocket; 1: WebSocket } }

/** A request message and the response the runtime sends for it without waking the object. */
declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string)
  readonly request: string
  readonly response: string
}

interface ResponseInit {
  /** A 101 response's socket (the client end). */
  webSocket?: WebSocket | null
}

interface Response {
  readonly webSocket: WebSocket | null
}

// The bindings `env` is typed with. The vault Worker's configuration is
// wrangler.vault.jsonc; the test harness reads VAULT through `cloudflare:workers`.
declare namespace Cloudflare {
  interface Env extends Record<string, unknown> {
    VAULT: DurableObjectNamespace<import('./vault/user-vault').UserVault>
    CONFIG: KVNamespace
    OBJECTS: import('./vault/files/keys').VaultBucket
    AUTH_DB: D1Database
    AUTH_DB_REFERENCE: D1Database
    ERASURE_DB: D1Database
    TEST_AUTH_MIGRATIONS: { name: string; queries: string[] }[]
    TEST_ERASURE_MIGRATIONS: { name: string; queries: string[] }[]
    AUTH_BASE_URL?: string
    AUTH_ISSUER?: string
    AUTH_AUDIENCE?: string
    AUTH_TRUSTED_ORIGINS?: string
    BETTER_AUTH_SECRET?: string
    ERASURE_KEY?: string
    JOTBUN_ENV?: string
  }
}

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env
  /** Extends this invocation for `promise` without delaying the response (ctx.waitUntil). */
  export function waitUntil(promise: Promise<unknown>): void

  /** The Durable Object container API (ctx.container), as far as the parser uses it. */
  export interface ContainerLike {
    readonly running: boolean
    start(options?: { env?: Record<string, string>; enableInternet?: boolean; entrypoint?: string[] }): void
    monitor(): Promise<void>
    setInactivityTimeout(ms: number): Promise<void>
  }

  export interface DurableObjectStateLike {
    readonly id: DurableObjectId
    readonly container?: ContainerLike
    readonly storage: DurableObjectStorage
    blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>
    waitUntil(promise: Promise<unknown>): void
    // The WebSocket Hibernation API, as far as the live socket uses it (1D-T10).
    /** Accepts a socket the object keeps through hibernation, with at most 10 tags of 256 characters each. */
    acceptWebSocket(ws: WebSocket, tags?: string[]): void
    /** The accepted sockets, or only those carrying `tag`. */
    getWebSockets(tag?: string): WebSocket[]
    getTags(ws: WebSocket): string[]
    /** A message the runtime answers itself, without waking the object. */
    setWebSocketAutoResponse(pair?: WebSocketRequestResponsePair): void
  }

  export class DurableObject<Env = unknown> {
    constructor(ctx: DurableObjectStateLike, env: Env)
    protected readonly ctx: DurableObjectStateLike
    protected readonly env: Env
  }
}

/** The state a test's runInDurableObject callback receives. */
type DurableObjectState = import('cloudflare:workers').DurableObjectStateLike
