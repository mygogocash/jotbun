// P3-T7: a failed model call gives its use back (B5, read as H5 with A14). A
// use is counted before the first call; when the request ends without a model
// answer and its last call failed with a rate limit, a 5xx, a timeout or no
// connection, the use goes back to the day it was counted on before the route
// answers. A decline, an unusable or ungrounded answer and any other failure
// spend it. The cases count `remaining` (GET /v1/me/ai-preferences) or the
// vault's own rows. No network: every model reply is scripted. R116 (P3-T9): a
// last turn the deadline never let start gives the use back only when no call
// before it answered.
import { env } from 'cloudflare:workers'
import { randomUUID } from 'node:crypto'

import { AI_DAILY_LIMITS, bangkokDate } from '@gogospend/contracts'
import type { AiFeature } from '@gogospend/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CallFailure, ModelTransport, RecordedCall } from '../../src/v1/ai/transport'
import { shouldRefund } from '../../src/v1/ai/uses'
import type { VaultClaims } from '../../src/v1/protocol'
import { vaultSession } from '../../src/v1/worker-routes'
import { consumeAi, refundAi } from '../../src/vault/ai'
import { VAULT_HANDLERS } from '../../src/vault/routes'
import { apiFailure, fakeModel, hang, refusal, text, toolUse } from '../support/fake-model'
import { inVault } from './support/command-fixtures'
import { setVaultClock, vaultExec, vaultRows } from './support/files'
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
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const body = async (res: Response) => res.json()

/** A member who agreed to the AI notice. */
async function consenting(): Promise<TestUser> {
  const user = await member(client)
  expect((await client.as(user).put('/v1/me/ai-preferences', { companion: true, notice_version: 1 })).status).toBe(200)
  return user
}

/** A consenting member with a cash wallet, the built-in categories and one ฿60 lunch today. */
async function withLunch(): Promise<{ user: TestUser; food: string }> {
  const user = await consenting()
  const cash = randomUUID()
  expect((await client.as(user).post('/v1/wallets', { id: cash, name: 'เงินสด', opening_minor: '100000', tracking_start: '2026-01-01' })).status).toBe(201)
  const categories = (await body(await client.as(user).post('/v1/categories/builtins'))) as { id: string; builtin_key: string | null }[]
  const food = categories.find((category) => category.builtin_key === 'food')?.id
  if (!food) throw new Error('the built-in categories have no food')
  expect((await client.as(user).post('/v1/transactions', { id: randomUUID(), type: 'expense', amount_minor: '6000', occurred_on: today, wallet_id: cash, category_id: food })).status).toBe(201)
  return { user, food }
}

const remaining = async (user: TestUser): Promise<Record<AiFeature, number>> => (await body(await client.as(user).get('/v1/me/ai-preferences'))).remaining
const usage = (user: TestUser) => vaultRows(user, 'SELECT day, feature, uses FROM ai_usage ORDER BY day, feature')
const parse = (as: V1Client, user: TestUser) => as.as(user).post('/v1/ai/parse', { text: 'ข้าวผัด 45', today, locale: 'th' })
const slip = (as: V1Client, user: TestUser) => as.as(user).post('/v1/ai/slip', { image_base64: tinyPng, media_type: 'image/png', today, locale: 'th' })
const ask = (user: TestUser) => client.as(user).post('/v1/ai/ask', { question: 'how much on food?', today, locale: 'en' })

