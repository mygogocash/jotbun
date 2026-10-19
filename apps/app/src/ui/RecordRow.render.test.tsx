import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { translateCopy } from '@mobile/i18n/messages';

import { RecordRow, recordRowActions, runRecordRowAction } from './RecordRow';
import { EMOJI, MATRIX, leading, mountKit, rgb } from './entryKitTestHarness';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const coffee = { builtinKey: 'food' as const, name: 'Food', color: '#F0A868' };

test('an expense row: icon, title, wallet, signed exact amount and a spoken summary', () => {
  const onPress = vi.fn();
  const { container } = mountKit(<RecordRow title="Coffee" detail="Cash" type="expense" amountMinor="6500" category={coffee} onPress={onPress} />);
  const row = screen.getByRole('button', { name: 'Coffee, Expense ฿65.00, Cash' });
  expect(within(row).getByText('Coffee')).toBeTruthy();
  expect(within(row).getByText('Cash')).toBeTruthy();
  // Money out takes the true minus sign (U+2212), as Amount does; never a hyphen.
  expect(within(row).getByText('−฿65.00')).toBeTruthy();
  expect(within(row).queryByText('-฿65.00')).toBeNull();
  expect(container.querySelector('svg')).toBeTruthy();
  expect(EMOJI.test(container.textContent ?? '')).toBe(false);
  fireEvent.click(row);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('income is signed +, a move is unsigned and names From → To', () => {
  mountKit(<RecordRow title="Salary" detail="Bank" type="income" amountMinor="100000" category={{ builtinKey: 'salary', name: 'Salary', color: '#A8CC4A' }} />);
  expect(screen.getByText('+฿1,000.00')).toBeTruthy();
  expect(screen.getByLabelText('Salary, Income ฿1,000.00, Bank')).toBeTruthy();
  cleanup();
  const { container } = mountKit(<RecordRow title="Transfer" detail="Cash → Bank" type="transfer" amountMinor="50000" />);
  expect(screen.getByText('฿500.00')).toBeTruthy();
  expect(screen.getByText('Cash → Bank')).toBeTruthy();
  expect(screen.getByLabelText('Transfer, Transfer ฿500.00, Cash → Bank')).toBeTruthy();
  expect(container.querySelector('svg')).toBeTruthy();
});

test('pending states read quietly and are spoken: saving, checking, needs a look', () => {
  const states = [['saving', 'saving…', 'saving'], ['checking', 'checking…', 'checking'], ['needs_look', 'needs a look', 'needs a look']] as const;
  for (const [state, shown, spoken] of states) {
    mountKit(<RecordRow title="Coffee" detail="Cash" type="expense" amountMinor="6500" category={coffee} state={state} />);
    expect(screen.getByText(shown)).toBeTruthy();
    expect(screen.getByLabelText(`Coffee, Expense ฿65.00, ${spoken}, Cash`)).toBeTruthy();
    cleanup();
  }
  mountKit(<RecordRow title="Coffee" detail="Cash" type="expense" amountMinor="6500" category={coffee} state="confirmed" />);
  expect(screen.queryByText(/saving|checking|needs a look/)).toBeNull();
});

function longPress(name: RegExp) {
  const row = screen.getByLabelText(name);
  fireEvent.mouseDown(row, { button: 0 });
  act(() => { vi.advanceTimersByTime(800); });
  fireEvent.mouseUp(row, { button: 0 });
}

test('long-press offers Edit, Copy and Delete; each closes the bar; only the actions given', () => {
  vi.useFakeTimers();
  const onEdit = vi.fn();
  const onCopy = vi.fn();
  const onDelete = vi.fn();
  mountKit(<RecordRow title="Coffee" detail="Cash" type="expense" amountMinor="6500" category={coffee} onEdit={onEdit} onCopy={onCopy} onDelete={onDelete} />);
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  longPress(/^Coffee, Expense/);
  expect(screen.getByRole('toolbar', { name: 'Actions for Coffee' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(onEdit).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('toolbar')).toBeNull();
  longPress(/^Coffee, Expense/);
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(onCopy).toHaveBeenCalledTimes(1);
  longPress(/^Coffee, Expense/);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onDelete).toHaveBeenCalledTimes(1);
  cleanup();
  mountKit(<RecordRow title="Coffee" detail="Cash" type="expense" amountMinor="6500" category={coffee} onCopy={onCopy} />);
  longPress(/^Coffee, Expense/);
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  cleanup();
  mountKit(<RecordRow title="Coffee" detail="Cash" type="expense" amountMinor="6500" category={coffee} />);
  longPress(/^Coffee, Expense/);
  expect(screen.queryByRole('toolbar')).toBeNull();
});

test('screen readers get the same actions as an accessibility actions menu', () => {
  const tc = (english: string) => `[${english}]`;
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn() };
  expect(recordRowActions(handlers, tc)).toEqual([{ name: 'edit', label: '[Edit]' }, { name: 'delete', label: '[Delete]' }]);
  expect(recordRowActions({}, tc)).toEqual([]);
  runRecordRowAction('delete', handlers);
  expect(handlers.onDelete).toHaveBeenCalledTimes(1);
  runRecordRowAction('copy', handlers);
  runRecordRowAction('activate', handlers);
  expect(handlers.onEdit).not.toHaveBeenCalled();
});

test('amounts are ink, never red or green, in every locale and mode; Thai has room', () => {
  for (const { locale, mode, colors } of MATRIX) {
    mountKit(<RecordRow title="ข้าวมันไก่" detail="Cash" type="expense" amountMinor="6500" category={coffee} state="saving" />, { locale, mode });
    expect(screen.getByText('−฿65.00').style.color).toEqual(rgb(colors.ink));
    expect(screen.getByText('ข้าวมันไก่').style.lineHeight).toBe(leading('body', locale));
    const saving = locale === 'th' ? 'saving…' : 'saving…';
    expect(screen.getByText(saving).style.color).toEqual(rgb(colors.accent));
    const expense = { en: 'Expense', th: 'รายจ่าย', vi: 'Chi tiêu' }[locale];
    expect(screen.getByLabelText(new RegExp(`^ข้าวมันไก่, ${expense} ฿65.00`))).toBeTruthy();
    expect(Number.parseFloat(screen.getByLabelText(/^ข้าวมันไก่/).style.minHeight)).toBeGreaterThanOrEqual(44);
    cleanup();
  }
});

test('a draft waiting for an app update says so in its own state line, in ink, and is spoken that way', () => {
  for (const { locale, mode, colors } of MATRIX) {
    mountKit(<RecordRow title="Coffee" detail="Cash" type="expense" amountMinor="6500" category={coffee} state="update_to_send" />, { locale, mode });
    const words = translateCopy('Update Jotbun to send', locale);
    const line = screen.getByText(words);
    expect(line.style.color).toEqual(rgb(colors.ink));
    expect(line.style.fontWeight).toBe('700');
    expect(line.style.lineHeight).toBe(leading('caption', locale));
    // It waits for the person to update the app, so it never reads "saving".
    expect(screen.queryByText(translateCopy('saving…', locale))).toBeNull();
    expect(screen.getByLabelText(`Coffee, ${translateCopy('Expense', locale)} ฿65.00, ${words}, Cash`)).toBeTruthy();
    cleanup();
  }
});

test('on the web the actions are reachable by keyboard: a More button opens the same bar and focus moves into it', async () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  mountKit(<RecordRow title="Coffee" detail="Cash" type="expense" amountMinor="6500" category={coffee} onPress={vi.fn()} onEdit={onEdit} onDelete={onDelete} />);
  const more = screen.getByRole('button', { name: 'Actions for Coffee' });
  // A focusable control of its own, never nested inside the row's button, at least 44 pt.
  expect(more.getAttribute('tabindex')).toBe('0');
  expect(more.closest('[aria-label^="Coffee, Expense"]')).toBeNull();
  expect(Number.parseFloat(more.style.minHeight)).toBeGreaterThanOrEqual(44);
  expect(Number.parseFloat(more.style.minWidth)).toBeGreaterThanOrEqual(44);
  expect(more.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('toolbar')).toBeNull();
  fireEvent.click(more);
  expect(more.getAttribute('aria-expanded')).toBe('true');
  const bar = screen.getByRole('toolbar', { name: 'Actions for Coffee' });
  await waitFor(() => expect(document.activeElement).toBe(within(bar).getByRole('button', { name: 'Edit' })));
  fireEvent.click(within(bar).getByRole('button', { name: 'Delete' }));
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(onEdit).not.toHaveBeenCalled();
  expect(screen.queryByRole('toolbar')).toBeNull();
  // Pressed again, More closes the bar it opened.
  fireEvent.click(more);
  expect(screen.getByRole('toolbar')).toBeTruthy();
  fireEvent.click(more);
  expect(screen.queryByRole('toolbar')).toBeNull();
  cleanup();
  // No actions, no More button.
  mountKit(<RecordRow title="Coffee" detail="Cash" type="expense" amountMinor="6500" category={coffee} onPress={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
});
