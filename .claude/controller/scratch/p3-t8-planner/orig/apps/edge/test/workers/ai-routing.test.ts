// P3-T6: Haiku first, and AI results that name their model. Every AI route
// calls Haiku 5.5 on its own request base (H2), under one deadline per route
// that the phone outwaits (H3), and every result names the model whose words
// it shows (H4). The first four cases go through the Worker's front door with
// scripted model replies. The last three run the service alone, on a fake
// vault session and a fake clock, so a 24-second turn takes no time (they
// carry the P3-T4 review's R1, R3 and R4, and its n2). No network.
//
// The scripted slip replies are complete reads carrying `kind: 'slip'`, which
// the service ignores until P3-T8, so P3-T8 escalates none of them. No case
// here counts uses, since P3-T7 gives some of them back.
import { randomUUID } from 'node:crypto'

import Anthropic from '@anthropic-ai/sdk'
import { bangkokDate } from '@gogospend/contracts'
import type { AiFeature } from '@gogospend/contracts'
import { describe, expect, it } from 'vitest'

import { ProblemException } from '@api/common/api-problem.filter'

import type { MessageParams, ModelMessage } from '../../src/server/ai/model'
import { VaultAiService } from '../../src/v1/ai/service'
import type { ModelTransport } from '../../src/v1/ai/transport'
import type { VaultRouteId } from '../../src/v1/protocol'
import type { VaultSession } from '../../src/v1/worker-routes'
import { apiFailure, fakeModel, json, refusal, text, toolUse } from '../support/fake-model'
import { vaultIdOf } from './support/files'
import { member, startV1 } from './support/v1-client'
import type { TestUser, V1Client } from './support/v1-client'

const today = bangkokDate(new Date())
const monthStart = `${today.slice(0, 7)}-01`
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const body = async (res: Response) => res.json()

type Person = { user: TestUser; cash: string; food: string }

/** A member who agreed to the AI notice, with a cash wallet opened at ฿1,000 (a balance no prompt may carry) and one ฿60 lunch today. */
async function person(client: V1Client): Promise<Person> {
  const user = await member(client)
  expect((await client.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 1 })).status).toBe(200)
  const cash = randomUUID()
  expect((await client.as(user).post('/v1/wallets', { id: cash, name: 'เงินสด', opening_minor: '100000', tracking_start: '2026-01-01' })).status).toBe(201)
  const categories = (await body(await client.as(user).post('/v1/categories/builtins'))) as { id: string; builtin_key: string | null }[]
  const food = categories.find((category) => category.builtin_key === 'food')?.id
  if (!food) throw new Error('the built-in categories have no food')
  expect((await client.as(user).post('/v1/transactions', { id: randomUUID(), type: 'expense', amount_minor: '6000', occurred_on: today, wallet_id: cash, category_id: food })).status).toBe(201)
  return { user, cash, food }
}

/**
 * Each route once, each answered in full by the scripted model: a parse, the
 * note, a complete slip read and a question in two turns. Every reply names
 * claude-opus-5-5 (the fake's default), as an Opus fallback might.
 */
