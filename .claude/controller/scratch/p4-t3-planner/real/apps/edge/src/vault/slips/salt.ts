// The slip salt (P4-T3, S16, §6.8 step 4): 32 random bytes, made on the vault's first read
// and the same ever after; erase deletes it with the vault. Only the phone hashes a slip's
// reference with it (A25), so the Worker and the vault see salted hashes only. The salt is
// never logged.
import type { SlipSaltDto } from '@gogospend/contracts'

import type { VaultContext } from '../context'

const SALT_BYTES = 32

/** The salt as the phone reads it: base64url without padding (43 characters). */
const asDto = (bytes: Uint8Array): SlipSaltDto => ({ salt: Buffer.from(bytes).toString('base64url') })

/**
 * GET /v1/slips/salt: the vault's salt. The first read makes it with
 * crypto.getRandomValues inside the call's block, so two first reads never
 * make two salts; every later read answers the same bytes.
 */
export function slipSalt(c: VaultContext): SlipSaltDto {
  const [row] = c.sql.exec<{ salt: ArrayBuffer }>('SELECT salt FROM slip_salt WHERE id = 1').toArray()
  if (row) return asDto(new Uint8Array(row.salt))
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  c.sql.exec('INSERT INTO slip_salt (id, salt, created_at) VALUES (1, ?, ?)', salt, c.now.toISOString()).toArray()
  return asDto(salt)
}
