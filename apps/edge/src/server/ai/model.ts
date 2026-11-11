import Anthropic from '@anthropic-ai/sdk'

export type MessageParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming
export type ModelMessage = Anthropic.Beta.Messages.BetaMessage

/** D19: the default model; AI_MODEL can choose another after measuring. */
export const DEFAULT_AI_MODEL = 'claude-opus-5-5'

export type Effort = 'low' | 'medium' | 'high'

/**
 * Settings every request shares: the model, server-side refusal fallbacks
 * (a declined request is retried on Anthropic's recommended model for that
 * category instead of failing) and the route's effort. Thinking is left to
 * the model's adaptive default.
 */
export function requestBase(model: string, effort: Effort, maxTokens: number): Pick<MessageParams, 'model' | 'max_tokens' | 'betas' | 'fallbacks' | 'output_config'> {
  return {
    model,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort },
  }
}

export class ModelUnavailable extends Error {
  constructor(readonly reason: 'refusal' | 'truncated' | 'malformed' | 'failed') {
    super(`The model did not produce a usable answer (${reason}).`)
    this.name = 'ModelUnavailable'
  }
}

/** The text of a finished message; refusals and truncated answers are never used. */
export function finishedText(message: ModelMessage): string {
  if (message.stop_reason === 'refusal') throw new ModelUnavailable('refusal')
  if (message.stop_reason === 'max_tokens') throw new ModelUnavailable('truncated')
  return message.content
    .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

/** A structured-output answer parsed from its JSON text. */
export function finishedJson(message: ModelMessage): unknown {
  const text = finishedText(message)
  try {
    return JSON.parse(text)
  } catch {
    throw new ModelUnavailable('malformed')
  }
}
