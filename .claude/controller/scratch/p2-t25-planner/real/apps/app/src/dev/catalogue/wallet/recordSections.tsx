// The Bun Wallet's records catalogue sections (plan P2-T25, development only),
// drawn on fakes. A section never imports the wallet test harness, which loads vitest.
import { lazy, Suspense } from 'react';

import type { CatalogueSection } from '../registry';

const LazyDeleted = lazy(() =>
  import('@mobile/wallet/records/WalletDeletedScreen').then((m) => ({ default: m.WalletDeletedScreen }))
);

export const WALLET_RECORD_SECTIONS: readonly CatalogueSection[] = [
  {
    id: 'bw-deleted',
    title: 'Bun Wallet: recently deleted',
    group: 'Screens',
    layout: 'screen',
    render: () => (
      <Suspense fallback={null}>
        <LazyDeleted />
      </Suspense>
    ),
  },
];
