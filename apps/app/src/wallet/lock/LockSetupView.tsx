// The lock's setup screen as drawn (P2-T33, sa-lock-setup). LockSetupScreen
// gives it the router's way back at /settings/lock; a catalogue section gives
// it its own, so the wallet's catalogue list never loads expo-router (the
// wallet's render suites load that list without mocking the router). On the
// ground: back; with `setup`, the step line; the question and its body,
// named by the phone's method; the switch row, 44 pt or more, with its
// fallback line (a passcode has nothing to fall back from); เปลี่ยนใจได้
// ทุกเมื่อในการตั้งค่า; and a wallet card in private mode, so the preview
// shows no amount. With `setup`, a 56 pt round next waits at the foot.
//
// - The switch asks the phone first, both ways (LockGate's `change`): a scan
//   that does not pass leaves it as it was.
// - It turns the lock on only once the phone has said it can lock. A phone
//   with no passcode or biometrics keeps it off and disabled, and says why
//   (R67); a lock that is on can always be turned off.
// - The screen reads the phone again when it opens: a passcode may have just
//   been set in the phone's settings.
// - Next keeps lock-answered, then calls onNext.
import { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { Glyph } from '@mobile/ui/Glyph';
import { CARD_HEIGHT, WalletCard } from '../card/WalletCard';
import { COMMON_COPY } from '../common/copy';
import { IconButton } from '../controls/IconButton';
import { useDraftCopy } from '../copy/useDraftCopy';
import type { WalletLook } from '../looks/walletLooks';
import { MaterialFill } from '../looks/MaterialFill';
import { PRIVATE_MODE_NAME, PrivateModeProvider } from '../privacy/PrivateModeProvider';
import type { KeyValueStore } from '../store/walletStore';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import { useLockSetting } from './LockGate';
import type { LockMethod } from './lockModel';
import { lockSwitch, METHOD_KEYS, namedMethod } from './lockModel';

const SETUP_COPY = { ...COMMON_COPY, ...COPY };

/** The round next (sa-lock-setup): 56 pt. */
const NEXT = 56;

/** The preview's private mode: on, always, so the card shows ฿•••• and no amount. */
const PREVIEW_STORE: KeyValueStore = {
  get: async (name) => (name === PRIVATE_MODE_NAME ? '1' : null),
  set: async () => undefined,
  remove: async () => undefined,
  eraseAll: async () => undefined,
};

/** The board's lavender card in front, a titanium one fanned behind it. */
const PREVIEW_LOOK: WalletLook = { kind: null, material: 'silk', face: 'smile' };

/** The switch's 52 × 32 pt track and knob: decorative, since the row is the switch. */
function SwitchArt({ on }: { on: boolean }) {
  const colors = useWalletColors();
  return (
    <View {...DECORATIVE} testID="lock-switch-track" style={{ width: 52, height: 32, borderRadius: 16, backgroundColor: on ? colors.primary : colors.quiet }}>
      <View
        testID="lock-switch-knob"
        style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 26, height: 26, borderRadius: 13, backgroundColor: on ? colors.onPrimary : colors.card, boxShadow: '0px 2px 4px rgba(17, 16, 20, 0.25)' }}
      />
    </View>
  );
}

