// Checks added by the R2 unification: the shared pieces R2b now uses from
// R2a, and the accessibility and colour fixes made across the kit.
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { Amount, AmountText } from './Amount';
import { CategoryChips } from './CategoryChips';
import { CategoryGrid } from './CategoryGrid';
import { DateChip } from './DateChip';
import { DayHeader } from './DayHeader';
import { FieldError } from './FieldError';
import { category, MODES, mountKit, rgb } from './entryKitTestHarness';
import { RecordRow } from './RecordRow';
import { TypeSwitch } from './TypeSwitch';
import { WalletPicker } from './WalletPicker';

// DateChip's calendar is the kit Sheet, which pads the safe area.
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }) }));

afterEach(() => cleanup());

const TODAY = '2026-10-18';
const bold = (element: HTMLElement) => element.style.fontWeight === '700' || element.style.fontWeight === 'bold';

test('a chosen segment, chip, grid cell or day is bold as well as filled, so the fill is never the only signal', () => {
  mountKit(<TypeSwitch value="income" onChange={() => undefined} />);
  expect(bold(screen.getByText('Income'))).toBe(true);
  expect(bold(screen.getByText('Expense'))).toBe(false);
  cleanup();

  const ranked = [category('food', { builtin_key: 'food', label: null }), category('pets', { label: 'Pets' })];
  mountKit(<CategoryChips ranked={ranked} selectedId="pets" onSelect={() => undefined} onMore={() => undefined} />);
  expect(bold(within(screen.getByRole('radio', { name: 'Pets' })).getByText('Pets'))).toBe(true);
  expect(bold(within(screen.getByRole('radio', { name: 'Food' })).getByText('Food'))).toBe(false);
  cleanup();

  mountKit(<CategoryGrid categories={ranked} selectedId="food" onSelect={() => undefined} />);
  expect(bold(within(screen.getByRole('radio', { name: 'Food' })).getByText('Food'))).toBe(true);
  expect(bold(within(screen.getByRole('radio', { name: 'Pets' })).getByText('Pets'))).toBe(false);
  cleanup();

  mountKit(<DateChip value="2026-10-15" today={TODAY} onChange={() => undefined} />);
  fireEvent.click(screen.getByRole('button', { name: /^Pick another date/ }));
  expect(bold(within(screen.getByRole('button', { name: 'Thursday 15 October 2026' })).getByText('15'))).toBe(true);
  expect(bold(within(screen.getByRole('button', { name: 'Friday 16 October 2026' })).getByText('16'))).toBe(false);
});

test('the calendar: weekday initials are decoration, and the page dims like the kit sheet in both modes', () => {
  for (const [mode, colors] of MODES) {
    mountKit(<DateChip value={TODAY} today={TODAY} onChange={() => undefined} />, { mode });
    fireEvent.click(screen.getByRole('button', { name: /^Pick another date/ }));
    const dialog = screen.getByRole('dialog');
    const initials = within(dialog).getAllByText('W').filter((node) => node.closest('[aria-hidden="true"]'));
    expect(initials.length).toBe(1);
    const backdrop = screen.getByTestId('sheet-backdrop');
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');
    expect(backdrop.style.backgroundColor).toEqual(rgb(colors.isDark ? colors.background : colors.ink));
    expect(Number(backdrop.style.opacity)).toBe(0.55);
    cleanup();
  }
});

test('field errors are words with a hidden mark, in ink', () => {
  for (const [mode, colors] of MODES) {
    const { container } = mountKit(<FieldError message="Choose two different wallets" />, { mode });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Choose two different wallets');
    expect(alert.style.color).toEqual(rgb(colors.ink));
    expect(container.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull();
    cleanup();
  }
});

test('R2b money is drawn by AmountText from the same words as Amount, in every component', () => {
  mountKit(<AmountText tone="muted">฿1,234.56</AmountText>);
  expect(screen.getByText('฿1,234.56')).toBeTruthy();
  cleanup();
  // Thai formats money with its own locale slot; Vietnamese formats like English.
  for (const locale of ['th', 'vi'] as const) {
    mountKit(<>
      <DayHeader date={TODAY} today={TODAY} outMinor="123456" inMinor="0" />
      <RecordRow title="Coffee" detail="Cash" type="income" amountMinor="99999999999" />
      <WalletPicker mode="single" wallets={[{ id: 'cash', name: 'Cash', balance_minor: '-6500', archived: false }]} selectedId="cash" onSelect={() => undefined} />
    </>, { locale });
    // The day's money out is an expense, so it takes the minus sign (U+2212).
    expect(screen.getByText('−฿1,234.56')).toBeTruthy();
    expect(screen.getByText('+฿999,999,999.99')).toBeTruthy();
    // A negative balance is not an expense: untyped, it keeps formatMinor's own sign, as Amount does.
    expect(screen.getByText('-฿65.00')).toBeTruthy();
    cleanup();
  }
});

test('one minus rule: an expense is signed with U+2212 by Amount, RecordRow and DayHeader alike', () => {
  for (const locale of ['en', 'th', 'vi'] as const) {
    mountKit(<>
      <Amount minor="6500" type="expense" />
      <RecordRow title="Coffee" detail="Cash" type="expense" amountMinor="6500" />
      <DayHeader date={TODAY} today={TODAY} outMinor="6500" inMinor="0" />
    </>, { locale });
    expect(screen.getAllByText('−฿65.00')).toHaveLength(3);
    expect(screen.queryAllByText(/^-/)).toHaveLength(0);
    cleanup();
  }
});
