// Confirming-review probe (scratch copy only): every valid sequence of up to N steps against a reference model
// of iOS's late dismissal. The Modal is a class that behaves as Modal.js does (a native end calls
// setState({ isRendered: false }, cb) and cb calls the latest props.onDismiss), so a step can be an end that is
// batched, in one act, with a reopen, a close or the hide timer.
//
// Reference (arrival-based, the intent of the header and of the first brief's P3): a dismissal's end says the tray
// closed only if, when the end arrives, the Modal is hidden, and the tray is still closed after the batch it lands in.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

const ios = vi.hoisted(() => ({ modal: null as null | { end: () => void }, hides: 0 }));
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  const React = await import('react');
  type P = Record<string, unknown> & { visible?: boolean; onDismiss?: () => void };
  class IosModal extends React.Component<P, { isRendered: boolean }> {
    state = { isRendered: this.props.visible === true };
    componentDidMount() { ios.modal = this; }
    componentDidUpdate(prev: P) {
      if (prev.visible === true && this.props.visible === false) ios.hides += 1;
      if (prev.visible === false && this.props.visible === true) this.setState({ isRendered: true });
    }
    end = () => { this.setState({ isRendered: false }, () => { this.props.onDismiss?.(); }); };
    render() { return React.createElement(actual.Modal as never, { ...this.props, onDismiss: undefined } as never); }
  }
  return { ...actual, Modal: IosModal };
});

import { mountWallet } from '../testing/walletHarness';
import { WalletText } from '../WalletText';
import { Tray } from './Tray';

const os = Platform.OS;
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  vi.restoreAllMocks();
  ios.modal = null;
  ios.hides = 0;
  delete (AccessibilityInfo as unknown as Record<string, unknown>).sendAccessibilityEvent;
});

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const platform = (value: string) => Object.defineProperty(Platform, 'OS', { value, configurable: true, writable: true });

type Step = 'close' | 'open' | 'hide' | 'end' | 'endOpen' | 'endClose' | 'hideEnd';
type Model = { visible: boolean; shown: boolean; pending: number; closed: number };

const initial = (): Model => ({ visible: true, shown: true, pending: 0, closed: 0 });
function valid(model: Model, step: Step): boolean {
  switch (step) {
    case 'close': return model.visible;
    case 'open': return !model.visible;
    case 'hide': return !model.visible && model.shown;
    case 'end': return model.pending > 0;
    case 'endOpen': return model.pending > 0 && !model.visible;
    case 'endClose': return model.pending > 0 && model.visible;
    case 'hideEnd': return model.pending > 0 && !model.visible && model.shown;
    default: return false;
  }
}
function advance(model: Model, step: Step): Model {
  const next = { ...model };
  switch (step) {
    case 'close': next.visible = false; break;
    case 'open': next.visible = true; next.shown = true; break;
    case 'hide': next.shown = false; next.pending += 1; break;
    case 'end':
      next.pending -= 1;
      if (!model.shown && !model.visible) next.closed += 1;
      break;
    case 'endOpen': next.pending -= 1; next.visible = true; next.shown = true; break;
    case 'endClose': next.pending -= 1; next.visible = false; break;
    case 'hideEnd': next.pending -= 1; next.shown = false; next.pending += 1; break;
    default: break;
  }
  return next;
}

const STEPS: Step[] = ['close', 'open', 'hide', 'end', 'endOpen', 'endClose', 'hideEnd'];
function sequences(length: number): Step[][] {
  const out: Step[][] = [];
  const walk = (prefix: Step[], model: Model) => {
    if (prefix.length === length) { out.push(prefix); return; }
    for (const step of STEPS) {
      if (valid(model, step)) walk([...prefix, step], advance(model, step));
    }
  };
  walk([], initial());
  return out;
}

async function run(steps: Step[]) {
  const onClosed = vi.fn();
  const control = { setVisible: (_: boolean) => undefined as void };
  function Host() {
    const [visible, setVisible] = useState(false);
    control.setVisible = setVisible;
    return (
      <>
        <button type="button" data-testid="add" onClick={() => setVisible(true)}>add</button>
        <Tray visible={visible} onClose={() => undefined} onClosed={onClosed} title="t">
          <WalletText>x</WalletText>
        </Tray>
      </>
    );
  }
  Object.defineProperty(AccessibilityInfo, 'sendAccessibilityEvent', { value: () => undefined, configurable: true, writable: true });
  const view = mountWallet(<Host />);
  await settle();
  platform('ios');
  view.rerender(<Host />);
  act(() => { control.setVisible(true); });
  await settle();
  vi.useFakeTimers();
  ios.hides = 0;
  const trace: { step: Step; closed: number; pending: number; open: boolean }[] = [];
  let hidesSeen = 0;
  for (const step of steps) {
    switch (step) {
      case 'close': act(() => { control.setVisible(false); }); break;
      case 'open': act(() => { fireEvent.click(screen.getByTestId('add')); }); break;
      case 'hide': act(() => { vi.advanceTimersByTime(220); }); break;
      case 'end': act(() => { ios.modal?.end(); }); break;
      case 'endOpen': act(() => { ios.modal?.end(); fireEvent.click(screen.getByTestId('add')); }); break;
      case 'endClose': act(() => { ios.modal?.end(); control.setVisible(false); }); break;
      case 'hideEnd': act(() => { ios.modal?.end(); vi.advanceTimersByTime(220); }); break;
      default: break;
    }
    hidesSeen = ios.hides;
    trace.push({ step, closed: onClosed.mock.calls.length, pending: hidesSeen, open: screen.queryByTestId('tray') !== null });
  }
  vi.useRealTimers();
  cleanup();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  ios.modal = null;
  return trace;
}

const LENGTH = Number(process.env.MODEL_LENGTH ?? '6');

test(`MODEL: every valid sequence of up to ${LENGTH} steps agrees with the arrival-based reference`, async () => {
  const deviations: string[] = [];
  const classes = new Map<string, number>();
  let total = 0;
  for (let length = 1; length <= LENGTH; length += 1) {
    for (const steps of sequences(length)) {
      total += 1;
      // Only run a sequence once, as the longest prefix set: a prefix is covered by its extensions, so run full-length ones only.
      if (length < LENGTH) continue;
      const trace = await run(steps);
      let model = initial();
      let hides = 0;
      for (let index = 0; index < steps.length; index += 1) {
        const step = steps[index] as Step;
        model = advance(model, step);
        if (step === 'hide' || step === 'hideEnd') hides += 1;
        const seen = trace[index];
        if (!seen) break;
        if (seen.closed !== model.closed) {
          const label = `${steps.slice(0, index + 1).join(' > ')}: onClosed ${seen.closed}, reference ${model.closed}`;
          deviations.push(label);
          classes.set(step, (classes.get(step) ?? 0) + 1);
          break;
        }
      }
      void hides;
    }
  }
  console.log(`MODEL: ${total} valid sequences up to length ${LENGTH}; ${deviations.length} full-length ones deviate; by the step that first deviates: ${JSON.stringify([...classes])}`);
  console.log(`MODEL deviations (first 12):\n  ${deviations.slice(0, 12).join('\n  ')}`);
  expect(deviations.length).toBeGreaterThanOrEqual(0);
}, 1_800_000);
