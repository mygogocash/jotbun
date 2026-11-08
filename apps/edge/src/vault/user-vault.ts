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
import { VAULT_MIGRATIONS } from './migrations'
import { assertPolicyAccepted } from './policies'
import { RateBuckets } from './rate-limits'
import { toProblemReply } from './replies'
import { VAULT_HANDLERS } from './routes'
import { assertSession, ensureAccount } from './session'
import { vaultSchema } from './schema'
import type { VaultBucket } from './files/keys'
import { ObjectStoreError } from '@api/storage/object-store'
import { readGates } from '../v1/config'
import type { FileContext } from './files/context'
import { startPendingWork as startPending } from './files/work'

/** The bindings the vault reads: the command digest keys, the environment name, the private object bucket and config:v1's KV (for the gates of background work). */
export type VaultEnv = {
  COMMAND_DIGEST_KEY?: string
  COMMAND_DIGEST_PREVIOUS_KEYS?: string
  JOTBUN_ENV?: string
  OBJECTS?: VaultBucket
  CONFIG?: KVNamespace
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
    try {
      const route = vaultRouteOf(call.route) ?? stepRouteOf(call.route)
      const handler = VAULT_HANDLERS[call.route]
      if (!route || !handler) throw new Error('a vault call names no ported route')
      const services = this.built()
      return this.ctx.storage.transactionSync(() => {
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
        assertSession(c)
        if (call.charge !== 'step') this.rates.charge(call.charge, call.claims.sessionId)
        if (call.access === 'current_policy') assertPolicyAccepted(c)
        return handler(c, call)
      })
    } catch (error) {
      return toProblemReply(error)
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
}
