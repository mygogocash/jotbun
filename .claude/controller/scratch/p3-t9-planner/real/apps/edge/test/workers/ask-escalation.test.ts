// P3-T9: Ask Bun asks Opus again in a fresh conversation (D28, H7). Haiku 5.5
// answers first; when its answer fails the grounding check, it declines, or it
// ends without an answer, Opus 5.5 is asked the same question from scratch,
// with the same system and tools and the rest of the route's deadline. An
// outage never escalates. A question counts one use, which goes back when no
// model's words are shown and the last call failed with an outage (H5; R116's
// pins are in ai-uses.test.ts). Each figure carries its record count and what
// it counts over (H14). The front-door cases script the models' replies (no
// network); the last case asks the vault's tool step directly.
import { env } from 'cloudflare:workers'
import { randomUUID } from 'node:crypto'

import { AI_DAILY_LIMITS, bangkokDate } from '@gogospend/contracts'
import type { AiFeature, AiLocale } from '@gogospend/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { VaultCall, VaultClaims, VaultReply } from '../../src/v1/protocol'
import { vaultSession } from '../../src/v1/worker-routes'
import type { AiToolReply } from '../../src/vault/ai'
import { UserVault } from '../../src/vault/user-vault'
import { apiFailure, fakeModel, refusal, text, toolUse } from '../support/fake-model'
import { vaultExec, vaultIdOf, vaultRows } from './support/files'
import { TEST_POLICIES, member, startV1 } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

let model: ReturnType<typeof fakeModel>
let client: V1Client

beforeEach(async () => {
  model = fakeModel()
  client = await startV1(undefined, { transport: model.transport })
})

afterEach(() => {
  // Every scripted reply was asked for.
  expect(model.left()).toBe(0)
})

const today = bangkokDate(new Date())
const monthStart = `${today.slice(0, 7)}-01`
const body = async (res: Response) => res.json()
const HAIKU = 'claude-haiku-5-5'
const OPUS = 'claude-opus-5-5'

type Person = { user: TestUser; cash: string; food: string; travel: string; salary: string }

/** A member who agreed to the AI notice. */
async function consenting(): Promise<TestUser> {
  const user = await member(client)
  expect((await client.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 1 })).status).toBe(200)
  return user
}

/** A consenting member with a cash wallet opened at ฿1,000 (a balance no prompt may carry), the built-in categories, and today a ฿60 lunch and a ฿40 taxi. */
async function person(): Promise<Person> {
  const user = await consenting()
  const cash = randomUUID()
  expect((await client.as(user).post('/v1/wallets', { id: cash, name: 'เงินสด', opening_minor: '100000', tracking_start: '2026-01-01' })).status).toBe(201)
  const categories = (await body(await client.as(user).post('/v1/categories/builtins'))) as { id: string; builtin_key: string | null }[]
  const id = (key: string) => {
    const found = categories.find((category) => category.builtin_key === key)?.id
    if (!found) throw new Error(`the built-in categories have no ${key}`)
    return found
  }
  const [food, travel, salary] = [id('food'), id('travel'), id('salary')]
  for (const [minor, category] of [['6000', food], ['4000', travel]]) {
    expect((await client.as(user).post('/v1/transactions', { id: randomUUID(), type: 'expense', amount_minor: minor, occurred_on: today, wallet_id: cash, category_id: category })).status).toBe(201)
  }
  return { user, cash, food, travel, salary }
}

const ask = (user: TestUser, locale: AiLocale = 'en') => client.as(user).post('/v1/ai/ask', { question: 'how much did I spend on food this month?', today, locale })
const remaining = async (user: TestUser): Promise<Record<AiFeature, number>> => (await body(await client.as(user).get('/v1/me/ai-preferences'))).remaining
const modelsAsked = () => model.calls.map((call) => call.model)
/** The month's spending, on food (฿60) or, with null, on everything (฿100). */
const total = (category: string | null, id?: string) => toolUse('spending_total', { from: monthStart, through: today, type: 'expense', category_id: category }, id)

