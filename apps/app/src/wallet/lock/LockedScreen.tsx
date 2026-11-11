// The locked screen (P2-T33, sa-locked): Bun holding a padlock, Jotbun ล็อกอยู่,
// the method's line, and at the foot the main button that unlocks with the
// phone's method and ใช้รหัสผ่าน, a quiet ink link to the same system prompt,
// whose own fallback button carries that label. A passcode phone's button
// already says รหัสผ่าน, so it has no link. After a scan that did not unlock,
// the note says why in a polite status region; LockGate says it on iOS, once,
// since every cover draws this screen and only one may speak. It shows no
// amount and draws only the ground behind it: nothing of the app shows
// through (the board's blurred page is not drawn). It scrolls, so at the
// largest text sizes nothing is cut.
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, POLITE_LIVE_REGION } from '@mobile/ui/a11y';
import { useDraftCopy } from '../copy/useDraftCopy';
import { PrimaryButton } from '../tray/PrimaryButton';
import { TextLink } from '../tray/TextLink';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import type { LockMethod } from './lockModel';
import { METHOD_KEYS } from './lockModel';

/** The board's Bun with its padlock: a sticker, the same by day and at night. */
function LockedBun() {
  const ink = '#111014';
  const cream = '#FFF6E6';
  const line = { fill: 'none', stroke: ink, strokeLinecap: 'round' as const };
  return (
    <View {...DECORATIVE}>
      <Svg width={132} height={111} viewBox="4 6 62 52">
        <Path d="M6 44C6 22 18 8 32 8C46 8 58 22 58 44C58 51 52 54 44 54H20C12 54 6 51 6 44Z" fill={cream} stroke={ink} strokeWidth={3} />
        <Path d="M20 30Q24 33.5 28 30M36 30Q40 33.5 44 30" {...line} strokeWidth={2.6} />
        <Ellipse cx={18.5} cy={36.5} rx={4} ry={2.4} fill="#F6B6CE" />
        <Ellipse cx={45.5} cy={36.5} rx={4} ry={2.4} fill="#F6B6CE" />
        <Path d="M29 37Q32 39.4 35 37" {...line} strokeWidth={2.4} />
        <Path d="M51.5 42v-3.5a4 4 0 0 1 8 0V42" {...line} strokeWidth={2.8} />
        <Rect x={48} y={41.5} width={15} height={13} rx={3.5} fill={ink} />
        <Circle cx={55.5} cy={46.8} r={1.7} fill={cream} />
        <Path d="M55.5 48.2v2.6" stroke={cream} strokeWidth={1.8} strokeLinecap="round" />
        <Ellipse cx={48.5} cy={50} rx={4.2} ry={3.6} fill={cream} stroke={ink} strokeWidth={2.6} />
      </Svg>
    </View>
  );
}

export function LockedScreen({ method, note, onUnlock }: { method: LockMethod; note: string | null; onUnlock(): void }) {
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  const t = useDraftCopy(COPY);
  const keys = METHOD_KEYS[method];
  return (
    <View testID="locked-screen" style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 24, paddingHorizontal: 20, paddingBottom: insets.bottom + 16, gap: 24 }}
      >
        <View style={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <LockedBun />
          <WalletText role="h1" accessibilityRole="header" style={{ marginTop: 10, textAlign: 'center' }}>{t('lock.lockedTitle')}</WalletText>
          <WalletText tone="quietOnGround" style={{ textAlign: 'center' }}>{t(keys.line)}</WalletText>
          {note === null ? null : (
            <View testID="lock-note" {...POLITE_LIVE_REGION} style={{ marginTop: 8 }}>
              <WalletText style={{ textAlign: 'center', fontWeight: '500' }}>{note}</WalletText>
            </View>
          )}
        </View>
        <View style={{ gap: 6 }}>
          <PrimaryButton label={t('lock.unlock', { method: t(keys.name) })} onPress={onUnlock} />
          {method === 'passcode' ? null : <TextLink tone="ink" label={t('lock.usePasscode')} onPress={onUnlock} />}
        </View>
      </ScrollView>
    </View>
  );
}
