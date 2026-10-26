/**
 * The Worker's bindings and settings. Secrets are set with `wrangler secret
 * put`; plain settings live in wrangler.jsonc `vars`. The names match the v1
 * API's environment variables, so the shared `*FromEnv` factories read them
 * unchanged.
 */
export type EdgeBindings = {
  HYPERDRIVE?: { connectionString: string }
  OBJECTS?: unknown
  /** Wake-up queues of the background Workers (jobs, security, deletion). */
  JOBS?: QueueProducer
  SECURITY_JOBS?: QueueProducer
  DELETION_JOBS?: QueueProducer
}

export type QueueProducer = { send(body: unknown): Promise<void> }

export type EdgeSettings = {
  JOTBUN_ENV?: string
  AUTH0_ISSUER?: string
  AUTH0_AUDIENCE?: string
  AUTH0_ALLOWED_CLIENT_IDS?: string
  /** The read-profile and link client (E1): bootstrap and linking fail closed without it. */
  AUTH0_PROFILE_LINK_CLIENT_ID?: string
  AUTH0_PROFILE_LINK_CLIENT_SECRET?: string
  /** The Management API base when it is not the issuer (tests point it at a fake). */
  AUTH0_MANAGEMENT_URL?: string
  /** Comma-separated secrets for signed provider events; the route is 404 without them. */
  AUTH0_EVENTS_SIGNING_SECRETS?: string
  RATE_LIMIT_KEY?: string
  COMMAND_DIGEST_KEY?: string
  COMMAND_DIGEST_PREVIOUS_KEYS?: string
  MIN_CLIENT_VERSION_IOS?: string
  MIN_CLIENT_VERSION_ANDROID?: string
  OPERATIONAL_PAUSE?: string
  OPERATIONAL_PAUSE_RETRY_AFTER_SECONDS?: string
  IMPORT_UPLOADS_ENABLED?: string
  /** Where routes the edge has not ported yet are forwarded (the NestJS v1 API). */
  LEGACY_V1_ORIGIN?: string
  /** Direct connection string for Node tests and tools; the Worker uses HYPERDRIVE. */
  DATABASE_URL?: string
  AI_ENABLED?: string
  AI_MODEL?: string
  ANTHROPIC_API_KEY?: string
  /** Optional proxy for the Anthropic API, for example a Cloudflare AI Gateway URL. */
  ANTHROPIC_BASE_URL?: string
  GOGOCASH_BRIDGE_ENABLED?: string
  /** GoGoCash's public brand catalogue (JSON, see CashbackCatalogue); the built-in brands without it. */
  GOGOCASH_CATALOGUE_URL?: string
}

export type EdgeEnv = EdgeBindings & EdgeSettings

/** The plain string settings, shaped like `process.env` for the shared factories. */
export function settingsOf(env: EdgeEnv): Record<string, string | undefined> {
  const settings: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') settings[key] = value
  }
  return settings
}

export function flag(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

/** NODE_ENV for the shared factories: loopback http issuers are allowed only outside production. */
export function nodeEnvFor(env: { JOTBUN_ENV?: string }): string {
  return env.JOTBUN_ENV === 'local' || env.JOTBUN_ENV === 'test' ? 'development' : 'production'
}
