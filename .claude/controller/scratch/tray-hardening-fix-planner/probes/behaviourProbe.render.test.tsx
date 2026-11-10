// Reviewer probes (P2-T13, lens: closing, the lock, the exit and onClosed,
// motion and the swipe). Scratch copy only; never in the worktree.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { AccessibilityInfo, Platform } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

type PanEvent = { translationY: number; velocityY: number };
type PanConfig = { onUpdate?: (event: PanEvent) => void; onDeactivate?: (event: PanEvent) => void } & Record<string, unknown>;
type Gesture = { handlerTag: number; detectorCallbacks: { jsEventHandler: (event: unknown) => void } };
const swipe = vi.hoisted(() => ({ config: null as PanConfig | null, gesture: null as Gesture | null }));
vi.mock('react-native-gesture-handler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native-gesture-handler')>();
  return {
    ...actual,
    usePanGesture: (config: Parameters<typeof actual.usePanGesture>[0]) => {
      swipe.config = config as unknown as PanConfig;
      const gesture = actual.usePanGesture(config);
      swipe.gesture = gesture as unknown as Gesture;
      return gesture;
    },
  };
});

vi.mock('../motion/useWalletMotion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../motion/useWalletMotion')>();
  return {
    ...actual,
    trayEntering: vi.fn(actual.trayEntering),
    trayExiting: vi.fn(actual.trayExiting),
    stepLayout: vi.fn(actual.stepLayout),
  };
});

import { haptics } from '@mobile/lib/haptics';
import { LockCoverContext } from '@mobile/ui/lockCover';
import { stepLayout, trayEntering, trayExiting } from '../motion/useWalletMotion';
import { mountWallet } from '../testing/walletHarness';
import { WalletText } from '../WalletText';
import { Tray } from './Tray';
import type { TrayProps } from './Tray';

const os = Platform.OS;
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
  swipe.config = null;
  swipe.gesture = null;
});

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const TITLE = 'จดรายจ่าย';
function tray(props: Partial<TrayProps> = {}) {
  return (
    <Tray visible onClose={() => undefined} title={TITLE} {...props}>
      {props.children ?? <WalletText>ข้าวมันไก่ 50</WalletText>}
    </Tray>
  );
}
const dialog = () => screen.queryByRole('dialog', { name: TITLE });
const frame = () => (screen.getByTestId('tray').parentElement as HTMLElement);
const escape = () => act(() => { document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' })); });
const pull = (translationY: number) => act(() => { swipe.config?.onUpdate?.({ translationY, velocityY: 0 }); });

// P-A (P11b): "opening the tray, or opening it at another step, plays none".
// A host that resets its step as it opens the tray (one render: visible and step together).
test('P-A: opening the tray at another step in one render plays no tick', async () => {
  const tick = vi.spyOn(haptics, 'selection').mockResolvedValue(undefined);
  const view = mountWallet(tray({ visible: false, step: 'confirm' }));
  await settle();
  view.rerender(tray({ visible: true, step: 'amount' }));
  await settle();
  expect(tick, 'ticks on opening').toHaveBeenCalledTimes(0);
});

// P-B (P10): close, open, close in quick succession: the hide waits for the last close, and onClosed fires once.
test('P-B: close, open, close in quick succession: one hide, one onClosed, 220 ms after the last close', async () => {
  const onClosed = vi.fn();
  const view = mountWallet(tray({ onClosed }));
  await settle();
  vi.useFakeTimers();
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(100); });
  view.rerender(tray({ visible: true, onClosed }));
  act(() => { vi.advanceTimersByTime(50); });
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(219); });
  expect([dialog() !== null, onClosed.mock.calls.length], '219 ms after the last close').toEqual([true, 0]);
  act(() => { vi.advanceTimersByTime(1); });
  expect([dialog() !== null, onClosed.mock.calls.length], '220 ms after the last close').toEqual([false, 1]);
  // A new onClosed function, and more renders with visible false, never fire it again.
  const later = vi.fn();
  view.rerender(tray({ visible: false, onClosed: later }));
  act(() => { vi.advanceTimersByTime(2000); });
  expect([onClosed.mock.calls.length, later.mock.calls.length]).toEqual([1, 0]);
  // Opened and closed again, it fires once more.
  view.rerender(tray({ visible: true, onClosed: later }));
  view.rerender(tray({ visible: false, onClosed: later }));
  act(() => { vi.advanceTimersByTime(220); });
  expect([onClosed.mock.calls.length, later.mock.calls.length]).toEqual([1, 1]);
});

