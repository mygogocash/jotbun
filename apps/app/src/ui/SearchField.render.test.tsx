import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { translateCopy } from '@mobile/i18n/messages';

import { MATRIX, leading, mountKit, rgb } from './entryKitTestHarness';
import { SearchField } from './SearchField';

afterEach(() => cleanup());

test('a named one-line search box that passes typing up as it happens', () => {
  const onChangeText = vi.fn();
  const { container } = mountKit(<SearchField label="Search entries" placeholder="Category, merchant or note" value="" onChangeText={onChangeText} />);
  const box = screen.getByRole('searchbox', { name: 'Search entries' });
  expect(box.tagName).toBe('INPUT');
  expect(container.querySelector('textarea')).toBeNull();
  expect(box.getAttribute('placeholder')).toBe('Category, merchant or note');
  fireEvent.change(box, { target: { value: 'rent' } });
  expect(onChangeText).toHaveBeenCalledWith('rent');
  // Nothing to clear yet.
  expect(screen.queryByRole('button')).toBeNull();
});

test('with text in it, Clear search empties it', () => {
  const onChangeText = vi.fn();
  mountKit(<SearchField label="Search entries" value="rent" onChangeText={onChangeText} />);
  const clear = screen.getByRole('button', { name: 'Clear search' });
  expect(Number.parseFloat(clear.style.minHeight)).toBeGreaterThanOrEqual(44);
  fireEvent.click(clear);
  expect(onChangeText).toHaveBeenCalledWith('');
  cleanup();
  mountKit(<SearchField label="Search entries" value="rent" onChangeText={onChangeText} clearLabel="Clear" />);
  expect(screen.getByRole('button', { name: 'Clear' })).toBeTruthy();
});

test('ink on cream with an ink outline, 44 pt, and each locale\'s leading', () => {
  for (const { locale, mode, colors } of MATRIX) {
    const label = translateCopy('Search entries', locale);
    mountKit(<SearchField label={label} placeholder="ข้าวมันไก่" value="ค่าเช่า" onChangeText={() => undefined} />, { locale, mode });
    const box = screen.getByRole('searchbox', { name: label });
    expect(box.style.color).toEqual(rgb(colors.ink));
    expect(box.style.backgroundColor).toEqual(rgb(colors.card));
    expect(box.style.borderColor).toEqual(rgb(colors.ink));
    expect(box.style.lineHeight).toBe(leading('body', locale));
    expect(Number.parseFloat(box.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(screen.getByRole('button', { name: translateCopy('Clear search', locale) })).toBeTruthy();
    cleanup();
  }
});
