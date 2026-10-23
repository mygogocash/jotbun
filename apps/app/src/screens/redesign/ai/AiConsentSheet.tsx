// Turning on Bun's AI help (premium plan D15): consent at the moment of
// action, in plain promises, as the trust screens do. What is sent, what is
// never sent, who reads it, and that it can be turned off. Nothing is sent
// until the person agrees; "Not now" changes nothing.
import { AI_NOTICE_VERSION } from '@gogospend/contracts';
import { useState } from 'react';
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { Bun } from '@mobile/mascot/Bun';
import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { BunText } from '@mobile/ui/BunText';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { PromiseList } from '@mobile/ui/PromiseList';
import { Sheet } from '@mobile/ui/Sheet';

export type AiConsentSheetProps = {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** Called once Bun's help is on. */
  readonly onAgreed?: () => void;
};

export function AiConsentSheet({ visible, onClose, onAgreed }: AiConsentSheetProps) {
  const tc = useCopy();
  const { update } = useAiCompanion();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const promises = [
    { key: 'what', text: tc('Bun reads only what one task needs: the sentence you type or the slip you choose, with the names of your wallets and categories.') },
    { key: 'totals', text: tc('For your daily note and your questions, Bun reads totals from your own diary.') },
    { key: 'never', text: tc('Your name, email and account are never sent, and slip images are never kept.') },
    { key: 'who', text: tc("Anthropic's Claude does the reading. Nothing you send is used to train it.") },
    { key: 'advice', text: tc('Bun explains your own numbers. It never advises on loans, investments or other financial products.') },
    { key: 'mistakes', text: tc("Bun can get things wrong, so you always check an entry before it's saved.") },
    { key: 'off', text: tc('You can turn it off at any time in Settings.') },
  ];

  async function agree() {
    setBusy(true);
    setProblem(null);
    try {
      await update({ companion: true, notice_version: AI_NOTICE_VERSION });
      playHaptic('saveLanded');
      onAgreed?.();
      onClose();
    } catch {
      playHaptic('saveFailed');
      setProblem(tc("Bun's help couldn't be turned on right now. Try again when you're online."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={tc("Turn on Bun's help?")}>
      <View style={{ gap: BUN_SPACE.md }}>
        <View style={{ alignItems: 'center' }}>
          <Bun pose="holding-receipt" size="m" />
        </View>
        <BunText>{tc('Bun can turn a sentence or a bank slip into an entry for you to check, write you a short note each day, and answer questions about your spending.')}</BunText>
        <PromiseList items={promises} />
        {problem ? <BunText role="alert" tone="ink">{problem}</BunText> : null}
        <PillButton label={tc("Turn on Bun's help")} onPress={() => void agree()} busy={busy} busyLabel={tc('Turning on…')} />
        <PillButton kind="secondary" label={tc('Not now')} onPress={onClose} disabled={busy} />
      </View>
    </Sheet>
  );
}
