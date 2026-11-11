// 1B-T13's typed stub (Global Constraints: wrong but typed values): /live and /ready answer 501 until the fold.
import type { V1Env } from './env'

export type ReadyEnv = Pick<V1Env, 'CONFIG' | 'AUTH_ISSUER' | 'AUTH_AUDIENCE' | 'AUTH_JWKS_URL'> & { COMMAND_DIGEST_KEY?: string }

export function live(): Response {
  return new Response(null, { status: 501 })
}

export async function readyResponseOf(_env: ReadyEnv): Promise<Response> {
  return new Response(null, { status: 501 })
}
