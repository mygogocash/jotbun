import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, test } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { FlagChip } from './FlagChip';

afterEach(() => cleanup());

const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;

test('a flag says what to check, in words, and is spoken as a prompt to check', () => {
  for (const locale of LOCALES) {
    mount(<><FlagChip label="Date unclear" /><FlagChip label="Total is rounded" tone="info" /></>, locale);
    expect(screen.getByLabelText(translateCopy('Check this: {label}', locale, { label: 'Date unclear' }))).toBeTruthy();
    expect(screen.getByLabelText(translateCopy('Note: {label}', locale, { label: 'Total is rounded' }))).toBeTruthy();
    expect(screen.getByText('Date unclear').style.lineHeight).toBe(`${bunText('caption', locale === 'th' ? 'thai' : 'latin').lineHeight}px`);
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
  }
});

test('warning is ink and info is accent, outlined, never colour alone', () => {
  for (const [mode, colors] of MODES) {
    mount(<><FlagChip label="Date unclear" /><FlagChip label="Total is rounded" tone="info" /></>, 'en', mode);
    const warning = screen.getByLabelText('Check this: Date unclear');
    const info = screen.getByLabelText('Note: Total is rounded');
    expect(screen.getByText('Date unclear').style.color).toBe(rgb(colors.ink));
    expect(warning.style.borderTopColor || warning.style.borderColor).toBe(rgb(colors.ink));
    expect(screen.getByText('Total is rounded').style.color).toBe(rgb(colors.accent));
    expect(info.style.borderTopColor || info.style.borderColor).toBe(rgb(colors.accent));
    // Each tone has its own mark, hidden from screen readers because the label says it.
    const marks = [warning, info].map((chip) => chip.querySelector('[aria-hidden="true"]')?.textContent);
    expect(marks).toEqual(['!', 'i']);
    cleanup();
  }
});

test('a chip sizes to its words and never clips them', () => {
  mount(<FlagChip label="วันที่ไม่ชัดเจน" />, 'th');
  const chip = screen.getByLabelText(translateCopy('Check this: {label}', 'th', { label: 'วันที่ไม่ชัดเจน' }));
  expect(chip.style.height).toBe('');
  expect(chip.style.overflowY || chip.style.overflow).not.toBe('hidden');
});
