// 1C-T8: the email-code sign-in (boards sa-signin, sa-email-code), a draft
// awaiting E2, unrouted until 1C-T9 (`/login/email`).
//
// - The address step: one email field and "Send the code"; with a fixed
//   address (a fresh sign-in, or the session-ended screen for an email
//   account) just that address, masked, and "Send the code".
// - The code step: the masked address (the first character, •••, the
//   domain), the board's 10-minute line, ONE code field (one TextInput with
//   `textContentType="oneTimeCode"`, `autoComplete="one-time-code"` and a
//   number pad) whose sixth digit starts exactly one sign-in, a resend that
//   waits 60 seconds, and เปลี่ยนอีเมล unless the address is fixed.
// - `sign_in` signs in with the code (`provider.signIn`); `fresh` confirms the
//   account's own address (`provider.freshSignIn`). A wrong code says so and
//   clears the field; a limit, an outage or a failure says so calmly with the
//   records-safe line and another way (spec §5.2), and keeps the step. Every
//   other answer goes to `onDone`, which decides where the person goes.
//
// `EmailCodeForm` is the steps without the screen around them: the confirm
// sheet (ConfirmItsYouSheet) draws it under its own title. P6B-T7 moves these
// rules into `useEmailCode` and draws the board's six boxes over this one
// field (X14).
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CodeOutcome, CredentialProvider, FreshOutcome, SignInResult } from '@mobile/auth/credentialProvider';
import { useCopy } from '@mobile/i18n/useCopy';
import { TextInput } from '@mobile/theme/AppText';
import { BUN_MAX_FONT_SCALE, bunText } from '@mobile/theme/bunType';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { POLITE_LIVE_REGION } from '@mobile/ui/a11y';
import { BunText, useBunScript } from '@mobile/ui/BunText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { StageHeader } from '@mobile/ui/StageHeader';
import { useSigninCopy } from './draftCopy';
import { FailureNote, TextButton, maskEmail } from './SigninParts';

export type EmailCodeProvider = Pick<CredentialProvider, 'sendEmailCode' | 'signIn' | 'freshSignIn'>;

export type EmailCodeScreenProps = {
  provider: EmailCodeProvider;
  mode: 'sign_in' | 'fresh';
  /** The address the code goes to, not editable: the account's own (a fresh sign-in, a session that ended). */
  fixedEmail?: string;
  /** Every answer this screen does not keep: success, and the ones another screen handles. */
  onDone(outcome: SignInResult | FreshOutcome): void;
  onBack(): void;
};

export type EmailCodeFormProps = Omit<EmailCodeScreenProps, 'onBack'> & {
  /** Shown beside a failure as ใช้วิธีอื่น (spec §5.2), when the caller has another way. */
  onOtherWay?: () => void;
};

