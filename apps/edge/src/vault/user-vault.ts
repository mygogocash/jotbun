import { DurableObject } from 'cloudflare:workers'
import type { DurableObjectStateLike } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import type { DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'

import type { CommandRegistry } from '@api/commands/command-registry'
import { commandDigesterFromEnv } from '@api/commands/command-digest'
import type { CommandDigester } from '@api/commands/command-digest'

import type { VaultCall, VaultReply } from '../v1/protocol'
import { stepRouteOf, vaultRouteOf } from '../v1/routes'
import { buildVaultRegistry } from './commands/registry'
import type { VaultContext } from './context'
import { LIVE_CLOSE, acceptLive, afterVaultWork, closeSocket, currentRevision, isLiveRequest, liveClaimsOf, liveRefusal } from './live'
import { VAULT_MIGRATIONS } from './migrations'
import { assertPolicyAccepted } from './policies'
import { RateBuckets } from './rate-limits'
import { toProblemReply } from './replies'
import { armAlarm, committedRevision, runDue } from './retention'
import { VAULT_HANDLERS } from './routes'
import { assertSession, ensureAccount } from './session'
import { vaultSchema } from './schema'
import type { VaultBucket } from './files/keys'
import { ObjectStoreError } from '@api/storage/object-store'
import { readGates } from '../v1/config'
import type { FileContext } from './files/context'
import { startPendingWork as startPending } from './files/work'
import type { ParseMessage } from '../background/parse-consumer'
import type { ImageFormat, ParseFormat } from '@api/imports/parsers/protocol'
import { failParse as failParseIn, parseSource as parseSourceIn, recordPreview as recordPreviewIn, reserveImageKey as reserveImageKeyIn, retryParse as retryParseIn } from './files/parse'
import type { ParseSource, ParsedPreview } from './files/parse'

/** The bindings the vault reads: the command digest keys, the environment name, the private object bucket and config:v1's KV (for the gates of background work). */
export type VaultEnv = {
  COMMAND_DIGEST_KEY?: string
  COMMAND_DIGEST_PREVIOUS_KEYS?: string
  JOTBUN_ENV?: string
  OBJECTS?: VaultBucket
  CONFIG?: KVNamespace
  PARSE_QUEUE?: Queue<ParseMessage>
}

export type VaultDb = DrizzleSqliteDODatabase<typeof vaultSchema>

/**
 * One person's ledger. Every wake runs the constructor before any request: it
 * migrates the SQLite storage inside blockConcurrencyWhile, so no request sees
 * a half-migrated vault, and a vault that is already current skips the work.
 */
export class UserVault extends DurableObject<VaultEnv> {
  readonly db: VaultDb
  /** The vault's clock, read once per call. Tests replace it. */
  clock: () => Date = () => new Date()
  /** Set by erase(). An erased instance refuses every call. */
  erased = false
  /** When startPendingWork last ran (epoch ms on the vault clock), or null. Memory only: a vault that wakes starts again at once. */
  lastStartAttemptMs: number | null = null
  private readonly rates = new RateBuckets(() => this.clock().getTime())
  private services: { registry: CommandRegistry; digester: CommandDigester } | undefined

  constructor(ctx: DurableObjectStateLike, env: VaultEnv) {
    super(ctx, env)
    this.db = drizzle(ctx.storage, { schema: vaultSchema })
    void ctx.blockConcurrencyWhile(() => migrate(this.db, VAULT_MIGRATIONS))
    // Keepalive (1D-T10): the runtime answers `ping` with `pong` and never wakes the vault for it.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'))
  }

  /**
   * Erases this vault durably (B22, §6.12): cancels its alarm, deletes its
   * storage, then re-runs the migrations and writes one marker row, an account
   * with status `deleted` and no account id. The instance refuses every call from
   * now on, and once it sleeps `ensureAccount` still refuses it, so an erased
   * vault never makes an account again. Erasing it again leaves the same marker.
   */
  async erase(): Promise<void> {
    this.erased = true
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    await this.ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, VAULT_MIGRATIONS)
      const at = this.clock().toISOString()
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec("INSERT INTO account_state (id, account_id, status, not_before, created_at) VALUES (1, '', 'deleted', 0, ?)", at)
      })
    })
  }

  /**
   * The vault's alarm (§6.2 "Alarms", 1A-T8b): runs the retention jobs that are
   * due, then sets the alarm to the earliest job left, or deletes it. A failed job
   * brings the alarm back a minute later, never in a loop. An erased vault does
   * nothing: erase() already cancelled the alarm.
   */
  async alarm(): Promise<void> {
    if (this.erased) return
    // A purge pokes every phone (1D-T10): no session is the caller.
    const before = currentRevision(this.ctx.storage.sql)
    const c = { sql: this.ctx.storage.sql, storage: this.ctx.storage, now: this.clock() }
    try {
      armAlarm(c, runDue(c))
    } finally {
      this.afterCall(before, null)
    }
  }

  /**
   * One call from the Worker, under the vault's checks in this order: the
   * account (an owner mismatch is refused), the principal's budget, the session,
   * the session's read or write budget, the current policy when the route needs
   * it, then the route's handler. A step of a request already in progress
   * (`charge: 'step'`) skips both budgets. `recent_proof` is policy-exempt,
   * like `bound_session`. A step-only id has no HTTP route; it resolves through
   * the step table. Every error becomes a reply.
   */
  call(call: VaultCall): VaultReply {
    if (this.erased) return { ok: false, status: 403, code: 'ACCOUNT_UNAVAILABLE', problem: {} }
    // Live pokes (1D-T10): the revision before the block, compared after it whatever the outcome.
    const before = currentRevision(this.ctx.storage.sql)
    try {
      const route = vaultRouteOf(call.route) ?? stepRouteOf(call.route)
      const handler = VAULT_HANDLERS[call.route]
      if (!route || !handler) throw new Error('a vault call names no ported route')
      // A step marked anySession runs after its request's session ended or its policy changed (1B-T5).
      const anySession = stepRouteOf(call.route)?.anySession === true
      const services = this.built()
      const { reply, committed } = this.ctx.storage.transactionSync(() => {
        const c: VaultContext = {
          db: this.db,
          sql: this.ctx.storage.sql,
          storage: this.ctx.storage,
          registry: services.registry,
          digester: services.digester,
          claims: call.claims,
          policies: call.policies,
          now: this.clock(),
          vaultId: this.vaultId,
        }
        ensureAccount(c)
        if (call.charge !== 'step') this.rates.charge('principal', call.claims.accountId)
        if (!anySession) assertSession(c)
        if (call.charge !== 'step') this.rates.charge(call.charge, call.claims.sessionId)
        if (call.access === 'current_policy' && !anySession) assertPolicyAccepted(c)
        const before = committedRevision(c)
        const result = handler(c, call)
        return { reply: result, committed: committedRevision(c) === before ? undefined : c }
      })
      // A call that committed a command moves the alarm, outside the block (1A-T8b).
      if (committed) armAlarm(committed)
      return reply
    } catch (error) {
      return toProblemReply(error)
    } finally {
      this.afterCall(before, call.claims.sessionId)
    }
  }

  /** The registry and digester, built on the first call and kept for this instance. */
  private built(): { registry: CommandRegistry; digester: CommandDigester } {
    this.services ??= {
      registry: buildVaultRegistry(),
      digester: commandDigesterFromEnv({ COMMAND_DIGEST_KEY: this.env.COMMAND_DIGEST_KEY, COMMAND_DIGEST_PREVIOUS_KEYS: this.env.COMMAND_DIGEST_PREVIOUS_KEYS }),
    }
    return this.services
  }

  // The live socket (1D-T10, §6.5): the Worker's live route hands the upgrade to fetch.

  /**
   * Only GET https://vault.internal/live with `upgrade: websocket` and the
   * claims the Worker verified; anything else is 404. An erased vault refuses
   * before it reads a table (403). Then, in one block, call()'s checks in
   * call()'s order: the account, the principal's budget, the session and the
   * read budget. Only then is the socket accepted. A refusal is a v1 problem
   * and never upgrades.
   */
  async fetch(request: Request): Promise<Response> {
    if (!isLiveRequest(request)) return new Response(null, { status: 404 })
    try {
      const claims = liveClaimsOf(request, this.erased)
      const now = this.clock()
      const services = this.built()
      this.ctx.storage.transactionSync(() => {
        const c: VaultContext = {
          db: this.db,
          sql: this.ctx.storage.sql,
          storage: this.ctx.storage,
          registry: services.registry,
          digester: services.digester,
          claims,
          policies: null,
          now,
          vaultId: this.vaultId,
        }
        ensureAccount(c)
        this.rates.charge('principal', claims.accountId)
        assertSession(c)
        this.rates.charge('read', claims.sessionId)
      })
      return acceptLive(this.ctx, claims, now.getTime())
    } catch (error) {
      return liveRefusal(error)
    }
  }

  /** The phone sends only `ping`, which the auto-response answers. Anything that reaches the vault closes the socket with 1008. */
  webSocketMessage(ws: WebSocket, _message: string | ArrayBuffer): void {
    closeSocket(ws, LIVE_CLOSE.unexpected, 'unexpected message')
  }

  /**
   * Completes a close the phone started. Cloudflare's docs say a runtime from
   * compatibility date 2026-04-07 answers a Close frame itself and that calling
   * close() stays safe; the workerd the tests run (1.20261019.1) does not answer
   * it, so the vault does. A code that cannot be sent back is answered with 1000.
   */
  webSocketClose(ws: WebSocket, code: number, reason: string, _wasClean: boolean): void {
    if (!closeSocket(ws, code, reason)) closeSocket(ws, 1000, 'closed')
  }

  webSocketError(_ws: WebSocket, _error: unknown): void {}

  /** After every call and alarm: pokes the other sessions when the revision grew, then closes ended sessions. Never throws. */
  private afterCall(before: string, sessionId: string | null): void {
    afterVaultWork(this.ctx, before, sessionId)
  }

  // Files and background work (1B-T4). Later 1B tasks add their background methods after these.

  /** This vault's id: its Durable Object id, 64 hex characters, the second segment of every object key (B1). */
  get vaultId(): string {
    return this.ctx.id.toString()
  }

  /** The private bucket. Without the binding, every object call is `unavailable`. */
  get bucket(): VaultBucket {
    if (!this.env.OBJECTS) throw new ObjectStoreError('unavailable')
    return this.env.OBJECTS
  }

  /** A background method's view of the vault, with the vault clock read once. */
  fileContext(): FileContext {
    return { sql: this.ctx.storage.sql, storage: this.ctx.storage, now: this.clock(), vaultId: this.vaultId }
  }

  /** True when the vault holds an account whose status is `active`. */
  isActive(c: FileContext): boolean {
    const [account] = c.sql.exec<{ status: string }>('SELECT status FROM account_state WHERE id = 1').toArray()
    return account?.status === 'active'
  }

  /**
   * Starts the exports, snapshot builds and parses this vault recorded but has
   * not started (B5). The Worker calls it after a `starts` route answers, and
   * the alarm calls it when a start did not happen (1B-T11). Every run records
   * its time, so the next start waits at least a minute (startDueAt).
   */
  async startPendingWork(): Promise<{ started: number; failed: number; held: boolean }> {
    this.lastStartAttemptMs = this.clock().getTime()
    return startPending({
      env: this.env,
      erased: this.erased,
      context: () => this.fileContext(),
      active: (c) => this.isActive(c),
      // A missing CONFIG binding fails closed: readEdgeConfig pauses every gate.
      gates: () => readGates(this.env.CONFIG as KVNamespace),
    })
  }

  // The parse pipeline (1B-T5): background methods the parse consumer calls by
  // the vault id (B11). Each answers its skipped value in an erased vault or one
  // that is not active, and otherwise runs in one short block of its own.

  /** What the consumer should do with a parse message (parse.ts). */
  parseSource(jobId: string, held: readonly ParseFormat[]): ParseSource {
    return this.background({ kind: 'skip' }, (c) => parseSourceIn(c, jobId, held))
  }

  /** A fresh key for the job's sanitized image while it is parsing, else null. */
  reserveImageKey(jobId: string, format: ImageFormat): string | null {
    return this.background(null, (c) => reserveImageKeyIn(c, jobId, format))
  }

  /** Records the parsed preview; the context is read now, after the image PUT, so the deadline checks use the time of the publish. */
  recordPreview(jobId: string, parsed: ParsedPreview): { recorded: boolean } {
    return this.background({ recorded: false }, (c) => recordPreviewIn(c, jobId, parsed))
  }

  /** Puts a parsing job back in the queue (spent: whether the parse ran). */
  retryParse(jobId: string, spent: boolean): void {
    this.background(undefined, (c) => retryParseIn(c, jobId, spent))
  }

  /** Fails a queued or parsing job with its code. */
  failParse(jobId: string, code: string): void {
    this.background(undefined, (c) => failParseIn(c, jobId, code))
  }

  /** Runs `work` in its own short block with a fresh vault clock, or answers `skipped` when the vault is erased or not active. */
  private background<T>(skipped: T, work: (c: FileContext) => T): T {
    if (this.erased) return skipped
    return this.ctx.storage.transactionSync(() => {
      const c = this.fileContext()
      return this.isActive(c) ? work(c) : skipped
    })
  }
}