describe('a failed model call gives its use back', () => {
  it('a parse whose Haiku call is rate limited answers by the rules and gives the use back', async () => {
    const user = await consenting()
    model.push(apiFailure(429, { 'retry-after': '40' }))
    const res = await parse(client, user)
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({ source: 'rules', model: 'rules', escalated: false, drafts: [{ amount_minor: '4500' }] })
    expect((await remaining(user)).parse).toBe(AI_DAILY_LIMITS.parse)
  })

  it('a parse Haiku declines answers by the rules and spends the use', async () => {
    const user = await consenting()
    model.push(refusal())
    expect(await body(await parse(client, user))).toMatchObject({ source: 'rules', model: 'rules', escalated: false })
    expect((await remaining(user)).parse).toBe(AI_DAILY_LIMITS.parse - 1)
  })

  it('a slip read whose Haiku call is overloaded is 503 AI_PAUSED and gives the use back', async () => {
    const user = await consenting()
    model.push(apiFailure(529))
    const res = await slip(client, user)
    expect(res.status).toBe(503)
    expect(await body(res)).toMatchObject({ code: 'AI_PAUSED', retry_after_seconds: 300 })
    expect((await remaining(user)).slip).toBe(AI_DAILY_LIMITS.slip)
  })

  it('a note whose Haiku call times out gives plain facts and the use back', async () => {
    // Review Focus 2: a model that never answers. The call ends when the note's (short) deadline is up.
    const user = await consenting()
    model.push(hang())
    const timed = await startV1(undefined, { transport: model.transport, aiDeadlines: { note: 2_500 } })
    const started = Date.now()
    const res = await timed.as(user).get(`/v1/ai/note?date=${today}&locale=th`)
    const ms = Date.now() - started
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({ date: today, source: 'facts', model: 'rules', escalated: false })
    expect(ms).toBeLessThan(4_000)
    expect((await remaining(user)).note).toBe(AI_DAILY_LIMITS.note)
  })

  it('an ask that loses its second turn to a 500 answers with its figures and gives the use back', async () => {
    const { user, food } = await withLunch()
    model.push(toolUse('spending_total', { from: monthStart, through: today, type: 'expense', category_id: food }), apiFailure(500))
    const res = await ask(user)
    expect(res.status).toBe(200)
    expect(await body(res)).toMatchObject({ source: 'facts', model: 'rules', escalated: false, figures: [{ amount_minor: '6000' }] })
    expect((await remaining(user)).ask).toBe(AI_DAILY_LIMITS.ask)
  })

  it('an ungrounded answer spends the use', async () => {
    const { user, food } = await withLunch()
    // D28 (P3-T9): Haiku's ungrounded answer goes to Opus, whose answer strays as well; the question counts once.
    model.push(toolUse('spending_total', { from: monthStart, through: today, type: 'expense', category_id: food }), text('You spent about ฿9,999 on food.'), text('About ฿9,999 on food.'))
    const answer = await body(await ask(user))
    expect(answer).toMatchObject({ source: 'facts', model: 'rules', escalated: true, figures: [{ amount_minor: '6000' }] })
    expect(answer.answer).not.toContain('9,999')
    expect((await remaining(user)).ask).toBe(AI_DAILY_LIMITS.ask - 1)
  })

  it('a refund touches only the day it was counted on, and never goes below zero', async () => {
    const user = await member(client)
    // 23:59:59 in Bangkok on 10 November 2026, then 00:00:05 on the 11th.
    const beforeMidnight = new Date(Date.parse('2026-11-10T16:59:59.000Z'))
    const afterMidnight = new Date(Date.parse('2026-11-10T17:00:05.000Z'))
    await vaultExec(user, "INSERT INTO ai_usage (day, feature, uses) VALUES ('2026-11-10', 'slip', 3), ('2026-11-10', 'parse', 2), ('2026-11-11', 'slip', 1)")
    const counted = await inVault(user, (c) => consumeAi({ ...c, now: beforeMidnight }, 'slip'))
    expect(counted).toEqual({ day: '2026-11-10' })
    // Given back after midnight: the day it was counted on drops by one; the new day and the other feature stay.
    await expect(inVault(user, (c) => refundAi({ ...c, now: afterMidnight }, 'slip', counted.day))).resolves.toBeUndefined()
    expect(await usage(user)).toEqual([
      { day: '2026-11-10', feature: 'parse', uses: 2 },
      { day: '2026-11-10', feature: 'slip', uses: 3 },
      { day: '2026-11-11', feature: 'slip', uses: 1 },
    ])
    // Never below zero: the new day's one use goes back, and a second refund changes nothing.
    for (let i = 0; i < 2; i += 1) await expect(inVault(user, (c) => refundAi({ ...c, now: afterMidnight }, 'slip', '2026-11-11'))).resolves.toBeUndefined()
    // No row, no change.
    await expect(inVault(user, (c) => refundAi({ ...c, now: afterMidnight }, 'note', '2026-11-11'))).resolves.toBeUndefined()
    expect(await usage(user)).toEqual([
      { day: '2026-11-10', feature: 'parse', uses: 2 },
      { day: '2026-11-10', feature: 'slip', uses: 3 },
      { day: '2026-11-11', feature: 'slip', uses: 0 },
    ])
  })
})

