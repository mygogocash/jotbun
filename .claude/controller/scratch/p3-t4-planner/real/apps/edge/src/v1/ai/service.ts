import type Anthropic from '@anthropic-ai/sdk'
import { bangkokDate } from '@gogospend/contracts'
import type {
  AiAskRequest,
  AiAskResult,
  AiFeature,
  AiFigure,
  AiLocale,
  AiNoteResult,
  AiParseRequest,
  AiParseResult,
  AiPreferencesDto,
  AiPreferencesUpdate,
  AiSlipRequest,
  AiSlipResult,
  BunFact,
} from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import { failureName } from '@api/common/operational-metrics'

import { draftFromRules, sanitizeDrafts } from '../../server/ai/drafts'
import type { DraftContext } from '../../server/ai/drafts'
import { factsText, figuresText } from '../../server/ai/fact-text'
import { AllowedNumbers, formatBaht, isGrounded } from '../../server/ai/grounding'
import { ModelUnavailable, finishedJson, finishedText, requestBase } from '../../server/ai/model'
import type { MessageParams } from '../../server/ai/model'
import { ASK_SYSTEM, NOTE_SCHEMA, NOTE_SYSTEM, PARSE_SCHEMA, PARSE_SYSTEM, SLIP_SCHEMA, SLIP_SYSTEM } from '../../server/ai/prompts'
import type { AiContext, AiStoredPreferences, AiToolReply, Allowance } from '../../vault/ai'
import type { VaultRouteId } from '../protocol'
import type { VaultSession } from '../worker-routes'
import { ASK_TOOLS } from './tools'
import { AiDeadline, newTrace, tracedSend } from './transport'
import type { ModelTransport } from './transport'

// The AI companion on the vault (1B-T7): the PostgreSQL edge's AiService (retired at C1)
// with its reads and writes moved into the caller's vault as steps. The order
// and the refusals are AiService's: consent, then the switch, then the day's
// use (counted before the model runs), then the model. Every step carries the
// route's access, so the vault checks the session (and the current policy on
// a current_policy route) before anything is read and before any model call.

/** Ask Bun's turns before it answers from the figures it read (AiService's ASK_MAX_TURNS). */
const ASK_MAX_TURNS = 5

/** The client's "today", unless it is more than a day from the server's Bangkok date (AiService's trustedToday). */
function trustedToday(clientToday: string, serverToday: string): string {
  const gap = Math.abs(Date.parse(`${clientToday}T00:00:00Z`) - Date.parse(`${serverToday}T00:00:00Z`))
  return Number.isFinite(gap) && gap <= 86_400_000 ? clientToday : serverToday
}

/** One vault step: its body, or its problem thrown as the ProblemException it carries. */
async function step<T>(vault: VaultSession, route: VaultRouteId, input?: { query?: Record<string, unknown>; body?: unknown }): Promise<T> {
  const reply = await vault.call(route, input)
  if (!reply.ok) throw new ProblemException(reply.status, reply.code, reply.problem)
  return reply.body as T
}

/** Replays a tool's allowed numbers into the answer's AllowedNumbers, in the order the tool allowed them. */
function allowAll(allowed: AllowedNumbers, allow: Allowance): void {
  for (const minor of allow.satang) allowed.addSatang(minor)
  for (const count of allow.counts) allowed.addCount(count)
  for (const date of allow.dates) allowed.addDate(date)
}

export type VaultAiServiceDeps = {
  /** Null when AI is not configured or switched off (AI_ENABLED, ANTHROPIC_API_KEY). */
  transport: ModelTransport | null
  model: string
  now?: () => Date
}

export class VaultAiService {
  private readonly now: () => Date

