// The Bun Wallet's tray (P2-T13, W3, R63, R69, Review Focus 1), its main
// button and its text link. Each case mounts through mountWallet, in Thai and
// by day unless it says otherwise, and settles the phone's answer inside act.
// The tray takes its motion from the wallet's answer, so a case that needs
// full motion opens the tray after the answer, through rerender.
//
// happy-dom runs no CSS animation. Reanimated's web build keeps a view with an
// entering animation unseen (visibility: hidden) until its animationstart,
// which a browser fires a frame later and happy-dom never does, and queries by
// role skip what is unseen: startAnimations() fires it, as a browser would.
// Gesture Handler's web build reads a pointer only against a laid-out view,
// and happy-dom lays nothing out, so most swipe cases call the callbacks the
// tray hands to usePanGesture. Gesture Handler takes the latest callbacks on
// every render, so this is its own path; the cancel's case sends its states
// through Gesture Handler's own event handler, as the native side does.
// iOS's Modal says it has gone (onDismiss) when UIKit's dismissal ends, a
// frame or more after the hide; react-native-web says it at once. The late
// dismissal's cases hold it back and end it as React Native's Modal.js does.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import type { ModalProps } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

// The Modal, which says it has gone at once unless a case holds its dismissals back (`late`). A held one waits for
// `dismissals.end`, which does what React Native's Modal.js does on iOS when UIKit's dismissal ends: it sets its
// own state, and that setState's callback calls the latest onDismiss, in the layout phase of the commit that
// renders it (Modal.js lines 315 to 323), with whatever else React batched into that commit.
const dismissals = vi.hoisted(() => ({ late: false, held: 0, end: null as (() => void) | null }));
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  const { Component, createElement, forwardRef } = await import('react');
  class IosModal extends Component<ModalProps & { forwarded: unknown }, { isRendered: boolean }> {
    state = { isRendered: this.props.visible === true };
    componentDidUpdate(previous: ModalProps) {
      if (previous.visible === false && this.props.visible === true) this.setState({ isRendered: true });
    }
    end = () => this.setState({ isRendered: false }, () => this.props.onDismiss?.());
    render() {
      const { forwarded, onDismiss, ...props } = this.props;
      dismissals.end = this.end;
      const held = onDismiss && (() => {
        if (dismissals.late) dismissals.held += 1;
        else onDismiss();
      });
      return createElement(actual.Modal as never, { ...props, ref: forwarded, onDismiss: held });
    }
  }
  const Modal = forwardRef<unknown, ModalProps>((props, ref) => createElement(IosModal, { ...props, forwarded: ref }));
  return { ...actual, Modal };
});

// The swipe's callbacks, as the tray hands them to Gesture Handler, and the gesture it makes of them.
type PanEvent = { translationY: number; velocityY: number };
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

// The motion builders, watched, so a case can see which answer the tray asked with.
vi.mock('../motion/useWalletMotion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../motion/useWalletMotion')>();
  return {
    ...actual,
    trayEntering: vi.fn(actual.trayEntering),
    trayExiting: vi.fn(actual.trayExiting),
    stepLayout: vi.fn(actual.stepLayout),
  };
});

import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { WALLET_KIT_SECTIONS } from '@mobile/dev/catalogue/wallet/kitSections';
import { haptics } from '@mobile/lib/haptics';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { LockCoverContext } from '@mobile/ui/lockCover';
import { stepLayout, trayEntering, trayExiting } from '../motion/useWalletMotion';
import { AX5, mountWallet } from '../testing/walletHarness';
import { WalletText } from '../WalletText';
import { PrimaryButton } from './PrimaryButton';
import { TextLink } from './TextLink';
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
  Object.assign(dismissals, { late: false, held: 0, end: null });
  delete (AccessibilityInfo as unknown as Record<string, unknown>).sendAccessibilityEvent;
});

/** Lets the phone's answer, the stores and Bun's AI preferences arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const MODES = [['light', walletLight], ['dark', walletDark]] as const;
const TITLE = { th: 'จดรายจ่าย', en: 'Add spending' } as const;
const WORDS = { th: { back: 'กลับ', close: 'ปิด' }, en: { back: 'Back', close: 'Close' } } as const;

function tray(props: Partial<TrayProps> = {}) {
  return (
    <Tray visible onClose={() => undefined} title={TITLE.th} {...props}>
      {props.children ?? <WalletText>ข้าวมันไก่ 50</WalletText>}
    </Tray>
  );
}

/** Starts the entering animations, as a browser does a frame after they mount (see the note at the top). */
function startAnimations() {
  act(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[style*="visibility: hidden"]')) node.dispatchEvent(new Event('animationstart'));
  });
}

/** The element with this role and name, which must be there. */
function named(role: string, name: string): HTMLElement {
  const element = screen.queryByRole(role, { name });
  expect(element, `a ${role} named ${name}`).not.toBeNull();
  return element as HTMLElement;
}

/** The element with this test id, which must be there. */
function found(testID: string): HTMLElement {
  const element = screen.queryByTestId(testID);
  expect(element, testID).not.toBeNull();
  return element as HTMLElement;
}

