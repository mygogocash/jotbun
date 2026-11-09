import { randomUUID } from 'node:crypto'

import { AI_DAILY_LIMITS, bangkokDate } from '@gogospend/contracts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildContainer } from '../src/server/app/container'
import { fakeModel, json, refusal, text, toolUse } from './support/fake-model'
import { BASE, startEdge, testSettings } from './support/edge-harness'
import type { Edge, SignedUp } from './support/edge-harness'

const model = fakeModel()
let edge: Edge

beforeAll(async () => {
  edge = await startEdge({}, { send: model.send })
})

afterAll(async () => {
  await edge?.close()
})

beforeEach(() => {
  model.calls.length = 0
  expect(model.left()).toBe(0)
})

const today = bangkokDate(new Date())
const body = async (res: Response) => res.json()

async function consenting(): Promise<SignedUp> {
  const user = await edge.member()
  const res = await edge.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 1 })
  expect(res.status).toBe(200)
  return user
}

async function withCashAndFood(user: SignedUp) {
  const cash = randomUUID()
  expect((await edge.as(user).post('/v1/wallets', { id: cash, name: 'เงินสด', opening_minor: '100000', tracking_start: '2026-01-01' })).status).toBe(201)
  const categories = await body(await edge.as(user).post('/v1/categories/builtins'))
  const food = categories.find((c: { builtin_key: string }) => c.builtin_key === 'food').id as string
  return { cash, food }
}

describe('consent', () => {
  it('AI is off until the user agrees to the current notice', async () => {
    const user = await edge.member()
    const prefs = await body(await edge.as(user).get('/v1/me/ai-preferences'))
    expect(prefs).toEqual({
      companion: false,
      cashback_tips: false,
      notice_version: null,
      current_notice_version: 1,
      remaining: AI_DAILY_LIMITS,
      available: true,
    })
    const blocked = await edge.as(user).post('/v1/ai/parse', { text: 'กาแฟ 65', today, locale: 'th' })
    expect(blocked.status).toBe(403)
    expect((await body(blocked)).code).toBe('AI_CONSENT_REQUIRED')
    expect(model.calls).toHaveLength(0)
  })

  it('turning AI on needs the current notice version; tips can be set alone', async () => {
    const user = await edge.member()
    const without = await edge.as(user).put('/v1/me/ai-preferences', { companion: true })
    expect(without.status).toBe(403)
    expect(await body(without)).toMatchObject({ code: 'AI_CONSENT_REQUIRED', message_key: 'errors.ai_notice_required' })
    expect((await edge.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 0 })).status).toBe(422)
    expect(await body(await edge.as(user).put('/v1/me/ai-preferences', { cashback_tips: true }))).toMatchObject({ companion: false, cashback_tips: true })
    expect(await body(await edge.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 1 }))).toMatchObject({ companion: true, cashback_tips: true, notice_version: 1 })
    expect(await body(await edge.as(user).put('/v1/me/ai-preferences', { companion: false }))).toMatchObject({ companion: false, notice_version: 1 })
  })

  it('preferences are the account’s own (RLS)', async () => {
    await consenting()
    const other = await edge.member()
    expect(await body(await edge.as(other).get('/v1/me/ai-preferences'))).toMatchObject({ companion: false, notice_version: null })
  })
})

