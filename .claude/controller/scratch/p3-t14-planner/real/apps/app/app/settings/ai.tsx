import { Redirect } from 'expo-router';

import { useBunAiArea } from '@mobile/wallet/bunai/aiArea';
import { WalletAiSettingsScreen } from '@mobile/wallet/bunai/WalletAiSettingsScreen';

/** P3-T14: Bun and AI settings (ai-settings), only while the Bun AI area is on (useBunAiArea); else Settings. */
export default function AiSettingsRoute() {
  if (!useBunAiArea()) return <Redirect href="/settings" />;
  return <WalletAiSettingsScreen />;
}
