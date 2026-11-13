// The Bun Wallet's undo bar (plan P2-T26, rh-undo): a toast on the `toast`
// colour with a round trash mark, what just happened (the host's words, such
// as records.deletedBar) and a 44 pt Undo pill. It is a polite live region,
// said once on iOS, and never takes focus. A host may give the words' spoken
// form (`spoken`, R124: an amount read as บาท, not ฿): it labels the words and
// is what iOS says. It goes after
// motion.duration.toastLong (onDismiss), except while a screen reader runs or
// before the phone has said whether one does: reaching Undo by swipe takes
// longer, and an undo that times out under a screen reader fails WCAG 2.2.1,
// as today's UndoBar says. The host places it, and keeps it while its undo is
// on its way or unconfirmed. It appears at once: the wallet's motion table
// has no row for it.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { playHaptic } from '@mobile/lib/hapticMoment';
import { motion } from '@mobile/theme/motion';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletText } from '../WalletText';

export type WalletUndoBarProps = { message: string; spoken?: string; onUndo(): void; onDismiss(): void };

/** The mark's circle and the pill: the toast's words at 12%, as rh-undo's #2A2830 sits on #111014. */
const ON_TOAST_FILL = 'rgba(255, 255, 255, 0.12)';

/** Whether a screen reader runs: null until the phone answers, so nothing times out before then. */
function useScreenReaderRunning(): boolean | null {
  const [running, setRunning] = useState<boolean | null>(null);
  useEffect(() => {
    // Once the phone has told of a change, its first answer is old news and is dropped (review n3, n5).
    let changed = false;
    // A phone that cannot answer reads as no screen reader, as today's UndoBar does.
    AccessibilityInfo.isScreenReaderEnabled().then(
      (enabled) => {
        if (!changed) setRunning(enabled);
      },
      () => {
        if (!changed) setRunning(false);
      },
    );
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled: boolean) => {
      changed = true;
      setRunning(enabled);
    });
    return () => subscription.remove();
  }, []);
  return running;
}

export function WalletUndoBar({ message, spoken, onUndo, onDismiss }: WalletUndoBarProps) {
  const colors = useWalletColors();
  const t = useDraftCopy(COMMON_COPY);
  const screenReader = useScreenReaderRunning();
  useAnnouncement(spoken ?? message);

  // The latest onDismiss, so a host that draws again never restarts the time.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });
  useEffect(() => {
    if (screenReader !== false) return undefined;
    const timer = setTimeout(() => dismiss.current(), motion.duration.toastLong);
    return () => clearTimeout(timer);
  }, [screenReader]);

  return (
    <View
      {...POLITE_LIVE_REGION}
      testID="wallet-undo-bar"
      style={{
        minHeight: 60,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
        paddingLeft: 16,
        paddingRight: 8,
        borderRadius: 20,
        backgroundColor: colors.toast,
        boxShadow: '0px 12px 28px rgba(17, 16, 20, 0.32)',
      }}
    >
      <View {...DECORATIVE} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: ON_TOAST_FILL, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M4 7h16 M10 11v6M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3" fill="none" stroke={colors.onToast} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      {/* Never clamped: at the largest text sizes the words wrap. */}
      <WalletText role="label" tone="onToast" accessibilityLabel={spoken} style={{ flex: 1, fontWeight: '400' }}>{message}</WalletText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.undo')}
        onPress={() => {
          playHaptic('undoDone');
          onUndo();
        }}
        style={({ pressed }) => ({
          minHeight: 44,
          minWidth: 44,
          paddingHorizontal: 18,
          borderRadius: 999,
          backgroundColor: ON_TOAST_FILL,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <WalletText role="label" tone="onToast">{t('common.undo')}</WalletText>
      </Pressable>
    </View>
  );
}
