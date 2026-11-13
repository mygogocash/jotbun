// P4-T3: the vault's slip tables, the salt, slip accounts and the inbox count. The salt
// answers before slip import opens (S13, S16); the slip accounts wait for SLIP_IMPORT_ENABLED,
// which wrangler.jsonc keeps off, so a case that reads or maps them releases it for its own
// front door. Only the inbox count is change-logged (S1), and erase leaves no slip row (C7).
// Synthetic values only: no slip image, no real reference, no real account. P4-T7 adds the P4-T3
// reviews' pins (followups, "P4-T6 and P4-T7"): whole unreleased answers, two faults in R41's order,
// one account per mapping, a draft counted once, the inbox's own head, and a salt never logged or sent.
import { env } from 'cloudflare:workers'
import { evictAllDurableObjects, runInDurableObject } from 'cloudflare:test'
import { drizzle } from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { SLIP_INBOX_ID, isSlipAccountDto, isSlipAccountsDto, isSlipDraftsPage, isSlipSaltDto, isSyncChangesPage, slipRefHash } from '@gogospend/contracts'

import { createServerAnalytics } from '../../src/analytics/server-analytics'
import type { CaptureMessage, PostHogPort } from '../../src/analytics/server-analytics'
import type { V1Env } from '../../src/v1/env'
import { appendChanges } from '../../src/vault/commands/change-log'
import { buildVaultRegistry } from '../../src/vault/commands/registry'
import { VAULT_MIGRATIONS } from '../../src/vault/migrations'
import { ensureSlipAccount, slipAccountFor } from '../../src/vault/slips/accounts'
import { SLIP_DRAFT_COLUMNS, inboxChange, openDraftCount, slipDraftDto, slipDuplicateOf } from '../../src/vault/slips/inbox'
import type { SlipDraftRow } from '../../src/vault/slips/inbox'
import { inVault, sqlExec, sqlRows } from './support/command-fixtures'
import { migrateBefore } from './support/migrations'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { party, randomRefHash, seedSlipDraft } from './support/slips'
import { BASE, TEST_POLICIES, member, newUser, startV1, vaultOf } from './support/v1-client'

const CONFIG = { policies: TEST_POLICIES, client_versions: { ios: '1.0.0', android: '1.0.0' } }
/** This front door with slip import released; wrangler.jsonc keeps SLIP_IMPORT_ENABLED "false". */
const RELEASED = { env: { SLIP_IMPORT_ENABLED: 'true' } }
const AT = '2026-10-25T00:00:00.000Z'
const SLIP_TABLES = ['slip_accounts', 'slip_backfill_uses', 'slip_drafts', 'slip_leases', 'slip_refs', 'slip_salt']
const USER_TABLES = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> '__drizzle_migrations' ORDER BY name"

type Json = Record<string, unknown>
const json = async (res: Response): Promise<Json> => (await res.json()) as Json
/** A response's status and problem code. */
const shape = async (res: Response): Promise<{ status: number; code: unknown }> => ({ status: res.status, code: (await json(res)).code })
/** A response as a client sees it, but its request id: status, every header and the body. */
async function seen(res: Response): Promise<{ status: number; headers: [string, string][]; body: unknown }> {
  const headers = [...res.headers].filter(([name]) => name !== 'x-request-id').sort()
  const text = await res.text()
  let body: unknown = text
  if (text.length > 0) {
    const parsed = JSON.parse(text) as Json
    delete parsed.request_id
    body = parsed
  }
  return { status: res.status, headers, body }
}

