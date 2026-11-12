// Settings for the companion area (premium plan D15/D16): Bun's AI help and
// GoGoCash cashback tips, each a plain On/Off with what it means underneath.
// Turning AI help on always goes through the consent sheet; turning it off
// is immediate. Cashback tips never send anything: the phone does the
// matching against GoGoCash's public list of shops.
//
// P3-T14: turning AI help on (through the sheet) and off goes through
// useAiConsentChange, so each change the server takes sends one
// ai_consent_changed; nothing else shows differently. With `showAi` false
// (Settings while the Bun AI area is on, where AI help lives at /settings/ai)
// only the cashback tips switch shows.
import { useState } from 'react';
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { BunText } from '@mobile/ui/BunText';
import { BUN_SPACE } from '@mobile/ui/layout';
import { useAiConsentChange } from '@mobile/wallet/bunai/aiConsent';

import { AiConsentSheet } from '../ai/AiConsentSheet';
import { ChoiceGroup, Section } from './SettingsParts';

type OnOff = 'on' | 'off';

export function CompanionSettings({ showAi = true }: { showAi?: boolean } = {}) {
  const tc = useCopy();
  const { preferences, enabled, update } = useAiCompanion();
  const { turnOff } = useAiConsentChange();
  const [consenting, setConsenting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function change(run: () => Promise<unknown>) {
    setProblem(null);
    try {
      await run();
      playHaptic('saveLanded');
    } catch {
      playHaptic('saveFailed');
      setProblem(tc("This couldn't be changed right now. Try again when you're online."));
    }
  }

  const aiValue: OnOff = enabled || preferences?.companion ? 'on' : 'off';
  const onAi = (next: OnOff) => {
    if (next === 'on') setConsenting(true);
    else void change(turnOff);
  };
  const tipsValue: OnOff = preferences?.cashback_tips ? 'on' : 'off';
  const onTips = (next: OnOff) => void change(() => update({ cashback_tips: next === 'on' }));

  const aiLabel = tc("Bun's AI help");
  const tipsLabel = tc('Cashback tips');
  const remaining = preferences?.remaining;
  return (
    <>
      {showAi ? (
        <Section title={aiLabel}>
          <ChoiceGroup
            label={aiLabel}
            value={aiValue}
            onChange={onAi}
            choices={[
              { value: 'on', label: tc('On'), description: tc('Tell Bun, slip reading, a daily note and Ask Bun. Bun reads only what each task needs.') },
              { value: 'off', label: tc('Off'), description: tc('Bun still reads sentences on your phone and writes notes from your numbers.') },
            ]}
          />
          {enabled && remaining ? (
            <BunText variant="caption" tone="muted">
              {tc('Left today: {parse} sentences, {slip} slips, {ask} questions.', { parse: remaining.parse, slip: remaining.slip, ask: remaining.ask })}
            </BunText>
          ) : null}
          {preferences && !preferences.available ? <BunText variant="caption" tone="muted">{tc("Bun's AI help is resting right now. Everything else works as usual.")}</BunText> : null}
        </Section>
      ) : null}
      <Section title={tipsLabel}>
        <ChoiceGroup
          label={tipsLabel}
          value={tipsValue}
          onChange={onTips}
          choices={[
            { value: 'on', label: tc('On'), description: tc('Show when a purchase was at a shop where GoGoCash, our sister app, gives cashback. Matching happens on your phone.') },
            { value: 'off', label: tc('Off'), description: tc('No cashback tips.') },
          ]}
        />
      </Section>
      {problem ? (
        <View style={{ paddingHorizontal: BUN_SPACE.md }}>
          <BunText role="alert">{problem}</BunText>
        </View>
      ) : null}
      <AiConsentSheet visible={consenting} onClose={() => setConsenting(false)} />
    </>
  );
}
