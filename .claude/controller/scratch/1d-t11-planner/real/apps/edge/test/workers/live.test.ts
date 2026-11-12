// Live pokes from the vault (1D-T10, spec §6.5, plan 1D's L1 and L2):
// GET /v1/sync/live upgrades to a socket the vault holds with the Hibernation
// API. After each commit the person's other sessions hear {"revision":"<n>"};
// a session that ends closes with 4401, whatever the call that ended it
// answered. Sockets are opened through the Worker's front door (openLive).
// Nothing here waits on a timer to pass: "nothing arrived" is proven by a ping
// whose pong comes after anything the vault sent before it, and a socket's
// close is awaited. The 2-second limits in next() and closeCode() only turn a
// failure into a quick, named one.
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CommandAck } from '@gogospend/contracts'

import { LIVE_VAULT_URL, acceptLive, closeEndedSessions, parseLiveClaims, pokeMessage, pokeOthers } from '../../src/vault/live'
import type { UserVault } from '../../src/vault/user-vault'
import { sqlExec, sqlRows } from './support/command-fixtures'
import { BASE, createLunch, member, openLive, signedHeaders, startV1, vaultOf } from './support/v1-client'
import type { LiveTestSocket, TestUser, V1Client } from './support/v1-client'

let client: V1Client
const opened: LiveTestSocket[] = []

beforeEach(async () => {
  client = await startV1()
})

afterEach(() => {
  for (const socket of opened.splice(0)) socket.close()
})

const DAY = 86_400_000
const POKE = /^\{"revision":"(0|[1-9][0-9]*)"\}$/

/** Another session (phone) of the same person, as 1A's logout test makes one. */
const otherSession = (user: TestUser): TestUser => ({ ...user, sid: crypto.randomUUID() })

/** Opens a socket for this session and fails, on an assertion, unless it upgraded. */
async function live(user: TestUser): Promise<LiveTestSocket> {
  const result = await openLive(client, user)
  expect(result.status, 'the live socket upgrades').toBe(101)
  expect(result.socket, 'the live socket upgrades').toBeDefined()
  opened.push(result.socket as LiveTestSocket)
  return result.socket as LiveTestSocket
}

/** The socket's close code, or 'open' when it has not closed within `ms`. */
async function closeCode(socket: LiveTestSocket, ms = 2_000): Promise<number | 'open'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const open = new Promise<'open'>((resolve) => {
    timer = setTimeout(() => resolve('open'), ms)
  })
  const result = await Promise.race([socket.closed.then((closed) => closed.code), open])
  clearTimeout(timer)
  return result
}

/** Pings, and expects the pong as the next message: the socket is open, and nothing the vault sent before the ping is left unread. */
async function pong(socket: LiveTestSocket): Promise<void> {
  socket.send('ping')
  expect(await socket.next()).toBe('pong')
}

const setClock = (user: TestUser, at: number) =>
  runInDurableObject(vaultOf(user), (v: UserVault) => {
    v.clock = () => new Date(at)
  })

const revisionOf = async (user: TestUser): Promise<string> =>
  (await sqlRows<{ revision: string }>(user, 'SELECT CAST(revision AS TEXT) AS revision FROM sync_state WHERE id = 1'))[0].revision

async function createWallet(user: TestUser): Promise<CommandAck> {
  const res = await client.as(user).post('/v1/wallets', { id: crypto.randomUUID(), name: 'Cash', opening_minor: '0', tracking_start: '2026-10-01' })
  expect(res.status).toBe(201)
  return (await res.json()) as CommandAck
}

