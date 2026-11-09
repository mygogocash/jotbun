import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { TypeSwitch } from './TypeSwitch';
import { MATRIX, leading, mountKit, rgb } from './entryKitTestHarness';

afterEach(() => cleanup());

const LABELS = {
  en: ['Expense', 'Income', 'Move'],
  th: ['รายจ่าย', 'รายรับ', 'โอนเงิน'],
  vi: ['Chi tiêu', 'Thu nhập', 'Move'],
} as const;

test('a radio group of Expense, Income and Move with the current one checked', () => {
  const onChange = vi.fn();
  mountKit(<TypeSwitch value="expense" onChange={onChange} />);
  const group = screen.getByRole('radiogroup', { name: 'Record type' });
  expect(group).toBeTruthy();
  const radios = screen.getAllByRole('radio');
  expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['Expense', 'Income', 'Move']);
  expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
  fireEvent.click(screen.getByRole('radio', { name: 'Move' }));
  expect(onChange).toHaveBeenCalledWith('transfer');
  fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
  expect(onChange).toHaveBeenLastCalledWith('income');
});

test('choosing the current type again changes nothing', () => {
  const onChange = vi.fn();
  mountKit(<TypeSwitch value="income" onChange={onChange} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
  expect(onChange).not.toHaveBeenCalled();
});

test('disabled, it changes nothing and says so', () => {
  const onChange = vi.fn();
  mountKit(<TypeSwitch value="expense" onChange={onChange} disabled />);
  for (const radio of screen.getAllByRole('radio')) {
    expect(radio.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(radio);
  }
  expect(onChange).not.toHaveBeenCalled();
});

test('the checked segment is an ink pill in every locale and mode, with room for Thai marks', () => {
  for (const { locale, mode, colors } of MATRIX) {
    mountKit(<TypeSwitch value="income" onChange={() => undefined} />, { locale, mode });
    const [expense, income, move] = LABELS[locale];
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual([expense, income, move]);
    expect(screen.getByRole('radio', { name: income }).style.backgroundColor).toEqual(rgb(colors.ink));
    expect(screen.getByText(income).style.color).toEqual(rgb(colors.onInk));
    expect(screen.getByText(expense).style.color).toEqual(rgb(colors.ink));
    expect(screen.getByText(expense).style.lineHeight).toBe(leading('label', locale));
    expect(Number.parseFloat(screen.getByRole('radio', { name: expense }).style.minHeight)).toBeGreaterThanOrEqual(44);
    cleanup();
  }
});
