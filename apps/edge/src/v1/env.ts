import type { UserVault } from '../vault/user-vault'

/**
 * The vault Worker's bindings and settings. VAULT and CONFIG are bound in
 * wrangler.vault.jsonc; the rest are secrets or vars, read where they are used.
 */
export type V1Env = {
  VAULT: DurableObjectNamespace<UserVault>
  CONFIG: KVNamespace
  JOTBUN_ENV?: string
  /** The token issuer and audience, and the JWKS they are verified against (P3). */
  AUTH_ISSUER?: string
  AUTH_AUDIENCE?: string
  AUTH_JWKS_URL?: string
  /** Fallback client minimums, used when config:v1 carries none. */
  MIN_CLIENT_VERSION_IOS?: string
  MIN_CLIENT_VERSION_ANDROID?: string
}
