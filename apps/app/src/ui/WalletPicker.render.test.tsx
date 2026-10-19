import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { WalletPicker } from './WalletPicker';
import type { WalletChoice } from './WalletPicker';
import { MATRIX, leading, mountKit, rgb, wallet } from './entryKitTestHarness';

afterEach(() => cleanup());

const wallets = [
  wallet('cash', 'Cash', '123450'),
  wallet('bank', 'Bank', '-2000'),
  wallet('old', 'Old purse', '500', true),
  wallet('save', 'Savings', '0'),
];

test('one wallet: each live wallet with its exact balance, archived ones hidden', () => {
  const onSelect = vi.fn();
  mountKit(<WalletPicker mode="single" wallets={wallets} selectedId="cash" onSelect={onSelect} />);
  expect(screen.getByRole('radiogroup', { name: 'Wallet' })).toBeTruthy();
  const radios = screen.getAllByRole('radio');
  expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['Cash, balance ฿1,234.50', 'Bank, balance -฿20.00', 'Savings, balance ฿0.00']);
  expect(screen.queryByText('Old purse')).toBeNull();
  expect(screen.getByText('฿1,234.50')).toBeTruthy();
  expect(screen.getByText('-฿20.00')).toBeTruthy();
  expect(radios[0].getAttribute('aria-checked')).toBe('true');
  fireEvent.click(radios[1]);
  expect(onSelect).toHaveBeenCalledWith('bank');
});

function moveProps(overrides: Partial<Parameters<typeof WalletPicker>[0] & { mode: 'move' }> = {}) {
  return {
    mode: 'move' as const, wallets, fromId: 'cash', toId: 'bank',
    onChangeFrom: vi.fn(), onChangeTo: vi.fn(), onSwap: vi.fn(), onMoveAll: vi.fn(), ...overrides,
  };
}

test('a move shows From → To cards with a swap button', () => {
  const props = moveProps();
  mountKit(<WalletPicker {...props} />);
  const from = screen.getByRole('button', { name: 'From Cash, balance ฿1,234.50' });
  const to = screen.getByRole('button', { name: 'To Bank, balance -฿20.00' });
  expect(within(from).getByText('Cash')).toBeTruthy();
  expect(within(to).getByText('Bank')).toBeTruthy();
  expect(screen.getByText('→')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Swap wallets' }));
  expect(props.onSwap).toHaveBeenCalledTimes(1);
});

test('tapping a side lists live wallets for that side', () => {
  const props = moveProps();
  mountKit(<WalletPicker {...props} />);
  const from = screen.getByRole('button', { name: 'From Cash, balance ฿1,234.50' });
  expect(from.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(from);
  expect(from.getAttribute('aria-expanded')).toBe('true');
  const list = screen.getByRole('radiogroup', { name: 'From' });
  expect(within(list).getAllByRole('radio')).toHaveLength(3);
  expect(within(list).queryByText('Old purse')).toBeNull();
  fireEvent.click(within(list).getByRole('radio', { name: 'Savings, balance ฿0.00' }));
  expect(props.onChangeFrom).toHaveBeenCalledWith('save');
  fireEvent.click(screen.getByRole('button', { name: 'To Bank, balance -฿20.00' }));
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'To' })).getByRole('radio', { name: 'Cash, balance ฿1,234.50' }));
  expect(props.onChangeTo).toHaveBeenCalledWith('cash');
});

