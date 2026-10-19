// At the accessibility text sizes (redesign R8), side-by-side layouts stack,
// so words stay whole and amounts stay on one line. Each kit layout that sat
// text beside text or a button is checked at AX5 (3.571x) and at the default.
import { BUILTIN_CATEGORIES } from '@gogospend/contracts';
import { cleanup, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { Dimensions } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

import { ThemeProvider } from '@mobile/theme/ThemeProvider';
import { render } from '@testing-library/react';
import { CategoryGrid } from './CategoryGrid';
import { category, mountKit, wallet } from './entryKitTestHarness';
import { ReceiptRow } from './ReceiptSlip';
import { RecordRow } from './RecordRow';
import { SearchField } from './SearchField';
import { SyncBanner } from './SyncBanner';
import { TypeSwitch } from './TypeSwitch';
import { WalletPicker } from './WalletPicker';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const AX5 = 3.571;
function textScale(fontScale: number) {
  const real = Dimensions.get.bind(Dimensions);
  vi.spyOn(Dimensions, 'get').mockImplementation((dimension) => ({ ...real(dimension), fontScale }));
}

test('the type switch stacks its three choices at large text', () => {
  for (const [scale, direction] of [[1, 'row'], [AX5, 'column']] as const) {
    textScale(scale);
    mountKit(<TypeSwitch value="expense" onChange={() => undefined} />);
    expect([scale, screen.getByRole('radiogroup', { name: 'Record type' }).style.flexDirection]).toEqual([scale, direction]);
    cleanup();
    vi.restoreAllMocks();
  }
});

test('the category grid has two columns at large text, four otherwise', () => {
  const categories = BUILTIN_CATEGORIES.map((builtin) => category(builtin.key, { builtin_key: builtin.key, label: null, color: builtin.color, type: builtin.type }));
  for (const [scale, width] of [[1, '25%'], [AX5, '50%']] as const) {
    textScale(scale);
    mountKit(<CategoryGrid categories={categories} selectedId={null} onSelect={() => undefined} />);
    expect([scale, screen.getAllByRole('radio')[0].style.width]).toEqual([scale, width]);
    cleanup();
    vi.restoreAllMocks();
  }
});

test('a move stacks From above To at large text, so the balances stay whole', () => {
  const wallets = [wallet('cash', 'Cash', '235000'), wallet('bank', 'Bank', '-2000')];
  for (const [scale, direction] of [[1, 'row'], [AX5, 'column']] as const) {
    textScale(scale);
    mountKit(<WalletPicker mode="move" wallets={wallets} fromId="cash" toId="bank" onChangeFrom={vi.fn()} onChangeTo={vi.fn()} onSwap={vi.fn()} />);
    expect([scale, screen.getByTestId('wallet-move-cards').style.flexDirection]).toEqual([scale, direction]);
    cleanup();
    vi.restoreAllMocks();
  }
});

test('a record row puts its amount under the title at large text, so the title keeps the width', () => {
  for (const [scale, together] of [[1, false], [AX5, true]] as const) {
    textScale(scale);
    mountKit(<RecordRow title="Transfer" detail="Cash → Bank" type="transfer" amountMinor="50000" />);
    const title = screen.getByText('Transfer');
    const amount = screen.getByText(/500\.00/);
    expect([scale, title.parentElement!.contains(amount)]).toEqual([scale, together]);
    cleanup();
    vi.restoreAllMocks();
  }
});

test('a banner with an action puts the action under its words at large text', () => {
  for (const [scale, basis] of [[1, '160px'], [AX5, '100%']] as const) {
    textScale(scale);
    render(<IntlProvider locale="en"><ThemeProvider><SyncBanner state="needs_review" count={1} action={{ label: 'Review', onPress: () => undefined }} live={false} /></ThemeProvider></IntlProvider>);
    expect([scale, screen.getByText(/need your review/).style.flexBasis]).toEqual([scale, basis]);
    cleanup();
    vi.restoreAllMocks();
  }
});

test('the search field takes the whole line at large text, with Clear search under it', () => {
  for (const [scale, basis] of [[1, '0%'], [AX5, '100%']] as const) {
    textScale(scale);
    mountKit(<SearchField label="Search entries" value="rent" onChangeText={() => undefined} />);
    expect([scale, screen.getByRole('searchbox', { name: 'Search entries' }).style.flexBasis]).toEqual([scale, basis]);
    cleanup();
    vi.restoreAllMocks();
  }
});

test('a receipt line puts its value under its label at large text, so neither is squeezed', () => {
  for (const [scale, direction, rules] of [[1, 'row', 1], [AX5, 'column', 0]] as const) {
    textScale(scale);
    mountKit(<ReceiptRow label="Wallet" value="Daily account" />);
    const line = screen.getByLabelText('Wallet, Daily account');
    expect([scale, line.style.flexDirection, screen.queryAllByTestId('receipt-rule').length]).toEqual([scale, direction, rules]);
    cleanup();
    vi.restoreAllMocks();
  }
});
