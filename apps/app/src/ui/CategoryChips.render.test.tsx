import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { CategoryChips } from './CategoryChips';
import { EMOJI, MATRIX, category, leading, mountKit, rgb } from './entryKitTestHarness';

afterEach(() => cleanup());

// Already ranked by recent use (another module ranks them).
const ranked = [
  category('food', { builtin_key: 'food', label: null, color: '#F0A868' }),
  category('pets', { label: 'Pets', color: '#B49BE8' }),
  category('travel', { builtin_key: 'travel', label: null, color: '#6FB3F2' }),
  category('bills', { builtin_key: 'bills', label: null, color: '#F2857E' }),
  category('fun', { builtin_key: 'fun', label: null, color: '#F2CE5C' }),
];

const names = () => screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'));

test('shows the top three as a single choice, then More', () => {
  const onSelect = vi.fn();
  const onMore = vi.fn();
  mountKit(<CategoryChips ranked={ranked} selectedId="pets" onSelect={onSelect} onMore={onMore} />);
  expect(screen.getByRole('radiogroup', { name: 'Category' })).toBeTruthy();
  expect(names()).toEqual(['Food', 'Pets', 'Travel']);
  expect(screen.getByRole('radio', { name: 'Pets' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('radio', { name: 'Food' }).getAttribute('aria-checked')).toBe('false');
  fireEvent.click(screen.getByRole('radio', { name: 'Travel' }));
  expect(onSelect).toHaveBeenCalledWith('travel');
  fireEvent.click(screen.getByRole('button', { name: 'More categories' }));
  expect(onMore).toHaveBeenCalledTimes(1);
});

test('a category picked from More stays visible in place of the third chip', () => {
  mountKit(<CategoryChips ranked={ranked} selectedId="fun" onSelect={() => undefined} onMore={() => undefined} />);
  expect(names()).toEqual(['Food', 'Pets', 'Fun']);
  expect(screen.getByRole('radio', { name: 'Fun' }).getAttribute('aria-checked')).toBe('true');
});

test('archived categories never show, and fewer than three still offer More', () => {
  const few = [category('food', { builtin_key: 'food', label: null }), category('old', { label: 'Old', archived: true })];
  mountKit(<CategoryChips ranked={few} selectedId={null} onSelect={() => undefined} onMore={() => undefined} />);
  expect(names()).toEqual(['Food']);
  expect(screen.getByRole('button', { name: 'More categories' })).toBeTruthy();
});

test('icons are vector drawings, never emoji', () => {
  const { container } = mountKit(<CategoryChips ranked={ranked} selectedId={null} onSelect={() => undefined} onMore={() => undefined} />);
  expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
  expect(EMOJI.test(container.textContent ?? '')).toBe(false);
});

test('disabled chips send nothing', () => {
  const onSelect = vi.fn();
  const onMore = vi.fn();
  mountKit(<CategoryChips ranked={ranked} selectedId="food" onSelect={onSelect} onMore={onMore} disabled />);
  fireEvent.click(screen.getByRole('radio', { name: 'Pets' }));
  fireEvent.click(screen.getByRole('button', { name: 'More categories' }));
  expect(onSelect).not.toHaveBeenCalled();
  expect(onMore).not.toHaveBeenCalled();
});

test('names follow the locale; the chosen chip is an ink pill in light and dark', () => {
  for (const { locale, mode, colors } of MATRIX) {
    mountKit(<CategoryChips ranked={ranked} selectedId="food" onSelect={() => undefined} onMore={() => undefined} />, { locale, mode });
    const food = { en: 'Food', th: 'อาหาร', vi: 'Ăn uống' }[locale];
    expect(screen.getByRole('radio', { name: food }).style.backgroundColor).toEqual(rgb(colors.ink));
    expect(screen.getByText(food).style.color).toEqual(rgb(colors.onInk));
    expect(screen.getByText('Pets').style.color).toEqual(rgb(colors.ink));
    expect(screen.getByText('Pets').style.lineHeight).toBe(leading('label', locale));
    for (const chip of screen.getAllByRole('radio')) expect(Number.parseFloat(chip.style.minHeight)).toBeGreaterThanOrEqual(44);
    cleanup();
  }
});
