import type { UserVault } from '../vault/user-vault'

/**
 * The vault a background step names (B11). Workflow params and queue messages
 * carry the vault id the vault gave them, never a user id, so background code
 * reaches the vault with idFromString and nothing else.
 */
export function vaultById(env: { VAULT: DurableObjectNamespace<UserVault> }, vaultId: string): DurableObjectStub<UserVault> {
  return env.VAULT.get(env.VAULT.idFromString(vaultId))
}
