// Reviewer probes for tray-hardening (scratch copy only; never part of the task).
// A Modal that behaves as React Native 0.88's Modal.js does on iOS: a class whose
// native "dismissal ended" event calls setState({ isRendered: false }, cb), and cb
// calls the latest props.onDismiss. The shipped test's Modal mock calls it between
// commits instead, so it cannot see which commit the callback runs in.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

const ios = vi.hoisted(() => ({ modal: null as null | { nativeEnd: () => void }, ends: 0, autoEnd: false, hideCommits: 0 }));
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  const React = await import('react');
  type P = Record<string, unknown> & { visible?: boolean; onDismiss?: () => void };
  class IosModal extends React.Component<P, { isRendered: boolean }> {
    state = { isRendered: this.props.visible === true };
    componentDidMount() { ios.modal = this; }
    componentDidUpdate(prev: P) {
      if (prev.visible === false && this.props.visible === true) this.setState({ isRendered: true });
      if (ios.autoEnd && prev.visible === true && this.props.visible === false) {
        ios.hideCommits += 1;
        // The earliest the native end can reach JS: a microtask queued in the hide commit's layout phase,
        // which runs before the scheduler task that flushes that commit's passive effects.
        queueMicrotask(() => this.nativeEnd());
      }
    }
    // The host view's onDismiss event, as Modal.js handles it (Modal.js lines 315 to 323).
    nativeEnd = () => {
      ios.ends += 1;
      this.setState({ isRendered: false }, () => { this.props.onDismiss?.(); });
    };
    render() { return React.createElement(actual.Modal as never, { ...this.props, onDismiss: undefined } as never); }
  }
  return { ...actual, Modal: IosModal };
});

type PanEvent = { translationY: number; velocityY: number; canceled?: boolean };
type PanConfig = { onUpdate?: (event: PanEvent) => void; onDeactivate?: (event: PanEvent) => void } & Record<string, unknown>;
type Pan = { handlerTag: number; detectorCallbacks: { jsEventHandler: (event: unknown) => void } };
const swipe = vi.hoisted(() => ({ config: null as PanConfig | null, gesture: null as Pan | null }));
vi.mock('react-native-gesture-handler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native-gesture-handler')>();
  return {
    ...actual,
    usePanGesture: (config: Parameters<typeof actual.usePanGesture>[0]) => {
      swipe.config = config as unknown as PanConfig;
      const gesture = actual.usePanGesture(config);
      swipe.gesture = gesture as unknown as Pan;
      return gesture;
    },
  };
});

import { haptics } from '@mobile/lib/haptics';
import { LockCoverContext } from '@mobile/ui/lockCover';
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
  ios.modal = null;
  ios.ends = 0;
  ios.autoEnd = false;
  ios.hideCommits = 0;
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  delete (AccessibilityInfo as unknown as Record<string, unknown>).sendAccessibilityEvent;
});

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const platform = (value: string) => Object.defineProperty(Platform, 'OS', { value, configurable: true, writable: true });
function phoneFocus() {
  Object.defineProperty(AccessibilityInfo, 'sendAccessibilityEvent', { value: () => undefined, configurable: true, writable: true });
}
const TITLE = 'จดรายจ่าย';
function tray(props: Partial<TrayProps> = {}) {
  return (
    <Tray visible onClose={() => undefined} title={TITLE} {...props}>
      {props.children ?? <WalletText>ข้าวมันไก่ 50</WalletText>}
    </Tray>
  );
}
const covered = (hidden: boolean, props: Partial<TrayProps> = {}) => <LockCoverContext.Provider value={{ hidden }}>{tray(props)}</LockCoverContext.Provider>;
const nativeEnd = () => { expect(ios.modal, 'the Modal').not.toBeNull(); act(() => { ios.modal?.nativeEnd(); }); };

async function iosTray(onClosed: () => void) {
  phoneFocus();
  const view = mountWallet(tray({ visible: false, onClosed }));
  await settle();
  platform('ios');
  view.rerender(tray({ onClosed }));
  await settle();
  vi.useFakeTimers();
  return view;
}

