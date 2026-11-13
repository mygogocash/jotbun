// RED stub (P3-T8): the plan's interface. slipNeedsOpus says no, and
// readSlipImage makes one Haiku call, as the slip route did before this task.
import type { AiDraft, AiLocale, AiSlipMediaType, SlipKind } from '@gogospend/contracts'

import { sanitizeDrafts } from '../../server/ai/drafts'
import type { DraftContext } from '../../server/ai/drafts'
import { finishedJson } from '../../server/ai/model'
import type { ModelMessage } from '../../server/ai/model'
import { SLIP_SCHEMA, SLIP_SYSTEM } from '../../server/ai/prompts'
import { HAIKU, haikuRequest } from './models'
import type { ModelTier } from './models'
import { callFailure, tracedSend } from './transport'
import type { AiDeadline, AiTrace, CallFailure, ModelTransport } from './transport'

export type SlipImage = { base64: string; mediaType: AiSlipMediaType }

export type SlipRead = {
  kind: SlipKind
  drafts: AiDraft[]
  bank: string | null
  model: ModelTier
  escalated: boolean
  declined: boolean
  tokens: { input: number; output: number }
}

export class SlipNotRead extends Error {
  constructor(readonly failure: CallFailure) {
    super(`No model read the slip (${failure}).`)
    this.name = 'SlipNotRead'
  }
}

export type HaikuOutcome =
  | { kind: 'answer'; read: { kind: SlipKind; drafts: AiDraft[] } }
  | { kind: 'declined' }
  | { kind: 'unusable' }
  | { kind: 'failed'; failure: CallFailure }

export function slipNeedsOpus(_outcome: HaikuOutcome): boolean {
  return false
}

export async function readSlipImage(
  input: { image: SlipImage; context: DraftContext; locale: AiLocale },
  deps: { transport: ModelTransport; trace: AiTrace; deadline: AiDeadline },
): Promise<SlipRead> {
  let message: ModelMessage
  try {
    message = await tracedSend(deps.transport, deps.trace, deps.deadline, {
      feature: 'slip',
      escalated: false,
      params: {
        ...haikuRequest('medium', 8_000),
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SLIP_SCHEMA } },
        system: SLIP_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.base64 } },
              { type: 'text', text: JSON.stringify({ today: input.context.today, locale: input.locale }) },
            ],
          },
        ],
      },
    })
  } catch (error) {
    throw new SlipNotRead(callFailure(error))
  }
  const raw = finishedJson(message) as { bank?: unknown }
  const bank = typeof raw?.bank === 'string' && raw.bank.trim() ? raw.bank.trim().slice(0, 60) : null
  return { kind: 'slip', drafts: sanitizeDrafts(raw, input.context), bank, model: HAIKU, escalated: false, declined: false, tokens: { input: 0, output: 0 } }
}
