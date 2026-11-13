// P3-T9: Ask Bun's conversations alone, in Node, with a scripted model and a
// fake tool (no vault, no network). First the plan's case: on a fake clock, a
// slow Haiku conversation is cut at its 25 s and Opus, asked again with the
// rest of the route's 55 s, still answers (H3, D28). Then how one conversation
// ends (runAskConversation), which decides whether Opus is asked (D28, H7).
import type { AiFigure } from '@gogospend/contracts'
import { describe, expect, it, vi } from 'vitest'

import { ProblemException } from '@api/common/api-problem.filter'

import type { ModelMessage } from '../src/server/ai/model'
import { ASK_MAX_TURNS, askWithEscalation, runAskConversation } from '../src/v1/ai/ask'
import type { AskDeps, AskOutcome } from '../src/v1/ai/ask'
import { HAIKU, OPUS } from '../src/v1/ai/models'
import { AiDeadline, newTrace } from '../src/v1/ai/transport'
import type { ModelTransport } from '../src/v1/ai/transport'
import { apiFailure, fakeModel, refusal, text, toolUse } from './support/fake-model'

/** 10:00 on 12 November 2026 in Bangkok. */
const NOW = Date.parse('2026-11-12T03:00:00.000Z')
const FOOD = '2c000000-0000-4000-8000-000000000001'
const input = { question: 'เดือนนี้กินไปเท่าไหร่', today: '2026-11-12', locale: 'th' as const, categories: [{ id: FOOD, name: 'food' }] }
/** What the fake tool reads every time: ฿60 over one food record this month. */
const FIGURE: AiFigure = { label: 'อาหาร', amount_minor: '6000', count: 1, scope: { from: '2026-11-01', through: '2026-11-12', type: 'expense', category_id: FOOD } }
/** The vault's tool, faked: it reads FIGURE and allows its amount and count. */
const tool: AskDeps['tool'] = async () => ({ result: { total_say: '฿60', count: 1 }, figures: [FIGURE], allow: { satang: ['6000'], counts: [1], dates: [] } })
const total = () => toolUse('spending_total', { from: '2026-11-01', through: '2026-11-12', type: 'expense', category_id: FOOD })
const GROUNDED = 'เดือนนี้ใช้กับอาหารไป ฿60'

describe("Ask Bun's deadline", () => {
  it('a slow Haiku conversation is cut at 25 s and Opus still answers', async () => {
    const clock = { ms: NOW }
    const given: { model: string; timeoutMs: number }[] = []
    const transport: ModelTransport = {
      async send(params, options): Promise<ModelMessage> {
        given.push({ model: params.model, timeoutMs: options.timeoutMs })
        // Each Haiku tool turn takes 12 s. Opus reads the total at once, then answers with it.
        if (params.model === HAIKU) {
          clock.ms += 12_000
          return total()
        }
        return given.filter((call) => call.model === OPUS).length === 1 ? total() : text(GROUNDED)
      },
    }
    const trace = newTrace()
    const answer = await askWithEscalation(input, { transport, trace, deadline: new AiDeadline(55_000, () => clock.ms), tool })
    expect(answer).toEqual({ answer: GROUNDED, figures: [FIGURE], source: 'ai', model: OPUS, escalated: true })
    // Two 12 s turns use 24 of Haiku's 25 s, so its third cannot start; Opus is given the 31 s left of the route's 55.
    expect(given).toEqual([
      { model: HAIKU, timeoutMs: 25_000 },
      { model: HAIKU, timeoutMs: 13_000 },
      { model: OPUS, timeoutMs: 31_000 },
      { model: OPUS, timeoutMs: 31_000 },
    ])
    // The trace keeps every call, the turn that never started included, and marks Opus's as escalated (P3-T10 reads them).
    expect(trace.calls.map(({ requested, escalated, sent, failure }) => [requested, escalated, sent, failure])).toEqual([
      [HAIKU, false, true, null],
      [HAIKU, false, true, null],
      [HAIKU, false, false, 'timeout'],
      [OPUS, true, true, null],
      [OPUS, true, true, null],
    ])
  })
})

describe('how one conversation ends (D28)', () => {
  /** One Haiku conversation over the scripted replies, under 25 s of the real clock unless `deps` says otherwise. */
  async function conversation(replies: Parameters<typeof fakeModel>[0], deps: Partial<AskDeps> = {}) {
    const model = fakeModel(replies)
    const outcome = await runAskConversation(HAIKU, input, { transport: model.transport, trace: newTrace(), deadline: new AiDeadline(25_000), tool, ...deps })
    return { outcome, model }
  }

  const rows: [string, Parameters<typeof fakeModel>[0], AskOutcome][] = [
    ['a grounded answer', [total(), text(GROUNDED)], { kind: 'grounded', answer: GROUNDED, figures: [FIGURE] }],
    ['an answer with a number no tool read', [total(), text('เดือนนี้ใช้ไป ฿999')], { kind: 'ungrounded', figures: [FIGURE] }],
    ['a refusal', [total(), refusal()], { kind: 'declined', figures: [FIGURE] }],
    ['an answer cut short', [text('เดือนนี้ใช้กับอาหาร', 'max_tokens')], { kind: 'no_answer', figures: [] }],
    ['an empty answer', [text('  ')], { kind: 'no_answer', figures: [] }],
    ['five tool turns', [total(), total(), total(), total(), total()], { kind: 'no_answer', figures: [FIGURE, FIGURE, FIGURE, FIGURE, FIGURE] }],
    ['an outage', [total(), apiFailure(529)], { kind: 'failed', failure: 'server_error', figures: [FIGURE] }],
    ['a request the API rejected', [apiFailure(400)], { kind: 'failed', failure: 'rejected', figures: [] }],
  ]
  it.each(rows)('%s', async (_what, replies, expected) => {
    const { outcome, model } = await conversation(replies)
    expect(outcome).toEqual(expected)
    expect(model.left()).toBe(0)
  })

  it('takes five turns at most', () => {
    expect(ASK_MAX_TURNS).toBe(5)
  })

  it('a turn the deadline never let start is no answer, recorded as never sent', async () => {
    const trace = newTrace()
    const { outcome, model } = await conversation([], { trace, deadline: new AiDeadline(1_500) })
    expect(outcome).toEqual({ kind: 'no_answer', figures: [] })
    expect(model.calls).toHaveLength(0)
    expect(trace.calls).toMatchObject([{ requested: HAIKU, sent: false, failure: 'timeout' }])
  })

  it('a tool step that failed ends the conversation as a failure, logged by name; a vault refusal is thrown on as the answer', async () => {
    const failing: AskDeps['tool'] = async () => {
      throw new ProblemException(500, 'INTERNAL_ERROR')
    }
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      await expect(conversation([total()], { tool: failing })).resolves.toMatchObject({ outcome: { kind: 'failed', failure: 'other', figures: [] } })
      expect(warnings.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([{ level: 'warn', event: 'ai_fallback', feature: 'ask', failure: 'ProblemException' }])
    } finally {
      warnings.mockRestore()
    }
    const refusing: AskDeps['tool'] = async () => {
      throw new ProblemException(401, 'SESSION_REQUIRED')
    }
    const thrown = await conversation([total()], { tool: refusing }).catch((error: unknown) => error)
    expect(thrown).toBeInstanceOf(ProblemException)
    expect(thrown).toMatchObject({ code: 'SESSION_REQUIRED' })
  })
})
