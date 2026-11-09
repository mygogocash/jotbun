import { cleanup, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { View } from 'react-native';
import { afterEach, expect, test } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { PromiseList } from './PromiseList';

afterEach(() => cleanup());

const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;

const promises = [
  { key: 'bank', text: 'Jotbun never asks for your bank password.', icon: <View testID="icon-lock" /> },
  { key: 'sell', text: 'We never sell your diary.' },
];

test('a list of plain promises, one row each, under an optional heading', () => {
  for (const [mode, colors] of MODES) {
    mount(<PromiseList title="Our promises" items={promises} />, 'en', mode);
    expect(screen.getByRole('heading', { name: 'Our promises' }).style.color).toBe(rgb(colors.ink));
    const list = screen.getByRole('list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent?.replace(/^\W+/, ''))).toEqual(['Jotbun never asks for your bank password.', 'We never sell your diary.']);
    expect(screen.getByText('We never sell your diary.').style.color).toBe(rgb(colors.ink));
    cleanup();
  }
  mount(<PromiseList items={promises} />);
  expect(screen.queryByRole('heading')).toBeNull();
});

test('icons are decorative, and a row without one gets a plain tick', () => {
  mount(<PromiseList items={promises} />);
  expect(screen.getByTestId('icon-lock').closest('[aria-hidden="true"]')).not.toBeNull();
  const tick = screen.getByText('✓');
  expect(tick.closest('[aria-hidden="true"]')).not.toBeNull();
});

test('promises keep each locale\'s leading', () => {
  for (const locale of LOCALES) {
    mount(<PromiseList items={[{ key: 'sell', text: 'เราไม่ขายข้อมูลของคุณ' }]} />, locale);
    expect(screen.getByText('เราไม่ขายข้อมูลของคุณ').style.lineHeight).toBe(`${bunText('body', locale === 'th' ? 'thai' : 'latin').lineHeight}px`);
    cleanup();
  }
});