describe('Ask Bun asks Opus again in a fresh conversation', () => {
  it('an answer that fails the grounding check is asked again of Opus in a fresh conversation', async () => {
    const who = await person()
    model.push(total(who.food, 'toolu_haiku'), text('This month you spent ฿999 on food.'), total(who.food, 'toolu_opus'), text('This month you spent ฿60 on food.'))
    const res = await ask(who.user)
    expect(res.status).toBe(200)
    expect(await body(res)).toEqual({
      answer: 'This month you spent ฿60 on food.',
      figures: [{ label: expect.any(String), amount_minor: '6000', count: 1, scope: { from: monthStart, through: today, type: 'expense', category_id: who.food } }],
      source: 'ai',
      model: OPUS,
      escalated: true,
    })
    expect(modelsAsked()).toEqual([HAIKU, HAIKU, OPUS, OPUS])
    const [haiku, , opus, opusAgain] = model.calls
    // Fresh: Opus's first request is the person's question alone, as Haiku first saw it, with the same system and tools.
    expect(opus.messages).toEqual([haiku.messages[0]])
    expect(opus.messages[0]).toMatchObject({ role: 'user' })
    expect(opus.system).toEqual(haiku.system)
    expect(opus.tools).toEqual(haiku.tools)
    // Opus's own base (H2) at Ask Bun's effort and length, and no thinking or sampling.
    expect(opus).toMatchObject({ model: OPUS, max_tokens: 12_000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'medium' } })
    for (const key of ['thinking', 'temperature', 'top_p', 'top_k']) expect(opus, key).not.toHaveProperty(key)
    // Nothing of Haiku's conversation reaches Opus: not its tool turn, not its words. Opus's second turn holds only its own.
    expect(opusAgain.messages).toHaveLength(3)
    for (const earlier of ['toolu_haiku', '฿999']) expect(JSON.stringify([opus, opusAgain]), earlier).not.toContain(earlier)
  })

  it('a Haiku refusal goes to Opus', async () => {
    const who = await person()
    model.push(refusal(), total(who.food), text('This month you spent ฿60 on food.'))
    expect(await body(await ask(who.user))).toMatchObject({ answer: 'This month you spent ฿60 on food.', source: 'ai', model: OPUS, escalated: true })
    expect(modelsAsked()).toEqual([HAIKU, OPUS, OPUS])
    expect(model.calls[1].messages).toEqual([model.calls[0].messages[0]])
  })

  it('five Haiku tool turns without an answer go to Opus', async () => {
    const who = await person()
    model.push(total(who.food), total(who.food), total(who.food), total(who.food), total(who.food), total(who.food), text('This month you spent ฿60 on food.'))
    const answer = await body(await ask(who.user))
    // Opus's answer, with the one figure its own tool read.
    expect(answer).toMatchObject({ answer: 'This month you spent ฿60 on food.', source: 'ai', model: OPUS, escalated: true, figures: [{ amount_minor: '6000' }] })
    expect(answer.figures).toHaveLength(1)
    expect(modelsAsked()).toEqual([HAIKU, HAIKU, HAIKU, HAIKU, HAIKU, OPUS, OPUS])
    expect(model.calls[5].messages).toEqual([model.calls[0].messages[0]])
  })

  it('when Opus is not grounded either, the plain figures answer', async () => {
    const who = await person()
    // Opus reads everything (฿100), then quotes Haiku's ฿60, which no tool of its own read: its own grounding refuses it.
    model.push(total(who.food), text('This month you spent ฿999 on food.'), total(null), text('Food was ฿60 of it.'))
    const answer = await body(await ask(who.user))
    expect(answer).toMatchObject({ source: 'facts', model: 'rules', escalated: true, figures: [{ amount_minor: '10000', count: 2, scope: { category_id: null } }] })
    // Opus's figures, not Haiku's.
    expect(answer.figures).toHaveLength(1)
    expect(answer.answer).toContain('฿100')
    expect(answer.answer).not.toContain('฿60')
    expect(modelsAsked()).toEqual([HAIKU, HAIKU, OPUS, OPUS])
  })

  it('a Haiku outage never reaches Opus', async () => {
    const who = await person()
    const warnings = vi.spyOn(console, 'warn')
    try {
      // A 429 after one tool turn: Haiku's figures, as they were before.
      model.push(total(who.food), apiFailure(429, { 'retry-after': '40' }))
      const res = await ask(who.user)
      expect(res.status).toBe(200)
      expect(await body(res)).toMatchObject({ source: 'facts', model: 'rules', escalated: false, figures: [{ amount_minor: '6000' }] })
      expect(modelsAsked()).toEqual([HAIKU, HAIKU])
      // The outage is logged by its class name only (Global Constraints, Logging).
      const logged = warnings.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('"event":"ai_fallback"'))
      expect(logged.map((line) => JSON.parse(line))).toEqual([{ level: 'warn', event: 'ai_fallback', feature: 'ask', failure: 'Error' }])
    } finally {
      warnings.mockRestore()
    }
    // The use is given back.
    expect((await remaining(who.user)).ask).toBe(AI_DAILY_LIMITS.ask)
  })

  it("an ungrounded Haiku answer followed by an Opus outage answers Haiku's figures and gives the use back", async () => {
    // Review Focus 3.
    const who = await person()
    model.push(total(who.food), text('This month you spent ฿999 on food.'), apiFailure(529))
    expect(await body(await ask(who.user))).toMatchObject({ source: 'facts', model: 'rules', escalated: true, figures: [{ amount_minor: '6000' }] })
    expect(modelsAsked()).toEqual([HAIKU, HAIKU, OPUS])
    expect((await remaining(who.user)).ask).toBe(AI_DAILY_LIMITS.ask)
  })

  it('a question neither model grounds, with no figures, answers that Bun could not find it', async () => {
    const user = await consenting()
    model.push(text('เดือนนี้ใช้ไป ฿500'), text('ประมาณ ฿700'))
    const res = await ask(user, 'th')
    expect(res.status).toBe(200)
    expect(await body(res)).toEqual({ answer: 'บันหาข้อมูลนี้ในบันทึกของคุณไม่เจอ', figures: [], source: 'facts', model: 'rules', escalated: true })
    expect((await remaining(user)).ask).toBe(AI_DAILY_LIMITS.ask - 1)
  })

  it('an escalated question counts once', async () => {
    const user = await consenting()
    model.push(refusal(), text('Bun can answer that from your diary.'))
    expect(await body(await ask(user))).toMatchObject({ source: 'ai', model: OPUS, escalated: true })
    expect((await remaining(user)).ask).toBe(AI_DAILY_LIMITS.ask - 1)
    expect(await vaultRows(user, 'SELECT day, feature, uses FROM ai_usage')).toEqual([{ day: today, feature: 'ask', uses: 1 }])
  })

  it('the prompts carry no account, session or device identifier (both conversations)', async () => {
    const who = await person()
    model.push(total(who.food), text('This month you spent ฿999 on food.'), total(who.food), text('This month you spent ฿60 on food.'))
    expect((await ask(who.user)).status).toBe(200)
    expect(modelsAsked()).toEqual([HAIKU, HAIKU, OPUS, OPUS])
    // Only the question, the day and the names to choose from, then the tools' results; never who the person is or a balance.
    const wire = JSON.stringify(model.calls)
    for (const secret of [who.user.sub, who.user.sid, vaultIdOf(who.user), 'ios/1.0.0', '100000', '฿1,000']) expect(wire, secret).not.toContain(secret)
  })
})

