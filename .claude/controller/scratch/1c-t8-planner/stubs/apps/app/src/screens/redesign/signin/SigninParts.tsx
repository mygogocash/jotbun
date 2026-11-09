// 1C-T8 RED stub (R52): the shared pieces draw nothing and mask nothing.
import { View } from 'react-native';

import type { SignInMethod } from '@mobile/auth/betterAuthPort';

export function maskEmail(_address: string): string {
  return '';
}

export function useMethodLabels(): Readonly<Record<SignInMethod, string>> {
  return { apple: '', google: '', email: '' };
}

export function TextButton(_props: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  return <View />;
}

export function FailureNote(_props: { text: string }) {
  return <View />;
}
