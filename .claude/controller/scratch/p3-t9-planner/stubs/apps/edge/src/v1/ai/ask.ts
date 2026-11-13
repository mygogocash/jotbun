// RED stub (P3-T9): the plan's interface, holding today's Ask Bun as the route
// ran it before this task: one Haiku conversation, where a refusal, a cut-short
// answer and a turn the deadline never let start are failures and an empty
// answer is not grounded, and no Opus.
import type Anthropic from '@anthropic-ai/sdk'
import type { AiFigure, AiLocale, AiModel } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import { failureName } from '@api/common/operational-metrics'

import { figuresText } from '../../server/ai/fact-text'
import { AllowedNumbers, isGrounded } from '../../server/ai/grounding'
import { finishedText } from '../../server/ai/model'
import type { ModelMessage } from '../../server/ai/model'
import { ASK_SYSTEM } from '../../server/ai/prompts'
import type { Allowance } from '../../vault/ai'
import { HAIKU, HAIKU_ASK_CAP_MS, OPUS, haikuRequest, opusRequest } from './models'
import type { ModelTier } from './models'
import { ASK_TOOLS } from './tools'
import { callFailure, tracedSend } from './transport'
import type { AiDeadline, AiTrace, CallFailure, ModelTransport } from './transport'

export const ASK_MAX_TURNS = 5

export type AskOutcome =
  | { kind: 'grounded'; answer: string; figures: AiFigure[] }
  | { kind: 'ungrounded' | 'declined' | 'no_answer'; figures: AiFigure[] }
  | { kind: 'failed'; failure: CallFailure; figures: AiFigure[] }

export type AskDeps = {
  transport: ModelTransport
  trace: AiTrace
  deadline: AiDeadline
  tool(name: string, input: Record<string, unknown>): Promise<{ result: unknown; figures: AiFigure[]; allow: Allowance } | { error: string }>
}

export async function runAskConversation(
  tier: ModelTier,
  input: { question: string; today: string; locale: AiLocale; categories: readonly { id: string; name: string | null }[] },
  deps: AskDeps,
): Promise<AskOutcome> {
  const allowed = new AllowedNumbers().addDate(input.today)
  const figures: AiFigure[] = []
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: 'user', content: JSON.stringify({ question: input.question, today: input.today, locale: input.locale, categories: input.categories }) },
  ]
  const base = tier === OPUS ? opusRequest('medium', 12_000) : haikuRequest('medium', 12_000)
  for (let turn = 0; turn < ASK_MAX_TURNS; turn += 1) {
    let message: ModelMessage
    try {
      message = await tracedSend(deps.transport, deps.trace, deps.deadline, { feature: 'ask', escalated: tier === OPUS, params: { ...base, system: ASK_SYSTEM, tools: ASK_TOOLS, messages } })
    } catch (error) {
      logFallback(error)
      return { kind: 'failed', failure: callFailure(error), figures }
    }
    if (message.stop_reason !== 'tool_use') {
      let answer: string
      try {
        answer = finishedText(message).trim()
      } catch (error) {
        logFallback(error)
        return { kind: 'failed', failure: callFailure(error), figures }
      }
      return answer && isGrounded(answer, allowed) ? { kind: 'grounded', answer, figures } : { kind: 'ungrounded', figures }
    }
    messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] })
    const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = []
    for (const block of message.content) {
      if (block.type !== 'tool_use') continue
      let run: Awaited<ReturnType<AskDeps['tool']>>
      try {
        run = await deps.tool(block.name, (block.input ?? {}) as Record<string, unknown>)
      } catch (error) {
        if (error instanceof ProblemException && error.getStatus() !== 500) throw error
        logFallback(error)
        return { kind: 'failed', failure: callFailure(error), figures }
      }
      if ('error' in run) {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: run.error, is_error: true })
        continue
      }
      figures.push(...run.figures)
      for (const minor of run.allow.satang) allowed.addSatang(minor)
      for (const count of run.allow.counts) allowed.addCount(count)
      for (const date of run.allow.dates) allowed.addDate(date)
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(run.result) })
    }
    messages.push({ role: 'user', content: results })
  }
  return { kind: 'no_answer', figures }
}

export async function askWithEscalation(
  input: Parameters<typeof runAskConversation>[1],
  deps: AskDeps,
): Promise<{ answer: string; figures: AiFigure[]; source: 'ai' | 'facts'; model: AiModel; escalated: boolean } | { paused: true }> {
  const haiku = await runAskConversation(HAIKU, input, { ...deps, deadline: deps.deadline.child(HAIKU_ASK_CAP_MS) })
  if (haiku.kind === 'grounded') return { answer: haiku.answer, figures: haiku.figures, source: 'ai', model: HAIKU, escalated: false }
  if (haiku.kind === 'failed' && haiku.figures.length === 0) return { paused: true }
  return { answer: figuresText(haiku.figures, input.locale), figures: haiku.figures, source: 'facts', model: 'rules', escalated: false }
}

function logFallback(error: unknown): void {
  console.warn(JSON.stringify({ level: 'warn', event: 'ai_fallback', feature: 'ask', failure: failureName(error) }))
}
