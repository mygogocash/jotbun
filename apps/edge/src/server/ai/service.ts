import type Anthropic from '@anthropic-ai/sdk'
import { AI_DAILY_LIMITS, AI_FEATURES, AI_NOTICE_VERSION, bangkokDate } from '@gogospend/contracts'
import type {
  AiAskRequest,
  AiAskResult,
  AiFeature,
  AiFigure,
  AiLocale,
  AiNoteResult,
  AiParseRequest,
  AiParseResult,
  AiPreferences,
  AiPreferencesDto,
  AiPreferencesUpdate,
  AiSlipRequest,
  AiSlipResult,
  CategoryDto,
  SessionContext,
  WalletDto,
} from '@gogospend/contracts'

import { ProblemException } from '@api/common/api-problem.filter'
import type { DatabaseService } from '@api/database/database.service'
import { writeLog } from '@api/common/safe-request-logger'

import { draftFromRules, sanitizeDrafts } from './drafts'
import type { DraftContext } from './drafts'
import { factsText, figuresText } from './fact-text'
import { dayFacts } from './facts'
import type { CategoryNames } from './facts'
import { AllowedNumbers, formatBaht, isGrounded } from './grounding'
import { ModelUnavailable, finishedJson, finishedText, requestBase } from './model'
import type { MessageParams, SendMessage } from './model'
import { ASK_SYSTEM, NOTE_SCHEMA, NOTE_SYSTEM, PARSE_SCHEMA, PARSE_SYSTEM, SLIP_SCHEMA, SLIP_SYSTEM } from './prompts'
import { ASK_TOOLS, ToolInputError, runTool } from './tools'

export type AiServiceDeps = {
  db: DatabaseService
  wallets: { list(session: SessionContext): Promise<WalletDto[]> }
  categories: { list(session: SessionContext): Promise<CategoryDto[]> }
  /** Null when AI is not configured or switched off (AI_ENABLED, ANTHROPIC_API_KEY). */
  send: SendMessage | null
  model: string
  now?: () => Date
}

const ASK_MAX_TURNS = 5
const USAGE_KEEP_DAYS = 35

/** Seconds until the next Bangkok midnight, when today's uses reset. */
function secondsToBangkokMidnight(now: Date): number {
  const bangkok = new Date(now.getTime() + 7 * 3_600_000)
  const next = Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate() + 1) - 7 * 3_600_000
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000))
}

/** The client's "today", unless it is more than a day from the server's Bangkok date. */
function trustedToday(clientToday: string, serverToday: string): string {
  const gap = Math.abs(Date.parse(`${clientToday}T00:00:00Z`) - Date.parse(`${serverToday}T00:00:00Z`))
  return Number.isFinite(gap) && gap <= 86_400_000 ? clientToday : serverToday
}

export class AiService {
  private readonly now: () => Date

  constructor(private readonly deps: AiServiceDeps) {
    this.now = deps.now ?? (() => new Date())
  }

  get available(): boolean {
    return this.deps.send !== null
  }

  async preferences(session: SessionContext): Promise<AiPreferencesDto> {
    const today = bangkokDate(this.now())
    return this.deps.db.withOwnerTransaction(session, async (tx) => {
      const [row] = await tx.query<{ companion: boolean; cashback_tips: boolean; notice_version: number | null }>(
        'SELECT companion, cashback_tips, notice_version FROM ai_preferences WHERE account_id = $1',
        [session.accountId],
      )
      const used = await tx.query<{ feature: AiFeature; uses: number }>('SELECT feature, uses FROM ai_usage WHERE account_id = $1 AND day = $2::date', [session.accountId, today])
      const usedBy = new Map(used.map((u) => [u.feature, u.uses]))
      const prefs: AiPreferences = row ?? { companion: false, cashback_tips: false, notice_version: null }
      return {
        ...prefs,
        // Consent to an older notice no longer counts.
        companion: prefs.companion && prefs.notice_version === AI_NOTICE_VERSION,
        current_notice_version: AI_NOTICE_VERSION,
        remaining: Object.fromEntries(AI_FEATURES.map((f) => [f, Math.max(0, AI_DAILY_LIMITS[f] - (usedBy.get(f) ?? 0))])) as Record<AiFeature, number>,
        available: this.available,
      }
    }, { snapshot: true })
  }

