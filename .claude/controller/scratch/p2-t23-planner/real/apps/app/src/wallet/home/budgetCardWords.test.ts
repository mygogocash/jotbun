// The Bun Wallet Home's budget card words (P2-T23; bw-home, bw-private,
// ax-voiceover, rh-offline; C4, W9, W10): the month's spending, the line
// beside it in its budget state's colour, and what the card says to a screen
// reader, in Thai and English, from paces built with budgetPace.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { budgetPace } from '../../spend/v1/redesign/budgetPace.ts';
import type { BudgetPace } from '../../spend/v1/redesign/budgetPace.ts';
import { budget, command, pending, spentSummary } from '../../spend/v1/redesign/testing/fixtures.ts';
import type { OutboxCommand } from '../../storage/types.ts';
import { COMMON_COPY } from '../common/copy.ts';
import { tableT } from '../copy/draftText.ts';
import { budgetCardWords } from './budgetCardWords.ts';
import { COPY } from './copy.ts';

const TABLE = { ...COMMON_COPY, ...COPY };
const th = tableT(TABLE, 'th');
const en = tableT(TABLE, 'en');
const OCT = '2026-10';
/** bw-home's budget: ฿18,000 for October. */
const LIMIT = '1800000';
const DIGIT = /[0-9๐-๙]/;

function pace(today: string, spent: string, options: { limit?: string | null; outbox?: OutboxCommand[] } = {}): BudgetPace {
  const limit = options.limit === undefined ? LIMIT : options.limit;
  return budgetPace({ budget: limit === null ? null : budget(OCT, limit), summary: spentSummary(OCT, spent), today, outbox: options.outbox });
}

test('on track says เหลือวันละ ฿690 in the under colour', () => {
  // bw-home: ฿12,480 of ฿18,000 on 24 October, so ฿5,520 is left for 8 days, today included.
  const onTrack = pace('2026-10-24', '1248000');
  assert.deepEqual([onTrack.state, onTrack.daysLeft, onTrack.perDayMinor], ['on_track', 8, '69000']);
  assert.deepEqual(budgetCardWords(onTrack, false, th), {
    headline: '฿12,480',
    side: { text: 'เหลือวันละ ฿690', tone: 'under' },
    spoken: 'ใช้ไปเดือนนี้ 12,480 บาท จากงบ 18,000 บาท, เหลือวันละ 690 บาท',
  });
  assert.deepEqual(budgetCardWords(onTrack, false, en), {
    headline: '฿12,480',
    side: { text: '฿690 a day left', tone: 'under' },
    spoken: 'Spent this month 12,480 baht of 18,000 baht, 690 baht a day left',
  });
});

test('over says เกินงบไป ฿420 in the over colour', () => {
  const over = pace('2026-10-24', '1842000');
  assert.deepEqual([over.state, over.overByMinor, over.perDayMinor], ['over', '42000', null]);
  assert.deepEqual(budgetCardWords(over, false, th), {
    headline: '฿18,420',
    side: { text: 'เกินงบไป ฿420', tone: 'over' },
    spoken: 'ใช้ไปเดือนนี้ 18,420 บาท จากงบ 18,000 บาท, เกินงบไป 420 บาท',
  });
  assert.deepEqual(budgetCardWords(over, false, en).side, { text: '฿420 over budget', tone: 'over' });
  // Satang show and are said, on the figure and on the line.
  const satang = budgetCardWords(pace('2026-10-24', '1842050'), false, th);
  assert.deepEqual([satang.headline, satang.side?.text], ['฿18,420.50', 'เกินงบไป ฿420.50']);
  assert.equal(satang.spoken, 'ใช้ไปเดือนนี้ 18,420 บาท 50 สตางค์ จากงบ 18,000 บาท, เกินงบไป 420 บาท 50 สตางค์');
});

test('private mode says ตามแผน or เกินงบ and no amount', () => {
  const cases = [
    { pace: pace('2026-10-24', '1248000'), side: { text: 'ตามแผน', tone: 'under' }, spoken: 'ใช้ไปเดือนนี้ ซ่อนยอดเงินอยู่, ตามแผน' },
    { pace: pace('2026-10-10', '1000000'), side: { text: 'ตามแผน', tone: 'ink' }, spoken: 'ใช้ไปเดือนนี้ ซ่อนยอดเงินอยู่, ตามแผน' },
    { pace: pace('2026-10-24', '1842000'), side: { text: 'เกินงบ', tone: 'over' }, spoken: 'ใช้ไปเดือนนี้ ซ่อนยอดเงินอยู่, เกินงบ' },
    { pace: pace('2026-10-24', '1248000', { limit: null }), side: null, spoken: 'ใช้ไปเดือนนี้ ซ่อนยอดเงินอยู่' },
  ] as const;
  for (const { pace: hiddenPace, side, spoken } of cases) {
    const words = budgetCardWords(hiddenPace, true, th);
    // bw-private: the figure is ฿•••• at its own size, and the line keeps its place and colour.
    assert.deepEqual(words, { headline: '฿••••', side, spoken }, hiddenPace.state);
    // Review Focus 2: no digit of an amount reaches the card, in either language.
    for (const said of [words, budgetCardWords(hiddenPace, true, en)]) assert.equal(DIGIT.test(JSON.stringify(said)), false, JSON.stringify(said));
  }
  assert.deepEqual(budgetCardWords(cases[2].pace, true, en), { headline: '฿••••', side: { text: 'Over budget', tone: 'over' }, spoken: 'Spent this month Amount hidden, Over budget' });
  assert.equal(budgetCardWords(cases[0].pace, true, en).side?.text, 'On track');
});