describe('the slip salt (S16, S13)', () => {
  it("the salt is 32 random bytes made on the first read, the same ever after, and another person's differs", async () => {
    const client = await startV1(CONFIG, RELEASED)
    const user = newUser()
    const first = await client.as(user).get('/v1/slips/salt')
    expect(first.status).toBe(200)
    const body = await json(first)
    expect(isSlipSaltDto(body)).toBe(true)
    const bytes = Buffer.from(String(body.salt), 'base64url')
    expect(bytes.length).toBe(32)
    // The answer is the one stored salt.
    expect(await sqlRows(user, 'SELECT id, lower(hex(salt)) AS hex FROM slip_salt')).toEqual([{ id: 1, hex: bytes.toString('hex') }])
    expect(await json(await client.as(user).get('/v1/slips/salt'))).toEqual(body)
    await evictAllDurableObjects()
    expect(await json(await client.as(user).get('/v1/slips/salt'))).toEqual(body)
    const other = await json(await client.as(newUser()).get('/v1/slips/salt'))
    expect(isSlipSaltDto(other)).toBe(true)
    expect(other.salt).not.toBe(body.salt)
  })

  it('the salt answers while slip import is unreleased, and the other slip routes are 404', async () => {
    // wrangler.jsonc's own var: SLIP_IMPORT_ENABLED "false".
    const hidden = await startV1(CONFIG)
    const user = await member(hidden)
    const salt = await hidden.as(user).get('/v1/slips/salt')
    expect(salt.status).toBe(200)
    expect(isSlipSaltDto(await salt.json())).toBe(true)
    const put = (body = '{}', headers: Record<string, string> = {}) =>
      new Request(`${BASE}/v1/slip-accounts/${randomUUID()}`, { method: 'PUT', headers: { 'content-type': 'application/json', ...headers }, body })
    // As an unknown path answers, header for header and body for body but the request id (the P4-T3
    // reviews' m1 and m2): with no token at all, with a malformed body, signed in, and with a paused
    // imports gate (the release comes before the gates).
    const id = randomUUID()
    const putAt = (path: string, body = '{}') => new Request(`${BASE}${path}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body })
    const asMissing = async (label: string, path: string, send: (to: string) => Promise<Response>) => {
      const unreleased = await seen(await send(path))
      expect(unreleased.status, label).toBe(404)
      expect(unreleased, label).toEqual(await seen(await send(path.replace('/v1/slip-accounts', '/v1/slip-accountz'))))
    }
    await asMissing('GET, no token', '/v1/slip-accounts', (to) => hidden.raw(new Request(`${BASE}${to}`)))
    await asMissing('PUT, no token', `/v1/slip-accounts/${id}`, (to) => hidden.raw(putAt(to)))
    await asMissing('PUT, a malformed body', `/v1/slip-accounts/${id}`, (to) => hidden.raw(putAt(to, '{')))
    await asMissing('GET, signed in', '/v1/slip-accounts', (to) => hidden.as(user).get(to))
    await asMissing('PUT, signed in', `/v1/slip-accounts/${id}`, (to) => hidden.as(user).put(to, { wallet_id: null }, { ifMatch: 1 }))
    const pausedImports = await startV1({ ...CONFIG, gates: { paused: ['imports'] } })
    await asMissing('PUT, imports paused', `/v1/slip-accounts/${id}`, (to) => pausedImports.raw(putAt(to)))
    // Only 1 or true releases them: a near miss stays hidden (the Opus review's n2).
    for (const value of ['yes', 'TRUE', ' true', 'true ']) {
      expect((await (await startV1(CONFIG, { env: { SLIP_IMPORT_ENABLED: value } })).as(user).get('/v1/slip-accounts')).status, JSON.stringify(value)).toBe(404)
    }
    expect((await (await startV1(CONFIG, { env: { SLIP_IMPORT_ENABLED: '1' } })).as(user).get('/v1/slip-accounts')).status).toBe(200)
    // Released, the same requests reach the checks after the release: the body (400), the gates (503), the client (426), the token (401).
    expect((await (await startV1(CONFIG, RELEASED)).raw(put('{'))).status).toBe(400)
    expect((await (await startV1({ ...CONFIG, gates: { paused: ['imports'] } }, RELEASED)).raw(put())).status).toBe(503)
    const open = await startV1(CONFIG, RELEASED)
    const client = { 'x-gogospend-client': 'ios/1.0.0' }
    expect((await open.raw(new Request(`${BASE}/v1/slip-accounts`))).status).toBe(426)
    expect((await open.raw(new Request(`${BASE}/v1/slip-accounts`, { headers: client }))).status).toBe(401)
    expect((await open.raw(put('{}', client))).status).toBe(401)
  })

  it('the salt is never logged or sent to analytics: its first read, later reads, a read after an erase', async () => {
    const sent: CaptureMessage[] = []
    const pending: Promise<unknown>[] = []
    const port: PostHogPort = { captureImmediate: async (message) => void sent.push(message) }
    const analytics = (e: V1Env) => createServerAnalytics(e, (promise) => void pending.push(promise), () => port)
    const settle = async () => {
      while (pending.length > 0) await Promise.all(pending.splice(0))
    }
    const client = await startV1(CONFIG, { env: { POSTHOG_PROJECT_TOKEN: 'phc_test', ANALYTICS_ID_KEY: 'test-analytics-key' }, analytics })
    const money = moneyFixtures(client)
    const user = await money.member()
    expect((await client.as(user).put('/v1/me/privacy-preferences', { analytics: true })).status).toBe(200)
    await settle()
    sent.length = 0
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => undefined))
    let lines = ''
    let salt = ''
    try {
      salt = String((await json(await client.as(user).get('/v1/slips/salt'))).salt)
      await client.as(user).get('/v1/slips/salt')
      await settle()
      await vaultOf(user).erase()
      expect((await client.as(user).get('/v1/slips/salt')).status).toBe(403)
    } finally {
      // Read the lines before restoring: mockRestore clears them.
      lines = JSON.stringify(spies.flatMap((spy) => spy.mock.calls)).toLowerCase()
      for (const spy of spies) spy.mockRestore()
    }
    expect(salt.length).toBe(43)
    expect([lines.includes(salt.toLowerCase()), lines.includes(Buffer.from(salt, 'base64url').toString('hex'))]).toEqual([false, false])
    await settle()
    expect(sent).toEqual([])
    // The control: with the same consent, a person's typed record is sent.
    const other = await money.member()
    expect((await client.as(other).put('/v1/me/privacy-preferences', { analytics: true })).status).toBe(200)
    await money.record(other, { type: 'expense', amount_minor: '6500', occurred_on: '2026-10-20', wallet_id: await money.wallet(other), category_id: builtinId(other, 'food') })
    await settle()
    expect(sent.map((message) => message.event)).toEqual(['record_saved'])
  })

  it("the Worker's WebCrypto gives the contract's hash vector", async () => {
    const salt = Uint8Array.from({ length: 32 }, (_, i) => i + 1)
    const sha256 = async (data: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data)))
    // The vector P4-T1's Node test checks against node:crypto.
    expect(await slipRefHash(salt, '004:016297184012BPP06418', sha256)).toBe('029e46f70cbfa751f030c1d33b671859ad9519c17eecd52e6a0539775443df5a')
  })
})

describe('slip accounts (S2, S1)', () => {
  it('a slip account is made once per bank and last four digits', async () => {
    const user = newUser()
    const ids = await inVault(user, (c) => [ensureSlipAccount(c, 'kbank', '1234'), ensureSlipAccount(c, 'kbank', '1234'), ensureSlipAccount(c, 'scb', '1234'), ensureSlipAccount(c, 'kbank', '5678')])
    expect(ids[1]).toBe(ids[0])
    expect(new Set(ids).size).toBe(3)
    // A later call finds the same account.
    expect(await inVault(user, (c) => ensureSlipAccount(c, 'kbank', '1234'))).toBe(ids[0])
    expect(await sqlRows(user, 'SELECT id, bank, account_last4, version, wallet_id FROM slip_accounts ORDER BY bank, account_last4')).toEqual([
      { id: ids[0], bank: 'kbank', account_last4: '1234', version: 1, wallet_id: null },
      { id: ids[3], bank: 'kbank', account_last4: '5678', version: 1, wallet_id: null },
      { id: ids[2], bank: 'scb', account_last4: '1234', version: 1, wallet_id: null },
    ])
    // One side of a slip finds its account by both its bank and its last four digits, or none.
    expect(
      await inVault(user, (c) => [
        slipAccountFor(c, 'kbank', '1234'),
        slipAccountFor(c, 'kbank', '9999'),
        slipAccountFor(c, 'ktb', '1234'),
        slipAccountFor(c, 'kbank', null),
        slipAccountFor(c, null, '1234'),
        slipAccountFor(c, null, null),
      ]),
    ).toEqual([{ id: ids[0], wallet_id: null }, null, null, null, null, null])
  })

  it('the slip accounts list shows each account with its open drafts', async () => {
    const client = await startV1(CONFIG, RELEASED)
    const user = await member(client)
    // Made in no particular order; three have no open draft.
    const made: ['ttb' | 'bay' | 'scb' | 'kbank', string][] = [['ttb', '0001'], ['bay', '9999'], ['scb', '9876'], ['bay', '0002'], ['kbank', '1234']]
    await inVault(user, (c) => made.forEach(([bank, last4]) => ensureSlipAccount(c, bank, last4)))
    // kbank 1234 is on three drafts (sent twice, received once) and scb 9876 on one (received). A side
    // whose bank or last four digits alone match an account counts for none, and so does a side with neither.
    await seedSlipDraft(user, { from: party('kbank', '1234'), to: party('ktb', '5555') })
    await seedSlipDraft(user, { from: party('kbank', '1234'), to: party('scb', '9876') })
    await seedSlipDraft(user, { direction: 'in', from: party('bbl', '1111'), to: party('kbank', '1234') })
    await seedSlipDraft(user, { from: party('kbank', '9876'), to: party('scb', '1234') })
    await seedSlipDraft(user, { from: party(null, null), to: party(null, null) })
    const res = await client.as(user).get('/v1/slip-accounts')
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(isSlipAccountsDto(body)).toBe(true)
    const accounts = body.accounts as { bank: string; account_last4: string; open_drafts: number; version: number; wallet_id: string | null }[]
    expect(accounts.map((account) => [account.bank, account.account_last4, account.open_drafts])).toEqual([
      ['kbank', '1234', 3],
      ['scb', '9876', 1],
      ['bay', '0002', 0],
      ['bay', '9999', 0],
      ['ttb', '0001', 0],
    ])
    expect(accounts.map((account) => [account.version, account.wallet_id])).toEqual(made.map(() => [1, null]))
  })

  it('mapping an account needs its version and a live wallet, and null unmaps', async () => {
    const client = await startV1(CONFIG, RELEASED)
    const money = moneyFixtures(client)
    const user = await money.member()
    const cash = await money.wallet(user, { name: 'Cash' })
    const old = await money.wallet(user, { name: 'Old' })
    expect((await client.as(user).post(`/v1/wallets/${old}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
    const id = await inVault(user, (c) => ensureSlipAccount(c, 'kbank', '1234'))
    await seedSlipDraft(user)
    const put = (body: unknown, ifMatch?: number) => client.as(user).put(`/v1/slip-accounts/${id}`, body, { ifMatch })
    const mapped = await put({ wallet_id: cash }, 1)
    expect(mapped.status).toBe(200)
    const account = await json(mapped)
    expect(account).toEqual({ id, version: 2, bank: 'kbank', account_last4: '1234', wallet_id: cash, open_drafts: 1 })
    expect(isSlipAccountDto(account)).toBe(true)
    // A stale version is 409 with the current account.
    const stale = await put({ wallet_id: null }, 1)
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ code: 'VERSION_CONFLICT', current: account })
    // Only a live, unarchived wallet: an archived one and an unknown one are 422 on wallet_id.
    const archived = await put({ wallet_id: old }, 2)
    expect(archived.status).toBe(422)
    expect(await archived.json()).toMatchObject({ code: 'VALIDATION_FAILED', fields: { wallet_id: 'errors.wallet_archived' } })
    const unknown = await put({ wallet_id: randomUUID() }, 2)
    expect(unknown.status).toBe(422)
    expect(await unknown.json()).toMatchObject({ code: 'VALIDATION_FAILED', fields: { wallet_id: 'errors.wallet_not_found' } })
    // The body as the contract reads it, and If-Match as a command's.
    const notAnId = await put({ wallet_id: 'cash' }, 2)
    expect(notAnId.status).toBe(422)
    expect(await notAnId.json()).toMatchObject({ fields: { wallet_id: 'VALIDATION_FAILED' } })
    const extra = await put({ wallet_id: cash, bank: 'scb' }, 2)
    expect(extra.status).toBe(422)
    expect(await extra.json()).toMatchObject({ code: 'UNKNOWN_FIELD', fields: { bank: 'UNKNOWN_FIELD' } })
    const unmatched = await put({ wallet_id: cash })
    expect(unmatched.status).toBe(422)
    expect(await unmatched.json()).toMatchObject({ code: 'VALIDATION_FAILED', fields: { if_match: 'VALIDATION_FAILED' } })
    // An unknown id, or one that is not an id, is 404.
    expect((await client.as(user).put(`/v1/slip-accounts/${randomUUID()}`, { wallet_id: cash }, { ifMatch: 1 })).status).toBe(404)
    expect((await client.as(user).put('/v1/slip-accounts/kbank-1234', { wallet_id: cash }, { ifMatch: 1 })).status).toBe(404)
    // Nothing above moved it; null unmaps.
    const unmapped = await put({ wallet_id: null }, 2)
    expect(unmapped.status).toBe(200)
    expect(await json(unmapped)).toEqual({ ...account, version: 3, wallet_id: null })
    expect((await json(await client.as(user).get('/v1/slip-accounts'))).accounts).toEqual([{ ...account, version: 3, wallet_id: null }])
  })

  it('mapping one account changes only that account', async () => {
    const client = await startV1(CONFIG, RELEASED)
    const money = moneyFixtures(client)
    const user = await money.member()
    const cash = await money.wallet(user, { name: 'Cash' })
    const [first, second] = await inVault(user, (c) => [ensureSlipAccount(c, 'kbank', '1234'), ensureSlipAccount(c, 'scb', '9876')])
    const res = await client.as(user).put(`/v1/slip-accounts/${second}`, { wallet_id: cash }, { ifMatch: 1 })
    expect(res.status).toBe(200)
    expect((await json(res)).id).toBe(second)
    expect(await sqlRows(user, 'SELECT id, version, wallet_id FROM slip_accounts ORDER BY bank')).toEqual([
      { id: first, version: 1, wallet_id: null },
      { id: second, version: 2, wallet_id: cash },
    ])
  })

  it('two faults at once answer the first check in R41 order: If-Match, the id, the body, the version, then the wallet', async () => {
    const client = await startV1(CONFIG, RELEASED)
    const money = moneyFixtures(client)
    const user = await money.member()
    const cash = await money.wallet(user, { name: 'Cash' })
    const old = await money.wallet(user, { name: 'Old' })
    expect((await client.as(user).post(`/v1/wallets/${old}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
    const id = await inVault(user, (c) => ensureSlipAccount(c, 'kbank', '1234'))
    expect((await client.as(user).put(`/v1/slip-accounts/${id}`, { wallet_id: cash }, { ifMatch: 1 })).status).toBe(200)
    const answer = async (res: Response) => {
      const body = await json(res)
      return { status: res.status, code: body.code, fields: body.fields ?? null }
    }
    const put = (path: string, body: unknown, ifMatch?: number) => client.as(user).put(path, body, { ifMatch })
    const ifMatch = { status: 422, code: 'VALIDATION_FAILED', fields: { if_match: 'VALIDATION_FAILED' } }
    // If-Match before the body, and before the id.
    expect(await answer(await put(`/v1/slip-accounts/${id}`, { wallet_id: cash, bank: 'scb' }))).toEqual(ifMatch)
    expect(await answer(await put('/v1/slip-accounts/kbank-1234', { wallet_id: cash }))).toEqual(ifMatch)
    // The id before the body.
    expect(await answer(await put('/v1/slip-accounts/kbank-1234', { wallet_id: cash, bank: 'scb' }, 2))).toEqual({ status: 404, code: 'NOT_FOUND', fields: null })
    // The body before the version: stale, with a wallet that is not an id.
    expect(await answer(await put(`/v1/slip-accounts/${id}`, { wallet_id: 'cash' }, 1))).toEqual({ status: 422, code: 'VALIDATION_FAILED', fields: { wallet_id: 'VALIDATION_FAILED' } })
    // The version before the wallet: stale with an archived wallet is 409, and an unknown account with an unknown wallet 404.
    expect((await answer(await put(`/v1/slip-accounts/${id}`, { wallet_id: old }, 1))).status).toBe(409)
    expect(await answer(await put(`/v1/slip-accounts/${randomUUID()}`, { wallet_id: randomUUID() }, 1))).toEqual({ status: 404, code: 'NOT_FOUND', fields: null })
    expect(await sqlRows(user, 'SELECT version, wallet_id FROM slip_accounts')).toEqual([{ version: 2, wallet_id: cash }])
  })

  it('a draft whose two sides are the same account counts once for it', async () => {
    const client = await startV1(CONFIG, RELEASED)
    const user = await member(client)
    await inVault(user, (c) => void ensureSlipAccount(c, 'kbank', '1234'))
    await seedSlipDraft(user, { from: party('kbank', '1234'), to: party('kbank', '1234') })
    const res = await client.as(user).get('/v1/slip-accounts')
    expect(res.status).toBe(200)
    expect(((await json(res)).accounts as { open_drafts: number }[]).map((account) => account.open_drafts)).toEqual([1])
  })

  it('mapping is a write under the current policy and the imports gate; the list needs only the session', async () => {
    const client = await startV1(CONFIG, RELEASED)
    const user = newUser()
    const id = await inVault(user, (c) => ensureSlipAccount(c, 'kbank', '1234'))
    expect((await client.as(user).get('/v1/slip-accounts')).status).toBe(200)
    expect(await shape(await client.as(user).put(`/v1/slip-accounts/${id}`, { wallet_id: null }, { ifMatch: 1 }))).toEqual({ status: 403, code: 'POLICY_ACCEPTANCE_REQUIRED' })
    await member(client, user)
    const paused = await startV1({ ...CONFIG, gates: { paused: ['imports'] } }, RELEASED)
    expect(await shape(await paused.as(user).put(`/v1/slip-accounts/${id}`, { wallet_id: null }, { ifMatch: 1 }))).toEqual({ status: 503, code: 'IMPORTS_PAUSED' })
    expect(await sqlRows(user, 'SELECT version FROM slip_accounts')).toEqual([{ version: 1 }])
  })
})

describe('the slip inbox (S1)', () => {
  it('the inbox change carries the open count, and its version only moves forward', async () => {
    const user = newUser()
    const registry = buildVaultRegistry()
    expect(await inVault(user, (c) => [openDraftCount(c), inboxChange(c)])).toEqual([0, { entity: 'slip_inbox', id: SLIP_INBOX_ID, version: 1, state: 'active', snapshot: { id: SLIP_INBOX_ID, version: 1, open: 0 } }])
    await seedSlipDraft(user)
    await seedSlipDraft(user)
    // A slip that is known but has no draft (dismissed) is not open.
    await sqlExec(user, "INSERT INTO slip_refs (id, ref_hash, state, transaction_id, first_seen_at, updated_at) VALUES (?, ?, 'dismissed', NULL, ?, ?)", randomUUID(), randomRefHash(), AT, AT)
    const first = await inVault(user, (c) => inboxChange(c))
    expect(first).toEqual({ entity: 'slip_inbox', id: SLIP_INBOX_ID, version: 1, state: 'active', snapshot: { id: SLIP_INBOX_ID, version: 1, open: 2 } })
    // The vault's own registry takes it: the contract's slip_inbox snapshot.
    await expect(inVault(user, (c) => void appendChanges(c, randomUUID(), [first]), { registry })).resolves.toBeUndefined()
    await seedSlipDraft(user)
    const second = await inVault(user, (c) => inboxChange(c))
    expect(second).toEqual({ entity: 'slip_inbox', id: SLIP_INBOX_ID, version: 2, state: 'active', snapshot: { id: SLIP_INBOX_ID, version: 2, open: 3 } })
    await expect(inVault(user, (c) => void appendChanges(c, randomUUID(), [second]), { registry })).resolves.toBeUndefined()
    // The head never goes back.
    await expect(inVault(user, (c) => void appendChanges(c, randomUUID(), [first]), { registry })).rejects.toThrow(/did not move forward/)
    // The delta feed serves the count only, as the contract reads it.
    const page = await json(await (await startV1(CONFIG)).as(user).get('/v1/sync/changes'))
    expect(isSyncChangesPage(page)).toBe(true)
    expect((page.groups as { changes: unknown[] }[]).flatMap((group) => group.changes)).toEqual([first, second])
  })

  it("the inbox version follows its own head, not another entity's", async () => {
    const client = await startV1(CONFIG)
    const money = moneyFixtures(client)
    const user = await money.member()
    const cash = await money.wallet(user, { name: 'Cash' })
    expect((await client.as(user).patch(`/v1/wallets/${cash}`, { name: 'Cash 2' }, { ifMatch: 1 })).status).toBe(200)
    expect((await client.as(user).patch(`/v1/wallets/${cash}`, { name: 'Cash 3' }, { ifMatch: 2 })).status).toBe(200)
    await seedSlipDraft(user)
    expect(await inVault(user, (c) => inboxChange(c).version)).toBe(1)
  })

  it("a draft reads back as the contract's DTO, both sides and its flags intact", async () => {
    const client = await startV1(CONFIG)
    const user = await moneyFixtures(client).member()
    const food = builtinId(user, 'food')
    const shared = await seedSlipDraft(user, {
      amount_minor: '99999999999',
      occurred_time: '23:59',
      direction: 'in',
      from: party('kbank', '1234', 'นาย สมชาย ใจดี'),
      to: party('scb', '9876', 'ร้านป้าแดง'),
      category_id: food,
      origin: 'share',
      created_at: AT,
    })
    await sqlExec(user, `UPDATE slip_drafts SET model = 'claude-opus-5-5', escalated = 1, flags = '["date_guessed","category_guessed"]' WHERE id = ?`, shared.draftId)
    const album = await seedSlipDraft(user, { created_at: AT })
    const duplicate = randomUUID()
    const read = (draftId: string, duplicateOf: string | null) =>
      inVault(user, (c) => slipDraftDto(c.sql.exec<SlipDraftRow>(`SELECT ${SLIP_DRAFT_COLUMNS} FROM slip_drafts WHERE id = ?`, draftId).one(), duplicateOf))
    const dto = await read(shared.draftId, duplicate)
    expect(dto).toEqual({
      id: shared.draftId,
      amount_minor: '99999999999',
      occurred_on: '2026-10-20',
      occurred_time: '23:59',
      direction: 'in',
      from: { bank: 'kbank', account_last4: '1234', name: 'นาย สมชาย ใจดี' },
      to: { bank: 'scb', account_last4: '9876', name: 'ร้านป้าแดง' },
      category_id: food,
      category_guessed: true,
      flags: ['date_guessed', 'category_guessed'],
      album: null,
      origin: 'share',
      model: 'claude-opus-5-5',
      escalated: true,
      created_at: AT,
      expires_at: '2026-11-24T00:00:00.000Z',
      duplicate_of: duplicate,
    })
    expect(isSlipDraftsPage({ drafts: [dto], total: 1, next_cursor: null })).toBe(true)
    expect(await read(album.draftId, null)).toMatchObject({ amount_minor: '6500', category_id: null, category_guessed: false, flags: [], album: 'K PLUS', origin: 'album', model: 'claude-haiku-5-5', escalated: false, duplicate_of: null })
  })

  it('a draft names the oldest live record with its amount and date as a possible duplicate', async () => {
    const client = await startV1(CONFIG)
    const money = moneyFixtures(client)
    const user = await money.member()
    const cash = await money.wallet(user)
    const food = builtinId(user, 'food')
    const [newer, older, deleted] = [randomUUID(), randomUUID(), randomUUID()]
    const insert = "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, version, deleted_at, created_at, updated_at) VALUES (?, 'expense', ?, ?, ?, ?, 1, ?, ?, ?)"
    // The newer record is written first, so only its time puts the older one first.
    await sqlExec(user, insert, newer, 6500, '2026-10-20', cash, food, null, '2026-10-21T02:00:00.000Z', '2026-10-21T02:00:00.000Z')
    await sqlExec(user, insert, older, 6500, '2026-10-20', cash, food, null, '2026-10-21T01:00:00.000Z', '2026-10-21T01:00:00.000Z')
    await sqlExec(user, insert, deleted, 4500, '2026-10-21', cash, food, '2026-10-22T00:00:00.000Z', '2026-10-21T00:00:00.000Z', '2026-10-22T00:00:00.000Z')
    expect(
      await inVault(user, (c) => [
        slipDuplicateOf(c, '6500', '2026-10-20'),
        slipDuplicateOf(c, '4500', '2026-10-21'),
        slipDuplicateOf(c, '6500', '2026-10-21'),
        slipDuplicateOf(c, '650', '2026-10-20'),
        slipDuplicateOf(c, null, '2026-10-20'),
        slipDuplicateOf(c, '6500', null),
      ]),
    ).toEqual([older, null, null, null, null, null])
  })
})

describe('the slip tables (§6.2, C7)', () => {
  it('erasing the vault leaves no salt, slip reference, slip account or draft (C7)', async () => {
    const client = await startV1(CONFIG, RELEASED)
    const user = await member(client)
    expect((await client.as(user).get('/v1/slips/salt')).status).toBe(200)
    await inVault(user, (c) => void ensureSlipAccount(c, 'kbank', '1234'))
    await seedSlipDraft(user)
    await sqlExec(user, "INSERT INTO slip_leases (id, expires_at, purpose, day, reserved) VALUES (?, 0, 'backfill', '2026-10-25', 3)", randomUUID())
    await sqlExec(user, "INSERT INTO slip_backfill_uses (day, uses) VALUES ('2026-10-25', 3)")
    const counts = async () => Object.fromEntries(await Promise.all(SLIP_TABLES.map(async (table) => [table, (await sqlRows<{ n: number }>(user, `SELECT count(*) AS n FROM ${table}`))[0].n])))
    expect(await counts()).toEqual(Object.fromEntries(SLIP_TABLES.map((table) => [table, 1])))
    await vaultOf(user).erase()
    expect(await counts()).toEqual(Object.fromEntries(SLIP_TABLES.map((table) => [table, 0])))
    // An erased vault never makes a salt again, even after it sleeps.
    await evictAllDurableObjects()
    expect(await shape(await client.as(user).get('/v1/slips/salt'))).toEqual({ status: 403, code: 'ACCOUNT_UNAVAILABLE' })
    expect(await counts()).toEqual(Object.fromEntries(SLIP_TABLES.map((table) => [table, 0])))
  })

  it('a vault the previous release wrote gains the slip tables and the column in place: every record, receipt link and import link keeps its row', async () => {
    await runInDurableObject(env.VAULT.get(env.VAULT.idFromName(randomUUID())), async (_vault, state) => {
      const rows = (query: string, ...bindings: unknown[]) => state.storage.sql.exec(query, ...bindings).toArray()
      const run = (query: string, ...bindings: unknown[]) => void state.storage.sql.exec(query, ...bindings).toArray()
      const upgrade = () => migrate(drizzle(state.storage), VAULT_MIGRATIONS)
      await migrateBefore(state, '_slips')
      const [cash, food, lunch, coffee, receipt, job, selection] = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]
      run("INSERT INTO wallets (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at) VALUES (?, 'เงินสด', 'THB', 0, '2026-01-01', 0, 1, ?, ?)", cash, AT, AT)
      run("INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at) VALUES (?, 'expense', NULL, 'ข้าว', NULL, 0, 1, ?, ?)", food, AT, AT)
      const expense = "INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant, source, version, created_at, updated_at) VALUES (?, 'expense', ?, '2026-10-20', ?, ?, ?, ?, ?, 1, ?, ?)"
      // A record confirmed from a statement import, and one holding a receipt.
      run(expense, lunch, 4500, cash, food, null, null, 'statement', AT, AT)
      run(expense, coffee, 99999999999, cash, food, 'กาแฟ', 'ร้านกาแฟ', null, AT, AT)
      run("INSERT INTO import_uploads (job_id, intake_token, status, file_name, declared_type, declared_bytes, format, bytes, sha256, part_count, parse_state, parse_attempts, created_at, receive_deadline, accepted_at, expires_at) VALUES (?, 'token', 'accepted', 'statement.csv', 'text/csv', 10, 'csv', 10, ?, 1, 'parsed', 1, ?, ?, ?, ?)", job, 'b'.repeat(64), AT, AT, AT, AT)
      run("INSERT INTO import_previews (job_id, status, layout, issues, candidate_count, review_required_count, review_revision, created_at, expires_at) VALUES (?, 'ready', 'generic', '[]', 1, 0, 1, ?, ?)", job, AT, AT)
      run('INSERT INTO import_selections (selection_id, job_id, frozen_revision, row_count, created_at, expires_at) VALUES (?, ?, 1, 1, ?, ?)', selection, job, AT, AT)
      run("INSERT INTO import_selection_rows (selection_id, source_row_id, ordinal, type, amount_minor, occurred_on, wallet_id, category_id, note, merchant) VALUES (?, 'row:1', 1, 'expense', 4500, '2026-10-20', ?, ?, NULL, NULL)", selection, cash, food)
      run("INSERT INTO import_row_progress (job_id, source_row_id, selection_id, transaction_id, command_id, committed_at) VALUES (?, 'row:1', ?, ?, ?, ?)", job, selection, lunch, randomUUID(), AT)
      run("INSERT INTO attachments (id, source_job_id, status, object_key, content_type, bytes, sha256, width, height, retained_at, released_at) VALUES (?, ?, 'retained', ?, 'image/jpeg', 10, ?, 1, 1, ?, NULL)", receipt, randomUUID(), `receipt/${'f'.repeat(64)}/${receipt}/${randomUUID()}/image.jpg`, 'a'.repeat(64), AT)
      run('INSERT INTO transaction_attachments (transaction_id, attachment_id, attached_at) VALUES (?, ?, ?)', coffee, receipt, AT)
      const columns = () => rows('PRAGMA table_info(transactions)').map((column) => column.name)
      const slipTables = () => rows(USER_TABLES).map((table) => String(table.name)).filter((name) => name.startsWith('slip_'))
      const records = 'SELECT rowid AS row_number, *, CAST(amount_minor AS TEXT) AS amount_text FROM transactions ORDER BY id'
      const links = 'SELECT (SELECT json_group_array(json_array(transaction_id, attachment_id)) FROM transaction_attachments) AS receipts, (SELECT json_group_array(json_array(job_id, transaction_id)) FROM import_row_progress) AS imports, (SELECT count(*) FROM attachment_checks) AS checks'
      const before = { columns: columns(), records: rows(records), links: rows(links) }
      expect(before.columns).not.toContain('slip_ref_id')
      expect(slipTables()).toEqual([])
      await upgrade()
      expect(columns()).toEqual([...before.columns, 'slip_ref_id'])
      expect(rows(records)).toEqual(before.records.map((row) => ({ ...row, slip_ref_id: null })))
      expect(rows(links)).toEqual(before.links)
      expect(slipTables()).toEqual(SLIP_TABLES)
      expect(rows('PRAGMA foreign_key_check')).toEqual([])
      // A record names a slip reference that exists, and only one.
      const ref = randomUUID()
      run("INSERT INTO slip_refs (id, ref_hash, state, transaction_id, first_seen_at, updated_at) VALUES (?, ?, 'recorded', ?, ?, ?)", ref, randomRefHash(), lunch, AT, AT)
      run('UPDATE transactions SET slip_ref_id = ? WHERE id = ?', ref, lunch)
      expect(() => run('UPDATE transactions SET slip_ref_id = ? WHERE id = ?', randomUUID(), coffee)).toThrow(/FOREIGN KEY/)
      // The next wake migrates again and changes nothing.
      await upgrade()
      expect(rows('SELECT id, slip_ref_id FROM transactions ORDER BY id')).toEqual([lunch, coffee].sort().map((id) => ({ id, slip_ref_id: id === lunch ? ref : null })))
      expect(rows('SELECT count(*) AS n FROM __drizzle_migrations')).toEqual([{ n: VAULT_MIGRATIONS.journal.entries.length }])
    })
  })

  it('each slip table takes a well-formed row and refuses one that breaks a rule', async () => {
    await runInDurableObject(env.VAULT.get(env.VAULT.idFromName(randomUUID())), (_vault, state) => {
      const run = (query: string, ...bindings: unknown[]) => void state.storage.sql.exec(query, ...bindings).toArray()
      const [wallet, category] = [randomUUID(), randomUUID()]
      run("INSERT INTO wallets (id, name, currency, opening_minor, tracking_start, archived, version, created_at, updated_at) VALUES (?, 'Cash', 'THB', 0, '2026-01-01', 0, 1, ?, ?)", wallet, AT, AT)
      run("INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at) VALUES (?, 'expense', NULL, 'Food', NULL, 0, 1, ?, ?)", category, AT, AT)
      const insert = (table: string, row: Record<string, unknown>): 'ok' | 'refused' => {
        const names = Object.keys(row)
        try {
          run(`INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`, ...Object.values(row))
          return 'ok'
        } catch {
          return 'refused'
        }
      }
      const salt = (o: Record<string, unknown> = {}) => ({ id: 1, salt: new Uint8Array(32), created_at: AT, ...o })
      const account = (o: Record<string, unknown> = {}) => ({ id: randomUUID(), version: 1, bank: 'kbank', account_last4: '1234', wallet_id: null, created_at: AT, updated_at: AT, ...o })
      const ref = (o: Record<string, unknown> = {}) => ({ id: randomUUID(), ref_hash: randomRefHash(), state: 'draft', transaction_id: null, first_seen_at: AT, updated_at: AT, ...o })
      /** A slip reference of its own for each draft row, written first. */
      const refId = (): string => {
        const row = ref()
        insert('slip_refs', row)
        return row.id
      }
      const draft = (o: Record<string, unknown> = {}) => ({
        id: randomUUID(),
        ref_id: refId(),
        amount_minor: 6500,
        occurred_on: '2026-10-20',
        occurred_time: '12:30',
        direction: 'out',
        from_bank: 'kbank',
        from_last4: '1234',
        from_name: 'นาย ทดสอบ',
        to_bank: 'scb',
        to_last4: '9876',
        to_name: 'ร้านป้าแดง',
        category_id: category,
        category_guessed: 1,
        flags: '["category_guessed"]',
        album: 'K PLUS',
        origin: 'album',
        model: 'claude-haiku-5-5',
        escalated: 0,
        announced: 0,
        created_at: AT,
        expires_at: AT,
        ...o,
      })
      const lease = (o: Record<string, unknown> = {}) => ({ id: randomUUID(), expires_at: 0, purpose: 'backfill', day: '2026-10-25', reserved: 0, ...o })
      const uses = (o: Record<string, unknown> = {}) => ({ day: '2026-10-25', uses: 500, ...o })
      const sameHash = randomRefHash()
      const firstDraft = draft()
      const cases: [string, string, Record<string, unknown>, 'ok' | 'refused'][] = [
        ['salt: another id than 1', 'slip_salt', salt({ id: 2 }), 'refused'],
        ['salt: 31 bytes', 'slip_salt', salt({ salt: new Uint8Array(31) }), 'refused'],
        ['salt: text, not bytes (STRICT)', 'slip_salt', salt({ salt: 'x'.repeat(32) }), 'refused'],
        ['salt: 32 bytes', 'slip_salt', salt(), 'ok'],
        ['account: version 0', 'slip_accounts', account({ version: 0 }), 'refused'],
        ['account: version 1.5 (STRICT)', 'slip_accounts', account({ version: 1.5 }), 'refused'],
        ['account: a bank in capitals', 'slip_accounts', account({ bank: 'Kbank' }), 'refused'],
        ['account: a bank of one letter', 'slip_accounts', account({ bank: 'k' }), 'refused'],
        ['account: a bank of 17 letters', 'slip_accounts', account({ bank: 'a'.repeat(17) }), 'refused'],
        ['account: three digits', 'slip_accounts', account({ account_last4: '123' }), 'refused'],
        ['account: a letter among the digits', 'slip_accounts', account({ account_last4: '12a4' }), 'refused'],
        ['account: an unknown wallet', 'slip_accounts', account({ wallet_id: randomUUID() }), 'refused'],
        ['account: kbank 1234', 'slip_accounts', account(), 'ok'],
        ['account: kbank 1234 again', 'slip_accounts', account(), 'refused'],
        ['account: kbank 5678 in a wallet', 'slip_accounts', account({ account_last4: '5678', wallet_id: wallet }), 'ok'],
        ['ref: 63 hex digits', 'slip_refs', ref({ ref_hash: 'a'.repeat(63) }), 'refused'],
        ['ref: hex in capitals', 'slip_refs', ref({ ref_hash: 'A'.repeat(64) }), 'refused'],
        ['ref: not hex', 'slip_refs', ref({ ref_hash: 'g'.repeat(64) }), 'refused'],
        ['ref: an unknown state', 'slip_refs', ref({ state: 'pending' }), 'refused'],
        ['ref: confirmed without its record', 'slip_refs', ref({ state: 'confirmed' }), 'refused'],
        ['ref: recorded without its record', 'slip_refs', ref({ state: 'recorded' }), 'refused'],
        ['ref: a draft with a record', 'slip_refs', ref({ transaction_id: randomUUID() }), 'refused'],
        ['ref: dismissed with a record', 'slip_refs', ref({ state: 'dismissed', transaction_id: randomUUID() }), 'refused'],
        ['ref: first seen as bytes (STRICT)', 'slip_refs', ref({ first_seen_at: new Uint8Array(4) }), 'refused'],
        ['ref: a draft', 'slip_refs', ref({ ref_hash: sameHash }), 'ok'],
        ['ref: the same hash again', 'slip_refs', ref({ ref_hash: sameHash, state: 'expired' }), 'refused'],
        ['ref: confirmed with its record', 'slip_refs', ref({ state: 'confirmed', transaction_id: randomUUID() }), 'ok'],
        ['ref: dismissed', 'slip_refs', ref({ state: 'dismissed' }), 'ok'],
        ['draft: amount 0', 'slip_drafts', draft({ amount_minor: 0 }), 'refused'],
        ['draft: amount over the cap', 'slip_drafts', draft({ amount_minor: 100_000_000_000 }), 'refused'],
        ['draft: amount 6500.5 (STRICT)', 'slip_drafts', draft({ amount_minor: 6500.5 }), 'refused'],
        ['draft: 30 February', 'slip_drafts', draft({ occurred_on: '2026-02-30' }), 'refused'],
        ['draft: a time with a dot', 'slip_drafts', draft({ occurred_time: '12.30' }), 'refused'],
        ['draft: minute 60', 'slip_drafts', draft({ occurred_time: '12:60' }), 'refused'],
        ['draft: a time of four characters', 'slip_drafts', draft({ occurred_time: '9:30' }), 'refused'],
        ['draft: an unknown direction', 'slip_drafts', draft({ direction: 'both' }), 'refused'],
        ['draft: a sender bank in capitals', 'slip_drafts', draft({ from_bank: 'KBANK' }), 'refused'],
        ['draft: a sender with five digits', 'slip_drafts', draft({ from_last4: '12345' }), 'refused'],
        ['draft: a sender with an empty name', 'slip_drafts', draft({ from_name: '' }), 'refused'],
        ['draft: a receiver bank of one letter', 'slip_drafts', draft({ to_bank: 's' }), 'refused'],
        ['draft: a receiver with letters', 'slip_drafts', draft({ to_last4: 'abcd' }), 'refused'],
        ['draft: a receiver name of 121 characters', 'slip_drafts', draft({ to_name: 'ก'.repeat(121) }), 'refused'],
        ['draft: an unknown category', 'slip_drafts', draft({ category_id: randomUUID() }), 'refused'],
        ['draft: category_guessed 2', 'slip_drafts', draft({ category_guessed: 2 }), 'refused'],
        ['draft: flags as an object', 'slip_drafts', draft({ flags: '{}' }), 'refused'],
        ['draft: flags that are not JSON', 'slip_drafts', draft({ flags: 'nope' }), 'refused'],
        ['draft: an empty album', 'slip_drafts', draft({ album: '' }), 'refused'],
        ['draft: an album of 61 characters', 'slip_drafts', draft({ album: 'a'.repeat(61) }), 'refused'],
        ['draft: an unknown origin', 'slip_drafts', draft({ origin: 'camera' }), 'refused'],
        ['draft: another model', 'slip_drafts', draft({ model: 'claude-sonnet-5-5' }), 'refused'],
        ['draft: escalated 2', 'slip_drafts', draft({ escalated: 2 }), 'refused'],
        ['draft: announced 2', 'slip_drafts', draft({ announced: 2 }), 'refused'],
        ['draft: an unknown slip reference', 'slip_drafts', draft({ ref_id: randomUUID() }), 'refused'],
        ['draft: everything read', 'slip_drafts', firstDraft, 'ok'],
        ['draft: a second draft of the same slip', 'slip_drafts', draft({ ref_id: firstDraft.ref_id }), 'refused'],
        ['draft: nothing read but its direction', 'slip_drafts', draft({ amount_minor: null, occurred_on: null, occurred_time: null, from_bank: null, from_last4: null, from_name: null, to_bank: null, to_last4: null, to_name: null, category_id: null, category_guessed: 0, flags: '[]', album: null }), 'ok'],
        ['lease: expiring before 0', 'slip_leases', lease({ expires_at: -1 }), 'refused'],
        ['lease: an unknown purpose', 'slip_leases', lease({ purpose: 'other' }), 'refused'],
        ['lease: month 13', 'slip_leases', lease({ day: '2026-13-01' }), 'refused'],
        ['lease: -1 reserved', 'slip_leases', lease({ reserved: -1 }), 'refused'],
        ['lease: 1.5 reserved (STRICT)', 'slip_leases', lease({ reserved: 1.5 }), 'refused'],
        ['lease: a backfill lease', 'slip_leases', lease({ reserved: 3 }), 'ok'],
        ['uses: a day that is not a date', 'slip_backfill_uses', uses({ day: '25/10/2026' }), 'refused'],
        ['uses: 501', 'slip_backfill_uses', uses({ uses: 501 }), 'refused'],
        ['uses: -1', 'slip_backfill_uses', uses({ uses: -1 }), 'refused'],
        ['uses: 2.5 (STRICT)', 'slip_backfill_uses', uses({ uses: 2.5 }), 'refused'],
        ['uses: 500', 'slip_backfill_uses', uses(), 'ok'],
      ]
      expect(cases.map(([label, table, row]) => [label, insert(table, row)])).toEqual(cases.map(([label, , , expected]) => [label, expected]))
    })
  })
})
