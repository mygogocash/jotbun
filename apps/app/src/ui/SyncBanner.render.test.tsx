import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { AccessibilityInfo, Platform } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { SyncBanner } from './SyncBanner';
import type { SyncBannerProps } from './SyncBanner';

// The iOS test flips Platform.OS, which sends the theme to native storage.
vi.mock('@mobile/theme/themePreferenceStorage', () => ({
  readStoredThemePreferenceSync: () => null,
  readStoredThemePreference: async () => null,
  writeStoredThemePreference: async () => undefined,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;

const review = { label: 'Review', onPress: () => undefined };
const cases: readonly [SyncBannerProps, string, Record<string, number>?][] = [
  [{ state: 'offline' }, 'Offline. New entries are saved on this phone.'],
  [{ state: 'saving', count: 1 }, 'Saving 1 entry…'],
  [{ state: 'saving', count: 3 }, 'Saving {count} entries…', { count: 3 }],
  [{ state: 'checking', count: 1 }, 'Checking 1 entry with Jotbun before sending it again'],
  [{ state: 'checking', count: 2 }, 'Checking {count} entries with Jotbun before sending them again', { count: 2 }],
  [{ state: 'needs_review', count: 2, action: review }, 'Entries that need your review: {count}', { count: 2 }],
  [{ state: 'paused_upgrade' }, 'Update Jotbun to send the entries saved on this device'],
  [{ state: 'locked' }, 'Your diary is locked on this phone. Entries saved here are kept.'],
];

test('every state is written out in words inside a polite status region, in every locale', () => {
  for (const locale of LOCALES) {
    for (const [props, english, values] of cases) {
      mount(<SyncBanner {...props} />, locale);
      const status = screen.getByRole('status');
      expect(status.getAttribute('aria-live')).toBe('polite');
      const text = translateCopy(english, locale, values);
      expect(screen.getByText(text).style.lineHeight).toBe(`${bunText('caption', locale === 'th' ? 'thai' : 'latin').lineHeight}px`);
      cleanup();
    }
  }
});

test('the shared sync copy is reused, so Thai already reads in Thai', () => {
  mount(<SyncBanner state="checking" count={2} />, 'th');
  expect(screen.getByText('กำลังตรวจสอบ 2 รายการกับ Jotbun ก่อนส่งอีกครั้ง')).toBeTruthy();
});

test('needs-review carries its action; upgrade and locked may carry one', () => {
  const onReview = vi.fn();
  const onUpdate = vi.fn();
  mount(<SyncBanner state="needs_review" count={1} action={{ label: 'Review', onPress: onReview }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  expect(onReview).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Review' }).style.minHeight).toBe('44px');
  cleanup();
  mount(<SyncBanner state="paused_upgrade" action={{ label: 'Update', onPress: onUpdate }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Update' }));
  expect(onUpdate).toHaveBeenCalledTimes(1);
  cleanup();
  mount(<SyncBanner state="offline" />);
  expect(screen.queryByRole('button')).toBeNull();
});

test('nothing waiting means no banner', () => {
  for (const props of [{ state: 'saving', count: 0 }, { state: 'checking', count: 0 }, { state: 'needs_review', count: 0, action: review }] as const) {
    mount(<SyncBanner {...props} />);
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
  }
});

test('a slim strip in the flow of the page, never floating over content', () => {
  for (const [mode, colors] of MODES) {
    mount(<SyncBanner state="offline" />, 'en', mode);
    const status = screen.getByRole('status');
    expect(['', 'relative', 'static']).toContain(status.style.position);
    expect(status.style.height).toBe('');
    expect(status.style.backgroundColor).toBe(rgb(colors.card));
    expect(screen.getByText('Offline. New entries are saved on this phone.').style.color).toBe(rgb(colors.ink));
    cleanup();
  }
});

test('a banner inside a screen\'s own live region is not a live region itself and does not announce', () => {
  const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  const os = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  try {
    mount(<SyncBanner state="saving" count={2} live={false} />);
    const line = screen.getByText('Saving 2 entries…');
    expect(line.closest('[aria-live]')).toBeNull();
    expect(line.closest('[role="status"]')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  }
});

test('saving may carry an action, such as listing the entries', () => {
  const onPress = vi.fn();
  mount(<SyncBanner state="saving" count={1} action={{ label: 'Show all', onPress }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('iOS hears each new state, because VoiceOver skips live regions', () => {
  const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  const os = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  try {
    const { rerender } = mount(<SyncBanner state="saving" count={2} />);
    expect(announce).toHaveBeenLastCalledWith('Saving 2 entries…');
    rerender(<IntlProvider locale="en"><ThemeProvider><ThemePreferenceOverride preference="light"><SyncBanner state="offline" /></ThemePreferenceOverride></ThemeProvider></IntlProvider>);
    expect(announce).toHaveBeenLastCalledWith('Offline. New entries are saved on this phone.');
    expect(announce).toHaveBeenCalledTimes(2);
  } finally {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  }
});
