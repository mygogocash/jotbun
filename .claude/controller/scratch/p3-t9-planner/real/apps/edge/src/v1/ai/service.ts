import { AI_ROUTE_DEADLINE_MS, bangkokDate } from '@gogospend/contracts'
import type {
  AiAskRequest,
  AiAskResult,
  AiFeature,
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

import { draftChoices, draftFromRules, sanitizeDrafts } from '../../server/ai/drafts'
import type { DraftContext } from '../../server/ai/drafts'
import { factsText } from '../../server/ai/fact-text'
import { AllowedNumbers, formatBaht, isGrounded } from '../../server/ai/grounding'
import { ModelUnavailable, finishedJson } from '../../server/ai/model'
import { NOTE_SCHEMA, NOTE_SYSTEM, PARSE_SCHEMA, PARSE_SYSTEM } from '../../server/ai/prompts'
import type { AiContext, AiStoredPreferences, AiToolReply } from '../../vault/ai'
import type { VaultRouteId } from '../protocol'
import type { VaultSession } from '../worker-routes'
import { askWithEscalation } from './ask'
import { HAIKU, haikuRequest } from './models'
import { readSlipImage } from './slip-read'
import { AiDeadline, newTrace, tracedSend } from './transport'
import type { AiTrace, ModelTransport } from './transport'
import { shouldRefund } from './uses'

// The AI companion on the vault (1B-T7): the PostgreSQL edge's AiService (retired at C1)
// with its reads and writes moved into the caller's vault as steps. The order
// and the refusals are AiService's: consent, then the switch, then the day's
// use (counted before the model runs), then the model. Every step carries the
// route's access, so the vault checks the session (and the current policy on
// a current_policy route) before anything is read and before any model call.
// Since P3-T6 parse, the note and Ask Bun call Haiku 5.5 first (models.ts),
// each request runs under one deadline (AI_ROUTE_DEADLINE_MS), and every result
// names its model (H4).
// Since P3-T7 a call that fails with a rate limit, a 5xx, a timeout or no
// connection gives its use back (H5, uses.ts) before the route answers.
// Since P3-T8 a slip is read by readSlipImage (slip-read.ts): Haiku, then Opus
// in the same request when D25 says so; the result names the read's model.
// Since P3-T9 Ask Bun asks through askWithEscalation (ask.ts): Haiku, then Opus
// in a fresh conversation when D28 says so, for one use.

/** Haiku wrote the words (H4): parse and the note call Haiku only. */
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
      const base = haikuRequest('low', 8_000)
      const message = await tracedSend(this.deps.transport, trace, deadline, {
        feature: 'parse',
        escalated: false,
        params: {
          ...base,
          // The base's effort, with the JSON format (the P3-T6 review's n2).
          output_config: { ...base.output_config, format: { type: 'json_schema', schema: PARSE_SCHEMA } },
          system: PARSE_SYSTEM,
          messages: [{ role: 'user', content: JSON.stringify({ sentence: request.text, today: ctx.today, locale: request.locale, ...draftChoices(ctx) }) }],
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

  /**
   * A bank slip or receipt image into drafts (P3-T8): Haiku reads it, and Opus
   * reads it again in the same request when D25 says so. The image is never
   * stored: it goes to the models and nowhere else, and the read writes only
   * its use (B9). When no model read it (SlipNotRead), the use goes back on an
   * outage (H5) and the route answers 503.
   */
  async slip(s: VaultSession, request: AiSlipRequest): Promise<AiSlipResult> {
    const { trace, deadline } = this.start('slip')
    const ctx = await this.draftContext(s, request.today)
    if (!this.deps.transport) throw this.paused()
    const use = await this.consume(s, 'slip')
    try {
      const read = await readSlipImage(
        { image: { base64: request.image_base64, mediaType: request.media_type }, context: ctx, locale: request.locale },
        { transport: this.deps.transport, trace, deadline },
      )
      return { drafts: read.drafts, bank: read.bank, source: 'ai', model: read.model, escalated: read.escalated, kind: read.kind, declined: read.declined, tokens: read.tokens }
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
      const base = haikuRequest('low', 4_000)
      const message = await tracedSend(this.deps.transport, trace, deadline, {
        feature: 'note',
        escalated: false,
        params: {
          ...base,
          // The base's effort, with the JSON format (the P3-T6 review's n2).
          output_config: { ...base.output_config, format: { type: 'json_schema', schema: NOTE_SCHEMA } },
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

  /**
   * Ask Bun: a question answered with read-only tools over the person's
   * records, each run in the vault. The conversations are ask.ts's (P3-T9):
   * Haiku first, then Opus in a fresh conversation when Haiku's answer is
   * ungrounded, declined or unfinished (D28). The question counts one use,
   * whichever models answer it.
   */
  async ask(s: VaultSession, request: AiAskRequest): Promise<AiAskResult> {
    const { trace, deadline } = this.start('ask')
    const ctx = await step<AiContext>(s, 'ai.context')
    if (!ctx.consent) throw new ProblemException(403, 'AI_CONSENT_REQUIRED')
    if (!this.deps.transport) throw this.paused()
    const use = await this.consume(s, 'ask')
    const today = trustedToday(request.today, bangkokDate(this.now()))
    const categories = ctx.categories.map((category) => ({ id: category.id, name: category.label ?? category.builtin_key }))
    const answered = await askWithEscalation(
      { question: request.question, today, locale: request.locale, categories },
      {
        transport: this.deps.transport,
        trace,
        deadline,
        tool: (name, input) => step<AiToolReply>(s, 'ai.tool', { body: { name, input, locale: request.locale } }),
      },
    )
    // H5 (P3-T7's carry, R116): the use goes back when no model's words are shown (the plain figures or 503) and
    // the last call failed with an outage. A grounded answer's last call answered, so it never gives the use back.
    await this.giveBack(s, use, trace)
    if ('paused' in answered) throw this.paused()
    return answered
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
   * H5 (P3-T7), on a route's path where a call threw, and after every Ask Bun
   * answer (P3-T9), before the route answers: the use goes back to the day it
   * was counted on when the request's last call failed with a rate limit, a
   * 5xx, a timeout or no connection (shouldRefund, with R116 for a turn the
   * deadline never let start). A call that answered spends the use, whatever it
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
