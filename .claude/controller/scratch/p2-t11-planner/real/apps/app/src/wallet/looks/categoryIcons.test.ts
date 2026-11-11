// Category icons in the Bun Wallet (P2-T11, W7, W8): a kept icon wins, then
// the Thai pack's glyph (recognised by name), then the built-in drawing, else
// the tile shows the initial. The picker's glyphs are wc-category-edit's own
// shapes; the built-in keys keep today's drawings.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { BUILTIN_CATEGORIES } from '@gogospend/contracts';

import { CATEGORY_DRAWINGS } from '../../ui/categoryDrawings.ts';
import type { DrawingShape } from '../../ui/categoryDrawings.ts';
import { THAI_EVERYDAY_PACK } from '../../spend/v1/redesign/planning/thaiPack.ts';
import { CATEGORY_PICKER_GLYPHS, glyphShapes, isGlyphKey } from './categoryGlyphs.ts';
import { iconFor, PACK_GLYPH, parseIcons } from './categoryIcons.ts';

const BOARD = join(dirname(fileURLToPath(import.meta.url)), '../../../../../docs/design/bun-wallet/wc-category-edit.dc.html');

const custom = (id: string, label: string, type: 'expense' | 'income' = 'expense') => ({ id, type, label, builtin_key: null });

test('a kept icon wins, then the pack glyph, then the built-in drawing, else the initial', () => {
  assert.equal(iconFor(custom('c1', 'ทำบุญ'), {}), 'lotus');
  assert.equal(iconFor({ id: 'c2', type: 'expense', label: null, builtin_key: 'food' }, {}), 'food');
  assert.equal(iconFor(custom('c3', 'Art'), {}), null);
  // The pack is recognised by any of its names: an earlier pack's delivery is C3's.
  assert.equal(iconFor(custom('c4', '  สั่งอาหารเดลิเวอรี่ '), {}), 'food');
  assert.equal(iconFor(custom('c5', 'Pets', 'income'), {}), null);
  // What the person kept beats the pack's glyph, the built-in drawing and the initial.
  const kept = { c1: 'book', c2: 'coffee', c3: 'paw' } as const;
  assert.deepEqual(
    [iconFor(custom('c1', 'ทำบุญ'), kept), iconFor({ id: 'c2', type: 'expense', label: null, builtin_key: 'food' }, kept), iconFor(custom('c3', 'Art'), kept)],
    ['book', 'coffee', 'paw'],
  );
  // A look kept for another category is not this one's.
  assert.equal(iconFor(custom('c6', 'Art'), kept), null);
});

test('damaged kept icons are dropped', () => {
  assert.deepEqual(parseIcons('{"c1":"lotus","c2":"boat","c3":5,"c4":"food","c5":"toString","c6":null}'), { c1: 'lotus', c4: 'food' });
  for (const raw of [null, 'nope', '[]', '["lotus"]', 'null', '"lotus"']) assert.deepEqual(parseIcons(raw), {}, String(raw));
  assert.equal(isGlyphKey('transfer'), true);
  assert.equal(isGlyphKey('constructor'), false);
});

test("C3's nine each have the picker's glyph for them", () => {
  assert.deepEqual(PACK_GLYPH, {
    family_out: 'heart', merit: 'lotus', delivery: 'food', motorbike_rail: 'car', topup: 'phone', seven: 'bag', lottery: 'receipt', pets: 'paw', family_in: 'heart',
  });
  for (const item of THAI_EVERYDAY_PACK) {
    assert.ok(CATEGORY_PICKER_GLYPHS.includes(PACK_GLYPH[item.key]), item.key);
    assert.equal(iconFor(custom(`pack-${item.key}`, item.th, item.type), {}), PACK_GLYPH[item.key], item.key);
  }
});

/** The board's shapes for one picker button: a path is its `d`, a circle filled unless its fill is none, a rectangle with its corner. */
function boardShapes(markup: string): DrawingShape[] {
  return [...markup.matchAll(/<(path|circle|rect)\s([^>]*)>/g)].map(([, tag, attributes]) => {
    const attribute = (name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes)?.[1] ?? '';
    const number = (name: string) => Number(attribute(name));
    if (tag === 'path') return { d: attribute('d') };
    if (tag === 'circle') {
      const circle = [number('cx'), number('cy'), number('r')] as const;
      return attribute('fill') === 'none' ? { circle } : { circle, filled: true };
    }
    return { rect: [number('x'), number('y'), number('width'), number('height')] as const, rx: number('rx') };
  });
}

test('every picker glyph has shapes copied from the board', () => {
  const board = readFileSync(BOARD, 'utf8');
  const picker = board.slice(board.indexOf('aria-labelledby="wc-icon-label"'));
  const buttons = [...picker.matchAll(/<button type="button" aria-label="([^"]+)"[^>]*>(.*?)<\/button>/gs)].slice(0, 12);
  assert.deepEqual(buttons.map(([, label]) => label), ['อาหาร', 'กาแฟ', 'รถ', 'ถุงช้อปปิ้ง', 'บ้าน', 'ใบเสร็จ', 'หัวใจ', 'ดอกบัว', 'ของขวัญ', 'มือถือ', 'รอยเท้าสัตว์', 'หนังสือ']);
  assert.deepEqual(CATEGORY_PICKER_GLYPHS, ['food', 'coffee', 'car', 'bag', 'home', 'receipt', 'heart', 'lotus', 'gift', 'phone', 'paw', 'book']);
  CATEGORY_PICKER_GLYPHS.forEach((key, index) => {
    assert.ok(glyphShapes(key).length > 0, key);
    // Food and gift are built-in keys, so they draw the built-in food and gift, one drawing per key.
    if (key === 'food' || key === 'gift') assert.deepEqual(glyphShapes(key), CATEGORY_DRAWINGS[key], key);
    else assert.deepEqual(glyphShapes(key), boardShapes(buttons[index][2]), key);
  });
});

test("every built-in key and a transfer draw today's drawings, moved unchanged", () => {
  const keys = [...BUILTIN_CATEGORIES.map((category) => category.key), 'transfer'] as const;
  assert.deepEqual(Object.keys(CATEGORY_DRAWINGS).sort(), [...keys].sort());
  for (const key of keys) assert.equal(glyphShapes(key), CATEGORY_DRAWINGS[key], key);
  // The SHA-256 of today's eleven drawings as JSON, as categoryIcons.tsx held them before the move.
  assert.equal(createHash('sha256').update(JSON.stringify(CATEGORY_DRAWINGS)).digest('hex'), 'fde42e0959f8abdd10c221163f2a6fa5bcd69b75d08b0d1a3138288cca55ae81');
});
