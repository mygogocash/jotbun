// Render harness for the mascot tests: the real theme, copy and bun intensity
// providers, with browser storage the provider can read. Test use only.
import { render } from '@testing-library/react';
import { Window } from 'happy-dom';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { vi } from 'vitest';

import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import type { BunIntensity } from './bunIntensity';
import { BunIntensityProvider } from './BunIntensityProvider';
import { BUN_INTENSITY_STORAGE_KEY } from './bunIntensityStorage';

export type MascotTheme = 'light' | 'dark';
export const THEMES: readonly MascotTheme[] = ['light', 'dark'];
export const paletteFor = (theme: MascotTheme) => (theme === 'dark' ? bunDark : bunLight);

/**
 * Node 26 exposes its own, unconfigured Web Storage getter. Use happy-dom's
 * real Storage so the provider reads and writes the way a browser would.
 */
export function installBrowserStorage(): Storage {
  const storage = new Window({ url: 'http://localhost:8081' }).localStorage;
  vi.stubGlobal('localStorage', storage);
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
  return storage;
}

export function mountMascot(element: ReactElement, { theme = 'light', locale = 'en', intensity }: { theme?: MascotTheme; locale?: string; intensity?: BunIntensity } = {}) {
  if (intensity) window.localStorage.setItem(BUN_INTENSITY_STORAGE_KEY, intensity);
  return render(
    <IntlProvider locale={locale}>
      <ThemeProvider>
        <ThemePreferenceOverride preference={theme}>
          <BunIntensityProvider>{element}</BunIntensityProvider>
        </ThemePreferenceOverride>
      </ThemeProvider>
    </IntlProvider>,
  );
}

/** Whether `node` or any ancestor hides it from assistive technology. */
export function hiddenFromScreenReaders(node: Element | null): boolean {
  for (let current = node; current; current = current.parentElement) {
    if (current.getAttribute('aria-hidden') === 'true') return true;
  }
  return false;
}