test("on the month's last day the per-day hint is all that is left", () => {
  // Review Focus 5: on 31 October one day is left, today, so it divides by 1.
  const lastDay = pace('2026-10-31', '1248000');
  assert.deepEqual([lastDay.daysLeft, lastDay.leftMinor], [1, '552000']);
  const words = budgetCardWords(lastDay, false, th);
  assert.deepEqual(words.side, { text: 'เหลือวันละ ฿5,520', tone: 'under' });
  assert.equal(words.spoken, 'ใช้ไปเดือนนี้ 12,480 บาท จากงบ 18,000 บาท, เหลือวันละ 5,520 บาท');
});

test('tight says the same words in ink, in whole baht rounded down, shown and said', () => {
  // 10 October: ฿10,000 spent is ahead of the even pace. ฿8,000 left over 22 days is ฿363.63 a day.
  const tight = pace('2026-10-10', '1000000');
  assert.deepEqual([tight.state, tight.perDayMinor], ['tight', '36363']);
  assert.deepEqual(budgetCardWords(tight, false, th), {
    headline: '฿10,000',
    side: { text: 'เหลือวันละ ฿363', tone: 'ink' },
    spoken: 'ใช้ไปเดือนนี้ 10,000 บาท จากงบ 18,000 บาท, เหลือวันละ 363 บาท',
  });
  // Right at the limit is never over: ฿0 a day, in ink.
  const atLimit = pace('2026-10-24', LIMIT);
  assert.deepEqual([atLimit.state, atLimit.perDayMinor], ['tight', '0']);
  assert.deepEqual(budgetCardWords(atLimit, false, th).side, { text: 'เหลือวันละ ฿0', tone: 'ink' });
});

test("the figure and the hint are the estimate's: waiting drafts count, drafts being checked do not", () => {
  // rh-offline: ฿12,415 confirmed and a ฿115 expense waiting on this phone read ฿12,530, so ฿5,470 is left: ฿683.75 a day.
  const outbox = [
    command(pending({ amount_minor: '11500', occurred_on: '2026-10-24' }), 'unsent'),
    command(pending({ amount_minor: '9900', occurred_on: '2026-10-24' }), 'sending'),
  ];
  const offline = pace('2026-10-24', '1241500', { outbox });
  assert.deepEqual([offline.spent.estimatedMinor, offline.perDayMinor], ['1253000', '68375']);
  assert.deepEqual(budgetCardWords(offline, false, th), {
    headline: '฿12,530',
    side: { text: 'เหลือวันละ ฿683', tone: 'under' },
    spoken: 'ใช้ไปเดือนนี้ 12,530 บาท จากงบ 18,000 บาท, เหลือวันละ 683 บาท',
  });
});

test('with no budget there is no line, and the card says only what was spent', () => {
  const none = pace('2026-10-24', '1248000', { limit: null });
  assert.equal(none.state, 'no_budget');
  assert.deepEqual(budgetCardWords(none, false, th), { headline: '฿12,480', side: null, spoken: 'ใช้ไปเดือนนี้ 12,480 บาท' });
  assert.deepEqual(budgetCardWords(none, false, en), { headline: '฿12,480', side: null, spoken: 'Spent this month 12,480 baht' });
});

test('after the month there is no per-day figure, so the line says ตามแผน', () => {
  // budgetPace has no per-day figure once the month is over (Home always shows today's month).
  const after = pace('2026-11-02', '1248000');
  assert.deepEqual([after.phase, after.state, after.perDayMinor], ['after', 'on_track', null]);
  assert.deepEqual(budgetCardWords(after, false, th), {
    headline: '฿12,480',
    side: { text: 'ตามแผน', tone: 'under' },
    spoken: 'ใช้ไปเดือนนี้ 12,480 บาท จากงบ 18,000 บาท, ตามแผน',
  });
});
