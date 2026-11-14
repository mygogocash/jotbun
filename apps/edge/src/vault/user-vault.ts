import { DurableObject } from 'cloudflare:workers'
import type { DurableObjectStateLike } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import type { DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'

import type { CommandRegistry } from '@api/commands/command-registry'
import { commandDigesterFromEnv } from '@api/commands/command-digest'
import type { CommandDigester } from '@api/commands/command-digest'
import { failureName } from '@api/common/operational-metrics'

import { logFailure } from '../v1/log'
import type { VaultAnalytics, VaultCall, VaultReply } from '../v1/protocol'
import { stepRouteOf, vaultRouteOf } from '../v1/routes'
import { analyticsAfterCall } from './analytics'
import { buildVaultRegistry } from './commands/registry'
import type { VaultContext } from './context'
import { LIVE_CLOSE, acceptLive, afterVaultWork, closeSocket, currentRevision, isLiveRequest, liveClaimsOf, liveRefusal } from './live'
import { VAULT_MIGRATIONS } from './migrations'
import { assertPolicyAccepted } from './policies'
import { RateBuckets } from './rate-limits'
import { toProblemReply } from './replies'
import { RETENTION_RETRY_MS, reschedule, runDue } from './retention'
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
import type { BuildOutcome } from './files/work'
import type { ExportParams } from '../background/export-workflow'
import { failExport as failExportIn, writeExport as writeExportIn } from './files/exports'
import type { SnapshotParams } from '../background/snapshot-workflow'
import { buildSnapshot as buildSnapshotIn, failSnapshot as failSnapshotIn } from './files/snapshots'
import { runFileJobs } from './files/jobs'
import type { FileJobOptions } from './files/jobs'

/**
 * A call or a background method never sets the alarm sooner than this after
 * its clock (1B-T11): work a write makes due at once (a released receipt, a
 * given-back copy) waits a minute, so a burst of writes is one alarm. The
 * alarm itself rearms with no delay, so a capped run continues at once.
 */
export const CALL_ALARM_DELAY_MS = 60_000

/** The bindings the vault reads: the command digest keys, the environment name, the private object bucket and config:v1's KV (for the gates of background work). */
export type VaultEnv = {
  COMMAND_DIGEST_KEY?: string
  COMMAND_DIGEST_PREVIOUS_KEYS?: string
  JOTBUN_ENV?: string
  OBJECTS?: VaultBucket
  CONFIG?: KVNamespace
  PARSE_QUEUE?: Queue<ParseMessage>
  EXPORT_WORKFLOW?: Workflow<ExportParams>
  SNAPSHOT_WORKFLOW?: Workflow<SnapshotParams>
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
  /** What alarm() passes to runFileJobs (1B-T11). Empty by default; tests set it, as they set `clock`. */
  fileJobOptions: FileJobOptions = {}
  /**
   * The alarm this instance has set (epoch ms), or null when none is set (1B-T11).
   * Memory only, because the synchronous call() cannot await getAlarm(): the
   * constructor reads it, rearm() and erase() keep it, and alarm() clears it when
   * it starts, because the runtime deletes an alarm once it fires.
   */
  alarmAt: number | null = null
  private readonly rates = new RateBuckets(() => this.clock().getTime())
  private builtRegistry: CommandRegistry | undefined
  private services: { registry: CommandRegistry; digester: CommandDigester } | undefined

  constructor(ctx: DurableObjectStateLike, env: VaultEnv) {
    super(ctx, env)
    this.db = drizzle(ctx.storage, { schema: vaultSchema })
    void ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, VAULT_MIGRATIONS)
      this.alarmAt = await ctx.storage.getAlarm()
    })
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
    this.alarmAt = null
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
   * The vault's alarm (§6.2 "Alarms", 1A-T8b and 1B-T11): runs the retention
   * jobs that are due, then the file jobs (runFileJobs), then rearms with a fresh
   * context, which sets the alarm to the earliest job left or deletes it. It
   * first forgets the alarm that fired (the runtime deleted it), so a due time
   * equal to it is set again. A job that failed brings the alarm back a minute
   * later at the earliest (RETENTION_RETRY_MS), never in a loop; a write in
   * between keeps that, since a write never sets the alarm sooner than a minute
   * ahead or postpones one already set. Nothing is thrown, so the platform never
   * retries the alarm. An erased vault does nothing: erase() already cancelled
   * the alarm, and one that landed during the awaits is never rearmed.
   */
  async alarm(): Promise<void> {
    if (this.erased) return
    this.alarmAt = null
    // A purge pokes every phone (1D-T10): no session is the caller.
    const before = currentRevision(this.ctx.storage.sql)
    let failed = false
    try {
      failed = runDue(this.fileContext()).length > 0
      failed = (await runFileJobs(this, this.fileJobOptions)).length > 0 || failed
    } catch (error) {
      failed = true
      logFailure('vault_alarm_failed', error)
    } finally {
      if (!this.erased) this.rearm(this.fileContext(), failed ? RETENTION_RETRY_MS : 0)
      this.afterCall(before, null)
    }
  }

  /**
   * Writes the schedule and moves the alarm to the earliest due job, or deletes
   * it (1B-T11): reschedule in a short block of its own, then setAlarm or
   * deleteAlarm outside every block, and only when the time differs from
   * alarmAt. Never sooner than `delayMs` after the context's clock (a job
   * already due, such as a released key due at 0, waits that long; workerd
   * refuses setAlarm at 0), and an alarm already set sooner than that is kept,
   * so a stream of writes never postpones it. A call or a background method
   * rearms with CALL_ALARM_DELAY_MS; the alarm itself with 0, or with
   * RETENTION_RETRY_MS after a failed job. An erased vault never rearms. A
   * failure is logged, never thrown: the caller's work has already committed.
   * So is a setAlarm or deleteAlarm that the storage refuses after this call
   * returns, and alarmAt then forgets the alarm it meant (unless a later rearm
   * has already replaced it), so the next rearm sets it again (the 1B-T11
   * review's n2).
   */
  rearm(c: FileContext, delayMs: number = CALL_ALARM_DELAY_MS): void {
    if (this.erased) return
    try {
      const due = c.storage.transactionSync(() => reschedule(c, this.lastStartAttemptMs))
      let at = due === null ? null : Math.max(due, c.now.getTime() + delayMs)
      // Floored above its due time: an alarm already set sooner stays, so writes never starve the jobs.
      if (at !== null && due !== null && at > due && this.alarmAt !== null && this.alarmAt < at) at = this.alarmAt
      if (at === this.alarmAt) return
      const settled = at === null ? this.ctx.storage.deleteAlarm() : this.ctx.storage.setAlarm(at)
      this.alarmAt = at
      void settled.catch((error: unknown) => {
        logFailure('vault_alarm_unset', error)
        if (this.alarmAt === at) this.alarmAt = null
      })
    } catch (error) {
      logFailure('vault_alarm_unset', error)
    }
  }

  /** One call from the Worker: callWithAnalytics's reply (1D-T11), so every caller of call() sees what it saw before. */
  call(call: VaultCall): VaultReply {
    return this.callWithAnalytics(call).reply
  }

  /**
   * One call from the Worker, under the vault's checks in this order: the
   * account (an owner mismatch is refused), the principal's budget, the session,
   * the session's read or write budget, the current policy when the route needs
   * it, then the route's handler. A step of a request already in progress
   * (`charge: 'step'`) skips both budgets. `recent_proof` is policy-exempt,
   * like `bound_session`. A step-only id has no HTTP route; it resolves through
   * the step table. Every error becomes a reply. Beside the reply it answers
   * what it read after the block (1D-T11, L6): the caller's consent, the
   * record_saved events of what the call committed, and the class name of a 500
   * INTERNAL_ERROR. The Worker never sends them to the phone.
   */
  callWithAnalytics(call: VaultCall): { reply: VaultReply; analytics: VaultAnalytics } {
    if (this.erased) return { reply: { ok: false, status: 403, code: 'ACCOUNT_UNAVAILABLE', problem: {} }, analytics: { consent: 'unasked', events: [], failure: null } }
    // Live pokes (1D-T10): the revision before the block, compared after it whatever the outcome.
    const before = currentRevision(this.ctx.storage.sql)
    // Server events (1D-T11): the call's context, read again after the block, and the class name of a 500.
    let read: VaultContext | undefined
    let reply: VaultReply
    let failure: string | null = null
    try {
      const route = vaultRouteOf(call.route) ?? stepRouteOf(call.route)
      const handler = VAULT_HANDLERS[call.route]
      if (!route || !handler) throw new Error('a vault call names no ported route')
      // A step marked anySession runs after its request's session ended or its policy changed (1B-T5).
      const anySession = stepRouteOf(call.route)?.anySession === true
      const services = this.built()
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
      read = c
      reply = this.ctx.storage.transactionSync(() => {
        ensureAccount(c)
        if (call.charge !== 'step') this.rates.charge('principal', call.claims.accountId)
        if (!anySession) assertSession(c)
        if (call.charge !== 'step') this.rates.charge(call.charge, call.claims.sessionId)
        if (call.access === 'current_policy' && !anySession) assertPolicyAccepted(c)
        return handler(c, call)
      })
      // A call that wrote moves the alarm, outside the block (1B-T11): a command touches when it commits (1A-T8b's
      // "after each call that committed a command"), and so does every file write, an upload step's included.
      if (c.touched === true) this.rearm(c)
    } catch (error) {
      reply = toProblemReply(error)
      // The class name toProblemReply logs for a 500 INTERNAL_ERROR (L6): the Worker counts it, anonymously.
      if (!reply.ok && reply.code === 'INTERNAL_ERROR') failure = failureName(error)
    } finally {
      this.afterCall(before, call.claims.sessionId)
    }
    // Read after the block: a refusal committed nothing, so these reads see the state before it.
    return { reply, analytics: read ? analyticsAfterCall(read, call.route, before, failure) : { consent: 'unasked', events: [], failure } }
  }

  /**
   * The registry, built once per instance (1A-T3) and shared by every call and the alarm's file
   * prunes (P4-T7's slip prune commits a change). It needs no secret, so the alarm never builds the digester.
   */
  get registry(): CommandRegistry {
    this.builtRegistry ??= buildVaultRegistry()
    return this.builtRegistry
  }

  /** The registry and digester, built on the first call and kept for this instance. */
  private built(): { registry: CommandRegistry; digester: CommandDigester } {
    this.services ??= {
      registry: this.registry,
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
   * its time, so the next start waits at least a minute (startDueAt), and a run
   * that marked a start rearms.
   */
  async startPendingWork(): Promise<{ started: number; failed: number; held: boolean }> {
    this.lastStartAttemptMs = this.clock().getTime()
    return this.rearming((context) =>
      startPending({
        env: this.env,
        erased: this.erased,
        context,
        active: (c) => this.isActive(c),
        // A missing CONFIG binding fails closed: readEdgeConfig pauses every gate.
        gates: () => readGates(this.env.CONFIG as KVNamespace),
      }),
    )
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

  // Exports (1B-T6): ExportWorkflow's steps call these by the vault id (B11).

  /**
   * Writes the export's file to R2 and publishes it (exports.ts). The read and
   * the publish are separate short blocks, each with the vault clock read when
   * it starts, so the publish is checked at the time after the PUT. An erased
   * vault answers `skipped`.
   */
  async writeExport(id: string): Promise<BuildOutcome> {
    if (this.erased) return { outcome: 'skipped' }
    return this.rearming(async (context) => {
      const { outcome } = await writeExportIn({ context, bucket: this.bucket, active: (c) => this.isActive(c) }, id)
      return { outcome }
    })
  }

  /** Records that the export's write failed after its retries. */
  failExport(id: string): void {
    this.background(undefined, (c) => failExportIn(c, id))
  }

  // Snapshots (1B-T8): SnapshotWorkflow's steps call these by the vault id (B11).

  /**
   * Builds the snapshot's chunks in R2 and records them (snapshots.ts). The read
   * and the record are separate short blocks, each with the vault clock read
   * when it starts, so the record is checked at the time after the PUTs. An
   * erased vault answers `skipped`.
   */
  async buildSnapshot(id: string): Promise<BuildOutcome> {
    if (this.erased) return { outcome: 'skipped' }
    return this.rearming(async (context) => {
      const { outcome } = await buildSnapshotIn({ context, bucket: this.bucket, active: (c) => this.isActive(c) }, id)
      return { outcome }
    })
  }

  /** Records that the snapshot's build failed after its retries. */
  failSnapshot(id: string): void {
    this.background(undefined, (c) => failSnapshotIn(c, id))
  }

  /** Runs `work` in its own short block with a fresh vault clock, or answers `skipped` when the vault is erased or not active. Rearms when it wrote (1B-T11). */
  private background<T>(skipped: T, work: (c: FileContext) => T): T {
    if (this.erased) return skipped
    const c = this.fileContext()
    const result = this.ctx.storage.transactionSync(() => (this.isActive(c) ? work(c) : skipped))
    if (c.touched === true) this.rearm(c)
    return result
  }

  /**
   * Runs background work that reads the vault through `context()`, then rearms
   * with a fresh context when any of those contexts wrote (1B-T11), even when the
   * work threw: a write that throws after its reservation leaves a reserved key,
   * which the alarm deletes at its deadline.
   */
  private async rearming<T>(work: (context: () => FileContext) => Promise<T>): Promise<T> {
    const seen: FileContext[] = []
    try {
      return await work(() => {
        const c = this.fileContext()
        seen.push(c)
        return c
      })
    } finally {
      if (seen.some((c) => c.touched === true)) this.rearm(this.fileContext())
    }
  }
}
