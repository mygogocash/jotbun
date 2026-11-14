import type Anthropic from '@anthropic-ai/sdk'
import type { AiFigure, AiLocale, AiModel } from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import { failureName } from '@api/common/operational-metrics'

import { figuresText } from '../../server/ai/fact-text'
import { AllowedNumbers, isGrounded } from '../../server/ai/grounding'
import { ModelUnavailable, finishedText } from '../../server/ai/model'
import type { ModelMessage } from '../../server/ai/model'
import { ASK_SYSTEM } from '../../server/ai/prompts'
import type { Allowance } from '../../vault/ai'
import { HAIKU, HAIKU_ASK_CAP_MS, OPUS, haikuRequest, opusRequest } from './models'
import type { ModelTier } from './models'
import { ASK_TOOLS } from './tools'
import { DeadlinePassed, callFailure, tracedSend } from './transport'
import type { AiDeadline, AiTrace, CallFailure, ModelTransport } from './transport'

// Ask Bun with D28's escalation (P3-T9, H7). Haiku 5.5 answers first, its
// whole conversation under HAIKU_ASK_CAP_MS of the route's deadline (H3). When
// its answer fails the grounding check, it declines, or it ends without an
// answer (the turn limit, a cut-short or empty answer, or a turn the deadline
// never let start), Opus 5.5 is asked again in a fresh conversation: the
// person's question alone, as Haiku first saw it, with the same system and
// tools and what is left of the deadline. Nothing of Haiku's turns reaches
// Opus. An outage never escalates. When neither model's words can be shown,
// the plain figures answer: Opus's, else Haiku's. This module counts no use
// and gives none back: the service does (H5, R116).

/** The tool turns one conversation may take before it must answer (AiService's ASK_MAX_TURNS). */
export const ASK_MAX_TURNS = 5

/** How one conversation ended, with every figure its tools read. */
export type AskOutcome =
  | { kind: 'grounded'; answer: string; figures: AiFigure[] }
  | { kind: 'ungrounded' | 'declined' | 'no_answer'; figures: AiFigure[] }
  | { kind: 'failed'; failure: CallFailure; figures: AiFigure[] }

export type AskDeps = {
  transport: ModelTransport
  trace: AiTrace
  deadline: AiDeadline
  /** One read-only tool, run in the vault: its result, its figures and the numbers it allows, or the input's refusal. */
  tool(name: string, input: Record<string, unknown>): Promise<{ result: unknown; figures: AiFigure[]; allow: Allowance } | { error: string }>
}

/**
 * One conversation with `tier` (today's Ask Bun loop, P3-T9): at most
 * ASK_MAX_TURNS turns, its own AllowedNumbers and figures. A grounded text is
 * `grounded`, any other text `ungrounded`; a refusal is `declined`; the turn
 * limit, a cut-short or empty answer, or a turn the deadline never let start
 * (DeadlinePassed) is `no_answer`; any other failed call is `failed`. A vault
 * refusal at a tool step (a session that ended, a newer policy) is thrown on as
 * the route's answer; a tool step that failed ends the conversation as `failed`.
 */
export async function runAskConversation(
  tier: ModelTier,
  input: { question: string; today: string; locale: AiLocale; categories: readonly { id: string; name: string | null }[] },
  deps: AskDeps,
): Promise<AskOutcome> {
  const allowed = new AllowedNumbers().addDate(input.today)
  const figures: AiFigure[] = []
  // The person's question as both models first see it: an Opus conversation starts here too, with nothing of Haiku's.
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
      // A turn the deadline never let start is no answer; any other failed call is an outage or a rejection (H7).
      return error instanceof DeadlinePassed ? { kind: 'no_answer', figures } : { kind: 'failed', failure: callFailure(error), figures }
    }
    if (message.stop_reason !== 'tool_use') return finished(message, allowed, figures)
    messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] })
    const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = []
    for (const block of message.content) {
      if (block.type !== 'tool_use') continue
      let run: Awaited<ReturnType<AskDeps['tool']>>
      try {
        run = await deps.tool(block.name, (block.input ?? {}) as Record<string, unknown>)
      } catch (error) {
        // A refusal (any problem but a 500) is the route's answer; a step that failed is a failure, as a database error was.
        if (error instanceof ProblemException && error.getStatus() !== 500) throw error
        logFallback(error)
        return { kind: 'failed', failure: callFailure(error), figures }
      }
      if ('error' in run) {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: run.error, is_error: true })
        continue
      }
      figures.push(...run.figures)
      allowAll(allowed, run.allow)
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(run.result) })
    }
    messages.push({ role: 'user', content: results })
  }
  return { kind: 'no_answer', figures }
}

