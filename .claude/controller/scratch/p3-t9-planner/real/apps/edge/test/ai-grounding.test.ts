import { describe, expect, it } from 'vitest'

import { bahtToSatang, draftFromRules, sanitizeDrafts } from '../src/server/ai/drafts'
import type { DraftContext } from '../src/server/ai/drafts'
import { factSentence, factsText, figureLabel, figureWord, figuresText, leftOf, monthText, periodText } from '../src/server/ai/fact-text'
import { AllowedNumbers, formatBaht, isGrounded, numbersIn } from '../src/server/ai/grounding'

const W1 = '11111111-1111-4111-8111-111111111111'
const W2 = '22222222-2222-4222-8222-222222222222'
const FOOD = '33333333-3333-4333-8333-333333333333'
const SALARY = '44444444-4444-4444-8444-444444444444'
const OLD = '55555555-5555-4555-8555-555555555555'

const ctx = (overrides: Partial<DraftContext> = {}): DraftContext => ({
  today: '2026-10-24',
  wallets: [{ id: W1, name: 'เงินสด', archived: false }],
  categories: [
    { id: FOOD, type: 'expense', builtin_key: 'food', label: null, archived: false },
    { id: SALARY, type: 'income', builtin_key: 'salary', label: null, archived: false },
    { id: OLD, type: 'expense', builtin_key: null, label: 'Old', archived: true },
  ],
  ...overrides,
})

describe('numbersIn and isGrounded', () => {
  it('reads Thai digits, separators and satang as hundredths', () => {
    expect(numbersIn('ใช้ไป ๖๐ บาท, total ฿1,250.50 and 3 days')).toEqual([6000n, 125050n, 300n])
  })

  it('a list with a non-thousands comma reads each number', () => {
    expect(numbersIn('60,12')).toEqual([6000n, 1200n])
  })

  it('money is grounded only when it is an allowed amount', () => {
    const allowed = new AllowedNumbers().addSatang('6000').addCount(3).addDate('2026-10-24')
    expect(isGrounded('Lunch ฿60, 3 logs on 24 Oct 2026 (2569)', allowed)).toBe(true)
    expect(isGrounded('Lunch ฿60.00', allowed)).toBe(true)
    expect(isGrounded('Lunch ฿65', allowed)).toBe(false)
    expect(isGrounded('about 60.004', allowed)).toBe(false)
  })

  it('an overspend is allowed as its absolute amount', () => {
    expect(isGrounded('over by ฿120', new AllowedNumbers().addSatang('-12000'))).toBe(true)
  })
})

describe('formatBaht', () => {
  it.each([
    ['0', '฿0'],
    ['6000', '฿60'],
    ['125050', '฿1,250.50'],
    ['99999999999', '฿999,999,999.99'],
    ['-12005', '-฿120.05'],
  ])('%s → %s', (minor, text) => {
    expect(formatBaht(minor)).toBe(text)
  })
})

describe('bahtToSatang', () => {
  it.each([
    ['60', 6000n],
    ['1,250.5', 125050n],
    [65, 6500n],
    ['0', null],
    ['-5', null],
    ['1.234', null],
    ['1e3', null],
    ['1000000000', null],
  ])('%p → %p', (input, out) => {
    expect(bahtToSatang(input)).toBe(out)
  })
})

describe('sanitizeDrafts', () => {
  const raw = (draft: Record<string, unknown>) => ({ drafts: [{ type: 'expense', amount_baht: '50', date: '2026-10-24', category_id: FOOD, wallet_id: W1, merchant: 'ข้าวมันไก่', note: null, confidence: 'high', flags: [], ...draft }] })

  it('keeps a grounded draft as it is', () => {
    expect(sanitizeDrafts(raw({}), ctx(), 'ข้าวมันไก่ 50')).toEqual([
      { type: 'expense', amount_minor: '5000', occurred_on: '2026-10-24', category_id: FOOD, wallet_id: W1, merchant: 'ข้าวมันไก่', note: null, confidence: 'high', flags: [] },
    ])
  })

  it('drops an amount the person never wrote', () => {
    const [d] = sanitizeDrafts(raw({ amount_baht: '55' }), ctx(), 'ข้าวมันไก่ 50')
    expect(d).toMatchObject({ amount_minor: null, confidence: 'low', flags: ['amount_unclear'] })
  })

  it('accepts an amount written in Thai words through the rules', () => {
    expect(sanitizeDrafts(raw({}), ctx(), 'ข้าวมันไก่ห้าสิบบาท')[0].amount_minor).toBe('5000')
  })

  it('drops ids that are not the account’s own, archived or of the other type', () => {
    for (const category of ['not-an-id', OLD, SALARY]) {
      const [d] = sanitizeDrafts(raw({ category_id: category }), ctx(), 'ข้าวมันไก่ 50')
      expect(d.category_id).toBeNull()
      expect(d.flags).toContain('category_guessed')
      expect(d.confidence).toBe('medium')
    }
  })

  it('uses the only active wallet when the model names an unknown one, and flags a real choice', () => {
    expect(sanitizeDrafts(raw({ wallet_id: W2 }), ctx(), 'ข้าวมันไก่ 50')[0]).toMatchObject({ wallet_id: W1 })
    const two = ctx({ wallets: [{ id: W1, name: 'Cash', archived: false }, { id: W2, name: 'Bank', archived: false }] })
    expect(sanitizeDrafts(raw({ wallet_id: null }), two, 'ข้าวมันไก่ 50')[0]).toMatchObject({ wallet_id: null, flags: ['wallet_guessed'] })
  })

  it('a future, ancient or impossible date becomes today, flagged', () => {
    for (const date of ['2026-10-25', '2026-01-01', '2026-02-30', 'tomorrow']) {
      const [d] = sanitizeDrafts(raw({ date }), ctx(), 'ข้าวมันไก่ 50')
      expect(d).toMatchObject({ occurred_on: '2026-10-24', flags: ['date_guessed'] })
    }
  })

  it("a date that is no calendar date becomes today, flagged, and never throws (the P3-T8 second review's m1)", () => {
    for (const date of ['2026-10-32', '2026-13-05', '2026-00-10', '0000-00-00', '9999-99-99']) {
      let drafts: ReturnType<typeof sanitizeDrafts> = []
      expect(() => {
        drafts = sanitizeDrafts(raw({ date }), ctx(), 'ข้าวมันไก่ 50')
      }, date).not.toThrow()
      expect(drafts[0], date).toMatchObject({ occurred_on: '2026-10-24', flags: ['date_guessed'] })
    }
  })

  it('cleans text, drops unknown flags and keeps at most five drafts', () => {
    const many = { drafts: Array.from({ length: 9 }, () => raw({ merchant: 'Tea\u202E\u0000 shop', flags: ['nonsense', 'multiple_amounts'] }).drafts[0]) }
    const out = sanitizeDrafts(many, ctx(), 'tea 50')
    expect(out).toHaveLength(5)
    expect(out[0]).toMatchObject({ merchant: 'Tea shop', flags: ['multiple_amounts'] })
  })

  it('ignores drafts of other types and non-objects', () => {
    expect(sanitizeDrafts({ drafts: [{ type: 'transfer' }, 'x', null] }, ctx(), 'x 5')).toEqual([])
    expect(sanitizeDrafts('nothing', ctx())).toEqual([])
  })

  it('slip drafts (no sentence) keep the printed amount', () => {
    expect(sanitizeDrafts(raw({ amount_baht: '1,250.00' }), ctx())[0].amount_minor).toBe('125000')
  })
})

