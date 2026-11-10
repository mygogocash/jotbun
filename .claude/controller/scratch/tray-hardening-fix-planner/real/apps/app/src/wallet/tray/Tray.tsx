// The Bun Wallet's tray (P2-T13, W3, R63, R69; boards bw-tray-amount,
// bw-tray-confirm, dk-tray-amount, rh-income, ax-large-tray): a card that
// floats 8 pt in from the screen's left, right and bottom edges (above the
// home indicator), radius 34, on the `sheet` colour with the boards' edge,
// over a dimmed page. At the largest text sizes it is full height under the
// top safe area. It is React Native's own Modal, transparent and unanimated,
// with Reanimated moving the card and Gesture Handler reading the swipe: no
// sheet package, since a native sheet cannot draw the inset, the radius or a
// height that changes per step.
//
// - Names and focus. The title names the dialog. The web makes the Modal's own
//   layer the dialog (as Sheet does), and that layer takes focus when the tray
//   opens, since Reanimated keeps the card unseen for its first frames there;
//   a phone focuses the title, one accessible header. A `header` (P2-T14's type
//   switch) takes the title's place in the row; the title stays first for
//   screen readers, unseen.
// - Closing. Close, the backdrop, the screen reader's escape, the system back
//   (Escape on the web) and the swipe all ask one requestClose, which does
//   nothing while `locked` (a save in flight, Review Focus 1), once the tray
//   is leaving, or under the lock's cover. Locked, close says it is unavailable.
// - Motion: P2-T9's builders, with the wallet's one answer (W6). The card
//   springs up from below, or fades in. A step change ticks once (trayStep)
//   when the tray was open and uncovered before it and still is, fades its new
//   content in and morphs the card's height; under Reduce Motion the height
//   jumps.
// - The exit (R69). When `visible` turns false the card leaves while the Modal
//   stays; the Modal hides when the card's exit ends (220 ms, or the 150 ms
//   fade), then onClosed fires once. iOS presents no Modal while another is
//   still leaving, so there onClosed waits for the Modal's own onDismiss, and
//   an onDismiss that ends after the tray was shown again says nothing. A host
//   that opens a second tray as one closes opens it from onClosed, never in the
//   same render, and keeps this tray mounted until then.
// - A Sheet opened from a tray (Tell Bun's, P2-T16) renders inside the tray's
//   content, so iOS presents it from the tray's window; never as a sibling
//   Modal. It keeps its own Animated slide (theme/motion.ts says why).
// - The keyboard. The card sits in a KeyboardAvoidingView, as EntryPage does,
//   and `footer` stays pinned under the scrolling content, as ActionFooter does.
// - The swipe (Gesture Handler 3), on the header row, runs on the JS runtime:
//   its end asks the host to close, which sets React state. The card follows
//   the finger down only, closes past shouldDismiss's line, and otherwise
//   springs back (jumps back under Reduce Motion), as does a swipe the system
//   cancels.
// - The lock (R63). While useLockCover() says hidden, LockCoverArt takes the
//   place of the backdrop and the card at once (the card's exit is skipped, so
//   it never shows over the cover), and the content unmounts; every step is
//   its host's, so nothing typed is lost. Nothing of the tray is announced,
//   nothing asks to close it, and the card is back in its place when the
//   cover lifts.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import type { HostInstance } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { LayoutAnimationConfig, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { playHaptic } from '@mobile/lib/hapticMoment';
import { motion } from '@mobile/theme/motion';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, moveAccessibilityFocus } from '@mobile/ui/a11y';
import { Glyph } from '@mobile/ui/Glyph';
import type { GlyphName } from '@mobile/ui/Glyph';
import { useLargeText } from '@mobile/ui/largeText';
import { LockCoverArt, useLockCover } from '@mobile/ui/lockCover';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { useWalletReducedMotion } from '../motion/reducedMotion';
import { stepEntering, stepLayout, trayEntering, trayExiting } from '../motion/useWalletMotion';
import { motionFor } from '../motion/walletMotion';
import { WalletText } from '../WalletText';
import { shouldDismiss, TRAY_INSET, TRAY_RADIUS } from './trayGesture';

export type TrayProps = {
  visible: boolean;
  onClose: () => void;
  /** Once the tray has left and its Modal has hidden; open the next tray from here (R69). */
  onClosed?: () => void;
  /** Names the dialog; drawn in the header unless `header` takes its place. */
  title: string;
  header?: ReactNode;
  /** Draws back (common.back) before the title. */
  onBack?: () => void;
  /** The step shown; a change ticks once and morphs the height. */
  step?: string;
  /** Pinned under the scrolling content. */
  footer?: ReactNode;
  /** Nothing closes it, and close says it is unavailable (a save in flight). */
  locked?: boolean;
  children: ReactNode;
  /** The card's; defaults to `tray`. */
  testID?: string;
};

