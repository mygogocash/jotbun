import {
  AI_CONFIDENCE,
  AI_DRAFTS_MAX,
  AI_DRAFT_FLAGS,
  MERCHANT_MAX_CHARS,
  NOTE_MAX_CHARS,
  draftFromQuickText,
  parseQuickText,
} from '@gogospend/contracts'
import type { AiConfidence, AiDraft, AiDraftFlag, CategoryDto, WalletDto } from '@gogospend/contracts'

import { numbersIn } from './grounding'

export type DraftContext = {
  today: string
  wallets: readonly Pick<WalletDto, 'id' | 'name' | 'archived'>[]
  categories: readonly Pick<CategoryDto, 'id' | 'type' | 'builtin_key' | 'label' | 'archived'>[]
}

const MINOR_MAX = 99_999_999_999n
const DATE = /^\d{4}-\d{2}-\d{2}$/
const CONTROL = /[\p{Cc}\u2028\u2029\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function isRealDate(iso: string): boolean {
  if (!DATE.test(iso)) return false
  return new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) === iso
}

/** "60", "1250.5" or "1,250.50" baht → exact satang; null for anything else. */
export function bahtToSatang(value: unknown): bigint | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).replace(/,/g, '').trim()
  const match = /^(\d{1,11})(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) return null
  const satang = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')
  return satang > 0n && satang <= MINOR_MAX ? satang : null
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.normalize('NFC').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  const chars = [...text]
  return chars.length > max ? chars.slice(0, max).join('').trim() : text
}

const activeWallets = (ctx: DraftContext) => ctx.wallets.filter((w) => !w.archived)

/** The only active wallet, when there is exactly one. */
function soleWallet(ctx: DraftContext): string | null {
  const wallets = activeWallets(ctx)
  return wallets.length === 1 ? wallets[0].id : null
}

/** A draft from the offline rules alone (AI off, unavailable or unsure); shared with the app. */
export const draftFromRules = (text: string, ctx: DraftContext): AiDraft | null => draftFromQuickText(text, ctx)

type RawDraft = Record<string, unknown>

/**
 * Turns a model's drafts into safe ones. Every id must be one of the
 * account's active wallets or categories of the right type; amounts must be
 * exact baht; dates real and not in the future (up to 90 days back). With
 * `sentence`, an amount must also be one the user wrote, so a sentence draft
 * never carries a number the model made up. Anything ungrounded becomes null
 * and flagged, never guessed silently.
 */
export function sanitizeDrafts(raw: unknown, ctx: DraftContext, sentence?: string): AiDraft[] {
  const list = Array.isArray((raw as { drafts?: unknown } | null)?.drafts) ? ((raw as { drafts: unknown[] }).drafts as RawDraft[]) : []
  const written = sentence === undefined ? null : new Set(numbersIn(sentence))
  const rulesAmount = sentence === undefined ? null : parseQuickText(sentence).amount_minor
  const oldest = addDays(ctx.today, -90)
  const drafts: AiDraft[] = []
  for (const item of list.slice(0, AI_DRAFTS_MAX)) {
    if (!item || typeof item !== 'object') continue
    const type = item.type === 'income' ? 'income' : item.type === 'expense' ? 'expense' : null
    if (!type) continue
    const flags = new Set<AiDraftFlag>((Array.isArray(item.flags) ? item.flags : []).filter((f): f is AiDraftFlag => (AI_DRAFT_FLAGS as readonly unknown[]).includes(f)))

    let amount = bahtToSatang(item.amount_baht)
    if (amount !== null && written !== null && !written.has(amount) && amount.toString() !== rulesAmount) amount = null
    if (amount === null) flags.add('amount_unclear')

    let date = typeof item.date === 'string' && isRealDate(item.date) ? item.date : null
    if (date !== null && (date > ctx.today || date < oldest)) date = null
    if (date === null) {
      date = ctx.today
      flags.add('date_guessed')
    }

    const category = ctx.categories.find((c) => c.id === item.category_id && !c.archived && c.type === type)
    if (!category) flags.add('category_guessed')
    // An unknown wallet id is dropped; with one active wallet that one is used.
    const wallet = activeWallets(ctx).find((w) => w.id === item.wallet_id)?.id ?? soleWallet(ctx)
    if (!wallet) flags.add('wallet_guessed')

    const confidence: AiConfidence = (AI_CONFIDENCE as readonly unknown[]).includes(item.confidence) ? (item.confidence as AiConfidence) : 'low'
    drafts.push({
      type,
      amount_minor: amount?.toString() ?? null,
      occurred_on: date,
      category_id: category?.id ?? null,
      wallet_id: wallet,
      merchant: cleanText(item.merchant, MERCHANT_MAX_CHARS),
      note: cleanText(item.note, NOTE_MAX_CHARS),
      // A draft with anything ungrounded is never "high".
      confidence: amount === null ? 'low' : flags.size > 0 && confidence === 'high' ? 'medium' : confidence,
      flags: AI_DRAFT_FLAGS.filter((f) => flags.has(f)),
    })
  }
  return drafts
}
