export const AUTH_BASE_PATH = '/api/auth'

export const CODE_DIGITS = 6
export const CODE_TTL_SECONDS = 600
export const CODE_ATTEMPTS = 3

export const JWT_LIFETIME = '10m'
export const JWT_LIFETIME_SECONDS = 600

export const SESSION_EXPIRES_SECONDS = 30 * 86_400
export const SESSION_UPDATE_AGE_SECONDS = 86_400

export const AUTH_BODY_MAX_BYTES = 65_536

export const DISABLED_EMAIL_OTP_PATHS = [
  '/forget-password/email-otp',
  '/email-otp/check-verification-otp',
  '/email-otp/verify-email',
  '/email-otp/request-password-reset',
  '/email-otp/reset-password',
  '/email-otp/request-email-change',
  '/email-otp/change-email',
] as const

/** The message is the missing setting's name and nothing else. */
export class AuthConfigError extends Error {
  constructor(setting: string) {
    super(setting)
    this.name = 'AuthConfigError'
  }
}

/** Split a comma list, trim each entry, and drop the empty ones. */
export function parseList(value: string | undefined): string[] {
  if (!value) return []
  return value.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
}
