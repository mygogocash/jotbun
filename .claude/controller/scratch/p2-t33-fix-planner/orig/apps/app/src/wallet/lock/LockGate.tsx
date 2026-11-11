// The Face ID lock's gate (P2-T33, W18, R63, R67). WalletRoot mounts it while
// the `wallet` area is on, outside private mode, so nothing that shows an
// amount renders above it. It keeps the lock's device setting
// (`jotbun.wallet.lock`), follows AppState through lockReducer, and asks the
// phone through its port (getAppLocalAuth(): noLocalAuth until P2-T34).
//
// - Until the setting is read the app is covered, so a person who turned the
//   lock on never sees a frame of it at launch. A setting that cannot be read
//   counts as on: a broken store never opens the app.
// - Covered or locked, the app stays mounted (drafts and sync carry on) but no
//   screen reader reaches it, and LockCoverContext says hidden, so every Tray
//   and Sheet draws LockCoverArt in place of its content (R63).
// - Locked, the cover also carries LockedScreen. A Modal draws above the app's
//   root and iOS presents no Modal over one that is up, so the lock screen is
//   in every cover: the gate's own, over the app, and an open tray's or
//   sheet's, inside its Modal. The topmost one is the one a person sees and
//   presses (P2-T13's review, m1).
// - Each opening of the app with the lock on (a cold start, every return from
//   the background) asks the phone once by itself, when the app is in front.
//   `inactive` (the prompt itself) asks nothing, so the scan cannot loop, and
//   an answer to an earlier opening is dropped.
// - The answers (R67): success unlocks; cancelled and failed stay locked and
//   say lock.tryAgain; lockout says lock.lockout; unavailable reads the phone
//   again first: still able to lock, it stays locked with lock.tryAgain; no
//   longer able, the lock turns itself off, unlocks and says lock.turnedOff
//   once. A prompt that throws counts as failed and a phone that cannot be
//   read as still able, so a broken port never opens the app. iOS hears each
//   note once from here, since every cover draws the locked screen.
// - Under the cover Android's back does nothing: it would pop a screen, and
//   the draft on it, under the lock (a tray and a sheet already ignore it).
// - LockSettingContext serves the setup screen and the Settings row: the lock
//   goes on only on a phone that can lock, turning it on and off each asks the
//   phone first, and either keeps lock-answered.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState, BackHandler, Platform, Pressable, View } from 'react-native';
import { IntlContext } from 'react-intl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isSupportedLocale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { announcePolitely, POLITE_LIVE_REGION } from '@mobile/ui/a11y';
import { LockCoverArt, LockCoverContext } from '@mobile/ui/lockCover';
import type { LockCover } from '@mobile/ui/lockCover';
import { COMMON_COPY } from '../common/copy';
import { tableT } from '../copy/draftText';
import { walletDeviceStore } from '../store/deviceWalletStore';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import type { LocalAuthPort } from './localAuthPort';
import { LockedScreen } from './LockedScreen';
import type { AuthResult, LockAvailability, LockEvent, LockNote, LockView } from './lockModel';
import { afterAnswer, afterRecheck, appStateEvent, LOCK_ANSWERED_NAME, LOCK_NAME, lockReducer, METHOD_KEYS, namedMethod, UNLOCKED } from './lockModel';

/** What the setup screen and the Settings row read, and ask. */
export type LockSetting = {
  /** The stored setting has been read. */
  readonly ready: boolean;
  /** The lock is on. */
  readonly enabled: boolean;
  /** What the phone can do; null until it has answered. */
  readonly availability: LockAvailability | null;
  /** A prompt is up: nothing else asks until it answers. */
  readonly busy: boolean;
  /** Asks the phone first; on success turns the lock on or off and keeps lock-answered. */
  readonly change: (on: boolean) => Promise<void>;
  /** Keeps lock-answered, the lock left as it is (the setup step's next). */
  readonly answer: () => void;
  /** Reads what the phone can do again. */
  readonly recheck: () => void;
};

/** Outside a gate (a part drawn on its own): the lock is off and the phone cannot lock. */
const OUTSIDE: LockSetting = {
  ready: true,
  enabled: false,
  availability: { canLock: false, method: null },
  busy: false,
  change: async () => undefined,
  answer: () => undefined,
  recheck: () => undefined,
};

