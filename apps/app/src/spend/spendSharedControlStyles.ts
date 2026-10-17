import type { TextStyle, ViewStyle } from "react-native";

import type { ThemeColors } from "@mobile/theme/colorPalettes";
import { radii, spacing, typography } from "@mobile/theme/tokens";
import { CONTROL_HEIGHT } from "@mobile/spend/spendLayout";

/**
 * The controls more than one GoGoSpend tab renders, declared once.
 *
 * Overview (`CustomerSpendScreen` via `spendStyles.ts`) and Records
 * (`CustomerSpendAllScreen`, which keeps its own stylesheet) each draw the
 * All / Income / Expense segment and the three totals above their list. The
 * rules were two byte-identical copies, comment included, and the owner's
 * 2026-09-12 brand-green call had to be typed into both.
 *
 * `controlDisabled` and `controlPressed` are the same story between Records
 * and Import (`CustomerSpendImportScreen`, also its own stylesheet): both
 * declared the same two one-line opacity rules, word for word.
 *
 * ONLY THESE TEN MOVED. `spendStyles.ts` and `CustomerSpendAllScreen.tsx`
 * still separately declare 27 other key NAMES in common: 20 of them are
 * recorded, each with a reason, in `KNOWN_REMAINING_DUPLICATES` in
 * `spend-shared-controls.test.ts`, and the other seven — `amountCurrency`,
 * `amountInput`, `amountRow`, `chip`, `input`, `monthDropdown`,
 * `primaryButton` — have DIFFERENT bodies. That is why the records page must
 * not simply import `createSpendStyles`: it would repaint those seven
 * controls with the front page's versions and no test would notice.
 *
 * Returns plain objects, not `StyleSheet.create` output, so every caller can
 * spread it into their own `StyleSheet.create`.
 */
export function createSpendSharedControlStyles(colors: ThemeColors) {
  return {
    segmentRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    /*
     * Shared by both tabs, so this floor is fixed for the Overview segment
     * (`CustomerSpendScreen`) and the Records segment (`CustomerSpendAllScreen`)
     * at once. Full-width flex, one of three in a row — nothing else on either
     * tab competes for the extra 4pt, so it is raised outright rather than
     * bought back with hitSlop the way the (compact, wrapping) category chip
     * is. See `tapTarget.ts` / #1749: the painted box is what react-native-web
     * actually honours, so 44 painted clears both the 24pt web floor and the
     * 44pt native one with nothing left to add.
     */
    segmentButton: {
      alignItems: "center",
      borderColor: colors.border,
      borderRadius: radii.chip,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.xs,
    },
    /*
     * The BRAND green, one colour for every button in the app (owner call 2026-09-12).
     *
     * This pill briefly carried a deeper per-theme green (`accent` on light, #007D5E on
     * dark) chosen on 2026-09-11 so a white label could clear 4.5:1. The owner replaced
     * that with brand consistency: a GoGoSpend pill must not be a different green from
     * every other button, even a more readable one.
     *
     * THE COST, recorded rather than hidden: white on #00CC99 is 2.08:1, under the 4.5:1
     * normal-text bar. That is the same figure the app already accepts on ~100 other brand
     * buttons — see `onPrimary` in `colorPalettes` — so this pill now fails exactly as they
     * do rather than differently. `on-primary-label` pins the label token; the ratio is
     * asserted as a measured fact in `quest-period-chip-contrast`.
     */
    segmentButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    segmentButtonLabel: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: 13,
      fontWeight: typography.captionWeight,
      lineHeight: 16,
    },
    segmentButtonLabelActive: {
      /** 7.91:1 on light, 5.13:1 on dark. See the fill for why it moved. */
      color: colors.onPrimary,
      fontWeight: typography.actionWeight,
    },
    framesRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    /*
     * The feedback line, on both tabs. It renders next to the control that set
     * it — never at the foot of the page, which is how "Could not save that"
     * ended up a screenful below Save on the simulator on 2026-09-11.
     */
    message: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      fontWeight: typography.bodyWeight,
      lineHeight: typography.bodyLineHeight,
      paddingTop: spacing.xs,
    },
    /** Failure has to look unlike success; both were `colors.ink` before. */
    messageBad: {
      color: colors.danger,
    },
    /*
     * Disabled and pressed feedback, on Records and Import. `controlDisabled`
     * always follows `busy`; `controlPressed` follows a plain `pressed` on any
     * Pressable that wants touch feedback. Two one-line rules, previously
     * declared byte-for-byte in each screen's own stylesheet.
     */
    controlDisabled: { opacity: 0.4 },
    controlPressed: { opacity: 0.7 },
  } satisfies {
  segmentRow: ViewStyle;
  segmentButton: ViewStyle;
  segmentButtonActive: ViewStyle;
  segmentButtonLabel: TextStyle;
  segmentButtonLabelActive: TextStyle;
  framesRow: ViewStyle;
  message: TextStyle;
  messageBad: TextStyle;
  controlDisabled: ViewStyle;
  controlPressed: ViewStyle;
};
}
