// The Bun Wallet month recap's catalogue states (P2-T32, development only),
// loaded by ./recapSections.tsx when a section opens: the real
// WalletRecapScreen on fakes, on the catalogue's clock (29 September 2026), so
// August 2026 is a past month.
//
// - The fakes are the Bun diary recap's (insights/recapSections.tsx: the
//   golden diary with April to August added, and each month's category
//   totals), with August's budget: ฿18,000.00, or ฿10,000.00 to be over it.
// - Private mode is the section's own, over a store kept in memory, as
//   kitSections.tsx shows it, so the catalogue never changes the person's own
//   setting.
// - The cashback state adds seven August purchases at Shopee and Lazada, with
//   tips on, through the companion catalogue's AI fakes.
// - The first opening of August's recap on a phone celebrates it once, as the
//   app would; the confetti is gone long before a screenshot's 8 s.
import type { TransactionDto } from '@gogospend/contracts';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { AiCompanionProvider } from '@mobile/spend/v1/ai/AiCompanionProvider';
import type { AiResources } from '@mobile/spend/v1/ai/aiResources';
import { PRIVATE_MODE_NAME, PrivateModeProvider } from '@mobile/wallet/privacy/PrivateModeProvider';
import type { KeyValueStore } from '@mobile/wallet/store/walletStore';
import { WalletRecapScreen } from '@mobile/wallet/recap/WalletRecapScreen';
import { catalogueAi } from '../companion/companionSections';
import { recapBudget, recapFake } from '../insights/recapSections';
import type { CatalogueSection } from '../registry';
import { CATALOGUE_NOW, expense } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep } from '../screenSection';
import { WALLET_RECAP_TITLES } from './recapSections';
import type { WalletRecapId } from './recapSections';

const MONTH = '2026-08';

type RecapFixture = ScreenFixture & { readonly ai: AiResources | null };

function memoryStore(seed: Readonly<Record<string, string>>): KeyValueStore {
  const kept = new Map(Object.entries(seed));
  return {
    get: async (name) => kept.get(name) ?? null,
    set: async (name, value) => { kept.set(name, value); },
    remove: async (name) => { kept.delete(name); },
    eraseAll: async () => { kept.clear(); },
  };
}

/** Private mode on for this section only. */
function PrivateRecap({ children }: { children: ReactNode }) {
  const [store] = useState(() => memoryStore({ [PRIVATE_MODE_NAME]: '1' }));
  return <PrivateModeProvider store={store}>{children}</PrivateModeProvider>;
}

/** Seven August days of shopping at Shopee and Lazada, so A5 has a count to show. */
const SHOPPING: readonly TransactionDto[] = [3, 6, 9, 13, 16, 22, 26].map((day, index) =>
  expense(900 + index, `${MONTH}-${String(day).padStart(2, '0')}`, '29900', { merchant: index % 3 === 0 ? 'Lazada' : 'Shopee' }),
);

const fakes = (limitMinor: string, options: { extra?: readonly TransactionDto[]; ai?: AiResources } = {}): RecapFixture => ({
  resources: recapFake({ budgets: [recapBudget(MONTH, limitMinor)], extra: [...(options.extra ?? [])] }).resources,
  diary: null,
  ai: options.ai ?? null,
});
const recap = () => <WalletRecapScreen month={MONTH} now={CATALOGUE_NOW} />;
const shown = (testID: string) => (): ScriptStep[] => [{ waitFor: testID }];

const SECTIONS: Readonly<Record<WalletRecapId, CatalogueSection>> = {
  'bw-recap': screenSection({
    id: 'bw-recap',
    title: WALLET_RECAP_TITLES['bw-recap'],
    fixture: () => fakes('1800000'),
    script: shown('recap-card'),
    render: recap,
  }),
  'bw-recap-over': screenSection({
    id: 'bw-recap-over',
    title: WALLET_RECAP_TITLES['bw-recap-over'],
    fixture: () => fakes('1000000'),
    script: shown('recap-card'),
    render: recap,
  }),
  'bw-recap-private': screenSection({
    id: 'bw-recap-private',
    title: WALLET_RECAP_TITLES['bw-recap-private'],
    fixture: () => fakes('1800000'),
    script: shown('recap-card'),
    render: () => <PrivateRecap>{recap()}</PrivateRecap>,
  }),
  'bw-recap-cashback': screenSection({
    id: 'bw-recap-cashback',
    title: WALLET_RECAP_TITLES['bw-recap-cashback'],
    fixture: () => fakes('1800000', { extra: SHOPPING, ai: catalogueAi({ cashback_tips: true }) }),
    script: shown('recap-cashback'),
    render: (fixture) => (fixture.ai ? <AiCompanionProvider resources={fixture.ai}>{recap()}</AiCompanionProvider> : recap()),
  }),
};

/** One recap state, drawn as the catalogue draws every screen section. */
export default function RecapScreenSection({ id }: { id: WalletRecapId }) {
  return <>{SECTIONS[id].render()}</>;
}
