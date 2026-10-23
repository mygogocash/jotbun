// Differential parity for the sign-in and privacy routes: challenges, the
// ID-token bootstrap and proofs, account linking, global logout, deletion and
// its receipt, and signed provider events. The same script runs against the
// built NestJS v1 server and the edge on one database, each with its own
// fresh identities, with Auth0 Management played by the API's fake.
// Needs `npm run build -w gogospend-api` first.
import { randomUUID } from 'node:crypto'

import type { ApiIdentity } from '@gogospend/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { signSecurityEvent } from '@api/auth/auth0-event-verifier'
import { FAKE_PROFILE_CLIENT_ID, FAKE_PROFILE_CLIENT_SECRET, startManagementFake } from '@api/testing/auth0-management-fake'
import type { ManagementFake } from '@api/testing/auth0-management-fake'
import { TEST_CLIENT_ID } from '@api/testing/jwks-server'

import { BASE, startEdge } from './support/edge-harness'
import type { Edge, SignedUp } from './support/edge-harness'
import { startNest } from './support/nest-server'
import type { NestServer, Send } from './support/nest-server'
import { normalizer, seenOf, trace } from './support/parity'
import type { Seen } from './support/parity'

const EVENTS_SECRET = 'synthetic-provider-events-secret-0123456789'

let edge: Edge
let nest: NestServer | undefined
let fake: ManagementFake

beforeAll(async () => {
  fake = await startManagementFake()
  const settings = {
    AUTH0_MANAGEMENT_URL: fake.url,
    AUTH0_PROFILE_LINK_CLIENT_ID: FAKE_PROFILE_CLIENT_ID,
    AUTH0_PROFILE_LINK_CLIENT_SECRET: FAKE_PROFILE_CLIENT_SECRET,
    AUTH0_EVENTS_SIGNING_SECRETS: EVENTS_SECRET,
  }
  edge = await startEdge(settings)
  nest = await startNest(edge, settings)
}, 60_000)

afterAll(async () => {
  nest?.stop()
  await edge?.close()
  await fake?.close()
})

const now = () => Math.floor(Date.now() / 1000)

/** A fresh Auth0 identity whose verified profile the Management fake knows. */
function knownIdentity(): ApiIdentity {
  const who = edge.fx.identity()
  const [provider, id] = who.subject.split('|')
  fake.profiles.set(who.subject, { user_id: who.subject, email_verified: true, identities: [{ connection: 'Username-Password-Authentication', provider, user_id: id }] })
  return who
}

// Sign-in steps are limited to 10 per identity a minute (auth_principal), so
// each phase uses its own account: who signs in, linker links, leaver signs
// out everywhere, member deletes.
type State = {
  who: ApiIdentity
  binding: string
  second: ApiIdentity
  linker: SignedUp
  leaver: SignedUp
  member: SignedUp
  eventUser: SignedUp
  eventId: string
  challenge: { challenge_id: string; nonce: string }
  secondary: { challenge_id: string; nonce: string }
  proofId: string
  keys: { link: string; logout: string; deletion: string }
}

type Step = {
  name: string
  build(st: State): Promise<Request>
  after?(st: State, body: unknown): void
}

