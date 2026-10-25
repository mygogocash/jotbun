import { ObjectStoreError, assertObjectKey } from '@api/storage/object-store'

import type { R2BucketLike } from '../../server/storage/r2-object-store'

/**
 * The purposes an R2 object can serve. The purpose leads every key (B1), so a
 * lifecycle rule or a purge names one prefix per purpose.
 */
export const VAULT_OBJECT_PURPOSES = ['sync_snapshot', 'export', 'import_quarantine', 'import_image', 'receipt'] as const

export type VaultObjectPurpose = (typeof VAULT_OBJECT_PURPOSES)[number]

/** The bucket the vault writes through: the binding deletes up to 1,000 keys per call. */
export type VaultBucket = Omit<R2BucketLike, 'delete'> & { delete(keys: string | string[]): Promise<void> }

/** A vault's id is its Durable Object id: 64 lowercase hex characters. */
const VAULT_ID = /^[0-9a-f]{64}$/

function assertPurpose(purpose: string): asserts purpose is VaultObjectPurpose {
  if (!(VAULT_OBJECT_PURPOSES as readonly string[]).includes(purpose)) throw new ObjectStoreError('invalid_key')
}

/**
 * The key of one object: `<purpose>/<vaultId>/<names...>` (B1), for example
 * `receipt/<vaultId>/<attachment id>/<attempt token>/image.jpg`. It never holds
 * an email or a user id, and it passes the store's key rule.
 */
export function vaultObjectKey(purpose: VaultObjectPurpose, vaultId: string, ...names: string[]): string {
  assertPurpose(purpose)
  if (!VAULT_ID.test(vaultId)) throw new ObjectStoreError('invalid_key')
  const key = [purpose, vaultId, ...names].join('/')
  assertObjectKey(key)
  return key
}

/** The prefix every key of one purpose and vault begins with: `<purpose>/<vaultId>/`. */
export function vaultPrefix(purpose: VaultObjectPurpose, vaultId: string): string {
  assertPurpose(purpose)
  if (!VAULT_ID.test(vaultId)) throw new ObjectStoreError('invalid_key')
  return `${purpose}/${vaultId}/`
}
