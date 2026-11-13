// The saved moment in the catalogue (P2-T17, development only): the real
// toast host on fakes, one section per state for E2-B: today's total with Undo
// (bw-saved), kept on this phone while offline (rh-offline), private mode, and
// after Undo.
//
// The host, its fakes and the page under it are in ./savedScreens.tsx, loaded
// when a section opens: the host reaches Quick add's command keys (and so
// expo-crypto), which no catalogue list may load (the controller's rule, as
// ./recapSections.tsx loads its screen). While that module loads, a section
// reads `catalogue-screen-running`, so the catalogue waits for it as it waits
// for a screen's script (screenSection.tsx). A section never imports the
// wallet test harness, which loads vitest.
import { lazy, Suspense } from 'react';
import { View } from 'react-native';

import type { CatalogueSection } from '../registry';

/** The saved moment's states, in the order the catalogue steps through them. */
export const WALLET_SAVED_IDS = ['bw-saved-toast', 'bw-saved-offline', 'bw-saved-private', 'bw-saved-undone'] as const;
export type WalletSavedId = (typeof WALLET_SAVED_IDS)[number];

export const WALLET_SAVED_TITLES: Readonly<Record<WalletSavedId, string>> = {
  'bw-saved-toast': 'Bun Wallet: Saved toast',
  'bw-saved-offline': 'Bun Wallet: Saved toast, offline',
  'bw-saved-private': 'Bun Wallet: Saved toast, private mode',
  'bw-saved-undone': 'Bun Wallet: Saved toast, undone',
};

const SavedScreenSection = lazy(() => import('./savedScreens'));

/** What the catalogue meets while the host's module loads. */
function Loading() {
  return <View testID="catalogue-screen-running" style={{ flex: 1 }} />;
}

export const WALLET_SAVED_SECTIONS: readonly CatalogueSection[] = WALLET_SAVED_IDS.map((id): CatalogueSection => ({
  id,
  title: WALLET_SAVED_TITLES[id],
  group: 'Screens',
  layout: 'screen',
  render: () => (
    <Suspense fallback={<Loading />}>
      <SavedScreenSection id={id} />
    </Suspense>
  ),
}));
