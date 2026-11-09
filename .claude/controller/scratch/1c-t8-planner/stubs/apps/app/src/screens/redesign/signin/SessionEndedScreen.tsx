// 1C-T8 RED stub (R52): the session-ended screen draws an empty View.
import { View } from 'react-native';

import type { CredentialProvider } from '@mobile/auth/credentialProvider';
import type { SessionEndedView } from '@mobile/auth/sessionEnded';

export type SessionEndedProvider = Pick<CredentialProvider, 'signIn' | 'methods' | 'account' | 'sendEmailCode' | 'freshSignIn'>;
export type UnsentRow = { title: string; at: string; amount: string };
export type SessionEndedScreenProps = {
  view: SessionEndedView;
  unsentRows: readonly UnsentRow[];
  provider: SessionEndedProvider;
  eraseAccount(accountId: string): Promise<void>;
  onResumed(): void;
};

export function SessionEndedScreen(_props: SessionEndedScreenProps) {
  return <View />;
}
