// The Bun Wallet's records catalogue sections (plan P2-T25, development only),
// drawn on fakes. A section never imports the wallet test harness, which loads vitest.
//
// bw-deleted is the real WalletDeletedScreen on its own fakes (deletedSection.tsx).
// It loads lazily: the screen and its stage import expo-router, which the
// kit's own suites (walletHarness, Tray and the others that list
// WALLET_SECTIONS) cannot load. While it loads, the section reads
// `catalogue-screen-running`, as a screen section's stage does while its
// script runs, so the catalogue's suites wait for it.
//
// The record's five (plan P2-T26) load lazily from recordScreens.tsx in the
// same way: the real WalletRecordScreen saved, as a draft on this phone and
// deleted ('Screens'), and its actions tray and undo bar on sample props
// ('Kit': a tray's title is in its Modal, so their pages draw no heading).
import { lazy, Suspense } from 'react';
import { View } from 'react-native';

import type { CatalogueSection } from '../registry';

const DeletedSection = lazy(() => import('./deletedSection'));
const RecordScreenSection = lazy(() => import('./recordScreens'));

/** The record's states (P2-T26), in the order the catalogue steps through them. */
export const WALLET_RECORD_IDS = ['bw-record', 'bw-record-draft', 'bw-record-deleted', 'bw-record-actions', 'bw-record-undo'] as const;
export type WalletRecordId = (typeof WALLET_RECORD_IDS)[number];

export const WALLET_RECORD_TITLES: Readonly<Record<WalletRecordId, string>> = {
  'bw-record': 'Bun Wallet: record',
  'bw-record-draft': 'Bun Wallet: record, a draft on this phone',
  'bw-record-deleted': 'Bun Wallet: record, deleted',
  'bw-record-actions': "Bun Wallet: record's actions tray",
  'bw-record-undo': "Bun Wallet: record's undo bar",
};

/** The tray and the bar: kit sections. */
const KIT_IDS: readonly WalletRecordId[] = ['bw-record-actions', 'bw-record-undo'];

export const WALLET_RECORD_SECTIONS: readonly CatalogueSection[] = [
  {
    id: 'bw-deleted',
    title: 'Bun Wallet: recently deleted',
    group: 'Screens',
    layout: 'screen',
    render: () => (
      <Suspense fallback={<View testID="catalogue-screen-running" style={{ flex: 1 }} />}>
        <DeletedSection />
      </Suspense>
    ),
  },
  ...WALLET_RECORD_IDS.map((id): CatalogueSection => ({
    id,
    title: WALLET_RECORD_TITLES[id],
    ...(KIT_IDS.includes(id) ? { group: 'Kit' as const } : { group: 'Screens' as const, layout: 'screen' as const }),
    render: () => (
      <Suspense fallback={<View testID="catalogue-screen-running" style={{ flex: 1 }} />}>
        <RecordScreenSection id={id} />
      </Suspense>
    ),
  })),
];