export const LockSettingContext = createContext<LockSetting>(OUTSIDE);

/** The lock's setting as the nearest gate holds it; outside one, off on a phone that cannot lock. */
export function useLockSetting(): LockSetting {
  return useContext(LockSettingContext);
}

/** The app below while it is hidden: no screen reader reaches it. */
const UNSEEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants', 'aria-hidden': true } as const;
const SEEN = { accessibilityElementsHidden: false, importantForAccessibility: 'auto' } as const;

type Setting = { readonly ready: boolean; readonly enabled: boolean };
const UNREAD: Setting = { ready: false, enabled: false };

const LOCK_COPY = { ...COMMON_COPY, ...COPY };

/** Says once, over the app, that the lock turned itself off (R67), until the person closes it. */
function TurnedOffNotice({ text, close, onClose }: { text: string; close: string; onClose: () => void }) {
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="lock-turned-off"
      {...POLITE_LIVE_REGION}
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 8,
        right: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 16,
        paddingRight: 4,
        paddingVertical: 4,
        borderRadius: 18,
        backgroundColor: colors.toast,
      }}
    >
      <WalletText role="label" tone="onToast" style={{ flex: 1, paddingVertical: 8 }}>{text}</WalletText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={close}
        onPress={onClose}
        style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}
      >
        <WalletText role="label" style={{ color: colors.toastLink, fontWeight: '700' }}>{close}</WalletText>
      </Pressable>
    </View>
  );
}

