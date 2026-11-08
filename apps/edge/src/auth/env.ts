// Settings the auth Worker reads. Secrets stay optional here: a missing one
// is refused at startup (AuthConfigError), not by the type.
export type AuthEnv = {
  AUTH_DB: D1Database
  ERASURE_DB?: D1Database
  EMAIL?: EmailBinding
  JOTBUN_ENV?: string
  AUTH_BASE_URL?: string
  AUTH_ISSUER?: string
  AUTH_AUDIENCE?: string
  AUTH_TRUSTED_ORIGINS?: string
  BETTER_AUTH_SECRET?: string
  ERASURE_KEY?: string
  EMAIL_FROM?: string
  EMAIL_SECONDARY?: string
  RESEND_API_KEY?: string
  APPLE_BUNDLE_ID?: string
  APPLE_CLIENT_SECRET?: string
  GOOGLE_CLIENT_IDS?: string
  GOOGLE_CLIENT_SECRET?: string
  PASSKEY_RP_ID?: string
  PASSKEY_ORIGINS?: string
}
