import { act, cleanup, screen } from '@testing-library/react';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

// react-native-svg's web build resolves image hrefs through React Native's
// asset registry, which only Metro provides. The bun draws no images, so that
// one resolver is stubbed and the real SVG elements still render.
vi.mock('../../../../node_modules/react-native-svg/lib/module/lib/resolveAssetUri.web.js', () => ({ resolveAssetUri: () => null }));

import { motion } from '@mobile/theme/motion';
import { BunPeek, type BunPeekEdge } from './BunPeek';
import { installBrowserStorage, mountMascot } from './mascotTestHarness';
import { BUN_POSES, BUN_SIZES, bunHeight } from './poses';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

function Card({ peek }: { peek?: BunPeekEdge }) {
  return (
    <View testID="card" style={{ padding: 16, borderWidth: 2, marginTop: 40 }}>
      {peek ? <BunPeek edge={peek} testID="peek" /> : null}
      <Text>฿12,480 of ฿18,000</Text>
    </View>
  );
}

function snapshot(card: HTMLElement, without?: Element) {
  return {
    style: card.getAttribute('style'),
    className: card.className,
    flow: [...card.children].filter((child) => child !== without).map((child) => child.outerHTML),
  };
}

const EDGES: readonly BunPeekEdge[] = ['top', 'left', 'right'];
// The peek pose drawn at size m: as wide as the bun, as tall as its visible top.
const across = BUN_SIZES.m;
const out = bunHeight(BUN_POSES.peek, BUN_SIZES.m);

test.each(EDGES)('peeking over the %s edge leaves the card laid out exactly as before', (edge) => {
  mountMascot(<Card />);
  const before = snapshot(screen.getByTestId('card'));
  cleanup();

  mountMascot(<Card peek={edge} />);
  const card = screen.getByTestId('card');
  const host = screen.getByTestId('peek');
  expect(host.parentElement).toBe(card);
  expect(snapshot(card, host)).toEqual(before);

  // Out of the flow, outside the card's box, and never taking a touch.
  expect(host.style.position).toBe('absolute');
  expect(host.style.pointerEvents).toBe('none');
  expect([host.style.overflow, host.style.overflowX, host.style.overflowY]).toContain('hidden');
  const outside = { top: ['bottom', 'height'], left: ['right', 'width'], right: ['left', 'width'] } as const;
  const [side, depth] = outside[edge];
  expect(host.style[side]).toBe('100%');
  expect(parseFloat(host.style[depth])).toBeCloseTo(out, 6);
  expect(parseFloat(host.style[depth === 'height' ? 'width' : 'height'])).toBe(across);
});

test('it pops in with a small spring', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const spring = vi.spyOn(Animated, 'spring');
  mountMascot(<Card peek="top" />);
  await act(async () => { await Promise.resolve(); });
  expect(spring).toHaveBeenCalledTimes(1);
  expect(spring.mock.calls[0][1]).toMatchObject({ toValue: 1, ...motion.spring.gentle });
});

test('under reduced motion it simply appears, with no spring at all', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const spring = vi.spyOn(Animated, 'spring');
  mountMascot(<Card peek="top" />);
  await act(async () => { await Promise.resolve(); });
  expect(spring).not.toHaveBeenCalled();
  const slide = screen.getByTestId('peek').firstElementChild as HTMLElement;
  expect(slide.style.transform).toMatch(/translateY\(0px\)/);
  expect(slide.style.opacity).toBe('1');
});
