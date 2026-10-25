import { isCategorySnapshot, isTransactionSnapshot, isWalletSnapshot } from '@gogospend/contracts'
import type { CommandOutcome } from '@gogospend/contracts'

import { CommandRegistry } from '@api/commands/command-registry'

const WALLET_COMMANDS: [string, CommandOutcome][] = [
  ['wallet.create', 'created'],
  ['wallet.update', 'updated'],
  ['wallet.archive', 'archived'],
  ['wallet.unarchive', 'unarchived'],
]

const CATEGORY_COMMANDS: [string, CommandOutcome][] = [
  ['category.seed_builtins', 'created'],
  ['category.create', 'created'],
  ['category.update', 'updated'],
  ['category.archive', 'archived'],
  ['category.unarchive', 'unarchived'],
]

const TRANSACTION_COMMANDS: [string, CommandOutcome][] = [
  ['transaction.create', 'created'],
  ['transaction.update', 'updated'],
  ['transaction.delete', 'deleted'],
  ['transaction.restore', 'restored'],
]

/**
 * The entities and command kinds this vault serves, with the same kind, entity,
 * outcome, schema versions and policy as the API's services define them, in the
 * order buildContainer constructs them. Each later task of Phase 1A adds its own
 * block. The vault builds the registry once per instance (UserVault#built).
 */
export function buildVaultRegistry(): CommandRegistry {
  const registry = new CommandRegistry()
  registry.defineEntity({ entity: 'wallet', validate: isWalletSnapshot })
  for (const [kind, outcome] of WALLET_COMMANDS) registry.defineCommand({ kind, entity: 'wallet', outcome, schemaVersions: [1], policy: 'current' })
  registry.defineEntity({ entity: 'category', validate: isCategorySnapshot })
  for (const [kind, outcome] of CATEGORY_COMMANDS) registry.defineCommand({ kind, entity: 'category', outcome, schemaVersions: [1], policy: 'current' })
  registry.defineEntity({ entity: 'transaction', validate: isTransactionSnapshot })
  for (const [kind, outcome] of TRANSACTION_COMMANDS) registry.defineCommand({ kind, entity: 'transaction', outcome, schemaVersions: [1], policy: 'current' })
  return registry
}
