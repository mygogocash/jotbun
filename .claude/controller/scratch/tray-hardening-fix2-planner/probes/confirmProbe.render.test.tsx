// Confirming-review probes for tray-hardening (scratch copy only; never part of the task).
// A Modal that behaves as React Native 0.88's Modal.js does on iOS (lines 237 to 324): a class whose native
// "dismissal ended" event calls setState({ isRendered: false }, cb), and cb calls the latest props.onDismiss.
// It also logs what the commit looks like when the callback runs.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

const ios = vi.hoisted(() => ({
  modal: null as null | { end: () => void },
  log: [] as string[],
  commits: 0,
}));
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  const React = await import('react');
  type P = Record<string, unknown> & { visible?: boolean; onDismiss?: () => void };
  const trayInDom = () => document.querySelector('[data-testid="tray"]') !== null;
  class IosModal extends React.Component<P, { isRendered: boolean }> {
    state = { isRendered: this.props.visible === true };
    componentDidMount() { ios.modal = this; }
    componentDidUpdate(prev: P) {
      ios.commits += 1;
      ios.log.push(`commit ${ios.commits}: Modal visible ${String(prev.visible)}->${String(this.props.visible)}, card in DOM ${trayInDom()}`);
      if (prev.visible === false && this.props.visible === true) this.setState({ isRendered: true });
    }
    end = () => {
      ios.log.push('native end handled (setState queued)');
      this.setState({ isRendered: false }, () => {
        ios.log.push(`end callback in commit ${ios.commits}: Modal visible ${String(this.props.visible)}, card in DOM ${trayInDom()}`);
        this.props.onDismiss?.();
      });
    };
    render() { return React.createElement(actual.Modal as never, { ...this.props, onDismiss: undefined } as never); }
  }
  return { ...actual, Modal: IosModal };
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
  vi.clearAllMocks();
  ios.modal = null;
  ios.log.length = 0;
  ios.commits = 0;
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
const nativeEnd = () => { expect(ios.modal, 'the Modal').not.toBeNull(); act(() => { ios.modal?.end(); }); };

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

test('C1: the shipped F3 body (end, then a tap, in one act) runs the end callback in the commit that opens the tray', async () => {
  phoneFocus();
  const onClosed = vi.fn();
  const { Host, control } = tapHost(onClosed);
  const view = mountWallet(<Host />);
  await settle();
  platform('ios');
  view.rerender(<Host />);
  act(() => { control.setVisible(true); });
  await settle();
  vi.useFakeTimers();
  act(() => { control.setVisible(false); });
  act(() => { vi.advanceTimersByTime(220); });
  expect(screen.queryByTestId('tray')).toBeNull();
  ios.log.length = 0;
  act(() => {
    ios.modal?.end();
    fireEvent.click(screen.getByTestId('add'));
  });
  console.log(`C1 log:\n  ${ios.log.join('\n  ')}`);
  const callback = ios.log.find((line) => line.startsWith('end callback'));
  expect(callback, 'the end callback ran').toBeDefined();
  // The committed shown (the Modal's visible) is true, and the card is already in the DOM, when the callback runs.
  expect(callback).toContain('Modal visible true');
  expect(callback).toContain('card in DOM true');
  // No commit between the native end and its callback rendered the Modal hidden: one commit holds both.
  const between = ios.log.slice(ios.log.indexOf('native end handled (setState queued)') + 1, ios.log.indexOf(callback as string));
  expect(between.filter((line) => line.includes('visible true->false')), 'a hide commit between').toEqual([]);
  expect(screen.queryByTestId('tray'), 'open again').not.toBeNull();
  expect(onClosed).not.toHaveBeenCalled();
});

test('H3a: a late end that comes while the card leaves says nothing; that hide\'s own end says it closed, once', async () => {
  const onClosed = vi.fn();
  const view = await iosTray(onClosed);
  const close = () => view.rerender(tray({ visible: false, onClosed }));
  const open = () => view.rerender(tray({ onClosed }));
  close();
  act(() => { vi.advanceTimersByTime(220); }); // the Modal hides; UIKit's dismissal 1 under way
  open();
  close(); // the card leaves again, the Modal still shown
  nativeEnd(); // end of dismissal 1, while the card leaves
  expect(onClosed, 'end 1 while the card leaves').toHaveBeenCalledTimes(0);
  act(() => { vi.advanceTimersByTime(220); }); // the Modal hides again; dismissal 2 under way
  expect(onClosed).toHaveBeenCalledTimes(0);
  nativeEnd(); // end of dismissal 2
  expect(onClosed, 'end 2').toHaveBeenCalledTimes(1);
});

