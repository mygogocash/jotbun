// The lock's setup at /settings/lock (P2-T33, sa-lock-setup): LockSetupView
// with the router's way back, to the screen below (Settings, or the setup
// checklist with `setup`), else to /settings, or to /spend for the setup step
// opened on its own (/spend/setup is P2-T35's route). Next, after keeping the
// answer, goes the same way.
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import { LockSetupView } from './LockSetupView';

export function LockSetupScreen({ setup }: { setup: boolean }) {
  const router = useRouter();
  const fallback: Href = setup ? '/spend' : '/settings';
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  };
  return <LockSetupView setup={setup} onBack={back} onNext={back} />;
}