/** A check in a violet circle (sa-lock-setup's เปลี่ยนใจได้). */
function CheckArt() {
  const colors = useWalletColors();
  return (
    <View {...DECORATIVE}>
      <Svg width={16} height={16} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={10} fill={colors.violet} />
        <Path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke={colors.isDark ? colors.ground : '#FFFFFF'} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/** The Face ID tile beside the preview. */
function FaceTile() {
  const colors = useWalletColors();
  return (
    <View style={{ position: 'absolute', left: 218, top: 0, width: 76, height: 76, borderRadius: 24, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 12px 28px rgba(17, 16, 20, 0.16)' }}>
      <Svg width={44} height={44} viewBox="0 0 24 24">
        <Path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16" fill="none" stroke={colors.ink} strokeWidth={1.7} strokeLinecap="round" />
        <Path d="M9 9.5v1.4M15 9.5v1.4M12 9.5v3.6h-1M9.6 15.6c1.4 1.1 3.4 1.1 4.8 0" fill="none" stroke={colors.violet} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

/** The masked card preview: decorative, in private mode of its own. */
function Preview({ method, name }: { method: LockMethod; name: string }) {
  return (
    <View {...DECORATIVE} testID="lock-preview" style={{ height: CARD_HEIGHT + 50, marginTop: 8 }}>
      <View style={{ position: 'absolute', left: 72, top: 18, width: 220, height: 140, transform: [{ rotate: '-7deg' }] }}>
        <MaterialFill material="titanium" radius={20} />
      </View>
      <View style={{ position: 'absolute', left: 58, top: 40, width: 234 }}>
        <PrivateModeProvider store={PREVIEW_STORE}>
          <WalletCard wallet={{ id: 'lock-preview', name, balanceMinor: '0' }} look={PREVIEW_LOOK} variant="stack" />
        </PrivateModeProvider>
      </View>
      {method === 'face' ? <FaceTile /> : null}
    </View>
  );
}

export function LockSetupView({ setup, onBack, onNext }: { setup: boolean; onBack: () => void; onNext: () => void }) {
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  const t = useDraftCopy(SETUP_COPY);
  const lock = useLockSetting();
  const { recheck } = lock;

  useEffect(() => {
    recheck();
  }, [recheck]);

  const method = namedMethod(lock.availability);
  const keys = METHOD_KEYS[method];
  const name = t(keys.name);
  const toggle = lockSwitch(lock.enabled, lock.availability);
  const next = () => {
    lock.answer();
    onNext();
  };
  const label = t('lock.switch', { method: name });
  const line = method === 'passcode' ? null : t('lock.fallbackLine');

  return (
    <View testID="lock-setup" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: insets.bottom + (setup ? NEXT + 32 : 24), gap: 14 }}
      >
        <IconButton label={t('common.back')} onPress={onBack}>
          <Glyph name="chevron-left" size={18} color={colors.ink} />
        </IconButton>
        {setup ? <WalletText role="label" tone="violet">{t('lock.step')}</WalletText> : null}
        <WalletText role="h1" accessibilityRole="header">{t('lock.question', { method: name })}</WalletText>
        <WalletText tone="quietOnGround">{t(keys.body)}</WalletText>
        <Pressable
          testID="lock-switch"
          accessibilityRole="switch"
          accessibilityLabel={label}
          accessibilityHint={line ?? undefined}
          accessibilityState={{ checked: toggle.checked, disabled: toggle.disabled, busy: lock.busy }}
          aria-checked={toggle.checked}
          aria-disabled={toggle.disabled}
          aria-busy={lock.busy}
          disabled={toggle.disabled || lock.busy}
          onPress={() => void lock.change(!lock.enabled)}
          style={{
            minHeight: 44,
            marginTop: 6,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 18,
            backgroundColor: colors.card,
            opacity: toggle.disabled ? 0.4 : 1,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <WalletText style={{ fontWeight: '700' }}>{label}</WalletText>
            {line === null ? null : <WalletText role="caption" tone="quiet">{line}</WalletText>}
          </View>
          <SwitchArt on={toggle.checked} />
        </Pressable>
        {toggle.needsPasscode ? <WalletText role="label">{t('lock.needsPasscode')}</WalletText> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CheckArt />
          <WalletText role="label" style={{ flex: 1 }}>{t('lock.changeLater')}</WalletText>
        </View>
        <Preview method={method} name={t('lock.previewName')} />
      </ScrollView>
      {setup ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.next')}
          onPress={next}
          style={{
            position: 'absolute',
            right: 20,
            bottom: insets.bottom + 6,
            width: NEXT,
            height: NEXT,
            borderRadius: NEXT / 2,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0px 10px 24px rgba(17, 16, 20, 0.25)',
          }}
        >
          <View {...DECORATIVE}>
            <Svg width={22} height={22} viewBox="0 0 24 24">
              <Path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke={colors.onPrimary} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