export function LockGate({ port, children }: { port: LocalAuthPort; children: ReactNode }) {
  // The app's language, read without useIntl's throw, as PrivateModeProvider reads it.
  const appLocale = (useContext(IntlContext) as { locale?: string } | null)?.locale;
  const locale = isSupportedLocale(appLocale) ? appLocale : 'en';
  const t = useMemo(() => tableT(LOCK_COPY, locale), [locale]);
  const cancel = translateCopy('Cancel', locale);

  const [setting, setSetting] = useState<Setting>(UNREAD);
  const [view, setView] = useState<LockView>(UNLOCKED);
  const [phone, setPhone] = useState<LockAvailability | null>(null);
  const [note, setNote] = useState<LockNote | null>(null);
  const [turnedOff, setTurnedOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [front, setFront] = useState(() => AppState.currentState === 'active');

  // What the rules read between renders.
  const enabled = useRef(false);
  const known = useRef<LockAvailability | null>(null);
  const asking = useRef(false);
  // Each opening with the lock on is asked once, by itself; an answer to an earlier opening is dropped.
  const opening = useRef(0);
  const asked = useRef(0);

  const dispatch = useCallback((event: LockEvent) => {
    const on = enabled.current;
    if (on && (event.type === 'start' || event.type === 'background')) {
      opening.current += 1;
      setNote(null);
    }
    setView((current) => lockReducer(current, event, on));
  }, []);

  // The setting, once. React's development double run drops the first run's late read.
  useEffect(() => {
    let live = true;
    void walletDeviceStore()
      .get(LOCK_NAME)
      .then((value) => value === '1', () => true)
      .then((on) => {
        if (!live) return;
        enabled.current = on;
        setSetting({ ready: true, enabled: on });
        dispatch({ type: 'start' });
      });
    return () => {
      live = false;
    };
  }, [dispatch]);

  /** What the phone can do, read again each time; null when it cannot be read. */
  const readPhone = useCallback(async (): Promise<LockAvailability | null> => {
    try {
      const { canLock, method } = await port.availability();
      const answer = { canLock, method };
      known.current = answer;
      setPhone(answer);
      return answer;
    } catch {
      return null;
    }
  }, [port]);

  useEffect(() => {
    void readPhone();
  }, [readPhone]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      setFront(status === 'active');
      const event = appStateEvent(status);
      if (event === null) return;
      dispatch(event);
      // Back in front: a passcode may have been set or taken away while the app was away.
      if (event.type === 'active') void readPhone();
    });
    return () => subscription?.remove();
  }, [dispatch, readPhone]);

  const prompt = useCallback(async (words: string): Promise<AuthResult> => {
    try {
      return await port.authenticate({ prompt: words, cancel, fallback: t('lock.usePasscode') });
    } catch {
      return 'failed';
    }
  }, [port, cancel, t]);

  /** R67: the phone can no longer lock, so the lock turns itself off, unlocks and says so once. */
  const turnOff = useCallback(() => {
    enabled.current = false;
    setSetting({ ready: true, enabled: false });
    void walletDeviceStore().remove(LOCK_NAME).catch(() => undefined);
    dispatch({ type: 'disabled' });
    setTurnedOff(true);
    announcePolitely(t('lock.turnedOff'));
  }, [dispatch, t]);

  /** Asks the phone to unlock: once by itself for each opening, and again from the locked screen. */
  const unlock = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    setBusy(true);
    const at = opening.current;
    const answer = afterAnswer(await prompt(t(METHOD_KEYS[namedMethod(known.current)].line)));
    const then = answer.step === 'recheck' ? afterRecheck(await readPhone()) : answer;
    asking.current = false;
    setBusy(false);
    if (at !== opening.current) return;
    if (then.step === 'turnOff') {
      turnOff();
    } else if (then.step === 'unlock') {
      dispatch({ type: 'unlocked' });
    } else {
      setNote(then.note);
      announcePolitely(t(then.note));
    }
  }, [prompt, readPhone, turnOff, dispatch, t]);

  useEffect(() => {
    if (!view.locked || !front || asked.current === opening.current) return;
    asked.current = opening.current;
    void unlock();
  }, [view.locked, front, unlock]);

  const change = useCallback(async (on: boolean) => {
    if (asking.current || on === enabled.current) return;
    // The lock goes on only on a phone that has said it can lock (R67).
    if (on && known.current?.canLock !== true) return;
    asking.current = true;
    setBusy(true);
    const result = await prompt(t('lock.switch', { method: t(METHOD_KEYS[namedMethod(known.current)].name) }));
    // An unavailable answer reads the phone again; a lock that is on, on a phone that can no longer lock, turns itself off.
    const gone = result === 'unavailable' && afterRecheck(await readPhone()).step === 'turnOff' && enabled.current;
    asking.current = false;
    setBusy(false);
    if (gone) {
      turnOff();
      return;
    }
    if (result !== 'success') return;
    enabled.current = on;
    setSetting({ ready: true, enabled: on });
    const store = walletDeviceStore();
    // A choice that cannot be stored still holds until the app closes.
    void (on ? store.set(LOCK_NAME, '1') : store.remove(LOCK_NAME)).catch(() => undefined);
    void store.set(LOCK_ANSWERED_NAME, '1').catch(() => undefined);
  }, [prompt, readPhone, turnOff, t]);

  const answer = useCallback(() => {
    void walletDeviceStore().set(LOCK_ANSWERED_NAME, '1').catch(() => undefined);
  }, []);

  const recheck = useCallback(() => {
    void readPhone();
  }, [readPhone]);

  const lock = useMemo<LockSetting>(
    () => ({ ready: setting.ready, enabled: setting.enabled, availability: phone, busy, change, answer, recheck }),
    [setting, phone, busy, change, answer, recheck],
  );

  const hidden = !setting.ready || view.locked || view.covered;
  // Android only: the web has no back button, and react-native-web's BackHandler says so as an error.
  useEffect(() => {
    if (!hidden || Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [hidden]);
  const method = namedMethod(phone);
  const noteText = note === null ? null : t(note);
  const press = useCallback(() => {
    void unlock();
  }, [unlock]);
  const screen = useMemo(() => (view.locked ? <LockedScreen method={method} note={noteText} onUnlock={press} /> : null), [view.locked, method, noteText, press]);
  const cover = useMemo<LockCover>(() => ({ hidden, screen }), [hidden, screen]);

  return (
    <LockCoverContext.Provider value={cover}>
      <LockSettingContext.Provider value={lock}>
        <View style={{ flex: 1 }} {...(hidden ? UNSEEN : SEEN)}>{children}</View>
        {hidden ? <LockCoverArt /> : null}
        {turnedOff ? <TurnedOffNotice text={t('lock.turnedOff')} close={t('common.close')} onClose={() => setTurnedOff(false)} /> : null}
      </LockSettingContext.Provider>
    </LockCoverContext.Provider>
  );
}
