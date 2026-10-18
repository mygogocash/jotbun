import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, test } from 'vitest';

import type { Locale } from '@mobile/i18n/locales';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { bunText } from '@mobile/theme/bunType';
import { ThemePreferenceOverride, ThemeProvider } from '@mobile/theme/ThemeProvider';
import { BunText } from './BunText';
import { Card, OutlinedCard } from './Card';

afterEach(() => cleanup());

const MODES = [['light', bunLight], ['dark', bunDark]] as const;

function mount(ui: ReactElement, locale: Locale = 'en', mode: 'light' | 'dark' = 'light') {
  return render(<IntlProvider locale={locale}><ThemeProvider><ThemePreferenceOverride preference={mode}>{ui}</ThemePreferenceOverride></ThemeProvider></IntlProvider>);
}
const rgb = (hex: string) => `rgba(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}, 1.00)`;

function edge(node: HTMLElement) {
  return {
    width: node.style.borderTopWidth || node.style.borderWidth,
    color: node.style.borderTopColor || node.style.borderColor,
    style: node.style.borderTopStyle || node.style.borderStyle,
    radius: node.style.borderTopLeftRadius || node.style.borderRadius,
  };
}

test('a card is cream with a 2 pt ink outline, the card radius and no shadow', () => {
  for (const [mode, colors] of MODES) {
    mount(<Card testID="card"><BunText>Food</BunText></Card>, 'en', mode);
    const card = screen.getByTestId('card');
    expect(card.style.backgroundColor).toBe(rgb(colors.card));
    expect(edge(card)).toEqual({ width: '2px', color: rgb(colors.ink), style: 'solid', radius: '16px' });
    expect(card.style.boxShadow).toBe('');
    expect(card.style.paddingTop || card.style.padding).toBe('16px');
    expect(screen.getByText('Food')).toBeTruthy();
    cleanup();
  }
});

test('an outlined card keeps the ink outline but takes the ground beneath it', () => {
  for (const [mode, colors] of MODES) {
    mount(<OutlinedCard testID="card"><BunText>Wallets</BunText></OutlinedCard>, 'en', mode);
    const card = screen.getByTestId('card');
    expect(card.style.backgroundColor).not.toBe(rgb(colors.card));
    expect(edge(card)).toEqual({ width: '2px', color: rgb(colors.ink), style: 'solid', radius: '16px' });
    cleanup();
  }
});

test('padding comes from the spacing scale and accessibility props pass through', () => {
  mount(<Card testID="card" padding="lg" accessible accessibilityLabel="Food budget, ฿420 left"><BunText>Food</BunText></Card>);
  const card = screen.getByTestId('card');
  expect(card.style.paddingTop || card.style.padding).toBe('24px');
  expect(screen.getByLabelText('Food budget, ฿420 left')).toBe(card);
});

test('a card never fixes its height, so Thai and large text grow it instead of clipping', () => {
  mount(<Card testID="card"><BunText>ค่าอาหาร</BunText></Card>, 'th');
  const card = screen.getByTestId('card');
  expect(card.style.height).toBe('');
  expect(card.style.overflowY || card.style.overflow).not.toBe('hidden');
  expect(screen.getByText('ค่าอาหาร').style.lineHeight).toBe(`${bunText('body', 'thai').lineHeight}px`);
});
