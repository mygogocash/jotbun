// The AI routes on the vault (1B-T7). The 17 cases of apps/edge/test/ai.db.test.ts
// are ported by name and assertion, with fakeModel as startV1's `send`; the plan
// adds two; the rest are the planner's (brief 1B-T7). No network: every model
// call is a scripted fake, and the env's own model is only ever built, never called.
// Since P3-T9 an Ask Bun answer that is ungrounded, declined or unfinished is asked
// again of Opus (D28), and each tool figure carries its count and scope.
import { env } from 'cloudflare:workers'
import { randomUUID } from 'node:crypto'

import { AI_DAILY_LIMITS, bangkokDate } from '@gogospend/contracts'
import type { AiLocale, BunFact } from '@gogospend/contracts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { MessageParams, ModelMessage } from '../../src/server/ai/model'
import type { ModelTransport } from '../../src/v1/ai/transport'
import type { VaultCall, VaultClaims, VaultRouteId } from '../../src/v1/protocol'
import { vaultSession } from '../../src/v1/worker-routes'
import type { AiToolReply } from '../../src/vault/ai'
import { VAULT_OBJECT_PURPOSES, vaultPrefix } from '../../src/vault/files/keys'
import { VAULT_HANDLERS } from '../../src/vault/routes'
import type { UserVault } from '../../src/vault/user-vault'
import { fakeModel, json, refusal, text, toolUse } from '../support/fake-model'
import { revisionOf } from './support/command-fixtures'
import { seedRecords, setVaultClock, storedKeys, vaultExec, vaultIdOf, vaultRows } from './support/files'
import { builtinId, moneyFixtures } from './support/money-fixtures'
import { TEST_POLICIES, member, startV1 } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

let model: ReturnType<typeof fakeModel>
let client: V1Client
let money: ReturnType<typeof moneyFixtures>

beforeEach(async () => {
  model = fakeModel()
  client = await startV1(undefined, { transport: model.transport })
  money = moneyFixtures(client)
})

afterEach(() => {
  // Every scripted reply was asked for.
  expect(model.left()).toBe(0)
})

const today = bangkokDate(new Date())
const body = async (res: Response) => res.json()
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const monthStart = `${today.slice(0, 7)}-01`

async function consenting(): Promise<TestUser> {
  const user = await member(client)
  const res = await client.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 1 })
  expect(res.status).toBe(200)
  return user
}

async function withCashAndFood(user: TestUser) {
  const cash = randomUUID()
  expect((await client.as(user).post('/v1/wallets', { id: cash, name: 'เงินสด', opening_minor: '100000', tracking_start: '2026-01-01' })).status).toBe(201)
  const categories = await body(await client.as(user).post('/v1/categories/builtins'))
  const food = categories.find((c: { builtin_key: string }) => c.builtin_key === 'food').id as string
  return { cash, food }
}

async function lunch(user: TestUser, cash: string, food: string, minor = '6000') {
  expect((await client.as(user).post('/v1/transactions', { id: randomUUID(), type: 'expense', amount_minor: minor, occurred_on: today, wallet_id: cash, category_id: food })).status).toBe(201)
}

const sentContent = (call: MessageParams) => JSON.parse(call.messages[0].content as string)

const claimsOf = (user: TestUser): VaultClaims => ({ accountId: user.sub, sessionId: user.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios/1.0.0' })

/** One AI step, called as the AI routes call it, so the vault's reads can be asked about a fixed date. */
async function stepOf<T>(user: TestUser, route: VaultRouteId, input: { query?: Record<string, unknown>; body?: unknown }): Promise<T> {
  const reply = await vaultSession(env, claimsOf(user), TEST_POLICIES, 'bound_session', 'read').call(route, input)
  expect(reply, route).toMatchObject({ ok: true, status: 200 })
  return (reply as { body: T }).body
}

const factsOn = (user: TestUser, date: string) => stepOf<BunFact[]>(user, 'ai.facts', { query: { date } })
const tool = (user: TestUser, name: string, input: Record<string, unknown>, locale: AiLocale = 'en') => stepOf<AiToolReply>(user, 'ai.tool', { body: { name, input, locale } })

type Row = {
  type: 'expense' | 'income' | 'transfer'
  amount_minor: string
  occurred_on: string
  wallet_id?: string
  category_id?: string
  source_wallet_id?: string
  destination_wallet_id?: string
  merchant?: string
  note?: string
  deleted?: true
}

/** Records written straight into the vault's table (no commands), as moneyFixtures' bulkRecords writes them, with a merchant, a note or a deletion. */
async function seedRows(user: TestUser, rows: Row[]): Promise<void> {
  const at = new Date().toISOString()
  await vaultExec(
    user,
    `INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, source_wallet_id, destination_wallet_id, merchant, note, deleted_at, version, created_at, updated_at)
     SELECT json_extract(r.value, '$.id'), json_extract(r.value, '$.type'), CAST(json_extract(r.value, '$.amount_minor') AS INTEGER), json_extract(r.value, '$.occurred_on'),
            json_extract(r.value, '$.wallet_id'), json_extract(r.value, '$.category_id'), json_extract(r.value, '$.source_wallet_id'),
            json_extract(r.value, '$.destination_wallet_id'), json_extract(r.value, '$.merchant'), json_extract(r.value, '$.note'),
            CASE WHEN json_extract(r.value, '$.deleted') THEN ? END, 1, ?, ?
       FROM json_each(?) AS r`,
    at,
    at,
    at,
    JSON.stringify(rows.map((row) => ({ id: randomUUID(), ...row }))),
  )
}

/** Custom expense categories written straight into the vault's table. Returns their ids in order. */
async function seedCategories(user: TestUser, labels: string[]): Promise<string[]> {
  const ids = labels.map(() => randomUUID())
  const at = new Date().toISOString()
  await vaultExec(
    user,
    `INSERT INTO categories (id, type, builtin_key, label, color, archived, version, created_at, updated_at)
     SELECT json_extract(r.value, '$.id'), 'expense', NULL, json_extract(r.value, '$.label'), NULL, 0, 1, ?, ? FROM json_each(?) AS r`,
    at,
    at,
    JSON.stringify(labels.map((label, i) => ({ id: ids[i], label }))),
  )
  return ids
}

async function putBudget(user: TestUser, month: string, overall: string, limits: { category_id: string; limit_minor: string }[] = []): Promise<void> {
  expect((await client.as(user).put(`/v1/budgets/${month}`, { overall_limit_minor: overall, category_limits: limits })).status).toBe(200)
}

describe('consent', () => {
  it('AI is off until the user agrees to the current notice', async () => {
    const user = await member(client)
    const prefs = await body(await client.as(user).get('/v1/me/ai-preferences'))
    expect(prefs).toEqual({
      companion: false,
      cashback_tips: false,
      notice_version: null,
      current_notice_version: 1,
      remaining: AI_DAILY_LIMITS,
      available: true,
    })
    const blocked = await client.as(user).post('/v1/ai/parse', { text: 'กาแฟ 65', today, locale: 'th' })
    expect(blocked.status).toBe(403)
    expect((await body(blocked)).code).toBe('AI_CONSENT_REQUIRED')
    expect(model.calls).toHaveLength(0)
  })

  it('turning AI on needs the current notice version; tips can be set alone', async () => {
    const user = await member(client)
    const without = await client.as(user).put('/v1/me/ai-preferences', { companion: true })
    expect(without.status).toBe(403)
    expect(await body(without)).toMatchObject({ code: 'AI_CONSENT_REQUIRED', message_key: 'errors.ai_notice_required' })
    expect((await client.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 0 })).status).toBe(422)
    expect(await body(await client.as(user).put('/v1/me/ai-preferences', { cashback_tips: true }))).toMatchObject({ companion: false, cashback_tips: true })
    expect(await body(await client.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 1 }))).toMatchObject({ companion: true, cashback_tips: true, notice_version: 1 })
    expect(await body(await client.as(user).put('/v1/me/ai-preferences', { companion: false }))).toMatchObject({ companion: false, notice_version: 1 })
  })

  // Ported from `preferences are the account’s own (RLS)`: a vault holds one person, and a second person's vault never shows them.
  it("preferences are the person's own", async () => {
    await consenting()
    const other = await member(client)
    expect(await body(await client.as(other).get('/v1/me/ai-preferences'))).toMatchObject({ companion: false, notice_version: null })
  })

  it('consent to another notice version does not count: the companion reads off, the routes that need consent refuse, and the note is the plain facts', async () => {
    const user = await member(client)
    await vaultExec(user, 'INSERT INTO ai_preferences (id, companion, cashback_tips, notice_version, updated_at) VALUES (1, 1, 0, 2, ?)', new Date().toISOString())
    expect(await body(await client.as(user).get('/v1/me/ai-preferences'))).toEqual({
      companion: false,
      cashback_tips: false,
      notice_version: 2,
      current_notice_version: 1,
      remaining: AI_DAILY_LIMITS,
      available: true,
    })
    const refusals: [string, unknown][] = [
      ['/v1/ai/parse', { text: 'กาแฟ 65', today, locale: 'th' }],
      ['/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' }],
      ['/v1/ai/ask', { question: 'how much?', today, locale: 'en' }],
    ]
    for (const [path, payload] of refusals) {
      const res = await client.as(user).post(path, payload)
      expect(res.status, path).toBe(403)
      expect((await body(res)).code, path).toBe('AI_CONSENT_REQUIRED')
    }
    expect(await body(await client.as(user).get(`/v1/ai/note?date=${today}&locale=en`))).toMatchObject({ source: 'facts' })
    expect(model.calls).toHaveLength(0)
    expect((await body(await client.as(user).get('/v1/me/ai-preferences'))).remaining).toEqual(AI_DAILY_LIMITS)
  })
})