describe('pokes', () => {
  it('the other phone hears the new revision, and the saving phone hears nothing', async () => {
    const a = await member(client)
    const b = otherSession(a)
    const socketA = await live(a)
    const socketB = await live(b)
    const ack = await createWallet(a)
    expect(await socketB.next()).toBe(`{"revision":"${ack.committed_revision}"}`)
    // The vault pokes before the call returns, so a poke to A would arrive before A's pong.
    await pong(socketA)
    expect(socketA.messages).toEqual(['pong'])
  })

  it('the revision is compared as a whole number, so 9 to 10 is a poke', async () => {
    const a = await member(client)
    const socketB = await live(otherSession(a))
    await sqlExec(a, 'UPDATE sync_state SET revision = 9 WHERE id = 1')
    const ack = await createWallet(a)
    expect(ack.committed_revision).toBe('10')
    expect(await socketB.next()).toBe('{"revision":"10"}')
  })

  it('a poke reaches a phone whose socket hibernated', async () => {
    const a = await member(client)
    const b = otherSession(a)
    const socketB = await live(b)
    await runInDurableObject(vaultOf(a), (v: UserVault) => {
      v.lastStartAttemptMs = 1
    })
    await evictDurableObject(vaultOf(a), { webSockets: 'hibernate' })
    const ack = await createWallet(a)
    expect(await socketB.next()).toBe(pokeMessage(ack.committed_revision))
    // The write woke a new instance, which still holds B's socket and its attachment.
    const woke = await runInDurableObject(vaultOf(a), (v: UserVault, state) => ({ marker: v.lastStartAttemptMs, attachments: state.getWebSockets().map((ws) => ws.deserializeAttachment()) }))
    expect(woke.marker).toBeNull()
    expect(woke.attachments).toEqual([{ sessionId: b.sid, issuedAt: expect.any(Number), openedAt: expect.any(Number) }])
  })

  it('sockets never carry record data', async () => {
    const a = await member(client)
    const socketB = await live(otherSession(a))
    const lunch = await createLunch(client, a)
    expect((await client.as(a).patch(`/v1/transactions/${lunch}`, { note: 'ร้านป้าแดง 6500' }, { ifMatch: 1 })).status).toBe(200)
    expect((await client.as(a).del(`/v1/transactions/${lunch}`, { ifMatch: 2 })).status).toBe(200)
    const last = await revisionOf(a)
    // A wallet, the built-in categories, the lunch, its edit and its delete: one poke each, in order.
    const received: string[] = []
    while (received.at(-1) !== pokeMessage(last)) received.push(await socketB.next())
    expect(received).toHaveLength(5)
    for (const message of received) expect(message).toMatch(POKE)
    expect(received.map((message) => BigInt(JSON.parse(message).revision))).toEqual([...received.keys()].map((i) => BigInt(last) - 4n + BigInt(i)))
  })

  it('a retention purge pokes every phone', async () => {
    const a = await member(client)
    const b = otherSession(a)
    const lunch = await createLunch(client, a)
    expect((await client.as(a).del(`/v1/transactions/${lunch}`, { ifMatch: 1 })).status).toBe(200)
    const socketA = await live(a)
    const socketB = await live(b)
    const before = await revisionOf(a)
    await setClock(a, Date.now() + 31 * DAY)
    expect(await runDurableObjectAlarm(vaultOf(a))).toBe(true)
    const purged = await revisionOf(a)
    expect(BigInt(purged)).toBe(BigInt(before) + 1n)
    expect(await socketA.next()).toBe(pokeMessage(purged))
    expect(await socketB.next()).toBe(pokeMessage(purged))
  })

  it('a send to a socket that is already closing is skipped, and the others still get the poke', async () => {
    const a = await member(client)
    const b = otherSession(a)
    const c = otherSession(a)
    await live(a)
    const socketB = await live(b)
    const socketC = await live(c)
    const sent = await runInDurableObject(vaultOf(a), (_v, state) => {
      for (const ws of state.getWebSockets(a.sid)) ws.close(1000, 'closing')
      return pokeOthers(state, '7', null)
    })
    expect(sent).toBe(2)
    expect(await socketB.next()).toBe('{"revision":"7"}')
    expect(await socketC.next()).toBe('{"revision":"7"}')
  })

  it('a commit whose pokes fail still answers, and its revision moves: the work after a call never throws', async () => {
    // The 1D-T10 review's probe P6b: the sockets cannot be listed while a write commits.
    const a = await member(client)
    const before = await revisionOf(a)
    const fanOut = await runInDurableObject(vaultOf(a), (_v, state) =>
      vi.spyOn(state, 'getWebSockets').mockImplementation(() => {
        throw new Error('the sockets cannot be listed')
      }),
    )
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let lines: string[] = []
    try {
      await createWallet(a)
      lines = errors.mock.calls.map(([line]) => String(line))
    } finally {
      fanOut.mockRestore()
      errors.mockRestore()
    }
    expect(BigInt(await revisionOf(a))).toBe(BigInt(before) + 1n)
    expect(lines).toContain('{"level":"error","event":"live_after_call_failed","failure":"Error"}')
  })
})

describe('keepalive and messages', () => {
  it('ping is answered, even after the vault sleeps, without waking it', async () => {
    const a = await member(client)
    const socket = await live(a)
    await pong(socket)
    await evictDurableObject(vaultOf(a))
    await pong(socket)
    // The pong came from the runtime: the vault is still asleep, so there is nothing to evict.
    await expect(evictDurableObject(vaultOf(a))).rejects.toThrow()
  })

  it("a phone's own close is answered, and the vault no longer holds its socket", async () => {
    const a = await member(client)
    const socket = await live(a)
    socket.close()
    expect(await closeCode(socket)).toBe(1000)
    expect(await runInDurableObject(vaultOf(a), (_v, state) => state.getWebSockets().length)).toBe(0)
  })

  it('a message other than ping closes the socket with 1008', async () => {
    const socket = await live(await member(client))
    socket.send('{"revision":"1"}')
    expect(await closeCode(socket)).toBe(1008)
  })
})

