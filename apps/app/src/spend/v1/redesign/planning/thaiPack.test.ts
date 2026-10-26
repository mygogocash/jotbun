import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CATEGORY_COLORS } from '@gogospend/contracts';

import { THAI_EVERYDAY_PACK, missingPackItems, packCommands } from './thaiPack.ts';

let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

test('every pack colour is one of the category hues, and every key is unique', () => {
  for (const item of THAI_EVERYDAY_PACK) assert.ok((CATEGORY_COLORS as readonly string[]).includes(item.color), item.key);
  assert.equal(new Set(THAI_EVERYDAY_PACK.map((i) => i.key)).size, THAI_EVERYDAY_PACK.length);
});

test('a fresh account gets the whole pack, named in Thai for Thai and in English otherwise', () => {
  const th = packCommands([], 'th', ids);
  assert.equal(th.length, THAI_EVERYDAY_PACK.length);
  assert.deepEqual(th[0], { slot: 'category', kind: 'create', input: { id: th[0].slot === 'category' && th[0].kind === 'create' ? th[0].input.id : '', type: 'expense', label: 'ส่งเงินให้ครอบครัว', color: '#F291C4' } });
  const en = packCommands([], 'vi', ids);
  assert.equal(en[1].slot === 'category' && en[1].kind === 'create' ? en[1].input.label : '', 'Merit making');
});

test('items the person already has, in either language or archived, are skipped; types are kept apart', () => {
  const existing = [
    { type: 'expense' as const, label: ' ทำบุญ ' },
    { type: 'expense' as const, label: 'PETS' },
    { type: 'expense' as const, label: 'From family' },
    { type: 'expense' as const, label: null },
  ];
  const missing = missingPackItems(existing).map((i) => i.key);
  assert.deepEqual(missing, ['family_out', 'delivery', 'phone', 'lottery', 'family_in']);
});