test('R-a: one hide, one late end: onClosed once', async () => {
  const onClosed = vi.fn();
  const view = await iosTray(onClosed);
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(220); });
  expect(onClosed).toHaveBeenCalledTimes(0);
  nativeEnd();
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('R-b: hide, reopen, late end says nothing; the next hide and its end say it once', async () => {
  const onClosed = vi.fn();
  const view = await iosTray(onClosed);
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(220); });
  view.rerender(tray({ onClosed }));
  nativeEnd();
  expect(onClosed, 'late end while open').toHaveBeenCalledTimes(0);
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(220); });
  nativeEnd();
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('R-c: two reopen-and-close rounds before any late end (both ends arrive after the second hide)', async () => {
  const onClosed = vi.fn();
  const view = await iosTray(onClosed);
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(220); });
  view.rerender(tray({ onClosed }));
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(220); });
  nativeEnd();
  const afterFirst = onClosed.mock.calls.length;
  nativeEnd();
  const afterSecond = onClosed.mock.calls.length;
  console.log(`R-c: onClosed after the first late end ${afterFirst}, after the second ${afterSecond}`);
  expect([afterFirst, afterSecond]).toEqual([1, 2]);
});

test('R-d: the late end and the reopen land in one React batch', async () => {
  const onClosed = vi.fn();
  const view = await iosTray(onClosed);
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(220); });
  // The tray is hidden, its dismissal under way. The host opens it again (from a timer or a promise, not a tap)
  // in the same task that the native end is delivered in: one render, one commit.
  act(() => {
    view.rerender(tray({ onClosed }));
    ios.modal?.nativeEnd();
  });
  console.log(`R-d: tray open ${screen.queryByTestId('tray') !== null}, onClosed calls ${onClosed.mock.calls.length}`);
  expect(screen.queryByTestId('tray'), 'open again').not.toBeNull();
  expect(onClosed, 'onClosed while the tray is open (same batch)').toHaveBeenCalledTimes(0);
});

