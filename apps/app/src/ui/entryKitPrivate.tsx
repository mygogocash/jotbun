// Small pieces shared by the R2b entry and data components. Private to them:
// screens should not import this file.
//
// INTEGRATOR: `MoneyText` stands in for R2a's `Amount`, and `KitSheet` for
// R2a's `Sheet`. They are deliberately minimal so they can be swapped for the
// real kit pieces without changing any component's props.
import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import type { TextProps, ViewProps } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import type { MoneyLocale } from '@mobile/spend/v1/money';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import type { BunTextRole } from '@mobile/theme/bunType';

import { BunText } from './BunText';
import type { BunTone } from './BunText';
import type { DateLocale } from './dateStep';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

/** The money helpers format Thai and every other locale the same way; Thai keeps its own slot. */
export function useMoneyLocale(): MoneyLocale {
  return useActiveLocale() === 'th' ? 'th' : 'en';
}

export function useDateLocale(): DateLocale {
  return useActiveLocale();
}

/** An exact, already formatted amount in tabular figures. Stand-in for R2a's `Amount`. */
export function MoneyText({ children, variant = 'label', tone = 'ink', style, ...rest }: TextProps & { children: string; variant?: BunTextRole; tone?: BunTone }) {
  return <BunText {...rest} variant={variant} tone={tone} style={[{ fontVariant: ['tabular-nums'] }, style]}>{children}</BunText>;
}

/** Decoration that screen readers skip: the words beside it carry the meaning. */
export function Decorative({ children, style }: { children: ReactNode; style?: ViewProps['style'] }) {
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={style}>
      {children}
    </View>
  );
}

export type GlyphName = 'backspace' | 'swap' | 'chevron-left' | 'chevron-right' | 'dots' | 'alert' | 'close' | 'arrow-right';

/** The kit's small line icons, drawn so they look the same on every platform. */
export function Glyph({ name, size = 20, color }: { name: GlyphName; size?: number; color: string }) {
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Decorative>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {name === 'backspace' ? (
          <>
            <Path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" {...stroke} />
            <Path d="M12 9l6 6M18 9l-6 6" {...stroke} />
          </>
        ) : null}
        {name === 'swap' ? (
          <>
            <Path d="M4 8h15M15 4l4 4-4 4" {...stroke} />
            <Path d="M20 16H5M9 12l-4 4 4 4" {...stroke} />
          </>
        ) : null}
        {name === 'chevron-left' ? <Path d="M15 5l-7 7 7 7" {...stroke} /> : null}
        {name === 'chevron-right' ? <Path d="M9 5l7 7-7 7" {...stroke} /> : null}
        {name === 'arrow-right' ? <Path d="M4 12h15M14 7l5 5-5 5" {...stroke} /> : null}
        {name === 'close' ? <Path d="M6 6l12 12M18 6L6 18" {...stroke} /> : null}
        {name === 'dots' ? (
          <>
            <Circle cx={6} cy={12} r={1.6} fill={color} />
            <Circle cx={12} cy={12} r={1.6} fill={color} />
            <Circle cx={18} cy={12} r={1.6} fill={color} />
          </>
        ) : null}
        {name === 'alert' ? (
          <>
            <Circle cx={12} cy={12} r={9} {...stroke} />
            <Line x1={12} y1={7.5} x2={12} y2={13} {...stroke} />
            <Circle cx={12} cy={16.5} r={1.2} fill={color} />
          </>
        ) : null}
      </Svg>
    </Decorative>
  );
}

/** An error said in words with a mark beside it. Ink, not red: red only ever means over budget. */
export function KitError({ message }: { message: string }) {
  const colors = useBunColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: BUN_SPACE.xs }}>
      <Glyph name="alert" size={18} color={colors.ink} />
      <BunText accessibilityRole="alert" aria-live="polite" variant="caption" tone="ink" style={{ flex: 1, fontWeight: '700' }}>{message}</BunText>
    </View>
  );
}

/**
 * A bottom sheet on a dimmed page. Stand-in for R2a's `Sheet`: a cream card
 * with an ink outline, a Close button and the scrim that also closes it. No
 * slide under reduced motion.
 */
export function KitSheet({ visible, onClose, label, children }: { visible: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const colors = useBunColors();
  const tc = useCopy();
  const reducedMotion = useReducedMotion();
  if (!visible) return null;
  return (
    <Modal transparent visible animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* The dimmed page closes the sheet on a tap; screen readers use the Close button instead. */}
        <Pressable accessible={false} focusable={false} aria-hidden onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.ink, opacity: 0.35 }} />
        <View
          role="dialog"
          aria-modal
          accessibilityLabel={label}
          style={{
            backgroundColor: colors.card,
            borderColor: colors.ink,
            borderWidth: BUN_OUTLINE.card,
            borderTopLeftRadius: BUN_RADIUS.sheet,
            borderTopRightRadius: BUN_RADIUS.sheet,
            padding: BUN_SPACE.md,
            gap: BUN_SPACE.sm,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tc('Close')}
              onPress={onClose}
              style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, alignItems: 'center', justifyContent: 'center' }}
            >
              <Glyph name="close" color={colors.ink} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}
