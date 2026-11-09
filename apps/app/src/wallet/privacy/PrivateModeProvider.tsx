// Private mode (W10, D41, R65): one device setting hides every amount behind
// ฿•••• until the eye is tapped again. It lives in the wallet's device store
// (P2-T3), so the sign-out erase forgets it; the tip stays seen once closed.
// Until the setting is read, amounts read as hidden and the eye waits, so an
// amount the person hid never shows for a moment at launch (as R66 treats an
// unknown motion answer). WalletRoot mounts the one provider; a catalogue
// section may mount its own over a store in memory.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IntlContext } from 'react-intl';

import { trackPrivateModeToggled } from '@mobile/analytics/events';
import { isSupportedLocale } from '@mobile/i18n/locales';
import { announcePolitely } from '@mobile/ui/a11y';
import { tableT } from '../copy/draftText';
import { walletDeviceStore } from '../store/deviceWalletStore';
import type { KeyValueStore } from '../store/walletStore';
import { COPY } from './copy';

/** The device store's names: `jotbun.wallet.private-mode` and `jotbun.wallet.private-tip-seen`, `'1'` when on. */
export const PRIVATE_MODE_NAME = 'private-mode';
export const PRIVATE_TIP_NAME = 'private-tip-seen';

export type PrivateMode = {
  /** Every amount is drawn as ฿••••. True until the setting is read. */
  readonly hidden: boolean;
  /** The setting has been read. */
  readonly ready: boolean;
  /** The rule (R61): flips the setting, stores it, says it and sends one private_mode_toggled. Waits until `ready`. */
  readonly toggle: () => void;
  /** The tip was closed once, and never shows again. */
  readonly tipSeen: boolean;
  readonly dismissTip: () => void;
};

type Setting = Pick<PrivateMode, 'hidden' | 'ready' | 'tipSeen'>;

/** Outside the wallet root (a part drawn on its own): amounts show, and nothing changes. */
const OUTSIDE: PrivateMode = { hidden: false, ready: true, tipSeen: true, toggle: () => undefined, dismissTip: () => undefined };

/** Before the setting is read: hidden, with no tip yet. */
const UNREAD: Setting = { hidden: true, ready: false, tipSeen: true };

const PrivateModeContext = createContext<PrivateMode>(OUTSIDE);

/** A name the store cannot read counts as unset. */
const read = (store: KeyValueStore, name: string) => store.get(name).catch(() => null);

/** `store`: where this provider alone keeps the setting, held stable by its caller (a catalogue preview); the wallet's device store when absent. */
export function PrivateModeProvider({ children, store }: { children: ReactNode; store?: KeyValueStore }) {
  // What a tap says is in the app's language, from the root's IntlProvider.
  // WalletRoot's own test draws the root with none, so the context is read
  // without useIntl's throw, falling back to English as useActiveLocale does.
  const appLocale = (useContext(IntlContext) as { locale?: string } | null)?.locale;
  const t = useMemo(() => tableT(COPY, isSupportedLocale(appLocale) ? appLocale : 'en'), [appLocale]);
  const [setting, setSetting] = useState<Setting>(UNREAD);
  // What a tap flips: two taps before React renders still flip twice.
  const latest = useRef(setting);
  const publish = useCallback((next: Setting) => {
    latest.current = next;
    setSetting(next);
  }, []);
  const target = useCallback(() => store ?? walletDeviceStore(), [store]);

  useEffect(() => {
    // A run that has ended (unmounted, or React's development double run) drops its late read.
    let active = true;
    const from = target();
    void Promise.all([read(from, PRIVATE_MODE_NAME), read(from, PRIVATE_TIP_NAME)]).then(([mode, tip]) => {
      if (active) publish({ hidden: mode === '1', ready: true, tipSeen: tip === '1' });
    });
    return () => {
      active = false;
    };
  }, [target, publish]);

  const toggle = useCallback(() => {
    const now = latest.current;
    if (!now.ready) return;
    const hidden = !now.hidden;
    publish({ ...now, hidden });
    const to = target();
    // A choice that cannot be stored still holds until the app closes.
    void (hidden ? to.set(PRIVATE_MODE_NAME, '1') : to.remove(PRIVATE_MODE_NAME)).catch(() => undefined);
    announcePolitely(t(hidden ? 'privacy.hiddenAnnounce' : 'privacy.shownAnnounce'));
    trackPrivateModeToggled();
  }, [publish, target, t]);

  const dismissTip = useCallback(() => {
    publish({ ...latest.current, tipSeen: true });
    void target().set(PRIVATE_TIP_NAME, '1').catch(() => undefined);
  }, [publish, target]);

  const value = useMemo<PrivateMode>(() => ({ ...setting, toggle, dismissTip }), [setting, toggle, dismissTip]);
  return <PrivateModeContext.Provider value={value}>{children}</PrivateModeContext.Provider>;
}

/** Private mode as the nearest provider holds it; outside one, amounts show and nothing changes. */
export function usePrivateMode(): PrivateMode {
  return useContext(PrivateModeContext);
}
