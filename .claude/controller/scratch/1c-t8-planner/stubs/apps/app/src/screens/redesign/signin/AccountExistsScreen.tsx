// 1C-T8 RED stub (R52): offers nothing and draws an empty View.
import { View } from 'react-native';

import type { SignInMethod } from '@mobile/auth/betterAuthPort';

export type AccountExistsScreenProps = { methods: readonly SignInMethod[]; onMethod(method: SignInMethod): void; onBack(): void };

export function offeredMethods(_methods: readonly SignInMethod[]): SignInMethod[] {
  return [];
}

export function AccountExistsScreen(_props: AccountExistsScreenProps) {
  return <View />;
}