describe('the refund on the vault', () => {
  it('a use counted before Bangkok midnight goes back to that day when its call fails after midnight', async () => {
    const user = await consenting()
    // 23:59:59 in Bangkok on 10 November 2026, on the vault's clock.
    await setVaultClock(user, Date.parse('2026-11-10T16:59:59.000Z'))
    const transport: ModelTransport = {
      async send() {
        // The call outlasts midnight, then the model is overloaded.
        await setVaultClock(user, Date.parse('2026-11-10T17:00:05.000Z'))
        throw apiFailure(529)
      },
    }
    const late = await startV1(undefined, { transport })
    expect((await slip(late, user)).status).toBe(503)
    expect(await usage(user)).toEqual([{ day: '2026-11-10', feature: 'slip', uses: 0 }])
  })

  it('the use comes back even when the session ended while the model was asked', async () => {
    const user = await consenting()
    const transport: ModelTransport = {
      async send() {
        expect((await client.as(user).post('/v1/me/logout')).status).toBe(204)
        throw apiFailure(529)
      },
    }
    const asking = await startV1(undefined, { transport })
    expect((await slip(asking, user)).status).toBe(503)
    expect(await usage(user)).toEqual([{ day: today, feature: 'slip', uses: 0 }])
  })

  it('a refund the vault fails never changes the answer, and is logged by name only', async () => {
    const user = await consenting()
    const original = VAULT_HANDLERS['ai.refund']
    if (!original) throw new Error('the vault has no ai.refund step')
    VAULT_HANDLERS['ai.refund'] = () => {
      throw new Error('the vault write failed')
    }
    const warnings = vi.spyOn(console, 'warn')
    try {
      model.push(apiFailure(429))
      const res = await parse(client, user)
      expect(res.status).toBe(200)
      expect(await body(res)).toMatchObject({ source: 'rules', model: 'rules', escalated: false })
      const logged = warnings.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('"event":"ai_refund_failed"'))
      expect(logged.map((line) => JSON.parse(line))).toEqual([{ level: 'warn', event: 'ai_refund_failed', feature: 'parse', failure: 'ProblemException' }])
    } finally {
      VAULT_HANDLERS['ai.refund'] = original
      warnings.mockRestore()
    }
    expect((await remaining(user)).parse).toBe(AI_DAILY_LIMITS.parse - 1)
  })

  it("a slip's refund the vault fails never changes the 503, and is logged before the answer (the P3-T7 review's n1)", async () => {
    const user = await consenting()
    const original = VAULT_HANDLERS['ai.refund']
    if (!original) throw new Error('the vault has no ai.refund step')
    VAULT_HANDLERS['ai.refund'] = () => {
      throw new Error('the vault write failed')
    }
    const warnings = vi.spyOn(console, 'warn')
    try {
      // Haiku declines and Opus is overloaded (P3-T8): no model read the slip, so its use goes back, and that refund fails.
      model.push(refusal(), apiFailure(529))
      const res = await slip(client, user)
      // Read as soon as the answer is in: the refund ran before the route answered.
      const logged = warnings.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('"event":"ai_refund_failed"'))
      expect(res.status).toBe(503)
      expect(logged.map((line) => JSON.parse(line))).toEqual([{ level: 'warn', event: 'ai_refund_failed', feature: 'slip', failure: 'ProblemException' }])
    } finally {
      VAULT_HANDLERS['ai.refund'] = original
      warnings.mockRestore()
    }
    expect((await remaining(user)).slip).toBe(AI_DAILY_LIMITS.slip - 1)
  })

  it("one request gives its use back once, on every route (the P3-T7 second review's m1)", async () => {
    // Uses counted earlier share each row, so a second refund would show; P3-T8 adds the slip's escalation before its refund.
    const user = await consenting()
    await vaultExec(user, 'INSERT INTO ai_usage (day, feature, uses) VALUES (?, ?, 5), (?, ?, 5), (?, ?, 1), (?, ?, 5)', today, 'parse', today, 'slip', today, 'note', today, 'ask')
    const original = VAULT_HANDLERS['ai.refund']
    if (!original) throw new Error('the vault has no ai.refund step')
    const refunds: unknown[] = []
    VAULT_HANDLERS['ai.refund'] = (c, call) => {
      refunds.push(call.body)
      return original(c, call)
    }
    try {
      model.push(apiFailure(503), apiFailure(503), apiFailure(503), apiFailure(503))
      expect((await parse(client, user)).status).toBe(200)
      expect((await slip(client, user)).status).toBe(503)
      expect((await client.as(user).get(`/v1/ai/note?date=${today}&locale=th`)).status).toBe(200)
      expect((await ask(user)).status).toBe(503)
    } finally {
      VAULT_HANDLERS['ai.refund'] = original
    }
    expect(refunds).toEqual([
      { feature: 'parse', day: today },
      { feature: 'slip', day: today },
      { feature: 'note', day: today },
      { feature: 'ask', day: today },
    ])
    expect(await usage(user)).toEqual([
      { day: today, feature: 'ask', uses: 5 },
      { day: today, feature: 'note', uses: 1 },
      { day: today, feature: 'parse', uses: 5 },
      { day: today, feature: 'slip', uses: 5 },
    ])
  })

  it('the refund step names one of the four features and a day, or changes nothing', async () => {
    const user = await member(client)
    await vaultExec(user, "INSERT INTO ai_usage (day, feature, uses) VALUES ('2026-11-10', 'slip', 2)")
    const claims: VaultClaims = { accountId: user.sub, sessionId: user.sid, issuedAt: Math.floor(Date.now() / 1000), clientId: 'ios/1.0.0' }
    const refund = (input: unknown) => vaultSession(env, claims, TEST_POLICIES, 'bound_session', 'read').call('ai.refund', { body: input })
    expect(await refund({ feature: 'chat', day: '2026-11-10' })).toMatchObject({ ok: false, status: 500 })
    expect(await refund({ feature: 'slip', day: '10/11/2026' })).toMatchObject({ ok: false, status: 422, code: 'INVALID_DATE' })
    expect(await usage(user)).toEqual([{ day: '2026-11-10', feature: 'slip', uses: 2 }])
    expect(await refund({ feature: 'slip', day: '2026-11-10' })).toMatchObject({ ok: true, status: 200, body: {} })
    expect(await usage(user)).toEqual([{ day: '2026-11-10', feature: 'slip', uses: 1 }])
  })
})