describe('Ask Bun gives its use back (the P3-T7 reviews)', () => {
  it.each([529, 500])('a question whose first Haiku call fails with %i is 503 AI_PAUSED and gives the use back', async (status) => {
    const user = await consenting()
    model.push(apiFailure(status))
    const res = await ask(user)
    expect(res.status).toBe(503)
    expect(await body(res)).toMatchObject({ code: 'AI_PAUSED', retry_after_seconds: 300 })
    expect(modelsAsked()).toEqual([HAIKU])
    expect((await remaining(user)).ask).toBe(AI_DAILY_LIMITS.ask)
  })

  it('a refund whose vault call itself fails never changes the 503, and is logged by name only', async () => {
    // The second review's PK: the call to the vault rejects (not a problem reply), so the use stays spent.
    const user = await consenting()
    const original = UserVault.prototype.call
    UserVault.prototype.call = function (this: UserVault, call: VaultCall): VaultReply {
      if (call.route === 'ai.refund') throw new Error('the vault call failed')
      return original.call(this, call)
    }
    const warnings = vi.spyOn(console, 'warn')
    try {
      model.push(apiFailure(529))
      const res = await ask(user)
      // Read as soon as the answer is in: the refund ran before the route answered.
      const logged = warnings.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('"event":"ai_refund_failed"'))
      expect(res.status).toBe(503)
      expect(await body(res)).toMatchObject({ code: 'AI_PAUSED' })
      expect(logged.map((line) => JSON.parse(line))).toEqual([{ level: 'warn', event: 'ai_refund_failed', feature: 'ask', failure: 'Error' }])
    } finally {
      UserVault.prototype.call = original
      warnings.mockRestore()
    }
    expect((await remaining(user)).ask).toBe(AI_DAILY_LIMITS.ask - 1)
  })
})

