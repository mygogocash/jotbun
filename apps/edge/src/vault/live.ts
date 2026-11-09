// Live pokes (1D-T10, spec §6.5, plan 1D's L1 and L2). The vault holds each
// phone's socket with the WebSocket Hibernation API, so a vault with open
// sockets still sleeps. After every call and alarm it compares the revision:
// when a block committed, every other session hears {"revision":"<n>"} and
// pulls through its ordinary sync. Sockets never carry record data: the vault
// sends only that poke, the runtime answers `ping` with `pong`, and the phone
// sends nothing else. After every call, whatever its outcome, the sockets whose
// session has ended close with 4401. A send or close that throws (a socket
// already closing) is skipped, and the loop goes on.
import type { DurableObjectStateLike } from 'cloudflare:workers'

import { isUuid } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'

import { problemResponse } from '../server/http/problem'
import { logFailure } from '../v1/log'
import type { VaultClaims, VaultReply } from '../v1/protocol'
import { toProblemReply } from './replies'

/** What a socket keeps through hibernation: its session, its token's iat (epoch seconds) and when it opened (the vault clock, epoch ms). */
export type LiveAttachment = { sessionId: string; issuedAt: number; openedAt: number }

/** 4401: the session ended. 4409: a newer socket took its place. 1008: the phone sent something other than ping. */
export const LIVE_CLOSE = { sessionEnded: 4401, replaced: 4409, unexpected: 1008 } as const

/** At most this many sockets are open in one vault; past it the oldest open one closes with 4409. */
export const MAX_LIVE_SOCKETS = 20

/** The internal request the Worker hands the vault. The object has no public route, so only the Worker can build it. */
export const LIVE_VAULT_URL = 'https://vault.internal/live'

/** The one header that carries the verified claims to the vault. The token never reaches it. */
const CLAIMS_HEADER = 'x-vault-claims'

/** The account's revision as text, '0' before the account exists. Compared as BigInt, never as a number. */
export function currentRevision(sql: SqlStorage): string {
  return sql.exec<{ revision: string }>('SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1').toArray()[0]?.revision ?? '0'
}

/** The only message the vault sends: the new revision, and nothing of the record. */
export function pokeMessage(revision: string): string {
  return JSON.stringify({ revision })
}

/** Closes a socket. One that is already closing throws, and is skipped. True when this call closed it. */
export function closeSocket(ws: WebSocket, code: number, reason: string): boolean {
  try {
    ws.close(code, reason)
    return true
  } catch {
    return false
  }
}

function attachmentOf(ws: WebSocket): LiveAttachment | null {
  try {
    const value = ws.deserializeAttachment() as LiveAttachment | null
    return value !== null && typeof value === 'object' && typeof value.sessionId === 'string' ? value : null
  } catch {
    return null
  }
}

/** Sends the poke to every socket whose session is not `exceptSession`. A send that throws is skipped. Returns how many were sent. */
export function pokeOthers(state: DurableObjectStateLike, revision: string, exceptSession: string | null): number {
  const message = pokeMessage(revision)
  let sent = 0
  for (const ws of state.getWebSockets()) {
    if (exceptSession !== null && state.getTags(ws).includes(exceptSession)) continue
    try {
      ws.send(message)
      sent += 1
    } catch {
      // Already closing: skipped.
    }
  }
  return sent
}

/**
 * Closes, with 4401, every socket whose session has ended. With `erased`, every
 * socket closes and no table is read. Otherwise an account that is not active
 * (or missing) closes every socket, and an active one closes the sockets whose
 * token was issued before `not_before` or whose session was signed out. The
 * signed-out check is one query with the session ids bound as one JSON
 * parameter (R57). Returns how many closed.
 */
export function closeEndedSessions(state: DurableObjectStateLike, sql: SqlStorage, erased: boolean): number {
  const sockets = state.getWebSockets()
  if (sockets.length === 0) return 0
  let ended: (attachment: LiveAttachment | null) => boolean = () => true
  if (!erased) {
    const [account] = sql.exec<{ status: string; not_before: number }>('SELECT status, not_before FROM account_state WHERE id = 1').toArray()
    if (account?.status === 'active') {
      const ids = [...new Set(sockets.flatMap((ws) => attachmentOf(ws)?.sessionId ?? []))]
      const revoked = new Set(
        sql
          .exec<{ session_id: string }>('SELECT session_id FROM revoked_sessions WHERE session_id IN (SELECT value FROM json_each(?))', JSON.stringify(ids))
          .toArray()
          .map((row) => row.session_id),
      )
      ended = (attachment) => attachment === null || attachment.issuedAt < account.not_before || revoked.has(attachment.sessionId)
    }
  }
  let closed = 0
  for (const ws of sockets) {
    if (ended(attachmentOf(ws)) && closeSocket(ws, LIVE_CLOSE.sessionEnded, 'session ended')) closed += 1
  }
  return closed
}