describe('R116: a turn the deadline never let start (P3-T9)', () => {
  it("a question whose last turn the deadline never let start spends its use once a model answered (the P3-T7 review's PR4)", async () => {
    const { user, food } = await withLunch()
    let sent = 0
    const transport: ModelTransport = {
      async send() {
        sent += 1
        // The first turn answers after 2.2 s of a 4 s deadline, so no later turn can start with 2 s in hand.
        await new Promise((resolve) => setTimeout(resolve, 2_200))
        return toolUse('spending_total', { from: monthStart, through: today, type: 'expense', category_id: food })
      },
    }
    const slow = await startV1(undefined, { transport, aiDeadlines: { ask: 4_000 } })
    const res = await slow.as(user).post('/v1/ai/ask', { question: 'how much on food?', today, locale: 'en' })
    expect(res.status).toBe(200)
    // Haiku's second turn could not start, so the question went to Opus (D28), whose first turn could not start either: Haiku's figures answer.
    expect(await body(res)).toMatchObject({ source: 'facts', model: 'rules', escalated: true, figures: [{ amount_minor: '6000' }] })
    expect(sent).toBe(1)
    expect((await remaining(user)).ask).toBe(AI_DAILY_LIMITS.ask - 1)
  })

  it("a slip whose Opus re-read the deadline never let start spends its use once Haiku answered (the P3-T8 second review's PC2)", async () => {
    const user = await consenting()
    let sent = 0
    const transport: ModelTransport = {
      async send() {
        sent += 1
        // Haiku declines after 2.2 s of a 4 s deadline, so Opus cannot start with 2 s in hand.
        await new Promise((resolve) => setTimeout(resolve, 2_200))
        return refusal()
      },
    }
    const slow = await startV1(undefined, { transport, aiDeadlines: { slip: 4_000 } })
    const res = await slip(slow, user)
    expect(res.status).toBe(503)
    expect(await body(res)).toMatchObject({ code: 'AI_PAUSED' })
    expect(sent).toBe(1)
    expect((await remaining(user)).slip).toBe(AI_DAILY_LIMITS.slip - 1)
  })
})