// P-C (P10, R69): onClosed that opens the tray again at once (one tray after another, same Tray).
test('P-C: an onClosed that reopens the tray at once leaves it open and fires once', async () => {
  let reopen: (() => void) | null = null;
  const onClosed = vi.fn(() => { reopen?.(); });
  const view = mountWallet(tray({ onClosed }));
  await settle();
  reopen = () => view.rerender(tray({ visible: true, onClosed }));
  vi.useFakeTimers();
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(220); });
  act(() => { vi.advanceTimersByTime(1000); });
  expect([onClosed.mock.calls.length, dialog() !== null, screen.queryByTestId('tray') !== null]).toEqual([1, true, true]);
});

// P-D (P12): a pull that never ends (the lock cover takes the header away mid-drag), then the cover lifts.
test('P-D: a drag cut off by the lock cover leaves the card pulled down once the cover lifts', async () => {
  const covered = (hidden: boolean) => <LockCoverContext.Provider value={{ hidden }}>{tray()}</LockCoverContext.Provider>;
  const view = mountWallet(covered(false));
  await settle();
  pull(80);
  expect(frame().style.transform).toBe('translateY(80px)');
  view.rerender(covered(true));
  view.rerender(covered(false));
  expect(frame().style.transform, 'the card, after the cover lifts').toBe('translateY(0px)');
});

// P-E (P9, P13): under the cover the backdrop, card and swipe are gone, but the Modal's
// onRequestClose (Android's back; Escape on the web) still asks to close.
test('P-E: under the lock cover the system back still closes the tray', async () => {
  const onClose = vi.fn();
  const covered = (hidden: boolean) => <LockCoverContext.Provider value={{ hidden }}>{tray({ onClose })}</LockCoverContext.Provider>;
  mountWallet(covered(true));
  await settle();
  expect(screen.queryByTestId('lock-cover')).not.toBeNull();
  escape();
  expect(onClose, 'asked to close under the cover').toHaveBeenCalledTimes(0);
});

// P-F (P11a): the answer is read live: the tray opens before the phone answers (reduced, R66),
// the phone then answers full motion, and the close follows that answer.
test('P-F: opened before the answer, closed after it: the exit and the hide follow the answer at close', async () => {
  const onClosed = vi.fn();
  const view = mountWallet(tray({ visible: false, onClosed }), { reducedMotion: 'pending' });
  await settle();
  view.rerender(tray({ visible: true, onClosed }));
  expect(vi.mocked(trayEntering).mock.lastCall, 'entering before the answer').toEqual([true]);
  await act(async () => { view.answerReducedMotion(false); await Promise.resolve(); });
  await settle();
  expect(vi.mocked(stepLayout).mock.lastCall, 'stepLayout after the answer').toEqual([false]);
  vi.mocked(trayExiting).mockClear();
  vi.useFakeTimers();
  view.rerender(tray({ visible: false, onClosed }));
  expect(vi.mocked(trayExiting).mock.calls.every(([reduced]) => reduced === false), 'exit at full motion').toBe(true);
  act(() => { vi.advanceTimersByTime(150); });
  expect(onClosed, 'not at 150 ms').toHaveBeenCalledTimes(0);
  act(() => { vi.advanceTimersByTime(70); });
  expect(onClosed, 'at 220 ms').toHaveBeenCalledTimes(1);
});

// P-G (P11a, W6): the phone's answer changes while the tray is open (reduceMotionChanged):
// the swipe's way back, the step layout and the exit follow the new answer.
test('P-G: a live change to Reduce Motion while open is followed by the swipe, the layout and the exit', async () => {
  let changed: ((reduced: boolean) => void) | null = null;
  const real = AccessibilityInfo.addEventListener.bind(AccessibilityInfo);
  vi.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, handler: (value: boolean) => void) => {
    if (name === 'reduceMotionChanged') changed = handler;
    return real(name as never, handler as never);
  }) as typeof AccessibilityInfo.addEventListener);
  const onClosed = vi.fn();
  const view = mountWallet(tray({ visible: false, onClosed }));
  await settle();
  view.rerender(tray({ visible: true, onClosed }));
  await settle();
  expect(vi.mocked(trayEntering).mock.lastCall).toEqual([false]);
  expect(changed, 'the live listener').not.toBeNull();
  act(() => { changed?.(true); });
  expect(vi.mocked(stepLayout).mock.lastCall, 'stepLayout after the change').toEqual([true]);
  // The swipe now jumps back.
  pull(100);
  act(() => { swipe.config?.onDeactivate?.({ translationY: 100, velocityY: 0 }); });
  expect(frame().style.transform, 'jumps back at once').toBe('translateY(0px)');
  vi.useFakeTimers();
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(150); });
  expect(onClosed, 'the fade’s 150 ms').toHaveBeenCalledTimes(1);
});

