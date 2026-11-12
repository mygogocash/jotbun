// Bun AI's catalogue states (P3-T14, development only), loaded by
// ./bunaiSections.tsx when a section opens: the real Bun and AI settings on
// the companion catalogue's AI fakes (catalogueAi), which keep Bun's help in
// memory, so agreeing here turns on nothing but the fake.
//
// - bw-ai-consent opens the real consent tray at once, over the settings with
//   AI help off. Close it, and the AI switch opens the screen's own.
// - bw-ai-settings has AI help on, with ai-settings' uses left today: 27 of
//   30 sentences, 9 of 10 slips and 19 of 20 questions.
// - bw-ai-settings-off has AI help off, so no uses show.
//
// The presence, the note switch and haptics are this phone's own settings, as
// the appearance and language are in today's Settings sections: a tap here
// changes them.
import { AI_DAILY_LIMITS, AI_NOTICE_VERSION } from '@gogospend/contracts';
import { useState } from 'react';

import { AiCompanionProvider } from '@mobile/spend/v1/ai/AiCompanionProvider';
import type { AiResources } from '@mobile/spend/v1/ai/aiResources';
import { AiConsentTray } from '@mobile/wallet/bunai/AiConsentTray';
import { WalletAiSettingsScreen } from '@mobile/wallet/bunai/WalletAiSettingsScreen';
import { catalogueAi } from '../companion/companionSections';
import type { CatalogueSection } from '../registry';
import { goldenFake } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture } from '../screenSection';
import { WALLET_BUNAI_TITLES } from './bunaiSections';
import type { WalletBunAiId } from './bunaiSections';

type BunAiFixture = ScreenFixture & { readonly ai: AiResources };

const fakes = (ai: AiResources): BunAiFixture => ({ resources: goldenFake().resources, diary: null, ai });

/** ai-settings' uses left today. */
const BOARD_USES = { ...AI_DAILY_LIMITS, parse: 27, slip: 9, ask: 19 };

/** The consent tray, open at once. */
function OpenConsent() {
  const [open, setOpen] = useState(true);
  return <AiConsentTray visible={open} onClose={() => setOpen(false)} />;
}

const SECTIONS: Readonly<Record<WalletBunAiId, CatalogueSection>> = {
  'bw-ai-consent': screenSection({
    id: 'bw-ai-consent',
    title: WALLET_BUNAI_TITLES['bw-ai-consent'],
    fixture: () => fakes(catalogueAi()),
    script: () => [{ waitFor: 'ai-consent' }],
    render: (fixture) => (
      <AiCompanionProvider resources={fixture.ai}>
        <WalletAiSettingsScreen />
        <OpenConsent />
      </AiCompanionProvider>
    ),
  }),
  'bw-ai-settings': screenSection({
    id: 'bw-ai-settings',
    title: WALLET_BUNAI_TITLES['bw-ai-settings'],
    fixture: () => fakes(catalogueAi({ companion: true, notice_version: AI_NOTICE_VERSION, remaining: BOARD_USES })),
    script: () => [{ waitFor: 'ai-settings-uses' }],
    render: (fixture) => <AiCompanionProvider resources={fixture.ai}><WalletAiSettingsScreen /></AiCompanionProvider>,
  }),
  'bw-ai-settings-off': screenSection({
    id: 'bw-ai-settings-off',
    title: WALLET_BUNAI_TITLES['bw-ai-settings-off'],
    fixture: () => fakes(catalogueAi()),
    script: () => [{ waitFor: 'ai-settings' }],
    render: (fixture) => <AiCompanionProvider resources={fixture.ai}><WalletAiSettingsScreen /></AiCompanionProvider>,
  }),
};

/** One Bun AI state, drawn as the catalogue draws every screen section. */
export default function BunAiScreenSection({ id }: { id: WalletBunAiId }) {
  return <>{SECTIONS[id].render()}</>;
}
