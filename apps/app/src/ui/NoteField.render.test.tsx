import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { NoteField } from './NoteField';
import { MATRIX, leading, mountKit, rgb } from './entryKitTestHarness';

afterEach(() => cleanup());

test('a one-line note field shows its limit and passes typing up', () => {
  const onChangeText = vi.fn();
  const { container } = mountKit(<NoteField kind="note" value="" onChangeText={onChangeText} />);
  const input = screen.getByRole('textbox', { name: 'Note' });
  expect(input.tagName).toBe('INPUT');
  expect(container.querySelector('textarea')).toBeNull();
  expect(screen.getByText('0 / 500')).toBeTruthy();
  expect(screen.getByLabelText('0 of 500 characters')).toBeTruthy();
  fireEvent.change(input, { target: { value: 'Lunch with Ploy' } });
  expect(onChangeText).toHaveBeenCalledWith('Lunch with Ploy');
  expect(input.getAttribute('aria-invalid')).not.toBe('true');
});

test('the merchant field has a 120-character limit counted in characters, not code units', () => {
  mountKit(<NoteField kind="merchant" value={'😀'.repeat(120)} onChangeText={() => undefined} />);
  expect(screen.getByRole('textbox', { name: 'Merchant' })).toBeTruthy();
  expect(screen.getByText('120 / 120')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('past the limit, the field says so in words and marks itself invalid', () => {
  mountKit(<NoteField kind="merchant" value={'a'.repeat(121)} onChangeText={() => undefined} />);
  expect(screen.getByText('121 / 120')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toBe('Use one line of up to 120 characters.');
  expect(screen.getByRole('textbox', { name: 'Merchant' }).getAttribute('aria-invalid')).toBe('true');
  cleanup();
  mountKit(<NoteField kind="note" value={'a'.repeat(501)} onChangeText={() => undefined} />);
  expect(screen.getByRole('alert').textContent).toBe('Notes are up to 500 characters.');
});

test('a merchant must be one line; a caller error is shown too', () => {
  mountKit(<NoteField kind="merchant" value={'Shop\nTwo'} onChangeText={() => undefined} />);
  expect(screen.getByRole('alert').textContent).toBe('Use one line of up to 120 characters.');
  cleanup();
  mountKit(<NoteField kind="note" value="ok" onChangeText={() => undefined} error="This note could not be saved." />);
  expect(screen.getByRole('alert').textContent).toBe('This note could not be saved.');
});

test("a caller's error that matches the field's own problem is said once, with no duplicate key", () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const own = 'Use one line of up to 120 characters.';
    mountKit(<NoteField kind="merchant" value={'a'.repeat(121)} onChangeText={() => undefined} error={own} />);
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([own]);
    cleanup();
    // A different problem from the caller is said after the field's own.
    mountKit(<NoteField kind="merchant" value={'a'.repeat(121)} onChangeText={() => undefined} error="This merchant could not be saved." />);
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([own, 'This merchant could not be saved.']);
    expect(consoleError.mock.calls.filter((call) => String(call[0]).includes('same key'))).toEqual([]);
  } finally {
    consoleError.mockRestore();
  }
});

test('a locked field cannot be edited', () => {
  mountKit(<NoteField kind="note" value="Saved" onChangeText={() => undefined} editable={false} />);
  const input = screen.getByRole('textbox', { name: 'Note' }) as HTMLInputElement;
  expect(input.readOnly).toBe(true);
});

test('labels follow the locale; ink on cream in light and dark; Thai leading', () => {
  for (const { locale, mode, colors } of MATRIX) {
    mountKit(<NoteField kind="note" value="ข้าวมันไก่" onChangeText={() => undefined} />, { locale, mode });
    const note = { en: 'Note', th: 'หมายเหตุ', vi: 'Ghi chú' }[locale];
    const input = screen.getByRole('textbox', { name: note });
    expect(input.style.color).toEqual(rgb(colors.ink));
    expect(input.style.lineHeight).toBe(leading('body', locale));
    expect(Number.parseFloat(input.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(screen.getByText(note).style.color).toEqual(rgb(colors.muted));
    expect(screen.getByText('10 / 500').style.color).toEqual(rgb(colors.muted));
    cleanup();
  }
});
