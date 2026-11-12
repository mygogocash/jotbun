import type { Effort, MessageParams } from '../../server/ai/model'

// The two models Bun reads with, fixed in code (H1, D25, D28): Haiku 5.5
// first, Opus 5.5 only when P3-T8's or P3-T9's escalation says so. Each has its
// own request base (H2). Haiku's sets no betas and no fallbacks: a fallback
// list is a 400 on Haiku 5.5, and `fallbacks: 'default'` leaves a refusal
// refused. Opus keeps the server-side fallback beta and `fallbacks: 'default'`.
// Neither sets thinking or sampling, so each model's adaptive default stands,
// and the routes end every request with a user turn (no prefill).

export const HAIKU = 'claude-haiku-5-5'
export const OPUS = 'claude-opus-5-5'
export type ModelTier = typeof HAIKU | typeof OPUS
export type { Effort }

export function haikuRequest(effort: Effort, maxTokens: number): Pick<MessageParams, 'model' | 'max_tokens' | 'output_config'> {
  // RED stub (P3-T6): Haiku's base still names Opus.
  return { model: OPUS, max_tokens: maxTokens, output_config: { effort } }
}

export function opusRequest(effort: Effort, maxTokens: number): Pick<MessageParams, 'model' | 'max_tokens' | 'betas' | 'fallbacks' | 'output_config'> {
  return { model: OPUS, max_tokens: maxTokens, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort } }
}

/** Haiku's share of a slip read's deadline, so an Opus re-read keeps the rest (H3; P3-T8 passes it as `capMs`). */
export const HAIKU_SLIP_CAP_MS = 20_000
/** Haiku's share of Ask Bun's deadline, across all of its turns, so a fresh Opus conversation keeps the rest (H3). */
export const HAIKU_ASK_CAP_MS = 25_000
