import { parseQuickText, thaiWordsToNumber } from '@gogospend/contracts'
import { describe, expect, it } from 'vitest'

describe('thaiWordsToNumber', () => {
  it.each([
    ['ห้า', 5],
    ['สิบ', 10],
    ['สิบเอ็ด', 11],
    ['ยี่สิบ', 20],
    ['ห้าสิบ', 50],
    ['ร้อย', 100],
    ['ร้อยห้าสิบ', 150],
    ['สองพันห้าร้อย', 2500],
    ['สามหมื่น', 30000],
    ['หนึ่งล้านสองแสน', 1_200_000],
  ])('%s is %i', (words, value) => {
    expect(thaiWordsToNumber(words)).toBe(value)
  })

  it('is null for text that is not only number words', () => {
    expect(thaiWordsToNumber('ห้าง')).toBeNull()
    expect(thaiWordsToNumber('สองสาม')).toBeNull()
  })
})

describe('parseQuickText', () => {
  it.each([
    ['ข้าวมันไก่ 50', { type: 'expense', amount_minor: '5000', merchant: 'ข้าวมันไก่', category_key: 'food', day_offset: null }],
    ['กาแฟ ๖๕ บาท', { amount_minor: '6500', merchant: 'กาแฟ', category_key: 'food' }],
    ['ข้าวมันไก่ห้าสิบบาท', { amount_minor: '5000', category_key: 'food' }],
    ['grab 120 เมื่อวาน', { amount_minor: '12000', merchant: 'grab', category_key: 'travel', day_offset: -1 }],
    ['Grab Food 189', { amount_minor: '18900', category_key: 'food' }],
    ['BTS 47', { amount_minor: '4700', category_key: 'travel' }],
    ['วิน 20', { amount_minor: '2000', category_key: 'travel' }],
    ['ค่าไฟ 1,250.50', { amount_minor: '125050', category_key: 'bills' }],
    ['shopee 2.5k', { amount_minor: '250000', category_key: 'shopping' }],
    ['เงินเดือน 30,000', { type: 'income', amount_minor: '3000000', category_key: 'salary' }],
    ['ได้อั่งเปา 500', { type: 'income', amount_minor: '50000', category_key: 'gift' }],
    ['coffee 85 yesterday', { amount_minor: '8500', merchant: 'coffee', category_key: 'food', day_offset: -1 }],
  ])('%s', (text, expected) => {
    expect(parseQuickText(text)).toMatchObject(expected)
  })

  it('keeps digits that belong to a merchant name', () => {
    expect(parseQuickText('7-11 85')).toMatchObject({ amount_minor: '8500', merchant: '7-Eleven', category_key: 'food', amounts_found: 1 })
    expect(parseQuickText('เซเว่น 42')).toMatchObject({ amount_minor: '4200', merchant: '7-Eleven' })
  })

  it('a mall is not the number five, and 5 km is not 5,000', () => {
    expect(parseQuickText('เข้าห้าง 300')).toMatchObject({ amount_minor: '30000', amounts_found: 1 })
    expect(parseQuickText('วิ่ง 5km')).toMatchObject({ amount_minor: '500', amounts_found: 1 })
  })

  it('prefers the amount marked with baht and counts every amount found', () => {
    expect(parseQuickText('BTS 2 เที่ยว ฿90')).toMatchObject({ amount_minor: '9000', amounts_found: 2 })
    expect(parseQuickText('ค่าแท็กซี่ 2 คน 180')).toMatchObject({ amount_minor: '18000', amounts_found: 2 })
  })

  it('short English keywords match whole words only', () => {
    expect(parseQuickText('raisins 40').category_key).toBeNull()
    expect(parseQuickText('barbecue 300').category_key).toBeNull()
    expect(parseQuickText('ชาร์จแบต 20').category_key).toBeNull()
  })

  it('gives an empty guess for text without an amount, and never throws', () => {
    expect(parseQuickText('สวัสดี')).toMatchObject({ amount_minor: null, amounts_found: 0, merchant: 'สวัสดี' })
    expect(parseQuickText('')).toMatchObject({ amount_minor: null, merchant: null })
    expect(parseQuickText('99999999999999')).toMatchObject({ amount_minor: null })
  })
})
