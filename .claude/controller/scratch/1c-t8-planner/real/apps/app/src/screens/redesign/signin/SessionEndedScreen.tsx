// 1C-T8: D37's session-ended screen (board es-session-ended), a draft awaiting
// E2, unrouted until 1C-T9 (`/session-ended`, where the layout guards send an
// `ended` session).
//
// - Why: this phone was signed out (unused for long, or signed out from
//   another phone), or the account is unavailable (a variant with no board).
// - The records still waiting on this phone, from the open diary (the caller
//   passes the rows), and the board's lines: they send by themselves after a
//   sign-in, and everything already sent is in the account.
// - The main button names the account's own method (ดำเนินการต่อด้วย Apple);
//   on a build without that method, the email code to the account's address
//   (C14). ใช้วิธีอื่น lists the other methods this build offers. Email opens
//   the code step on this screen.
// - After a sign-in (`afterEndedSignIn`): the same account resumes, and its
//   outbox sends the records; another account never gets them, and when any
//   wait the keep-or-erase choice shows (OtherAccountRecords), where erasing
//   needs its confirmation and runs only when `mayEraseOtherAccount` allows.
//   With nothing waiting nothing is asked (1C-T6's note).
// - A sign-in that does not go through says so calmly, with the
//   records-safe line, and the buttons stay (spec §5.2).
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SignInMethod } from '@mobile/auth/betterAuthPort';
import type { CredentialProvider, SignInResult } from '@mobile/auth/credentialProvider';
import { afterEndedSignIn, mayEraseOtherAccount } from '@mobile/auth/sessionEnded';
import type { OtherAccountChoice, SessionEndedView } from '@mobile/auth/sessionEnded';
import { useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { BUN_OUTLINE, BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { StageHeader } from '@mobile/ui/StageHeader';
import { ActionFooter } from '../ActionFooter';
import { useSigninCopy } from './draftCopy';
import { EmailCodeScreen } from './EmailCodeScreen';
import { OtherAccountRecords } from './OtherAccountRecords';
import { FailureNote, TextButton, useMethodLabels } from './SigninParts';

/** The provider's sign-in, the methods this build offers, and the account (the ended one before a sign-in, the signed-in one after). */
export type SessionEndedProvider = Pick<CredentialProvider, 'signIn' | 'methods' | 'account' | 'sendEmailCode' | 'freshSignIn'>;

/** One unsent record as the diary shows it: its title, when, and its amount, already in words. */
export type UnsentRow = { title: string; at: string; amount: string };

export type SessionEndedScreenProps = {
  view: SessionEndedView;
  unsentRows: readonly UnsentRow[];
  provider: SessionEndedProvider;
  /** Discards that account's diary on this phone (D37's erase, after its confirmation). */
  eraseAccount(accountId: string): Promise<void>;
  /** Signed in again: the same account resumed, or another account after its choice. */
  onResumed(): void;
};

type Phase =
  | { readonly kind: 'ended'; readonly otherWays: boolean }
  | { readonly kind: 'email'; readonly fixedEmail: string | undefined }
  | { readonly kind: 'other_account'; readonly previousAccountId: string; readonly unsent: number };

const FAILED: SignInResult = { outcome: 'failed', methods: [], created: false };

export function SessionEndedScreen({ view, unsentRows, provider, eraseAccount, onResumed }: SessionEndedScreenProps) {
  const sc = useSigninCopy();
  const tc = useCopy();
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const { intensity } = useBunIntensity();
  const labels = useMethodLabels();
  const [phase, setPhase] = useState<Phase>({ kind: 'ended', otherWays: false });
  const [busy, setBusy] = useState<SignInMethod | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The ended account's own address, read once: after a sign-in `account()` names the new one.
  const [endedEmail] = useState(() => {
    const record = provider.account();
    return record !== null && record.accountId === view.accountId ? record.email : null;
  });
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const offered = provider.methods();
  const main: SignInMethod | null = view.method !== null && offered.includes(view.method) ? view.method : offered.includes('email') ? 'email' : null;
  const others = offered.filter((method) => method !== main);

  const settle = (result: SignInResult) => {
    if (result.outcome === 'active') {
      const account = provider.account();
      if (account !== null) {
        const after = afterEndedSignIn(view, account.accountId);
        if (after.kind === 'other_account' && after.unsent > 0) {
          setPhase({ kind: 'other_account', previousAccountId: after.previousAccountId, unsent: after.unsent });
          return;
        }
        onResumed();
        return;
      }
    }
    setPhase((current) => (current.kind === 'ended' ? current : { kind: 'ended', otherWays: false }));
    if (result.outcome === 'cancelled') return;
    setProblem(result.outcome === 'account_unavailable' ? sc("This account can't be used right now.") : tc("Sign-in didn't finish. Try again."));
  };

  const start = async (method: SignInMethod, ownAddress: boolean) => {
    if (running.current) return;
    setProblem(null);
    if (method === 'email') {
      setPhase({ kind: 'email', fixedEmail: ownAddress ? endedEmail ?? undefined : undefined });
      return;
    }
    running.current = true;
    setBusy(method);
    let result: SignInResult;
    try {
      result = await provider.signIn({ method, signUp: false });
    } catch {
      result = FAILED;
    }
    running.current = false;
    if (!mounted.current) return;
    setBusy(null);
    settle(result);
  };

  const choose = async (choice: OtherAccountChoice) => {
    if (phase.kind !== 'other_account') return;
    if (mayEraseOtherAccount(choice)) await eraseAccount(phase.previousAccountId);
    onResumed();
  };

  if (phase.kind === 'email') {
    return (
      <EmailCodeScreen
        provider={provider}
        mode="sign_in"
        fixedEmail={phase.fixedEmail}
        onDone={(outcome) => settle(typeof outcome === 'string' ? FAILED : outcome)}
        onBack={() => setPhase({ kind: 'ended', otherWays: false })}
      />
    );
  }

  const unavailable = view.kind === 'account_unavailable';
  const bun = intensity === 'full' ? <Bun pose="sleepy" size="m" testID="session-ended-bun" /> : undefined;
  const sameAccount = (() => {
    switch (main) {
      case 'apple': return sc('Use the same Apple account, so the records go to the same place.');
      case 'google': return sc('Use the same Google account, so the records go to the same place.');
      case 'email': return sc('Use the same email, so the records go to the same place.');
      default: return sc('Sign in to the same account, so the records go to the same place.');
    }
  })();

  return (
    <View testID="session-ended-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      {/* The footer pads the bottom inset; without it (the keep-or-erase choice) the list does. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: (phase.kind === 'ended' ? 0 : insets.bottom) + BUN_SPACE.lg }}>
        <StageHeader title={unavailable ? sc('This account is not available') : sc('Sign in again')} bun={bun} />
        <View style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          <BunText>
            {unavailable
              ? sc("This account can't be used right now. If you asked to delete it, the deletion is under way.")
              : `${sc('This phone was signed out, maybe because it was not used for a while')}\n${sc('or because it was signed out from another phone')}`}
          </BunText>
          {view.unsent > 0 ? (
            <Card testID="session-ended-unsent" style={{ gap: BUN_SPACE.xs }}>
              <BunText variant="label" style={{ fontWeight: '700' }}>{sc('Records still on this phone: {count}', { count: view.unsent })}</BunText>
              <BunText variant="caption" tone="muted">{sc('Not sent yet. They send by themselves after you sign in.')}</BunText>
              <View role="list" accessibilityLabel={sc('Records waiting to send')} aria-label={sc('Records waiting to send')}>
                {unsentRows.map((row, index) => (
                  <View
                    key={`${index}-${row.title}`}
                    role="listitem"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xs, minHeight: BUN_SPACE.xl + BUN_SPACE.sm, borderTopWidth: BUN_OUTLINE.rule, borderTopColor: colors.rule }}
                  >
                    <BunText style={{ flex: 1 }}>{row.title}</BunText>
                    <BunText variant="caption" tone="muted">{row.at}</BunText>
                    <BunText style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{row.amount}</BunText>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}
          {phase.kind === 'other_account' ? (
            <OtherAccountRecords unsent={phase.unsent} onChoice={choose} />
          ) : (
            <>
              <BunText>{sc('Everything you already sent is in your account.')}</BunText>
              <BunText tone="muted">{sameAccount}</BunText>
              {problem ? <FailureNote text={problem} /> : null}
            </>
          )}
        </View>
      </ScrollView>
      {phase.kind === 'ended' ? (
        <ActionFooter testID="session-ended-footer">
          {main !== null ? (
            <PillButton
              testID="session-ended-main"
              label={labels[main]}
              busy={busy === main}
              busyLabel={tc('Signing in…')}
              disabled={busy !== null && busy !== main}
              onPress={() => void start(main, true)}
            />
          ) : null}
          {phase.otherWays
            ? others.map((method) => (
              <PillButton
                key={method}
                kind="secondary"
                label={labels[method]}
                busy={busy === method}
                busyLabel={tc('Signing in…')}
                disabled={busy !== null && busy !== method}
                onPress={() => void start(method, false)}
              />
            ))
            : others.length > 0 ? <TextButton label={sc('Use another way')} onPress={() => setPhase({ kind: 'ended', otherWays: true })} /> : null}
        </ActionFooter>
      ) : null}
    </View>
  );
}
