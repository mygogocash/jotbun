// The Face ID lock's catalogue sections (P2-T33, development only): the setup
// step (bw-lock-setup, sa-lock-setup), the same screen on a phone with no
// passcode or Face ID (bw-lock-setup-unavailable), the locked screen
// (bw-locked, sa-locked), its fingerprint form after a scan that did not pass
// (bw-locked-fingerprint), and the cover the app switcher sees while the app
// is only covered (bw-lock-cover: no text, no amount). The screens are the
// real ones, on a lock setting held in the section, so nothing asks a phone
// and nothing waits: the switch turns at once, and back and Next go nowhere.
// They draw LockSetupView, not the routed LockSetupScreen, so this list never
// loads expo-router. Their own list, spread last in ./index.ts. A section
// never imports the wallet test harness, which loads vitest.
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { LockCoverArt } from '@mobile/ui/lockCover';
import { useDraftCopy } from '@mobile/wallet/copy/useDraftCopy';
import { COPY } from '@mobile/wallet/lock/copy';
import { LockedScreen } from '@mobile/wallet/lock/LockedScreen';
import { LockSettingContext } from '@mobile/wallet/lock/LockGate';
import type { LockSetting } from '@mobile/wallet/lock/LockGate';
import type { LockAvailability } from '@mobile/wallet/lock/lockModel';
import { LockSetupView } from '@mobile/wallet/lock/LockSetupView';
import { Specimen } from '../parts';
import type { CatalogueSection } from '../registry';

/** A lock setting held in the section: off at first, on a phone that answers as `phone` does. */
function HeldSetting({ phone, children }: { phone: LockAvailability; children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const value = useMemo<LockSetting>(
    () => ({ ready: true, enabled, availability: phone, busy: false, change: async (on) => setEnabled(on), answer: () => undefined, recheck: () => undefined }),
    [enabled, phone],
  );
  return <LockSettingContext.Provider value={value}>{children}</LockSettingContext.Provider>;
}

const FACE: LockAvailability = { canLock: true, method: 'face' };
const NO_PASSCODE: LockAvailability = { canLock: false, method: null };
/** Back, Next and unlock go nowhere in the catalogue. */
const stay = () => undefined;

function FingerprintAfterAMiss() {
  const t = useDraftCopy(COPY);
  return <LockedScreen method="fingerprint" note={t('lock.tryAgain')} onUnlock={stay} />;
}

function CoverSection() {
  return (
    <Specimen label="While the app is only covered (inactive), and in the app switcher: the ground, no text and no amount">
      <View style={{ height: 320, borderRadius: 16, overflow: 'hidden' }}>
        <LockCoverArt />
      </View>
    </Specimen>
  );
}

export const WALLET_LOCK_SECTIONS: readonly CatalogueSection[] = [
  {
    id: 'bw-lock-setup',
    title: 'Bun Wallet: lock setup, step 5',
    group: 'Screens',
    layout: 'screen',
    render: () => <HeldSetting phone={FACE}><LockSetupView setup onBack={stay} onNext={stay} /></HeldSetting>,
  },
  {
    id: 'bw-lock-setup-unavailable',
    title: 'Bun Wallet: lock setup, no passcode',
    group: 'Screens',
    layout: 'screen',
    render: () => <HeldSetting phone={NO_PASSCODE}><LockSetupView setup={false} onBack={stay} onNext={stay} /></HeldSetting>,
  },
  { id: 'bw-locked', title: 'Bun Wallet: locked', group: 'Screens', layout: 'screen', render: () => <LockedScreen method="face" note={null} onUnlock={stay} /> },
  { id: 'bw-locked-fingerprint', title: 'Bun Wallet: locked, fingerprint', group: 'Screens', layout: 'screen', render: () => <FingerprintAfterAMiss /> },
  { id: 'bw-lock-cover', title: 'Bun Wallet: lock cover', group: 'Kit', render: () => <CoverSection /> },
];