test('move all offers the whole From balance, only when there is money to move', () => {
  const props = moveProps();
  mountKit(<WalletPicker {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Move all ฿1,234.50' }));
  expect(props.onMoveAll).toHaveBeenCalledWith('123450');
  cleanup();
  mountKit(<WalletPicker {...moveProps({ fromId: 'bank', toId: 'cash' })} />);
  expect(screen.queryByRole('button', { name: /Move all/ })).toBeNull();
  cleanup();
  mountKit(<WalletPicker {...moveProps({ onMoveAll: undefined })} />);
  expect(screen.queryByRole('button', { name: /Move all/ })).toBeNull();
});

test('the same wallet on both sides is an error in words', () => {
  mountKit(<WalletPicker {...moveProps({ toId: 'cash' })} />);
  expect(screen.getByRole('alert').textContent).toContain('Choose two different wallets');
  cleanup();
  mountKit(<WalletPicker {...moveProps({ error: 'This wallet needs an opening balance' })} />);
  expect(screen.getByRole('alert').textContent).toContain('This wallet needs an opening balance');
  cleanup();
  mountKit(<WalletPicker {...moveProps()} />);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('disabled pickers send nothing', () => {
  const onSelect = vi.fn();
  mountKit(<WalletPicker mode="single" wallets={wallets} selectedId="cash" onSelect={onSelect} disabled />);
  fireEvent.click(screen.getAllByRole('radio')[1]);
  expect(onSelect).not.toHaveBeenCalled();
  cleanup();
  const props = moveProps({ disabled: true });
  mountKit(<WalletPicker {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Swap wallets' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move all ฿1,234.50' }));
  expect(props.onSwap).not.toHaveBeenCalled();
  expect(props.onMoveAll).not.toHaveBeenCalled();
});

test('locale words, ink on cream in light and dark, Thai leading', () => {
  for (const { locale, mode, colors } of MATRIX) {
    mountKit(<WalletPicker {...moveProps({ toId: 'cash' })} />, { locale, mode });
    const differ = { en: 'Choose two different wallets', th: 'เลือกกระเป๋าเงินสองใบที่ต่างกัน', vi: 'Choose two different wallets' }[locale];
    expect(screen.getByRole('alert').textContent).toContain(differ);
    expect(screen.getAllByText('Cash')[0].style.color).toEqual(rgb(colors.ink));
    expect(screen.getAllByText('฿1,234.50')[0].style.color).toEqual(rgb(colors.muted));
    const fromWord = locale === 'th' ? 'จาก' : 'From';
    expect(screen.getByText(fromWord).style.lineHeight).toBe(leading('caption', locale));
    cleanup();
    mountKit(<WalletPicker mode="single" wallets={wallets} selectedId="bank" onSelect={() => undefined} />, { locale, mode });
    const chosen = screen.getAllByRole('radio')[1];
    expect(chosen.style.borderColor).toEqual(rgb(colors.ink));
    for (const radio of screen.getAllByRole('radio')) expect(Number.parseFloat(radio.style.minHeight)).toBeGreaterThanOrEqual(44);
    cleanup();
  }
});

// Wallets synced to this device carry no balance: a guessed one would be a wrong number on screen.
const deviceWallets: WalletChoice[] = [
  { id: 'cash', name: 'Cash', archived: false },
  { id: 'bank', name: 'Bank', balance_minor: null, archived: false },
  { id: 'old', name: 'Old purse', archived: true },
];

test('a wallet with no known balance shows its name only, in words and to screen readers', () => {
  const onSelect = vi.fn();
  mountKit(<WalletPicker mode="single" wallets={[...deviceWallets, wallet('save', 'Savings', '0')]} selectedId="bank" onSelect={onSelect} />);
  const radios = screen.getAllByRole('radio');
  expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['Cash', 'Bank', 'Savings, balance ฿0.00']);
  expect(within(radios[0]).queryByText(/฿/)).toBeNull();
  expect(within(radios[1]).queryByText(/฿/)).toBeNull();
  expect(screen.getByText('฿0.00')).toBeTruthy();
  expect(radios[1].getAttribute('aria-checked')).toBe('true');
  fireEvent.click(radios[0]);
  expect(onSelect).toHaveBeenCalledWith('cash');
});

test('a move between wallets with no known balance: names only, swap still works, and no move all', () => {
  const props = moveProps({ wallets: deviceWallets, fromId: 'cash', toId: 'bank' });
  mountKit(<WalletPicker {...props} />);
  const from = screen.getByRole('button', { name: 'From Cash' });
  expect(screen.getByRole('button', { name: 'To Bank' })).toBeTruthy();
  expect(within(from).queryByText(/฿/)).toBeNull();
  expect(screen.queryByRole('button', { name: /Move all/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Swap wallets' }));
  expect(props.onSwap).toHaveBeenCalledTimes(1);
  fireEvent.click(from);
  expect(within(screen.getByRole('radiogroup', { name: 'From' })).getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual(['Cash', 'Bank']);
  cleanup();
  // Move all needs the From wallet's own balance: a balance known for another wallet does not count.
  mountKit(<WalletPicker {...moveProps({ wallets: [...deviceWallets, wallet('save', 'Savings', '5000')], fromId: 'cash', toId: 'save' })} />);
  expect(screen.queryByRole('button', { name: /Move all/ })).toBeNull();
  cleanup();
  mountKit(<WalletPicker {...moveProps({ wallets: [...deviceWallets, wallet('save', 'Savings', '5000')], fromId: 'save', toId: 'cash' })} />);
  expect(screen.getByRole('button', { name: 'Move all ฿50.00' })).toBeTruthy();
});
