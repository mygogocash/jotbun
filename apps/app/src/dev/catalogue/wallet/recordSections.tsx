// The Bun Wallet's records catalogue sections (plan P2-T25, development only),
// drawn on fakes. A section never imports the wallet test harness, which loads vitest.
//
// bw-deleted is the real WalletDeletedScreen on its own fakes (deletedSection.tsx).
// It loads lazily: the screen and its stage import expo-router, which the
// kit's own suites (walletHarness, Tray and the others that list
// WALLET_SECTIONS) cannot load. While it loads, the section reads
// `catalogue-screen-running`, as a screen section's stage does while its
// script runs, so the catalogue's suites wait for it.
import { lazy, Suspense } from 'react';
import { View } from 'react-native';

import type { CatalogueSection } from '../registry';

const DeletedSection = lazy(() => import('./deletedSection'));

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
];
