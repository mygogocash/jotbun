import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, test, vi } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { PillButton } from './PillButton';

afterEach(() => cleanup());

const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;

test('primary is an ink pill with an onInk label, at least 44 pt tall, and presses once', () => {
  for (const [mode, colors] of MODES) {
    const onPress = vi.fn();
    mount(<PillButton label="Save entry" onPress={onPress} />, 'en', mode);
    const button = screen.getByRole('button', { name: 'Save entry' });
    expect(button.style.backgroundColor).toBe(rgb(colors.ink));
    expect(button.style.minHeight).toBe('44px');
    expect(button.style.borderTopLeftRadius || button.style.borderRadius).toBe('999px');
    expect(screen.getByText('Save entry').style.color).toBe(rgb(colors.onInk));
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    cleanup();
  }
});

test('secondary is outlined in ink with an ink label and no fill', () => {
  for (const [mode, colors] of MODES) {
    mount(<PillButton kind="secondary" label="Not now" onPress={() => undefined} />, 'en', mode);
    const button = screen.getByRole('button', { name: 'Not now' });
    expect(button.style.backgroundColor).not.toBe(rgb(colors.ink));
    expect(button.style.borderTopColor || button.style.borderColor).toBe(rgb(colors.ink));
    expect(button.style.borderTopStyle || button.style.borderStyle).toBe('solid');
    expect(screen.getByText('Not now').style.color).toBe(rgb(colors.ink));
    cleanup();
  }
});

test('busy says what it is doing, is marked busy, hides its spinner and ignores presses', () => {
  const onPress = vi.fn();
  mount(<PillButton label="Save entry" busy busyLabel="Saving…" onPress={onPress} />);
  const button = screen.getByRole('button', { name: 'Saving…' });
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByText('Save entry')).toBeNull();
  fireEvent.click(button);
  expect(onPress).not.toHaveBeenCalled();
  cleanup();
  mount(<PillButton label="Save entry" busy onPress={onPress} />);
  expect(screen.getByRole('button', { name: 'Save entry' }).getAttribute('aria-busy')).toBe('true');
});

test('disabled shows its reason in words, is marked disabled and ignores presses', () => {
  for (const [mode, colors] of MODES) {
    const onPress = vi.fn();
    mount(<PillButton label="Save entry" disabled disabledReason="Enter an amount first" onPress={onPress} />, 'en', mode);
    const button = screen.getByRole('button', { name: 'Save entry' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
    const reason = screen.getByText('Enter an amount first');
    expect(reason.style.color).toBe(rgb(colors.muted));
    expect(screen.getByText('Save entry').style.color).toBe(rgb(colors.muted));
    expect(button.style.backgroundColor).not.toBe(rgb(colors.ink));
    cleanup();
  }
  mount(<PillButton label="Save entry" onPress={() => undefined} disabledReason="Enter an amount first" />);
  expect(screen.queryByText('Enter an amount first')).toBeNull();
});

test('an explicit accessibility label names the button', () => {
  mount(<PillButton label="Delete" accessibilityLabel="Delete Coffee ฿65.00" onPress={() => undefined} />);
  expect(screen.getByRole('button', { name: 'Delete Coffee ฿65.00' })).toBeTruthy();
});

test('labels use the locale\'s leading so Thai marks are not clipped', () => {
  for (const locale of LOCALES) {
    mount(<PillButton label="บันทึกรายการ" onPress={() => undefined} />, locale);
    const expected = bunText('label', locale === 'th' ? 'thai' : 'latin');
    const label = screen.getByText('บันทึกรายการ');
    expect(label.style.lineHeight).toBe(`${expected.lineHeight}px`);
    expect(label.style.fontSize).toBe(`${expected.fontSize}px`);
    cleanup();
  }
});