describe('sessions', () => {
  it("signing out closes that phone's socket with 4401 and leaves the other open", async () => {
    const a = await member(client)
    const b = otherSession(a)
    const socketA = await live(a)
    const socketB = await live(b)
    expect((await client.as(b).post('/v1/me/logout')).status).toBe(204)
    expect(await closeCode(socketB)).toBe(4401)
    await pong(socketA)
  })

  it('a refused call still closes the sockets it ended: a raised not_before', async () => {
    const a = await member(client)
    const socketA = await live(a)
    const socketB = await live(otherSession(a))
    await sqlExec(a, 'UPDATE account_state SET not_before = ?', Math.floor(Date.now() / 1000) + 60)
    const res = await client.as(a).get('/v1/me')
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('SESSION_REQUIRED')
    expect(await closeCode(socketA)).toBe(4401)
    expect(await closeCode(socketB)).toBe(4401)
  })

  it('a refused call still closes the sockets it ended: an account being deleted', async () => {
    const a = await member(client)
    const socketA = await live(a)
    const socketB = await live(otherSession(a))
    await sqlExec(a, "UPDATE account_state SET status = 'deleting'")
    const res = await client.as(a).get('/v1/me')
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('ACCOUNT_UNAVAILABLE')
    expect(await closeCode(socketA)).toBe(4401)
    expect(await closeCode(socketB)).toBe(4401)
  })

  it('an erased vault closes every socket when asked (closeEndedSessions with erased)', async () => {
    const a = await member(client)
    const socketA = await live(a)
    const socketB = await live(otherSession(a))
    expect(await runInDurableObject(vaultOf(a), (_v, state) => closeEndedSessions(state, state.storage.sql, true))).toBe(2)
    expect(await closeCode(socketA)).toBe(4401)
    expect(await closeCode(socketB)).toBe(4401)
  })

  it('an ended session cannot open a socket', async () => {
    const a = await member(client)
    expect((await client.as(a).post('/v1/me/logout')).status).toBe(204)
    const result = await openLive(client, a)
    expect(result).toMatchObject({ status: 401, body: { code: 'SESSION_REQUIRED' } })
    expect(result.socket).toBeUndefined()
    // The checks run before the accept: the vault holds no socket for the refused open.
    expect(await runInDurableObject(vaultOf(a), (_v, state) => state.getWebSockets().length)).toBe(0)
  })

  it('an erased vault cannot open a socket, and nothing is re-created', async () => {
    const a = await member(client)
    await vaultOf(a).erase()
    const result = await openLive(client, a)
    expect(result).toMatchObject({ status: 403, body: { code: 'ACCOUNT_UNAVAILABLE' } })
    expect(result.socket).toBeUndefined()
    // Even with its marker gone, the erased instance refuses before it reads a table, so no account is made (C17).
    await sqlExec(a, 'DELETE FROM account_state')
    expect((await openLive(client, a)).status).toBe(403)
    expect(await sqlRows(a, 'SELECT count(*) AS n FROM account_state')).toEqual([{ n: 0 }])
  })

  it("a session's second socket replaces its first", async () => {
    const a = await member(client)
    const first = await live(a)
    const second = await live(a)
    expect(await closeCode(first)).toBe(4409)
    await pong(second)
  })
})

