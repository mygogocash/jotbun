import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CATEGORY_COLORS } from '@gogospend/contracts';

import { PACK_BEFORE_C3, THAI_EVERYDAY_PACK, analyticsCategoryKey, missingPackItems, packCommands, packKeyOf } from './thaiPack.ts';

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
  assert.deepEqual(missing, ['family_out', 'delivery', 'motorbike_rail', 'topup', 'seven', 'lottery', 'family_in']);
});

test('the pack is C3: eight expense categories and one income, in order', () => {
  assert.deepEqual(THAI_EVERYDAY_PACK.map((i) => i.key), ['family_out', 'merit', 'delivery', 'motorbike_rail', 'topup', 'seven', 'lottery', 'pets', 'family_in']);
  assert.deepEqual(THAI_EVERYDAY_PACK.map((i) => i.type), [...Array(8).fill('expense'), 'income']);
});

test('a person who added the earlier pack gets no second delivery or top-up category', () => {
  const missing = missingPackItems([{ type: 'expense', label: 'สั่งอาหารเดลิเวอรี่' }, { type: 'expense', label: 'Phone and internet' }]).map((i) => i.key);
  assert.ok(!missing.includes('delivery') && !missing.includes('topup'));
});

test('packKeyOf names a pack category by any of its names, never a built-in or another type', () => {
  assert.equal(packKeyOf({ type: 'expense', label: '  เดลิเวอรี ', builtin_key: null }), 'delivery');
  assert.equal(packKeyOf({ type: 'income', label: 'Pets', builtin_key: null }), null);
  assert.equal(packKeyOf({ type: 'expense', label: null, builtin_key: 'food' }), null);
});

test('analyticsCategoryKey sends a built-in key, a pack key or custom, never a label', () => {
  assert.equal(analyticsCategoryKey({ type: 'expense', label: null, builtin_key: 'food' }), 'food');
  assert.equal(analyticsCategoryKey({ type: 'expense', label: 'ทำบุญ', builtin_key: null }), 'merit');
  assert.equal(analyticsCategoryKey({ type: 'expense', label: 'Art', builtin_key: null }), 'custom');
  assert.equal(analyticsCategoryKey(null), null);
});

test('packCommands creates only the picked items, in the person\'s language', () => {
  const commands = packCommands([], 'th', () => '00000000-0000-4000-8000-000000000001', { only: ['seven'] });
  assert.equal(commands.length, 1);
  assert.equal(commands[0].slot === 'category' && commands[0].kind === 'create' ? commands[0].input.label : '', 'เซเว่น');
});

test('the routed screen keeps today\'s seven until the switch', () => {
  assert.deepEqual(PACK_BEFORE_C3.map((i) => i.key), ['family_out', 'merit', 'delivery', 'phone', 'pets', 'lottery', 'family_in']);
});
