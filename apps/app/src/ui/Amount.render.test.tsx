import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, test, vi } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText, RECEIPT_SERIF, receiptAmount } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY, THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { Amount } from './Amount';

// happy-dom drops `font-variant`, so the text primitive reports the figures it
// was asked for as a data attribute.
vi.mock('@mobile/theme/AppText', async () => {
  const { createElement, forwardRef } = await import('react');
  const RN = await import('react-native');
  const Text = forwardRef<unknown, { style?: unknown }>(function Text(props, ref) {
    const flat = RN.StyleSheet.flatten(props.style as never) as { fontVariant?: string[] } | undefined;
    return createElement(RN.Text, { ...props, ref, dataSet: { figures: (flat?.fontVariant ?? []).join(' ') } } as never);
  });
  return { Text, TextInput: RN.TextInput };
});

afterEach(() => cleanup());

const LOCALES: readonly Locale[] = ['en', 'th', 'vi'];
const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;
const firstFamily = (stack: string) => stack.split(',')[0].replace(/"/g, '');

test('money is exact in every locale: grouping, satang and the sign each type carries', () => {
  for (const locale of LOCALES) {
    mount(<>
      <Amount minor="123456" />
      <Amount minor="-6500" />
      <Amount minor="6500" type="expense" />
      <Amount minor="250075" type="income" />
      <Amount minor="1000" type="transfer" />
      <Amount minor="5" />
      <Amount minor="0" />
      <Amount minor="99999999999" />
    </>, locale);
    for (const shown of ['฿1,234.56', '-฿65.00', '−฿65.00', '+฿2,500.75', '฿10.00', '฿0.05', '฿0.00', '฿999,999,999.99']) {
      expect(screen.getByText(shown)).toBeTruthy();
    }
    cleanup();
  }
});

test('the spoken label says the type, the exact amount and the state in full', () => {
  mount(<>
    <Amount minor="6500" type="expense" state="saving" />
    <Amount minor="123456" type="income" state="conflict" />
    <Amount minor="6500" type="transfer" />
    <Amount minor="-6500" />
    <Amount minor="123456" />
  </>);
  expect(screen.getByLabelText('Expense ฿65.00, saving')).toBeTruthy();
  expect(screen.getByLabelText('Income ฿1,234.56, needs a look')).toBeTruthy();
  expect(screen.getByLabelText('Transfer ฿65.00')).toBeTruthy();
  expect(screen.getByLabelText('Minus ฿65.00')).toBeTruthy();
  expect(screen.getByLabelText('฿1,234.56')).toBeTruthy();
});

test('Thai and Vietnamese labels go through the copy catalogue', () => {
  for (const locale of ['th', 'vi'] as const) {
    mount(<Amount minor="6500" type="expense" state="saving" />, locale);
    const base = translateCopy('Expense {amount}', locale, { amount: '฿65.00' });
    expect(screen.getByLabelText(translateCopy('{amount}, saving', locale, { amount: base }))).toBeTruthy();
    expect(screen.getByText(translateCopy('saving…', locale))).toBeTruthy();
    cleanup();
  }
});

test('a pending state is a word, never colour alone; a confirmed amount has no state word', () => {
  for (const [mode, colors] of MODES) {
    mount(<Amount minor="6500" type="expense" state="saving" />, 'en', mode);
    const saving = screen.getByText('saving…');
    expect(saving.style.color).toBe(rgb(colors.accent));
    expect(screen.getByText('−฿65.00').style.color).toBe(rgb(colors.ink));
    cleanup();
    mount(<Amount minor="6500" type="expense" state="conflict" />, 'en', mode);
    expect(screen.getByText('needs a look').style.color).toBe(rgb(colors.ink));
    cleanup();
    mount(<Amount minor="6500" type="expense" />, 'en', mode);
    expect(screen.queryByText('saving…')).toBeNull();
    expect(screen.queryByText('needs a look')).toBeNull();
    cleanup();
  }
});

test('on the stage everything is ink; inside an ink fill everything is onInk', () => {
  for (const [mode, colors] of MODES) {
    mount(<Amount minor="6500" type="expense" state="saving" on="stage" />, 'en', mode);
    expect(screen.getByText('saving…').style.color).toBe(rgb(colors.ink));
    expect(screen.getByText('−฿65.00').style.color).toBe(rgb(colors.ink));
    cleanup();
    mount(<Amount minor="6500" type="expense" state="saving" on="ink" />, 'en', mode);
    expect(screen.getByText('saving…').style.color).toBe(rgb(colors.onInk));
    expect(screen.getByText('−฿65.00').style.color).toBe(rgb(colors.onInk));
    cleanup();
  }
});

test('sizes run s to xl in the type scale, with tabular figures and the locale\'s leading', () => {
  const sizes = [['s', 'label'], ['m', 'body'], ['l', 'title'], ['xl', 'hero']] as const;
  for (const locale of LOCALES) {
    const script = locale === 'th' ? 'thai' : 'latin';
    for (const [size, role] of sizes) {
      mount(<Amount minor="6500" size={size} />, locale);
      const node = screen.getByText('฿65.00');
      const expected = bunText(role, script);
      expect(node.style.fontSize).toBe(`${expected.fontSize}px`);
      expect(node.style.lineHeight).toBe(`${expected.lineHeight}px`);
      expect(node.style.fontFamily).toContain(firstFamily(script === 'thai' ? THAI_UI_FONT_FAMILY : LATIN_UI_FONT_FAMILY));
      expect(node.dataset.figures).toBe('tabular-nums');
      cleanup();
    }
  }
});

test('serif amounts use the receipt serif at the same sizes, still tabular', () => {
  for (const [size, px] of [['s', 15], ['m', 17], ['l', 28], ['xl', 34]] as const) {
    mount(<Amount minor="123456" size={size} serif />, 'th');
    const node = screen.getByText('฿1,234.56');
    const expected = receiptAmount(px);
    expect(node.style.fontFamily).toContain(firstFamily(RECEIPT_SERIF));
    expect(node.style.fontSize).toBe(`${px}px`);
    expect(node.style.lineHeight).toBe(`${expected.lineHeight}px`);
    expect(node.dataset.figures).toBe('tabular-nums');
    cleanup();
  }
});

test('the state word keeps Thai leading even beside a serif amount', () => {
  mount(<Amount minor="6500" size="xl" serif state="saving" />, 'th');
  const word = screen.getByText(translateCopy('saving…', 'th'));
  expect(word.style.lineHeight).toBe(`${bunText('label', 'thai').lineHeight}px`);
});
