// The Bun Wallet's wallets list in the catalogue (P2-T20, development only):
// wc-wallets' four wallets with one archived (bw-wallets), the archived list
// opened (bw-wallets-archived) and the reorder tray open over the list
// (bw-wallets-reorder), each drawn by the real WalletsListScreen on fakes.
// Their own list, spread after the add tray's in ./index.ts. P2-T21 adds a new
// wallet's three steps (bw-wallet-new-type, bw-wallet-new-form, the bank
// account บัญชีหลัก at ฿24,860; bw-wallet-added, once it is created) and
// editing wc-wallet-edit's บัญชีหลัก (bw-wallet-edit, opened at ฿30,000 with
// entries, so ฿24,860 now; bw-wallet-correction, the opening balance changed
// and the correction tray asking why), each by the real screen.
//
// - The looks belong to a catalogue account of its own, never the person's:
//   each time a section opens, its fake diary opens that account and its
//   looks and order are written for it before the screen mounts, so every
//   opening starts from the board, and the tray's presses change only it.
// - The screens are loaded when a section opens, not when this list is read:
//   they reach Quick add's command keys (screens/v1/parts.tsx loads
//   expo-crypto) and expo-router, which the tests that read the wallet's list
//   do not stand in for (the catalogue's own suites do).
// - The scripts press by test id, and the keypad's keys by their digits, so
//   they run the same in every language.
// - A section never imports the wallet test harness, which loads vitest.
import type { TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';

import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { LOOKS_NAME, WALLET_ORDER_NAME, WalletLooksProvider } from '@mobile/wallet/looks/WalletLooksProvider';
import type { WalletLook } from '@mobile/wallet/looks/walletLooks';
import { walletAccountStore } from '@mobile/wallet/store/deviceWalletStore';
import type { CatalogueSection } from '../registry';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep } from '../screenSection';

const WalletsListScreen = lazy(() => import('@mobile/wallet/wallets/WalletsListScreen').then((module) => ({ default: module.WalletsListScreen })));
const NewWalletFlow = lazy(() => import('@mobile/wallet/wallets/NewWalletFlow').then((module) => ({ default: module.NewWalletFlow })));
const WalletEditScreen = lazy(() => import('@mobile/wallet/wallets/WalletEditScreen').then((module) => ({ default: module.WalletEditScreen })));

/** The catalogue's own account: its kept looks are never the person's. */
const CATALOGUE_ACCOUNT = '0000000c-0000-4000-8000-00000000ca7a';

const wallet = (id: string, name: string, balanceMinor: string, archived = false): WalletSnapshot => ({
  id: `0000000c-0000-4000-8000-00000000000${id}`, name, currency: 'THB', opening_minor: balanceMinor, tracking_start: '2026-09-01', archived, version: 1,
});

/** wc-wallets' four, front first, and one archived at ฿0. */
const MAIN = wallet('1', 'บัญชีหลัก', '2486000');
const CASH = wallet('2', 'เงินสด', '124000');
const CREDIT = wallet('3', 'บัตรเครดิต', '-392000');
const TRANSIT = wallet('4', 'บัตรเดินทาง', '18600');
const OLD_CARD = wallet('5', 'บัตรเก่า', '0', true);

const LOOKS: Readonly<Record<string, WalletLook>> = {
  [MAIN.id]: { kind: 'bank', material: 'silk', face: 'smile' },
  [CASH.id]: { kind: 'cash', material: 'paper', face: 'wink' },
  [CREDIT.id]: { kind: 'credit_card', material: 'titanium', face: 'calm' },
  [TRANSIT.id]: { kind: 'transit', material: 'sky', face: 'wow' },
  [OLD_CARD.id]: { kind: 'credit_card', material: 'peach', face: 'happy' },
};

/** wc-wallet-edit's บัญชีหลัก: opened at ฿30,000 on 1 October, with ฿5,140 spent since, so ฿24,860 now. */
const EDITED: WalletSnapshot = { ...MAIN, opening_minor: '3000000', tracking_start: '2026-10-01' };
const SPENT = {
  id: '0000000c-0000-4000-8000-0000000000e1', type: 'expense', amount_minor: '514000', occurred_on: '2026-10-05', wallet_id: MAIN.id,
  category_id: BUILTINS[0].id, note: null, merchant: null, deleted_at: null, version: 1,
} as TransactionDto;

