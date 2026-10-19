// The lavender stage band at the top of a screen (redesign R2a): an optional
// back button, a title, an optional subtitle, an optional month switcher and
// a slot for the bun. Only `ink` text may sit on the stage (see
// BUN_TEXT_PAIRS). The band starts under the status bar, so it pads by the
// top safe-area inset. The back button comes first, so it is the first thing
// a screen reader or the keyboard reaches.
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from './BunText';
import { BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

export type StageMonth = {
  /** The month as words, e.g. "October 2026". */
  label: string;
  /** Leave out to disable that arrow (for example, no months after this one). */
  onPrevious?: () => void;
  onNext?: () => void;
};

export type StageBack = {
  onPress: () => void;
  /** Defaults to "Back". */
  label?: string;
};

export type StageHeaderProps = {
  /** A back button above the title, for a screen pushed over another one. */
  back?: StageBack;
  /** The screen's name; drawn as its heading. */
  title: string;
  subtitle?: string;
  month?: StageMonth;
  /** The bun, or any art. It manages its own accessibility (a decorative bun hides itself). */
  bun?: ReactNode;
  /** Extra stage content under the subtitle, such as the month's total. Ink text only. */
  children?: ReactNode;
};

function Arrow({ glyph, label, onPress }: { glyph: string; label: string; onPress?: () => void }) {
  const disabled = !onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: BUN_RADIUS.pill, opacity: disabled ? 0.4 : 1 }}
    >
      <BunText variant="heading" tone="ink" aria-hidden>{glyph}</BunText>
    </Pressable>
  );
}

/** ‹ month › on the stage. The month label is a polite live region, so a step is read out. */
export function MonthSwitcher({ label, onPrevious, onNext }: StageMonth) {
  const tc = useCopy();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xxs }}>
      <Arrow glyph="‹" label={tc('Previous month')} onPress={onPrevious} />
      <BunText variant="label" tone="ink" aria-live="polite" accessibilityLiveRegion="polite" style={{ flexShrink: 1, textAlign: 'center' }}>{label}</BunText>
      <Arrow glyph="›" label={tc('Next month')} onPress={onNext} />
    </View>
  );
}

/** "‹ Back" on the stage: one 44 pt button whose name is its visible word. */
function BackButton({ onPress, label }: StageBack) {
  const tc = useCopy();
  const name = label ?? tc('Back');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={onPress}
      style={{ alignSelf: 'flex-start', minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xxs, paddingRight: BUN_SPACE.xs, borderRadius: BUN_RADIUS.pill }}
    >
      <BunText variant="heading" tone="ink" aria-hidden>‹</BunText>
      <BunText variant="label" tone="ink">{name}</BunText>
    </Pressable>
  );
}

export function StageHeader({ back, title, subtitle, month, bun, children }: StageHeaderProps) {
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="stage-header"
      style={{
        backgroundColor: colors.stage,
        paddingTop: insets.top + BUN_SPACE.md,
        paddingBottom: BUN_SPACE.lg,
        paddingHorizontal: BUN_SPACE.md,
        borderBottomLeftRadius: BUN_RADIUS.sheet,
        borderBottomRightRadius: BUN_RADIUS.sheet,
        gap: BUN_SPACE.sm,
      }}
    >
      {back ? <BackButton {...back} /> : null}
      {month ? <MonthSwitcher {...month} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: BUN_SPACE.sm }}>
        <View style={{ flex: 1, gap: BUN_SPACE.xxs }}>
          <BunText variant="title" tone="ink" role="heading" accessibilityRole="header">{title}</BunText>
          {subtitle ? <BunText variant="body" tone="ink">{subtitle}</BunText> : null}
          {children}
        </View>
        {bun ? <View style={{ flexShrink: 0 }}>{bun}</View> : null}
      </View>
    </View>
  );
}