describe('Tell Bun', () => {
  it('turns a sentence into a grounded draft, asking Claude through the shared settings', async () => {
    const user = await consenting()
    const { cash, food } = await withCashAndFood(user)
    model.push(json({ drafts: [{ type: 'expense', amount_baht: '50', date: today, category_id: food, wallet_id: cash, merchant: 'ข้าวมันไก่', note: null, confidence: 'high', flags: [] }] }))
    const res = await client.as(user).post('/v1/ai/parse', { text: 'ข้าวมันไก่ 50', today, locale: 'th' })
    expect(res.status).toBe(200)
    expect(await body(res)).toEqual({
      source: 'ai',
      drafts: [{ type: 'expense', amount_minor: '5000', occurred_on: today, category_id: food, wallet_id: cash, merchant: 'ข้าวมันไก่', note: null, confidence: 'high', flags: [] }],
      model: 'claude-haiku-5-5',
      escalated: false,
    })
    const [sent] = model.calls
    // Haiku's base (P3-T6, H2): no server-side fallback beta and no fallbacks.
    expect(sent).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low', format: { type: 'json_schema' } } })
    for (const key of ['betas', 'fallbacks']) expect(sent, key).not.toHaveProperty(key)
    // Only the sentence, the date and names to choose from; never who the person is (the account, the session, the vault) or a balance.
    const wire = JSON.stringify(sent)
    for (const secret of [user.sub, user.sid, vaultIdOf(user), '100000']) expect(wire).not.toContain(secret)
    expect((await body(await client.as(user).get('/v1/me/ai-preferences'))).remaining.parse).toBe(AI_DAILY_LIMITS.parse - 1)
  })

  it("a model date that is no calendar date keeps the model's draft, dated today and flagged (the P3-T8 second review's m1)", async () => {
    // Before P3-T9 the sanitizer threw on 2026-10-32 and Tell Bun fell back to the rules.
    const user = await consenting()
    const { cash, food } = await withCashAndFood(user)
    model.push(json({ drafts: [{ type: 'expense', amount_baht: '50', date: '2026-10-32', category_id: food, wallet_id: cash, merchant: 'ข้าวมันไก่', note: null, confidence: 'high', flags: [] }] }))
    const res = await client.as(user).post('/v1/ai/parse', { text: 'ข้าวมันไก่ 50', today, locale: 'th' })
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({ source: 'ai', model: 'claude-haiku-5-5', drafts: [{ amount_minor: '5000', occurred_on: today, flags: ['date_guessed'] }] })
  })

  it('never passes on an amount the person did not write', async () => {
    const user = await consenting()
    const { food } = await withCashAndFood(user)
    model.push(json({ drafts: [{ type: 'expense', amount_baht: '500', date: today, category_id: food, wallet_id: null, merchant: 'coffee', note: null, confidence: 'high', flags: [] }] }))
    const result = await body(await client.as(user).post('/v1/ai/parse', { text: 'coffee 65', today, locale: 'en' }))
    expect(result.drafts[0]).toMatchObject({ amount_minor: null, confidence: 'low' })
    expect(result.drafts[0].flags).toContain('amount_unclear')
  })

  it('falls back to the offline rules when Claude refuses, fails or has nothing', async () => {
    const user = await consenting()
    const { food } = await withCashAndFood(user)
    model.push(refusal(), new Error('network down'), json({ drafts: [] }))
    for (let i = 0; i < 3; i += 1) {
      const result = await body(await client.as(user).post('/v1/ai/parse', { text: 'ข้าวผัด 45', today, locale: 'th' }))
      expect(result).toMatchObject({ source: 'rules', drafts: [{ amount_minor: '4500', category_id: food }] })
    }
  })

  it('without AI configured, answers from the rules and spends no uses', async () => {
    const user = await consenting()
    const offline = await startV1(undefined, { transport: null })
    const res = await offline.as(user).post('/v1/ai/parse', { text: 'grab 120', today, locale: 'en' })
    expect(await body(res)).toMatchObject({ source: 'rules', drafts: [{ amount_minor: '12000' }] })
    const prefs = await body(await offline.as(user).get('/v1/me/ai-preferences'))
    expect(prefs).toMatchObject({ available: false, remaining: { parse: AI_DAILY_LIMITS.parse } })
  })

  it('stops at the daily limit until the next Bangkok day', async () => {
    const user = await consenting()
    await vaultExec(user, "INSERT INTO ai_usage (day, feature, uses) VALUES (?, 'parse', ?)", today, AI_DAILY_LIMITS.parse)
    const res = await client.as(user).post('/v1/ai/parse', { text: 'กาแฟ 65', today, locale: 'th' })
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await body(res)).code).toBe('AI_LIMIT_REACHED')
    expect(model.calls).toHaveLength(0)
    expect(await vaultRows(user, "SELECT uses FROM ai_usage WHERE feature = 'parse'")).toEqual([{ uses: AI_DAILY_LIMITS.parse }])
  })

  it('validates the sentence', async () => {
    const user = await consenting()
    expect((await client.as(user).post('/v1/ai/parse', { text: 'x'.repeat(201), today, locale: 'th' })).status).toBe(422)
    expect((await client.as(user).post('/v1/ai/parse', { text: 'กาแฟ', today, locale: 'jp' })).status).toBe(422)
    expect((await client.as(user).post('/v1/ai/parse', { text: 'กาแฟ', today: '24/10/2026', locale: 'th' })).status).toBe(422)
  })

  it("the model sees only the active wallets' and categories' ids and names, and a date more than a day from the server's is replaced", async () => {
    const user = await consenting()
    const { cash } = await withCashAndFood(user)
    const spare = await money.wallet(user, { name: 'Spare' })
    expect((await client.as(user).post(`/v1/wallets/${spare}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
    const fun = builtinId(user, 'fun')
    expect((await client.as(user).post(`/v1/categories/${fun}/archive`, {}, { ifMatch: 1 })).status).toBe(200)
    const coffee = randomUUID()
    expect((await client.as(user).post('/v1/categories', { id: coffee, type: 'expense', label: 'กาแฟเช้า' })).status).toBe(201)
    const listed = (await body(await client.as(user).get('/v1/categories'))) as { id: string; type: string; builtin_key: string | null; label: string | null; archived: boolean }[]
    const choices = {
      wallets: [{ id: cash, name: 'เงินสด' }],
      categories: listed.filter((c) => !c.archived).map((c) => ({ id: c.id, type: c.type, name: c.label ?? c.builtin_key })),
    }
    expect(choices.categories.map((c) => c.id)).not.toContain(fun)
    expect(choices.categories).toContainEqual({ id: coffee, type: 'expense', name: 'กาแฟเช้า' })
    const yesterday = bangkokDate(new Date(Date.now() - 86_400_000))
    model.push(json({ drafts: [] }), json({ drafts: [] }))
    expect((await client.as(user).post('/v1/ai/parse', { text: 'กาแฟ 65', today: yesterday, locale: 'th' })).status).toBe(200)
    expect((await client.as(user).post('/v1/ai/parse', { text: 'กาแฟ 65', today: '2020-01-01', locale: 'th' })).status).toBe(200)
    expect(sentContent(model.calls[0])).toEqual({ sentence: 'กาแฟ 65', today: yesterday, locale: 'th', ...choices })
    expect(sentContent(model.calls[1])).toEqual({ sentence: 'กาแฟ 65', today: bangkokDate(new Date()), locale: 'th', ...choices })
  })

  it("the day's uses follow the vault clock in Bangkok: the last use is allowed, the next waits for midnight, and counts older than 35 days are forgotten", async () => {
    const user = await consenting()
    // 23:58:30 in Bangkok on 10 November 2026.
    await setVaultClock(user, Date.parse('2026-11-10T16:58:30.000Z'))
    await vaultExec(
      user,
      "INSERT INTO ai_usage (day, feature, uses) VALUES ('2026-11-10', 'parse', ?), ('2026-10-05', 'parse', 3), ('2026-10-06', 'parse', 4)",
      AI_DAILY_LIMITS.parse - 1,
    )
    const parse = () => client.as(user).post('/v1/ai/parse', { text: 'กาแฟ 65', today, locale: 'th' })
    const rows = () => vaultRows(user, 'SELECT day, feature, uses FROM ai_usage ORDER BY day')
    model.push(json({ drafts: [] }))
    expect((await parse()).status).toBe(200)
    // The last use of the day; 2026-10-05 is older than 35 days and forgotten, 2026-10-06 is not.
    expect(await rows()).toEqual([
      { day: '2026-10-06', feature: 'parse', uses: 4 },
      { day: '2026-11-10', feature: 'parse', uses: AI_DAILY_LIMITS.parse },
    ])
    expect((await body(await client.as(user).get('/v1/me/ai-preferences'))).remaining.parse).toBe(0)
    const refused = await parse()
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe('90')
    expect(await body(refused)).toMatchObject({ code: 'AI_LIMIT_REACHED', retry_after_seconds: 90 })
    expect(await rows()).toEqual([
      { day: '2026-10-06', feature: 'parse', uses: 4 },
      { day: '2026-11-10', feature: 'parse', uses: AI_DAILY_LIMITS.parse },
    ])
    // Midnight in Bangkok: a new day, with every use back.
    await setVaultClock(user, Date.parse('2026-11-10T17:00:00.000Z'))
    expect((await body(await client.as(user).get('/v1/me/ai-preferences'))).remaining.parse).toBe(AI_DAILY_LIMITS.parse)
    model.push(json({ drafts: [] }))
    expect((await parse()).status).toBe(200)
    expect(await rows()).toEqual([
      { day: '2026-11-10', feature: 'parse', uses: AI_DAILY_LIMITS.parse },
      { day: '2026-11-11', feature: 'parse', uses: 1 },
    ])
  })
})

describe('slips', () => {
  it('reads a slip image into drafts and keeps nothing', async () => {
    const user = await consenting()
    const { cash } = await withCashAndFood(user)
    model.push(json({ kind: 'slip', bank: 'K PLUS', drafts: [{ type: 'expense', amount_baht: '1,250.00', date: today, category_id: null, wallet_id: cash, merchant: 'ร้านป้าแดง', note: null, confidence: 'high', flags: [] }] }))
    const res = await client.as(user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' })
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({ source: 'ai', bank: 'K PLUS', drafts: [{ amount_minor: '125000', merchant: 'ร้านป้าแดง', confidence: 'medium', flags: ['category_guessed'] }] })
    const [sent] = model.calls
    expect(sent.output_config).toMatchObject({ effort: 'medium' })
    expect(JSON.stringify(sent.messages)).toContain('"type":"image"')
  })

  it('refuses other files and broken base64 before any model call', async () => {
    const user = await consenting()
    const gif = await client.as(user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/gif', today, locale: 'th' })
    expect(await body(gif)).toMatchObject({ code: 'UPLOAD_UNSUPPORTED_TYPE' })
    expect((await client.as(user).post('/v1/ai/slip', { image_base64: 'not base64!', media_type: 'image/png', today, locale: 'th' })).status).toBe(422)
    expect(model.calls).toHaveLength(0)
  })

  it("a slip read stores nothing: no object, no upload and no row but today's use", async () => {
    const user = await consenting()
    const { cash } = await withCashAndFood(user)
    const revision = await revisionOf(user)
    model.push(json({ kind: 'slip', bank: 'K PLUS', drafts: [{ type: 'expense', amount_baht: '89', date: today, category_id: null, wallet_id: cash, merchant: 'ร้านกาแฟ', note: null, confidence: 'high', flags: [] }] }))
    expect((await client.as(user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' })).status).toBe(200)
    for (const purpose of VAULT_OBJECT_PURPOSES) expect(await storedKeys(vaultPrefix(purpose, vaultIdOf(user))), purpose).toEqual([])
    expect(await vaultRows(user, 'SELECT job_id FROM import_uploads')).toEqual([])
    expect(await vaultRows(user, 'SELECT key FROM vault_objects')).toEqual([])
    expect(await vaultRows(user, 'SELECT id FROM attachments')).toEqual([])
    expect(await vaultRows(user, 'SELECT day, feature, uses FROM ai_usage')).toEqual([{ day: today, feature: 'slip', uses: 1 }])
    // No command ran: the ledger's revision is where it was.
    expect(await revisionOf(user)).toBe(revision)
  })

  it("a slip's bank name is trimmed and cut to 60 characters, and anything else reads null", async () => {
    const user = await consenting()
    const slip = async () => body(await client.as(user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' }))
    // Complete reads (P3-T8): a kind and a draft with an amount, today's date and a receiver, so Haiku's read is the answer.
    const read = (bank: unknown) =>
      json({ kind: 'slip', bank, drafts: [{ type: 'expense', amount_baht: '89', date: today, category_id: null, wallet_id: null, merchant: 'ร้านกาแฟ', note: null, confidence: 'high', flags: [] }] })
    model.push(read(`  ${'กรุงไทย '.repeat(10)}`), read(42), read('   '))
    const cut = `${'กรุงไทย '.repeat(7)}กรุง`
    expect(cut).toHaveLength(60)
    expect(await slip()).toMatchObject({ source: 'ai', bank: cut, kind: 'slip', escalated: false })
    expect(await slip()).toMatchObject({ source: 'ai', bank: null })
    expect(await slip()).toMatchObject({ source: 'ai', bank: null })
  })
})

describe('Bun’s daily note', () => {
  it('without consent: the plain facts, and no model call', async () => {
    const user = await member(client)
    const { cash, food } = await withCashAndFood(user)
    await lunch(user, cash, food)
    const note = await body(await client.as(user).get(`/v1/ai/note?date=${today}&locale=en`))
    expect(note).toMatchObject({ date: today, source: 'facts', text: expect.stringContaining('1 logged today, ฿60 in all.') })
    expect(note.facts[0]).toEqual({ kind: 'spent_today', amount_minor: '6000', count: 1 })
    expect(model.calls).toHaveLength(0)
  })

  it('uses Claude’s words only when every number is one of the facts', async () => {
    const user = await consenting()
    const { cash, food } = await withCashAndFood(user)
    await lunch(user, cash, food)
    model.push(json({ text: 'วันนี้จดไป 1 รายการ ฿60 เก่งมากนะ' }), json({ text: 'วันนี้ใช้ไป ฿65 แล้วนะ' }))
    const good = await body(await client.as(user).get(`/v1/ai/note?date=${today}&locale=th`))
    expect(good).toMatchObject({ source: 'ai', text: 'วันนี้จดไป 1 รายการ ฿60 เก่งมากนะ' })
    const strayed = await body(await client.as(user).get(`/v1/ai/note?date=${today}&locale=th`))
    expect(strayed).toMatchObject({ source: 'facts', text: expect.stringContaining('฿60') })
    expect(strayed.text).not.toContain('65')
  })

  it('out of note uses, the facts still come', async () => {
    const user = await consenting()
    await vaultExec(user, "INSERT INTO ai_usage (day, feature, uses) VALUES (?, 'note', ?)", today, AI_DAILY_LIMITS.note)
    const res = await client.as(user).get(`/v1/ai/note?date=${today}&locale=th`)
    expect(res.status).toBe(200)
    const note = await body(res)
    expect(note.source).toBe('facts')
    expect(note.facts[0]).toEqual({ kind: 'no_records_today' })
  })

  it("the note's words may use the day's date and every number of its facts, and nothing else, in at most 200 characters", async () => {
    const user = await consenting()
    const { cash, food } = await withCashAndFood(user)
    await lunch(user, cash, food, '6000')
    await lunch(user, cash, food, '4500')
    const note = async (words: string) => {
      // A fresh day's uses for every note: the note allows three a day.
      await vaultExec(user, 'DELETE FROM ai_usage')
      model.push(json({ text: words }))
      return body(await client.as(user).get(`/v1/ai/note?date=${today}&locale=en`))
    }
    // ฿105 is today's spending, 100 the top category's share (a count) and the Buddhist-era year the day's.
    const grounded = `฿105 today, 100% on food, in ${Number(today.slice(0, 4)) + 543}.`
    expect(await note(grounded)).toMatchObject({ source: 'ai', text: grounded })
    expect(await note('฿104 today.')).toMatchObject({ source: 'facts' })
    const longest = `฿105 ${'a'.repeat(195)}`
    expect([...longest]).toHaveLength(200)
    expect(await note(longest)).toMatchObject({ source: 'ai', text: longest })
    expect(await note(`${longest}a`)).toMatchObject({ source: 'facts' })
    expect(await note('')).toMatchObject({ source: 'facts' })
  })
})

describe('Ask Bun', () => {
  it('answers through a read-only tool and returns the figures it used', async () => {
    const user = await consenting()
    const { cash, food } = await withCashAndFood(user)
    for (const minor of ['6000', '4500']) {
      expect((await client.as(user).post('/v1/transactions', { id: randomUUID(), type: 'expense', amount_minor: minor, occurred_on: today, wallet_id: cash, category_id: food })).status).toBe(201)
    }
    model.push(toolUse('spending_total', { from: monthStart, through: today, type: 'expense', category_id: food }), text('This month you spent ฿105 on food across 2 meals.'))
    const res = await client.as(user).post('/v1/ai/ask', { question: 'เดือนนี้กินไปเท่าไหร่', today, locale: 'th' })
    expect(res.status).toBe(200)
    const answer = await body(res)
    expect(answer).toMatchObject({ source: 'ai', answer: 'This month you spent ฿105 on food across 2 meals.', figures: [{ amount_minor: '10500' }] })
    // The figure the phone shows is worded in the question's language, not as the tool's input.
    expect(answer.figures[0].label).toMatch(/^อาหาร \d{1,2}–\d{1,2} \S+ \d{4}$|^อาหาร \d{1,2} \S+ \d{4}$/)
    // The tool result went back to Claude as the second turn.
    expect(JSON.stringify(model.calls[1].messages)).toContain('฿105')
    expect(model.calls[0].tools?.map((t) => (t as { name: string }).name)).toEqual(['spending_total', 'category_totals', 'top_merchants', 'budget_status'])
  })

  // The tool's period starts on the first of this month (the PostgreSQL case's 2026-10-01), so it stays inside 400 days on any date.
  it('an answer with a number no tool read becomes the plain figures', async () => {
    const user = await consenting()
    await withCashAndFood(user)
    // D28 (P3-T9): Haiku's ungrounded answer is asked again of Opus, whose answer strays too.
    model.push(toolUse('spending_total', { from: monthStart, through: today, type: 'expense', category_id: null }), text('You spent about ฿9,999.'), text('About ฿9,999 in all.'))
    const answer = await body(await client.as(user).post('/v1/ai/ask', { question: 'how much?', today, locale: 'en' }))
    expect(answer).toMatchObject({ source: 'facts', model: 'rules', escalated: true, answer: expect.stringContaining('From your diary') })
    expect(answer.answer).not.toContain('9,999')
  })

  it('a bad tool input is reported back to Claude, not run', async () => {
    const user = await consenting()
    model.push(toolUse('spending_total', { from: '2026-12-01', through: '2026-01-01', type: 'expense', category_id: null }), text('Bun only knows your own records.'))
    const answer = await body(await client.as(user).post('/v1/ai/ask', { question: 'how much next year?', today, locale: 'en' }))
    expect(answer).toMatchObject({ source: 'ai', answer: 'Bun only knows your own records.', figures: [] })
    expect(JSON.stringify(model.calls[1].messages)).toContain('"is_error":true')
  })

  it('a budget_status question about a month before 1970 is answered as no budget, never refused after its use is spent', async () => {
    // The 1B-T7 review's m-1 (its PROBE-1): runTool answered no budget for such a month and Ask Bun went on; the
    // vault's summary refuses it, which reached the person as 422 after ai.consume had counted the use.
    const user = await consenting()
    model.push(toolUse('budget_status', { month: '1969-12' }), text('No budget was set then.'))
    const res = await client.as(user).post('/v1/ai/ask', { question: 'what was my budget in December 1969?', today, locale: 'en' })
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({ source: 'ai', answer: 'No budget was set then.', figures: [] })
    expect(JSON.stringify(model.calls[1].messages)).not.toContain('"is_error":true')
  })

  it("a tool's allowance reaches the grounding check", async () => {
    const user = await consenting()
    // 40 records from 1 January 2016, 1,000 to 1,039 satang: ฿407.80 in all, to 9 February 2016 (2559 in the Buddhist era).
    await seedRecords(user, 40)
    const total = toolUse('spending_total', { from: '2016-01-01', through: '2016-02-09', type: 'expense', category_id: null })
    // Every number is one the tool allowed, and none is today's: the total (satang), the count and the period's dates.
    const grounded = '฿407.80 in 40 records, from 1/1/2559 to 9/2/2559.'
    model.push(total, text(grounded))
    expect(await body(await client.as(user).post('/v1/ai/ask', { question: 'how much in early 2016?', today, locale: 'en' }))).toMatchObject({
      source: 'ai',
      answer: grounded,
      figures: [{ amount_minor: '40780' }],
    })
    // D28 (P3-T9): Opus is asked again and strays as well, so Haiku's figures answer.
    model.push(toolUse('spending_total', { from: '2016-01-01', through: '2016-02-09', type: 'expense', category_id: null }), text('About ฿407.81 in all.'), text('About ฿407.81 in all.'))
    const strayed = await body(await client.as(user).post('/v1/ai/ask', { question: 'how much in early 2016?', today, locale: 'en' }))
    expect(strayed).toMatchObject({ source: 'facts', model: 'rules', escalated: true, figures: [{ amount_minor: '40780' }] })
    expect(strayed.answer).not.toContain('407.81')
  })

  it('a session signed out while Ask Bun runs is refused at its next tool step, and no tool reads the records', async () => {
    const user = await consenting()
    const calls: MessageParams[] = []
    const transport: ModelTransport = {
      send: async (params) => {
        calls.push(structuredClone(params))
        if (calls.length > 1) return text('Bun read nothing.')
        expect((await client.as(user).post('/v1/me/logout')).status).toBe(204)
        return toolUse('spending_total', { from: monthStart, through: today, type: 'expense', category_id: null })
      },
    }
    const asking = await startV1(undefined, { transport })
    const res = await asking.as(user).post('/v1/ai/ask', { question: 'how much?', today, locale: 'en' })
    expect(res.status).toBe(401)
    expect((await body(res)).code).toBe('SESSION_REQUIRED')
    expect(calls).toHaveLength(1)
  })

  it('Ask Bun stops after five tool turns and answers from the figures it read', async () => {
    const user = await consenting()
    const turn = () => toolUse('spending_total', { from: monthStart, through: today, type: 'expense', category_id: null })
    // D28 (P3-T9): five turns without an answer go to Opus, who declines here, so Haiku's figures answer.
    model.push(turn(), turn(), turn(), turn(), turn(), refusal())
    const answer = await body(await client.as(user).post('/v1/ai/ask', { question: 'how much?', today, locale: 'en' }))
    expect(answer).toMatchObject({ source: 'facts', model: 'rules', escalated: true, answer: expect.stringContaining('From your diary') })
    expect(answer.figures).toHaveLength(5)
    expect(model.calls.map((call) => call.model)).toEqual([...Array(5).fill('claude-haiku-5-5'), 'claude-opus-5-5'])
  })

  it('two tools in one turn both run, and their results go back to Claude together', async () => {
    const user = await consenting()
    const { cash, food } = await withCashAndFood(user)
    await lunch(user, cash, food)
    const first = toolUse('spending_total', { from: monthStart, through: today, type: 'expense', category_id: null }, 'toolu_total')
    const second = toolUse('category_totals', { from: monthStart, through: today, type: 'expense' }, 'toolu_categories')
    model.push({ ...first, content: [...first.content, ...second.content] } as ModelMessage, text('Food is all of it: ฿60.'))
    const answer = await body(await client.as(user).post('/v1/ai/ask', { question: 'where did it go?', today, locale: 'en' }))
    expect(answer).toMatchObject({ source: 'ai', answer: 'Food is all of it: ฿60.', figures: [{ amount_minor: '6000' }, { amount_minor: '6000' }] })
    const results = model.calls[1].messages.at(-1)?.content as { type: string; tool_use_id: string; is_error?: boolean }[]
    expect(results.map((r) => [r.type, r.tool_use_id, r.is_error])).toEqual([
      ['tool_result', 'toolu_total', undefined],
      ['tool_result', 'toolu_categories', undefined],
    ])
  })

  it('Ask Bun answers from the figures it read when a later turn fails, and is paused when it read none', async () => {
    const user = await consenting()
    const { cash, food } = await withCashAndFood(user)
    await lunch(user, cash, food)
    const ask = () => client.as(user).post('/v1/ai/ask', { question: 'how much?', today, locale: 'en' })
    const total = () => toolUse('spending_total', { from: monthStart, through: today, type: 'expense', category_id: null })
    // The model fails after one tool: the figures the tool read.
    model.push(total(), new Error('model down'))
    expect(await body(await ask())).toMatchObject({ source: 'facts', figures: [{ amount_minor: '6000' }] })
    // The model fails at once: nothing was read, so Ask Bun is paused.
    model.push(new Error('model down'))
    const paused = await ask()
    expect(paused.status).toBe(503)
    expect(await body(paused)).toMatchObject({ code: 'AI_PAUSED', retry_after_seconds: 300 })
    // A tool step that fails inside the vault (500) is a failure as a database error was, not a refusal.
    const original = VAULT_HANDLERS['ai.tool']
    if (!original) throw new Error('the vault has no ai.tool step')
    let runs = 0
    VAULT_HANDLERS['ai.tool'] = (c, call) => {
      runs += 1
      if (runs === 2) throw new Error('the vault read failed')
      return original(c, call)
    }
    try {
      model.push(total(), total())
      const res = await ask()
      expect(res.status).toBe(200)
      expect(await body(res)).toMatchObject({ source: 'facts', figures: [{ amount_minor: '6000' }] })
      expect(runs).toBe(2)
    } finally {
      VAULT_HANDLERS['ai.tool'] = original
    }
  })
})

describe('the AI routes on the vault', () => {
  // P3-T6 (H1): AI_MODEL retires and the models are fixed in code; ai-routing.test.ts pins Haiku on every route.
  it('with no model given, the env decides: AI needs AI_ENABLED and an API key', async () => {
    const user = await member(client)
    const available = async (options: Parameters<typeof startV1>[1]) => (await body(await (await startV1(undefined, options)).as(user).get('/v1/me/ai-preferences'))).available
    // The Worker's own var keeps AI off (wrangler.jsonc: AI_ENABLED "false").
    expect(await available({})).toBe(false)
    expect(await available({ env: { AI_ENABLED: 'true' } })).toBe(false)
    expect(await available({ env: { ANTHROPIC_API_KEY: 'synthetic-key' } })).toBe(false)
    expect(await available({ env: { AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'synthetic-key' } })).toBe(true)
    expect(await available({ env: { AI_ENABLED: '1', ANTHROPIC_API_KEY: 'synthetic-key' } })).toBe(true)
    // A model the front door gives wins over the env, even null.
    expect(await available({ transport: null, env: { AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'synthetic-key' } })).toBe(false)
    const configured = await startV1(undefined, { env: { AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'synthetic-key' } })
    expect(await body(await configured.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 1 }))).toMatchObject({ companion: true, available: true })
  })

  it('every model call costs its use before it is made: a failed call still counts, and at the limit nothing is asked', async () => {
    const user = await consenting()
    const slip = () => client.as(user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' })
    const ask = () => client.as(user).post('/v1/ai/ask', { question: 'how much?', today, locale: 'en' })
    // Each feature's model call fails: parse answers from the rules, slip and ask pause, the note is the plain facts.
    model.push(new Error('model down'), new Error('model down'), new Error('model down'), new Error('model down'))
    expect(await body(await client.as(user).post('/v1/ai/parse', { text: 'ข้าวผัด 45', today, locale: 'th' }))).toMatchObject({ source: 'rules' })
    expect((await slip()).status).toBe(503)
    expect((await ask()).status).toBe(503)
    expect(await body(await client.as(user).get(`/v1/ai/note?date=${today}&locale=en`))).toMatchObject({ source: 'facts' })
    expect(model.calls).toHaveLength(4)
    expect((await body(await client.as(user).get('/v1/me/ai-preferences'))).remaining).toEqual({
      parse: AI_DAILY_LIMITS.parse - 1,
      slip: AI_DAILY_LIMITS.slip - 1,
      note: AI_DAILY_LIMITS.note - 1,
      ask: AI_DAILY_LIMITS.ask - 1,
    })
    // At the limit, a slip and a question are refused before the model is asked.
    await vaultExec(user, "UPDATE ai_usage SET uses = CASE feature WHEN 'slip' THEN ? WHEN 'ask' THEN ? ELSE uses END", AI_DAILY_LIMITS.slip, AI_DAILY_LIMITS.ask)
    for (const res of [await slip(), await ask()]) {
      expect(res.status).toBe(429)
      expect((await body(res)).code).toBe('AI_LIMIT_REACHED')
    }
    expect(model.calls).toHaveLength(4)
  })

  it('without AI, a slip and a question are 503 AI_PAUSED and spend no use, and the note is the plain facts', async () => {
    const user = await consenting()
    const offline = await startV1(undefined, { transport: null })
    const refused = [
      await offline.as(user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' }),
      await offline.as(user).post('/v1/ai/ask', { question: 'how much?', today, locale: 'en' }),
    ]
    for (const res of refused) {
      expect(res.status).toBe(503)
      expect(res.headers.get('retry-after')).toBe('300')
      expect(await body(res)).toMatchObject({ code: 'AI_PAUSED', retry_after_seconds: 300 })
    }
    expect(await body(await offline.as(user).get(`/v1/ai/note?date=${today}&locale=en`))).toMatchObject({ source: 'facts' })
    expect((await body(await offline.as(user).get('/v1/me/ai-preferences'))).remaining).toEqual(AI_DAILY_LIMITS)
  })

  it('each AI route is refused at its first step when a newer policy is pending, the session ended or the account stopped being active, before any model call', async () => {
    const user = await consenting()
    const yesterday = new Date(Date.now() - 86_400_000).toISOString()
    const pending = await startV1(
      { policies: [...TEST_POLICIES, { kind: 'terms', version: 2, required: true, published_at: yesterday, text: { th: 'ข้อกำหนด 2', en: 'Terms 2' } }], client_versions: { ios: '1.0.0', android: '1.0.0' } },
      { transport: model.transport },
    )
    const offline = await startV1(
      { policies: [...TEST_POLICIES, { kind: 'terms', version: 2, required: true, published_at: yesterday, text: { th: 'ข้อกำหนด 2', en: 'Terms 2' } }], client_versions: { ios: '1.0.0', android: '1.0.0' } },
      { transport: null },
    )
    const outcomes = async (who: TestUser, through: V1Client = pending): Promise<string[]> => {
      const as = through.as(who)
      const out: string[] = []
      for (const call of [
        () => as.get('/v1/me/ai-preferences'),
        () => as.put('/v1/me/ai-preferences', { cashback_tips: true }),
        () => as.post('/v1/ai/parse', { text: 'กาแฟ 65', today, locale: 'th' }),
        () => as.post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' }),
        () => as.get(`/v1/ai/note?date=${today}&locale=th`),
        () => as.post('/v1/ai/ask', { question: 'how much?', today, locale: 'en' }),
      ]) {
        const res = await call()
        out.push(`${res.status} ${(await body(res)).code ?? ''}`.trim())
      }
      return out
    }
    // A newer required terms: the three current_policy routes are refused; the three bound_session routes still answer.
    model.push(json({ text: 'Nothing logged yet today.' }))
    expect(await outcomes(user)).toEqual(['200', '200', '403 POLICY_ACCEPTANCE_REQUIRED', '403 POLICY_ACCEPTANCE_REQUIRED', '200', '403 POLICY_ACCEPTANCE_REQUIRED'])
    // The note is the only call that reached the model.
    expect(model.calls).toHaveLength(1)
    expect(model.calls[0].output_config).toMatchObject({ format: { type: 'json_schema' } })
    expect(sentContent(model.calls[0])).toMatchObject({ date: today })
    // The session signed out: every AI route is 401, with AI on or off (off, Tell Bun's rules and the note read nothing).
    expect((await pending.as(user).post('/v1/me/logout')).status).toBe(204)
    expect(await outcomes(user)).toEqual(Array(6).fill('401 SESSION_REQUIRED'))
    expect(await outcomes(user, offline)).toEqual(Array(6).fill('401 SESSION_REQUIRED'))
    // The account stopped being active: another session of the same person is refused with 403.
    await vaultExec(user, "UPDATE account_state SET status = 'deleting' WHERE id = 1")
    expect(await outcomes({ sub: user.sub, sid: randomUUID() })).toEqual(Array(6).fill('403 ACCOUNT_UNAVAILABLE'))
    expect(model.calls).toHaveLength(1)
  })

  it('the note and Ask Bun read their input before any step, and a HEAD on an AI read answers its GET with no body', async () => {
    const user = await consenting()
    const badDate = await client.as(user).get('/v1/ai/note?date=24/10/2026&locale=en')
    expect(badDate.status).toBe(422)
    expect(await body(badDate)).toMatchObject({ code: 'INVALID_DATE', fields: { date: 'INVALID_DATE' } })
    expect(await body(await client.as(user).get(`/v1/ai/note?date=${today}&locale=jp`))).toMatchObject({ code: 'VALIDATION_FAILED', fields: { locale: 'VALIDATION_FAILED' } })
    expect(await body(await client.as(user).get(`/v1/ai/note?date=${today}&locale=en&extra=1`))).toMatchObject({ code: 'UNKNOWN_FIELD', fields: { extra: 'UNKNOWN_FIELD' } })
    expect((await client.as(user).post('/v1/ai/ask', { question: 'ถาม'.repeat(101), today, locale: 'th' })).status).toBe(422)
    expect(await body(await client.as(user).post('/v1/ai/ask', { question: 'how much?', today, locale: 'en', extra: 1 }))).toMatchObject({ code: 'UNKNOWN_FIELD' })
    expect(await body(await client.as(user).put('/v1/me/ai-preferences', {}))).toMatchObject({ code: 'VALIDATION_FAILED', fields: { body: 'VALIDATION_FAILED' } })
    expect(model.calls).toHaveLength(0)
    expect((await body(await client.as(user).get('/v1/me/ai-preferences'))).remaining).toEqual(AI_DAILY_LIMITS)
    // R96: a HEAD on either AI read answers its GET's status and headers, with no body (offline, so no model is asked).
    const offline = await startV1(undefined, { transport: null })
    for (const path of ['/v1/me/ai-preferences', `/v1/ai/note?date=${today}&locale=en`]) {
      const get = await offline.as(user).get(path)
      const head = await offline.as(user).request('HEAD', path)
      expect(head.status, path).toBe(get.status)
      expect(head.headers.get('content-type'), path).toBe(get.headers.get('content-type'))
      expect(await head.text(), path).toBe('')
    }
  })
})

describe("the vault's facts and tools", () => {
  it("the day's facts come from the vault's records in dayFacts' order: over budget first, then today, the pace, the week, the top category and the month", async () => {
    const user = await money.member()
    const cash = await money.wallet(user)
    const bank = await money.wallet(user, { name: 'Bank' })
    const [food, travel, salary, bonus] = ['food', 'travel', 'salary', 'bonus'].map((key) => builtinId(user, key))
    const [breakfast] = await seedCategories(user, ['ข้าวเช้า'])
    const spend = (amount_minor: string, occurred_on: string, category_id = food, extra: Partial<Row> = {}): Row => ({ type: 'expense', amount_minor, occurred_on, wallet_id: cash, category_id, ...extra })
    await seedRows(user, [
      // September 2026, asked about the 15th: its week runs from the 9th to the 15th.
      spend('6000', '2026-09-15'),
      spend('4000', '2026-09-15', travel),
      { type: 'income', amount_minor: '3000', occurred_on: '2026-09-15', wallet_id: cash, category_id: bonus },
      spend('9999', '2026-09-15', food, { deleted: true }),
      spend('1234', '2026-09-14', food, { deleted: true }),
      { type: 'transfer', amount_minor: '3000', occurred_on: '2026-09-12', source_wallet_id: cash, destination_wallet_id: bank },
      spend('5000', '2026-09-10'),
      spend('1500', '2026-09-09', travel),
      spend('2000', '2026-09-08'),
      spend('500', '2026-09-20'),
      { type: 'income', amount_minor: '50000', occurred_on: '2026-09-01', wallet_id: cash, category_id: salary },
      // August 2026, asked about the 20th: over budget, nothing that day, a custom category on top.
      spend('7000', '2026-08-31'),
      spend('12000', '2026-08-05', breakfast),
      spend('2000', '2026-08-06'),
      // July 2026, asked about its last day: exactly on budget.
      spend('5000', '2026-07-31'),
    ])
    await putBudget(user, '2026-09', '30000')
    await putBudget(user, '2026-08', '15000')
    await putBudget(user, '2026-07', '5000')
    expect(await factsOn(user, '2026-09-15')).toEqual([
      { kind: 'spent_today', amount_minor: '10000', count: 2 },
      { kind: 'budget_left', amount_minor: '11000', days: 16 },
      { kind: 'budget_per_day', amount_minor: '687', days: 16 },
      { kind: 'logged_days_week', count: 4, days: 7 },
      { kind: 'top_category', amount_minor: '13500', percent: 71, category_key: 'food', category_label: null },
      { kind: 'month_spent', amount_minor: '19000' },
      { kind: 'month_income', amount_minor: '53000' },
    ])
    expect(await factsOn(user, '2026-08-20')).toEqual([
      { kind: 'over_budget', amount_minor: '6000', days: 11 },
      { kind: 'no_records_today' },
      { kind: 'logged_days_week', count: 0, days: 7 },
      { kind: 'top_category', amount_minor: '12000', percent: 57, category_key: null, category_label: 'ข้าวเช้า' },
      { kind: 'month_spent', amount_minor: '21000' },
    ])
    expect(await factsOn(user, '2026-07-31')).toEqual([
      { kind: 'spent_today', amount_minor: '5000', count: 1 },
      { kind: 'budget_left', amount_minor: '0', days: 1 },
      { kind: 'budget_per_day', amount_minor: '0', days: 1 },
      { kind: 'logged_days_week', count: 1, days: 7 },
      { kind: 'top_category', amount_minor: '5000', percent: 100, category_key: 'food', category_label: null },
      { kind: 'month_spent', amount_minor: '5000' },
    ])
  })

  it('spending_total and category_totals read the records runTool read, and allow each number they return', async () => {
    const user = await money.member()
    const cash = await money.wallet(user)
    const bank = await money.wallet(user, { name: 'Bank' })
    const [food, travel, salary] = ['food', 'travel', 'salary'].map((key) => builtinId(user, key))
    await seedRows(user, [
      { type: 'expense', amount_minor: '6000', occurred_on: '2026-09-03', wallet_id: cash, category_id: food },
      { type: 'expense', amount_minor: '4500', occurred_on: '2026-09-04', wallet_id: cash, category_id: food },
      { type: 'expense', amount_minor: '3000', occurred_on: '2026-09-05', wallet_id: cash, category_id: travel },
      { type: 'expense', amount_minor: '9999', occurred_on: '2026-09-06', wallet_id: cash, category_id: food, deleted: true },
      { type: 'expense', amount_minor: '1000', occurred_on: '2026-08-31', wallet_id: cash, category_id: travel },
      { type: 'income', amount_minor: '50000', occurred_on: '2026-09-01', wallet_id: cash, category_id: salary },
      { type: 'transfer', amount_minor: '2000', occurred_on: '2026-09-07', source_wallet_id: cash, destination_wallet_id: bank },
    ])
    const september = { from: '2026-09-01', through: '2026-09-30' }
    const dates = ['2026-09-01', '2026-09-30']
    const spent = { result: { total_say: '฿135', count: 3 }, figures: [{ label: 'Money out, 1–30 Sep 2026', amount_minor: '13500', count: 3, scope: { ...september, type: 'expense', category_id: null } }], allow: { satang: ['13500'], counts: [3], dates } }
    expect(await tool(user, 'spending_total', { ...september, type: 'expense', category_id: null })).toEqual(spent)
    // Any type but income reads expenses, and a category the person does not have reads every category.
    expect(await tool(user, 'spending_total', { ...september, type: 'transfer', category_id: randomUUID() })).toEqual(spent)
    expect(await tool(user, 'spending_total', { ...september, type: 'expense', category_id: food })).toEqual({
      result: { total_say: '฿105', count: 2 },
      figures: [{ label: 'Food, 1–30 Sep 2026', amount_minor: '10500', count: 2, scope: { ...september, type: 'expense', category_id: food } }],
      allow: { satang: ['10500'], counts: [2], dates },
    })
    expect(await tool(user, 'spending_total', { ...september, type: 'income', category_id: null }, 'th')).toEqual({
      result: { total_say: '฿500', count: 1 },
      figures: [{ label: 'รับเข้า 1–30 ก.ย. 2569', amount_minor: '50000', count: 1, scope: { ...september, type: 'income', category_id: null } }],
      allow: { satang: ['50000'], counts: [1], dates },
    })
    expect(await tool(user, 'category_totals', { ...september, type: 'expense' })).toEqual({
      result: [
        { category: 'food', total_say: '฿105', count: 2 },
        { category: 'travel', total_say: '฿30', count: 1 },
      ],
      figures: [
        { label: 'Food, 1–30 Sep 2026', amount_minor: '10500', count: 2, scope: { ...september, type: 'expense', category_id: food } },
        { label: 'Travel, 1–30 Sep 2026', amount_minor: '3000', count: 1, scope: { ...september, type: 'expense', category_id: travel } },
      ],
      allow: { satang: ['10500', '3000'], counts: [2, 1], dates },
    })
    expect(await tool(user, 'category_totals', { ...september, type: 'income' })).toEqual({
      result: [{ category: 'salary', total_say: '฿500', count: 1 }],
      figures: [{ label: 'Salary, 1–30 Sep 2026', amount_minor: '50000', count: 1, scope: { ...september, type: 'income', category_id: salary } }],
      allow: { satang: ['50000'], counts: [1], dates },
    })
  })

  it('top_merchants and budget_status read the records runTool read, and allow each number they return', async () => {
    const user = await money.member()
    const cash = await money.wallet(user)
    const [food, travel, salary] = ['food', 'travel', 'salary'].map((key) => builtinId(user, key))
    await seedRows(user, [
      { type: 'expense', amount_minor: '3000', occurred_on: '2026-09-02', wallet_id: cash, category_id: food, merchant: 'Café Amazon' },
      { type: 'expense', amount_minor: '2000', occurred_on: '2026-09-03', wallet_id: cash, category_id: food, merchant: 'Café Amazon', note: 'latte' },
      { type: 'expense', amount_minor: '1500', occurred_on: '2026-09-04', wallet_id: cash, category_id: food, note: 'ข้าวมันไก่' },
      { type: 'expense', amount_minor: '800', occurred_on: '2026-09-05', wallet_id: cash, category_id: food },
      { type: 'income', amount_minor: '50000', occurred_on: '2026-09-01', wallet_id: cash, category_id: salary, merchant: 'Boss' },
      { type: 'expense', amount_minor: '9999', occurred_on: '2026-09-06', wallet_id: cash, category_id: food, merchant: 'Café Amazon', deleted: true },
      { type: 'expense', amount_minor: '700', occurred_on: '2026-08-31', wallet_id: cash, category_id: food, merchant: 'Out of range' },
      // July: the budget's month.
      { type: 'expense', amount_minor: '6000', occurred_on: '2026-07-10', wallet_id: cash, category_id: food },
      { type: 'expense', amount_minor: '1000', occurred_on: '2026-07-11', wallet_id: cash, category_id: travel },
    ])
    expect(await tool(user, 'top_merchants', { from: '2026-09-01', through: '2026-09-30' })).toEqual({
      result: [
        { merchant: 'Café Amazon', total_say: '฿50', count: 2 },
        { merchant: 'ข้าวมันไก่', total_say: '฿15', count: 1 },
        { merchant: '(no description)', total_say: '฿8', count: 1 },
      ],
      figures: [
        { label: 'Café Amazon, 1–30 Sep 2026', amount_minor: '5000', count: 2, scope: null },
        { label: 'ข้าวมันไก่, 1–30 Sep 2026', amount_minor: '1500', count: 1, scope: null },
        { label: 'No description, 1–30 Sep 2026', amount_minor: '800', count: 1, scope: null },
      ],
      allow: { satang: ['5000', '1500', '800'], counts: [2, 1, 1], dates: ['2026-09-01', '2026-09-30'] },
    })
    expect(await tool(user, 'budget_status', { month: '2026-07' })).toEqual({ result: null, figures: [], allow: { satang: [], counts: [], dates: [] } })
    await putBudget(user, '2026-07', '20000', [{ category_id: food, limit_minor: '8000' }])
    expect(await tool(user, 'budget_status', { month: '2026-07' })).toEqual({
      result: { limit_say: '฿200', spent_say: '฿70', left_say: '฿130', categories: [{ category: 'food', limit_say: '฿80', spent_say: '฿60', left_say: '฿20' }] },
      figures: [
        { label: 'Budget, Jul 2026', amount_minor: '20000', count: null, scope: null },
        { label: 'Spent, Jul 2026', amount_minor: '7000', count: null, scope: null },
        { label: 'Left, Jul 2026', amount_minor: '13000', count: null, scope: null },
        { label: 'Food left, Jul 2026', amount_minor: '2000', count: null, scope: null },
      ],
      allow: { satang: ['20000', '7000', '13000', '2000', '8000', '6000'], counts: [], dates: [] },
    })
  })

  it('category_totals answers at most 12 categories and top_merchants at most 8 places, largest first', async () => {
    const user = await money.member()
    const cash = await money.wallet(user)
    const labels = Array.from({ length: 13 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`)
    const ids = await seedCategories(user, labels)
    // c01 is the largest (฿13), c13 the smallest (฿1); each has its own place, m01 to m13.
    await seedRows(user, ids.map((category_id, i) => ({ type: 'expense', amount_minor: String((13 - i) * 100), occurred_on: '2026-09-10', wallet_id: cash, category_id, merchant: `m${String(i + 1).padStart(2, '0')}` })))
    const september = { from: '2026-09-01', through: '2026-09-30' }
    type Run = Partial<Extract<AiToolReply, { result: unknown }>>
    const categories = (await tool(user, 'category_totals', { ...september, type: 'expense' })) as Run
    expect((categories.result as { category: string }[] | undefined)?.map((row) => row.category)).toEqual(labels.slice(0, 12))
    expect(categories.allow?.counts.length).toBe(12)
    // A person's own category is shown by its label.
    expect(categories.figures?.[0]).toEqual({ label: 'c01, 1–30 Sep 2026', amount_minor: '1300', count: 1, scope: { ...september, type: 'expense', category_id: ids[0] } })
    const places = (await tool(user, 'top_merchants', september)) as Run
    expect((places.result as { merchant: string }[] | undefined)?.map((row) => row.merchant)).toEqual(labels.slice(0, 8).map((label) => label.replace('c', 'm')))
    expect(places.figures?.map((figure) => figure.amount_minor)).toEqual(['1300', '1200', '1100', '1000', '900', '800', '700', '600'])
  })

  it('a tool input the tool refuses comes back as its error, and an unknown tool is refused by name', async () => {
    const user = await money.member()
    const order = 'from and through must be YYYY-MM-DD with from <= through'
    expect(await tool(user, 'nope', {})).toEqual({ error: 'unknown tool nope' })
    expect(await tool(user, 'spending_total', { from: '2026-09-30', through: '2026-09-01', type: 'expense', category_id: null })).toEqual({ error: order })
    expect(await tool(user, 'spending_total', { from: '1 Sep 2026', through: '2026-09-30', type: 'expense', category_id: null })).toEqual({ error: order })
    expect(await tool(user, 'top_merchants', { from: '2026-09-01' })).toEqual({ error: order })
    // 400 days is the longest range.
    expect(await tool(user, 'category_totals', { from: '2025-08-26', through: '2026-09-30', type: 'expense' })).toEqual({ result: [], figures: [], allow: { satang: [], counts: [], dates: ['2025-08-26', '2026-09-30'] } })
    expect(await tool(user, 'category_totals', { from: '2025-08-25', through: '2026-09-30', type: 'expense' })).toEqual({ error: 'the range is at most 400 days' })
    expect(await tool(user, 'budget_status', { month: '2026-13' })).toEqual({ error: 'month must be YYYY-MM' })
    expect(await tool(user, 'budget_status', { month: 202609 })).toEqual({ error: 'month must be YYYY-MM' })
  })

  it('budget_status answers no budget for a month before 1970, as runTool did, and reads 1970-01 like any other month', async () => {
    // The 1B-T7 review's m-1: the vault's summary refuses a month before 1970-01 (parseMonth); runTool read any YYYY-MM.
    const user = await money.member()
    expect(await tool(user, 'budget_status', { month: '1969-12' })).toEqual({ result: null, figures: [], allow: { satang: [], counts: [], dates: [] } })
    await putBudget(user, '1970-01', '20000')
    expect(await tool(user, 'budget_status', { month: '1970-01' })).toMatchObject({ result: { limit_say: '฿200', spent_say: '฿0', left_say: '฿200', categories: [] } })
  })
})