describe('Tell Bun', () => {
  it('turns a sentence into a grounded draft, asking Claude through the shared settings', async () => {
    const user = await consenting()
    const { cash, food } = await withCashAndFood(user)
    model.push(json({ drafts: [{ type: 'expense', amount_baht: '50', date: today, category_id: food, wallet_id: cash, merchant: 'ข้าวมันไก่', note: null, confidence: 'high', flags: [] }] }))
    const res = await edge.as(user).post('/v1/ai/parse', { text: 'ข้าวมันไก่ 50', today, locale: 'th' })
    expect(res.status).toBe(200)
    expect(await body(res)).toEqual({
      source: 'ai',
      drafts: [{ type: 'expense', amount_minor: '5000', occurred_on: today, category_id: food, wallet_id: cash, merchant: 'ข้าวมันไก่', note: null, confidence: 'high', flags: [] }],
    })
    const [sent] = model.calls
    expect(sent).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], output_config: { effort: 'low', format: { type: 'json_schema' } } })
    // Only the sentence, the date and names to choose from; never who the person is.
    const wire = JSON.stringify(sent)
    for (const secret of [user.accountId, user.binding, user.who.subject, '100000']) expect(wire).not.toContain(secret)
    expect((await body(await edge.as(user).get('/v1/me/ai-preferences'))).remaining.parse).toBe(AI_DAILY_LIMITS.parse - 1)
  })

  it('never passes on an amount the person did not write', async () => {
    const user = await consenting()
    const { food } = await withCashAndFood(user)
    model.push(json({ drafts: [{ type: 'expense', amount_baht: '500', date: today, category_id: food, wallet_id: null, merchant: 'coffee', note: null, confidence: 'high', flags: [] }] }))
    const result = await body(await edge.as(user).post('/v1/ai/parse', { text: 'coffee 65', today, locale: 'en' }))
    expect(result.drafts[0]).toMatchObject({ amount_minor: null, confidence: 'low' })
    expect(result.drafts[0].flags).toContain('amount_unclear')
  })

  it('falls back to the offline rules when Claude refuses, fails or has nothing', async () => {
    const user = await consenting()
    const { food } = await withCashAndFood(user)
    model.push(refusal(), new Error('network down'), json({ drafts: [] }))
    for (let i = 0; i < 3; i += 1) {
      const result = await body(await edge.as(user).post('/v1/ai/parse', { text: 'ข้าวผัด 45', today, locale: 'th' }))
      expect(result).toMatchObject({ source: 'rules', drafts: [{ amount_minor: '4500', category_id: food }] })
    }
  })

  it('without AI configured, answers from the rules and spends no uses', async () => {
    const offline = buildContainer(testSettings(edge.issuer), { send: null })
    const user = await consenting()
    const call = (path: string, init: RequestInit) => edge.call(new Request(`${BASE}${path}`, init), { container: () => offline })
    const headers = {
      'content-type': 'application/json',
      'x-gogospend-client': 'ios/1.0.0',
      authorization: `Bearer ${await edge.issuer.accessToken({ sub: user.who.subject })}`,
      'x-gogospend-session': user.binding,
    }
    const res = await call('/v1/ai/parse', { method: 'POST', headers, body: JSON.stringify({ text: 'grab 120', today, locale: 'en' }) })
    expect(await body(res)).toMatchObject({ source: 'rules', drafts: [{ amount_minor: '12000' }] })
    const prefs = await body(await call('/v1/me/ai-preferences', { headers }))
    expect(prefs).toMatchObject({ available: false, remaining: { parse: AI_DAILY_LIMITS.parse } })
  })

  it('stops at the daily limit until the next Bangkok day', async () => {
    const user = await consenting()
    await edge.db.admin((client) => client.query(`INSERT INTO ai_usage (account_id, day, feature, uses) VALUES ($1, $2, 'parse', $3)`, [user.accountId, today, AI_DAILY_LIMITS.parse]))
    const res = await edge.as(user).post('/v1/ai/parse', { text: 'กาแฟ 65', today, locale: 'th' })
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await body(res)).code).toBe('AI_LIMIT_REACHED')
    expect(model.calls).toHaveLength(0)
    const [row] = (await edge.db.admin((client) => client.query(`SELECT uses FROM ai_usage WHERE account_id = $1 AND feature = 'parse'`, [user.accountId]))).rows
    expect(row.uses).toBe(AI_DAILY_LIMITS.parse)
  })

  it('validates the sentence', async () => {
    const user = await consenting()
    expect((await edge.as(user).post('/v1/ai/parse', { text: 'x'.repeat(201), today, locale: 'th' })).status).toBe(422)
    expect((await edge.as(user).post('/v1/ai/parse', { text: 'กาแฟ', today, locale: 'jp' })).status).toBe(422)
    expect((await edge.as(user).post('/v1/ai/parse', { text: 'กาแฟ', today: '24/10/2026', locale: 'th' })).status).toBe(422)
  })
})

