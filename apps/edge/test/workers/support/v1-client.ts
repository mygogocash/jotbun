// The Worker front door's test client, run in workerd. The UserClient and
// CommandOptions shapes are copied from test/support/edge-harness.ts, which
// imports PostgreSQL code and cannot load here. Tokens are signed with an
// EdDSA key from jose, and the verifier reads that key from a local JWKS.
import { env } from 'cloudflare:workers'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import type { PolicyVersionDto } from '@gogospend/contracts'

import { EDGE_CONFIG_KEY } from '../../../src/v1/config'
import type { EdgeConfigJson } from '../../../src/v1/config'
import { handleVaultV1 } from '../../../src/v1/handler'
import { createTokenVerifier } from '../../../src/v1/tokens'
import type { UserVault } from '../../../src/vault/user-vault'

export const BASE = 'http://vault.test'
export const ISSUER = 'https://issuer.test/'
export const AUDIENCE = 'https://api.jotbun.test'
const KID = 'synthetic-v1-key'

export type TestUser = { sub: string; sid: string }
export type TokenOptions = { iat?: number; exp?: number; client?: string; omitSid?: boolean }
export type CommandOptions = { key?: string; schema?: number | null; ifMatch?: number | null }

export type UserClient = {
  get(path: string): Promise<Response>
  post(path: string, body?: unknown, options?: CommandOptions): Promise<Response>
  patch(path: string, body: unknown, options?: CommandOptions): Promise<Response>
  put(path: string, body: unknown, options?: CommandOptions): Promise<Response>
  del(path: string, options?: CommandOptions): Promise<Response>
}

export type V1Client = {
  as(user: TestUser, opts?: TokenOptions): UserClient
  raw(request: Request): Promise<Response>
}

/** Terms v1 (required) and privacy v1, in the order GET /v1/policies answers them (sorted by kind). */
export const TEST_POLICIES: PolicyVersionDto[] = [
  { kind: 'privacy', version: 1, required: false, published_at: '2026-10-24T00:00:00.000Z', text: { th: 'ความเป็นส่วนตัว', en: 'Privacy' } },
  { kind: 'terms', version: 1, required: true, published_at: '2026-10-24T00:00:00.000Z', text: { th: 'ข้อกำหนด', en: 'Terms' } },
]

const DEFAULT_CONFIG: EdgeConfigJson = { policies: TEST_POLICIES, client_versions: { ios: '1.0.0', android: '1.0.0' } }

const keys = (async () => {
  const pair = await generateKeyPair('EdDSA', { extractable: true })
  const published = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'EdDSA', use: 'sig' }
  return { signer: pair.privateKey, jwks: createLocalJWKSet({ keys: [published] }) }
})()

export const newUser = (): TestUser => ({ sub: crypto.randomUUID(), sid: crypto.randomUUID() })

async function tokenFor(user: TestUser, opts: TokenOptions): Promise<string> {
  const { signer } = await keys
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT(opts.omitSid ? {} : { sid: user.sid })
    .setProtectedHeader({ alg: 'EdDSA', kid: KID })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(user.sub)
    .setIssuedAt(opts.iat ?? now)
    .setExpirationTime(opts.exp ?? now + 300)
    .sign(signer)
}

/** A correctly shaped token signed by a key the Worker does not publish. */
export async function tokenSignedByUnpublishedKey(user: TestUser): Promise<string> {
  const { privateKey } = await generateKeyPair('EdDSA', { extractable: true })
  return new SignJWT({ sid: user.sid })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'unpublished' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(user.sub)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}

function clientFor(raw: (request: Request) => Promise<Response>, user: TestUser, opts: TokenOptions): UserClient {
  const client = opts.client ?? 'ios/1.0.0'
  const send = async (method: string, path: string, body: unknown, options: CommandOptions = {}): Promise<Response> => {
    const headers: Record<string, string> = {
      'x-gogospend-client': client,
      authorization: `Bearer ${await tokenFor(user, opts)}`,
      'idempotency-key': options.key ?? crypto.randomUUID(),
    }
    if (options.schema !== null) headers['x-gogospend-command-schema'] = String(options.schema ?? 1)
    if (options.ifMatch !== undefined && options.ifMatch !== null) headers['if-match'] = `"${options.ifMatch}"`
    if (body !== undefined) headers['content-type'] = 'application/json'
    return raw(new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }))
  }
  return {
    get: async (path) => raw(new Request(`${BASE}${path}`, { headers: { 'x-gogospend-client': client, authorization: `Bearer ${await tokenFor(user, opts)}` } })),
    post: (path, body = {}, options) => send('POST', path, body, options),
    patch: (path, body, options) => send('PATCH', path, body, options),
    put: (path, body, options) => send('PUT', path, body, options),
    del: (path, options) => send('DELETE', path, undefined, options),
  }
}

/**
 * The Worker answers with the config written to KV (or none, or a malformed
 * one), and verifies tokens against the local key. Each call rewrites the KV
 * entry, so every test starts from the config it names.
 */
export async function startV1(config: EdgeConfigJson | 'absent' | 'malformed' = DEFAULT_CONFIG): Promise<V1Client> {
  if (config === 'absent') await env.CONFIG.delete(EDGE_CONFIG_KEY)
  else if (config === 'malformed') await env.CONFIG.put(EDGE_CONFIG_KEY, JSON.stringify({ gates: 'nope' }))
  else await env.CONFIG.put(EDGE_CONFIG_KEY, JSON.stringify(config))
  const verifier = createTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, keys: (await keys).jwks })
  const raw = (request: Request) => handleVaultV1(request, env, { verifier })
  return { as: (user, opts = {}) => clientFor(raw, user, opts), raw }
}

/** Accepts the required terms for the user, so later calls are not refused for policy. */
export async function member(client: V1Client, user: TestUser = newUser()): Promise<TestUser> {
  const res = await client.as(user).post('/v1/me/policy-acceptances', { kind: 'terms', version: 1 })
  if (res.status !== 204) throw new Error(`accepting the terms answered ${res.status}`)
  return user
}

/** The vault that holds this person's ledger, as the Worker addresses it. */
export function vaultOf(user: TestUser): DurableObjectStub<UserVault> {
  return env.VAULT.get(env.VAULT.idFromName(user.sub), { locationHint: 'apac' })
}
