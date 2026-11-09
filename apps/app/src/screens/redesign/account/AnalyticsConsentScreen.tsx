// 1D-T8: D34's analytics question (spec §7), a draft awaiting E2 (decided, Q4,
// Q9 and Q10; there is no board). The spend layout shows it in place of the
// screens while the `analytics` area is on and this account was never asked.
//
// - One clear yes or no, not pre-ticked: two buttons of equal weight, both
//   secondary, the same size, neither chosen. This departs from §5.1's single
//   black main button on purpose, so the answer is not nudged.
// - What is shared, that recordings hide every word and picture, what is
//   never sent, and where the answer can be changed.
// - No is in force at the call (the controller stops capture and stores it),
//   so the layout leaves the question without waiting for the server, and No
//   stays open while a yes is on its way. Yes waits for the server: the layout
//   leaves once it is saved, and a failure keeps the question with a calm line
//   and both buttons. A yes refused because the account changed asks again,
//   with no line (1D-T6's AccountChangedError).
// - Each showing tracks `onboarding_step_viewed` once: held until the answer,
//   sent only on yes.
import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { AccountChangedError } from '@mobile/analytics/controller';
import { trackOnboardingStepViewed } from '@mobile/analytics/events';
import { useAnalyticsConsent } from '@mobile/analytics/useAnalyticsConsent';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { StageHeader } from '@mobile/ui/StageHeader';
import { ActionFooter } from '../ActionFooter';
import { Notice } from '../HistoryParts';
import { useConsentCopy } from './analyticsConsentCopy.draft';

export function AnalyticsConsentScreen() {
  const cc = useConsentCopy();
  const colors = useBunColors();
  const { answer } = useAnalyticsConsent();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  // One yes on its way at a time, however fast it is pressed.
  const sending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    trackOnboardingStepViewed({ step: 'analytics_consent' });
  }, []);

  const yes = async () => {
    if (sending.current) return;
    sending.current = true;
    setSaving(true);
    setFailed(false);
    let failure = false;
    try {
      await answer('yes');
    } catch (error) {
      // Nothing failed when the account changed first: the question asks again.
      failure = !(error instanceof AccountChangedError);
    }
    sending.current = false;
    if (!mounted.current) return;
    setSaving(false);
    setFailed(failure);
  };

  // In force at the call. A rejection (this phone's store) leaves the no in force too.
  const no = () => {
    answer('no').catch(() => undefined);
  };

  return (
    <View testID="analytics-consent-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.lg }}>
        <StageHeader title={cc('title')} />
        <View style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          <BunText>{cc('body')}</BunText>
          <BunText>{cc('replay')}</BunText>
          <BunText style={{ fontWeight: '700' }}>{cc('never')}</BunText>
          <BunText tone="muted">{cc('later')}</BunText>
        </View>
      </ScrollView>
      <ActionFooter testID="analytics-consent-footer">
        {failed ? (
          <View testID="analytics-consent-failed">
            <Notice message={cc('saveFailed')} />
          </View>
        ) : null}
        <PillButton testID="analytics-consent-yes" kind="secondary" label={cc('yes')} busy={saving} onPress={() => void yes()} />
        <PillButton testID="analytics-consent-no" kind="secondary" label={cc('no')} onPress={no} />
      </ActionFooter>
    </View>
  );
}
