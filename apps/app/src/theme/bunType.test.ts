import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BUN_MAX_FONT_SCALE, BUN_TYPE_SCALE, RECEIPT_SERIF, bunText, receiptAmount } from './bunType.ts';
import type { BunTextRole } from './bunType.ts';
import { LATIN_UI_FONT_FAMILY, THAI_UI_FONT_FAMILY } from './uiFontFamily.ts';

const ROLES: readonly BunTextRole[] = ['hero', 'title', 'heading', 'body', 'label', 'caption', 'micro'];

test('the scale steps down from hero to micro, never below 11', () => {
  const sizes = ROLES.map((role) => BUN_TYPE_SCALE[role].size);
  for (let index = 1; index < sizes.length; index += 1) assert.ok(sizes[index] < sizes[index - 1], `${ROLES[index]} is smaller than ${ROLES[index - 1]}`);
  assert.ok(sizes[sizes.length - 1] >= 11);
  assert.equal(BUN_TYPE_SCALE.body.size, 17);
  assert.equal(BUN_TYPE_SCALE.body.weight, '400');
  assert.equal(BUN_TYPE_SCALE.hero.weight, '700');
});

test('Thai text gets more leading than Latin at every size', () => {
  for (const role of ROLES) {
    const thai = bunText(role, 'thai');
    const latin = bunText(role, 'latin');
    assert.equal(thai.fontSize, BUN_TYPE_SCALE[role].size);
    assert.equal(latin.fontSize, BUN_TYPE_SCALE[role].size);
    assert.ok(thai.lineHeight >= Math.ceil(thai.fontSize * 1.45), `${role}: Thai leading`);
    assert.ok(latin.lineHeight >= Math.ceil(latin.fontSize * 1.25), `${role}: Latin leading`);
    assert.ok(thai.lineHeight > latin.lineHeight, `${role}: Thai taller than Latin`);
    assert.equal(thai.fontWeight, BUN_TYPE_SCALE[role].weight);
  }
});

test('Thai uses Anuphan, Latin and Vietnamese use DM Sans', () => {
  assert.equal(bunText('body', 'thai').fontFamily, THAI_UI_FONT_FAMILY);
  assert.equal(bunText('body', 'latin').fontFamily, LATIN_UI_FONT_FAMILY);
});

test('receipt amounts use the platform serif with tabular figures', () => {
  assert.ok(RECEIPT_SERIF.length > 0);
  assert.notEqual(RECEIPT_SERIF, LATIN_UI_FONT_FAMILY);
  const style = receiptAmount(28);
  assert.equal(style.fontFamily, RECEIPT_SERIF);
  assert.equal(style.fontSize, 28);
  assert.ok(style.lineHeight >= Math.ceil(28 * 1.2));
  assert.deepEqual(style.fontVariant, ['tabular-nums']);
});

// iOS's largest standard text size (xxxLarge) scales text by 1.353; only the
// accessibility sizes go beyond it, up to 3.571 (AX5). Android's font scale
// tops out at 2.
const LARGEST_STANDARD_SCALE = 1.353;
const LARGEST_ACCESSIBILITY_SCALE = 3.571;

test('every role follows the person’s text size through all the standard sizes, uncapped', () => {
  for (const role of ROLES) assert.ok(BUN_MAX_FONT_SCALE[role] >= LARGEST_STANDARD_SCALE, `${role} is capped below xxxLarge`);
});

test('at the largest accessibility size, reading text grows the most and display text the least, so words stay whole', () => {
  const largest = (role: BunTextRole) => BUN_TYPE_SCALE[role].size * Math.min(BUN_MAX_FONT_SCALE[role], LARGEST_ACCESSIBILITY_SCALE);
  // Reading text at least doubles.
  for (const role of ['body', 'label', 'caption', 'micro'] as const) assert.ok(BUN_MAX_FONT_SCALE[role] >= 2, `${role} grows at least 2x`);
  // The scale keeps its order: a heading is never smaller than body text at any size.
  for (let index = 1; index < ROLES.length; index += 1) assert.ok(largest(ROLES[index]) < largest(ROLES[index - 1]), `${ROLES[index]} stays below ${ROLES[index - 1]}`);
  // Nothing grows past 48 pt, so "September 2026" or "฿12,450.00" still fits a 320 pt line.
  for (const role of ROLES) assert.ok(largest(role) <= 48, `${role} reaches ${largest(role)} pt`);
});
