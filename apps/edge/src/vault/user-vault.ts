import { DurableObject } from 'cloudflare:workers'
import type { DurableObjectStateLike } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import type { DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'

import { CommandRegistry } from '@api/commands/command-registry'
import { commandDigesterFromEnv } from '@api/commands/command-digest'
import type { CommandDigester } from '@api/commands/command-digest'

import type { VaultCall, VaultReply } from '../v1/protocol'
import { vaultRouteOf } from '../v1/routes'
import type { VaultContext } from './context'
import { VAULT_MIGRATIONS } from './migrations'
import { assertPolicyAccepted } from './policies'
import { RateBuckets } from './rate-limits'
import { toProblemReply } from './replies'
import { VAULT_HANDLERS } from './routes'
import { assertSession, ensureAccount } from './session'
import { vaultSchema } from './schema'

/** The bindings the vault reads: the command digest keys and the environment name. */
export type VaultEnv = { COMMAND_DIGEST_KEY?: string; COMMAND_DIGEST_PREVIOUS_KEYS?: string; JOTBUN_ENV?: string }

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
  private readonly rates = new RateBuckets(() => this.clock().getTime())
  private services: { registry: CommandRegistry; digester: CommandDigester } | undefined

  constructor(ctx: DurableObjectStateLike, env: VaultEnv) {
    super(ctx, env)
    this.db = drizzle(ctx.storage, { schema: vaultSchema })
    void ctx.blockConcurrencyWhile(() => migrate(this.db, VAULT_MIGRATIONS))
  }

  /**
   * One call from the Worker, under the vault's checks in this order: the
   * account (an owner mismatch is refused), the principal's budget, the session,
   * the session's read or write budget, the current policy when the route needs
   * it, then the route's handler. Every error becomes a reply.
   */
  call(call: VaultCall): VaultReply {
    try {
      const route = vaultRouteOf(call.route)
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
        }
        ensureAccount(c)
        this.rates.charge('principal', call.claims.accountId)
        assertSession(c)
        this.rates.charge(route.method === 'GET' ? 'read' : 'write', call.claims.sessionId)
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
      registry: new CommandRegistry(),
      digester: commandDigesterFromEnv({ COMMAND_DIGEST_KEY: this.env.COMMAND_DIGEST_KEY, COMMAND_DIGEST_PREVIOUS_KEYS: this.env.COMMAND_DIGEST_PREVIOUS_KEYS }),
    }
    return this.services
  }
}