describe('the front door and the vault', () => {
  it('without a token it is 401, an outdated client 426, and a plain GET 400', async () => {
    const a = await member(client)
    const noToken = await client.raw(new Request(`${BASE}/v1/sync/live`, { headers: { 'x-gogospend-client': 'ios/1.0.0', upgrade: 'websocket' } }))
    expect(noToken.status).toBe(401)
    expect((await noToken.json()).code).toBe('UNAUTHENTICATED')
    expect(await openLive(client, a, { client: 'ios/0.9.0' })).toMatchObject({ status: 426, body: { code: 'CLIENT_UPGRADE_REQUIRED' } })
    const plain = await client.as(a).get('/v1/sync/live')
    expect(plain.status).toBe(400)
    expect((await plain.json()).code).toBe('VALIDATION_FAILED')
    // The upgrade header is compared without regard to case.
    const mixed = await client.raw(new Request(`${BASE}/v1/sync/live`, { headers: { ...(await signedHeaders(a)), upgrade: 'WebSocket' } }))
    expect(mixed.status).toBe(101)
    mixed.webSocket?.accept()
    mixed.webSocket?.close(1000)
  })

  it("the vault answers only the Worker's live request, and checks every claim", async () => {
    const a = await member(client)
    const claims = { accountId: a.sub, sessionId: a.sid, issuedAt: 1_800_000_000, clientId: 'ios/1.0.0' }
    expect(parseLiveClaims(JSON.stringify(claims))).toEqual(claims)
    expect(parseLiveClaims(JSON.stringify({ ...claims, authTime: 1_799_999_000 }))).toEqual({ ...claims, authTime: 1_799_999_000 })
    const broken = [
      null,
      'not json',
      '[]',
      JSON.stringify({ ...claims, accountId: 'not-a-uuid' }),
      JSON.stringify({ ...claims, sessionId: 'not-a-uuid' }),
      JSON.stringify({ ...claims, issuedAt: 1.5 }),
      JSON.stringify({ ...claims, issuedAt: '1800000000' }),
      JSON.stringify({ ...claims, clientId: '' }),
      JSON.stringify({ ...claims, authTime: 'recent' }),
      JSON.stringify({ accountId: claims.accountId, sessionId: claims.sessionId, clientId: claims.clientId }),
    ]
    for (const header of broken) expect(parseLiveClaims(header), String(header)).toBeNull()
    // The object has no public route: only the Worker's internal request, with claims that parse, reaches the checks.
    const ask = (url: string, headers: Record<string, string>) => vaultOf(a).fetch(new Request(url, { headers }))
    expect((await ask('https://vault.internal/other', { upgrade: 'websocket', 'x-vault-claims': JSON.stringify(claims) })).status).toBe(404)
    expect((await ask(LIVE_VAULT_URL, { 'x-vault-claims': JSON.stringify(claims) })).status).toBe(404)
    const bad = await ask(LIVE_VAULT_URL, { upgrade: 'websocket', 'x-vault-claims': JSON.stringify({ ...claims, sessionId: 'not-a-session' }) })
    expect(bad.status).toBe(400)
    expect((await bad.json()).code).toBe('VALIDATION_FAILED')
  })
})

describe('limits', () => {
  it('only open sockets count toward 20', async () => {
    const a = await member(client)
    const t0 = Date.now()
    const sockets: LiveTestSocket[] = []
    for (let i = 0; i < 20; i += 1) {
      await setClock(a, t0 + i * 1_000)
      sockets.push(await live(otherSession(a)))
    }
    // The newest phone closes its own socket; once closed it no longer counts.
    sockets[19].close()
    expect(await closeCode(sockets[19])).toBe(1000)
    for (let i = 20; i < 22; i += 1) {
      await setClock(a, t0 + i * 1_000)
      sockets.push(await live(otherSession(a)))
    }
    expect(await closeCode(sockets[0])).toBe(4409)
    for (const socket of [...sockets.slice(1, 19), ...sockets.slice(20)]) await pong(socket)
  })

  it('a socket that is closing does not count toward 20', async () => {
    const a = await member(client)
    const t0 = Date.now()
    const sessions = Array.from({ length: 20 }, () => otherSession(a))
    const sockets: LiveTestSocket[] = []
    for (const [i, session] of sessions.entries()) {
      await setClock(a, t0 + i * 1_000)
      sockets.push(await live(session))
    }
    const newcomer = otherSession(a)
    const oldest = await runInDurableObject(vaultOf(a), (_v, state) => {
      // The newest socket starts closing in this same turn: still listed, no longer open.
      for (const ws of state.getWebSockets(sessions[19].sid)) ws.close(1000, 'closing')
      acceptLive(state, { accountId: a.sub, sessionId: newcomer.sid, issuedAt: Math.floor(t0 / 1000), clientId: 'ios/1.0.0' }, t0 + 30_000)
      const readyState = state.getWebSockets(sessions[0].sid)[0]?.readyState
      for (const ws of state.getWebSockets(newcomer.sid)) ws.close(1000, 'done')
      return readyState
    })
    expect(oldest).toBe(WebSocket.OPEN)
    await pong(sockets[0])
  })

  it("opening a socket spends the session's read budget: past 120 a minute it is 429 and nothing upgrades", async () => {
    const a = await member(client)
    // One fixed vault minute, so the budget window cannot roll over during the test.
    await setClock(a, Date.now())
    let latest: LiveTestSocket | undefined
    for (let i = 0; i < 120; i += 1) latest = await live(a)
    const refused = await openLive(client, a)
    expect(refused).toMatchObject({ status: 429, body: { code: 'RATE_LIMITED' } })
    expect(refused.socket).toBeUndefined()
    await pong(latest as LiveTestSocket)
  })
})