describe("each figure's count and scope", () => {
  const claimsOf = (user: TestUser): VaultClaims => ({ accountId: user.sub, sessionId: user.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios/1.0.0' })

  /** One Ask Bun tool, run as the ai.tool step runs it. */
  async function tool(user: TestUser, name: string, input: Record<string, unknown>): Promise<AiToolReply> {
    const reply = await vaultSession(env, claimsOf(user), TEST_POLICIES, 'bound_session', 'read').call('ai.tool', { body: { name, input, locale: 'en' } })
    expect(reply, name).toMatchObject({ ok: true, status: 200 })
    return (reply as { body: AiToolReply }).body
  }

  /** The figures of a tool reply that is not an input's refusal. */
  const figuresOf = (reply: AiToolReply) => ('figures' in reply ? reply.figures : [])

  it('figures carry their record count and scope', async () => {
    const who = await person()
    const at = new Date().toISOString()
    // 41 food records from 1 to 24 October 2026 at ฿10 each, 21 of them at ร้านป้าแดง; beside them a taxi and a salary in the same days, and a food record on the 25th.
    const rows = [
      ...Array.from({ length: 41 }, (_, i) => ({ type: 'expense', amount_minor: 1_000, occurred_on: `2026-10-${String(1 + (i % 24)).padStart(2, '0')}`, category_id: who.food, merchant: i % 2 === 0 ? 'ร้านป้าแดง' : null })),
      { type: 'expense', amount_minor: 7_000, occurred_on: '2026-10-10', category_id: who.travel, merchant: 'Grab' },
      { type: 'income', amount_minor: 3_000_000, occurred_on: '2026-10-05', category_id: who.salary, merchant: null },
      { type: 'expense', amount_minor: 5_000, occurred_on: '2026-10-25', category_id: who.food, merchant: null },
    ]
    await vaultExec(
      who.user,
      `INSERT INTO transactions (id, type, amount_minor, occurred_on, wallet_id, category_id, merchant, version, created_at, updated_at)
       SELECT json_extract(r.value, '$.id'), json_extract(r.value, '$.type'), json_extract(r.value, '$.amount_minor'), json_extract(r.value, '$.occurred_on'),
              ?, json_extract(r.value, '$.category_id'), json_extract(r.value, '$.merchant'), 1, ?, ?
         FROM json_each(?) AS r`,
      who.cash,
      at,
      at,
      JSON.stringify(rows.map((row) => ({ id: randomUUID(), ...row }))),
    )
    const october = { from: '2026-10-01', through: '2026-10-24' }
    // A total over food: its 41 records, and a scope naming the days, the type and food.
    expect(figuresOf(await tool(who.user, 'spending_total', { ...october, type: 'expense', category_id: who.food }))).toEqual([
      { label: expect.any(String), amount_minor: '41000', count: 41, scope: { ...october, type: 'expense', category_id: who.food } },
    ])
    // Over every category, the taxi joins; an id that is none of the person's categories reads as every category.
    for (const category of [null, randomUUID()]) {
      expect(figuresOf(await tool(who.user, 'spending_total', { ...october, type: 'expense', category_id: category }))).toMatchObject([
        { amount_minor: '48000', count: 42, scope: { ...october, type: 'expense', category_id: null } },
      ])
    }
    // Income counts over income.
    expect(figuresOf(await tool(who.user, 'spending_total', { ...october, type: 'income', category_id: null }))).toMatchObject([
      { amount_minor: '3000000', count: 1, scope: { ...october, type: 'income', category_id: null } },
    ])
    // Per category: each row's records, and a scope naming that category.
    expect(figuresOf(await tool(who.user, 'category_totals', { ...october, type: 'expense' }))).toMatchObject([
      { amount_minor: '41000', count: 41, scope: { ...october, type: 'expense', category_id: who.food } },
      { amount_minor: '7000', count: 1, scope: { ...october, type: 'expense', category_id: who.travel } },
    ])
    // A place's total has its count and no scope.
    expect(figuresOf(await tool(who.user, 'top_merchants', october)).map(({ amount_minor, count, scope }) => ({ amount_minor, count, scope }))).toEqual([
      { amount_minor: '21000', count: 21, scope: null },
      { amount_minor: '20000', count: 20, scope: null },
      { amount_minor: '7000', count: 1, scope: null },
    ])
    // A budget's lines have neither.
    expect((await client.as(who.user).put('/v1/budgets/2026-10', { overall_limit_minor: '500000', category_limits: [{ category_id: who.food, limit_minor: '100000' }] })).status).toBe(200)
    const budget = figuresOf(await tool(who.user, 'budget_status', { month: '2026-10' }))
    expect(budget.map(({ count, scope }) => ({ count, scope }))).toEqual(Array(4).fill({ count: null, scope: null }))
  })
})
