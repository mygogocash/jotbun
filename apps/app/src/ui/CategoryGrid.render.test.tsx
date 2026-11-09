import { BUILTIN_CATEGORIES } from '@gogospend/contracts';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { BUN_TILE_TEXT } from '@mobile/theme/bunPalette';
import { CategoryGrid } from './CategoryGrid';
import { categoryInitial } from './categoryIcons';
import { EMOJI, MATRIX, category, leading, mountKit, rgb } from './entryKitTestHarness';

afterEach(() => cleanup());

const builtins = BUILTIN_CATEGORIES.map((builtin) => category(builtin.key, { builtin_key: builtin.key, label: null, color: builtin.color, type: builtin.type }));
const pets = category('pets', { label: 'Pets', color: '#B49BE8' });
const plain = category('plain', { label: 'misc', color: null });
const hidden = category('hidden', { label: 'Hidden', archived: true });

test('every built-in has its own vector icon; user categories get an initial tile', () => {
  const { container } = mountKit(<CategoryGrid categories={[...builtins, pets, plain, hidden]} selectedId={null} onSelect={() => undefined} />);
  const cells = screen.getAllByRole('radio');
  expect(cells).toHaveLength(builtins.length + 2);
  expect(screen.queryByRole('radio', { name: 'Hidden' })).toBeNull();
  const drawings = new Set<string>();
  for (const builtin of builtins.slice(0, builtins.length)) {
    const cell = cells[builtins.indexOf(builtin)];
    const svg = cell.querySelector('svg');
    expect(svg).toBeTruthy();
    drawings.add(Array.from(svg?.querySelectorAll('path, circle, rect, line') ?? []).map((node) => node.outerHTML).join(''));
  }
  // Ten different drawings for ten built-ins.
  expect(drawings.size).toBe(builtins.length);
  expect(within(screen.getByRole('radio', { name: 'Pets' })).getByText('P')).toBeTruthy();
  expect(within(screen.getByRole('radio', { name: 'misc' })).getByText('M')).toBeTruthy();
  expect(EMOJI.test(container.textContent ?? '')).toBe(false);
});

test('a pick is a radio choice and the chosen cell is marked', () => {
  const onSelect = vi.fn();
  mountKit(<CategoryGrid categories={[...builtins, pets]} selectedId="pets" onSelect={onSelect} />);
  expect(screen.getByRole('radiogroup', { name: 'Categories' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Pets' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('radio', { name: 'Food' }).getAttribute('aria-checked')).toBe('false');
  fireEvent.click(screen.getByRole('radio', { name: 'Bills' }));
  expect(onSelect).toHaveBeenCalledWith('bills');
});

test('initials skip emoji and Thai leading vowels', () => {
  expect(categoryInitial('pets')).toBe('P');
  expect(categoryInitial('🐶 Dog')).toBe('D');
  expect(categoryInitial('เที่ยว')).toBe('ท');
  expect(categoryInitial('ข้าว')).toBe('ข');
  expect(categoryInitial('ăn sáng')).toBe('Ă');
  expect(categoryInitial('2nd home')).toBe('2');
  expect(categoryInitial('🐶')).toBe('?');
});

test('names follow the locale; tiles keep AA ink in light and dark; Thai has room', () => {
  for (const { locale, mode, colors } of MATRIX) {
    mountKit(<CategoryGrid categories={[...builtins, pets, plain]} selectedId="food" onSelect={() => undefined} />, { locale, mode });
    const food = { en: 'Food', th: 'อาหาร', vi: 'Ăn uống' }[locale];
    const chosen = screen.getByRole('radio', { name: food });
    expect(chosen.getAttribute('aria-checked')).toBe('true');
    expect(within(chosen).getByText(food).style.color).toEqual(rgb(colors.onInk));
    expect(within(chosen).getByText(food).style.lineHeight).toBe(leading('caption', locale));
    const tileInk = rgb(colors[BUN_TILE_TEXT[mode]]);
    expect(screen.getByText('P').style.color).toEqual(tileInk);
    expect(screen.getByText('M').style.color).toEqual(rgb(colors.ink));
    for (const cell of screen.getAllByRole('radio')) expect(Number.parseFloat(cell.style.minHeight)).toBeGreaterThanOrEqual(44);
    cleanup();
  }
});
