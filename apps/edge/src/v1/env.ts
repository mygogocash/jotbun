import type { VaultBucket } from '../vault/files/keys'
import type { UserVault } from '../vault/user-vault'

/**
 * The vault Worker's bindings and settings. VAULT and CONFIG are bound in
 * wrangler.vault.jsonc; the rest are secrets or vars, read where they are used.
 */
export type V1Env = {
  VAULT: DurableObjectNamespace<UserVault>
  CONFIG: KVNamespace
  /** The one private bucket. The vault reads it; Worker routes reach it through the same binding. */
  OBJECTS?: VaultBucket
  JOTBUN_ENV?: string
  /** The token issuer and audience, and the JWKS they are verified against (P3). */
  AUTH_ISSUER?: string
  AUTH_AUDIENCE?: string
  AUTH_JWKS_URL?: string
  /** Fallback client minimums, used when config:v1 carries none. */
  MIN_CLIENT_VERSION_IOS?: string
  MIN_CLIENT_VERSION_ANDROID?: string
  /** Uploads stay unexposed (404) unless this is `1` or `true`. */
  IMPORT_UPLOADS_ENABLED?: string
  /** The public cashback catalogue stays 404 unless this is `1` or `true`. */
  GOGOCASH_BRIDGE_ENABLED?: string
  /** GoGoCash's public brand catalogue. Without it, the built-in brands are served. */
  GOGOCASH_CATALOGUE_URL?: string
}
