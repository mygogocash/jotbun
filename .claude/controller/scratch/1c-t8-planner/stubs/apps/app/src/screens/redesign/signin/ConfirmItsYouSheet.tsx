// 1C-T8 RED stub (R52): the confirm sheet draws an empty View.
import { View } from 'react-native';

import type { SignInMethod } from '@mobile/auth/betterAuthPort';
import type { CredentialProvider, FreshOutcome } from '@mobile/auth/credentialProvider';

export type ConfirmProvider = Pick<CredentialProvider, 'freshSignIn' | 'sendEmailCode' | 'signIn'>;
export type ConfirmItsYouSheetProps = { visible: boolean; method: SignInMethod; email: string; provider: ConfirmProvider; onDone(outcome: FreshOutcome): void };

export function ConfirmItsYouSheet(_props: ConfirmItsYouSheetProps) {
  return <View />;
}
