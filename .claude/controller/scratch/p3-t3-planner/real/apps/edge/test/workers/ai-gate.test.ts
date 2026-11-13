// The ai gate (P3-T3) at the front door: a paused `ai` scope answers 503
// AI_PAUSED on the four routes that call a model, before the client check and
// the token, and spends nothing; the AI preferences stay open and say AI is
// unavailable (default pending owner Q5). Every model call is a scripted fake.
import { AI_DAILY_LIMITS, bangkokDate } from '@gogospend/contracts'
import { beforeEach, describe, expect, it } from 'vitest'

import type { EdgeConfigJson } from '../../src/v1/config'
import { fakeModel, json } from '../support/fake-model'
import { BASE, TEST_POLICIES, member, startV1 } from './support/v1-client'
import type { TestUser } from './support/v1-client'

const OPEN: EdgeConfigJson = { policies: TEST_POLICIES, client_versions: { ios: '1.0.0', android: '1.0.0' } }
const AI_PAUSED: EdgeConfigJson = { ...OPEN, gates: { paused: ['ai'], retry_after_seconds: 120 } }
const WRITES_PAUSED: EdgeConfigJson = { ...OPEN, gates: { paused: ['writes'], retry_after_seconds: 120 } }

const today = bangkokDate(new Date())
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** The four routes that call a model, each with a request it would accept. */
const MODEL_ROUTES: { method: 'GET' | 'POST'; path: string; body?: unknown }[] = [
  { method: 'POST', path: '/v1/ai/parse', body: { text: 'กาแฟ 65', today, locale: 'th' } },
  { method: 'POST', path: '/v1/ai/slip', body: { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' } },
  { method: 'GET', path: `/v1/ai/note?date=${today}&locale=en` },
  { method: 'POST', path: '/v1/ai/ask', body: { question: 'how much?', today, locale: 'en' } },
]

const aWallet = () => ({ id: crypto.randomUUID(), name: 'เงินสด', opening_minor: '0', tracking_start: '2026-10-01' })

let model: ReturnType<typeof fakeModel>

beforeEach(() => {
  model = fakeModel()
})

/** A member who agreed to the current AI notice, set up while config:v1 is open. */
async function consenting(): Promise<TestUser> {
  const open = await startV1(OPEN, { transport: model.transport })
  const user = await member(open)
  expect((await open.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 1 })).status).toBe(200)
  return user
}

/** The exact refusal a paused `ai` scope answers with. */
async function expectAiPaused(res: Response, what: string): Promise<void> {
  expect(res.status, what).toBe(503)
  expect(res.headers.get('retry-after'), what).toBe('120')
  const problem = await res.json()
  expect(problem, what).toMatchObject({ code: 'AI_PAUSED', message_key: 'errors.ai_paused', retry_after_seconds: 120 })
  expect(Object.keys(problem as object).sort(), what).toEqual(['code', 'message_key', 'request_id', 'retry_after_seconds'])
}

describe('the ai gate', () => {
  it('a paused ai gate answers 503 AI_PAUSED with Retry-After on parse, slip, note and ask, before authentication', async () => {
    const user = await consenting()
    const paused = await startV1(AI_PAUSED, { transport: model.transport })
    for (const route of MODEL_ROUTES) {
      const what = `${route.method} ${route.path}`
      // No token and no client header: a gate after the client check or the token would answer 426 or 401.
      const headers: Record<string, string> = route.body === undefined ? {} : { 'content-type': 'application/json' }
      const body = route.body === undefined ? undefined : JSON.stringify(route.body)
      await expectAiPaused(await paused.raw(new Request(`${BASE}${route.path}`, { method: route.method, headers, body })), `${what} without a token`)
      // A signed-in member who agreed to AI is refused the same way.
      const signedIn = route.method === 'GET' ? await paused.as(user).get(route.path) : await paused.as(user).post(route.path, route.body)
      await expectAiPaused(signedIn, `${what} signed in`)
    }
    // No model was asked and no use was spent.
    expect(model.calls).toHaveLength(0)
    expect((await (await paused.as(user).get('/v1/me/ai-preferences')).json()).remaining).toEqual(AI_DAILY_LIMITS)
  })

  it('AI preferences stay open and say available false while ai is paused', async () => {
    const user = await consenting()
    const paused = await startV1(AI_PAUSED, { transport: model.transport })
    const read = await paused.as(user).get('/v1/me/ai-preferences')
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({ companion: true, notice_version: 1, available: false })
    // A change still saves, and its answer says the same.
    const saved = await paused.as(user).put('/v1/me/ai-preferences', { cashback_tips: true })
    expect(saved.status).toBe(200)
    expect(await saved.json()).toMatchObject({ companion: true, cashback_tips: true, available: false })
    // Open again, AI is available, and the change was kept.
    const open = await startV1(OPEN, { transport: model.transport })
    expect(await (await open.as(user).get('/v1/me/ai-preferences')).json()).toMatchObject({ companion: true, cashback_tips: true, available: true })
    // With the gate open, AI still needs a configured model.
    const unconfigured = await startV1(OPEN, { transport: null })
    expect(await (await unconfigured.as(user).get('/v1/me/ai-preferences')).json()).toMatchObject({ available: false })
    expect(model.calls).toHaveLength(0)
  })

  it('pausing writes leaves AI open, and pausing ai leaves writes open', async () => {
    const user = await consenting()
    const writesPaused = await startV1(WRITES_PAUSED, { transport: model.transport })
    const refused = await writesPaused.as(user).post('/v1/wallets', aWallet())
    expect(refused.status).toBe(503)
    expect(await refused.json()).toMatchObject({ code: 'WRITES_PAUSED' })
    // Bun still reads a sentence while writes are paused, and AI says it is available.
    model.push(json({ drafts: [] }))
    expect((await writesPaused.as(user).post('/v1/ai/parse', { text: 'กาแฟ 65', today, locale: 'th' })).status).toBe(200)
    expect(model.calls).toHaveLength(1)
    expect((await (await writesPaused.as(user).get('/v1/me/ai-preferences')).json()).available).toBe(true)
    // Pausing ai leaves writes open.
    const aiPaused = await startV1(AI_PAUSED, { transport: model.transport })
    expect((await aiPaused.as(user).post('/v1/wallets', aWallet())).status).toBe(201)
  })
})
