import type { StatementParser } from '../background/statement-parser'
import type { VaultBucket } from '../vault/files/keys'
import type { UserVault } from '../vault/user-vault'

/**
 * The vault's bindings and settings on the one Worker. VAULT and CONFIG are
 * bound in wrangler.jsonc; the rest are secrets or vars, read where they are used.
 */
export type V1Env = {
  VAULT: DurableObjectNamespace<UserVault>
  CONFIG: KVNamespace
  /** The one private bucket. The vault reads it; Worker routes reach it through the same binding. */
  OBJECTS?: VaultBucket
  /** The shared catalog (P4-T2): bank albums and merchant patterns. Without it the bank-album list is 503 and there are no merchant patterns. */
  CATALOG_DB?: D1Database
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
  /** Slip import's routes that name it as their `release` answer 404 unless this is `1` or `true` (P4-T3, S13); the salt answers without it. */
  SLIP_IMPORT_ENABLED?: string
  /** The public cashback catalogue stays 404 unless this is `1` or `true`. */
  GOGOCASH_BRIDGE_ENABLED?: string
  /** GoGoCash's public brand catalogue. Without it, the built-in brands are served. */
  GOGOCASH_CATALOGUE_URL?: string
  /** The stateless parser's Durable Object, with its container (1B-T5). Without it, every parse asks to be retried. */
  PARSER?: DurableObjectNamespace<StatementParser>
  /** The AI companion (1B-T7, B10): on only when this is `1` or `true` and ANTHROPIC_API_KEY is set; otherwise drafts come from the rules and slips and questions are 503 AI_PAUSED. */
  AI_ENABLED?: string
  /** A secret. */
  ANTHROPIC_API_KEY?: string
  /** A secret for authenticated AI Gateway access (P3-T4). */
  AI_GATEWAY_TOKEN?: string
  /** Optional proxy for the Anthropic API, for example a Cloudflare AI Gateway URL. */
  ANTHROPIC_BASE_URL?: string
  /** PostHog EU (1D-T11, secrets). Without the project token no server event is sent. */
  POSTHOG_PROJECT_TOKEN?: string
  /** The analytics id's HMAC key. Set once and never rotated: a new key gives every person a new id, and deletion would miss the persons made under the old one. Without it the analytics id is null and nothing is sent under a person. */
  ANALYTICS_ID_KEY?: string
  /** PostHog's private API, for person deletion (1D-T13). */
  POSTHOG_PERSONAL_API_KEY?: string
  POSTHOG_PROJECT_ID?: string
}
