import { DurableObject } from 'cloudflare:workers'
import type { DurableObjectStateLike } from 'cloudflare:workers'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import type { DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'

import { VAULT_MIGRATIONS } from './migrations'
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

  constructor(ctx: DurableObjectStateLike, env: VaultEnv) {
    super(ctx, env)
    this.db = drizzle(ctx.storage, { schema: vaultSchema })
    void ctx.blockConcurrencyWhile(() => migrate(this.db, VAULT_MIGRATIONS))
  }
}
