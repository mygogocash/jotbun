// Render-test support for the R2b entry and data components. Test use only:
// nothing in the app imports this file.
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { expect } from 'vitest';

import type { CategoryDto, WalletDto } from '@gogospend/contracts';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import type { BunColors } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';

export const LOCALES = ['en', 'th', 'vi'] as const;
export type KitLocale = (typeof LOCALES)[number];
export const MODES: readonly (readonly ['light' | 'dark', BunColors])[] = [['light', bunLight], ['dark', bunDark]];

/** Every locale in both modes: the matrix each component is rendered in. */
export const MATRIX = LOCALES.flatMap((locale) => MODES.map(([mode, colors]) => ({ locale, mode, colors })));

export function mountKit(element: ReactElement, options: { locale?: string; mode?: 'light' | 'dark' } = {}) {
  const { locale = 'en', mode = 'light' } = options;
  return render(
    <IntlProvider locale={locale}>
      <ThemeProvider>
        <ThemePreferenceOverride preference={mode}>{element}</ThemePreferenceOverride>
      </ThemeProvider>
    </IntlProvider>,
  );
}

/**
 * Matches `#RRGGBB` as the DOM reports it, `rgb(r, g, b)` or the opaque
 * `rgba(r, g, b, 1.00)` react-native-web writes for backgrounds. Use with
 * `toEqual`.
 */
export function rgb(hex: string): unknown {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return expect.stringMatching(new RegExp(`^rgba?\\(${r}, ${g}, ${b}(, 1(\\.0+)?)?\\)$`));
}

/** The line height a Thai or Latin label must have so stacked marks are never clipped. */
export function leading(role: Parameters<typeof bunText>[0], locale: string): string {
  return `${bunText(role, locale === 'th' ? 'thai' : 'latin').lineHeight}px`;
}

/** Any emoji at all: the kit draws its icons as vectors. */
export const EMOJI = /\p{Extended_Pictographic}/u;

export const category = (id: string, overrides: Partial<CategoryDto> = {}): CategoryDto => ({
  id, type: 'expense', builtin_key: null, label: id, color: null, archived: false, version: 1, ...overrides,
});

export const wallet = (id: string, name: string, balance: string, archived = false): Pick<WalletDto, 'id' | 'name' | 'balance_minor' | 'archived'> => ({
  id, name, balance_minor: balance, archived,
});
