import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CATEGORY_COLORS } from '@gogospend/contracts';

import { BUN_TEXT_PAIRS, BUN_TILE_TEXT, bunDark, bunLight, getBunColors } from './bunPalette.ts';
import type { BunColors } from './bunPalette.ts';
import { contrastRatio, relativeLuminance } from './contrast.ts';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} is not ${expected}`);

test('contrast follows WCAG 2.x', () => {
  near(relativeLuminance('#FFFFFF'), 1);
  near(relativeLuminance('#000000'), 0);
  near(contrastRatio('#000000', '#FFFFFF'), 21);
  near(contrastRatio('#FFFFFF', '#000000'), 21);
  near(contrastRatio('#3B3B3B', '#3B3B3B'), 1);
  // The greys WCAG's own examples sit either side of 4.5:1.
  assert.ok(contrastRatio('#767676', '#FFFFFF') >= 4.5);
  assert.ok(contrastRatio('#777777', '#FFFFFF') < 4.5);
  assert.throws(() => relativeLuminance('red'));
});

/** Hue in degrees of `#RRGGBB`. */
function hue(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const modes: readonly [string, BunColors][] = [['light', bunLight], ['dark', bunDark]];

test('both modes define every colour as #RRGGBB', () => {
  assert.deepEqual(Object.keys(bunDark).sort(), Object.keys(bunLight).sort());
  for (const [mode, colors] of modes) {
    for (const [key, value] of Object.entries(colors)) {
      if (key === 'isDark') continue;
      assert.match(String(value), /^#[0-9A-F]{6}$/, `${mode}.${key}`);
    }
  }
  assert.equal(bunLight.isDark, false);
  assert.equal(bunDark.isDark, true);
  assert.equal(getBunColors('light'), bunLight);
  assert.equal(getBunColors('dark'), bunDark);
});

test('every text pair the kit uses meets WCAG AA (4.5:1) in both modes', () => {
  assert.ok(BUN_TEXT_PAIRS.length >= 12, 'the kit lists its text pairs');
  for (const [mode, colors] of modes) {
    for (const [text, ground] of BUN_TEXT_PAIRS) {
      const ratio = contrastRatio(colors[text], colors[ground]);
      assert.ok(ratio >= 4.5, `${mode}: ${text} on ${ground} is ${ratio.toFixed(2)}:1`);
    }
  }
});

test('the lavender stage carries ink text only', () => {
  const onStage = BUN_TEXT_PAIRS.filter(([, ground]) => ground === 'stage').map(([text]) => text);
  assert.deepEqual(onStage, ['ink']);
  // And the colours the kit keeps off the stage really would fail there in light mode.
  assert.ok(contrastRatio(bunLight.muted, bunLight.stage) < 4.5);
});

test('outlines are visible (3:1) and budget states are distinct', () => {
  for (const [mode, colors] of modes) {
    for (const ground of [colors.card, colors.background, colors.paper]) {
      assert.ok(contrastRatio(colors.ink, ground) >= 3, `${mode}: outline`);
    }
    // Red and green carry similar lightness so both can be text, which is why
    // the budget components always say "over" or "left" in words as well
    // (WCAG 1.4.1). The palette's part is a clearly different hue.
    const gap = Math.abs(hue(colors.over) - hue(colors.under));
    assert.ok(Math.min(gap, 360 - gap) >= 90, `${mode}: over and under differ in hue`);
  }
});

test('category tiles: the tile ink meets AA on every category pastel in both modes', () => {
  for (const [mode, colors] of modes) {
    const ink = colors[BUN_TILE_TEXT[colors.isDark ? 'dark' : 'light']];
    for (const hue of CATEGORY_COLORS) {
      const ratio = contrastRatio(ink, hue);
      assert.ok(ratio >= 4.5, `${mode}: tile ink on ${hue} is ${ratio.toFixed(2)}:1`);
    }
  }
});
