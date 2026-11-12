// P3-T6: the AI contract's models and timings (H1, H3, H4), and each model's request base (H2).
import { AI_FEATURES, AI_MODELS, AI_PHONE_TIMEOUT_MS, AI_ROUTE_DEADLINE_MS } from '@gogospend/contracts'
import { describe, expect, it } from 'vitest'

import { HAIKU, OPUS, haikuRequest, opusRequest } from '../src/v1/ai/models'

describe('the AI contract and the two models', () => {
  it("every phone timeout outwaits its route's deadline by 5 seconds, and a slip's by 15", () => {
    expect(AI_ROUTE_DEADLINE_MS).toEqual({ parse: 15_000, slip: 45_000, note: 10_000, ask: 55_000 })
    expect(AI_PHONE_TIMEOUT_MS).toEqual({ parse: 20_000, slip: 60_000, note: 15_000, ask: 60_000 })
    const margins = Object.fromEntries(AI_FEATURES.map((feature) => [feature, AI_PHONE_TIMEOUT_MS[feature] - AI_ROUTE_DEADLINE_MS[feature]]))
    expect(margins).toEqual({ parse: 5_000, slip: 15_000, note: 5_000, ask: 5_000 })
  })

  it('the models are Haiku 5.5, Opus 5.5 and rules', () => {
    expect(AI_MODELS).toEqual(['claude-haiku-5-5', 'claude-opus-5-5', 'rules'])
    expect([HAIKU, OPUS]).toEqual(['claude-haiku-5-5', 'claude-opus-5-5'])
  })

  it("Haiku's request base has no betas or fallbacks, and Opus's keeps the fallback beta and fallbacks: 'default'", () => {
    expect(haikuRequest('low', 8_000)).toEqual({ model: 'claude-haiku-5-5', max_tokens: 8_000, output_config: { effort: 'low' } })
    expect(haikuRequest('medium', 12_000)).toEqual({ model: 'claude-haiku-5-5', max_tokens: 12_000, output_config: { effort: 'medium' } })
    expect(opusRequest('medium', 8_000)).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 8_000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
    })
  })
})
