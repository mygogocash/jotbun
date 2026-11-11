// The Bun Wallet's wallets list in the catalogue (P2-T20, development only):
// wc-wallets' four wallets with one archived (bw-wallets), the archived list
// opened (bw-wallets-archived) and the reorder tray open over the list
// (bw-wallets-reorder), each drawn by the real WalletsListScreen on fakes.
// Their own list, spread after the add tray's in ./index.ts.
//
// - The looks belong to a catalogue account of its own, never the person's:
//   each time a section opens, its fake diary opens that account and its
//   looks and order are written for it before the screen mounts, so every
//   opening starts from the board, and the tray's presses change only it.
// - The screen is loaded when a section opens, not when this list is read:
//   it reaches Quick add's command keys (screens/v1/parts.tsx loads
//   expo-crypto) and expo-router, which the tests that read the wallet's list
//   do not stand in for (the catalogue's own suites do).
// - A section never imports the wallet test harness, which loads vitest.
import type { WalletSnapshot } from '@gogospend/contracts';
import { lazy, Suspense } from 'react';

import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { LOOKS_NAME, WALLET_ORDER_NAME, WalletLooksProvider } from '@mobile/wallet/looks/WalletLooksProvider';
import type { WalletLook } from '@mobile/wallet/looks/walletLooks';
import { walletAccountStore } from '@mobile/wallet/store/deviceWalletStore';
import type { CatalogueSection } from '../registry';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep } from '../screenSection';

const WalletsListScreen = lazy(() => import('@mobile/wallet/wallets/WalletsListScreen').then((module) => ({ default: module.WalletsListScreen })));

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

function fixture(): ScreenFixture {
  return {
    resources: createFakeResources({ wallets: [MAIN, CASH, CREDIT, TRANSIT, OLD_CARD] }).resources,
    diary: createFakeDiary({ accountId: CATALOGUE_ACCOUNT }).diary,
    // The board's looks and order, written afresh each time the section opens.
    prepare: async () => {
      const store = walletAccountStore(CATALOGUE_ACCOUNT);
      await store.set(LOOKS_NAME, JSON.stringify(LOOKS));
      await store.set(WALLET_ORDER_NAME, JSON.stringify([MAIN.id, CASH.id, CREDIT.id, TRANSIT.id]));
    },
  };
}

function Stage({ openReorder = false }: { openReorder?: boolean }) {
  return (
    <WalletLooksProvider>
      <Suspense fallback={null}>
        <WalletsListScreen openReorder={openReorder} />
      </Suspense>
    </WalletLooksProvider>
  );
}

/** The list is drawn with the kept looks once the credit card's spending shows. */
const LISTED: ScriptStep = { waitFor: 'wallets-held' };

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
];
