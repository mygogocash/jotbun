import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { translateCopy } from '@mobile/i18n/messages';

import { FilterChip, FilterChips } from './FilterChip';
import type { ChipOption } from './FilterChip';
import { MATRIX, leading, mountKit, rgb } from './entryKitTestHarness';

afterEach(() => cleanup());

type Kind = 'all' | 'expense' | 'income' | 'transfer';
const OPTIONS: readonly ChipOption<Kind>[] = [
  { value: 'all', label: 'All' }, { value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Transfer' },
];

test('one single-choice filter is a named radio group of chips, with the chosen one checked', () => {
  const onChange = vi.fn();
  mountKit(<FilterChips label="Type" options={OPTIONS} value="expense" onChange={onChange} />);
  const group = screen.getByRole('radiogroup', { name: 'Type' });
  const radios = within(group).getAllByRole('radio');
  expect(radios.map((radio) => [radio.getAttribute('aria-label'), radio.getAttribute('aria-checked')])).toEqual([
    ['All', 'false'], ['Expense', 'true'], ['Income', 'false'], ['Transfer', 'false'],
  ]);
  fireEvent.click(within(group).getByRole('radio', { name: 'Income' }));
  expect(onChange).toHaveBeenCalledWith('income');
  // Choosing the chip already chosen changes nothing.
  fireEvent.click(within(group).getByRole('radio', { name: 'Expense' }));
  expect(onChange).toHaveBeenCalledTimes(1);
  // The visible caption repeats the group's name, so screen readers skip it.
  expect(screen.getByText('Type').getAttribute('aria-hidden')).toBe('true');
});

test('the chosen chip is an ink pill with bold words, so the choice never rests on colour alone; 44 pt targets', () => {
  for (const { locale, mode, colors } of MATRIX) {
    const label = (english: string) => translateCopy(english, locale);
    const options = OPTIONS.map((option) => ({ ...option, label: label(option.label) }));
    mountKit(<FilterChips label={label('Type')} options={options} value="all" onChange={() => undefined} />, { locale, mode });
    const chosen = screen.getByRole('radio', { name: label('All') });
    const other = screen.getByRole('radio', { name: label('Expense') });
    expect(chosen.style.backgroundColor).toEqual(rgb(colors.ink));
    expect(other.style.backgroundColor).toEqual(rgb(colors.card));
    const chosenText = within(chosen).getByText(label('All'));
    const otherText = within(other).getByText(label('Expense'));
    expect(chosenText.style.color).toEqual(rgb(colors.onInk));
    expect(chosenText.style.fontWeight).toBe('700');
    expect(otherText.style.color).toEqual(rgb(colors.ink));
    expect(otherText.style.fontWeight).not.toBe('700');
    expect(chosenText.style.lineHeight).toBe(leading('label', locale));
    for (const radio of screen.getAllByRole('radio')) expect(Number.parseFloat(radio.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(screen.getByText(label('Type')).style.color).toEqual(rgb(colors.muted));
    cleanup();
  }
});

test('a single chip can be used on its own', () => {
  const onPress = vi.fn();
  mountKit(<FilterChip label="Cash" checked={false} onPress={onPress} />);
  const chip = screen.getByRole('radio', { name: 'Cash' });
  expect(chip.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(chip);
  expect(onPress).toHaveBeenCalledTimes(1);
  cleanup();
  mountKit(<FilterChip label="Cash" checked onPress={onPress} />);
  expect(screen.getByRole('radio', { name: 'Cash' }).getAttribute('aria-checked')).toBe('true');
});

test('with a bleed, the chip row runs out to the screen edge, so a chip that does not fit is cut there, not at the gutter', () => {
  mountKit(<FilterChips label="Type" options={OPTIONS} value="all" onChange={() => undefined} bleed={16} />);
  // The row (the scroll view) reaches past the page's 16 pt gutter on both sides,
  // and its content starts 16 pt in, so at rest the first chip still lines up with the gutter.
  const content = screen.getByRole('radio', { name: 'All' }).parentElement!;
  const row = content.parentElement!;
  expect([row.style.marginLeft, row.style.marginRight]).toEqual(['-16px', '-16px']);
  expect([content.style.paddingLeft, content.style.paddingRight]).toEqual(['16px', '16px']);
  cleanup();
  // Without one, the row stays inside its parent, as before.
  mountKit(<FilterChips label="Type" options={OPTIONS} value="all" onChange={() => undefined} />);
  const plain = screen.getByRole('radio', { name: 'All' }).parentElement!.parentElement!;
  expect([plain.style.marginLeft, plain.style.marginRight]).toEqual(['', '']);
});
