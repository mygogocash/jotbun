// Bun's AI consent in a tray (P3-T14, ai-consent): AiConsentContent in P2-T13's
// Tray, named ตัวช่วย AI ของบัน, or สิ่งที่ AI เห็น when read-only. เปิดใช้
// turns Bun's help on through useAiConsentChange; once the server has taken
// it, the phone confirms with a tap, onAgreed fires and the tray closes. A
// turn-on the server never took plays the failure tap, says so
// (bunai.consentFailed) and stays open with Bun's help off, so เปิดใช้ is
// Try again; opened again later, the tray starts without that line. While it
// waits, nothing closes the tray (Tray's `locked`). อ่านรายละเอียด closes the
// tray and opens Privacy and data once it has gone (R69).
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { playHaptic } from '@mobile/lib/hapticMoment';
import { Tray } from '../tray/Tray';
import { AiConsentContent } from './AiConsentContent';
import { useAiConsentChange } from './aiConsent';
import { BUNAI_DRAFTS } from './drafts';
import { useBunAiCopy } from './useBunAiCopy';

export type AiConsentTrayProps = {
  visible: boolean;
  onClose(): void;
  /** Once the tray has gone (R69). */
  onClosed?(): void;
  /** Once Bun's help is on. */
  onAgreed?(): void;
  /** สิ่งที่ AI เห็น: the same lines, with no answer to give. */
  readOnly?: boolean;
};

export function AiConsentTray({ visible, onClose, onClosed, onAgreed, readOnly = false }: AiConsentTrayProps) {
  const t = useBunAiCopy(BUNAI_DRAFTS);
  const router = useRouter();
  const { turnOn, busy } = useAiConsentChange();
  const [problem, setProblem] = useState<string | null>(null);
  // A tray opened again starts without the last failure's line.
  const [opened, setOpened] = useState(visible);
  if (visible !== opened) {
    setOpened(visible);
    if (visible) setProblem(null);
  }
  // Privacy and data opens once the tray has gone.
  const detailsNext = useRef(false);

  const agree = async () => {
    setProblem(null);
    try {
      await turnOn();
    } catch {
      playHaptic('saveFailed');
      setProblem(t('bunai.consentFailed'));
      return;
    }
    playHaptic('saveLanded');
    onAgreed?.();
    onClose();
  };

  const details = () => {
    detailsNext.current = true;
    onClose();
  };

  const closed = () => {
    if (detailsNext.current) {
      detailsNext.current = false;
      router.push('/settings/privacy');
    }
    onClosed?.();
  };

  return (
    <Tray
      testID="ai-consent-tray"
      visible={visible}
      onClose={onClose}
      onClosed={closed}
      title={t(readOnly ? 'bunai.whatAiSees' : 'bunai.consentTitle')}
      locked={busy}
    >
      <AiConsentContent onAgree={() => void agree()} onNotNow={onClose} onDetails={details} busy={busy} problem={problem} readOnly={readOnly} />
    </Tray>
  );
}