const dialog = (name: string = TITLE.th) => screen.queryByRole('dialog', { name });
/** What follows the finger: the card's frame. */
const frame = () => found('tray').parentElement as HTMLElement;
const escape = () => act(() => { document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' })); });

/** The swipe's callbacks, which the tray must have handed to Gesture Handler. */
function pan(): PanConfig {
  expect(swipe.config, 'the swipe').not.toBeNull();
  return swipe.config as PanConfig;
}
const pull = (translationY: number) => act(() => { pan().onUpdate?.({ translationY, velocityY: 0 }); });
const release = (translationY: number, velocityY = 0) => act(() => { pan().onDeactivate?.({ translationY, velocityY }); });

/** One drag through Gesture Handler's own event handler, as the native side sends it: it begins, activates and moves
 * to translationY, then ends (let go) or is cancelled (the system took the touch, as for a call). */
function dragThrough(translationY: number, end: typeof State.END | typeof State.CANCELLED) {
  expect(swipe.gesture, 'the swipe').not.toBeNull();
  const gesture = swipe.gesture as Pan;
  const at = (y: number) => ({ handlerData: { x: 0, y: 0, absoluteX: 0, absoluteY: 0, translationX: 0, translationY: y, velocityX: 0, velocityY: 0, numberOfPointers: 1, pointerType: 0 } });
  const send = (event: Record<string, unknown>) => act(() => { gesture.detectorCallbacks.jsEventHandler({ handlerTag: gesture.handlerTag, ...event }); });
  send({ state: State.BEGAN, oldState: State.UNDETERMINED, ...at(0) });
  send({ state: State.ACTIVE, oldState: State.BEGAN, ...at(12) });
  send(at(translationY));
  send({ state: end, oldState: State.ACTIVE, ...at(translationY) });
}

/** Ends the dismissal held back longest, as UIKit's end reaches Modal.js on iOS: alone, in its own commit. */
function endDismissal() {
  expect(dismissals.held, 'a dismissal under way').toBeGreaterThan(0);
  dismissals.held -= 1;
  act(() => { dismissals.end?.(); });
}

/** The card's frame while the card leaves: the card is gone, so it is found beside the backdrop. */
const leavingFrame = () => found('tray-backdrop').nextElementSibling as HTMLElement;

/** A phone: React Native's platform, and the screen reader's focus moves, which react-native-web lacks (each one recorded). */
const platform = (value: string) => Object.defineProperty(Platform, 'OS', { value, configurable: true, writable: true });
function phoneFocus(): [HTMLElement | null, string][] {
  const focused: [HTMLElement | null, string][] = [];
  Object.defineProperty(AccessibilityInfo, 'sendAccessibilityEvent', {
    value: (node: HTMLElement | null, kind: string) => { focused.push([node, kind]); },
    configurable: true,
    writable: true,
  });
  return focused;
}

/** The view that holds a step's words: what fades in when the step changes. */
const stepOf = (words: string) => screen.queryByText(words)?.parentElement ?? null;

/** The answers a motion builder was asked with, once each. */
const answers = (builder: unknown) => [...new Set(vi.mocked(builder as (reduced: boolean) => unknown).mock.calls.map(([reduced]) => reduced))];

test('the tray is a named dialog, 8 pt from the edges, radius 34', async () => {
  for (const locale of ['th', 'en'] as const) {
    for (const [mode, colors] of MODES) {
      const at = `${locale} ${mode}`;
      mountWallet(tray({ title: TITLE[locale], footer: <PrimaryButton label="ถัดไป" onPress={() => undefined} /> }), { locale, mode });
      await settle();
      const layer = dialog(TITLE[locale]);
      expect(layer, `${at}: a dialog named ${TITLE[locale]}`).not.toBeNull();
      // Exactly one dialog: on the web the Modal's own layer, which holds the card.
      expect(screen.getAllByRole('dialog'), at).toHaveLength(1);
      expect(layer?.getAttribute('aria-modal'), at).toBe('true');
      const card = found('tray');
      expect(layer?.contains(card), at).toBe(true);
      // 8 pt from the left, right and bottom, above the home indicator (34 pt on this phone).
      expect([card.style.marginLeft, card.style.marginRight, card.style.marginBottom, card.style.borderRadius], at).toEqual(['8px', '8px', '42px', '34px']);
      expect(card.style.backgroundColor, at).toBe(rgba(colors.sheet));
      // The boards' edge: a soft shadow up the page by day, a light line along the top at night.
      expect(card.style.boxShadow, at).toBe(mode === 'light' ? '0px -10px 40px rgba(17, 16, 20, 0.18)' : 'inset 0px 1px 0px rgba(255, 255, 255, 0.08)');
      // The header, the scrolling middle, then the footer, pinned under it.
      expect([card.children.length, card.lastElementChild === found('tray-footer')], at).toEqual([3, true]);
      // The page behind is dimmed (bw-tray-amount, dk-tray-amount), and screen readers and the keyboard skip it.
      const backdrop = found('tray-backdrop');
      expect([backdrop.getAttribute('aria-hidden'), backdrop.getAttribute('tabindex')], at).toEqual(['true', '-1']);
      expect(backdrop.style.backgroundColor, at).toBe(mode === 'light' ? 'rgba(17, 16, 20, 0.38)' : 'rgba(0, 0, 0, 0.60)');
      startAnimations();
      expect(screen.queryByRole('heading', { name: TITLE[locale] }), `${at}: the title`).not.toBeNull();
      cleanup();
    }
  }
});

test('close and the backdrop close it, and the title takes focus when it opens', async () => {
  const onClose = vi.fn();
  const view = mountWallet(tray({ visible: false, onClose }));
  await settle();
  expect(dialog()).toBeNull();
  view.rerender(tray({ onClose }));
  await settle();
  // On the web the dialog itself takes focus: it carries the title as its name, and a browser focuses it only
  // with a tabindex (a phone's case is below).
  const layer = dialog();
  expect(layer, 'the dialog').not.toBeNull();
  expect([document.activeElement === layer, layer?.getAttribute('tabindex')]).toEqual([true, '-1']);
  startAnimations();
  fireEvent.click(named('button', 'ปิด'));
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(found('tray-backdrop'));
  expect(onClose).toHaveBeenCalledTimes(2);
  // The system back: react-native-web routes Escape to onRequestClose, which Android's back button calls.
  escape();
  expect(onClose).toHaveBeenCalledTimes(3);
});

test('while locked nothing closes it, and close says it is unavailable', async () => {
  const onClose = vi.fn();
  const view = mountWallet(tray({ locked: true, onClose }));
  await settle();
  startAnimations();
  const close = named('button', 'ปิด');
  expect([close.getAttribute('aria-disabled'), close.style.opacity]).toEqual(['true', '0.4']);
  fireEvent.click(close);
  fireEvent.click(found('tray-backdrop'));
  escape();
  vi.useFakeTimers();
  pull(200);
  release(200, 2000);
  act(() => { vi.advanceTimersByTime(2000); });
  expect(onClose).not.toHaveBeenCalled();
  expect(dialog()).not.toBeNull();
  // Pulled past the line, a locked card goes back to its place.
  expect(frame().style.transform).toBe('translateY(0px)');
  vi.useRealTimers();
  // When the lock goes (the save has landed), close works again.
  view.rerender(tray({ onClose }));
  expect(named('button', 'ปิด').getAttribute('aria-disabled')).toBeNull();
  fireEvent.click(named('button', 'ปิด'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('at AX5 it opens full height', async () => {
  mountWallet(tray(), { fontScale: AX5 });
  await settle();
  // The card fills the screen under the top safe area (62 pt on this phone), still 8 pt above the home indicator.
  expect([frame().style.flexGrow, frame().style.paddingTop, found('tray').style.flexGrow, found('tray').style.marginBottom]).toEqual(['1', '62px', '1', '42px']);
  cleanup();
  // At the default text size it is as tall as its content.
  mountWallet(tray());
  await settle();
  expect([frame().style.flexGrow, found('tray').style.flexGrow]).toEqual(['0', '0']);
});

test('under reduced motion a new step shows at once', async () => {
  const tick = vi.spyOn(haptics, 'selection').mockResolvedValue(undefined);
  const view = mountWallet(tray({ step: 'amount', children: <WalletText>฿50</WalletText> }), { reducedMotion: true });
  await settle();
  // The first step came with the tray: its words have no fade of their own.
  expect(stepOf('฿50')?.style.animationName).toBe('');
  view.rerender(tray({ step: 'confirm', children: <WalletText>ตรวจก่อนบันทึก</WalletText> }));
  // The new step is there at once and the last one gone: its words fade in (unseen until that starts), and the
  // height jumps (no layout animation).
  expect(stepOf('ตรวจก่อนบันทึก')?.style.visibility).toBe('hidden');
  expect(screen.queryByText('฿50')).toBeNull();
  expect(answers(stepLayout)).toEqual([true]);
  // The tray itself faded in, and would fade out.
  expect(answers(trayEntering)).toEqual([true]);
  expect(answers(trayExiting)).toEqual([true]);
  // The tick does not change under Reduce Motion.
  expect(tick).toHaveBeenCalledTimes(1);
});

test('the card leaves before the Modal hides, then onClosed fires once', async () => {
  for (const [reducedMotion, exitMs] of [[false, 220], [true, 150]] as const) {
    const at = `reduced motion ${reducedMotion}`;
    const onClose = vi.fn();
    const onClosed = vi.fn();
    const view = mountWallet(tray({ visible: false, onClose, onClosed }), { reducedMotion });
    await settle();
    view.rerender(tray({ onClose, onClosed }));
    await settle();
    vi.useFakeTimers();
    view.rerender(tray({ visible: false, onClose, onClosed }));
    // The card leaves at once and plays its exit; the Modal and the dimmed page stay for it.
    expect(screen.queryByTestId('tray'), at).toBeNull();
    expect(dialog(), at).not.toBeNull();
    expect(vi.mocked(trayExiting).mock.lastCall, at).toEqual([reducedMotion]);
    // A tap on the page while it leaves asks nothing more.
    fireEvent.click(found('tray-backdrop'));
    act(() => { vi.advanceTimersByTime(exitMs - 1); });
    expect([dialog() !== null, onClosed.mock.calls.length], `${at}, ${exitMs - 1} ms`).toEqual([true, 0]);
    act(() => { vi.advanceTimersByTime(1); });
    expect([dialog() !== null, onClosed.mock.calls.length], `${at}, ${exitMs} ms`).toEqual([false, 1]);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onClosed, at).toHaveBeenCalledTimes(1);
    expect(onClose, at).not.toHaveBeenCalled();
    vi.useRealTimers();
    cleanup();
  }
  // Opened again while it leaves, it stays, and nothing says it closed.
  const onClosed = vi.fn();
  const view = mountWallet(tray({ onClosed }));
  await settle();
  vi.useFakeTimers();
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(100); });
  view.rerender(tray({ onClosed }));
  act(() => { vi.advanceTimersByTime(1000); });
  expect([dialog() !== null, screen.queryByTestId('tray') !== null, onClosed.mock.calls.length]).toEqual([true, true, 0]);
});

test('an onClosed given while the card leaves is the one called', async () => {
  const first = vi.fn();
  const latest = vi.fn();
  const view = mountWallet(tray({ onClosed: first }));
  await settle();
  vi.useFakeTimers();
  view.rerender(tray({ visible: false, onClosed: first }));
  act(() => { vi.advanceTimersByTime(100); });
  // A host that passes a new function on every render (P2-T16's whenClosed queue).
  view.rerender(tray({ visible: false, onClosed: latest }));
  act(() => { vi.advanceTimersByTime(120); });
  expect([first.mock.calls.length, latest.mock.calls.length]).toEqual([0, 1]);
});

test("a hidden lock cover replaces the tray's content", async () => {
  const unmounted = vi.fn();
  function Typed() {
    useEffect(() => unmounted, []);
    return <WalletText>ข้าวมันไก่ 50</WalletText>;
  }
  const covered = (hidden: boolean) => (
    <LockCoverContext.Provider value={{ hidden }}>{tray({ children: <Typed /> })}</LockCoverContext.Provider>
  );
  const view = mountWallet(covered(false));
  await settle();
  expect(screen.queryByText('ข้าวมันไก่ 50')).not.toBeNull();
  view.rerender(covered(true));
  const cover = screen.queryByTestId('lock-cover');
  expect(cover, 'the lock cover').not.toBeNull();
  expect([cover?.getAttribute('aria-hidden'), cover?.textContent, cover?.style.backgroundColor]).toEqual(['true', '', rgba(walletLight.ground)]);
  // It fills the screen.
  expect([cover?.style.position, cover?.style.top, cover?.style.right, cover?.style.bottom, cover?.style.left]).toEqual(['absolute', '0px', '0px', '0px', '0px']);
  // The card, the backdrop and what was in it are gone, and nothing of the tray is announced.
  expect(screen.queryByTestId('tray')).toBeNull();
  expect(screen.queryByTestId('tray-backdrop')).toBeNull();
  expect(unmounted).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain(TITLE.th);
  expect(dialog()).toBeNull();
  // Uncovered, the tray is back with its content: every step is its host's, so nothing is lost.
  view.rerender(covered(false));
  expect(screen.queryByTestId('lock-cover')).toBeNull();
  expect(screen.queryByText('ข้าวมันไก่ 50')).not.toBeNull();
  expect(dialog()).not.toBeNull();
  cleanup();
  // At night the cover is the night ground.
  mountWallet(covered(true), { mode: 'dark' });
  await settle();
  expect(found('lock-cover').style.backgroundColor).toBe(rgba(walletDark.ground));
});

test('under the lock cover nothing asks to close the tray', async () => {
  const onClose = vi.fn();
  const covered = (hidden: boolean) => <LockCoverContext.Provider value={{ hidden }}>{tray({ onClose })}</LockCoverContext.Provider>;
  const view = mountWallet(covered(true));
  await settle();
  found('lock-cover');
  // The system back reaches the Modal under the cover (Android's back; Escape on the web): it asks nothing, so a
  // host that drops its draft on close loses nothing while the app is locked.
  escape();
  expect(onClose, 'asked under the cover').not.toHaveBeenCalled();
  // Uncovered, it asks again.
  view.rerender(covered(false));
  escape();
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('a drag the lock cover cuts off is gone when the cover lifts', async () => {
  const covered = (hidden: boolean) => <LockCoverContext.Provider value={{ hidden }}>{tray()}</LockCoverContext.Provider>;
  const view = mountWallet(covered(false));
  await settle();
  pull(80);
  expect(frame().style.transform).toBe('translateY(80px)');
  // The cover takes the header, and the drag's end with it.
  view.rerender(covered(true));
  view.rerender(covered(false));
  expect(frame().style.transform, 'the card once the cover lifts').toBe('translateY(0px)');
});

test('a card that leaves stays where the finger let it go, even when the lock cover comes and goes', async () => {
  const onClose = vi.fn();
  const covered = (hidden: boolean, visible = true) => (
    <LockCoverContext.Provider value={{ hidden }}>{tray({ visible, onClose })}</LockCoverContext.Provider>
  );
  const view = mountWallet(covered(false));
  await settle();
  // A swipe past the line asks to close; the host closes the tray, and the card's exit starts from there.
  pull(121);
  release(121);
  expect(onClose).toHaveBeenCalledTimes(1);
  vi.useFakeTimers();
  view.rerender(covered(false, false));
  expect(leavingFrame().style.transform, 'as it leaves').toBe('translateY(121px)');
  act(() => { vi.advanceTimersByTime(100); });
  expect(leavingFrame().style.transform, '100 ms on').toBe('translateY(121px)');
  // The cover comes and goes while it leaves: nothing moves either.
  view.rerender(covered(true, false));
  view.rerender(covered(false, false));
  expect(leavingFrame().style.transform, 'once the cover lifts').toBe('translateY(121px)');
});

test('the main button is 54 pt tall, radius 16, ink with white text in light and light with ink text in dark; busy says its busy label', async () => {
  for (const [mode, colors] of MODES) {
    const onPress = vi.fn();
    const view = mountWallet(<PrimaryButton label="บันทึก" onPress={onPress} />, { mode });
    await settle();
    const button = named('button', 'บันทึก');
    expect([button.style.minHeight, button.style.borderRadius], mode).toEqual(['54px', '16px']);
    expect([button.style.backgroundColor, within(button).getByText('บันทึก').style.color], mode).toEqual(
      mode === 'light' ? [rgba('#111014'), rgba('#FFFFFF')] : [rgba('#F4F2FA'), rgba('#111014')],
    );
    expect([colors.primary, colors.onPrimary], mode).toEqual(mode === 'light' ? ['#111014', '#FFFFFF'] : ['#F4F2FA', '#111014']);
    fireEvent.click(button);
    expect(onPress, mode).toHaveBeenCalledTimes(1);
    view.rerender(<PrimaryButton label="บันทึก" busy busyLabel="กำลังบันทึก…" onPress={onPress} />);
    const busy = named('button', 'กำลังบันทึก…');
    expect([busy.getAttribute('aria-busy'), busy.textContent], mode).toEqual(['true', 'กำลังบันทึก…']);
    fireEvent.click(busy);
    expect(onPress, mode).toHaveBeenCalledTimes(1);
    // With no busy label it keeps its words.
    view.rerender(<PrimaryButton label="บันทึก" busy onPress={onPress} />);
    expect(named('button', 'บันทึก').getAttribute('aria-busy'), mode).toBe('true');
    view.rerender(<PrimaryButton label="บันทึก" disabled onPress={onPress} />);
    const off = named('button', 'บันทึก');
    expect([off.getAttribute('aria-disabled'), off.style.opacity], mode).toEqual(['true', '0.4']);
    fireEvent.click(off);
    expect(onPress, mode).toHaveBeenCalledTimes(1);
    cleanup();
  }
});

test('every control in the header is at least 44 pt', async () => {
  for (const locale of ['th', 'en'] as const) {
    for (const [mode, colors] of MODES) {
      const at = `${locale} ${mode}`;
      const onBack = vi.fn();
      mountWallet(tray({ title: TITLE[locale], onBack }), { locale, mode });
      await settle();
      startAnimations();
      const buttons = within(found('tray-header')).queryAllByRole('button');
      expect(buttons.map((button) => button.getAttribute('aria-label')), at).toEqual([WORDS[locale].back, WORDS[locale].close]);
      for (const button of buttons) {
        expect([button.style.width, button.style.height, button.style.borderRadius, button.style.backgroundColor], at).toEqual(['44px', '44px', '22px', rgba(colors.raised)]);
      }
      fireEvent.click(buttons[0] as HTMLElement);
      expect(onBack, at).toHaveBeenCalledTimes(1);
      cleanup();
    }
  }
});

test('the swipe follows the finger down, springs back short of the line, and closes past it', async () => {
  const onClose = vi.fn();
  const view = mountWallet(tray({ visible: false, onClose }));
  await settle();
  view.rerender(tray({ onClose }));
  await settle();
  expect(pan()).toMatchObject({ activeOffsetY: 10, failOffsetX: [-20, 20], runOnJS: true });
  pull(80);
  expect(frame().style.transform).toBe('translateY(80px)');
  // Never up.
  pull(-40);
  expect(frame().style.transform).toBe('translateY(0px)');
  pull(100);
  vi.useFakeTimers();
  release(100, 500);
  expect(onClose).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(100); });
  const partway = Number.parseFloat(frame().style.transform.replace('translateY(', ''));
  expect(partway > 0 && partway < 100, `${partway} pt, 100 ms after letting go`).toBe(true);
  act(() => { vi.advanceTimersByTime(2000); });
  expect(frame().style.transform).toBe('translateY(0px)');
  // Past the line: a quick flick past 60 pt, or a pull past 120 pt.
  release(61, 901);
  expect(onClose).toHaveBeenCalledTimes(1);
  pull(121);
  release(121, 0);
  expect(onClose).toHaveBeenCalledTimes(2);
  // The host closes it; opened again, the card is back in its place.
  view.rerender(tray({ visible: false, onClose }));
  act(() => { vi.advanceTimersByTime(220); });
  view.rerender(tray({ onClose }));
  expect(frame().style.transform).toBe('translateY(0px)');
  vi.useRealTimers();
  cleanup();
  // Under Reduce Motion a short pull jumps back.
  mountWallet(tray(), { reducedMotion: true });
  await settle();
  pull(100);
  release(100, 0);
  expect(frame().style.transform).toBe('translateY(0px)');
});

test("the wallet's answer decides the swipe's spring back, not Reanimated's own setting (W6)", async () => {
  // Reanimated warns once that its own setting is now Always; that warning is expected here.
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const view = mountWallet(<><ReducedMotionConfig mode={ReduceMotion.Always} />{tray({ visible: false })}</>);
  await settle();
  view.rerender(<><ReducedMotionConfig mode={ReduceMotion.Always} />{tray()}</>);
  await settle();
  pull(100);
  vi.useFakeTimers();
  release(100);
  act(() => { vi.advanceTimersByTime(100); });
  const partway = Number.parseFloat(frame().style.transform.replace('translateY(', ''));
  expect(partway > 0 && partway < 100, `${partway} pt, 100 ms after letting go`).toBe(true);
  act(() => { vi.advanceTimersByTime(2000); });
  expect(frame().style.transform).toBe('translateY(0px)');
  expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
});

test('a swipe the system cancels springs back, even past the line', async () => {
  const onClose = vi.fn();
  const view = mountWallet(tray({ visible: false, onClose }));
  await settle();
  view.rerender(tray({ onClose }));
  await settle();
  vi.useFakeTimers();
  // Gesture Handler cancels a drag when the system takes the touch (a call, a system gesture): the finger never let go.
  dragThrough(150, State.CANCELLED);
  expect(onClose, 'a cancelled swipe').not.toHaveBeenCalled();
  // It springs back from where the drag was cut off.
  act(() => { vi.advanceTimersByTime(100); });
  const partway = Number.parseFloat(frame().style.transform.replace('translateY(', ''));
  expect(partway > 0 && partway < 150, `${partway} pt, 100 ms after the cancel`).toBe(true);
  act(() => { vi.advanceTimersByTime(2000); });
  expect(frame().style.transform).toBe('translateY(0px)');
  // The same drag, let go, closes it.
  dragThrough(150, State.END);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('at full motion the card springs up, and a step change morphs its height and ticks once; opening ticks nothing', async () => {
  const tick = vi.spyOn(haptics, 'selection').mockResolvedValue(undefined);
  const view = mountWallet(tray({ visible: false, step: 'amount' }));
  await settle();
  view.rerender(tray({ step: 'amount' }));
  await settle();
  expect(tick).not.toHaveBeenCalled();
  expect(answers(trayEntering)).toEqual([false]);
  view.rerender(tray({ step: 'confirm' }));
  expect(tick).toHaveBeenCalledTimes(1);
  expect(answers(stepLayout)).toEqual([false]);
  // The same step again is no change; back to the first is one more.
  view.rerender(tray({ step: 'confirm' }));
  view.rerender(tray({ step: 'amount' }));
  expect(tick).toHaveBeenCalledTimes(2);
  // A closed tray is silent, and so is opening it at another step.
  view.rerender(tray({ visible: false, step: 'confirm' }));
  view.rerender(tray({ step: 'confirm' }));
  expect(tick).toHaveBeenCalledTimes(2);
});

test('opening at another step in one render, or a step change under the lock cover, ticks nothing', async () => {
  const tick = vi.spyOn(haptics, 'selection').mockResolvedValue(undefined);
  const at = (step: string, { visible = true, hidden = false } = {}) => (
    <LockCoverContext.Provider value={{ hidden }}>{tray({ visible, step })}</LockCoverContext.Provider>
  );
  const view = mountWallet(at('confirm', { visible: false }));
  await settle();
  // A host that starts a new entry as it opens the tray: the step and visible change in one render.
  view.rerender(at('amount'));
  await settle();
  expect(tick, 'opening at another step').not.toHaveBeenCalled();
  // Covered, a step change plays nothing, and neither does the cover lifting on another step.
  view.rerender(at('amount', { hidden: true }));
  view.rerender(at('confirm', { hidden: true }));
  expect(tick, 'a step change under the cover').not.toHaveBeenCalled();
  view.rerender(at('amount'));
  expect(tick, 'the cover lifting on another step').not.toHaveBeenCalled();
  // Open and uncovered, a step change ticks once.
  view.rerender(at('confirm'));
  expect(tick).toHaveBeenCalledTimes(1);
});

test('once the lock cover lifts a step change ticks, even when it lifted on the step it had under the cover', async () => {
  const tick = vi.spyOn(haptics, 'selection').mockResolvedValue(undefined);
  const at = (step: string, hidden = false) => <LockCoverContext.Provider value={{ hidden }}>{tray({ step })}</LockCoverContext.Provider>;
  const view = mountWallet(at('amount'));
  await settle();
  view.rerender(at('amount', true));
  view.rerender(at('confirm', true));
  // Lifted on the same step: no tick, and the tray is open and uncovered again.
  view.rerender(at('confirm'));
  expect(tick, 'the cover lifting').not.toHaveBeenCalled();
  view.rerender(at('amount'));
  expect(tick).toHaveBeenCalledTimes(1);
});

test("on a phone the card is the named dialog and the title takes focus, with or without a header; on iOS onClosed waits for the Modal's own dismissal", async () => {
  const focused = phoneFocus();
  const errors = vi.spyOn(console, 'error');
  for (const header of [undefined, <WalletText>รายจ่าย</WalletText>]) {
    const at = header ? 'with a header' : 'with the title';
    focused.length = 0;
    const present: boolean[] = [];
    const onClosed = vi.fn(() => { present.push(screen.queryByRole('dialog') !== null); });
    // The platform turns to iOS once the tray has mounted closed: at the mount it would trip the theme store's read.
    platform(os);
    const view = mountWallet(tray({ visible: false, onClosed, header }));
    await settle();
    platform('ios');
    view.rerender(tray({ onClosed, header }));
    await settle();
    // The card is the dialog, named by the title (on the web the Modal's own layer is).
    const card = found('tray');
    expect([card.getAttribute('role'), card.getAttribute('aria-modal'), card.getAttribute('aria-label')], at).toEqual(['dialog', 'true', TITLE.th]);
    // VoiceOver lands on the title: one accessible header that says it, first in the row (1 by 1 pt with a header).
    expect(focused.map(([node, kind]) => [kind, node?.getAttribute('aria-label'), node?.getAttribute('role')]), at).toEqual([['focus', TITLE.th, 'heading']]);
    expect(focused[0]?.[0], at).toBe(found('tray-header').firstElementChild);
    vi.useFakeTimers();
    view.rerender(tray({ visible: false, onClosed, header }));
    act(() => { vi.advanceTimersByTime(220); });
    // iOS presents no Modal while another is leaving, so the host hears of it once the Modal has gone.
    expect(onClosed, at).toHaveBeenCalledTimes(1);
    expect(present, at).toEqual([false]);
    vi.useRealTimers();
    cleanup();
  }
  expect(errors).not.toHaveBeenCalled();
});

test('on iOS a dismissal that ends after the tray is shown again says nothing; the next one says it closed', async () => {
  // On iOS the tray moves the screen reader to its title each time it shows.
  phoneFocus();
  dismissals.late = true;
  const onClosed = vi.fn();
  const view = mountWallet(tray({ visible: false, onClosed }));
  await settle();
  platform('ios');
  view.rerender(tray({ onClosed }));
  await settle();
  vi.useFakeTimers();
  const close = () => view.rerender(tray({ visible: false, onClosed }));
  const open = () => view.rerender(tray({ onClosed }));
  // Closed: the Modal hides at 220 ms, and UIKit's dismissal ends a frame or more later.
  close();
  act(() => { vi.advanceTimersByTime(220); });
  expect([screen.queryByTestId('tray'), dismissals.held, onClosed.mock.calls.length]).toEqual([null, 1, 0]);
  // Opened again before it ends (a quick second tap on add): that end says nothing, since the tray never closed.
  open();
  endDismissal();
  expect(onClosed, 'while the tray is open').not.toHaveBeenCalled();
  expect(screen.queryByTestId('tray')).not.toBeNull();
  // Closed, opened and closed again: an end that comes while the card leaves says nothing either.
  close();
  act(() => { vi.advanceTimersByTime(220); });
  open();
  close();
  endDismissal();
  expect(onClosed, 'while the card leaves').not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(220); });
  expect([dismissals.held, onClosed.mock.calls.length], 'hidden, its dismissal under way').toEqual([1, 0]);
  // Its own dismissal ends: closed, once.
  endDismissal();
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('on iOS a dismissal that ends in the commit that opens the tray again says nothing', async () => {
  phoneFocus();
  dismissals.late = true;
  const onClosed = vi.fn();
  const host = { setVisible: (_: boolean) => undefined as void };
  function Host() {
    const [visible, setVisible] = useState(false);
    host.setVisible = setVisible;
    return (
      <>
        <button type="button" data-testid="add" onClick={() => setVisible(true)}>add</button>
        {tray({ visible, onClosed })}
      </>
    );
  }
  const view = mountWallet(<Host />);
  await settle();
  platform('ios');
  view.rerender(<Host />);
  act(() => { host.setVisible(true); });
  await settle();
  vi.useFakeTimers();
  act(() => { host.setVisible(false); });
  act(() => { vi.advanceTimersByTime(220); });
  // The Modal has hidden, and UIKit's dismissal is under way.
  expect([screen.queryByTestId('tray'), dismissals.held]).toEqual([null, 1]);
  // UIKit's end, then a tap on add (a DOM button's click is a discrete React event, as a tap is), both before React
  // renders the end: one commit holds the end and the reopen (the review's R-d5b order). Modal.js calls onDismiss in
  // that commit's layout phase, before any of its effects run.
  act(() => {
    dismissals.end?.();
    fireEvent.click(screen.getByTestId('add'));
  });
  expect(screen.queryByTestId('tray'), 'open again').not.toBeNull();
  expect(onClosed, 'onClosed while the tray is open').not.toHaveBeenCalled();
});

test('on iOS a dismissal that ends in the commit that hides the tray again says nothing; the next one says it closed', async () => {
  phoneFocus();
  dismissals.late = true;
  const onClosed = vi.fn();
  const view = mountWallet(tray({ visible: false, onClosed }));
  await settle();
  platform('ios');
  view.rerender(tray({ onClosed }));
  await settle();
  vi.useFakeTimers();
  const close = () => view.rerender(tray({ visible: false, onClosed }));
  const open = () => view.rerender(tray({ onClosed }));
  // Closed: the Modal hides at 220 ms, and UIKit's dismissal is under way.
  close();
  act(() => { vi.advanceTimersByTime(220); });
  expect([dismissals.held, onClosed.mock.calls.length]).toEqual([1, 0]);
  // Opened and closed again before it ends: the card leaves, and the Modal stays shown for the exit.
  open();
  close();
  act(() => { vi.advanceTimersByTime(219); });
  // UIKit's end of the first dismissal, then the exit's last millisecond, both before React renders the end: one
  // commit holds the end and the Modal's second hide. Modal.js calls onDismiss in that commit's layout phase, before
  // any of its effects run. (The end leaves the held count here, as endDismissal() does.)
  dismissals.held -= 1;
  act(() => {
    dismissals.end?.();
    vi.advanceTimersByTime(1);
  });
  expect(dismissals.held, 'hidden again, its dismissal under way').toBe(1);
  expect(onClosed, 'the earlier end, in the commit that hides the Modal again').not.toHaveBeenCalled();
  // The second hide's own end: closed, once.
  endDismissal();
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('on iOS an onClosed given while the dismissal is under way is the one called', async () => {
  phoneFocus();
  dismissals.late = true;
  const first = vi.fn();
  const latest = vi.fn();
  const view = mountWallet(tray({ visible: false, onClosed: first }));
  await settle();
  platform('ios');
  view.rerender(tray({ onClosed: first }));
  await settle();
  vi.useFakeTimers();
  view.rerender(tray({ visible: false, onClosed: first }));
  act(() => { vi.advanceTimersByTime(220); });
  expect([dismissals.held, first.mock.calls.length]).toEqual([1, 0]);
  // The Modal has hidden; a host that passes a new function on every render (P2-T16's whenClosed queue) does so
  // before UIKit's dismissal ends.
  view.rerender(tray({ visible: false, onClosed: latest }));
  endDismissal();
  expect([first.mock.calls.length, latest.mock.calls.length], 'calls: the onClosed given first, the one given last').toEqual([0, 1]);
});

test('on iOS a tray with no onClosed closes, its dismissal ends, and it opens again', async () => {
  phoneFocus();
  dismissals.late = true;
  const view = mountWallet(tray({ visible: false }));
  await settle();
  platform('ios');
  view.rerender(tray());
  await settle();
  vi.useFakeTimers();
  view.rerender(tray({ visible: false }));
  act(() => { vi.advanceTimersByTime(220); });
  // A host that does not listen: the end says nothing, and throws nothing.
  expect(() => endDismissal()).not.toThrow();
  view.rerender(tray());
  expect(screen.queryByTestId('tray'), 'open again').not.toBeNull();
});

test('a text link is at least 44 pt, violet by default or ink, and says its words', async () => {
  for (const [mode, colors] of MODES) {
    const onPress = vi.fn();
    mountWallet(
      <View>
        <TextLink label="ไว้ทีหลัง" onPress={onPress} />
        <TextLink label="ใช้รหัสผ่าน" tone="ink" onPress={onPress} />
      </View>,
      { mode },
    );
    await settle();
    const later = named('button', 'ไว้ทีหลัง');
    const passcode = named('button', 'ใช้รหัสผ่าน');
    for (const link of [later, passcode]) {
      expect([link.style.minHeight, link.style.minWidth, link.style.backgroundColor], mode).toEqual(['44px', '44px', '']);
    }
    expect([within(later).getByText('ไว้ทีหลัง').style.color, within(passcode).getByText('ใช้รหัสผ่าน').style.color], mode).toEqual([rgba(colors.violet), rgba(colors.ink)]);
    fireEvent.click(later);
    expect(onPress, mode).toHaveBeenCalledTimes(1);
    cleanup();
  }
});

test("a header takes the title's place, and screen readers meet the title first", async () => {
  mountWallet(tray({ header: <View testID="type-switch"><WalletText>รายจ่าย</WalletText></View> }));
  await settle();
  startAnimations();
  expect(dialog(), 'the title still names the dialog').not.toBeNull();
  expect(screen.queryByTestId('type-switch')).not.toBeNull();
  // The title is not drawn ...
  expect(screen.queryByText(TITLE.th)).toBeNull();
  // ... but the header row starts with it, a heading that draws nothing.
  const heading = screen.queryByRole('heading', { name: TITLE.th });
  expect(heading, 'the title as a heading').not.toBeNull();
  expect(found('tray-header').firstElementChild).toBe(heading);
  expect([heading?.style.width, heading?.style.height, heading?.textContent]).toEqual(['1px', '1px', '']);
});

test("the catalogue's tray sections come after the kit's, and each tray opens at once", async () => {
  const ids = WALLET_SECTIONS.map((section) => section.id);
  const kit = WALLET_KIT_SECTIONS.map((section) => section.id);
  expect(ids.slice(0, kit.length)).toEqual(kit);
  // The tray's four together, after the kit's: later tasks' lists may follow them (index.ts adds each in plan order).
  const first = ids.indexOf('bw-tray-short');
  expect(first).toBeGreaterThanOrEqual(kit.length);
  expect(ids.slice(first, first + 4)).toEqual(['bw-tray-short', 'bw-tray-tall', 'bw-tray-large', 'bw-buttons']);
  for (const id of ['bw-tray-short', 'bw-tray-tall', 'bw-tray-large']) {
    const section = WALLET_SECTIONS.find((each) => each.id === id);
    mountWallet(<>{section?.render()}</>);
    await settle();
    expect(screen.queryAllByRole('dialog'), id).toHaveLength(1);
    cleanup();
  }
});