  async setPreferences(session: SessionContext, update: AiPreferencesUpdate): Promise<AiPreferencesDto> {
    await this.deps.db.withOwnerTransaction(session, async (tx) => {
      const [current] = await tx.query<AiPreferences>('SELECT companion, cashback_tips, notice_version FROM ai_preferences WHERE account_id = $1 FOR UPDATE', [session.accountId])
      const saved: AiPreferences = current ?? { companion: false, cashback_tips: false, notice_version: null }
      const next: AiPreferences = { ...saved, ...update }
      if (next.companion && next.notice_version !== AI_NOTICE_VERSION) {
        throw new ProblemException(403, 'AI_CONSENT_REQUIRED', { messageKey: 'errors.ai_notice_required' })
      }
      await tx.query(
        `INSERT INTO ai_preferences (account_id, companion, cashback_tips, notice_version, updated_at) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (account_id) DO UPDATE SET companion = EXCLUDED.companion, cashback_tips = EXCLUDED.cashback_tips, notice_version = EXCLUDED.notice_version, updated_at = now()`,
        [session.accountId, next.companion, next.cashback_tips, next.notice_version],
      )
    })
    return this.preferences(session)
  }

  /** "Tell Bun": a sentence into drafts. Rules answer when AI is unavailable or unsure. */
  async parse(session: SessionContext, request: AiParseRequest): Promise<AiParseResult> {
    await this.requireConsent(session)
    const ctx = await this.draftContext(session, request.today)
    const rules = (): AiParseResult => {
      const draft = draftFromRules(request.text, ctx)
      return { drafts: draft ? [draft] : [], source: 'rules' }
    }
    if (!this.deps.send) return rules()
    await this.consume(session, 'parse')
    try {
      const message = await this.deps.send({
        ...requestBase(this.deps.model, 'low', 8_000),
        output_config: { effort: 'low', format: { type: 'json_schema', schema: PARSE_SCHEMA } },
        system: PARSE_SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify({ sentence: request.text, today: ctx.today, locale: request.locale, ...this.choices(ctx) }) }],
      })
      const drafts = sanitizeDrafts(finishedJson(message), ctx, request.text)
      return drafts.length > 0 ? { drafts, source: 'ai' } : rules()
    } catch (error) {
      this.logFailure('parse', error)
      return rules()
    }
  }

  /** A bank slip or receipt image into drafts. The image is never stored. */
  async slip(session: SessionContext, request: AiSlipRequest): Promise<AiSlipResult> {
    await this.requireConsent(session)
    if (!this.deps.send) throw this.paused()
    const ctx = await this.draftContext(session, request.today)
    await this.consume(session, 'slip')
    try {
      const message = await this.deps.send({
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
   * Bun's daily note: facts from the database, phrased by the model only
   * when every number it writes is one of those facts. Without AI, or when
   * the wording strays, the note is the plain facts.
   */
  async note(session: SessionContext, date: string, locale: AiLocale): Promise<AiNoteResult> {
    const today = trustedToday(date, bangkokDate(this.now()))
    const names = await this.categoryNames(session)
    const facts = await this.deps.db.withOwnerTransaction(session, (tx) => dayFacts(tx, today, names), { snapshot: true })
    const plain: AiNoteResult = { date: today, facts, text: factsText(facts, locale), source: 'facts' }
    if (!this.deps.send || !(await this.hasConsent(session))) return plain
    const allowed = new AllowedNumbers().addDate(today)
    for (const fact of facts) {
      if (fact.amount_minor) allowed.addSatang(fact.amount_minor)
      for (const n of [fact.count, fact.days, fact.percent]) if (n !== undefined) allowed.addCount(n)
    }
    try {
      await this.consume(session, 'note')
      const message = await this.deps.send({
        ...requestBase(this.deps.model, 'low', 4_000),
        output_config: { effort: 'low', format: { type: 'json_schema', schema: NOTE_SCHEMA } },
        system: NOTE_SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify({ locale, date: today, facts: facts.map((f) => ({ ...f, say: f.amount_minor ? formatBaht(f.amount_minor) : undefined })) }) }],
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

  /** Ask Bun: a question answered with read-only tools over the person's records. */
  async ask(session: SessionContext, request: AiAskRequest): Promise<AiAskResult> {
    await this.requireConsent(session)
    if (!this.deps.send) throw this.paused()
    await this.consume(session, 'ask')
    const today = trustedToday(request.today, bangkokDate(this.now()))
    const names = await this.categoryNames(session)
    const categories = [...names].map(([id, n]) => ({ id, name: n.label ?? n.builtin_key }))
    const allowed = new AllowedNumbers().addDate(today)
    const figures: AiFigure[] = []
    const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
      { role: 'user', content: JSON.stringify({ question: request.question, today, locale: request.locale, categories }) },
    ]
    try {
      for (let turn = 0; turn < ASK_MAX_TURNS; turn += 1) {
        const params: MessageParams = { ...requestBase(this.deps.model, 'medium', 12_000), system: ASK_SYSTEM, tools: ASK_TOOLS, messages }
        const message = await this.deps.send(params)
        if (message.stop_reason === 'tool_use') {
          messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.Messages.BetaContentBlockParam[] })
          const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = []
          for (const block of message.content) {
            if (block.type !== 'tool_use') continue
            try {
              const run = await this.deps.db.withOwnerTransaction(session, (tx) => runTool(tx, block.name, (block.input ?? {}) as Record<string, unknown>, names, allowed, request.locale), { snapshot: true })
              figures.push(...run.figures)
              results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(run.result) })
            } catch (error) {
              if (!(error instanceof ToolInputError)) throw error
              results.push({ type: 'tool_result', tool_use_id: block.id, content: error.message, is_error: true })
            }
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

  private async hasConsent(session: SessionContext): Promise<boolean> {
    const [row] = await this.deps.db.withOwnerTransaction(session, (tx) =>
      tx.query<{ ok: boolean }>('SELECT (companion AND notice_version = $2) AS ok FROM ai_preferences WHERE account_id = $1', [session.accountId, AI_NOTICE_VERSION]),
    { snapshot: true })
    return row?.ok === true
  }

  private async requireConsent(session: SessionContext): Promise<void> {
    if (!(await this.hasConsent(session))) throw new ProblemException(403, 'AI_CONSENT_REQUIRED')
  }

  /**
   * Counts one use against today's Bangkok limit before the model runs, so a
   * failing call still costs a use. Over the limit the transaction rolls back
   * (the count stays at the limit) and the answer is 429 until midnight.
   */
  private async consume(session: SessionContext, feature: AiFeature): Promise<void> {
    const now = this.now()
    const today = bangkokDate(now)
    await this.deps.db.withOwnerTransaction(session, async (tx) => {
      await tx.query(`DELETE FROM ai_usage WHERE account_id = $1 AND day < $2::date - ${USAGE_KEEP_DAYS}`, [session.accountId, today])
      const [row] = await tx.query<{ uses: number }>(
        `INSERT INTO ai_usage (account_id, day, feature, uses) VALUES ($1, $2::date, $3, 1)
         ON CONFLICT (account_id, day, feature) DO UPDATE SET uses = ai_usage.uses + 1 RETURNING uses`,
        [session.accountId, today, feature],
      )
      if (row.uses > AI_DAILY_LIMITS[feature]) throw new ProblemException(429, 'AI_LIMIT_REACHED', { retryAfterSeconds: secondsToBangkokMidnight(now) })
    })
  }

  private async categoryNames(session: SessionContext): Promise<CategoryNames> {
    const list = await this.deps.categories.list(session)
    return new Map(list.map((c) => [c.id, { builtin_key: c.builtin_key, label: c.label }]))
  }

  private async draftContext(session: SessionContext, clientToday: string): Promise<DraftContext> {
    const [wallets, categories] = await Promise.all([this.deps.wallets.list(session), this.deps.categories.list(session)])
    return { today: trustedToday(clientToday, bangkokDate(this.now())), wallets, categories }
  }

  /** What the model may choose from: ids with names, never balances or history. */
  private choices(ctx: DraftContext) {
    return {
      wallets: ctx.wallets.filter((w) => !w.archived).map((w) => ({ id: w.id, name: w.name })),
      categories: ctx.categories.filter((c) => !c.archived).map((c) => ({ id: c.id, type: c.type, name: c.label ?? c.builtin_key })),
    }
  }

  private logFailure(feature: AiFeature, error: unknown): void {
    if (error instanceof ProblemException) throw error
    writeLog({ level: 'warn', event: 'ai_fallback', feature, error: error instanceof ModelUnavailable ? `ModelUnavailable:${error.reason}` : error instanceof Error ? error.name : typeof error })
  }
}