describe('slips', () => {
  const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  it('reads a slip image into drafts and keeps nothing', async () => {
    const user = await consenting()
    const { cash } = await withCashAndFood(user)
    model.push(json({ bank: 'K PLUS', drafts: [{ type: 'expense', amount_baht: '1,250.00', date: today, category_id: null, wallet_id: cash, merchant: 'ร้านป้าแดง', note: null, confidence: 'high', flags: [] }] }))
    const res = await edge.as(user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' })
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({ source: 'ai', bank: 'K PLUS', drafts: [{ amount_minor: '125000', merchant: 'ร้านป้าแดง', confidence: 'medium', flags: ['category_guessed'] }] })
    const [sent] = model.calls
    expect(sent.output_config).toMatchObject({ effort: 'medium' })
    expect(JSON.stringify(sent.messages)).toContain('"type":"image"')
  })

  it('refuses other files and broken base64 before any model call', async () => {
    const user = await consenting()
    const gif = await edge.as(user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/gif', today, locale: 'th' })
    expect(await body(gif)).toMatchObject({ code: 'UPLOAD_UNSUPPORTED_TYPE' })
    expect((await edge.as(user).post('/v1/ai/slip', { image_base64: 'not base64!', media_type: 'image/png', today, locale: 'th' })).status).toBe(422)
    expect(model.calls).toHaveLength(0)
  })
})

describe('Bun’s daily note', () => {
  async function lunch(user: SignedUp, cash: string, food: string, minor = '6000') {
    expect((await edge.as(user).post('/v1/transactions', { id: randomUUID(), type: 'expense', amount_minor: minor, occurred_on: today, wallet_id: cash, category_id: food })).status).toBe(201)
  }

  it('without consent: the plain facts, and no model call', async () => {
    const user = await edge.member()
    const { cash, food } = await withCashAndFood(user)
    await lunch(user, cash, food)
    const note = await body(await edge.as(user).get(`/v1/ai/note?date=${today}&locale=en`))
    expect(note).toMatchObject({ date: today, source: 'facts', text: expect.stringContaining('1 logged today, ฿60 in all.') })
    expect(note.facts[0]).toEqual({ kind: 'spent_today', amount_minor: '6000', count: 1 })
    expect(model.calls).toHaveLength(0)
  })

  it('uses Claude’s words only when every number is one of the facts', async () => {
    const user = await consenting()
    const { cash, food } = await withCashAndFood(user)
    await lunch(user, cash, food)
    model.push(json({ text: 'วันนี้จดไป 1 รายการ ฿60 เก่งมากนะ' }), json({ text: 'วันนี้ใช้ไป ฿65 แล้วนะ' }))
    const good = await body(await edge.as(user).get(`/v1/ai/note?date=${today}&locale=th`))
    expect(good).toMatchObject({ source: 'ai', text: 'วันนี้จดไป 1 รายการ ฿60 เก่งมากนะ' })
    const strayed = await body(await edge.as(user).get(`/v1/ai/note?date=${today}&locale=th`))
    expect(strayed).toMatchObject({ source: 'facts', text: expect.stringContaining('฿60') })
    expect(strayed.text).not.toContain('65')
  })

  it('out of note uses, the facts still come', async () => {
    const user = await consenting()
    await edge.db.admin((client) => client.query(`INSERT INTO ai_usage (account_id, day, feature, uses) VALUES ($1, $2, 'note', $3)`, [user.accountId, today, AI_DAILY_LIMITS.note]))
    const res = await edge.as(user).get(`/v1/ai/note?date=${today}&locale=th`)
    expect(res.status).toBe(200)
    const note = await body(res)
    expect(note.source).toBe('facts')
    expect(note.facts[0]).toEqual({ kind: 'no_records_today' })
  })
})

describe('Ask Bun', () => {
  it('answers through a read-only tool and returns the figures it used', async () => {
    const user = await consenting()
    const { cash, food } = await withCashAndFood(user)
    for (const minor of ['6000', '4500']) {
      expect((await edge.as(user).post('/v1/transactions', { id: randomUUID(), type: 'expense', amount_minor: minor, occurred_on: today, wallet_id: cash, category_id: food })).status).toBe(201)
    }
    const month = today.slice(0, 7)
    model.push(toolUse('spending_total', { from: `${month}-01`, through: today, type: 'expense', category_id: food }), text('This month you spent ฿105 on food across 2 meals.'))
    const res = await edge.as(user).post('/v1/ai/ask', { question: 'เดือนนี้กินไปเท่าไหร่', today, locale: 'th' })
    expect(res.status).toBe(200)
    const answer = await body(res)
    expect(answer).toMatchObject({ source: 'ai', answer: 'This month you spent ฿105 on food across 2 meals.', figures: [{ amount_minor: '10500' }] })
    // The figure the phone shows is worded in the question's language, not as the tool's input.
    expect(answer.figures[0].label).toMatch(/^อาหาร \d{1,2}–\d{1,2} \S+ \d{4}$|^อาหาร \d{1,2} \S+ \d{4}$/)
    // The tool result went back to Claude as the second turn.
    expect(JSON.stringify(model.calls[1].messages)).toContain('฿105')
    expect(model.calls[0].tools?.map((t) => (t as { name: string }).name)).toEqual(['spending_total', 'category_totals', 'top_merchants', 'budget_status'])
  })

  it('an answer with a number no tool read becomes the plain figures', async () => {
    const user = await consenting()
    await withCashAndFood(user)
    model.push(toolUse('spending_total', { from: '2026-10-01', through: today, type: 'expense', category_id: null }), text('You spent about ฿9,999.'))
    const answer = await body(await edge.as(user).post('/v1/ai/ask', { question: 'how much?', today, locale: 'en' }))
    expect(answer).toMatchObject({ source: 'facts', answer: expect.stringContaining('From your diary') })
    expect(answer.answer).not.toContain('9,999')
  })

  it('a bad tool input is reported back to Claude, not run', async () => {
    const user = await consenting()
    model.push(toolUse('spending_total', { from: '2026-12-01', through: '2026-01-01', type: 'expense', category_id: null }), text('Bun only knows your own records.'))
    const answer = await body(await edge.as(user).post('/v1/ai/ask', { question: 'how much next year?', today, locale: 'en' }))
    expect(answer).toMatchObject({ source: 'ai', answer: 'Bun only knows your own records.', figures: [] })
    expect(JSON.stringify(model.calls[1].messages)).toContain('"is_error":true')
  })
})
