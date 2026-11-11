import assert from 'node:assert/strict';
import test from 'node:test';

import { tableT } from '../copy/draftText.ts';
import { COPY } from './copy.ts';
import { recapShareText } from './recapShare.ts';

const t = tableT(COPY, 'th');

test('the share text names the month, the days logged, the spending and the top categories', () => {
  const text = recapShareText(
    {
      monthLabel: 'ตุลาคม 2026',
      daysLogged: 'จดครบ 28 จาก 31 วัน',
      spentMinor: '1692000',
      budgetMinor: '1800000',
      top: [
        { name: 'อาหาร', minor: '624000' },
        { name: 'เดินทาง', minor: '281000' },
      ],
    },
    false,
    t,
  );

  assert.ok(text.includes('ตุลาคม 2026'), 'must include month');
  assert.ok(text.includes('จดครบ 28 จาก 31 วัน'), 'must include days logged');
  assert.ok(text.includes('฿16,920'), 'must include spending amount');
  assert.ok(text.includes('฿18,000'), 'must include budget amount');
  assert.ok(text.includes('อาหาร'), 'must include top category 1 name');
  assert.ok(text.includes('฿6,240'), 'must include top category 1 amount');
  assert.ok(text.includes('เดินทาง'), 'must include top category 2 name');
  assert.ok(text.includes('฿2,810'), 'must include top category 2 amount');
});

test('with private mode on, the share text has no ฿ and none of the amounts', () => {
  const text = recapShareText(
    {
      monthLabel: 'ตุลาคม 2026',
      daysLogged: 'จดครบ 28 จาก 31 วัน',
      spentMinor: '1692000',
      budgetMinor: '1800000',
      top: [
        { name: 'อาหาร', minor: '624000' },
        { name: 'เดินทาง', minor: '281000' },
      ],
    },
    true,
    t,
  );

  assert.ok(text.includes('ตุลาคม 2026'), 'still includes month');
  assert.ok(text.includes('จดครบ 28 จาก 31 วัน'), 'still includes days logged');
  assert.ok(text.includes('อาหาร'), 'still includes top category 1 name');
  assert.ok(text.includes('เดินทาง'), 'still includes top category 2 name');

  // Review Focus 2: strictly no ฿ and none of the amounts
  assert.ok(!text.includes('฿'), 'must have no ฿ symbol');
  assert.ok(!text.includes('16,920'), 'must not contain spending amount');
  assert.ok(!text.includes('18,000'), 'must not contain budget amount');
  assert.ok(!text.includes('6,240'), 'must not contain category 1 amount');
  assert.ok(!text.includes('2,810'), 'must not contain category 2 amount');
  assert.ok(!text.includes('1,080'), 'must not contain remaining amount');
});
