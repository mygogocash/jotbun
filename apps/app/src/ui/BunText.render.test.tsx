import { cleanup, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, expect, test } from 'vitest';

import { bunLight } from '@mobile/theme/bunPalette';
import { ThemeProvider } from '@mobile/theme/ThemeProvider';
import { LATIN_UI_FONT_FAMILY, THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { BunText } from './BunText';

afterEach(() => cleanup());

function mount(locale: string) {
  render(<IntlProvider locale={locale}><ThemeProvider><BunText variant="heading" tone="muted">฿65.00</BunText></ThemeProvider></IntlProvider>);
  return screen.getByText('฿65.00');
}

test('Thai text uses Anuphan with Thai leading', () => {
  const node = mount('th');
  expect(node.style.fontFamily).toContain(THAI_UI_FONT_FAMILY.split(',')[0]);
  expect(node.style.lineHeight).toBe('33px');
});

test('English and Vietnamese use DM Sans in the bun palette', () => {
  for (const locale of ['en', 'vi']) {
    const node = mount(locale);
    expect(node.style.fontFamily).toContain(LATIN_UI_FONT_FAMILY.split(',')[0].replace(/"/g, ''));
    expect(node.style.lineHeight).toBe('29px');
    expect(node.style.color).toMatch(/91, 79, 128/);
    expect(bunLight.muted).toBe('#5B4F80');
    cleanup();
  }
});
