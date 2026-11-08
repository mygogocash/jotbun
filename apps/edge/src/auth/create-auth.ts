import { expo } from '@better-auth/expo'
import { passkey } from '@better-auth/passkey'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { emailOTP, jwt } from 'better-auth/plugins'

import { jwtPayload } from './claims'
import {
  AUTH_BASE_PATH,
  AuthConfigError,
  CODE_ATTEMPTS,
  CODE_DIGITS,
  CODE_TTL_SECONDS,
  DISABLED_EMAIL_OTP_PATHS,
  JWT_LIFETIME,
  SESSION_EXPIRES_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  parseList,
} from './config'
import type { AuthEnv } from './env'
import type { Mailer } from './mailer'
import { RATE_LIMIT_RULES } from './rate-limits'

/** Task 4 replaces this empty shape. */
export interface VaultSessionControl {}

/** Task 3 replaces this empty shape. */
export interface ProviderHooks {}

export type AuthDeps = {
  mailer: Mailer
  vault?: VaultSessionControl
  providerHooks?: ProviderHooks
}

function requiredSetting(value: string | undefined, name: string): string {
  if (!value) throw new AuthConfigError(name)
  return value
}

const NORMALISED_EMAIL_PATHS = ['/email-otp/send-verification-otp', '/sign-in/email-otp']

export function createAuth(env: AuthEnv, deps: AuthDeps) {
  const baseURL = requiredSetting(env.AUTH_BASE_URL, 'AUTH_BASE_URL')
  const issuer = requiredSetting(env.AUTH_ISSUER, 'AUTH_ISSUER')
  const audience = requiredSetting(env.AUTH_AUDIENCE, 'AUTH_AUDIENCE')
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new AuthConfigError('BETTER_AUTH_SECRET')
  const secret = env.BETTER_AUTH_SECRET
  const passkeyOrigins = parseList(env.PASSKEY_ORIGINS)

  const options = {
    database: env.AUTH_DB,
    baseURL,
    basePath: AUTH_BASE_PATH,
    secret,
    trustedOrigins: parseList(env.AUTH_TRUSTED_ORIGINS),
    telemetry: { enabled: false },
    disabledPaths: [...DISABLED_EMAIL_OTP_PATHS],
    advanced: {
      database: { generateId: 'uuid' as const },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    session: {
      expiresIn: SESSION_EXPIRES_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      freshAge: 300,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database' as const,
      window: 60,
      max: 100,
      customRules: RATE_LIMIT_RULES,
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/email-otp/send-verification-otp' && ctx.body?.type !== 'sign-in') {
          throw new APIError('BAD_REQUEST', { code: 'UNSUPPORTED_CODE_TYPE', message: 'UNSUPPORTED_CODE_TYPE' })
        }
        if (!NORMALISED_EMAIL_PATHS.includes(ctx.path ?? '')) return
        return {
          context: {
            ...ctx,
            body: {
              ...ctx.body,
              email: String(ctx.body?.email).trim().toLowerCase(),
            },
          },
        }
      }),
    },
    plugins: [
      emailOTP({
        otpLength: CODE_DIGITS,
        expiresIn: CODE_TTL_SECONDS,
        allowedAttempts: CODE_ATTEMPTS,
        storeOTP: 'hashed',
        disableSignUp: false,
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== 'sign-in') throw new APIError('BAD_REQUEST', { code: 'UNSUPPORTED_CODE_TYPE', message: 'UNSUPPORTED_CODE_TYPE' })
          await deps.mailer.sendSignInCode({ to: email, code: otp, expiresAt: new Date(Date.now() + CODE_TTL_SECONDS * 1000) })
        },
      }),
      jwt({
        jwks: { keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' } },
        jwt: { issuer, audience, expirationTime: JWT_LIFETIME, definePayload: jwtPayload },
        disableSettingJwtHeader: true,
      }),
      expo(),
      passkey({
        rpID: env.PASSKEY_RP_ID ?? 'localhost',
        rpName: 'Jotbun',
        origin: passkeyOrigins.length > 0 ? passkeyOrigins : baseURL,
      }),
    ],
  } satisfies BetterAuthOptions

  return betterAuth(options)
}

export type JotbunAuth = ReturnType<typeof createAuth>
