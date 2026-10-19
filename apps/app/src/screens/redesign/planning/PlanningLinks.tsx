// R4 Planning's ways in from the approved screens: Home opens Budget (to set
// one, or to see it) and Wallets. Behind the `planning` area until E2
// checkpoint 2: with it off they draw nothing, so Home is unchanged.
import { useRouter } from 'expo-router';

import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { useCopy } from '@mobile/i18n/useCopy';
import { PillButton } from '@mobile/ui/PillButton';

export type PlanningLinkTarget = 'set-budget' | 'see-budget' | 'wallets';

export function PlanningLink({ to }: { to: PlanningLinkTarget }) {
  const router = useRouter();
  const tc = useCopy();
  if (!isRedesignEnabled('planning')) return null;
  const label = to === 'set-budget' ? tc('Set a budget') : to === 'see-budget' ? tc('See budget') : tc('Manage wallets');
  return <PillButton kind="secondary" label={label} onPress={() => router.push(to === 'wallets' ? '/spend/wallets' : '/spend/budget')} />;
}
