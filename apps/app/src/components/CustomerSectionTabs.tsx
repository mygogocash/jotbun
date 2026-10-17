import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { MotionPressable } from "@mobile/components/MotionPressable";
import { useReducedMotion } from "@mobile/hooks/useReducedMotion";
import { configureStageChange } from "@mobile/theme/stageChange";
import { Text } from "@mobile/theme/AppText";
import type { IconComponent } from "@mobile/theme/icons";
import { pickThemed, type ThemeColors } from "@mobile/theme/colorPalettes";
import { useTheme } from "@mobile/theme/ThemeProvider";
import { useThemedStyles } from "@mobile/theme/useThemedStyles";
import { radii, spacing, typography } from "@mobile/theme/tokens";

export type CustomerSectionTabItem<TValue extends string> = {
  readonly id: TValue;
  /**
   * Optional glyph in front of the label — the shape Quest's own strip already has.
   * Optional so the strip's existing caller (My Wallet's transaction tabs) is untouched:
   * pass nothing and the segment renders exactly as it did before.
   */
  readonly icon?: IconComponent;
  readonly label: string;
};

/**
 * Track padding, which is also what the track's radius is built from: the rail's corner
 * is the pill's corner plus the gutter around it, so the two stay concentric at any
 * radius. Quest's strip is the source of this shape.
 */
const SECTION_TAB_TRACK_PADDING = 4;

/** Matches Quest's own tab glyph, the strip this shape came from. */
const SECTION_TAB_ICON_SIZE = 15;

/**
 * Section tabs for data-heavy account surfaces.
 *
 * Founder call 2026-08-13: adopts the Quest tab strip — a filled, bordered rail holding
 * pill segments. It replaces three top-rounded panels standing on a bottom rule, a shape
 * that read as three cards rather than one control, and whose top corners were left over
 * from a background the design had already moved past.
 *
 * Full names stay available to assistive technology even when a narrow phone visually
 * truncates the label.
 */
export function CustomerSectionTabs<TValue extends string>({
  items,
  onValueChange,
  value,
}: {
  readonly items: readonly CustomerSectionTabItem<TValue>[];
  readonly onValueChange: (value: TValue) => void;
  readonly value: TValue;
}) {
  const styles = useThemedStyles(createCustomerSectionTabsStyles);
  const { colors } = useTheme();
  const [focusedTab, setFocusedTab] = useState<TValue | null>(null);
  const reducedMotion = useReducedMotion();

  return (
    <View accessibilityRole="tablist" style={styles.tabStrip}>
      {items.map((item) => {
        const selected = item.id === value;
        const Glyph = item.icon;
        return (
          <MotionPressable
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            aria-selected={selected}
            hoverLift={false}
            key={item.id}
            onBlur={() =>
              setFocusedTab((current) => (current === item.id ? null : current))
            }
            onFocus={() => setFocusedTab(item.id)}
            onPress={() => {
              // Selection redistributes tab widths (the selected tab keeps its
              // full label) and usually swaps the panel below — one layout pass.
              if (!selected) configureStageChange(reducedMotion);
              onValueChange(item.id);
            }}
            pressScale={0.98}
            style={[
              styles.tabButton,
              // The selected tab keeps its full label; the rest give up whatever width
              // it needs. Three long names cannot all fit at 375pt, and the one the
              // member is reading is the one that must not be clipped.
              selected ? styles.tabSegmentKeepsLabel : styles.tabSegmentAbsorbs,
              selected ? styles.tabButtonActive : null,
              focusedTab === item.id ? styles.tabButtonFocused : null,
            ]}
          >
            {Glyph ? (
              <Glyph
                color={
                  selected
                    ? pickThemed(colors, colors.accent, colors.primaryDark)
                    : colors.muted
                }
                size={SECTION_TAB_ICON_SIZE}
                strokeWidth={typography.iconStrokeWidth}
              />
            ) : null}
            <Text
              ellipsizeMode="tail"
              maxFontSizeMultiplier={1.6}
              numberOfLines={1}
              style={[styles.tabText, selected ? styles.tabTextActive : null]}
            >
              {item.label}
            </Text>
          </MotionPressable>
        );
      })}
    </View>
  );
}

export function createCustomerSectionTabsStyles(colors: ThemeColors) {
  return StyleSheet.create({
    tabStrip: {
      backgroundColor: colors.fieldMuted,
      borderColor: colors.border,
      borderRadius: radii.sm + SECTION_TAB_TRACK_PADDING,
      borderWidth: 1,
      flexDirection: "row",
      gap: SECTION_TAB_TRACK_PADDING,
      padding: SECTION_TAB_TRACK_PADDING,
    },
    tabButton: {
      alignItems: "center",
      borderRadius: radii.sm,
      borderColor: "transparent",
      borderWidth: 1,
      flexDirection: "row",
      gap: spacing.xs,
      justifyContent: "center",
      minHeight: 44,
      // RN Web inherits the browser/OS accent for its default outline. Keep
      // focus inside the product palette through tabButtonFocused below.
      outlineColor: "transparent",
      outlineWidth: 0,
      paddingHorizontal: spacing.sm,
    },
    tabButtonActive: {
      backgroundColor: colors.card,
      /**
       * The fill is 1.04:1 against the track in BOTH themes (#1A1F1D on #161B19,
       * #FFFFFF on #FAFAFA), so this border is what actually makes the selection
       * perceptible. Per-theme because one green cannot serve both: mint reaches
       * 8.4:1 on the dark track but only 2.0:1 on the near-white one, under the 3:1
       * a UI boundary needs. accentSoft gets light mode to 4.9:1.
       */
      borderColor: pickThemed(colors, colors.accentSoft, colors.primary),
    },
    tabSegmentKeepsLabel: {
      flexGrow: 1,
      flexShrink: 0,
    },
    tabSegmentAbsorbs: {
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
    },
    tabButtonFocused: {
      borderColor: colors.primary,
    },
    tabText: {
      color: colors.muted,
      flexShrink: 1,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: "400",
      textAlign: "center",
    },
    tabTextActive: {
      color: pickThemed(colors, colors.accent, colors.primaryDark),
    },
  });
}
