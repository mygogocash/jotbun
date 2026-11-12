// Bun's AI help, on and off (P3-T14), one way for every surface that changes
// it: the wallet's consent tray and AI settings, and today's CompanionSettings
// and AiConsentSheet. On sends the current notice (AI_NOTICE_VERSION); off
// sends companion false. Only once the server has taken the change does the
// common ai_enabled take the new answer, by AiCompanionProvider's own rule
// (Bun's help is on and the service is answering, so later events agree with
// it), and then one ai_consent_changed goes out (P3-T5's emitter, which
// carries nothing else). A change the server never took sends nothing and
// rethrows: saying so is the caller's.
//
// The daily note's switch lives here too (default pending owner Q7: on). It
// is kept on this phone, as jotbun.wallet.daily-note, so the sign-out erase
// forgets it; P3-T21's Home reads it from here without loading the settings
// screen. A choice that cannot be stored still applies while the screen is
// open, as the bun intensity and haptics settings do.
import { AI_NOTICE_VERSION } from '@gogospend/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getAnalytics } from '@mobile/analytics/bus';
import { trackAiConsentChanged } from '@mobile/analytics/events';
import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { walletDeviceStore } from '../store/deviceWalletStore';

export type AiConsentChange = {
  turnOn(): Promise<void>;
  turnOff(): Promise<void>;
  /** A change is waiting for the server. */
  busy: boolean;
};

export function useAiConsentChange(): AiConsentChange {
  const { update } = useAiCompanion();
  const [busy, setBusy] = useState(false);
  const change = useCallback(async (on: boolean) => {
    setBusy(true);
    try {
      const saved = await update(on ? { companion: true, notice_version: AI_NOTICE_VERSION } : { companion: false });
      getAnalytics()?.setCommon({ ai_enabled: saved.companion && saved.available });
      trackAiConsentChanged();
    } finally {
      setBusy(false);
    }
  }, [update]);
  const turnOn = useCallback(() => change(true), [change]);
  const turnOff = useCallback(() => change(false), [change]);
  return { turnOn, turnOff, busy };
}

/** The device store's name: `jotbun.wallet.daily-note`, `'on'` or `'off'`. Anything else, or nothing, reads as on (Q7). */
export const DAILY_NOTE_NAME = 'daily-note';

export type DailyNoteSetting = {
  on: boolean;
  /** The stored answer has been read (or could not be). */
  ready: boolean;
  set(on: boolean): Promise<void>;
};

export function useDailyNoteSetting(): DailyNoteSetting {
  const [on, setOn] = useState(true);
  const [ready, setReady] = useState(false);
  // A choice made before the store answers wins over the stored one.
  const chosen = useRef(false);
  useEffect(() => {
    let active = true;
    // A store that cannot be read keeps the default.
    void walletDeviceStore().get(DAILY_NOTE_NAME).catch(() => null).then((stored) => {
      if (!active) return;
      if (!chosen.current) setOn(stored !== 'off');
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  const set = useCallback(async (next: boolean) => {
    chosen.current = true;
    setOn(next);
    setReady(true);
    await walletDeviceStore().set(DAILY_NOTE_NAME, next ? 'on' : 'off').catch(() => undefined);
  }, []);
  return { on, ready, set };
}
