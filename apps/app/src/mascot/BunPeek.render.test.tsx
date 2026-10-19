import { act, cleanup, screen } from '@testing-library/react';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { motion } from '@mobile/theme/motion';
import { BUN_SPACE } from '@mobile/ui/layout';
import { BunPeek, type BunPeekAlign, type BunPeekEdge } from './BunPeek';
import { installBrowserStorage, mountMascot } from './mascotTestHarness';
import { BUN_POSES, BUN_SIZES, bunHeight } from './poses';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear(); });

function Card({ peek, align }: { peek?: BunPeekEdge; align?: BunPeekAlign }) {
  return (
    <View testID="card" style={{ padding: 16, borderWidth: 2, marginTop: 40 }}>
      {peek ? <BunPeek edge={peek} align={align} testID="peek" /> : null}
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

  // Out of the flow and never taking a touch. Where it sits is pinned below.
  expect(host.style.position).toBe('absolute');
  expect(host.style.pointerEvents).toBe('none');
});

type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];
const ALIGNS: readonly BunPeekAlign[] = ['start', 'center', 'end'];
const md = BUN_SPACE.md;
// Every inset the host sets, in points; the sides not named stay unset. The
// far side is minus the bun's depth, so the host ends exactly on the edge.
// `center` spans the whole edge and centres the bun inside it.
const INSETS: Readonly<Record<BunPeekEdge, Readonly<Record<BunPeekAlign, Partial<Record<Side, number>>>>>> = {
  top: { start: { top: -out, left: md }, center: { top: -out, left: 0, right: 0 }, end: { top: -out, right: md } },
  left: { start: { left: -out, top: md }, center: { left: -out, top: 0, bottom: 0 }, end: { left: -out, bottom: md } },
  right: { start: { right: -out, top: md }, center: { right: -out, top: 0, bottom: 0 }, end: { right: -out, bottom: md } },
};
const PLACEMENTS = EDGES.flatMap((edge) => ALIGNS.map((align) => ({ edge, align })));

const clips = (element: HTMLElement) => [element.style.overflow, element.style.overflowX, element.style.overflowY].includes('hidden');

// On device, percentage insets do not resolve against an auto-sized parent:
// the host fell back to the parent's top-left corner, over its content.
test.each(PLACEMENTS)('over the $edge edge at $align, the host is placed in plain points, wholly outside the card', ({ edge, align }) => {
  mountMascot(<Card peek={edge} align={align} />);
  const host = screen.getByTestId('peek');
  const style = host.getAttribute('style') ?? '';
  expect(style).not.toMatch(/%/);
  expect(style).not.toMatch(/margin/);

  const expected = INSETS[edge][align];
  for (const side of SIDES) {
    const inset = expected[side];
    if (inset === undefined) expect(host.style[side], side).toBe('');
    else expect(parseFloat(host.style[side]), side).toBeCloseTo(inset, 6);
  }
  // Exactly as deep as the bun's visible part, so it ends on the edge.
  const [depth, length] = edge === 'top' ? (['height', 'width'] as const) : (['width', 'height'] as const);
  expect(parseFloat(host.style[depth])).toBeCloseTo(out, 6);
  if (align === 'center') {
    // Spans the edge (set by its two insets) and centres the bun along it.
    expect(host.style[length]).toBe('');
    expect(host.style.alignItems).toBe('center');
    expect(host.style.justifyContent).toBe('center');
  } else {
    expect(parseFloat(host.style[length])).toBe(across);
  }

  // A clip exactly the bun's size at the edge hides it while it slides out.
  const clip = host.firstElementChild as HTMLElement;
  expect(clips(clip)).toBe(true);
  expect(parseFloat(clip.style[depth])).toBeCloseTo(out, 6);
  expect(parseFloat(clip.style[length])).toBe(across);
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
  const slide = screen.getByTestId('peek').firstElementChild?.firstElementChild as HTMLElement;
  expect(slide.style.transform).toMatch(/translateY\(0px\)/);
  expect(slide.style.opacity).toBe('1');
});
