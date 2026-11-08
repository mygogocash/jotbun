export type JotbunJwtClaims = { sid: string; auth_time: number }

/** `sid` is the session id. `auth_time` is when that session was created, in epoch seconds. */
export function jwtPayload(session: { session: { id: string; createdAt: Date | string | number } }): JotbunJwtClaims {
  return {
    sid: session.session.id,
    auth_time: Math.floor(new Date(session.session.createdAt).getTime() / 1000),
  }
}