/**
 * Ask Bun (D28, H7): Haiku under HAIKU_ASK_CAP_MS of the deadline; a grounded
 * answer is Haiku's. An ungrounded, declined or unfinished one starts Opus from
 * scratch under what is left of the deadline (`escalated: true`), and Opus's
 * grounded answer is Opus's. Otherwise the plain figures answer (`model:
 * 'rules'`): Opus's, else Haiku's, or Bun's could-not-find line when neither
 * conversation read any. A failed Haiku never reaches Opus. Only when the
 * conversation that ended the request failed and no figure was read is there
 * nothing to answer with (`{ paused: true }`, 503 AI_PAUSED).
 */
export async function askWithEscalation(
  input: Parameters<typeof runAskConversation>[1],
  deps: AskDeps,
): Promise<{ answer: string; figures: AiFigure[]; source: 'ai' | 'facts'; model: AiModel; escalated: boolean } | { paused: true }> {
  // H3: every Haiku turn shares one child deadline, so Opus keeps the rest of the route's.
  const haiku = await runAskConversation(HAIKU, input, { ...deps, deadline: deps.deadline.child(HAIKU_ASK_CAP_MS) })
  if (haiku.kind === 'grounded') return { answer: haiku.answer, figures: haiku.figures, source: 'ai', model: HAIKU, escalated: false }
  if (haiku.kind === 'failed') return plainFigures(haiku, [], input.locale, false)
  const opus = await runAskConversation(OPUS, input, deps)
  if (opus.kind === 'grounded') return { answer: opus.answer, figures: opus.figures, source: 'ai', model: OPUS, escalated: true }
  return plainFigures(opus, haiku.figures, input.locale, true)
}

/** The plain figures (H4: no model's words): the last conversation's, else the earlier one's; nothing to answer with only after a failure with none. */
function plainFigures(
  last: AskOutcome,
  earlier: AiFigure[],
  locale: AiLocale,
  escalated: boolean,
): { answer: string; figures: AiFigure[]; source: 'facts'; model: 'rules'; escalated: boolean } | { paused: true } {
  const figures = last.figures.length > 0 ? last.figures : earlier
  if (last.kind === 'failed' && figures.length === 0) return { paused: true }
  return { answer: figuresText(figures, locale), figures, source: 'facts', model: 'rules', escalated }
}

/** How a turn that did not ask for a tool ended. */
function finished(message: ModelMessage, allowed: AllowedNumbers, figures: AiFigure[]): AskOutcome {
  let answer: string
  try {
    answer = finishedText(message).trim()
  } catch (error) {
    // finishedText throws ModelUnavailable only: a refusal is a decline; a cut-short answer is no answer.
    return error instanceof ModelUnavailable && error.reason === 'refusal' ? { kind: 'declined', figures } : { kind: 'no_answer', figures }
  }
  if (!answer) return { kind: 'no_answer', figures }
  return isGrounded(answer, allowed) ? { kind: 'grounded', answer, figures } : { kind: 'ungrounded', figures }
}

/** Replays a tool's allowed numbers into the conversation's AllowedNumbers, in the order the tool allowed them. */
function allowAll(allowed: AllowedNumbers, allow: Allowance): void {
  for (const minor of allow.satang) allowed.addSatang(minor)
  for (const count of allow.counts) allowed.addCount(count)
  for (const date of allow.dates) allowed.addDate(date)
}

/** One line per failed or unstarted call, by the failure's class name only (Global Constraints, Logging), as the service's logFailure writes it. */
function logFallback(error: unknown): void {
  console.warn(JSON.stringify({ level: 'warn', event: 'ai_fallback', feature: 'ask', failure: failureName(error) }))
}
