// Bun Wallet money text (P2-T10, W9): ฿ first with thousands commas; the
// compact form drops .00 only when the satang are zero, the exact form keeps
// two decimals; − and + by sign, zero never signed; the per-day hint in whole
// baht, rounded down; and the words a screen reader says.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMMON_COPY } from '../common/copy.ts';
import { tableT } from '../copy/draftText.ts';
import { HIDDEN_AMOUNT, perDayText, spokenMoney, walletMoneyText } from './walletMoney.ts';

const MINUS = '\u2212';

test('the compact form drops .00 only when the satang are zero; the exact form keeps two decimals', () => {
  assert.equal(walletMoneyText('1248000'), '฿12,480');
  assert.equal(walletMoneyText('5025'), '฿50.25');
  assert.equal(walletMoneyText('5000', { exact: true }), '฿50.00');
  assert.equal(walletMoneyText('99999999999'), '฿999,999,999.99');
  assert.equal(walletMoneyText('0'), '฿0');
  assert.equal(walletMoneyText('5'), '฿0.05');
  assert.equal(walletMoneyText('0', { exact: true }), '฿0.00');
});

test('an expense takes the true minus, income a plus, a balance a minus only below zero, and zero no sign', () => {
  assert.equal(walletMoneyText('5000', { sign: 'expense' }), `${MINUS}฿50`);
  assert.equal(walletMoneyText('3500000', { sign: 'income' }), '+฿35,000');
  assert.equal(walletMoneyText('-392000', { sign: 'balance' }), `${MINUS}฿3,920`);
  assert.equal(walletMoneyText('392000', { sign: 'balance' }), '฿3,920');
  assert.equal(walletMoneyText('-5', { sign: 'balance', exact: true }), `${MINUS}฿0.05`);
  assert.equal(walletMoneyText('0', { sign: 'expense' }), '฿0');
  assert.equal(walletMoneyText('0', { sign: 'income' }), '฿0');
  assert.equal(walletMoneyText('0', { sign: 'balance' }), '฿0');
  // No sign: the size of the amount, as a list row draws it.
  assert.equal(walletMoneyText('5000', { sign: 'none' }), '฿50');
  assert.equal(walletMoneyText('-392000'), '฿3,920');
});

test('only a canonical satang string is money', () => {
  for (const bad of ['50.25', '007', '-0', '', '1e3', ' 1']) {
    assert.throws(() => walletMoneyText(bad), TypeError, JSON.stringify(bad));
  }
});

test('the per-day hint is whole baht, rounded down', () => {
  assert.equal(perDayText('69099'), '฿690');
  assert.equal(perDayText('99'), '฿0');
  assert.equal(perDayText('58064'), '฿580');
  assert.equal(perDayText('1800000'), '฿18,000');
});

test('spoken money says baht, and satang only when there are some, inside minus below zero', () => {
  const th = tableT({ ...COMMON_COPY }, 'th');
  const en = tableT({ ...COMMON_COPY }, 'en');
  assert.equal(spokenMoney('1248000', th), '12,480 บาท');
  assert.equal(spokenMoney('5025', th), '50 บาท 25 สตางค์');
  assert.equal(spokenMoney('-392000', th), 'ติดลบ 3,920 บาท');
  assert.equal(spokenMoney('0', th), '0 บาท');
  assert.equal(spokenMoney('1248000', en), '12,480 baht');
  assert.equal(spokenMoney('5005', en), '50 baht 5 satang');
  assert.equal(spokenMoney('-5', en), 'minus 0 baht 5 satang');
});

test('a hidden amount is ฿ and four dots', () => {
  assert.equal(HIDDEN_AMOUNT, '฿\u2022\u2022\u2022\u2022');
});
