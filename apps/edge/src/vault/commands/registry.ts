import { isWalletSnapshot } from '@gogospend/contracts'
import type { CommandOutcome } from '@gogospend/contracts'

import { CommandRegistry } from '@api/commands/command-registry'

const WALLET_COMMANDS: [string, CommandOutcome][] = [
  ['wallet.create', 'created'],
  ['wallet.update', 'updated'],
  ['wallet.archive', 'archived'],
  ['wallet.unarchive', 'unarchived'],
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
  return registry
}