// ===========================================================================
// The 1B-T7 review's pins (brief download-pins): its wiring probes, unchanged
// but for the helper names.
// ===========================================================================

/** The VAULT binding, recording every call the Worker makes before making it; `after` runs once each call has answered. */
function recordingVault(log: VaultCall[], after?: (call: VaultCall) => Promise<void>): DurableObjectNamespace<UserVault> {
  const real = env.VAULT
  return new Proxy(real, {
    get(target, prop) {
      if (prop === 'get') {
        return (id: DurableObjectId, options?: unknown) => {
          const stub = (target.get as (...args: unknown[]) => DurableObjectStub<UserVault>)(id, options)
          return new Proxy(stub, {
            get(s, p) {
              if (p === 'call') {
                return async (call: VaultCall) => {
                  log.push(structuredClone(call))
                  const reply = await s.call(call)
                  if (after) await after(call)
                  return reply
                }
              }
              // A vault route's call (1D-T11): recorded and forwarded as `call` is. Never `.bind`: on an RPC stub that is a remote call.
              if (p === 'callWithAnalytics') {
                return async (call: VaultCall) => {
                  log.push(structuredClone(call))
                  const answered = await s.callWithAnalytics(call)
                  if (after) await after(call)
                  return answered
                }
              }
              const value = Reflect.get(s, p)
              return typeof value === 'function' ? value.bind(s) : value
            },
          })
        }
      }
      const value = Reflect.get(target, prop)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as DurableObjectNamespace<UserVault>
}

/** Malformed input for each AI route that reads one. */
const MALFORMED: [string, string, unknown][] = [
  ['POST', '/v1/ai/parse', { text: 'x'.repeat(201), today, locale: 'th' }],
  ['POST', '/v1/ai/slip', { image_base64: 'not base64!', media_type: 'image/png', today, locale: 'th' }],
  ['POST', '/v1/ai/ask', { question: 'how much?', today, locale: 'en', extra: 1 }],
  ['PUT', '/v1/me/ai-preferences', {}],
  ['GET', '/v1/ai/note?date=24/10/2026&locale=en', undefined],
]

/** One request of MALFORMED's shape from `user`. */
async function sendAs(c: V1Client, user: TestUser, method: string, path: string, payload: unknown): Promise<Response> {
  const as = c.as(user)
  if (method === 'GET') return as.get(path)
  if (method === 'PUT') return as.put(path, payload)
  return as.post(path, payload)
}

const routesOf = (log: VaultCall[]) => log.map((call) => `${call.route} ${call.access} ${call.charge}`)

describe("the 1B-T7 review's pins: what each AI route checks, and in what order", () => {
  it('a signed-out session with a malformed body gets 422, with no vault call and no model call; a well-formed body is 401 at its first step', async () => {
    // The 1B-T7 review's n-1 (its W5), wiring probe "P2 (accepted)": the input is read before any step (P2).
    const log: VaultCall[] = []
    const own = fakeModel()
    const c = await startV1(undefined, { transport: own.transport, env: { VAULT: recordingVault(log) } })
    const user = await member(c)
    expect((await c.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 1 })).status).toBe(200)
    expect((await c.as(user).post('/v1/me/logout')).status).toBe(204)
    log.length = 0
    const out: string[] = []
    for (const [method, path, payload] of MALFORMED) {
      const res = await sendAs(c, user, method, path, payload)
      out.push(`${res.status} ${(await body(res)).code}`)
    }
    expect(out).toEqual(['422 VALIDATION_FAILED', '422 VALIDATION_FAILED', '422 UNKNOWN_FIELD', '422 VALIDATION_FAILED', '422 INVALID_DATE'])
    expect(log).toEqual([])
    const refused = await c.as(user).post('/v1/ai/parse', { text: 'กาแฟ 65', today, locale: 'th' })
    expect(`${refused.status} ${(await body(refused)).code}`).toBe('401 SESSION_REQUIRED')
    expect(routesOf(log)).toEqual(['ai.context current_policy write'])
    expect(own.calls).toHaveLength(0)
  })

  it('a signed-in person without consent who sends a malformed body gets 422, as the PostgreSQL route parsed before AiService checked consent, with no vault call', async () => {
    // The 1B-T7 review's n-1 (its W5), wiring probe "P2 parity".
    const log: VaultCall[] = []
    const own = fakeModel()
    const c = await startV1(undefined, { transport: own.transport, env: { VAULT: recordingVault(log) } })
    const user = await member(c)
    log.length = 0
    const out: string[] = []
    for (const [method, path, payload] of MALFORMED.slice(0, 3)) {
      const res = await sendAs(c, user, method, path, payload)
      out.push(`${res.status} ${(await body(res)).code}`)
    }
    expect(out).toEqual(['422 VALIDATION_FAILED', '422 VALIDATION_FAILED', '422 UNKNOWN_FIELD'])
    expect(log).toEqual([])
    const refused = await c.as(user).post('/v1/ai/parse', { text: 'กาแฟ 65', today, locale: 'th' })
    expect(`${refused.status} ${(await body(refused)).code}`).toBe('403 AI_CONSENT_REQUIRED')
    expect(own.calls).toHaveLength(0)
  })

  it('a session signed out between the context step and the use is refused at the use: 401, no model call and no use spent', async () => {
    // The 1B-T7 review's m-2 (its W7), wiring probe "P5": the use step (`ai.consume`) is the last vault check before
    // every model call, and it checks the session and the policy.
    const log: VaultCall[] = []
    const own = fakeModel()
    const plain = await startV1(undefined, { transport: null })
    let signOut: TestUser | null = null
    const c = await startV1(undefined, {
      transport: own.transport,
      env: {
        VAULT: recordingVault(log, async (call) => {
          if (call.route !== 'ai.context' || !signOut) return
          const who = signOut
          signOut = null
          expect((await plain.as(who).post('/v1/me/logout')).status).toBe(204)
        }),
      },
    })
    const user = await member(plain)
    expect((await plain.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 1 })).status).toBe(200)
    signOut = user
    const refused = await c.as(user).post('/v1/ai/parse', { text: 'กาแฟ 65', today, locale: 'th' })
    expect(`${refused.status} ${(await body(refused)).code}`).toBe('401 SESSION_REQUIRED')
    expect(routesOf(log)).toEqual(['ai.context current_policy write', 'ai.consume current_policy step'])
    expect(own.calls).toHaveLength(0)
    expect(await vaultRows(user, 'SELECT day, feature, uses FROM ai_usage')).toEqual([])
  })
})
