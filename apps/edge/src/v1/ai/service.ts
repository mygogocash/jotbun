import type Anthropic from '@anthropic-ai/sdk'
import { AI_ROUTE_DEADLINE_MS, bangkokDate } from '@gogospend/contracts'
import type {
  AiAskRequest,
  AiAskResult,
  AiFeature,
  AiFigure,
  AiLocale,
  AiModel,
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
import { ModelUnavailable, finishedJson, finishedText } from '../../server/ai/model'
import type { MessageParams } from '../../server/ai/model'
import { ASK_SYSTEM, NOTE_SCHEMA, NOTE_SYSTEM, PARSE_SCHEMA, PARSE_SYSTEM, SLIP_SCHEMA, SLIP_SYSTEM } from '../../server/ai/prompts'
import type { AiContext, AiStoredPreferences, AiToolReply, Allowance } from '../../vault/ai'
import type { VaultRouteId } from '../protocol'
import type { VaultSession } from '../worker-routes'
import { HAIKU, HAIKU_ASK_CAP_MS, haikuRequest } from './models'
import { ASK_TOOLS } from './tools'
import { AiDeadline, newTrace, tracedSend } from './transport'
import type { AiTrace, ModelTransport } from './transport'
import { shouldRefund } from './uses'

// The AI companion on the vault (1B-T7): the PostgreSQL edge's AiService (retired at C1)
// with its reads and writes moved into the caller's vault as steps. The order
// and the refusals are AiService's: consent, then the switch, then the day's
// use (counted before the model runs), then the model. Every step carries the
// route's access, so the vault checks the session (and the current policy on
// a current_policy route) before anything is read and before any model call.
// Since P3-T6 every call is Haiku 5.5's (models.ts), each request runs under
// one deadline (AI_ROUTE_DEADLINE_MS), and every result names its model (H4).
// Since P3-T7 a call that fails with a rate limit, a 5xx, a timeout or no
// connection gives its use back (H5, uses.ts) before the route answers.

/** Ask Bun's turns before it answers from the figures it read (AiService's ASK_MAX_TURNS). */
const ASK_MAX_TURNS = 5

/** Haiku wrote the words (H4). Every call here is Haiku's; escalation comes with P3-T8 and P3-T9. */
const BY_HAIKU: { model: AiModel; escalated: boolean } = { model: HAIKU, escalated: false }
/** The offline rules or the plain facts wrote them. */
const BY_RULES: { model: AiModel; escalated: boolean } = { model: 'rules', escalated: false }

/** A use the vault counted, on the Bangkok day it answered: the body of the step that gives it back (P3-T7). */
type CountedUse = { feature: AiFeature; day: string }

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
  /** The service's clock: the Bangkok day, and every route's deadline. */
  now?: () => Date
  /** Each route's deadline in ms, in place of AI_ROUTE_DEADLINE_MS's (tests give short ones). */
  deadlines?: Partial<Record<AiFeature, number>>
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
    const { trace, deadline } = this.start('parse')
    const ctx = await this.draftContext(s, request.today)
    const rules = (): AiParseResult => {
      const draft = draftFromRules(request.text, ctx)
      return { drafts: draft ? [draft] : [], source: 'rules', ...BY_RULES }
    }
    if (!this.deps.transport) return rules()
    const use = await this.consume(s, 'parse')
    try {
      const message = await tracedSend(this.deps.transport, trace, deadline, {
        feature: 'parse',
        escalated: false,
        params: {
          ...haikuRequest('low', 8_000),
          output_config: { effort: 'low', format: { type: 'json_schema', schema: PARSE_SCHEMA } },
          system: PARSE_SYSTEM,
          messages: [{ role: 'user', content: JSON.stringify({ sentence: request.text, today: ctx.today, locale: request.locale, ...this.choices(ctx) }) }],
        },
      })
      const drafts = sanitizeDrafts(finishedJson(message), ctx, request.text)
      return drafts.length > 0 ? { drafts, source: 'ai', ...BY_HAIKU } : rules()
    } catch (error) {
      this.logFailure('parse', error)
      await this.giveBack(s, use, trace)
      return rules()
    }
  }

  /** A bank slip or receipt image into drafts. The image is never stored: it goes to the model and nowhere else. */
  async slip(s: VaultSession, request: AiSlipRequest): Promise<AiSlipResult> {
    const { trace, deadline } = this.start('slip')
    const ctx = await this.draftContext(s, request.today)
    if (!this.deps.transport) throw this.paused()
    const use = await this.consume(s, 'slip')
    try {
      const message = await tracedSend(this.deps.transport, trace, deadline, {
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
                { type: 'image', source: { type: 'base64', media_type: request.media_type, data: request.image_base64 } },
                { type: 'text', text: JSON.stringify({ today: ctx.today, locale: request.locale, ...this.choices(ctx) }) },
              ],
            },
          ],
        },
      })
      const raw = finishedJson(message) as { bank?: unknown }
      const bank = typeof raw?.bank === 'string' && raw.bank.trim() ? raw.bank.trim().slice(0, 60) : null
      return { drafts: sanitizeDrafts(raw, ctx), bank, source: 'ai', ...BY_HAIKU }
    } catch (error) {
      this.logFailure('slip', error)
      await this.giveBack(s, use, trace)
      throw this.paused()
    }
  }

  /**
   * Bun's daily note: facts from the vault, phrased by the model only when
   * every number it writes is one of those facts. Without AI, or when the
   * wording strays, the note is the plain facts.
   */
  async note(s: VaultSession, date: string, locale: AiLocale): Promise<AiNoteResult> {
    const { trace, deadline } = this.start('note')
    const today = trustedToday(date, bangkokDate(this.now()))
    const facts = await step<BunFact[]>(s, 'ai.facts', { query: { date: today } })
    const plain: AiNoteResult = { date: today, facts, text: factsText(facts, locale), source: 'facts', ...BY_RULES }
    if (!this.deps.transport || !(await this.hasConsent(s))) return plain
    const allowed = new AllowedNumbers().addDate(today)
    for (const fact of facts) {
      if (fact.amount_minor) allowed.addSatang(fact.amount_minor)
      for (const n of [fact.count, fact.days, fact.percent]) if (n !== undefined) allowed.addCount(n)
    }
    let use: CountedUse | undefined
    try {
      use = await this.consume(s, 'note')
      const message = await tracedSend(this.deps.transport, trace, deadline, {
        feature: 'note',
        escalated: false,
        params: {
          ...haikuRequest('low', 4_000),
          output_config: { effort: 'low', format: { type: 'json_schema', schema: NOTE_SCHEMA } },
          system: NOTE_SYSTEM,
          messages: [{ role: 'user', content: JSON.stringify({ locale, date: today, facts: facts.map((f) => ({ ...f, say: f.amount_minor ? formatBaht(f.amount_minor) : undefined })) }) }],
        },
      })
      const text = String((finishedJson(message) as { text?: unknown })?.text ?? '').trim()
      if (!text || [...text].length > 200 || !isGrounded(text, allowed)) return plain
      return { date: today, facts, text, source: 'ai', ...BY_HAIKU }
    } catch (error) {
      if (error instanceof ProblemException) return plain
      this.logFailure('note', error)
      // No use when its step failed: then no call was made either.
      if (use) await this.giveBack(s, use, trace)
      return plain
    }
  }

  /** Ask Bun: a question answered with read-only tools over the person's records, each run in the vault. */
  async ask(s: VaultSession, request: AiAskRequest): Promise<AiAskResult> {
    const { trace, deadline } = this.start('ask')
    const ctx = await step<AiContext>(s, 'ai.context')
    if (!ctx.consent) throw new ProblemException(403, 'AI_CONSENT_REQUIRED')
    if (!this.deps.transport) throw this.paused()
    const use = await this.consume(s, 'ask')
    const today = trustedToday(request.today, bangkokDate(this.now()))
    const categories = ctx.categories.map((category) => ({ id: category.id, name: category.label ?? category.builtin_key }))
    const allowed = new AllowedNumbers().addDate(today)
    const figures: AiFigure[] = []
    const fromFigures = (): AiAskResult => ({ answer: figuresText(figures, request.locale), figures, source: 'facts', ...BY_RULES })
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
      { role: 'user', content: JSON.stringify({ question: request.question, today, locale: request.locale, categories }) },
    ]
    // Every Haiku turn shares one child deadline (H3): at most HAIKU_ASK_CAP_MS of the route's, so Opus keeps the rest (P3-T9).
    const haiku = deadline.child(HAIKU_ASK_CAP_MS)
    try {
      for (let turn = 0; turn < ASK_MAX_TURNS; turn += 1) {
        const params: MessageParams = { ...haikuRequest('medium', 12_000), system: ASK_SYSTEM, tools: ASK_TOOLS, messages }
        const message = await tracedSend(this.deps.transport, trace, haiku, {
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
        if (answer && isGrounded(answer, allowed)) return { answer, figures, source: 'ai', ...BY_HAIKU }
        return fromFigures()
      }
      return fromFigures()
    } catch (error) {
      this.logFailure('ask', error)
      await this.giveBack(s, use, trace)
      if (figures.length > 0) return fromFigures()
      throw this.paused()
    }
  }

  /**
   * One trace and one deadline per request (H3). The deadline starts before
   * the route's first vault step, the same point on every route, so its steps
   * count against it too, and it reads the service's clock.
   */
  private start(feature: AiFeature): { trace: AiTrace; deadline: AiDeadline } {
    const totalMs = this.deps.deadlines?.[feature] ?? AI_ROUTE_DEADLINE_MS[feature]
    return { trace: newTrace(), deadline: new AiDeadline(totalMs, () => this.now().getTime()) }
  }

  private paused(): ProblemException {
    return new ProblemException(503, 'AI_PAUSED', { retryAfterSeconds: 300 })
  }

  /** AiService's hasConsent: the stored companion choice, for the current notice only. */
  private async hasConsent(s: VaultSession): Promise<boolean> {
    return (await step<AiStoredPreferences>(s, 'ai.preferences')).companion
  }

  /** Counts one use before the model runs (the vault refuses with 429 at the day's limit), on the Bangkok day the vault answers. */
  private async consume(s: VaultSession, feature: AiFeature): Promise<CountedUse> {
    const { day } = await step<{ day: string }>(s, 'ai.consume', { body: { feature } })
    return { feature, day }
  }

  /**
   * H5 (P3-T7), on a route's path where a call threw, before it answers with
   * the rules, the plain facts or 503: the use goes back to the day it was
   * counted on when the request's last call failed with a rate limit, a 5xx, a
   * timeout or no connection. A call that answered spends the use, whatever it
   * said (a decline, an unusable or ungrounded answer). The vault runs the step
   * even after the session ended; a refund that fails is logged by name and
   * never fails the request.
   */
  private async giveBack(s: VaultSession, use: CountedUse, trace: AiTrace): Promise<void> {
    if (!shouldRefund(trace.calls, false)) return
    try {
      await step<unknown>(s, 'ai.refund', { body: use })
    } catch (error) {
      console.warn(JSON.stringify({ level: 'warn', event: 'ai_refund_failed', feature: use.feature, failure: failureName(error) }))
    }
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
