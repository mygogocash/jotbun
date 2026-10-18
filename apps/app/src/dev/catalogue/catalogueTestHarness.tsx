// Render harness for the catalogue tests: the providers the root layout mounts
// (bun intensity, safe area, copy and theme) around an element. Test use only;
// nothing in the app imports it.
import { act, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Locale } from '@mobile/i18n/locales';
import { BunIntensityProvider } from '@mobile/mascot/BunIntensityProvider';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { ThemeProvider } from '@mobile/theme/ThemeProvider';

/** An iPhone 17 Pro, the 402 × 874 pt screen each section is sized for. */
export const PHONE = { frame: { x: 0, y: 0, width: 402, height: 874 }, insets: { top: 62, right: 0, bottom: 34, left: 0 } };
// Test files replace react-native-safe-area-context with ./safeAreaTestStub.

export const THEMES = ['light', 'dark'] as const;
export const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
export const paletteFor = (theme: 'light' | 'dark') => (theme === 'dark' ? bunDark : bunLight);

/** How react-native-web writes an inline colour. */
export const rgba = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;

/** The app's own providers, in the root layout's order, with the app in `appLocale`. */
export function inApp(element: ReactElement, appLocale: Locale = 'en'): ReactElement {
  return (
    <BunIntensityProvider>
      <SafeAreaProvider initialMetrics={PHONE}>
        <IntlProvider locale={appLocale}>
          <ThemeProvider>{element}</ThemeProvider>
        </IntlProvider>
      </SafeAreaProvider>
    </BunIntensityProvider>
  );
}

export function mountInApp(element: ReactElement, appLocale: Locale = 'en') {
  const view = render(inApp(element, appLocale));
  return { ...view, rerenderInApp: (next: ReactElement) => view.rerender(inApp(next, appLocale)) };
}

/** Lets the OS answers (reduced motion, screen reader) the kit asks for on mount settle. */
export async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}