describe('draftFromRules', () => {
  it('maps the rule guess onto the account’s own built-in category and sole wallet', () => {
    expect(draftFromRules('ข้าวมันไก่ 50 เมื่อวาน', ctx())).toEqual({
      type: 'expense',
      amount_minor: '5000',
      occurred_on: '2026-10-23',
      category_id: FOOD,
      wallet_id: W1,
      merchant: 'ข้าวมันไก่',
      note: null,
      confidence: 'high',
      flags: [],
    })
  })

  it('flags what it could not tell', () => {
    expect(draftFromRules('ร้านป้า', ctx())).toMatchObject({ amount_minor: null, confidence: 'low', flags: ['amount_unclear', 'category_guessed'] })
  })
})

describe('plain facts', () => {
  it('reads in Thai and English, and Vietnamese falls back to English', () => {
    const fact = { kind: 'budget_per_day' as const, amount_minor: '42000', days: 8 }
    expect(factSentence(fact, 'th')).toBe('ใช้ได้วันละ ฿420 ก็ยังอยู่ในงบ')
    expect(factSentence(fact, 'en')).toBe('฿420 a day keeps you on track.')
    expect(factSentence(fact, 'vi')).toBe(factSentence(fact, 'en'))
  })

  it('names built-in categories as the app does and joins at most two facts', () => {
    const facts = [
      { kind: 'top_category' as const, amount_minor: '5000', percent: 40, category_key: 'food', category_label: null },
      { kind: 'month_spent' as const, amount_minor: '12500' },
      { kind: 'month_income' as const, amount_minor: '3000000' },
    ]
    expect(factsText(facts, 'th')).toBe('เดือนนี้ใช้กับอาหารมากที่สุด ฿50 เดือนนี้ใช้ไปแล้ว ฿125')
  })

  it('figures stand in for an answer Bun could not ground', () => {
    expect(figuresText([{ label: 'Money out, 1–31 Oct 2026', amount_minor: '6000', count: 1, scope: { from: '2026-10-01', through: '2026-10-31', type: 'expense', category_id: null } }], 'en')).toBe('From your diary — Money out, 1–31 Oct 2026: ฿60')
    expect(figuresText([], 'th')).toBe('บันหาข้อมูลนี้ในบันทึกของคุณไม่เจอ')
  })
})

describe('figure labels', () => {
  it('say a period with its year, Buddhist era in Thai', () => {
    expect(periodText('2026-10-01', '2026-10-29', 'en')).toBe('1–29 Oct 2026')
    expect(periodText('2026-10-01', '2026-10-29', 'th')).toBe('1–29 ต.ค. 2569')
    expect(periodText('2026-10-03', '2026-10-03', 'th')).toBe('3 ต.ค. 2569')
    expect(periodText('2026-09-28', '2026-10-03', 'en')).toBe('28 Sep – 3 Oct 2026')
    expect(periodText('2025-12-28', '2026-01-03', 'th')).toBe('28 ธ.ค. 2568 – 3 ม.ค. 2569')
    expect(periodText('2026-10-01', '2026-10-29', 'vi')).toBe(periodText('2026-10-01', '2026-10-29', 'en'))
  })

  it('use the words of the screens beside them', () => {
    expect(monthText('2026-10', 'th')).toBe('ต.ค. 2569')
    expect(figureLabel(figureWord('out', 'th'), monthText('2026-10', 'th'), 'th')).toBe('จ่ายออก ต.ค. 2569')
    expect(figureLabel(figureWord('budget', 'en'), monthText('2026-10', 'en'), 'en')).toBe('Budget, Oct 2026')
    expect(figureLabel(leftOf('อาหาร', 'th'), monthText('2026-10', 'th'), 'th')).toBe('อาหาร คงเหลือ ต.ค. 2569')
    expect(leftOf('Food', 'en')).toBe('Food left')
  })
})
