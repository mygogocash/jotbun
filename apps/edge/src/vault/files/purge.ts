import { vaultPrefix, VAULT_OBJECT_PURPOSES } from './keys'
import type { VaultBucket } from './keys'

/** The most keys one listing returns, and one delete call takes (the binding's limit). */
const PAGE = 1000

/**
 * Deletes every object under one vault's prefixes, for each purpose, and returns
 * how many it deleted. Each prefix is listed a page at a time and its page is
 * deleted, until a listing comes back empty, so a vault with more than one page
 * is emptied. A key outside the prefix is never deleted. Running it again on an
 * empty vault deletes nothing and returns 0 (idempotent).
 */
export async function purgeVaultObjects(bucket: VaultBucket, vaultId: string): Promise<number> {
  let deleted = 0
  for (const purpose of VAULT_OBJECT_PURPOSES) {
    const prefix = vaultPrefix(purpose, vaultId)
    for (;;) {
      const listing = await bucket.list({ prefix, limit: PAGE })
      const keys = listing.objects.map((object) => object.key).filter((key) => key.startsWith(prefix))
      if (keys.length === 0) break
      await bucket.delete(keys)
      deleted += keys.length
    }
  }
  return deleted
}
