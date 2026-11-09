// The grow bar (P2-T9; ax-motion's budget bar, R66). It is decorative. Under
// Reduce Motion, and before the phone has answered, it is drawn at its value
// and never moves; at full motion it grows from nothing to its value over
// 320 ms, whatever Reanimated's own reduce-motion setting says (W6). Each case
// mounts once through mountWallet and settles the phone's answer inside act. A
// bar decides at mount, so a case that needs the answer mounts the bar after
// it, through rerender. No case counts the phone's asks: the harness's spy
// adds them up across mounts, and kit parts ask too.
import { act, cleanup, screen } from '@testing-library/react';
import { Text } from 'react-native';
import { ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
import { walletLight } from '@mobile/theme/walletPalette';
import { mountWallet } from '../testing/walletHarness';
import { GrowBar } from './GrowBar';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
});

/** Lets the phone's answer and Bun's AI preferences arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const INK = walletLight.ink;
const TRACK = walletLight.track;
const bar = (fraction: number) => <GrowBar fraction={fraction} color={INK} track={TRACK} />;
const track = () => screen.getByTestId('grow-bar');
const fill = () => screen.getByTestId('grow-bar-fill');

/**
 * A kit part that asks the phone itself, as Sheet, UndoBar and BunPeek do
 * (src/hooks/useReducedMotion.ts). It asks before the wallet root does, so
 * with it on screen the bar must still get the phone's answer from the root.
 */
function AsksThePhone() {
  return <Text testID="app-wide">{`app-wide reduced=${useReducedMotion()}`}</Text>;
}

test('under reduced motion the bar is drawn at its value', async () => {
  const view = mountWallet(<><AsksThePhone /><Text>before</Text></>, { reducedMotion: true });
  await settle();
  expect(screen.getByTestId('app-wide').textContent).toBe('app-wide reduced=true');
  view.rerender(<><AsksThePhone />{bar(0.62)}</>);
  expect(fill().style.width).toBe('62%');
  expect([fill().style.backgroundColor, fill().style.height, fill().style.borderRadius]).toEqual([rgba(INK), '100%', '3px']);
  expect([track().style.backgroundColor, track().style.height, track().style.borderRadius]).toEqual([rgba(TRACK), '6px', '3px']);
  view.rerender(<><AsksThePhone /><GrowBar fraction={0.62} color={INK} track={TRACK} height={10} /></>);
  expect([track().style.height, track().style.borderRadius, fill().style.borderRadius, fill().style.width]).toEqual(['10px', '5px', '5px', '62%']);
});

test('before the phone answers, the bar is drawn still at its value', async () => {
  const { answerReducedMotion } = mountWallet(bar(0.62), { reducedMotion: 'pending' });
  await settle();
  expect(fill().style.width).toBe('62%');
  await act(async () => { answerReducedMotion(false); });
  // The answer came after the bar was drawn, so the bar stays as it was.
  expect(fill().style.width).toBe('62%');
});

test('the fill never passes the track', async () => {
  const view = mountWallet(bar(1.4), { reducedMotion: true });
  await settle();
  expect(fill().style.width).toBe('100%');
  // Not a number draws an empty bar. (The page keeps a width it cannot read,
  // so each case follows one that drew another width.)
  view.rerender(bar(Number.NaN));
  expect(fill().style.width).toBe('0%');
  view.rerender(bar(0.5));
  expect(fill().style.width).toBe('50%');
  view.rerender(bar(-0.2));
  expect(fill().style.width).toBe('0%');
});

test('the bar is hidden from screen readers', async () => {
  const view = mountWallet(<Text>before</Text>);
  await settle();
  view.rerender(bar(0.62));
  expect(track().getAttribute('aria-hidden')).toBe('true');
  expect(fill().closest('[aria-hidden="true"]')).toBe(track());
  expect(track().textContent).toBe('');
});

test('at full motion the bar grows from nothing to its value over 320 ms, and on to a new value', async () => {
  const view = mountWallet(<Text>before</Text>);
  await settle();
  vi.useFakeTimers();
  view.rerender(bar(0.62));
  expect(fill().style.width).toBe('0%');
  expect([fill().style.backgroundColor, fill().style.borderRadius]).toEqual([rgba(INK), '3px']);
  act(() => { vi.advanceTimersByTime(160); });
  const halfway = Number.parseFloat(fill().style.width);
  expect(halfway > 0 && halfway < 62, `${halfway}% at 160 ms`).toBe(true);
  act(() => { vi.advanceTimersByTime(160); });
  expect(fill().style.width).toBe('62%');
  view.rerender(bar(0.8));
  act(() => { vi.advanceTimersByTime(320); });
  expect(fill().style.width).toBe('80%');
});

test("the wallet's answer decides, not Reanimated's own reduce-motion setting (W6)", async () => {
  // Reanimated warns once that its setting is overwritten here.
  const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const view = mountWallet(<><ReducedMotionConfig mode={ReduceMotion.Always} /><Text>before</Text></>);
  await settle();
  vi.useFakeTimers();
  view.rerender(<><ReducedMotionConfig mode={ReduceMotion.Always} />{bar(0.62)}</>);
  act(() => { vi.advanceTimersByTime(160); });
  const halfway = Number.parseFloat(fill().style.width);
  expect(halfway > 0 && halfway < 62, `${halfway}% at 160 ms`).toBe(true);
  expect(warned).toHaveBeenCalledWith(expect.stringContaining("Reduced motion setting is overwritten with mode 'always'"));
});
