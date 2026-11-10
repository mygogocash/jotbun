// Reviewer probe (P2-T13, P10c and P10d on iOS). Scratch copy only.
// React Native's iOS Modal calls onDismiss from UIKit's dismissal completion,
// after the JS side has set visible false; react-native-web calls it in an
// effect at once. This wraps the Modal so the probe delivers onDismiss itself,
// late, as iOS would.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { AccessibilityInfo, Platform } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

const modal = vi.hoisted(() => ({ onDismiss: null as null | (() => void) }));
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  const React = await import('react');
  const Modal = React.forwardRef((props: Record<string, unknown>, ref) => {
    modal.onDismiss = (props.onDismiss as (() => void) | undefined) ?? null;
    return React.createElement(actual.Modal as never, { ...props, onDismiss: undefined, ref } as never);
  });
  return { ...actual, Modal };
});

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
  modal.onDismiss = null;
  delete (AccessibilityInfo as unknown as Record<string, unknown>).sendAccessibilityEvent;
});

function phoneFocus() {
  Object.defineProperty(AccessibilityInfo, 'sendAccessibilityEvent', { value: () => undefined, configurable: true, writable: true });
}

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const TITLE = 'จดรายจ่าย';
function tray(props: Partial<TrayProps> = {}) {
  return (
    <Tray visible onClose={() => undefined} title={TITLE} {...props}>
      <WalletText>ข้าวมันไก่ 50</WalletText>
    </Tray>
  );
}

test('P-M1: on iOS, onClosed waits for the Modal’s own onDismiss and fires once', async () => {
  const onClosed = vi.fn();
  const view = mountWallet(tray({ visible: false, onClosed }));
  await settle();
  phoneFocus();
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  view.rerender(tray({ onClosed }));
  await settle();
  vi.useFakeTimers();
  view.rerender(tray({ visible: false, onClosed }));
  act(() => { vi.advanceTimersByTime(1000); });
  expect(onClosed, 'before the dismissal completes').toHaveBeenCalledTimes(0);
  expect(modal.onDismiss, 'the Modal was given onDismiss').not.toBeNull();
  act(() => { modal.onDismiss?.(); });
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('P-M2: on iOS, a dismissal that completes after the tray was opened again does not say it closed', async () => {
  const onClosed = vi.fn();
  const view = mountWallet(tray({ visible: false, onClosed }));
  await settle();
  phoneFocus();
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  view.rerender(tray({ onClosed }));
  await settle();
  vi.useFakeTimers();
  view.rerender(tray({ visible: false, onClosed }));
  // The hide: the Modal is told visible false; UIKit's dismissal is under way.
  act(() => { vi.advanceTimersByTime(220); });
  // The host opens it again before UIKit's completion reaches JS.
  view.rerender(tray({ onClosed }));
  expect(screen.queryByTestId('tray'), 'open again').not.toBeNull();
  // UIKit's completion of the first dismissal arrives.
  act(() => { modal.onDismiss?.(); });
  expect(onClosed, 'onClosed while the tray is open').toHaveBeenCalledTimes(0);
});

test('P-N: back is the host’s and still works while locked; close does not', async () => {
  const onBack = vi.fn();
  const onClose = vi.fn();
  mountWallet(tray({ locked: true, onBack, onClose }));
  await settle();
  act(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[style*="visibility: hidden"]')) node.dispatchEvent(new Event('animationstart'));
  });
  fireEvent.click(screen.getByRole('button', { name: 'กลับ' }));
  fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));
  expect([onBack.mock.calls.length, onClose.mock.calls.length]).toEqual([1, 0]);
  expect(screen.getByRole('button', { name: 'กลับ' }).getAttribute('aria-disabled')).toBeNull();
});
