// 1C-T8: the terms step (K24, A11; board sa-terms in today's kit), a draft
// awaiting E2, shown by TermsGate in place of the screens while required
// policy versions are pending.
//
// - The board's title and line, and its three promises as a PromiseList,
//   each row the promise's title, a line break, then its line.
// - Today's TermsCheckbox, unticked, with the board's sentence; under it the
//   two policy names, each opening today's Sheet with that kind's published
//   text in the active language (English for Vietnamese).
// - ดำเนินการต่อ, the one main button, disabled until the box is ticked (its
//   reason is today's words): it accepts exactly the pending versions once
//   (`acceptPending`), then `onAccepted`. A failure keeps the screen and the
//   tick, with a calm line.
// - Settings, which no gate covers, so export, deletion and sign-out never
//   wait on new terms (K24).
// The board's back button and its "อ่านฉบับเต็ม…" line wait for P6B-T7's
// Privacy row, which makes that line true. P6B-T7 moves these rules into
// `useTermsAcceptance`.
import type { PolicyKind } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { acceptPending } from '@mobile/spend/v1/policies';
import type { PendingPolicy, PolicyClient } from '@mobile/spend/v1/policies';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { PromiseList } from '@mobile/ui/PromiseList';
import { Sheet } from '@mobile/ui/Sheet';
import { StageHeader } from '@mobile/ui/StageHeader';
import { ActionFooter } from '../ActionFooter';
import { TermsCheckbox } from '../account/SignInParts';
import { useSigninCopy } from './draftCopy';
import { FailureNote } from './SigninParts';

export type TermsScreenProps = { pending: readonly PendingPolicy[]; client: PolicyClient; onAccepted(): void };

type Reading = { readonly kind: PolicyKind; readonly text: string | null; readonly failed: boolean };

/** One policy's published text, in the active language, in today's Sheet. */
function PolicySheet({ kind, client, onClose }: { kind: PolicyKind | null; client: PolicyClient; onClose: () => void }) {
  const sc = useSigninCopy();
  const locale = useActiveLocale();
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    if (kind === null) return undefined;
    let live = true;
    setReading({ kind, text: null, failed: false });
    client.published().then(
      (policies) => {
        if (!live) return;
        const found = policies.find((policy) => policy.kind === kind);
        setReading({ kind, text: found ? (locale === 'th' ? found.text.th : found.text.en) : null, failed: !found });
      },
      () => {
        if (live) setReading({ kind, text: null, failed: true });
      },
    );
    return () => { live = false; };
  }, [kind, client, locale]);

  const title = kind === 'privacy' ? sc('Privacy Policy') : sc('Terms of Service');
  const shown = reading !== null && reading.kind === kind ? reading : null;
  return (
    <Sheet visible={kind !== null} onClose={onClose} title={title}>
      {shown === null || (shown.text === null && !shown.failed) ? <BunText tone="muted">{sc('Loading…')}</BunText> : null}
      {shown?.failed ? <FailureNote text={sc("Couldn't load this text. Try again later.")} /> : null}
      {shown?.text ? <BunText testID="terms-policy-text">{shown.text}</BunText> : null}
    </Sheet>
  );
}

export function TermsScreen({ pending, client, onAccepted }: TermsScreenProps) {
  const sc = useSigninCopy();
  const tc = useCopy();
  const router = useRouter();
  const colors = useBunColors();
  const [ticked, setTicked] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reading, setReading] = useState<PolicyKind | null>(null);
  // Accepted once, however fast ดำเนินการต่อ is pressed.
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const accept = async () => {
    if (!ticked || running.current) return;
    running.current = true;
    setAccepting(true);
    setFailed(false);
    try {
      await acceptPending(client, pending);
    } catch {
      running.current = false;
      if (!mounted.current) return;
      setAccepting(false);
      setFailed(true);
      return;
    }
    if (mounted.current) onAccepted();
  };

  const promises = [
    { key: 'no-bank', text: `${sc('No bank connection')}\n${sc('Jotbun never connects to your bank. You write down every record yourself.')}` },
    { key: 'never-sold', text: `${sc('We never sell your data')}\n${sc('Your records are never sold to anyone, whether a bank, a shop or one of our sister apps.')}` },
    { key: 'no-ads', text: `${sc('No ads')}\n${sc('No ads at all. The screen shows only your numbers.')}` },
  ];

  return (
    <View testID="terms-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.lg }}>
        <StageHeader title={sc('Our promises')} subtitle={sc('Three things Jotbun always does for you')} />
        <View style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          <PromiseList items={promises} />
          <TermsCheckbox label={sc('I accept the Jotbun Terms of Service and Privacy Policy')} checked={ticked} onToggle={() => setTicked((now) => !now)} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
            <PillButton testID="terms-open-terms" kind="secondary" label={sc('Terms of Service')} onPress={() => setReading('terms')} />
            <PillButton testID="terms-open-privacy" kind="secondary" label={sc('Privacy Policy')} onPress={() => setReading('privacy')} />
          </View>
          {failed ? <FailureNote text={sc("Couldn't save your answer. Check your connection and try again.")} /> : null}
        </View>
      </ScrollView>
      <ActionFooter testID="terms-footer">
        <PillButton
          label={tc('Continue')}
          disabled={!ticked}
          disabledReason={tc('Tick the box to agree to the terms first.')}
          busy={accepting}
          busyLabel={tc('Saving…')}
          onPress={() => void accept()}
        />
        <PillButton kind="secondary" label={tc('Settings')} onPress={() => router.push('/settings')} />
      </ActionFooter>
      <PolicySheet kind={reading} client={client} onClose={() => setReading(null)} />
    </View>
  );
}