/** How long a new code waits after the last one was sent, in seconds. */
export const RESEND_SECONDS = 60;
const CODE_LENGTH = 6;
/** An address worth sending a code to: something, @, a domain with a dot. The server decides the rest. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FAILED: SignInResult = { outcome: 'failed', methods: [], created: false };

/** 0:42 */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function EmailCodeForm({ provider, mode, fixedEmail, onDone, onOtherWay }: EmailCodeFormProps) {
  const sc = useSigninCopy();
  const tc = useCopy();
  const colors = useBunColors();
  const script = useBunScript();
  const fixed = fixedEmail === undefined ? null : fixedEmail.trim().toLowerCase();
  const [typed, setTyped] = useState('');
  /** The code step's address, once a code was sent there. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // One request at a time, however fast a button is pressed or digits arrive.
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // The resend countdown: one tick a second while it runs.
  const counting = wait > 0;
  useEffect(() => {
    if (!counting) return undefined;
    const timer = setInterval(() => setWait((left) => Math.max(0, left - 1)), 1000);
    return () => clearInterval(timer);
  }, [counting]);

  const address = typed.trim().toLowerCase();
  const target = fixed ?? address;

  const sendProblem = (outcome: Exclude<CodeOutcome, 'sent'>): string => {
    switch (outcome) {
      case 'rate_limited': return sc('Too many tries for now. Wait a few minutes, then try again.');
      case 'unavailable': return sc("Couldn't reach Jotbun. Check your connection and try again.");
      case 'not_configured': return sc('Email sign-in is not available on this build.');
      default: return sc("Couldn't send the code. Try again.");
    }
  };

  /** The answers the code step keeps, with what it says; null hands the answer to `onDone`. */
  const codeProblem = (outcome: SignInResult['outcome'] | FreshOutcome): string | null => {
    switch (outcome) {
      case 'wrong_code': return sc("That code isn't right. Type the 6 digits from the newest email.");
      case 'rate_limited': return sc('Too many tries for now. Wait a few minutes, then try again.');
      case 'unavailable': return sc("Couldn't reach Jotbun. Check your connection and try again.");
      case 'failed': return tc("Sign-in didn't finish. Try again.");
      default: return null;
    }
  };

  const send = async (to: string) => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setProblem(null);
    let outcome: CodeOutcome;
    try {
      outcome = await provider.sendEmailCode(to);
    } catch {
      outcome = 'failed';
    }
    busy.current = false;
    if (!mounted.current) return;
    setSending(false);
    if (outcome !== 'sent') {
      setProblem(sendProblem(outcome));
      return;
    }
    setSentTo(to);
    setCode('');
    setWait(RESEND_SECONDS);
  };

  const check = async (to: string, digits: string) => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    setProblem(null);
    let outcome: SignInResult | FreshOutcome;
    try {
      outcome = mode === 'fresh'
        ? await provider.freshSignIn({ method: 'email', email: to, code: digits })
        : await provider.signIn({ method: 'email', email: to, code: digits });
    } catch {
      outcome = mode === 'fresh' ? 'failed' : FAILED;
    }
    busy.current = false;
    if (!mounted.current) return;
    setChecking(false);
    const kept = codeProblem(typeof outcome === 'string' ? outcome : outcome.outcome);
    if (kept === null) {
      onDone(outcome);
      return;
    }
    setCode('');
    setProblem(kept);
  };

  const onCode = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH && sentTo !== null) void check(sentTo, digits);
  };

  const changeEmail = () => {
    setSentTo(null);
    setCode('');
    setWait(0);
    setProblem(null);
  };

  const otherWay = problem && onOtherWay ? <TextButton label={sc('Use another way')} onPress={onOtherWay} /> : null;

  if (sentTo === null) {
    const ready = fixed !== null || ADDRESS.test(address);
    return (
      <View testID="email-code-address-step" style={{ gap: BUN_SPACE.md }}>
        {fixed !== null ? (
          <View style={{ gap: BUN_SPACE.xxs }}>
            <BunText>{sc("We'll send a 6-digit code to")}</BunText>
            <BunText testID="email-code-address" style={{ fontWeight: '700' }}>{maskEmail(fixed)}</BunText>
          </View>
        ) : (
          <>
            <BunText variant="heading" role="heading" accessibilityRole="header">{sc('Sign in or create an account')}</BunText>
            <BunText>{tc("If you already have an account, we'll sign you in")}</BunText>
            <TextInput
              testID="email-code-email"
              maxFontSizeMultiplier={BUN_MAX_FONT_SCALE.body}
              accessibilityLabel={sc('Email address')}
              value={typed}
              onChangeText={setTyped}
              editable={!sending}
              keyboardType="email-address"
              inputMode="email"
              textContentType="emailAddress"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              placeholderTextColor={colors.muted}
              style={{
                ...bunText('body', script),
                color: colors.ink,
                minHeight: BUN_TOUCH,
                paddingHorizontal: BUN_SPACE.sm,
                paddingVertical: BUN_SPACE.xs,
                borderRadius: BUN_RADIUS.chip,
                borderColor: colors.ink,
                borderWidth: BUN_OUTLINE.control,
                backgroundColor: colors.card,
              }}
            />
          </>
        )}
        <PillButton
          testID="email-code-send"
          label={sc('Send the code')}
          busy={sending}
          busyLabel={sc('Sending…')}
          disabled={!ready}
          disabledReason={sc('Type your email address first.')}
          onPress={() => void send(target)}
        />
        {problem ? <FailureNote text={problem} /> : null}
        {otherWay}
      </View>
    );
  }

  return (
    <View testID="email-code-code-step" style={{ gap: BUN_SPACE.md }}>
      <View style={{ gap: BUN_SPACE.xxs }}>
        <BunText variant="heading" role="heading" accessibilityRole="header">{sc('Enter the 6-digit code sent to')}</BunText>
        <BunText testID="email-code-address" variant="label" style={{ fontWeight: '700' }}>{maskEmail(sentTo)}</BunText>
      </View>
      <BunText tone="muted">{sc('The code works for 10 minutes. No email? Look in your spam folder.')}</BunText>
      <TextInput
        testID="email-code-field"
        maxFontSizeMultiplier={BUN_MAX_FONT_SCALE.hero}
        accessibilityLabel={sc('6-digit code')}
        value={code}
        onChangeText={onCode}
        editable={!checking}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={CODE_LENGTH}
        style={{
          ...bunText('hero', 'latin'),
          color: colors.ink,
          letterSpacing: BUN_SPACE.sm,
          textAlign: 'center',
          minHeight: BUN_TOUCH + BUN_SPACE.md,
          paddingHorizontal: BUN_SPACE.sm,
          borderRadius: BUN_RADIUS.chip,
          borderColor: colors.ink,
          borderWidth: BUN_OUTLINE.card,
          backgroundColor: colors.card,
          fontVariant: ['tabular-nums'],
        }}
      />
      {checking ? (
        <View {...POLITE_LIVE_REGION}>
          <BunText>{tc('Signing in…')}</BunText>
        </View>
      ) : null}
      {problem ? <FailureNote text={problem} /> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: BUN_SPACE.xs }}>
        <TextButton
          testID="email-code-resend"
          label={wait > 0 ? `${sc('Send a new code in')} ${clock(wait)}` : sc('Send a new code')}
          disabled={wait > 0 || sending || checking}
          onPress={() => void send(sentTo)}
        />
        {fixed === null ? <TextButton label={sc('Change email')} onPress={changeEmail} /> : null}
      </View>
      {otherWay}
    </View>
  );
}

export function EmailCodeScreen({ provider, mode, fixedEmail, onDone, onBack }: EmailCodeScreenProps) {
  const sc = useSigninCopy();
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  return (
    <View testID="email-code-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + BUN_SPACE.lg }} keyboardShouldPersistTaps="handled">
        <StageHeader back={{ onPress: onBack }} title={mode === 'fresh' ? sc("Confirm it's you") : sc('Sign in with email')} />
        <View style={{ padding: BUN_SPACE.md }}>
          <EmailCodeForm provider={provider} mode={mode} fixedEmail={fixedEmail} onDone={onDone} onOtherWay={onBack} />
        </View>
      </ScrollView>
    </View>
  );
}
