import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { View } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { BunText } from './BunText';
import { BUN_SPACE } from './layout';
import { MonthSwitcher, StageHeader } from './StageHeader';

vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }) }));

afterEach(() => cleanup());

const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;

test('a lavender band below the status bar, with the title as a heading and only ink text', () => {
  for (const [mode, colors] of MODES) {
    mount(<StageHeader title="October" subtitle="฿12,480 of ฿18,000" />, 'en', mode);
    const title = screen.getByRole('heading', { name: 'October' });
    expect(title.style.color).toBe(rgb(colors.ink));
    expect(screen.getByText('฿12,480 of ฿18,000').style.color).toBe(rgb(colors.ink));
    const band = screen.getByTestId('stage-header');
    expect(band.style.backgroundColor).toBe(rgb(colors.stage));
    expect(band.style.paddingTop).toBe(`${47 + BUN_SPACE.md}px`);
    cleanup();
  }
});

test('the month switcher steps months with named 44 pt buttons in every locale', () => {
  for (const locale of LOCALES) {
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    mount(<StageHeader title="Home" month={{ label: 'October 2026', onPrevious, onNext }} />, locale);
    expect(screen.getByText('October 2026').style.color).toBe(rgb(bunLight.ink));
    const previous = screen.getByRole('button', { name: translateCopy('Previous month', locale) });
    const next = screen.getByRole('button', { name: translateCopy('Next month', locale) });
    for (const button of [previous, next]) {
      expect(button.style.minHeight).toBe('44px');
      expect(button.style.minWidth).toBe('44px');
    }
    fireEvent.click(previous);
    fireEvent.click(next);
    expect(onPrevious).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
    cleanup();
  }
});

test('a month with nowhere to go keeps its arrow but marks it disabled', () => {
  const onPrevious = vi.fn();
  mount(<MonthSwitcher label="October 2026" onPrevious={onPrevious} />);
  const next = screen.getByRole('button', { name: 'Next month' });
  expect(next.getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByRole('button', { name: 'Previous month' }).getAttribute('aria-disabled')).not.toBe('true');
  // The new month is read out when it changes.
  expect(screen.getByText('October 2026').getAttribute('aria-live')).toBe('polite');
});

test('the bun and extra content sit in their own slots', () => {
  mount(<StageHeader title="Home" bun={<View testID="bun" />}><BunText>฿420 a day left</BunText></StageHeader>);
  expect(screen.getByTestId('bun')).toBeTruthy();
  expect(screen.getByText('฿420 a day left')).toBeTruthy();
});

test('Thai titles get Thai leading', () => {
  mount(<StageHeader title="เดือนนี้" subtitle="ใช้ไป ฿12,480" />, 'th');
  expect(screen.getByText('เดือนนี้').style.lineHeight).toBe(`${bunText('title', 'thai').lineHeight}px`);
  expect(screen.getByText('ใช้ไป ฿12,480').style.lineHeight).toBe(`${bunText('body', 'thai').lineHeight}px`);
});
