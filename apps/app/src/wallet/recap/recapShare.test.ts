// The recap's share text (P2-T32, W20, D41): the month, the days logged, the
// month's money out with the budget and what is left or over, and the top
// categories; with private mode on, no amount at all.
import assert from 'node:assert/strict';
import test from 'node:test';

import { tableT } from '../copy/draftText.ts';
import { COPY } from './copy.ts';
import { recapShareText } from './recapShare.ts';
import type { RecapShareInput } from './recapShare.ts';

const th = tableT(COPY, 'th');
const en = tableT(COPY, 'en');

const SEPTEMBER: RecapShareInput = {
  monthLabel: 'กันยายน 2569',
  daysLogged: 'จดครบ 27 จาก 30 วัน',
  spentMinor: '1692000',
  budgetMinor: '1800000',
  top: [
    { name: 'อาหาร', minor: '624000' },
    { name: 'ส่งให้ครอบครัว', minor: '300000' },
    { name: 'เดินทาง', minor: '281000' },
  ],
};

const AMOUNTS = ['16,920', '18,000', '1,080', '3,400', '6,240', '3,000', '2,810', '0.50'];

test('the share text names the month, the days logged, the spending and the top categories', () => {
  assert.equal(recapShareText(SEPTEMBER, false, th), [
    'สรุปเดือนกันยายน 2569',
    'จดครบ 27 จาก 30 วัน',
    'ใช้ไปทั้งเดือน: ฿16,920',
    'งบ: ฿18,000 (เหลือ ฿1,080)',
    'หมวดที่ใช้มากสุด',
    '• อาหาร: ฿6,240',
    '• ส่งให้ครอบครัว: ฿3,000',
    '• เดินทาง: ฿2,810',
  ].join('\n'));
  // No budget, no budget line; no top categories, no heading for them.
  assert.equal(recapShareText({ ...SEPTEMBER, budgetMinor: null, top: [] }, false, th), ['สรุปเดือนกันยายน 2569', 'จดครบ 27 จาก 30 วัน', 'ใช้ไปทั้งเดือน: ฿16,920'].join('\n'));
});

test('the share text says what is left of the budget, or how far over it went', () => {
  const lineOf = (text: string) => text.split('\n')[3];
  assert.equal(lineOf(recapShareText({ ...SEPTEMBER, spentMinor: '2140000' }, false, th)), 'งบ: ฿18,000 (เกิน ฿3,400)');
  assert.equal(lineOf(recapShareText({ ...SEPTEMBER, spentMinor: '2140000' }, false, en)), 'Budget: ฿18,000 (Over ฿3,400)');
  assert.equal(lineOf(recapShareText(SEPTEMBER, false, en)), 'Budget: ฿18,000 (Left ฿1,080)');
  // Exact to the satang, and spending the whole budget leaves ฿0.
  assert.equal(lineOf(recapShareText({ ...SEPTEMBER, spentMinor: '1800050' }, false, th)), 'งบ: ฿18,000 (เกิน ฿0.50)');
  assert.equal(lineOf(recapShareText({ ...SEPTEMBER, spentMinor: '1800000' }, false, th)), 'งบ: ฿18,000 (เหลือ ฿0)');
});

test('with private mode on, the share text has no ฿ and none of the amounts', () => {
  const hidden = ['สรุปเดือนกันยายน 2569', 'จดครบ 27 จาก 30 วัน', 'หมวดที่ใช้มากสุด', '• อาหาร', '• ส่งให้ครอบครัว', '• เดินทาง'].join('\n');
  for (const input of [SEPTEMBER, { ...SEPTEMBER, spentMinor: '2140000' }, { ...SEPTEMBER, spentMinor: '1800050' }]) {
    const text = recapShareText(input, true, th);
    assert.equal(text, hidden);
    assert.ok(!text.includes('฿'), 'no ฿');
    for (const amount of AMOUNTS) assert.ok(!text.includes(amount), amount);
  }
});