test('H3b: two reopen-and-close rounds before the Modal hides once give one dismissal, so exactly one onClosed', async () => {
  const onClosed = vi.fn();
  const view = await iosTray(onClosed);
  const close = () => view.rerender(tray({ visible: false, onClosed }));
  const open = () => view.rerender(tray({ onClosed }));
  close();
  act(() => { vi.advanceTimersByTime(100); });
  open();
  close();
  act(() => { vi.advanceTimersByTime(100); });
  open();
  close();
  act(() => { vi.advanceTimersByTime(220); }); // the only Modal hide
  nativeEnd();
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('H3c: two rounds that both reach the Modal, both ends late: one onClosed per end (n-3), and only once the tray is hidden', async () => {
  const onClosed = vi.fn();
  const view = await iosTray(onClosed);
  const close = () => view.rerender(tray({ visible: false, onClosed }));
  const open = () => view.rerender(tray({ onClosed }));
  close();
  act(() => { vi.advanceTimersByTime(220); });
  open();
  close();
  nativeEnd(); // end 1 while the card leaves the second time
  expect(onClosed, 'end 1 while the card leaves').toHaveBeenCalledTimes(0);
  act(() => { vi.advanceTimersByTime(220); });
  nativeEnd(); // end 2
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('H3d: the earlier end and the second hide land in one commit: the tray is hidden in it, so it says closed (and the second end says it again)', async () => {
  const onClosed = vi.fn();
  const view = await iosTray(onClosed);
  const close = () => view.rerender(tray({ visible: false, onClosed }));
  const open = () => view.rerender(tray({ onClosed }));
  close();
  act(() => { vi.advanceTimersByTime(220); });
  open();
  close();
  act(() => { vi.advanceTimersByTime(219); });
  expect(onClosed).toHaveBeenCalledTimes(0);
  act(() => {
    ios.modal?.end(); // end 1 queued
    vi.advanceTimersByTime(1); // the hide timer fires: setShown(false)
  });
  console.log(`H3d: after end 1 batched with the hide: onClosed ${onClosed.mock.calls.length}`);
  nativeEnd(); // end 2
  console.log(`H3d: after end 2: onClosed ${onClosed.mock.calls.length}`);
  expect(onClosed.mock.calls.length).toBeGreaterThanOrEqual(1);
});

test('S1: end and reopen and close again, all in one act: the tray is closed in the committed state, so the end says closed', async () => {
  const onClosed = vi.fn();
  const { Host, control } = tapHost(onClosed);
  phoneFocus();
  const view = mountWallet(<Host />);
  await settle();
  platform('ios');
  view.rerender(<Host />);
  act(() => { control.setVisible(true); });
  await settle();
  vi.useFakeTimers();
  act(() => { control.setVisible(false); });
  act(() => { vi.advanceTimersByTime(220); });
  act(() => {
    ios.modal?.end();
    control.setVisible(true);
    control.setVisible(false);
  });
  console.log(`S1: tray in DOM ${screen.queryByTestId('tray') !== null}, onClosed ${onClosed.mock.calls.length}`);
  expect(screen.queryByTestId('tray')).toBeNull();
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('N1: on iOS the end calls the onClosed the host passed last (a new one arrives after the Modal hid)', async () => {
  const first = vi.fn();
  const latest = vi.fn();
  const view = await iosTray(first);
  view.rerender(tray({ visible: false, onClosed: first }));
  act(() => { vi.advanceTimersByTime(220); }); // the Modal hides; the dismissal is under way
  view.rerender(tray({ visible: false, onClosed: latest })); // a host that passes a new function on every render
  nativeEnd();
  expect([first.mock.calls.length, latest.mock.calls.length]).toEqual([0, 1]);
});

test('S2: a host with no onClosed under the batched reopen: nothing throws', async () => {
  phoneFocus();
  const { Host, control } = tapHost(undefined as never);
  const view = mountWallet(<Host />);
  await settle();
  platform('ios');
  view.rerender(<Host />);
  act(() => { control.setVisible(true); });
  await settle();
  vi.useFakeTimers();
  act(() => { control.setVisible(false); });
  act(() => { vi.advanceTimersByTime(220); });
  expect(() => nativeEnd()).not.toThrow();
});