/** The page behind a tray: ink at 38% by day (bw-tray-amount), black at 60% at night (dk-tray-amount). */
const BACKDROP = { light: 'rgba(17, 16, 20, 0.38)', dark: 'rgba(0, 0, 0, 0.6)' } as const;

/** The card's edge: a soft shadow up the page by day (bw-tray-amount), a 1 pt light line along its top at night (dk-tray-amount). */
const EDGE = { light: '0px -10px 40px rgba(17, 16, 20, 0.18)', dark: 'inset 0px 1px 0px rgba(255, 255, 255, 0.08)' } as const;

/** The card's padding and the gap between its parts (bw-tray-amount). */
const PADDING = 18;
const GAP = 12;

/** The header's buttons: 44 pt in their own box (§4), a `raised` circle, as rh-income and ax-large-tray draw close. */
const BUTTON = 44;

/** The title's place when a header is drawn instead: screen readers meet it first, and nothing shows. */
const UNSEEN = { position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden' } as const;

function HeaderButton({ label, glyph, onPress, disabled = false }: { label: string; glyph: GlyphName; onPress: () => void; disabled?: boolean }) {
  const colors = useWalletColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={{
        width: BUTTON,
        height: BUTTON,
        borderRadius: BUTTON / 2,
        backgroundColor: colors.raised,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Glyph name={glyph} size={16} color={colors.ink} />
    </Pressable>
  );
}

export function Tray({ visible, onClose, onClosed, title, header, onBack, step, footer, locked = false, children, testID = 'tray' }: TrayProps) {
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  const large = useLargeText();
  const reduced = useWalletReducedMotion();
  const { hidden } = useLockCover();
  const t = useDraftCopy(COMMON_COPY);
  const web = Platform.OS === 'web';

  // The Modal stays shown while the card leaves (R69): it opens at once and
  // hides only when the card's exit has ended.
  const [shown, setShown] = useState(visible);
  if (visible && !shown) setShown(true);

  // The latest onClosed, as the last commit left it, for the hide's timer and iOS's onDismiss.
  const closed = useRef(onClosed);
  useEffect(() => {
    closed.current = onClosed;
  });
  const exitMs = trayExiting(reduced).getDuration();
  useEffect(() => {
    if (visible || !shown) return undefined;
    const timer = setTimeout(() => {
      setShown(false);
      // iOS hears it from the Modal's own onDismiss, once the Modal has gone.
      if (Platform.OS !== 'ios') closed.current?.();
    }, exitMs);
    return () => clearTimeout(timer);
  }, [visible, shown, exitMs]);
  // iOS's onDismiss comes when UIKit's dismissal ends, after the hide. A tray
  // shown again by then (a quick reopen) has not closed, so that late one says
  // nothing (P10d); the hide that follows has its own onDismiss. The guard reads
  // this render's `shown`, not a ref an effect refreshes: Modal.js calls the
  // latest onDismiss in the layout phase of the commit that renders the end, and
  // a reopen batched with the end is in that same commit, before its effects run.
  const dismissed = () => {
    if (!shown) closed.current?.();
  };

  /** A close may be asked for: never while locked (a save in flight), once the tray is leaving, or under the lock's cover. */
  const closable = visible && !locked && !hidden;
  /** One rule for close, the backdrop, the screen reader's escape, the system back and the swipe. */
  const requestClose = () => {
    if (closable) onClose();
  };

  // A step change ticks once while the tray is open and uncovered, and only if
  // it was so in the commit before: opening it at another step in one render,
  // a step changed under the cover, or the cover lifting plays none.
  const shownStep = useRef(step);
  const wasOpen = useRef(false);
  useEffect(() => {
    const open = visible && !hidden;
    const changed = shownStep.current !== step;
    shownStep.current = step;
    const tick = changed && open && wasOpen.current;
    wasOpen.current = open;
    if (!tick) return;
    const { haptic } = motionFor('trayStep', reduced);
    if (haptic) playHaptic(haptic);
  }, [step, visible, hidden, reduced]);

  // The swipe: the card follows the finger down only. It is back in its place
  // when the tray opens, and when the lock's cover comes or goes (`hidden` is a
  // dependency for that): the cover unmounts the header's detector, so a drag
  // it cuts off may never end in JS.
  const drag = useSharedValue(0);
  useEffect(() => {
    if (visible) drag.value = 0;
  }, [visible, hidden, drag]);
  const follow = useAnimatedStyle(() => ({ transform: [{ translateY: drag.value }] }), [drag]);
  const pan = usePanGesture({
    activeOffsetY: 10,
    failOffsetX: [-20, 20],
    runOnJS: true,
    onUpdate: (event) => {
      drag.value = Math.max(0, event.translationY);
    },
    onDeactivate: (event) => {
      // A swipe the system cancels (a call, a system gesture) never closes: the finger did not let go.
      if (closable && !event.canceled && shouldDismiss(event.translationY, event.velocityY)) {
        requestClose();
        return;
      }
      // Short of the line, cancelled, or locked: back to its place.
      drag.value = reduced ? 0 : withSpring(0, { ...motion.spring.gentle, reduceMotion: ReduceMotion.Never });
    },
  });

  const layer = useRef<HostInstance>(null);
  const titleRef = useRef<HostInstance>(null);
  const focusTitle = () => moveAccessibilityFocus(web ? layer.current : titleRef.current);

  // Exactly one named dialog: on the web the Modal's own layer (react-native-web
  // makes it the dialog), on a phone the card. Under the lock nothing is named.
  const layerProps = web ? { 'aria-label': hidden ? undefined : title, tabIndex: -1 as const } : null;
  const cardDialog = web ? null : { role: 'dialog' as const, 'aria-modal': true, 'aria-label': title };
  const titleHeader = { accessible: true, accessibilityRole: 'header' as const, accessibilityLabel: title };

  return (
    <Modal
      ref={layer}
      visible={shown}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={requestClose}
      onShow={focusTitle}
      onDismiss={Platform.OS === 'ios' ? dismissed : undefined}
      {...layerProps}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        {hidden ? (
          <LockCoverArt />
        ) : (
          // Covered, the card goes at once: its exit would show it over the cover (R63).
          <LayoutAnimationConfig skipExiting>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
              <Pressable
                {...DECORATIVE}
                testID="tray-backdrop"
                // Hidden from screen readers, so never a tab stop either: react-native-web's
                // Pressable reads tabIndex, not focusable.
                focusable={false}
                tabIndex={-1}
                onPress={requestClose}
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.isDark ? BACKDROP.dark : BACKDROP.light }}
              />
              <Animated.View pointerEvents="box-none" style={[{ flexGrow: large ? 1 : 0, flexShrink: 1, paddingTop: insets.top }, follow]}>
                {visible ? (
                  <Animated.View
                    testID={testID}
                    {...cardDialog}
                    accessibilityViewIsModal
                    onAccessibilityEscape={requestClose}
                    entering={trayEntering(reduced)}
                    exiting={trayExiting(reduced)}
                    layout={stepLayout(reduced)}
                    style={{
                      flexGrow: large ? 1 : 0,
                      flexShrink: 1,
                      marginLeft: TRAY_INSET,
                      marginRight: TRAY_INSET,
                      marginBottom: TRAY_INSET + insets.bottom,
                      borderRadius: TRAY_RADIUS,
                      backgroundColor: colors.sheet,
                      boxShadow: colors.isDark ? EDGE.dark : EDGE.light,
                      padding: PADDING,
                      gap: GAP,
                    }}
                  >
                    <GestureDetector gesture={pan}>
                      <View testID="tray-header" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        {header ? <View ref={titleRef} {...titleHeader} style={UNSEEN} /> : null}
                        {onBack ? <HeaderButton label={t('common.back')} glyph="chevron-left" onPress={onBack} /> : null}
                        {header ? (
                          <View style={{ flex: 1 }}>{header}</View>
                        ) : (
                          <View ref={titleRef} {...(web ? null : titleHeader)} style={{ flex: 1 }}>
                            <WalletText role="h2" accessibilityRole={web ? 'header' : undefined}>{title}</WalletText>
                          </View>
                        )}
                        <HeaderButton label={t('common.close')} glyph="close" onPress={requestClose} disabled={locked} />
                      </View>
                    </GestureDetector>
                    <ScrollView style={{ flexGrow: large ? 1 : 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled">
                      <LayoutAnimationConfig skipEntering>
                        <Animated.View key={step} entering={stepEntering()} style={{ gap: GAP }}>
                          {children}
                        </Animated.View>
                      </LayoutAnimationConfig>
                    </ScrollView>
                    {footer ? <View testID="tray-footer" style={{ gap: 4 }}>{footer}</View> : null}
                  </Animated.View>
                ) : null}
              </Animated.View>
            </KeyboardAvoidingView>
          </LayoutAnimationConfig>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}