async function askEveryRoute(client: V1Client, model: ReturnType<typeof fakeModel>, { user, cash, food }: Person) {
  model.push(
    json({ drafts: [{ type: 'expense', amount_baht: '50', date: today, category_id: food, wallet_id: cash, merchant: 'ข้าวมันไก่', note: null, confidence: 'high', flags: [] }] }),
    json({ text: 'วันนี้จดไป 1 รายการ ฿60 เก่งมากนะ' }),
    json({ kind: 'slip', bank: 'K PLUS', drafts: [{ type: 'expense', amount_baht: '89', date: today, category_id: food, wallet_id: cash, merchant: 'ร้านกาแฟ', note: null, confidence: 'high', flags: [] }] }),
    toolUse('spending_total', { from: monthStart, through: today, type: 'expense', category_id: food }),
    text('This month you spent ฿60 on food.'),
  )
  return {
    parse: await client.as(user).post('/v1/ai/parse', { text: 'ข้าวมันไก่ 50', today, locale: 'th' }),
    note: await client.as(user).get(`/v1/ai/note?date=${today}&locale=th`),
    slip: await client.as(user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' }),
    ask: await client.as(user).post('/v1/ai/ask', { question: 'เดือนนี้กินไปเท่าไหร่', today, locale: 'th' }),
  }
}

describe('Haiku first, and results that name their model', () => {
  it('parse, note, slip and ask call Haiku 5.5 with no betas, fallbacks, thinking, sampling or prefill', async () => {
    const model = fakeModel()
    const client = await startV1(undefined, { transport: model.transport })
    const answered = await askEveryRoute(client, model, await person(client))
    for (const [route, res] of Object.entries(answered)) expect(res.status, route).toBe(200)
    // Parse, note, slip, then Ask Bun's two turns.
    expect(model.calls.map((call) => [call.model, call.output_config?.effort, call.max_tokens])).toEqual([
      ['claude-haiku-5-5', 'low', 8_000],
      ['claude-haiku-5-5', 'low', 4_000],
      ['claude-haiku-5-5', 'medium', 8_000],
      ['claude-haiku-5-5', 'medium', 12_000],
      ['claude-haiku-5-5', 'medium', 12_000],
    ])
    for (const [i, call] of model.calls.entries()) {
      for (const key of ['betas', 'fallbacks', 'thinking', 'temperature', 'top_p', 'top_k']) expect(call, `call ${i}: ${key}`).not.toHaveProperty(key)
      // No prefill: every request ends with the person's turn.
      expect(call.messages.at(-1)?.role, `call ${i}`).toBe('user')
    }
    expect(model.left()).toBe(0)
  })

  it('the results name the model', async () => {
    const model = fakeModel()
    const client = await startV1(undefined, { transport: model.transport })
    const who = await person(client)
    // Every reply names claude-opus-5-5, yet the words are Haiku's: a result names the tier, never message.model.
    for (const [route, res] of Object.entries(await askEveryRoute(client, model, who))) {
      expect(await body(res), route).toMatchObject({ source: 'ai', model: 'claude-haiku-5-5', escalated: false })
    }
    // A parse Haiku refuses is answered by the rules.
    model.push(refusal())
    expect(await body(await client.as(who.user).post('/v1/ai/parse', { text: 'ข้าวผัด 45', today, locale: 'th' }))).toMatchObject({ source: 'rules', model: 'rules', escalated: false })
    // So is a parse whose Haiku reply has no usable draft (the P3-T6 review's X4).
    model.push(json({ drafts: [] }))
    expect(await body(await client.as(who.user).post('/v1/ai/parse', { text: 'ข้าวผัด 45', today, locale: 'th' }))).toMatchObject({ source: 'rules', model: 'rules', escalated: false })
    // A note whose words stray from the facts is the plain facts.
    model.push(json({ text: 'วันนี้ใช้ไป ฿65 แล้วนะ' }))
    expect(await body(await client.as(who.user).get(`/v1/ai/note?date=${today}&locale=th`))).toMatchObject({ source: 'facts', model: 'rules', escalated: false })
    // A question cut short by an outage after a tool read its figures answers with those figures.
    model.push(toolUse('spending_total', { from: monthStart, through: today, type: 'expense', category_id: who.food }), apiFailure(500))
    expect(await body(await client.as(who.user).post('/v1/ai/ask', { question: 'how much?', today, locale: 'en' }))).toMatchObject({
      source: 'facts',
      model: 'rules',
      escalated: false,
      figures: [{ amount_minor: '6000' }],
    })
    expect(model.left()).toBe(0)
  })

  it('each route answers inside its deadline when the model hangs', async () => {
    // Review Focus 2. A model that never answers: each call ends when its time
    // is up, as the transport's timeout ends it (P3-T4), but never waits more
    // than 6 s here, so a route that ignored its deadline fails in seconds.
    const given: number[] = []
    const transport: ModelTransport = {
      async send(_params: MessageParams, options: { timeoutMs: number }): Promise<ModelMessage> {
        given.push(options.timeoutMs)
        await new Promise((resolve) => setTimeout(resolve, Math.min(options.timeoutMs, 6_000)))
        throw new Anthropic.APIConnectionTimeoutError({ message: 'Request timed out.' })
      },
    }
    const client = await startV1(undefined, { transport, aiDeadlines: { parse: 2_500, slip: 2_500, note: 2_500, ask: 2_500 } })
    const { user } = await person(client)
    const timed = async (send: () => Promise<Response>) => {
      const started = Date.now()
      const res = await send()
      return { status: res.status, body: await body(res), ms: Date.now() - started }
    }
    const parse = await timed(() => client.as(user).post('/v1/ai/parse', { text: 'ข้าวผัด 45', today, locale: 'th' }))
    expect(parse.ms, 'parse').toBeLessThan(4_000)
    expect(parse).toMatchObject({ status: 200, body: { source: 'rules', model: 'rules', escalated: false } })
    const note = await timed(() => client.as(user).get(`/v1/ai/note?date=${today}&locale=th`))
    expect(note.ms, 'note').toBeLessThan(4_000)
    expect(note).toMatchObject({ status: 200, body: { source: 'facts', model: 'rules', escalated: false } })
    const slip = await timed(() => client.as(user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' }))
    expect(slip.ms, 'slip').toBeLessThan(4_000)
    expect(slip).toMatchObject({ status: 503, body: { code: 'AI_PAUSED' } })
    const ask = await timed(() => client.as(user).post('/v1/ai/ask', { question: 'how much?', today, locale: 'en' }))
    expect(ask.ms, 'ask').toBeLessThan(4_000)
    expect(ask).toMatchObject({ status: 503, body: { code: 'AI_PAUSED' } })
    // Each call that was made was given no more than its route's deadline.
    for (const ms of given) expect(ms).toBeLessThanOrEqual(2_500)
  }, 60_000)

  it('no prompt carries the account, the session or a balance', async () => {
    const model = fakeModel()
    const client = await startV1(undefined, { transport: model.transport })
    const who = await person(client)
    await askEveryRoute(client, model, who)
    expect(model.calls).toHaveLength(5)
    // Only the words, the date and names to choose from; never who the person is (the account, the session, the vault) or a balance.
    const wire = JSON.stringify(model.calls)
    for (const secret of [who.user.sub, who.user.sid, vaultIdOf(who.user), '100000', '฿1,000']) expect(wire, secret).not.toContain(secret)
  })
})

// ===========================================================================
// The deadlines on a fake clock: the service alone, on a fake vault session.
// ===========================================================================

/** 10:00 on 12 November 2026 in Bangkok. */
const NOW = Date.parse('2026-11-12T03:00:00.000Z')
const DAY = '2026-11-12'
const CASH = '1a000000-0000-4000-8000-000000000001'
const FOOD = '2c000000-0000-4000-8000-000000000001'

/** What each AI step answers on the fake session: the use answers its day, as the vault's does (P3-T7). Any other step (P3-T7's refund) answers `{}`. */
const STEP_REPLIES: Partial<Record<VaultRouteId, unknown>> = {
  'ai.consume': { day: DAY },
  'ai.context': {
    consent: true,
    wallets: [{ id: CASH, name: 'เงินสด', archived: false }],
    categories: [{ id: FOOD, type: 'expense', builtin_key: 'food', label: null, archived: false }],
  },
  'ai.preferences': { companion: true, cashback_tips: false, notice_version: 1, current_notice_version: 1, remaining: { parse: 30, slip: 10, note: 3, ask: 20 } },
  'ai.facts': [{ kind: 'spent_today', amount_minor: '6000', count: 1 }],
  'ai.tool': { result: { total: '฿60' }, figures: [{ label: 'อาหาร', amount_minor: '6000' }], allow: { satang: ['6000'], counts: [1], dates: [] } },
}

type Clock = { ms: number }

/** A vault session for the service alone. Its first step takes `firstStepMs` on the fake clock; every step answers at once. */
function fakeVault(clock: Clock, firstStepMs = 0): VaultSession {
  let first = true
  return {
    vaultId: 'vault-on-a-fake-clock',
    stub: {} as never,
    policies: [] as never,
    async call(route: VaultRouteId) {
      if (first) clock.ms += firstStepMs
      first = false
      return { ok: true, status: 200, body: STEP_REPLIES[route] ?? {} }
    },
  }
}

/** A transport that records each call's model and the time it was given, and answers with `reply`. */
function recording(reply: (call: number) => ModelMessage) {
  const calls: { model: string; timeoutMs: number }[] = []
  const transport: ModelTransport = {
    async send(params: MessageParams, options: { timeoutMs: number }): Promise<ModelMessage> {
      calls.push({ model: params.model, timeoutMs: options.timeoutMs })
      return reply(calls.length)
    },
  }
  return { transport, calls }
}

/** One request on `route`, as the route runs it: 200 with the result, or the problem's status. */
async function run(service: VaultAiService, session: VaultSession, route: AiFeature): Promise<{ status: number; body?: unknown }> {
  try {
    if (route === 'parse') return { status: 200, body: await service.parse(session, { text: 'ข้าวผัด 45', today: DAY, locale: 'th' }) }
    if (route === 'slip') return { status: 200, body: await service.slip(session, { image_base64: tinyPng, media_type: 'image/png', today: DAY, locale: 'th' }) }
    if (route === 'note') return { status: 200, body: await service.note(session, DAY, 'th') }
    return { status: 200, body: await service.ask(session, { question: 'เดือนนี้กินไปเท่าไหร่', today: DAY, locale: 'th' }) }
  } catch (error) {
    if (error instanceof ProblemException) return { status: error.getStatus() }
    throw error
  }
}

describe('one deadline per route, on a fake clock', () => {
  it("each route's first call gets what is left of its deadline, counted from before its first vault step, and Ask Bun's Haiku turns 25 s at most", async () => {
    // [route, the first vault step's time, the time the first call is given]: parse 15 s, slip 45 s, note 10 s,
    // ask 55 s with Haiku's turns capped at 25 s. The slip's row stays right once P3-T8 caps Haiku's read at 20 s.
    const rows: [AiFeature, number, number][] = [
      ['parse', 0, 15_000],
      ['parse', 5_000, 10_000],
      ['note', 0, 10_000],
      ['slip', 30_000, 15_000],
      ['ask', 0, 25_000],
      ['ask', 40_000, 15_000],
    ]
    for (const [route, firstStepMs, givenMs] of rows) {
      const clock = { ms: NOW }
      const model = recording(() => json({ drafts: [] }))
      const service = new VaultAiService({ transport: model.transport, now: () => new Date(clock.ms) })
      await run(service, fakeVault(clock, firstStepMs), route)
      expect(model.calls.map((call) => call.timeoutMs), `${route} after ${firstStepMs} ms`).toEqual([givenMs])
    }
  })

  it('a route whose vault steps leave it less than 2 s makes no model call, and answers as it does without one', async () => {
    const deadlines: [AiFeature, number][] = [
      ['parse', 15_000],
      ['slip', 45_000],
      ['note', 10_000],
      ['ask', 55_000],
    ]
    for (const [route, deadlineMs] of deadlines) {
      const clock = { ms: NOW }
      const model = recording(() => json({ drafts: [] }))
      const service = new VaultAiService({ transport: model.transport, now: () => new Date(clock.ms) })
      const answer = await run(service, fakeVault(clock, deadlineMs - 1_000), route)
      expect(model.calls, route).toEqual([])
      if (route === 'parse') expect(answer).toMatchObject({ status: 200, body: { source: 'rules', model: 'rules', escalated: false } })
      if (route === 'note') expect(answer).toMatchObject({ status: 200, body: { source: 'facts', model: 'rules', escalated: false } })
      if (route === 'slip') expect(answer.status).toBe(503)
      // Ask Bun's answer here changes with P3-T9 (a turn that cannot start goes to Opus), so only its calls are pinned.
    }
  })

  it("Ask Bun's Haiku turns share one 25 s: a first turn that takes 24 s leaves no time for a second", async () => {
    const clock = { ms: NOW }
    const model = recording((call) => {
      if (call > 1) return text('This month you spent ฿60 on food.')
      clock.ms += 24_000
      return toolUse('spending_total', { from: '2026-11-01', through: DAY, type: 'expense', category_id: FOOD })
    })
    const service = new VaultAiService({ transport: model.transport, now: () => new Date(clock.ms) })
    const answer = await run(service, fakeVault(clock), 'ask')
    expect(answer.status).toBe(200)
    expect(model.calls.filter((call) => call.model === 'claude-haiku-5-5')).toEqual([{ model: 'claude-haiku-5-5', timeoutMs: 25_000 }])
  })
})
