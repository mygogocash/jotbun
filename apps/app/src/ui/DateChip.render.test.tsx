import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { DateChip } from './DateChip';
import { MATRIX, leading, mountKit, rgb } from './entryKitTestHarness';

afterEach(() => cleanup());

const TODAY = '2026-10-18';

test('‹ Today ›: back steps a day, forward never passes today', () => {
  const onChange = vi.fn();
  mountKit(<DateChip value={TODAY} today={TODAY} onChange={onChange} />);
  expect(screen.getByText('Today')).toBeTruthy();
  const next = screen.getByRole('button', { name: 'Next day' });
  expect(next.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(next);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  expect(onChange).toHaveBeenCalledWith('2026-10-17');
});

test('yesterday can step forward to today', () => {
  const onChange = vi.fn();
  mountKit(<DateChip value="2026-10-17" today={TODAY} onChange={onChange} />);
  expect(screen.getByText('Yesterday')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
  expect(onChange).toHaveBeenCalledWith(TODAY);
});

test('back stops at the earliest date (the wallet tracking start)', () => {
  const onChange = vi.fn();
  mountKit(<DateChip value="2026-10-01" today={TODAY} earliest="2026-10-01" onChange={onChange} />);
  const previous = screen.getByRole('button', { name: 'Previous day' });
  expect(previous.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(previous);
  expect(onChange).not.toHaveBeenCalled();
});

test('the chip says the full date and opens a calendar with no future days', () => {
  const onChange = vi.fn();
  mountKit(<DateChip value="2026-10-15" today={TODAY} onChange={onChange} />);
  const chip = screen.getByRole('button', { name: 'Pick another date, Thursday 15 October 2026' });
  expect(within(chip).getByText('Thu 15 Oct')).toBeTruthy();
  expect(chip.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(chip);
  const sheet = screen.getByRole('dialog', { name: 'Pick another date' });
  expect(within(sheet).getByText('October 2026')).toBeTruthy();
  expect(within(sheet).getByRole('button', { name: 'Thursday 15 October 2026' }).getAttribute('aria-selected')).toBe('true');
  expect(within(sheet).getByRole('button', { name: 'Monday 19 October 2026' }).getAttribute('aria-disabled')).toBe('true');
  expect(within(sheet).getByRole('button', { name: 'Next month' }).getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(within(sheet).getByRole('button', { name: 'Monday 12 October 2026' }));
  expect(onChange).toHaveBeenCalledWith('2026-10-12');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('the calendar walks back a month, keeps days before the earliest date shut, and closes', () => {
  const onChange = vi.fn();
  mountKit(<DateChip value={TODAY} today={TODAY} earliest="2026-09-10" onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: /^Pick another date/ }));
  const sheet = screen.getByRole('dialog');
  fireEvent.click(within(sheet).getByRole('button', { name: 'Previous month' }));
  expect(within(sheet).getByText('September 2026')).toBeTruthy();
  expect(within(sheet).getByRole('button', { name: 'Wednesday 9 September 2026' }).getAttribute('aria-disabled')).toBe('true');
  expect(within(sheet).getByRole('button', { name: 'Previous month' }).getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
});

test('disabled, nothing moves', () => {
  const onChange = vi.fn();
  mountKit(<DateChip value="2026-10-17" today={TODAY} onChange={onChange} disabled />);
  fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
  fireEvent.click(screen.getByRole('button', { name: /^Pick another date/ }));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('Thai shows Buddhist-era years; every locale and mode keeps ink on cream and Thai leading', () => {
  for (const { locale, mode, colors } of MATRIX) {
    mountKit(<DateChip value={TODAY} today={TODAY} onChange={() => undefined} />, { locale, mode });
    const today = { en: 'Today', th: 'วันนี้', vi: 'Hôm nay' }[locale];
    const label = screen.getByText(today);
    expect(label.style.color).toEqual(rgb(colors.ink));
    expect(label.style.lineHeight).toBe(leading('label', locale));
    for (const button of screen.getAllByRole('button')) expect(Number.parseFloat(button.style.minHeight)).toBeGreaterThanOrEqual(44);
    cleanup();
  }
  mountKit(<DateChip value="2025-12-31" today={TODAY} onChange={() => undefined} />, { locale: 'th' });
  expect(screen.getByText('พุธ 31 ธ.ค. 2568')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /วันพุธที่ 31 ธันวาคม 2568/ }));
  expect(within(screen.getByRole('dialog')).getByText('ธันวาคม 2568')).toBeTruthy();
});
