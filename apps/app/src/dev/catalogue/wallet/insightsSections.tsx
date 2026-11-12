// The Bun Wallet insights in the catalogue (P2-T31, development only): the
// real WalletInsightsScreen on fakes, one section per state for E2-C, in the
// 'Screens' group, as the wallets list and the month recap draw theirs.
//
// The screen and its fakes are in ./insightsScreens.tsx, loaded when a section
// opens: the screen brings expo-router, which only the screens' own tests
// stand in for, and the wallet harness's and the tray's tests import this list
// without it. While that module loads, a section reads
// `catalogue-screen-running`, so the catalogue waits for it as it waits for a
// screen's script (screenSection.tsx). A section never imports the wallet test
// harness, which loads vitest.
import { lazy, Suspense } from 'react';
import { View } from 'react-native';

import type { CatalogueSection } from '../registry';

/** The insights' states, in the order the catalogue steps through them. */
export const WALLET_INSIGHTS_IDS = ['bw-insights', 'bw-insights-in-out', 'bw-calendar', 'bw-insights-early', 'bw-insights-private', 'bw-insights-large'] as const;
export type WalletInsightsId = (typeof WALLET_INSIGHTS_IDS)[number];

export const WALLET_INSIGHTS_TITLES: Readonly<Record<WalletInsightsId, string>> = {
  'bw-insights': 'Bun Wallet: Insights, spending',
  'bw-insights-in-out': 'Bun Wallet: Insights, in and out',
  'bw-calendar': 'Bun Wallet: Insights, calendar',
  'bw-insights-early': 'Bun Wallet: Insights, the first days',
  'bw-insights-private': 'Bun Wallet: Insights, calendar in private mode',
  'bw-insights-large': 'Bun Wallet: Insights, the largest amount',
};

const InsightsScreenSection = lazy(() => import('./insightsScreens'));

/** What the catalogue meets while the screen's module loads. */
function Loading() {
  return <View testID="catalogue-screen-running" style={{ flex: 1 }} />;
}

export const WALLET_INSIGHTS_SECTIONS: readonly CatalogueSection[] = WALLET_INSIGHTS_IDS.map((id): CatalogueSection => ({
  id,
  title: WALLET_INSIGHTS_TITLES[id],
  group: 'Screens',
  layout: 'screen',
  render: () => (
    <Suspense fallback={<Loading />}>
      <InsightsScreenSection id={id} />
    </Suspense>
  ),
}));
