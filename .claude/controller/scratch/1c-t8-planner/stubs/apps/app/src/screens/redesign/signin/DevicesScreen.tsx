// 1C-T8 RED stub (R52): the devices screen draws an empty View.
import { View } from 'react-native';

import type { BetterAuthPort } from '@mobile/auth/betterAuthPort';
import type { FreshOutcome } from '@mobile/auth/credentialProvider';
import type { StoredSession } from '@mobile/auth/sessionStore';

export type DevicesPort = Pick<BetterAuthPort, 'devices' | 'signOutDevice' | 'signOutOtherDevices' | 'linkMethod' | 'unlinkMethod' | 'linkedMethods' | 'methods'>;
export type DevicesScreenProps = { port: DevicesPort; freshSignIn: () => Promise<FreshOutcome>; account: StoredSession };

export function DevicesScreen(_props: DevicesScreenProps) {
  return <View />;
}