function fixture(wallets: readonly WalletSnapshot[] = [MAIN, CASH, CREDIT, TRANSIT, OLD_CARD], records: readonly TransactionDto[] = []): ScreenFixture {
  return {
    resources: createFakeResources({ wallets: [...wallets], records: [...records] }).resources,
    diary: createFakeDiary({ accountId: CATALOGUE_ACCOUNT }).diary,
    // The board's looks and order, written afresh each time the section opens.
    prepare: async () => {
      const store = walletAccountStore(CATALOGUE_ACCOUNT);
      await store.set(LOOKS_NAME, JSON.stringify(LOOKS));
      await store.set(WALLET_ORDER_NAME, JSON.stringify([MAIN.id, CASH.id, CREDIT.id, TRANSIT.id]));
    },
  };
}

const editFixture = () => fixture([EDITED, CASH, TRANSIT], [SPENT]);

/** A screen inside the kept looks, loaded when the section opens. */
function Looks({ children }: { children: ReactNode }) {
  return (
    <WalletLooksProvider>
      <Suspense fallback={null}>{children}</Suspense>
    </WalletLooksProvider>
  );
}

function Stage({ openReorder = false }: { openReorder?: boolean }) {
  return <Looks><WalletsListScreen openReorder={openReorder} /></Looks>;
}

/** The list is drawn with the kept looks once the credit card's spending shows. */
const LISTED: ScriptStep = { waitFor: 'wallets-held' };

/** A bank account named บัญชีหลัก, opened at ฿24,860 (bw-adding). */
const FILLED: readonly ScriptStep[] = [
  { call: 'onPress', on: { testID: 'wallet-kind-bank' } },
  { call: 'onChangeText', on: { testID: 'wallet-name' }, args: ['บัญชีหลัก'] },
  ...['2', '4', '8', '6', '0'].map((digit): ScriptStep => ({ press: digit })),
  { waitFor: 'wallet-preview' },
];

/** The edit screen once the wallet and its entries are read. */
const EDITING: ScriptStep = { waitFor: 'wallet-has-records' };

export const WALLET_LIST_SECTIONS: readonly CatalogueSection[] = [
  screenSection({
    id: 'bw-wallets',
    title: 'Bun Wallet: wallets',
    fixture,
    script: () => [LISTED],
    render: () => <Stage />,
  }),
  screenSection({
    id: 'bw-wallets-archived',
    title: 'Bun Wallet: wallets, archived opened',
    fixture,
    script: () => [LISTED, { call: 'onPress', on: { testID: 'wallets-archived-row' } }, { waitFor: 'wallets-archived' }],
    render: () => <Stage />,
  }),
  screenSection({
    id: 'bw-wallets-reorder',
    title: 'Bun Wallet: wallets, reorder tray',
    fixture,
    script: () => [LISTED, { waitFor: 'reorder-tray' }],
    render: () => <Stage openReorder />,
  }),
  screenSection({
    id: 'bw-wallet-new-type',
    title: 'Bun Wallet: new wallet, its kind',
    fixture: () => fixture(),
    script: () => [{ waitFor: 'wallet-kind-transit' }],
    render: () => <Looks><NewWalletFlow /></Looks>,
  }),
  screenSection({
    id: 'bw-wallet-new-form',
    title: 'Bun Wallet: new wallet, its fields',
    fixture: () => fixture(),
    script: () => FILLED,
    render: () => <Looks><NewWalletFlow /></Looks>,
  }),
  screenSection({
    id: 'bw-wallet-added',
    title: 'Bun Wallet: new wallet, added',
    fixture: () => fixture(),
    script: () => [...FILLED, { call: 'onPress', on: { testID: 'new-wallet-add' } }, { waitFor: 'new-wallet-added' }],
    render: () => <Looks><NewWalletFlow /></Looks>,
  }),
  screenSection({
    id: 'bw-wallet-edit',
    title: 'Bun Wallet: editing a wallet',
    fixture: editFixture,
    script: () => [EDITING],
    render: () => <Looks><WalletEditScreen walletId={MAIN.id} /></Looks>,
  }),
  screenSection({
    id: 'bw-wallet-correction',
    title: 'Bun Wallet: editing a wallet, correction tray',
    fixture: editFixture,
    script: () => [EDITING, { press: '5' }, { call: 'onPress', on: { testID: 'wallet-edit-save' } }, { waitFor: 'correction-tray' }],
    render: () => <Looks><WalletEditScreen walletId={MAIN.id} /></Looks>,
  }),
];
