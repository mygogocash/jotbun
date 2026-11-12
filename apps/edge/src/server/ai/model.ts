import Anthropic from '@anthropic-ai/sdk'

export type MessageParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming
export type ModelMessage = Anthropic.Beta.Messages.BetaMessage

/** A route's effort. Each model's request base is in src/v1/ai/models.ts (P3-T6). */
export type Effort = 'low' | 'medium' | 'high'

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
