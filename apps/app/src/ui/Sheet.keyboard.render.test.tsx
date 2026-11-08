// On iOS the window does not resize for the keyboard, so a sheet whose field
// takes focus sat under the keyboard: Tell Bun's whole sheet when it is short
// (found on the iOS simulator, 28 October 2026). The sheet rises by the
// keyboard's height there. Android is left as it was (whether its window
// resizes under edge-to-edge is not checked yet), and the web has no
// on-screen keyboard. Render tests run on the web, so this file
// stands in for iOS: `Platform.OS` is set per test, and the keyboard wrapper
// shows its `behavior` as `data-keyboard-behavior`.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, forwardRef } from 'react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, test, vi } from 'vitest';

const platform = vi.hoisted(() => ({ os: 'ios' }));

vi.mock('react-native', async (importOriginal) => {
  const rn = await importOriginal<typeof import('react-native')>();
  const KeyboardAvoidingView = forwardRef<unknown, Record<string, unknown>>(function KeyboardAvoidingView({ behavior, dataSet, ...props }, ref) {
    return createElement(rn.View as never, { ...props, ref, dataSet: { ...(dataSet as Record<string, string> | undefined), keyboardBehavior: String(behavior ?? 'none') } });
  });
  const Platform = {
    ...rn.Platform,
    get OS() {
      return platform.os;
    },
    select: (spec: Record<string, unknown>) => (platform.os in spec ? spec[platform.os] : platform.os !== 'web' && 'native' in spec ? spec.native : spec.default),
  };
  // On iOS the sheet moves screen-reader focus to its title, which the web build lacks.
  const AccessibilityInfo = { ...rn.AccessibilityInfo, sendAccessibilityEvent: () => undefined };
  return { ...rn, AccessibilityInfo, KeyboardAvoidingView, Platform };
});
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }) }));
// Off the web, the theme reads its saved preference from secure storage, whose
// native half the web build lacks; here nothing is saved, as on a fresh phone.
const storedTheme = vi.hoisted(() => ({ read: vi.fn(async () => null) }));
vi.mock('@mobile/theme/themePreferenceStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@mobile/theme/themePreferenceStorage')>()),
  readStoredThemePreference: storedTheme.read,
  writeStoredThemePreference: async () => undefined,
}));

import { ThemeProvider } from '@mobile/theme/ThemeProvider';
import { BunText } from './BunText';
import { Sheet } from './Sheet';

afterEach(() => {
  cleanup();
  platform.os = 'ios';
});

function mount(ui: ReactElement) {
  return render(<IntlProvider locale="en"><ThemeProvider>{ui}</ThemeProvider></IntlProvider>);
}

const sheet = (onClose = vi.fn()) => <Sheet visible onClose={onClose} title="Tell Bun"><BunText>What did you spend?</BunText></Sheet>;
const behaviorAroundPanel = () => screen.getByTestId('sheet-panel').closest('[data-keyboard-behavior]')?.getAttribute('data-keyboard-behavior');

test('on iOS the sheet rises above the keyboard', async () => {
  mount(sheet());
  expect(behaviorAroundPanel()).toBe('padding');
  // The theme's native storage read went to the stand-in, not to secure storage.
  await waitFor(() => expect(storedTheme.read).toHaveBeenCalled());
});

test('on Android and the web the sheet leaves the keyboard to the window', () => {
  for (const os of ['android', 'web']) {
    platform.os = os;
    const { unmount } = mount(sheet());
    expect(behaviorAroundPanel(), os).toBe('none');
    unmount();
  }
});

test('the backdrop still closes the sheet inside the keyboard wrapper', () => {
  const onClose = vi.fn();
  mount(sheet(onClose));
  fireEvent.click(screen.getByTestId('sheet-backdrop'));
  expect(onClose).toHaveBeenCalledTimes(1);
});