/**
 * After a call or an alarm (L2): pokes every session but `exceptSession` when
 * the revision grew past `before` (only a committed block moves it), then
 * closes the sockets whose session has ended, whatever the outcome. Never
 * throws: a failure is logged, and the reply goes back unchanged.
 */
export function afterVaultWork(state: DurableObjectStateLike, before: string, exceptSession: string | null): void {
  try {
    const sql = state.storage.sql
    const after = currentRevision(sql)
    if (BigInt(after) > BigInt(before)) pokeOthers(state, after, exceptSession)
    closeEndedSessions(state, sql, false)
  } catch (error) {
    logFailure('live_after_call_failed', error)
  }
}

/** The claims the Worker wrote, every VaultClaims field checked: UUID account and session ids, an integer iat, a client id, and an integer auth_time when present. Anything else is null. */
export function parseLiveClaims(header: string | null): VaultClaims | null {
  if (header === null) return null
  let value: unknown
  try {
    value = JSON.parse(header)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { accountId, sessionId, issuedAt, clientId, authTime } = value as Record<string, unknown>
  if (typeof accountId !== 'string' || !isUuid(accountId) || typeof sessionId !== 'string' || !isUuid(sessionId)) return null
  if (typeof issuedAt !== 'number' || !Number.isInteger(issuedAt)) return null
  if (typeof clientId !== 'string' || clientId.length === 0) return null
  if (authTime !== undefined && (typeof authTime !== 'number' || !Number.isInteger(authTime))) return null
  return authTime === undefined ? { accountId, sessionId, issuedAt, clientId } : { accountId, sessionId, issuedAt, clientId, authTime }
}

/** True when the request asks for a WebSocket (`upgrade: websocket`, in any case). */
export function wantsWebSocket(request: Request): boolean {
  return request.headers.get('upgrade')?.toLowerCase() === 'websocket'
}

/** The Worker's request to the vault: the internal URL, the upgrade and the verified claims, and nothing else. */
export function liveRequest(claims: VaultClaims): Request {
  return new Request(LIVE_VAULT_URL, { headers: { upgrade: 'websocket', [CLAIMS_HEADER]: JSON.stringify(claims) } })
}

/** The only request UserVault#fetch serves: a GET of the internal URL that asks for a WebSocket. */
export function isLiveRequest(request: Request): boolean {
  return request.method === 'GET' && request.url === LIVE_VAULT_URL && wantsWebSocket(request)
}

/** The claims of a live request. An erased vault refuses first (403), before it reads a table; claims that do not parse are 400. */
export function liveClaimsOf(request: Request, erased: boolean): VaultClaims {
  if (erased) throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE')
  const claims = parseLiveClaims(request.headers.get(CLAIMS_HEADER))
  if (!claims) throw new ProblemException(400, 'VALIDATION_FAILED')
  return claims
}

/** A refused open: the problem toProblemReply makes of the error, as v1 JSON with its status. It never upgrades. */
export function liveRefusal(error: unknown): Response {
  const reply = toProblemReply(error) as Extract<VaultReply, { ok: false }>
  return problemResponse(reply.status, reply.code, crypto.randomUUID(), reply.problem)
}

/**
 * Accepts the socket of a session whose checks passed: its earlier sockets
 * close with 4409, the new one is accepted with the tag [sessionId] and its
 * attachment, and while more than MAX_LIVE_SOCKETS are open the oldest open
 * one, by openedAt, closes with 4409. A closing socket does not count.
 */
export function acceptLive(state: DurableObjectStateLike, claims: VaultClaims, nowMs: number): Response {
  for (const old of state.getWebSockets(claims.sessionId)) closeSocket(old, LIVE_CLOSE.replaced, 'replaced')
  const pair = new WebSocketPair()
  const client = pair[0]
  const server = pair[1]
  state.acceptWebSocket(server, [claims.sessionId])
  const attachment: LiveAttachment = { sessionId: claims.sessionId, issuedAt: claims.issuedAt, openedAt: nowMs }
  server.serializeAttachment(attachment)
  const others = state
    .getWebSockets()
    .filter((ws) => ws.readyState === WebSocket.OPEN)
    .map((ws) => ({ ws, openedAt: attachmentOf(ws)?.openedAt ?? 0, sessionId: attachmentOf(ws)?.sessionId }))
    .filter((open) => open.sessionId !== claims.sessionId)
    .sort((a, b) => a.openedAt - b.openedAt)
  let excess = others.length + 1 - MAX_LIVE_SOCKETS
  for (const { ws } of others) {
    if (excess <= 0) break
    if (closeSocket(ws, LIVE_CLOSE.replaced, 'too many sockets')) excess -= 1
  }
  return new Response(null, { status: 101, webSocket: client })
}
