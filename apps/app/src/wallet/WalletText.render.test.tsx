import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../dev/catalogue/safeAreaTestStub'));

// react-native-web drops maxFontSizeMultiplier from the DOM, so the test records
// the props that reach the app's Text and still renders the real one.
const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('@mobile/theme/AppText', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mobile/theme/AppText')>();
  const { createElement, forwardRef } = await import('react');
  const Text = forwardRef<unknown, Record<string, unknown>>(function RecordedText(props, ref) {
    seen.props.push(props);
    return createElement(actual.Text as never, { ...props, ref });
  });
  return { ...actual, Text };
});

import { mountInApp, rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { ThemePreferenceOverride } from '@mobile/theme/ThemeProvider';
import { THEME_PREFERENCE_STORAGE_KEY } from '@mobile/theme/themePreferenceStorage';
import { THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { WALLET_TYPE } from '@mobile/theme/walletType';
import { WalletText } from './WalletText';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  seen.props.length = 0;
});

test('WalletText is Anuphan in Thai and in English, in the wallet ink of each mode', () => {
  const ink = { light: '#111014', dark: '#F4F2FA' } as const;
  // Body is 17 pt: Thai leading ceil(17 x 1.5), Latin ceil(17 x 1.3).
  const leading = { th: '26px', en: '23px' } as const;
  for (const locale of ['th', 'en'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      mountInApp(
        <ThemePreferenceOverride preference={mode}>
          <WalletText>Aa</WalletText>
        </ThemePreferenceOverride>,
        locale,
      );
      const node = screen.getByText('Aa');
      expect(node.style.fontFamily).toBe(THAI_UI_FONT_FAMILY);
      expect(node.style.color).toBe(rgba(ink[mode]));
      expect(node.style.fontSize).toBe('17px');
      expect(node.style.lineHeight).toBe(leading[locale]);
      cleanup();
    }
  }
});

test('WalletText takes the size, weight and leading of its role and the colour of its tone', () => {
  for (const [mode, colors] of [['light', walletLight], ['dark', walletDark]] as const) {
    mountInApp(
      <ThemePreferenceOverride preference={mode}>
        <WalletText role="h1" tone="violet">หัวเรื่อง</WalletText>
      </ThemePreferenceOverride>,
      'th',
    );
    const node = screen.getByText('หัวเรื่อง');
    expect(node.style.fontSize).toBe('28px');
    expect(node.style.fontWeight).toBe('700');
    expect(node.style.lineHeight).toBe('42px');
    expect(node.style.color).toBe(rgba(colors.violet));
    cleanup();
  }
});

test('each role caps its growth at its own maxScale (W30)', () => {
  for (const role of ['h1', 'h2', 'body', 'label', 'caption'] as const) {
    mountInApp(<WalletText role={role}>{role}</WalletText>, 'th');
    screen.getByText(role);
    expect(seen.props.at(-1)?.maxFontSizeMultiplier).toBe(WALLET_TYPE[role].maxScale);
    cleanup();
  }
});

test('without an override, WalletText follows the stored theme through the provider wallet palette', () => {
  window.localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'dark');
  mountInApp(<WalletText>Aa</WalletText>, 'en');
  expect(screen.getByText('Aa').style.color).toBe(rgba(walletDark.ink));
});