test('R-e: the native end is delivered between the hide commit and its passive effects (real scheduler, no act)', async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
  const onClosed = vi.fn();
  phoneFocus();
  const view = mountWallet(tray({ visible: false, onClosed }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  platform('ios');
  view.rerender(tray({ onClosed }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  // Real timers: close, and watch for the commit that hides the Modal.
  let delivered = false;
  const observer = new MutationObserver(() => {
    if (delivered || screen.queryByRole('dialog') !== null) return;
    delivered = true;
    // A microtask right after the commit's DOM change: before any scheduler task, so before the passive flush.
    ios.modal?.nativeEnd();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  view.rerender(tray({ visible: false, onClosed }));
  await new Promise((resolve) => setTimeout(resolve, 600));
  observer.disconnect();
  console.log(`R-e: delivered ${delivered}, ends ${ios.ends}, onClosed calls ${onClosed.mock.calls.length}`);
  expect(delivered, 'the observer saw the hide').toBe(true);
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('T-a: open, close, reopen at another step in one render ticks nothing (visible must be a dependency)', async () => {
  const tick = vi.spyOn(haptics, 'selection').mockResolvedValue(undefined);
  const view = mountWallet(tray({ step: 'amount' }));
  await settle();
  view.rerender(tray({ visible: false, step: 'amount' }));
  view.rerender(tray({ step: 'confirm' }));
  expect(tick, 'reopened at another step').not.toHaveBeenCalled();
  view.rerender(tray({ step: 'amount' }));
  expect(tick, 'then a change while open').toHaveBeenCalledTimes(1);
});

test('T-b: cover, change under it, lift on the same step, then a change ticks once (hidden must be a dependency)', async () => {
  const tick = vi.spyOn(haptics, 'selection').mockResolvedValue(undefined);
  const view = mountWallet(covered(false, { step: 'amount' }));
  await settle();
  view.rerender(covered(true, { step: 'amount' }));
  view.rerender(covered(true, { step: 'confirm' }));
  view.rerender(covered(false, { step: 'confirm' }));
  expect(tick, 'lifted on the same step').not.toHaveBeenCalled();
  view.rerender(covered(false, { step: 'amount' }));
  expect(tick, 'a change once open and uncovered').toHaveBeenCalledTimes(1);
});

const frameOf = () => (screen.getByTestId('tray-backdrop').nextElementSibling as HTMLElement);
const pan = () => swipe.config as PanConfig;

test('D-a: a swipe that closes leaves the card where the finger let go (nothing moves during the exit)', async () => {
  const onClose = vi.fn();
  const view = mountWallet(tray({ onClose }));
  await settle();
  act(() => { pan().onUpdate?.({ translationY: 121, velocityY: 0 }); });
  expect(frameOf().style.transform).toBe('translateY(121px)');
  act(() => { pan().onDeactivate?.({ translationY: 121, velocityY: 0 }); });
  expect(onClose).toHaveBeenCalledTimes(1);
  vi.useFakeTimers();
  view.rerender(tray({ visible: false, onClose }));
  expect(frameOf().style.transform, 'during the exit').toBe('translateY(121px)');
  act(() => { vi.advanceTimersByTime(100); });
  expect(frameOf().style.transform, 'during the exit, 100 ms on').toBe('translateY(121px)');
});

test('D-b: the cover arriving or lifting during an exit moves nothing either', async () => {
  const view = mountWallet(covered(false));
  await settle();
  act(() => { pan().onUpdate?.({ translationY: 90, velocityY: 0 }); });
  vi.useFakeTimers();
  view.rerender(covered(false, { visible: false }));
  expect(frameOf().style.transform).toBe('translateY(90px)');
  view.rerender(covered(true, { visible: false }));
  view.rerender(covered(false, { visible: false }));
  // Still leaving (220 ms not up): the frame is back, and it must still be where the finger was.
  expect(frameOf().style.transform, 'cover during exit').toBe('translateY(90px)');
});

test('N-a: a cancel under Reduce Motion jumps back, and a FAILED end never closes', async () => {
  const onClose = vi.fn();
  const view = mountWallet(tray({ visible: false, onClose }), { reducedMotion: true });
  await settle();
  view.rerender(tray({ onClose }));
  await settle();
  const drag = (end: number, to: number) => {
    const gesture = swipe.gesture as Pan;
    const at = (y: number) => ({ handlerData: { x: 0, y: 0, absoluteX: 0, absoluteY: 0, translationX: 0, translationY: y, velocityX: 0, velocityY: 0, numberOfPointers: 1, pointerType: 0 } });
    const send = (event: Record<string, unknown>) => act(() => { gesture.detectorCallbacks.jsEventHandler({ handlerTag: gesture.handlerTag, ...event }); });
    send({ state: State.BEGAN, oldState: State.UNDETERMINED, ...at(0) });
    send({ state: State.ACTIVE, oldState: State.BEGAN, ...at(12) });
    send(at(to));
    send({ state: end, oldState: State.ACTIVE, ...at(to) });
  };
  drag(State.CANCELLED, 150);
  expect(onClose, 'cancelled, reduced').not.toHaveBeenCalled();
  expect(frameOf().style.transform, 'jumps back').toBe('translateY(0px)');
  drag(State.FAILED, 150);
  expect(onClose, 'failed').not.toHaveBeenCalled();
  expect(frameOf().style.transform).toBe('translateY(0px)');
});

test('C-a: a swipe whose end reaches JS after the cover came closes nothing', async () => {
  const onClose = vi.fn();
  const view = mountWallet(covered(false, { onClose }));
  await settle();
  act(() => { pan().onUpdate?.({ translationY: 100, velocityY: 0 }); });
  view.rerender(covered(true, { onClose }));
  act(() => { pan().onDeactivate?.({ translationY: 150, velocityY: 0 }); });
  expect(onClose, 'asked by a swipe under the cover').not.toHaveBeenCalled();
  view.rerender(covered(false, { onClose }));
  expect(frameOf().style.transform, 'back in place').toBe('translateY(0px)');
});

test('R-e2: the native end delivered by a microtask in the hide commit itself (the earliest possible), real scheduler', async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
  const onClosed = vi.fn();
  phoneFocus();
  const view = mountWallet(tray({ visible: false, onClosed }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  platform('ios');
  view.rerender(tray({ onClosed }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  ios.autoEnd = true;
  view.rerender(tray({ visible: false, onClosed }));
  await new Promise((resolve) => setTimeout(resolve, 600));
  console.log(`R-e2: hide commits ${ios.hideCommits}, ends ${ios.ends}, onClosed calls ${onClosed.mock.calls.length}`);
  expect(ios.hideCommits, 'the Modal saw the hide').toBe(1);
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('R-f: a Modal that never presented (no native end ever): onClosed stays silent, the tray still reopens, the next real end says closed once', async () => {
  const onClosed = vi.fn();
  const view = await iosTray(onClosed);
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(220); });
  act(() => { vi.advanceTimersByTime(5000); });
  console.log(`R-f: after the hide, no end: onClosed calls ${onClosed.mock.calls.length}`);
  expect(onClosed, 'no dismissal, no onClosed').toHaveBeenCalledTimes(0);
  view.rerender(tray({ onClosed }));
  expect(screen.queryByTestId('tray'), 'the tray opens again').not.toBeNull();
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(220); });
  nativeEnd();
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('R-d2: the same race with the real scheduler and no act: a timer reopens the tray in the task that delivers the native end', async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
  const onClosed = vi.fn();
  const control = { setVisible: (_: boolean) => undefined as void };
  function Host() {
    const [visible, setVisible] = useState(false);
    control.setVisible = setVisible;
    return tray({ visible, onClosed });
  }
  phoneFocus();
  const view = mountWallet(<Host />);
  await new Promise((resolve) => setTimeout(resolve, 20));
  platform('ios');
  view.rerender(<Host />);
  await new Promise((resolve) => setTimeout(resolve, 20));
  control.setVisible(true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  control.setVisible(false);
  await new Promise((resolve) => setTimeout(resolve, 400));
  // Hidden (the Modal's visible is false); UIKit's end is on its way. A timer (not a tap) reopens the tray in the
  // same task that the end is delivered in.
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      control.setVisible(true);
      ios.modal?.nativeEnd();
      resolve();
    }, 0);
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log(`R-d2: tray open ${screen.queryByTestId('tray') !== null}, onClosed calls ${onClosed.mock.calls.length}`);
  expect(screen.queryByTestId('tray'), 'open again').not.toBeNull();
  expect(onClosed, 'onClosed while the tray is open').toHaveBeenCalledTimes(0);
});

test('R-d3: a tap (discrete event) that reopens the tray, in the same act as the native end, is safe: the sync lane renders alone', async () => {
  const onClosed = vi.fn();
  const control = { setVisible: (_: boolean) => undefined as void };
  function Host() {
    const [visible, setVisible] = useState(false);
    control.setVisible = setVisible;
    return (
      <>
        <button type="button" data-testid="add" onClick={() => setVisible(true)}>add</button>
        {tray({ visible, onClosed })}
      </>
    );
  }
  phoneFocus();
  const view = mountWallet(<Host />);
  await settle();
  platform('ios');
  view.rerender(<Host />);
  await settle();
  fireEvent.click(screen.getByTestId('add'));
  await settle();
  vi.useFakeTimers();
  act(() => { control.setVisible(false); });
  act(() => { vi.advanceTimersByTime(220); });
  act(() => {
    fireEvent.click(screen.getByTestId('add'));
    ios.modal?.nativeEnd();
  });
  console.log(`R-d3: tray open ${screen.queryByTestId('tray') !== null}, onClosed calls ${onClosed.mock.calls.length}`);
  expect(screen.queryByTestId('tray'), 'open again').not.toBeNull();
  expect(onClosed, 'onClosed while the tray is open (tap reopen)').toHaveBeenCalledTimes(0);
});

function tapHost(onClosed: () => void) {
  const control = { setVisible: (_: boolean) => undefined as void };
  function Host() {
    const [visible, setVisible] = useState(false);
    control.setVisible = setVisible;
    return (
      <>
        <button type="button" data-testid="add" onClick={() => setVisible(true)}>add</button>
        {tray({ visible, onClosed })}
      </>
    );
  }
  return { Host, control };
}

async function hiddenTapTray(onClosed: () => void) {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
  const { Host, control } = tapHost(onClosed);
  phoneFocus();
  const view = mountWallet(<Host />);
  await new Promise((resolve) => setTimeout(resolve, 20));
  platform('ios');
  view.rerender(<Host />);
  await new Promise((resolve) => setTimeout(resolve, 20));
  control.setVisible(true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  control.setVisible(false);
  await new Promise((resolve) => setTimeout(resolve, 400));
  return control;
}

test('R-d4: tap reopen first, then the native end in a later task (real scheduler): safe', async () => {
  const onClosed = vi.fn();
  await hiddenTapTray(onClosed);
  await new Promise<void>((resolve) => { setTimeout(() => { fireEvent.click(screen.getByTestId('add')); resolve(); }, 0); });
  await new Promise<void>((resolve) => { setTimeout(() => { ios.modal?.nativeEnd(); resolve(); }, 0); });
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log(`R-d4: tray open ${screen.queryByTestId('tray') !== null}, onClosed calls ${onClosed.mock.calls.length}`);
  expect(screen.queryByTestId('tray'), 'open again').not.toBeNull();
  expect(onClosed, 'tap first').toHaveBeenCalledTimes(0);
});

test('R-d5: the native end is queued first (default lane pending), then a tap reopens before React has rendered it (real scheduler)', async () => {
  const onClosed = vi.fn();
  await hiddenTapTray(onClosed);
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      ios.modal?.nativeEnd();              // the native end handled: setState queued, render not yet run
      fireEvent.click(screen.getByTestId('add'));   // a tap in the same task: a discrete update
      resolve();
    }, 0);
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log(`R-d5: tray open ${screen.queryByTestId('tray') !== null}, onClosed calls ${onClosed.mock.calls.length}`);
  expect(screen.queryByTestId('tray'), 'open again').not.toBeNull();
  expect(onClosed, 'end first, tap second').toHaveBeenCalledTimes(0);
});

test('R-d5b: the native end and a tap are two tasks, both queued before React runs the render the end scheduled (real scheduler)', async () => {
  const onClosed = vi.fn();
  await hiddenTapTray(onClosed);
  const order: string[] = [];
  await new Promise<void>((resolve) => {
    setTimeout(() => { order.push('end'); ios.modal?.nativeEnd(); }, 0);
    setTimeout(() => { order.push('tap'); fireEvent.click(screen.getByTestId('add')); resolve(); }, 0);
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log(`R-d5b: order ${order.join(',')}, tray open ${screen.queryByTestId('tray') !== null}, onClosed calls ${onClosed.mock.calls.length}`);
  expect(screen.queryByTestId('tray'), 'open again').not.toBeNull();
  expect(onClosed, 'end task first, tap task second').toHaveBeenCalledTimes(0);
});

test('R-d6: the same two tasks but the render the end scheduled gets to run first (a macrotask between them): safe', async () => {
  const onClosed = vi.fn();
  await hiddenTapTray(onClosed);
  await new Promise<void>((resolve) => { setTimeout(() => { ios.modal?.nativeEnd(); resolve(); }, 0); });
  await new Promise((resolve) => setTimeout(resolve, 30));
  await new Promise<void>((resolve) => { setTimeout(() => { fireEvent.click(screen.getByTestId('add')); resolve(); }, 0); });
  await new Promise((resolve) => setTimeout(resolve, 100));
  console.log(`R-d6: tray open ${screen.queryByTestId('tray') !== null}, onClosed calls ${onClosed.mock.calls.length} (the end ran first, so it legitimately said closed)`);
  expect(onClosed).toHaveBeenCalledTimes(1);
});
