// Bun AI's catalogue sections (P3-T14, development only; E2-P3-A): the consent
// tray open over Bun and AI settings with AI help off (bw-ai-consent, board
// ai-consent), the settings with AI help on and today's uses left
// (bw-ai-settings, ai-settings), and with it off (bw-ai-settings-off). Their
// own list, spread after the lock's in ./index.ts. Ids start with `bw-` and
// titles with `Bun Wallet: ` (R72).
//
// The screens and their fakes are in ./bunaiScreens.tsx, loaded when a section
// opens: the screens bring expo-router, which only the screens' own tests
// stand in for, and the wallet harness's and the tray's tests import this list
// without it. While that module loads, a section reads
// `catalogue-screen-running`, so the catalogue waits for it as it waits for a
// screen's script (screenSection.tsx). A section never imports the wallet test
// harness, which loads vitest.
import { lazy, Suspense } from 'react';
import { View } from 'react-native';

import type { CatalogueSection } from '../registry';

/** Bun AI's states, in the order the catalogue steps through them. */
export const WALLET_BUNAI_IDS = ['bw-ai-consent', 'bw-ai-settings', 'bw-ai-settings-off'] as const;
export type WalletBunAiId = (typeof WALLET_BUNAI_IDS)[number];

export const WALLET_BUNAI_TITLES: Readonly<Record<WalletBunAiId, string>> = {
  'bw-ai-consent': 'Bun Wallet: AI consent',
  'bw-ai-settings': 'Bun Wallet: Bun and AI settings',
  'bw-ai-settings-off': 'Bun Wallet: Bun and AI settings, AI off',
};

const BunAiScreenSection = lazy(() => import('./bunaiScreens'));

/** What the catalogue meets while the screens' module loads. */
function Loading() {
  return <View testID="catalogue-screen-running" style={{ flex: 1 }} />;
}

export const WALLET_BUNAI_SECTIONS: readonly CatalogueSection[] = WALLET_BUNAI_IDS.map((id): CatalogueSection => ({
  id,
  title: WALLET_BUNAI_TITLES[id],
  group: 'Screens',
  layout: 'screen',
  render: () => (
    <Suspense fallback={<Loading />}>
      <BunAiScreenSection id={id} />
    </Suspense>
  ),
}));
