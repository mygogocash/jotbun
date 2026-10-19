// R6: the Sign-in screen (plan §6.4), at `/login` behind the `account` area
// (on since E2 checkpoint 4).
//
// - The bun banner on the stage, one line ("If you already have an account,
//   we'll sign you in") and the three promises.
// - An explicit terms box that starts unticked. Until it is ticked, Apple,
//   Google and email are disabled and the line above them says why.
// - Apple, Google and email are equals: the same outlined pill, same size and
//   weight, none of them the screen's primary.
// - A provider goes through the session seam (`signInThroughSession`). Today
//   no credential provider is installed (F5 is not wired; real sign-in waits
//   for E1/E2), so the answer is "not configured": today's login message,
//   calmly, with Back to Jotbun. Nothing pretends to sign in: only a session
//   the seam reports active leaves this screen.
//
// The bun: the banner pose at Full. Quiet and Off leave the stage plain, as
// Home's stage does.
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCredentialProvider } from '@mobile/auth/session';
import { useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { PRIVACY_PROMISES, SIGN_IN_METHODS, afterSignInAttempt, canChooseProvider } from '@mobile/spend/v1/redesign/account/onboardingModel';
import type { SignInAttempt, SignInMethod, SignInState } from '@mobile/spend/v1/redesign/account/onboardingModel';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { PromiseList } from '@mobile/ui/PromiseList';
import { StageHeader } from '@mobile/ui/StageHeader';
import { NotConfigured, TermsCheckbox } from './SignInParts';

/**
 * One sign-in through the session seam. With no credential provider
 * installed (today: F5's provider is installed only once E1/E2 settle the
 * tenant and SDK) there is nothing to sign in through, so it says "not
 * configured" and calls nothing. With one, it is the provider's own sign-in.
 *
 * The provider's sign-in does not take a method yet: real Apple, Google and
 * email sign-in need it to pass the chosen connection through (F5).
 */
export async function signInThroughSession(_method: SignInMethod): Promise<SignInAttempt> {
  const provider = getCredentialProvider();
  if (!provider) return 'not_configured';
  return provider.signIn();
}

export type SignInScreenProps = {
  /** Starts one sign-in. Defaults to the session seam (`signInThroughSession`). */
  signIn?: (method: SignInMethod) => Promise<SignInAttempt>;
};

export function SignInScreen({ signIn = signInThroughSession }: SignInScreenProps) {
  const tc = useCopy();
  const router = useRouter();
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const { intensity } = useBunIntensity();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [state, setState] = useState<SignInState>({ phase: 'idle' });
  // One attempt at a time, however fast a provider is pressed.
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const open = canChooseProvider(termsAccepted, state);
  const why = tc('Tick the box to agree to the terms first.');
  const labels: Readonly<Record<SignInMethod, string>> = {
    apple: tc('Continue with Apple'),
    google: tc('Continue with Google'),
    email: tc('Continue with email'),
  };

  const choose = async (method: SignInMethod) => {
    if (!open || running.current) return;
    running.current = true;
    setState({ phase: 'signing_in', method });
    let attempt: SignInAttempt;
    try {
      attempt = await signIn(method);
    } catch {
      attempt = 'failed';
    }
    running.current = false;
    if (!mounted.current) return;
    const next = afterSignInAttempt(attempt);
    setState(next.state);
    if (next.go) router.replace(next.go);
  };

  // The banner: a large hello beside the short title.
  const banner = intensity === 'full' ? <Bun pose="hello" size="l" testID="sign-in-bun" /> : undefined;

  return (
    <View testID="sign-in-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + BUN_SPACE.lg }} keyboardShouldPersistTaps="handled">
        <StageHeader title={tc('Sign in')} subtitle={tc('Your diary stays private')} bun={banner} />
        <View style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          <BunText>{tc("If you already have an account, we'll sign you in")}</BunText>
          <PromiseList items={PRIVACY_PROMISES.map((promise) => ({ key: promise.key, text: tc(promise.text) }))} />
          {state.phase === 'not_configured' ? (
            <NotConfigured onBack={() => router.replace('/')} />
          ) : (
            <>
              <TermsCheckbox
                label={tc('I agree to the Terms of Service and the Privacy Policy')}
                checked={termsAccepted}
                onToggle={() => setTermsAccepted((ticked) => !ticked)}
              />
              {/* Said once, above all three, rather than under each; each provider also carries it as its hint. */}
              {termsAccepted ? null : <BunText variant="caption" tone="muted">{why}</BunText>}
              <View style={{ gap: BUN_SPACE.xs }}>
                {SIGN_IN_METHODS.map((method) => {
                  const busy = state.phase === 'signing_in' && state.method === method;
                  return (
                    <PillButton
                      key={method}
                      kind="secondary"
                      label={labels[method]}
                      busy={busy}
                      busyLabel={tc('Signing in…')}
                      disabled={!open && !busy}
                      accessibilityHint={termsAccepted ? undefined : why}
                      onPress={() => void choose(method)}
                    />
                  );
                })}
              </View>
              {state.phase === 'failed' ? <Failed /> : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** An attempt that did not finish (or needs doing again), said calmly; the providers stay ready. */
function Failed() {
  const tc = useCopy();
  const text = tc("Sign-in didn't finish. Try again.");
  useAnnouncement(text);
  return (
    <View {...POLITE_LIVE_REGION}>
      <BunText>{text}</BunText>
    </View>
  );
}
