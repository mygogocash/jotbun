import { cleanup, screen } from '@testing-library/react';
import { translateCopy } from '@mobile/i18n/messages';
import { afterEach, expect, test } from 'vitest';

import { BudgetBar } from './BudgetBar';
import type { BudgetPace } from './budgetWords';
import { MATRIX, leading, mountKit, rgb } from './entryKitTestHarness';

afterEach(() => cleanup());

const onTrack: BudgetPace = { state: 'on_track', spentMinor: '1200000', limitMinor: '1800000', leftMinor: '600000', perDayMinor: '42000', daysLeft: 10 };
const tight: BudgetPace = { state: 'tight', spentMinor: '1680000', limitMinor: '1800000', leftMinor: '120000', perDayMinor: '12000', daysLeft: 10 };
const over: BudgetPace = { state: 'over', spentMinor: '1812000', limitMinor: '1800000', leftMinor: '-12000', perDayMinor: null, daysLeft: 9 };
const none: BudgetPace = { state: 'no_budget', spentMinor: '1200000', limitMinor: null, leftMinor: null, perDayMinor: null, daysLeft: 9 };

test('on track: words first, a progress bar that speaks the same words', () => {
  mountKit(<BudgetBar {...onTrack} />);
  expect(screen.getByText('฿420.00 a day left')).toBeTruthy();
  expect(screen.getByText('On track · ฿6,000.00 left · 10 days to go')).toBeTruthy();
  const bar = screen.getByRole('progressbar', { name: 'Budget' });
  expect(bar.getAttribute('aria-valuenow')).toBe('66');
  expect(bar.getAttribute('aria-valuemin')).toBe('0');
  expect(bar.getAttribute('aria-valuemax')).toBe('100');
  expect(bar.getAttribute('aria-valuetext')).toBe('฿420.00 a day left, On track, ฿6,000.00 left, 10 days to go');
  expect(screen.getByTestId('budget-fill').style.width).toBe('66.6%');
});

test('with a budget, the bar and its words are one element, so a screen reader reads them once', () => {
  // The value already says the headline and the detail; read apart, VoiceOver
  // said them twice, and the 14 pt bar alone was too small to find by touch
  // (independent review and Apple's accessibility audit, R8).
  mountKit(<BudgetBar {...onTrack} />);
  const bar = screen.getByRole('progressbar', { name: 'Budget' });
  for (const text of ['฿420.00 a day left', 'On track · ฿6,000.00 left · 10 days to go']) {
    expect([text, bar.contains(screen.getByText(text))]).toEqual([text, true]);
  }
  expect(bar.contains(screen.getByTestId('budget-fill'))).toBe(true);
});

test('tight says Tight in words; over says over in words, kindly', () => {
  mountKit(<BudgetBar {...tight} />);
  expect(screen.getByText('Tight · ฿1,200.00 left · 10 days to go')).toBeTruthy();
  cleanup();
  mountKit(<BudgetBar {...over} />);
  expect(screen.getByText('฿120.00 over · 9 days to go')).toBeTruthy();
  expect(screen.getByText('It happens. ฿18,120.00 of ฿18,000.00 spent.')).toBeTruthy();
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  expect(screen.getByTestId('budget-fill').style.width).toBe('100%');
});

test('no budget: words, no bar', () => {
  mountKit(<BudgetBar {...none} />);
  expect(screen.getByText('No budget this month')).toBeTruthy();
  expect(screen.getByText('฿12,000.00 spent so far')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.queryByTestId('budget-fill')).toBeNull();
});

test('green and red appear only as budget state, always beside words, in light and dark', () => {
  for (const { locale, mode, colors } of MATRIX) {
    mountKit(<BudgetBar {...onTrack} />, { locale, mode });
    expect(screen.getByTestId('budget-fill').style.backgroundColor).toEqual(rgb(colors.under));
    const headline = screen.getByText(translateCopy('{amount} a day left', locale, { amount: '฿420.00' }));
    expect(headline.style.color).toEqual(rgb(colors.ink));
    expect(headline.style.lineHeight).toBe(leading('heading', locale));
    cleanup();
    mountKit(<BudgetBar {...over} />, { locale, mode });
    expect(screen.getByTestId('budget-fill').style.backgroundColor).toEqual(rgb(colors.over));
    const overWords = `${translateCopy('{amount} over', locale, { amount: '฿120.00' })} · ${translateCopy('{days} days to go', locale, { days: 9 })}`;
    expect(screen.getByText(overWords).style.color).toEqual(rgb(colors.over));
    cleanup();
    mountKit(<BudgetBar {...tight} />, { locale, mode });
    expect(screen.getByTestId('budget-fill').style.backgroundColor).toEqual(rgb(colors.under));
    cleanup();
  }
});
