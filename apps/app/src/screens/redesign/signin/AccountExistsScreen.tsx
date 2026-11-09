// 1C-T8: an Apple or Google sign-in refused because the email already has a
// Jotbun account (C14, R54, K19), a draft awaiting E2, unrouted until 1C-T9
// (`/login/account-exists`). No board draws it: today's kit, with sa-signin's
// method buttons.
//
// It names each method the server named, in its order, as an action (the
// first one is the main button), and always offers the email code: any
// account can sign in with a code sent to its own address (C14). It reports
// one choice per visit; the caller leaves for that method's own flow.
import { useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SignInMethod } from '@mobile/auth/betterAuthPort';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { StageHeader } from '@mobile/ui/StageHeader';
import { useSigninCopy } from './draftCopy';
import { useMethodLabels } from './SigninParts';

export type AccountExistsScreenProps = {
  /** The account's methods as the server named them (R54), in its order. */
  methods: readonly SignInMethod[];
  onMethod(method: SignInMethod): void;
  onBack(): void;
};

const KNOWN: readonly SignInMethod[] = ['apple', 'google', 'email'];

/** The named methods once each, in their order, then the email code if it was not named. */
export function offeredMethods(methods: readonly SignInMethod[]): SignInMethod[] {
  const named = methods.filter((method, index) => KNOWN.includes(method) && methods.indexOf(method) === index);
  return named.includes('email') ? named : [...named, 'email'];
}

export function AccountExistsScreen({ methods, onMethod, onBack }: AccountExistsScreenProps) {
  const sc = useSigninCopy();
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const labels = useMethodLabels();
  const [chosen, setChosen] = useState<SignInMethod | null>(null);
  // One choice per visit, however fast the buttons are pressed.
  const reported = useRef(false);

  const choose = (method: SignInMethod) => {
    if (reported.current) return;
    reported.current = true;
    setChosen(method);
    onMethod(method);
  };

  const lineFor = (method: SignInMethod): string => {
    switch (method) {
      case 'apple': return sc('Use the same Apple ID as before.');
      case 'google': return sc('Use the same Google account as before.');
      default: return sc('We send a 6-digit code to this email.');
    }
  };

  return (
    <View testID="account-exists-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + BUN_SPACE.lg }}>
        <StageHeader back={{ onPress: onBack }} title={sc('You already have an account')} />
        <View style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          <BunText>{sc('This email already has a Jotbun account. Sign in the way you used before, so your records stay in one place.')}</BunText>
          {offeredMethods(methods).map((method, index) => (
            <View key={method} style={{ gap: BUN_SPACE.xxs }}>
              <PillButton
                kind={index === 0 ? 'primary' : 'secondary'}
                label={labels[method]}
                busy={chosen === method}
                disabled={chosen !== null && chosen !== method}
                onPress={() => choose(method)}
              />
              <BunText variant="caption" tone="muted" style={{ textAlign: 'center' }}>{lineFor(method)}</BunText>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