// P-H (P12, P15c): the swipe through Gesture Handler's own JS event pipeline, not the wrapped config:
// mounted closed, opened, then begin, activate, move 150 pt and end, as the native side would send them.
test('P-H: the swipe through Gesture Handler’s own handler closes a tray that was mounted closed', async () => {
  const onClose = vi.fn();
  const view = mountWallet(tray({ visible: false, onClose }));
  await settle();
  view.rerender(tray({ visible: true, onClose }));
  await settle();
  const gesture = swipe.gesture as Gesture;
  expect(gesture, 'the gesture').not.toBeNull();
  const send = (event: Record<string, unknown>) => act(() => { gesture.detectorCallbacks.jsEventHandler({ handlerTag: gesture.handlerTag, ...event }); });
  const data = (translationY: number, velocityY = 0) => ({ handlerData: { x: 0, y: 0, absoluteX: 0, absoluteY: 0, translationX: 0, translationY, velocityX: 0, velocityY, numberOfPointers: 1, pointerType: 0 } });
  send({ state: 2, oldState: 0, ...data(0) });
  send({ state: 4, oldState: 2, ...data(12) });
  send({ ...data(150) });
  expect(frame().style.transform).toBe('translateY(150px)');
  send({ state: 5, oldState: 4, ...data(150) });
  expect(onClose).toHaveBeenCalledTimes(1);
  // Locked after the render, through the same pipeline: springs back and asks nothing.
  view.rerender(tray({ visible: true, onClose, locked: true }));
  const locked = swipe.gesture as Gesture;
  const sendLocked = (event: Record<string, unknown>) => act(() => { locked.detectorCallbacks.jsEventHandler({ handlerTag: locked.handlerTag, ...event }); });
  vi.useFakeTimers();
  sendLocked({ state: 2, oldState: 0, ...data(0) });
  sendLocked({ state: 4, oldState: 2, ...data(12) });
  sendLocked({ ...data(200) });
  sendLocked({ state: 5, oldState: 4, ...data(200, 3000) });
  act(() => { vi.advanceTimersByTime(2000); });
  expect([onClose.mock.calls.length, frame().style.transform]).toEqual([1, 'translateY(0px)']);
});

// P-I (P12): a cancelled swipe (the system takes the touch) past the line.
test('P-I: a swipe the system cancels past the line still closes the tray', async () => {
  const onClose = vi.fn();
  const view = mountWallet(tray({ visible: false, onClose }));
  await settle();
  view.rerender(tray({ visible: true, onClose }));
  await settle();
  const gesture = swipe.gesture as Gesture;
  const send = (event: Record<string, unknown>) => act(() => { gesture.detectorCallbacks.jsEventHandler({ handlerTag: gesture.handlerTag, ...event }); });
  const data = (translationY: number, velocityY = 0) => ({ handlerData: { x: 0, y: 0, absoluteX: 0, absoluteY: 0, translationX: 0, translationY, velocityX: 0, velocityY, numberOfPointers: 1, pointerType: 0 } });
  send({ state: 2, oldState: 0, ...data(0) });
  send({ state: 4, oldState: 2, ...data(12) });
  send({ ...data(150) });
  send({ state: 3, oldState: 4, ...data(150) });
  expect(onClose, 'a cancelled swipe asks to close').toHaveBeenCalledTimes(0);
});

// P-J (P13): after the cover lifts, the card plays its entering again.
test('P-J: when the cover lifts the card enters again', async () => {
  const covered = (hidden: boolean) => <LockCoverContext.Provider value={{ hidden }}>{tray()}</LockCoverContext.Provider>;
  const view = mountWallet(covered(false));
  await settle();
  const before = vi.mocked(trayEntering).mock.calls.length;
  view.rerender(covered(true));
  view.rerender(covered(false));
  const card = screen.getByTestId('tray');
  expect([card.style.visibility, card.style.animationName], 'the card after the cover lifts').toEqual(['', '']);
  expect(vi.mocked(trayEntering).mock.calls.length).toBeGreaterThan(before);
});

// P-K (P11b): a step change while the tray is covered (visible) ticks.
test('P-K: a step change under the lock cover ticks', async () => {
  const tick = vi.spyOn(haptics, 'selection').mockResolvedValue(undefined);
  const covered = (step: string) => <LockCoverContext.Provider value={{ hidden: true }}>{tray({ step })}</LockCoverContext.Provider>;
  const view = mountWallet(covered('amount'));
  await settle();
  view.rerender(covered('confirm'));
  expect(tick, 'ticks under the cover').toHaveBeenCalledTimes(0);
});

// P-L (P9): a tap on the page, Escape and close while the tray leaves ask nothing.
test('P-L: during the exit, the backdrop and Escape ask nothing', async () => {
  const onClose = vi.fn();
  const view = mountWallet(tray({ onClose }));
  await settle();
  vi.useFakeTimers();
  view.rerender(tray({ visible: false, onClose }));
  fireEvent.click(screen.getByTestId('tray-backdrop'));
  escape();
  act(() => { vi.advanceTimersByTime(300); });
  expect(onClose).toHaveBeenCalledTimes(0);
});
