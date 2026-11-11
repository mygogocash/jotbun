// 1C-T8 RED stub (R52): the email code screen and its form draw an empty View.
import { View } from 'react-native';

import type { CredentialProvider, FreshOutcome, SignInResult } from '@mobile/auth/credentialProvider';

export type EmailCodeProvider = Pick<CredentialProvider, 'sendEmailCode' | 'signIn' | 'freshSignIn'>;

export type EmailCodeScreenProps = {
  provider: EmailCodeProvider;
  mode: 'sign_in' | 'fresh';
  fixedEmail?: string;
  onDone(outcome: SignInResult | FreshOutcome): void;
  onBack(): void;
};

export type EmailCodeFormProps = Omit<EmailCodeScreenProps, 'onBack'> & { onOtherWay?: () => void };

export const RESEND_SECONDS = 60;

export function EmailCodeForm(_props: EmailCodeFormProps) {
  return <View />;
}

export function EmailCodeScreen(_props: EmailCodeScreenProps) {
  return <View />;
}
