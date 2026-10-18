import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, test } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText, RECEIPT_SERIF } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { Amount } from './Amount';
import { ReceiptRow, ReceiptSlip, ReceiptTotal } from './ReceiptSlip';

afterEach(() => cleanup());

const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;
const firstFamily = (stack: string) => stack.split(',')[0].replace(/"/g, '');
const side = (node: HTMLElement, edge: 'Top' | 'Bottom', part: 'Width' | 'Style' | 'Color') =>
  node.style.getPropertyValue(`border-${edge.toLowerCase()}-${part.toLowerCase()}`) || node.style.getPropertyValue(`border-${part.toLowerCase()}`);

function slip() {
  return (
    <ReceiptSlip title="Today" footer="Saving · will sync">
      <ReceiptRow label="Category" value="Food" />
      <ReceiptRow label="Coffee" value={<Amount minor="6500" type="expense" />} />
      <ReceiptTotal label="Total" minor="123456" />
    </ReceiptSlip>
  );
}

test('a paper slip with a dashed edge in both modes', () => {
  for (const [mode, colors] of MODES) {
    mount(slip(), 'en', mode);
    const paper = screen.getByTestId('receipt-slip');
    expect(paper.style.backgroundColor).toBe(rgb(colors.paper));
    expect(side(paper, 'Top', 'Style')).toBe('dashed');
    expect(side(paper, 'Top', 'Color')).toBe(rgb(colors.ink));
    expect(paper.style.boxShadow).toBe('');
    cleanup();
  }
});

test('the title is a serif heading in Latin scripts and stays Anuphan in Thai', () => {
  for (const locale of LOCALES) {
    mount(slip(), locale);
    const title = screen.getByRole('heading', { name: 'Today' });
    if (locale === 'th') {
      expect(title.style.fontFamily).toContain(firstFamily(THAI_UI_FONT_FAMILY));
      expect(title.style.lineHeight).toBe(`${bunText('heading', 'thai').lineHeight}px`);
    } else {
      expect(title.style.fontFamily).toContain(firstFamily(RECEIPT_SERIF));
    }
    cleanup();
  }
});

test('each row reads label then value, with a decorative dotted rule between them', () => {
  for (const [mode, colors] of MODES) {
    mount(slip(), 'en', mode);
    const row = screen.getByLabelText('Category, Food');
    expect(row).toBeTruthy();
    const rule = row.querySelector('[data-testid="receipt-rule"]') as HTMLElement;
    expect(rule.getAttribute('aria-hidden')).toBe('true');
    expect(rule.style.overflowY || rule.style.overflow).toBe('hidden');
    const dots = rule.querySelector('[data-testid="receipt-rule-dots"]') as HTMLElement;
    for (const edge of ['Top', 'Bottom'] as const) {
      expect(side(dots, edge, 'Style')).toBe('dotted');
      expect(side(dots, edge, 'Color')).toBe(rgb(colors.rule));
    }
    expect(screen.getByText('Category').style.color).toBe(rgb(colors.muted));
    expect(screen.getByText('Food').style.color).toBe(rgb(colors.ink));
    // A value that speaks for itself is left to do so.
    expect(screen.getByLabelText('Expense ฿65.00')).toBeTruthy();
    cleanup();
  }
});

test('the total sits under a solid ink rule with an exact serif amount', () => {
  for (const [mode, colors] of MODES) {
    mount(slip(), 'en', mode);
    const total = screen.getByLabelText('Total, ฿1,234.56');
    expect(side(total, 'Top', 'Style')).toBe('solid');
    expect(side(total, 'Top', 'Width')).toBe('2px');
    expect(side(total, 'Top', 'Color')).toBe(rgb(colors.ink));
    expect(screen.getByText('฿1,234.56').style.fontFamily).toContain(firstFamily(RECEIPT_SERIF));
    cleanup();
  }
  mount(<ReceiptSlip><ReceiptTotal label="Total" minor="6500" type="expense" state="saving" /></ReceiptSlip>);
  expect(screen.getByLabelText('Total, Expense ฿65.00, saving')).toBeTruthy();
  expect(screen.getByText('−฿65.00')).toBeTruthy();
  expect(screen.getByText('saving…')).toBeTruthy();
});

test('the footer states the slip\'s sync state in muted words', () => {
  for (const [mode, colors] of MODES) {
    mount(slip(), 'en', mode);
    expect(screen.getByText('Saving · will sync').style.color).toBe(rgb(colors.muted));
    cleanup();
  }
  mount(<ReceiptSlip><ReceiptRow label="Category" value="Food" /></ReceiptSlip>);
  expect(screen.queryByText('Saving · will sync')).toBeNull();
  expect(screen.queryByRole('heading')).toBeNull();
});

test('rows keep Thai leading and translate their joining words', () => {
  for (const locale of LOCALES) {
    mount(<ReceiptSlip><ReceiptRow label="หมวดหมู่" value="อาหาร" /></ReceiptSlip>, locale);
    expect(screen.getByLabelText(translateCopy('{label}, {value}', locale, { label: 'หมวดหมู่', value: 'อาหาร' }))).toBeTruthy();
    const script = locale === 'th' ? 'thai' : 'latin';
    expect(screen.getByText('หมวดหมู่').style.lineHeight).toBe(`${bunText('body', script).lineHeight}px`);
    cleanup();
  }
});