  constructor(private readonly deps: VaultAiServiceDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  get available(): boolean {
    return this.deps.transport !== null
  }

  async preferences(s: VaultSession): Promise<AiPreferencesDto> {
    return { ...(await step<AiStoredPreferences>(s, 'ai.preferences')), available: this.available }
  }

  async setPreferences(s: VaultSession, update: AiPreferencesUpdate): Promise<AiPreferencesDto> {
    return { ...(await step<AiStoredPreferences>(s, 'ai.setPreferences', { body: update })), available: this.available }
  }

  /** "Tell Bun": a sentence into drafts. Rules answer when AI is unavailable or unsure. */
  async parse(s: VaultSession, request: AiParseRequest): Promise<AiParseResult> {
    const ctx = await this.draftContext(s, request.today)
    const rules = (): AiParseResult => {
      const draft = draftFromRules(request.text, ctx)
      return { drafts: draft ? [draft] : [], source: 'rules' }
    }
    if (!this.deps.transport) return rules()
    await this.consume(s, 'parse')
    const trace = newTrace()
    const deadline = new AiDeadline(25_000)
    try {
      const message = await tracedSend(this.deps.transport, trace, deadline, {
        feature: 'parse',
        escalated: false,
        params: {
          ...requestBase(this.deps.model, 'low', 8_000),
          output_config: { effort: 'low', format: { type: 'json_schema', schema: PARSE_SCHEMA } },
          system: PARSE_SYSTEM,
          messages: [{ role: 'user', content: JSON.stringify({ sentence: request.text, today: ctx.today, locale: request.locale, ...this.choices(ctx) }) }],
        },
      })
      const drafts = sanitizeDrafts(finishedJson(message), ctx, request.text)
      return drafts.length > 0 ? { drafts, source: 'ai' } : rules()
    } catch (error) {
      this.logFailure('parse', error)
      return rules()
    }
  }

  /** A bank slip or receipt image into drafts. The image is never stored: it goes to the model and nowhere else. */
  async slip(s: VaultSession, request: AiSlipRequest): Promise<AiSlipResult> {
    const ctx = await this.draftContext(s, request.today)
    if (!this.deps.transport) throw this.paused()
    await this.consume(s, 'slip')
    const trace = newTrace()
    const deadline = new AiDeadline(25_000)
    try {
      const message = await tracedSend(this.deps.transport, trace, deadline, {
        feature: 'slip',
        escalated: false,
        params: {
          ...requestBase(this.deps.model, 'medium', 8_000),
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SLIP_SCHEMA } },
          system: SLIP_SYSTEM,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: request.media_type, data: request.image_base64 } },
                { type: 'text', text: JSON.stringify({ today: ctx.today, locale: request.locale, ...this.choices(ctx) }) },
              ],
            },
          ],
        },
      })
      const raw = finishedJson(message) as { bank?: unknown }
      const bank = typeof raw?.bank === 'string' && raw.bank.trim() ? raw.bank.trim().slice(0, 60) : null
      return { drafts: sanitizeDrafts(raw, ctx), bank, source: 'ai' }
    } catch (error) {
      this.logFailure('slip', error)
      throw this.paused()
    }
  }

  /**
   * Bun's daily note: facts from the vault, phrased by the model only when
   * every number it writes is one of those facts. Without AI, or when the
   * wording strays, the note is the plain facts.
   */
  async note(s: VaultSession, date: string, locale: AiLocale): Promise<AiNoteResult> {
    const today = trustedToday(date, bangkokDate(this.now()))
    const facts = await step<BunFact[]>(s, 'ai.facts', { query: { date: today } })
    const plain: AiNoteResult = { date: today, facts, text: factsText(facts, locale), source: 'facts' }
    if (!this.deps.transport || !(await this.hasConsent(s))) return plain
    const allowed = new AllowedNumbers().addDate(today)
    for (const fact of facts) {
      if (fact.amount_minor) allowed.addSatang(fact.amount_minor)
      for (const n of [fact.count, fact.days, fact.percent]) if (n !== undefined) allowed.addCount(n)
    }
    const trace = newTrace()
    const deadline = new AiDeadline(25_000)
    try {
      await this.consume(s, 'note')
      const message = await tracedSend(this.deps.transport, trace, deadline, {
        feature: 'note',
        escalated: false,
        params: {
          ...requestBase(this.deps.model, 'low', 4_000),
          output_config: { effort: 'low', format: { type: 'json_schema', schema: NOTE_SCHEMA } },
          system: NOTE_SYSTEM,
          messages: [{ role: 'user', content: JSON.stringify({ locale, date: today, facts: facts.map((f) => ({ ...f, say: f.amount_minor ? formatBaht(f.amount_minor) : undefined })) }) }],
        },
      })
      const text = String((finishedJson(message) as { text?: unknown })?.text ?? '').trim()
      if (!text || [...text].length > 200 || !isGrounded(text, allowed)) return plain
      return { date: today, facts, text, source: 'ai' }
    } catch (error) {
      if (error instanceof ProblemException) return plain
      this.logFailure('note', error)
      return plain
    }
  }

  /** Ask Bun: a question answered with read-only tools over the person's records, each run in the vault. */
  async ask(s: VaultSession, request: AiAskRequest): Promise<AiAskResult> {
    const ctx = await step<AiContext>(s, 'ai.context')
    if (!ctx.consent) throw new ProblemException(403, 'AI_CONSENT_REQUIRED')
    if (!this.deps.transport) throw this.paused()
    await this.consume(s, 'ask')
    const today = trustedToday(request.today, bangkokDate(this.now()))
    const categories = ctx.categories.map((category) => ({ id: category.id, name: category.label ?? category.builtin_key }))
    const allowed = new AllowedNumbers().addDate(today)
    const figures: AiFigure[] = []
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
      { role: 'user', content: JSON.stringify({ question: request.question, today, locale: request.locale, categories }) },
    ]
    const trace = newTrace()
    const deadline = new AiDeadline(25_000)
    try {
      for (let turn = 0; turn < ASK_MAX_TURNS; turn += 1) {
        const params: MessageParams = { ...requestBase(this.deps.model, 'medium', 12_000), system: ASK_SYSTEM, tools: ASK_TOOLS, messages }
        const message = await tracedSend(this.deps.transport, trace, deadline, {
          feature: 'ask',
          escalated: false,
          params,
        })
        if (message.stop_reason === 'tool_use') {
          messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] })
          const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = []
          for (const block of message.content) {
            if (block.type !== 'tool_use') continue
            const run = await step<AiToolReply>(s, 'ai.tool', { body: { name: block.name, input: block.input ?? {}, locale: request.locale } })
            if ('error' in run) {
              results.push({ type: 'tool_result', tool_use_id: block.id, content: run.error, is_error: true })
              continue
            }
            figures.push(...run.figures)
            allowAll(allowed, run.allow)
            results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(run.result) })
          }
          messages.push({ role: 'user', content: results })
          continue
        }
        const answer = finishedText(message).trim()
        if (answer && isGrounded(answer, allowed)) return { answer, figures, source: 'ai' }
        return { answer: figuresText(figures, request.locale), figures, source: 'facts' }
      }
      return { answer: figuresText(figures, request.locale), figures, source: 'facts' }
    } catch (error) {
      this.logFailure('ask', error)
      if (figures.length > 0) return { answer: figuresText(figures, request.locale), figures, source: 'facts' }
      throw this.paused()
    }
  }

  private paused(): ProblemException {
    return new ProblemException(503, 'AI_PAUSED', { retryAfterSeconds: 300 })
  }

  /** AiService's hasConsent: the stored companion choice, for the current notice only. */
  private async hasConsent(s: VaultSession): Promise<boolean> {
    return (await step<AiStoredPreferences>(s, 'ai.preferences')).companion
  }

  /** Counts one use before the model runs (the vault refuses with 429 at the day's limit). */
  private async consume(s: VaultSession, feature: AiFeature): Promise<void> {
    await step<unknown>(s, 'ai.consume', { body: { feature } })
  }

  /** AiService's requireConsent and draftContext in one step: consent first (403), then the lists a draft may name. */
  private async draftContext(s: VaultSession, clientToday: string): Promise<DraftContext> {
    const ctx = await step<AiContext>(s, 'ai.context')
    if (!ctx.consent) throw new ProblemException(403, 'AI_CONSENT_REQUIRED')
    return { today: trustedToday(clientToday, bangkokDate(this.now())), wallets: ctx.wallets, categories: ctx.categories }
  }

  /** What the model may choose from: ids with names, never balances or history. */
  private choices(ctx: DraftContext) {
    return {
      wallets: ctx.wallets.filter((w) => !w.archived).map((w) => ({ id: w.id, name: w.name })),
      categories: ctx.categories.filter((c) => !c.archived).map((c) => ({ id: c.id, type: c.type, name: c.label ?? c.builtin_key })),
    }
  }

  /**
   * A refusal (any problem but a 500) is the answer and is thrown on. Anything
   * else is a failure, logged by name, and the caller falls back: the model's,
   * or a vault step that failed with 500, as a database error failed
   * AiService's read.
   */
  private logFailure(feature: AiFeature, error: unknown): void {
    if (error instanceof ProblemException && error.getStatus() !== 500) throw error
    console.warn(JSON.stringify({ level: 'warn', event: 'ai_fallback', feature, failure: error instanceof ModelUnavailable ? `ModelUnavailable:${error.reason}` : failureName(error) }))
  }
}
