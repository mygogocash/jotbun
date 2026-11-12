// The Bun Wallet month recap in the catalogue (P2-T32, development only): the
// real WalletRecapScreen on fakes, one section per state for E2-C, in the
// 'Screens' group, as insights/recapSections.tsx draws the Bun diary recap.
//
// The screens and their fakes are in ./recapScreens.tsx, loaded when a section
// opens: the screen brings expo-router, which only the screens' own tests
// stand in for, and the wallet harness's and the tray's tests import this
// list without it. While that module loads, a section reads
// `catalogue-screen-running`, so the catalogue waits for it as it waits for a
// screen's script (screenSection.tsx). A section never imports the wallet
// test harness, which loads vitest.
import { lazy, Suspense } from 'react';
import { View } from 'react-native';

import type { CatalogueSection } from '../registry';

/** The recap's states, in the order the catalogue steps through them. */
export const WALLET_RECAP_IDS = ['bw-recap', 'bw-recap-over', 'bw-recap-private', 'bw-recap-cashback'] as const;
export type WalletRecapId = (typeof WALLET_RECAP_IDS)[number];

export const WALLET_RECAP_TITLES: Readonly<Record<WalletRecapId, string>> = {
  'bw-recap': 'Bun Wallet: Month recap',
  'bw-recap-over': 'Bun Wallet: Month recap, over budget',
  'bw-recap-private': 'Bun Wallet: Month recap, private mode',
  'bw-recap-cashback': 'Bun Wallet: Month recap, cashback tips',
};

const RecapScreenSection = lazy(() => import('./recapScreens'));

/** What the catalogue meets while the screen's module loads. */
function Loading() {
  return <View testID="catalogue-screen-running" style={{ flex: 1 }} />;
}

export const WALLET_RECAP_SECTIONS: readonly CatalogueSection[] = WALLET_RECAP_IDS.map((id): CatalogueSection => ({
  id,
  title: WALLET_RECAP_TITLES[id],
  group: 'Screens',
  layout: 'screen',
  render: () => (
    <Suspense fallback={<Loading />}>
      <RecapScreenSection id={id} />
    </Suspense>
  ),
}));
