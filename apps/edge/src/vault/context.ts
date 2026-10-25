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
}
