import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { DayHeader } from './DayHeader';
import { MATRIX, leading, mountKit, rgb } from './entryKitTestHarness';

afterEach(() => cleanup());

const TODAY = '2026-10-18';

test('the day and its totals, money out and money in kept apart', () => {
  mountKit(<DayHeader date={TODAY} today={TODAY} outMinor="42000" inMinor="100000" />);
  const header = screen.getByRole('heading');
  expect(header.getAttribute('aria-label')).toBe('Today, Sunday 18 October 2026, Money out ฿420.00, Money in ฿1,000.00');
  expect(screen.getByText('Today')).toBeTruthy();
  expect(screen.getByText('-฿420.00')).toBeTruthy();
  expect(screen.getByText('+฿1,000.00')).toBeTruthy();
});

test('a side with nothing in it is left out', () => {
  mountKit(<DayHeader date="2026-10-17" today={TODAY} outMinor="6500" inMinor="0" />);
  expect(screen.getByText('Yesterday')).toBeTruthy();
  expect(screen.getByText('-฿65.00')).toBeTruthy();
  expect(screen.queryByText(/^\+/)).toBeNull();
  expect(screen.getByRole('heading').getAttribute('aria-label')).toBe('Yesterday, Saturday 17 October 2026, Money out ฿65.00');
  cleanup();
  mountKit(<DayHeader date="2026-10-15" today={TODAY} outMinor="0" inMinor="0" />);
  expect(screen.getByText('Thu 15 Oct')).toBeTruthy();
  expect(screen.getByRole('heading').getAttribute('aria-label')).toBe('Thursday 15 October 2026');
});

test('Thai headers show the Buddhist-era year for another year', () => {
  mountKit(<DayHeader date="2025-12-31" today={TODAY} outMinor="6500" inMinor="0" />, { locale: 'th' });
  expect(screen.getByText('พุธ 31 ธ.ค. 2568')).toBeTruthy();
  expect(screen.getByRole('heading').getAttribute('aria-label')).toBe('วันพุธที่ 31 ธันวาคม 2568, จ่ายออก ฿65.00');
});

test('every locale and mode: ink words on the page, exact amounts, Thai leading', () => {
  for (const { locale, mode, colors } of MATRIX) {
    mountKit(<DayHeader date={TODAY} today={TODAY} outMinor="42000" inMinor="100000" />, { locale, mode });
    const [today, out, inWord] = { en: ['Today', 'Money out', 'Money in'], th: ['วันนี้', 'จ่ายออก', 'รับเข้า'], vi: ['Hôm nay', 'Tiền ra', 'Tiền vào'] }[locale];
    expect(screen.getByText(today).style.color).toEqual(rgb(colors.ink));
    expect(screen.getByText(today).style.lineHeight).toBe(leading('label', locale));
    expect(screen.getByRole('heading').getAttribute('aria-label')).toContain(`${out} ฿420.00, ${inWord} ฿1,000.00`);
    expect(screen.getByText('-฿420.00').style.color).toEqual(rgb(colors.muted));
    cleanup();
  }
});
