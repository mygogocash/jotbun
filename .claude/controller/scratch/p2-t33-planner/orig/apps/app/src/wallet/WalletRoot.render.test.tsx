// The wallet root (P2-T2): Reanimated and Gesture Handler load in the render
// suite (R72), and the wallet asks the phone about reduced motion once, at the
// root. Until the phone answers, motion reads as reduced (R66, W6), so no
// wallet animation starts at full motion; then it follows the phone's live
// answer.
import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { AccessibilityInfo, Platform, Text } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { afterEach, expect, test, vi } from 'vitest';

import { WalletRoot } from './WalletRoot';
import { useReducedMotionKnown, useWalletReducedMotion } from './motion/reducedMotion';

const os = Platform.OS;
afterEach(() => {
  cleanup();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  vi.restoreAllMocks();
});

/** The phone: its first answer, held until the test gives it, and a change sent to every live listener. */
function holdPhone() {
  const listeners = new Set<(value: boolean) => void>();
  const phone = {
    answer: (_value: boolean) => {},
    fail: (_error: Error) => {},
    change: (value: boolean) => { for (const listener of [...listeners]) listener(value); },
    listening: () => listeners.size,
  };
  const first = new Promise<boolean>((resolve, reject) => {
    phone.answer = resolve;
    phone.fail = reject;
  });
  // A failed answer nobody asked for is not this fake's error to report.
  first.catch(() => {});
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(first);
  vi.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, handler: (value: boolean) => void) => {
    if (event === 'reduceMotionChanged') listeners.add(handler);
    return { remove: () => { listeners.delete(handler); } };
  }) as never);
  return phone;
}

function Mover() {
  const pan = usePanGesture({ runOnJS: true });
  return (
    <GestureDetector gesture={pan}>
      <Animated.View testID="mover" entering={FadeIn.duration(150).reduceMotion(ReduceMotion.Never)} />
    </GestureDetector>
  );
}

function Probe({ testID = 'motion' }: { testID?: string }) {
  return <Text testID={testID}>{`reduced=${useWalletReducedMotion()} known=${useReducedMotionKnown()}`}</Text>;
}

const shown = (testID = 'motion') => screen.getByTestId(testID).textContent;

test('Reanimated and Gesture Handler load in the render suite without a console error', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const errors = vi.spyOn(console, 'error');
  render(<WalletRoot><Mover /></WalletRoot>);
  expect(await screen.findByTestId('mover')).toBeTruthy();
  expect(errors).not.toHaveBeenCalled();
});

// Gesture Handler checks for its root view in a development build on a phone,
// never on the web. The render suite is a development build (`__DEV__`, in
// vitest.render.config.ts), so the test asks as a phone would.
test("on a phone, a gesture inside the wallet root finds Gesture Handler's root view", async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const errors = vi.spyOn(console, 'error');
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  render(<WalletRoot><Mover /></WalletRoot>);
  expect(await screen.findByTestId('mover')).toBeTruthy();
  expect(errors).not.toHaveBeenCalled();
});

test('reduced motion reads as on until the phone answers, then follows it', async () => {
  const phone = holdPhone();
  render(<WalletRoot><Probe /></WalletRoot>);
  expect(shown()).toBe('reduced=true known=false');
  await act(async () => { phone.answer(false); });
  expect(shown()).toBe('reduced=false known=true');
  act(() => { phone.change(true); });
  expect(shown()).toBe('reduced=true known=true');
  act(() => { phone.change(false); });
  expect(shown()).toBe('reduced=false known=true');
});

test('the root asks the phone once and keeps one listener, however many parts read the answer', async () => {
  const phone = holdPhone();
  const { unmount } = render(<WalletRoot><Probe testID="a" /><Probe testID="b" /><Probe testID="c" /></WalletRoot>);
  await act(async () => { phone.answer(true); });
  expect(['a', 'b', 'c'].map((id) => shown(id))).toEqual(Array(3).fill('reduced=true known=true'));
  expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
  expect(AccessibilityInfo.addEventListener).toHaveBeenCalledTimes(1);
  expect(phone.listening()).toBe(1);
  unmount();
  expect(phone.listening()).toBe(0);
});

test('a phone that cannot answer reads as full motion, as the app-wide hook does', async () => {
  const phone = holdPhone();
  render(<WalletRoot><Probe /></WalletRoot>);
  await act(async () => { phone.fail(new Error('no answer')); });
  expect(shown()).toBe('reduced=false known=true');
});

test('a change heard before the first answer is not overwritten by that older answer', async () => {
  const phone = holdPhone();
  render(<WalletRoot><Probe /></WalletRoot>);
  act(() => { phone.change(true); });
  expect(shown()).toBe('reduced=true known=true');
  await act(async () => { phone.answer(false); });
  expect(shown()).toBe('reduced=true known=true');
});

// React's development double run asks twice; the first ask's late answer is
// older than a change the second one heard.
test("when the ask runs again, the first run's late answer never overwrites a newer change", async () => {
  const phone = holdPhone();
  render(<StrictMode><WalletRoot><Probe /></WalletRoot></StrictMode>);
  act(() => { phone.change(true); });
  await act(async () => { phone.answer(false); });
  expect(shown()).toBe('reduced=true known=true');
});

test('outside the root, the hooks answer the same way on their own', async () => {
  const phone = holdPhone();
  render(<Probe />);
  expect(shown()).toBe('reduced=true known=false');
  await act(async () => { phone.answer(false); });
  expect(shown()).toBe('reduced=false known=true');
  act(() => { phone.change(true); });
  expect(shown()).toBe('reduced=true known=true');
});