const tokenHeaders = async (who: ApiIdentity, binding?: string): Promise<Record<string, string>> => ({
  'x-gogospend-client': 'ios/1.0.0',
  authorization: `Bearer ${await edge.issuer.accessToken({ sub: who.subject })}`,
  ...(binding ? { 'x-gogospend-session': binding } : {}),
})
const idToken = (who: ApiIdentity, nonce: string) => edge.issuer.sign({ iss: edge.issuer.issuer, sub: who.subject, aud: TEST_CLIENT_ID, nonce, auth_time: now(), iat: now(), exp: now() + 600 })
const post = (path: string, headers: Record<string, string>, body?: unknown, raw?: string) =>
  new Request(`${BASE}${path}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body ?? {}) })
const get = (path: string, headers: Record<string, string>) => new Request(`${BASE}${path}`, { headers })
const asChallenge = (body: unknown) => body as { challenge_id: string; nonce: string }

const challenge = (who: (st: State) => ApiIdentity, purpose: string, key?: (st: State) => string, binding?: (st: State) => string) => async (st: State) =>
  post('/v1/auth/challenges', await tokenHeaders(who(st), binding?.(st)), { request_id: randomUUID(), purpose, command_id: key ? key(st) : randomUUID() })

const event = (st: State, signed: boolean) => {
  const body = JSON.stringify({ id: st.eventId, type: 'password_changed', issuer: edge.issuer.issuer, subject: st.eventUser.who.subject, occurred_at: new Date().toISOString() })
  return post('/v1/auth/provider-events', signed ? { 'x-gogospend-event-signature': signSecurityEvent(body, EVENTS_SECRET, now()) } : {}, undefined, body)
}

const STEPS: Step[] = [
  { name: 'challenge, unknown purpose', build: challenge((st) => st.who, 'nope') },
  { name: 'challenge, missing fields', build: async (st) => post('/v1/auth/challenges', await tokenHeaders(st.who), { purpose: 'bootstrap' }) },
  { name: 'challenge, no token', build: async () => post('/v1/auth/challenges', { 'x-gogospend-client': 'ios/1.0.0' }, { request_id: randomUUID(), purpose: 'bootstrap', command_id: randomUUID() }) },
  { name: 'sign-in challenge', build: challenge((st) => st.who, 'bootstrap'), after: (st, body) => (st.challenge = asChallenge(body)) },
  { name: 'sign-in, wrong nonce', build: async (st) => post('/v1/auth/bootstrap', await tokenHeaders(st.who), { challenge_id: st.challenge.challenge_id, id_token: await idToken(st.who, 'not-the-nonce') }) },
  { name: 'sign-in challenge again', build: challenge((st) => st.who, 'bootstrap'), after: (st, body) => (st.challenge = asChallenge(body)) },
  { name: 'sign-in, bad challenge id', build: async (st) => post('/v1/auth/bootstrap', await tokenHeaders(st.who), { challenge_id: 'nope', id_token: await idToken(st.who, st.challenge.nonce) }) },
  {
    name: 'sign-in',
    build: async (st) => post('/v1/auth/bootstrap', await tokenHeaders(st.who), { challenge_id: st.challenge.challenge_id, id_token: await idToken(st.who, st.challenge.nonce) }),
    after: (st, body) => (st.binding = (body as { binding: string }).binding),
  },
  { name: 'sign-in replayed', build: async (st) => post('/v1/auth/bootstrap', await tokenHeaders(st.who), { challenge_id: st.challenge.challenge_id, id_token: await idToken(st.who, st.challenge.nonce) }) },
  { name: 'me', build: async (st) => get('/v1/me', await tokenHeaders(st.who, st.binding)) },
  { name: 'accept terms', build: async (st) => post('/v1/me/policy-acceptances', await tokenHeaders(st.who, st.binding), { kind: 'terms', version: 1 }) },
  { name: 'proof, unknown challenge', build: async (st) => post('/v1/auth/proofs', await tokenHeaders(st.who), { challenge_id: randomUUID(), id_token: await idToken(st.who, 'x') }) },

  { name: 'link: proof challenge', build: challenge((st) => st.linker.who, 'link', (st) => st.keys.link), after: (st, body) => (st.challenge = asChallenge(body)) },
  {
    name: 'link: proof',
    build: async (st) => post('/v1/auth/proofs', await tokenHeaders(st.linker.who), { challenge_id: st.challenge.challenge_id, id_token: await idToken(st.linker.who, st.challenge.nonce) }),
    after: (st, body) => (st.proofId = (body as { proof_id: string }).proof_id),
  },
  { name: 'link: secondary challenge', build: challenge((st) => st.linker.who, 'link', (st) => st.keys.link), after: (st, body) => (st.secondary = asChallenge(body)) },
  {
    name: 'link, bad proof id',
    build: async (st) => post('/v1/me/identities', { ...(await tokenHeaders(st.linker.who, st.linker.binding)), 'idempotency-key': st.keys.link }, { proof_id: 'nope', secondary_challenge_id: st.secondary.challenge_id, secondary_id_token: await idToken(st.second, st.secondary.nonce) }),
  },
  {
    name: 'link, no idempotency key',
    build: async (st) => post('/v1/me/identities', await tokenHeaders(st.linker.who, st.linker.binding), { proof_id: st.proofId, secondary_challenge_id: st.secondary.challenge_id, secondary_id_token: await idToken(st.second, st.secondary.nonce) }),
  },
  {
    name: 'link',
    build: async (st) => post('/v1/me/identities', { ...(await tokenHeaders(st.linker.who, st.linker.binding)), 'idempotency-key': st.keys.link }, { proof_id: st.proofId, secondary_challenge_id: st.secondary.challenge_id, secondary_id_token: await idToken(st.second, st.secondary.nonce) }),
  },
  { name: 'me after linking', build: async (st) => get('/v1/me', await tokenHeaders(st.linker.who, st.linker.binding)) },

  { name: 'logout: challenge', build: challenge((st) => st.leaver.who, 'global_logout', (st) => st.keys.logout), after: (st, body) => (st.challenge = asChallenge(body)) },
  {
    name: 'logout: proof',
    build: async (st) => post('/v1/auth/proofs', await tokenHeaders(st.leaver.who), { challenge_id: st.challenge.challenge_id, id_token: await idToken(st.leaver.who, st.challenge.nonce) }),
    after: (st, body) => (st.proofId = (body as { proof_id: string }).proof_id),
  },
  { name: 'global logout, other key', build: async (st) => post('/v1/me/global-logout', { ...(await tokenHeaders(st.leaver.who, st.leaver.binding)), 'idempotency-key': randomUUID() }, { proof_id: st.proofId }) },
  { name: 'global logout', build: async (st) => post('/v1/me/global-logout', { ...(await tokenHeaders(st.leaver.who, st.leaver.binding)), 'idempotency-key': st.keys.logout }, { proof_id: st.proofId }) },
  { name: 'after global logout', build: async (st) => get('/v1/me', await tokenHeaders(st.leaver.who, st.leaver.binding)) },

  { name: 'deletion: challenge', build: challenge((st) => st.member.who, 'deletion', (st) => st.keys.deletion), after: (st, body) => (st.challenge = asChallenge(body)) },
  {
    name: 'deletion: proof',
    build: async (st) => post('/v1/auth/proofs', await tokenHeaders(st.member.who), { challenge_id: st.challenge.challenge_id, id_token: await idToken(st.member.who, st.challenge.nonce) }),
    after: (st, body) => (st.proofId = (body as { proof_id: string }).proof_id),
  },
  { name: 'deletion, no idempotency key', build: async (st) => post('/v1/me/deletion', await tokenHeaders(st.member.who, st.member.binding), { proof_id: st.proofId }) },
  { name: 'deletion', build: async (st) => post('/v1/me/deletion', { ...(await tokenHeaders(st.member.who, st.member.binding)), 'idempotency-key': st.keys.deletion }, { proof_id: st.proofId }) },
  { name: 'deletion replayed', build: async (st) => post('/v1/me/deletion', { ...(await tokenHeaders(st.member.who, st.member.binding)), 'idempotency-key': st.keys.deletion }, { proof_id: st.proofId }) },
  { name: 'deletion receipt', build: async (st) => post('/v1/auth/deletion-receipt', await tokenHeaders(st.member.who, st.member.binding), { command_id: st.keys.deletion }) },
  { name: 'deletion receipt, other command', build: async (st) => post('/v1/auth/deletion-receipt', await tokenHeaders(st.member.who, st.member.binding), { command_id: randomUUID() }) },
  { name: 'deletion receipt, no binding', build: async (st) => post('/v1/auth/deletion-receipt', await tokenHeaders(st.member.who), { command_id: st.keys.deletion }) },
  { name: 'me after deletion', build: async (st) => get('/v1/me', await tokenHeaders(st.member.who, st.member.binding)) },

  { name: 'event, unsigned', build: async (st) => event(st, false) },
  { name: 'event', build: async (st) => event(st, true) },
  { name: 'event again', build: async (st) => event(st, true) },
  { name: 'event, too large', build: async () => post('/v1/auth/provider-events', {}, undefined, JSON.stringify({ padding: 'x'.repeat(9_000) })) },
  { name: 'event, malformed JSON', build: async () => post('/v1/auth/provider-events', {}, undefined, '{"id":') },
  { name: 'signed-out user after the event', build: async (st) => get('/v1/me', await tokenHeaders(st.eventUser.who, st.eventUser.binding)) },
]

async function runSession(send: Send): Promise<Seen[]> {
  const st = {
    who: knownIdentity(),
    second: knownIdentity(),
    linker: await edge.member(),
    leaver: await edge.member(),
    member: await edge.member(),
    eventUser: await edge.member(),
    eventId: `evt_${randomUUID()}`,
    keys: { link: randomUUID(), logout: randomUUID(), deletion: randomUUID() },
  } as State
  const out: Seen[] = []
  for (const step of STEPS) {
    const res = await send(await step.build(st))
    const seen = await seenOf(res)
    trace(step.name, seen)
    if (seen.status < 300) step.after?.(st, seen.body)
    out.push(seen)
  }
  return out
}

describe('the edge signs in, links, signs out and deletes exactly like the NestJS v1 API', () => {
  it('runs one scripted session on each and compares every response', async () => {
    const nestRun = await runSession(nest!.send)
    const edgeRun = await runSession(edge.call)
    const nestNorm = normalizer(new Set(), ['binding', 'nonce'])
    const edgeNorm = normalizer(new Set(), ['binding', 'nonce'])
    const differences = STEPS.flatMap((step, i) => {
      const a = { ...nestRun[i], body: nestNorm(nestRun[i].body) }
      const b = { ...edgeRun[i], body: edgeNorm(edgeRun[i].body) }
      return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ step: `${i + 1}. ${step.name}`, nest: a, edge: b }]
    })
    expect(differences).toEqual([])
    // The script must reach the real outcomes, not a wall of identical errors.
    const byName = new Map(STEPS.map((step, i) => [step.name, nestRun[i].status]))
    expect(byName.get('sign-in')).toBe(201)
    expect(byName.get('link')).toBe(202)
    expect(byName.get('global logout')).toBe(202)
    expect(byName.get('deletion')).toBe(202)
    expect(byName.get('deletion receipt')).toBe(200)
    expect(byName.get('event')).toBe(200)
    expect(fake.links.length).toBe(0)
  })
})
