import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CATEGORY_COLORS } from '@gogospend/contracts';

import { contrastRatio } from './contrast.ts';
import {
  WALLET_GRAPHIC_PAIRS,
  WALLET_MATERIALS,
  WALLET_TEXT_PAIRS,
  calendarPaint,
  materialPaint,
  tileTint,
  walletDark,
  walletLight,
} from './walletPalette.ts';

const modes = [['light', walletLight], ['dark', walletDark]] as const;

test('the §5.1 tokens, exactly', () => {
  assert.deepEqual([walletLight.ground, walletLight.card, walletLight.ink, walletLight.quiet, walletLight.quietOnGround, walletLight.hairline, walletLight.violet, walletLight.under, walletLight.over],
    ['#F4F3F9', '#FFFFFF', '#111014', '#6B6878', '#4A4756', '#E6E4EE', '#6A4BD4', '#1A7F4B', '#B4364F']);
  assert.deepEqual([walletDark.ground, walletDark.card, walletDark.sheet, walletDark.ink, walletDark.quiet, walletDark.violet, walletDark.under, walletDark.over],
    ['#0E0D12', '#1A1920', '#24222B', '#F4F2FA', '#A9A6B6', '#B9A3F9', '#4CC38A', '#F47C93']);
});

test('text pairs clear 4.5:1 and graphic pairs 3:1 in both modes; the board bar did not (§5.3)', () => {
  for (const [mode, c] of modes) {
    for (const [fg, bg] of WALLET_TEXT_PAIRS) assert.ok(contrastRatio(c[fg] as string, c[bg] as string) >= 4.5, `${mode}: ${fg} on ${bg}`);
    for (const [fg, bg] of WALLET_GRAPHIC_PAIRS) assert.ok(contrastRatio(c[fg] as string, c[bg] as string) >= 3, `${mode}: ${fg} on ${bg}`);
  }
  assert.ok(contrastRatio('#DCD3F7', '#FFFFFF') < 3);
});

test('material text and quiet text clear 4.5:1 on every stop, light and dark', () => {
  for (const isDark of [false, true]) for (const material of WALLET_MATERIALS) {
    const paint = materialPaint(material, isDark);
    for (const { color } of paint.stops) for (const text of [paint.text, paint.quietText]) assert.ok(contrastRatio(text, color) >= 4.5, `${material} ${isDark}`);
  }
  assert.equal(materialPaint('titanium', true).edge, '#5C5968');
});

test('the calendar ramp is wc-calendar, and each day number clears 4.5:1 on its fill', () => {
  assert.deepEqual(([0, 1, 2, 3, 4, 5] as const).map((s) => calendarPaint(s, false).fill), ['#FFFFFF', '#EEE9FC', '#D5C9F7', '#AE97EE', '#6A4BD4', '#3B2790']);
  for (const isDark of [false, true]) for (const s of [0, 1, 2, 3, 4, 5] as const) assert.ok(contrastRatio(calendarPaint(s, isDark).text, calendarPaint(s, isDark).fill) >= 4.5);
});

test('category tiles: the mode ink clears 4.5:1 on every hue tint', () => {
  for (const hue of CATEGORY_COLORS) {
    assert.ok(contrastRatio(walletLight.ink, tileTint(hue, false)) >= 4.5, hue);
    assert.ok(contrastRatio(walletDark.ink, tileTint(hue, true)) >= 4.5, hue);
  }
  assert.equal(tileTint('#F0A868', false), '#FBE7D5');
});
