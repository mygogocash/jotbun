import type { CommandDigester } from '@api/commands/command-digest'
import type { CommandRegistry } from '@api/commands/command-registry'

import type { VaultClaims, PublishedPolicies } from '../v1/protocol'
import type { VaultDb } from './user-vault'

/**
 * What a handler and the checks run with: one call's view of the vault. The
 * registry and digester are built once per vault instance; the rest is per call.
 */
export type VaultContext = {
  db: VaultDb
  sql: SqlStorage
  storage: DurableObjectStorage
  registry: CommandRegistry
  digester: CommandDigester
  claims: VaultClaims
  policies: PublishedPolicies
  now: Date
  /** The vault's own id (ctx.id.toString()), the second segment of every object key (B1). Set by call(). */
  vaultId: string
  /** Set by touch() when a file function wrote a row in this call (1B-T4; 1B-T11 rearms after it). */
  touched?: boolean
}