describe('when a use comes back', () => {
  /** One recorded call that ended in `failure` (null: the model answered, whatever it said). */
  const call = (failure: CallFailure | null): RecordedCall => ({
    spanId: randomUUID(),
    feature: 'parse',
    requested: 'claude-haiku-5-5',
    model: 'claude-haiku-5-5',
    escalated: false,
    latencyMs: 1,
    sent: true,
    httpStatus: null,
    retryAfterSeconds: null,
    failure,
    stopReason: null,
    usage: null,
  })
  /** A turn the deadline never let start: recorded as a timeout that was never sent (P3-T4). */
  const unsent = (): RecordedCall => ({ ...call('timeout'), latencyMs: 0, sent: false })

  it('only when no model answered and the last call failed with a rate limit, a 5xx, a timeout or no connection', () => {
    const rows: [string, RecordedCall[], boolean, boolean][] = [
      ['no call', [], false, false],
      ['a call that answered (a decline, an unusable or ungrounded answer)', [call(null)], false, false],
      ['a rate limit', [call('rate_limited')], false, true],
      ['a 5xx', [call('server_error')], false, true],
      ['a timeout', [call('timeout')], false, true],
      ['no connection', [call('no_connection')], false, true],
      ['a request the API rejected', [call('rejected')], false, false],
      ['any other failure', [call('other')], false, false],
      ['a failed call, then one that answered', [call('rate_limited'), call(null)], false, false],
      ['a call that answered, then a failed one', [call(null), call('server_error')], false, true],
      ['a model answered before the last call failed (a draft kept, A14)', [call(null), call('server_error')], true, false],
      // R116 (P3-T9): a turn the deadline never let start.
      ['a turn the deadline never let start, with no call before it (the vault steps used the time)', [unsent()], false, true],
      ['a call that answered, then a turn the deadline never let start', [call(null), unsent()], false, false],
      ['a failed call, then a turn the deadline never let start', [call('rate_limited'), unsent()], false, true],
    ]
    for (const [what, calls, answeredByModel, refunds] of rows) expect(shouldRefund(calls, answeredByModel), what).toBe(refunds)
  })
})
