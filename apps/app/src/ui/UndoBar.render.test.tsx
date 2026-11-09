import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { AccessibilityInfo, Animated } from 'react-native';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { UndoBar } from './UndoBar';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('@mobile/hooks/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }));

const reader = { on: false };
beforeEach(() => {
  reader.on = false;
  vi.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(() => Promise.resolve(reader.on));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  motion.reduced = false;
});

const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;

test('a dark bar names what happened and offers an Undo pill, in every locale', () => {
  for (const locale of LOCALES) {
    const onUndo = vi.fn();
    mount(<UndoBar message="Entry deleted" onUndo={onUndo} />, locale);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('Entry deleted').style.lineHeight).toBe(`${bunText('body', locale === 'th' ? 'thai' : 'latin').lineHeight}px`);
    const undo = screen.getByRole('button', { name: translateCopy('Undo', locale) });
    expect(undo.style.minHeight).toBe('44px');
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
    cleanup();
  }
  mount(<UndoBar message="Entry deleted" undoLabel="Bring it back" onUndo={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Bring it back' })).toBeTruthy();
});

test('ink bar with onInk words; the Undo pill is cream with ink', () => {
  for (const [mode, colors] of MODES) {
    mount(<UndoBar message="Entry deleted" onUndo={vi.fn()} />, 'en', mode);
    expect(screen.getByRole('status').style.backgroundColor).toBe(rgb(colors.ink));
    expect(screen.getByText('Entry deleted').style.color).toBe(rgb(colors.onInk));
    expect(screen.getByRole('button', { name: 'Undo' }).style.backgroundColor).toBe(rgb(colors.card));
    expect(screen.getByText('Undo').style.color).toBe(rgb(colors.ink));
    cleanup();
  }
});

test('it never takes focus from what the person was doing', async () => {
  const field = document.createElement('input');
  document.body.appendChild(field);
  field.focus();
  mount(<UndoBar message="Entry deleted" onUndo={vi.fn()} />);
  await act(async () => { await Promise.resolve(); });
  expect(document.activeElement).toBe(field);
  field.remove();
});

test('it dismisses itself after the time given, and not before', async () => {
  vi.useFakeTimers();
  const onDismiss = vi.fn();
  mount(<UndoBar message="Entry deleted" onUndo={vi.fn()} autoDismissMs={6000} onDismiss={onDismiss} />);
  await act(async () => { await Promise.resolve(); });
  act(() => { vi.advanceTimersByTime(5999); });
  expect(onDismiss).not.toHaveBeenCalled();
  act(() => { vi.advanceTimersByTime(1); });
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test('without a time, or with a screen reader running, it waits for the person', async () => {
  vi.useFakeTimers();
  const onDismiss = vi.fn();
  mount(<UndoBar message="Entry deleted" onUndo={vi.fn()} onDismiss={onDismiss} />);
  await act(async () => { await Promise.resolve(); });
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(onDismiss).not.toHaveBeenCalled();
  cleanup();
  reader.on = true;
  mount(<UndoBar message="Entry deleted" onUndo={vi.fn()} autoDismissMs={6000} onDismiss={onDismiss} />);
  await act(async () => { await Promise.resolve(); });
  act(() => { vi.advanceTimersByTime(60_000); });
  expect(onDismiss).not.toHaveBeenCalled();
});

test('the timer stops when the bar goes away', async () => {
  vi.useFakeTimers();
  const onDismiss = vi.fn();
  const { unmount } = mount(<UndoBar message="Entry deleted" onUndo={vi.fn()} autoDismissMs={6000} onDismiss={onDismiss} />);
  await act(async () => { await Promise.resolve(); });
  unmount();
  vi.advanceTimersByTime(10_000);
  expect(onDismiss).not.toHaveBeenCalled();
});

test('it slides in, except under reduced motion', () => {
  // Animated settles at once under test, so watch the flights being asked for.
  const timing = vi.spyOn(Animated, 'timing');
  mount(<UndoBar message="Entry deleted" onUndo={vi.fn()} />);
  expect(timing.mock.calls.map(([, config]) => config.toValue).sort()).toEqual([0, 1]);
  cleanup();
  timing.mockClear();
  motion.reduced = true;
  mount(<UndoBar message="Entry deleted" onUndo={vi.fn()} />);
  expect(timing).not.toHaveBeenCalled();
  const status = screen.getByRole('status');
  expect(status.style.transform).toBe('translateY(0px)');
  expect(status.style.opacity).toBe('1');
});
