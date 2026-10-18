// Bottom sheets (redesign R2a), on React Native's own Modal: no new package.
//
// A sheet closes from its close button, the dimmed backdrop, Android's back
// button (`onRequestClose`; Escape on the web) and VoiceOver's escape
// gesture. When it opens, screen-reader focus moves to the sheet. It slides up
// on a gentle spring; under reduced motion it simply appears.
//
// ConfirmSheet states the consequence of an action before it happens. When the
// action is destructive, the safe choice (cancel) keeps the ink fill and the
// destructive confirm is outlined: red is reserved for over-budget, so weight,
// not colour, steers people away from the irreversible button.
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import type { HostInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
import { useCopy } from '@mobile/i18n/useCopy';
import { runSpringTransform } from '@mobile/theme/animatedMotion';
import { motion } from '@mobile/theme/motion';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, moveAccessibilityFocus } from './a11y';
import { BunText } from './BunText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';
import { PillButton } from './PillButton';
import { sheetBackdrop } from './sheetBackdrop';

export type SheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Names the dialog and is drawn as its heading. */
  title: string;
  children?: ReactNode;
  /** Defaults to "Close". */
  closeLabel?: string;
};

export type ConfirmSheetProps = {
  visible: boolean;
  /** The question, e.g. "Delete this entry?". */
  title: string;
  /** What will happen, in plain words, e.g. "Coffee ฿65.00 moves to Recently deleted for 30 days." */
  consequence: string;
  /** A specific verb, e.g. "Delete entry". */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** The safe choice keeps the ink fill; see the note at the top of this file. */
  destructive?: boolean;
  /** The action is running: confirm shows busy and nothing closes the sheet. */
  busy?: boolean;
  /** Decorative art above the title, such as the quiet bun. */
  art?: ReactNode;
};

/** How far below its resting place the sheet starts its slide. */
export const SHEET_SLIDE_FROM = 48;

export function Sheet({ visible, onClose, title, children, closeLabel }: SheetProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const sheetRef = useRef<HostInstance>(null);
  const titleRef = useRef<HostInstance>(null);
  const offset = useRef(new Animated.Value(reducedMotion ? 0 : SHEET_SLIDE_FROM)).current;

  useEffect(() => {
    if (!visible) {
      offset.setValue(reducedMotion ? 0 : SHEET_SLIDE_FROM);
      return;
    }
    const flight = runSpringTransform(offset, { toValue: 0, spring: motion.spring.gentle, reducedMotion });
    flight.start();
    return () => flight.stop();
  }, [offset, reducedMotion, visible]);

  // The web focuses the dialog itself (keyboard and screen reader share focus
  // there). Native screen readers land on the title, which is one accessible
  // header element there.
  const web = Platform.OS === 'web';
  const focusSheet = () => moveAccessibilityFocus(web ? sheetRef.current : titleRef.current);
  const nativeTitle = web ? null : { accessible: true, accessibilityRole: 'header' as const, accessibilityLabel: title };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose} onShow={focusSheet}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          {...DECORATIVE}
          testID="sheet-backdrop"
          focusable={false}
          onPress={onClose}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, ...sheetBackdrop(colors) }}
        />
        <Animated.View
          ref={sheetRef}
          role="dialog"
          aria-modal
          aria-label={title}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          tabIndex={-1}
          style={{
            maxHeight: '92%',
            backgroundColor: colors.card,
            borderTopLeftRadius: BUN_RADIUS.sheet,
            borderTopRightRadius: BUN_RADIUS.sheet,
            borderWidth: BUN_OUTLINE.card,
            borderBottomWidth: 0,
            borderColor: colors.ink,
            paddingTop: BUN_SPACE.md,
            paddingHorizontal: BUN_SPACE.lg,
            paddingBottom: insets.bottom + BUN_SPACE.lg,
            gap: BUN_SPACE.md,
            transform: [{ translateY: offset }],
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: BUN_SPACE.sm }}>
            <View ref={titleRef} {...nativeTitle} style={{ flex: 1, paddingTop: BUN_SPACE.xs }}>
              <BunText variant="heading" role="heading" accessibilityRole="header">{title}</BunText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel ?? tc('Close')}
              onPress={onClose}
              style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}
            >
              <View {...DECORATIVE}>
                <BunText variant="heading">×</BunText>
              </View>
            </Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: BUN_SPACE.md }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function ConfirmSheet({ visible, title, consequence, confirmLabel, onConfirm, onCancel, cancelLabel, destructive = false, busy = false, art }: ConfirmSheetProps) {
  const tc = useCopy();
  const close = () => {
    if (!busy) onCancel();
  };
  const confirm = (
    <PillButton
      key="confirm"
      kind={destructive ? 'secondary' : 'primary'}
      label={confirmLabel}
      busy={busy}
      accessibilityHint={consequence}
      onPress={onConfirm}
    />
  );
  const cancel = <PillButton key="cancel" kind={destructive ? 'primary' : 'secondary'} label={cancelLabel ?? tc('Cancel')} disabled={busy} onPress={close} />;
  return (
    <Sheet visible={visible} onClose={close} title={title}>
      {art ? <View {...DECORATIVE} style={{ alignItems: 'center' }}>{art}</View> : null}
      <BunText>{consequence}</BunText>
      <View style={{ gap: BUN_SPACE.sm }}>
        {destructive ? [cancel, confirm] : [confirm, cancel]}
      </View>
    </Sheet>
  );
}
