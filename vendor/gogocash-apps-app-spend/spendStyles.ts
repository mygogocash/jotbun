import { StyleSheet, type ViewStyle } from "react-native";

import { pickThemed, type ThemeColors } from "@mobile/theme/colorPalettes";
import { elevationCss, materialGlass } from "@mobile/theme/elevation";
import { radii, spacing, typography } from "@mobile/theme/tokens";
import { createSpendSharedControlStyles } from "@mobile/spend/spendSharedControlStyles";
import {
  SPEND_INTRO_CAPTION_LIFT,
  SPEND_INTRO_CUP_LOOK,
  SPEND_INTRO_FRAME,
} from "@mobile/spend/spendIntro";
import {
  AMOUNT_TYPE_LIFT,
  CONTROL_HEIGHT,
  FAB_SIZE,
  EDIT_BUTTON_HEIGHT,
  ENTRY_GROUP_OUTER_GAP,
  ENTRY_GROUP_ROW_GAP,
  INTRO_GROUP_GAP,
  INTRO_HEADLINE_LINE,
  INTRO_HEADLINE_SIZE,
  INTRO_PAIR_GAP,
  INTRO_SUM_HEIGHT,
  INTRO_SUM_RADIUS,
  PANEL_RADIUS,
  SAVE_BUTTON_HEIGHT,
  SEGMENT_TRACK_PADDING,
} from "@mobile/spend/spendLayout";

/*
 * Moved out of `CustomerSpendScreen` unchanged. A thousand lines of stylesheet
 * on the end of a screen file is most of why that file could hide a render-tree
 * bug: the markup and the rules it reads were a full screen's scroll apart.
 */
export function createSpendStyles(colors: ThemeColors) {
  return StyleSheet.create({
    /*
     * "C · lit panel" (owner call 2026-08-30). A raised, green-tinted surface
     * with a shadow under it, so the thing a member types into sits ON the
     * screen. Rounder than the cards below it — corner radius was deliberately
     * left out of the locked spec, so the panel may lead.
     */
    /** The gradient sits behind everything and must never eat a tap. */
    panelWash: {
      bottom: 0,
      left: 0,
      pointerEvents: "none",
      position: "absolute",
      right: 0,
      top: 0,
    },
    addPanel: {
      // Under the gradient, not instead of it — the wash covers this entirely.
      // It only shows if the Svg fails to draw, and then the panel still reads.
      backgroundColor: colors.panelRaised,
      borderColor: pickThemed(colors, colors.borderStrong, "#34544A"),
      borderRadius: PANEL_RADIUS,
      borderWidth: 1,
      /*
       * Was `elevation: 10` plus four `shadow*` props: five keys that
       * react-native-web 0.21 deprecates and warns on once per prop, and the
       * second shadow API in this one file — the other surfaces here all use
       * the CSS string. `floating` is the rung this panel always meant.
       *
       * The numbers move, deliberately. 0.34 opacity at radius 24 was one
       * hand-tuned pair used unchanged on a #FFFFFF ground and a #1A1F1D one;
       * it cannot have been right on both. Light gets softer, dark gets
       * darker and tighter, which is the whole reason the ladder is
       * theme-aware (theme/elevation.ts:48-98).
       */
      boxShadow: elevationCss(colors, "floating"),
      gap: spacing.sm,
      padding: spacing.md,
    },
    /*
     * `card` — the ladder's resting rung, one step off the page and no more.
     * This block is also the base for `cashbackCard` and `summaryHeroCard`,
     * which are gap/border modifiers applied beside it rather than surfaces of
     * their own, so all three lift together from here. Do not add a second
     * shadow to either of them.
     */
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      boxShadow: elevationCss(colors, "card"),
      gap: spacing.sm,
      padding: spacing.md,
    },
    cardTitle: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.title,
      fontWeight: typography.titleWeight,
      lineHeight: typography.titleLineHeight,
    },
    /* ── the first look ──────────────────────────────────────────── */
    /** The intro's whole rhythm. See INTRO_GROUP_GAP for why it lives here. */
    introPage: {
      gap: INTRO_GROUP_GAP,
    },
    /** Headline and its line underneath, read as one thing. */
    introHeadGroup: {
      gap: INTRO_PAIR_GAP,
    },
    /*
     * The same values in light and dark, on purpose — see SPEND_INTRO_FRAME.
     * `overflow: hidden` is load-bearing: the cup is wider than its corner and
     * is meant to be cut off by the block's edge.
     */
    introSum: {
      alignItems: "center",
      // Under the wash, not instead of it. Only shows if the Svg fails to
      // draw, and then the block still reads.
      backgroundColor: SPEND_INTRO_FRAME.gradientTo,
      borderColor: SPEND_INTRO_FRAME.edge,
      borderRadius: INTRO_SUM_RADIUS,
      borderWidth: 1,
      gap: 6,
      justifyContent: "center",
      minHeight: INTRO_SUM_HEIGHT,
      overflow: "hidden",
      paddingHorizontal: spacing.md,
      paddingVertical: 26,
    },
    /** Behind everything, and must never eat a tap. */
    introSumWash: {
      bottom: 0,
      left: 0,
      pointerEvents: "none",
      position: "absolute",
      right: 0,
      top: 0,
    },
    introSpill: {
      bottom: 0,
      left: 0,
      pointerEvents: "none",
      position: "absolute",
      right: 0,
      top: 0,
    },
    /*
     * The system emoji, so no `fontFamily` — the platform's own emoji font is
     * what should draw it, and naming Apple's would break Android. It cannot be
     * recoloured, so opacity is the only lever (owner call 2026-08-30).
     */
    introCup: {
      bottom: SPEND_INTRO_CUP_LOOK.bottom,
      fontSize: SPEND_INTRO_CUP_LOOK.fontSize,
      height: SPEND_INTRO_CUP_LOOK.size,
      lineHeight: SPEND_INTRO_CUP_LOOK.size,
      opacity: SPEND_INTRO_CUP_LOOK.opacity,
      position: "absolute",
      right: SPEND_INTRO_CUP_LOOK.right,
      transform: [{ rotate: SPEND_INTRO_CUP_LOOK.rotation }],
      width: SPEND_INTRO_CUP_LOOK.size,
    },
    introDrop: {
      backgroundColor: SPEND_INTRO_FRAME.figure,
      position: "absolute",
    },
    introSumSmall: {
      color: SPEND_INTRO_FRAME.caption,
      fontFamily: typography.family,
      fontSize: typography.caption + SPEND_INTRO_CAPTION_LIFT,
      lineHeight: typography.captionLineHeight + SPEND_INTRO_CAPTION_LIFT,
      textAlign: "center",
    },
    introSumBig: {
      color: SPEND_INTRO_FRAME.figure,
      fontFamily: typography.family,
      fontSize: typography.displayLg.size,
      fontVariant: ["tabular-nums"],
      fontWeight: "700",
      /*
       * The THAI leading, unconditionally. 58/61 was a ratio of 1.05, under
       * the 1.08 Anuphan floor display-type-scale.test.ts enforces on every
       * display token — the marks Anuphan carries above and below the line had
       * 3px to live in. A slightly loose Latin line is the cost; a clipped
       * Thai mark is not a cost, it is a bug, and happy-dom cannot see either.
       *
       * Not read per-locale: these styles are memoized per THEME, so a
       * locale-sensitive leading would go stale on a language switch.
       */
      lineHeight: typography.displayLg.lineTh,
    },
    introHeadline: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: INTRO_HEADLINE_SIZE,
      fontWeight: typography.pageTitleWeight,
      lineHeight: INTRO_HEADLINE_LINE,
    },
    introSub: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.label,
      lineHeight: typography.bodyLineHeight,
    },
    introPoints: {
      gap: spacing.md,
    },
    introPoint: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    introMark: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderRadius: radii.chip,
      height: 26,
      justifyContent: "center",
      marginTop: 1,
      width: 26,
    },
    introMarkGlyph: {
      color: colors.primary,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.actionWeight,
    },
    introPointBody: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    introPointTitle: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.action,
      fontWeight: typography.titleWeight,
      lineHeight: typography.actionLineHeight,
    },
    introPointLine: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      lineHeight: typography.captionLineHeight,
    },
    introStart: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: radii.chip,
      justifyContent: "center",
      minHeight: 48,
    },
    introStartLabel: {
      color: colors.onPrimary,
      fontFamily: typography.family,
      fontSize: typography.action,
      fontWeight: typography.actionWeight,
      lineHeight: typography.actionLineHeight,
    },
    /*
     * The Quest tab strip, copied (owner call 2026-08-30: "make 1st item the
     * same design as 2nd"). A track with the segments inside it, and selection
     * shown by a lighter fill plus a coloured border rather than a solid green
     * pill — which is what made it read as another Save button.
     *
     * Every segment carries the border so only its COLOUR changes on selection;
     * adding a border on activation would shift the label by 1px.
     */
    segment: {
      backgroundColor: colors.fieldMuted,
      borderColor: colors.panelLine,
      borderRadius: radii.sm + SEGMENT_TRACK_PADDING,
      borderWidth: 1,
      flexDirection: "row",
      gap: SEGMENT_TRACK_PADDING,
      padding: SEGMENT_TRACK_PADDING,
    },
    segmentOption: {
      alignItems: "center",
      borderColor: "transparent",
      borderRadius: radii.sm,
      borderWidth: 1,
      flex: 1,
      flexDirection: "row",
      gap: spacing.xs,
      justifyContent: "center",
      // The pressable IS the segment, so the 44 floor lives here — the track's
      // own padding is not tappable.
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.sm,
    },
    /*
     * The ring, not a colour swap: the chosen segment keeps its normal look so
     * nothing suggests the guess is wrong — only that it is unconfirmed.
     */
    segmentOptionAsk: {
      borderColor: colors.warning,
    },
    segmentOptionOn: {
      backgroundColor: colors.card,
      // One green cannot serve both themes at a 3:1 boundary — same per-theme
      // pick the Quest strip makes.
      borderColor: pickThemed(colors, colors.accentSoft, colors.primary),
    },
    /** Stands in for the Quest tab's icon, so the row gap spaces it the same. */
    segmentArrow: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
    },
    segmentLabel: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: "400",
      textAlign: "center",
    },
    segmentLabelOn: {
      color: pickThemed(colors, colors.accent, colors.primaryDark),
    },
    /*
     * Rows inside keep the panel's own rhythm; the margins are the whole point
     * of the wrapper — they widen only the seams at the group's edges.
     *
     * The two margins are deliberately UNEQUAL so the two gaps LOOK equal
     * (owner call 2026-08-30). At the top, the amount row centres a 20pt glyph
     * in a 53pt box, so ~13pt of that row's own slack reads as part of the gap.
     * At the bottom there is no slack — the note field's border is its edge —
     * so that 13pt is added back as margin.
     */
    entryGroup: {
      gap: ENTRY_GROUP_ROW_GAP,
      /*
       * The same air above and below (owner call 2026-09-07: "smoother").
       * It used to be 6 above and 19 below, which read as the group sliding
       * toward Save; the wrapper's job is to set the group apart, not to lean.
       */
      marginBottom: ENTRY_GROUP_OUTER_GAP,
      marginTop: ENTRY_GROUP_OUTER_GAP,
    },
    /* The picker owns its own heading, strip and calendar. */
    entryDateRow: {
      gap: spacing.sm,
    },
    amountRow: {
      alignItems: "center",
      borderBottomColor: colors.panelLine,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: spacing.xs,
    },
    amountCurrency: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.title,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.titleWeight,
    },
    amountInput: {
      color: colors.ink,
      flex: 1,
      // Without this the field keeps its intrinsic width and shoves the
      // trailing camera button off the panel's right edge.
      minWidth: 0,
      fontFamily: typography.family,
      // +8 on the headline scale (owner call 2026-08-30) — the typed number is
      // the one thing on this panel that should be unmissable.
      fontSize: typography.headline + AMOUNT_TYPE_LIFT,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.pageTitleWeight,
      /*
       * Both of these are load-bearing on iOS (seen on the simulator
       * 2026-09-11): at 36px with no explicit line box, the field clipped the
       * top of its own digits — the grey placeholder nought rendered as a bare
       * "u" and a typed 8 lost its upper loop. The line box has to be told to
       * clear the type, and the default vertical padding then has to come off
       * or the taller box pushes the baseline into the divider below.
       */
      lineHeight: CONTROL_HEIGHT + AMOUNT_TYPE_LIFT,
      paddingVertical: 0,
      // Raised with the type: the 44 floor no longer clears a 36px line.
      minHeight: CONTROL_HEIGHT + AMOUNT_TYPE_LIFT,
    },
    /*
     * The slip source menu. Sits in the flow under the amount rather than
     * floating: the panel is inside a scroll view, and an absolute menu here
     * was clipped by the categories row below it.
     */
    slipMenu: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1,
      /*
       * `raised`, not `floating`: the comment above is right that this sits in
       * the flow rather than over anything. What the depth buys is that an
       * OPEN menu stops looking like one more bordered row in the panel it
       * opened inside.
       */
      boxShadow: elevationCss(colors, "raised"),
      overflow: "hidden",
    },
    slipMenuItem: {
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      justifyContent: "center",
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.md,
    },
    slipMenuLabel: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      fontWeight: typography.actionWeight,
      lineHeight: typography.bodyLineHeight,
    },
    /*
     * Same 38 height as Save, so the amount line ends on a control that lines
     * up with the panel's other edges instead of a stray icon.
     */
    cameraButton: {
      alignItems: "center",
      borderColor: colors.panelLine,
      borderRadius: radii.chip,
      borderWidth: 1,
      flexShrink: 0,
      height: SAVE_BUTTON_HEIGHT,
      justifyContent: "center",
      width: 44,
    },
    cameraButtonOn: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    slipHint: {
      color: colors.primary,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.labelWeight,
    },
    /*
     * A failed read is not an alarm — the member is already sitting where they
     * can type the amount themselves, so it reads as a note, not an error.
     */
    slipHintBad: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.captionWeight,
      lineHeight: typography.captionLineHeight,
    },
    /** Denied camera/photos recovery (#2651) — title + body + Open Settings. */
    slipMediaDenied: {
      gap: spacing.xs,
    },
    slipMediaDeniedTitle: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: "700",
      lineHeight: typography.captionLineHeight,
    },
    slipOpenSettingsButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      borderColor: colors.borderStrong,
      borderRadius: radii.chip,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 36,
      paddingHorizontal: spacing.sm,
    },
    slipOpenSettingsText: {
      color: colors.accent,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: "700",
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    /*
     * Profile's Edit button, copied down to its 32pt height (owner call
     * 2026-08-30: "same design as 3rd item, especially size").
     *
     * That height is BELOW the 44pt floor in UI_DESIGN_SYSTEM §1. The Edit
     * button has always been under it, so this matches a shipped exception
     * rather than inventing one — but it is an exception, and the owner has
     * been told. One number here takes it back to 44.
     */
    chip: {
      alignItems: "center",
      borderColor: colors.borderStrong,
      borderRadius: radii.chip,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      height: EDIT_BUTTON_HEIGHT,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
    },
    /** A category the member invented has no hue, so selection falls back to brand. */
    chipOnNeutral: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipNew: {
      borderStyle: "dashed",
    },
    chipEmoji: {
      fontSize: 15,
    },
    chipLabel: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: 13,
      fontWeight: "500",
    },
    /*
     * A chosen chip is filled with its hue at full strength, so the label needs
     * a dark ink: every hue in the set is a light pastel, and the theme's own
     * ink is near-white on the dark theme.
     */
    chipLabelOn: {
      color: colors.onPrimaryDark,
      fontWeight: "700",
    },
    chipLabelOnNeutral: {
      color: colors.onPrimary,
      fontWeight: "700",
    },
    input: {
      borderColor: colors.panelLine,
      borderRadius: radii.md,
      borderWidth: 1,
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.sm,
    },
    placeholder: {
      color: colors.placeholder,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: radii.chip,
      justifyContent: "center",
      marginTop: spacing.xs,
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.md,
    },
    /*
     * Full panel width (owner call 2026-08-30) at 38 tall — BELOW the 44 floor
     * in UI_DESIGN_SYSTEM §1, the same exception the category chips carry. The
     * full width keeps the target easy to hit despite the short height.
     *
     * No marginTop: the entry group's own marginBottom sets the gap, and both
     * would stack.
     */
    saveButton: {
      alignItems: "center",
      alignSelf: "stretch",
      backgroundColor: colors.primary,
      borderRadius: radii.chip,
      justifyContent: "center",
      minHeight: SAVE_BUTTON_HEIGHT,
      paddingHorizontal: spacing.lg,
    },
    saveLabel: {
      color: colors.onPrimary,
      fontFamily: typography.family,
      fontSize: typography.label,
      fontWeight: typography.actionWeight,
      lineHeight: typography.labelLineHeight,
    },
    primaryLabel: {
      color: colors.onPrimary,
      fontFamily: typography.family,
      fontSize: typography.action,
      fontWeight: typography.actionWeight,
      lineHeight: typography.actionLineHeight,
    },
    secondaryButton: {
      alignItems: "center",
      borderColor: colors.borderStrong,
      borderRadius: radii.chip,
      borderWidth: 1,
      justifyContent: "center",
      marginTop: spacing.xs,
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.md,
    },
    secondaryLabel: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.action,
      fontWeight: typography.actionWeight,
      lineHeight: typography.actionLineHeight,
    },
    /* Every number below is FavoriteBrandsHero's — the banner this copies. */
    historyCard: {
      alignItems: "center",
      backgroundColor: pickThemed(colors, "#F2FBF8", colors.fieldMuted),
      borderColor: pickThemed(colors, "#D8F0E8", colors.border),
      borderRadius: radii.lg,
      borderWidth: 1,
      boxShadow: "0 4px 16px rgba(16, 53, 34, 0.10)",
      flexDirection: "row",
      gap: spacing.md,
      overflow: "hidden",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    historyCopy: {
      alignItems: "flex-start",
      flex: 1,
      gap: spacing.xs,
      minWidth: 0,
    },
    historyTitle: {
      color: colors.primaryDark,
      fontFamily: typography.family,
      fontSize: 17,
      fontWeight: "700",
      lineHeight: 22,
    },
    historyLine: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: 15,
      lineHeight: 18,
    },
    /*
     * 36 is the banner's own button height. Below the 44 floor, and allowed
     * here for the same reason the shortcut card allows it: this is a label
     * inside the target, not the target.
     */
    historyPill: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: radii.chip,
      justifyContent: "center",
      marginTop: spacing.xs,
      minHeight: 36,
      paddingHorizontal: spacing.lg,
    },
    historyPillLabel: {
      color: colors.onPrimary,
      fontFamily: typography.family,
      fontSize: typography.label,
      fontWeight: typography.actionWeight,
      lineHeight: typography.labelLineHeight,
    },
    /*
     * Stands in for the rendered artwork the sibling banners carry. The circle
     * holds the picture's footprint, so real art can replace the icon without
     * the copy column changing width. `borderColor` doubles as the icon's own
     * colour — react-native-svg takes it as a prop, not a style.
     */
    historyArt: {
      alignItems: "center",
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
      borderRadius: radii.chip,
      borderWidth: 1,
      height: 76,
      justifyContent: "center",
      width: 76,
    },
    deltaDown: {
      // #00CC99 is ~2:1 on this card. accentSoft (#007D5E, ~5.1:1) is the
      // legible brand green and the pair duoValueIn / duoFillIn already use.
      color: pickThemed(colors, colors.accentSoft, colors.primary),
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.labelWeight,
      lineHeight: typography.captionLineHeight,
    },
    deltaUp: {
      color: colors.danger,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.labelWeight,
      lineHeight: typography.captionLineHeight,
    },
    metric: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.bodyWeight,
      lineHeight: typography.bodyLineHeight,
    },
    cashbackValue: {
      // #00CC99 is ~2:1 on this card. accentSoft (#007D5E, ~5.1:1) is the
      // legible brand green and the pair duoValueIn / duoFillIn already use.
      color: pickThemed(colors, colors.accentSoft, colors.primary),
      fontFamily: typography.family,
      fontSize: typography.body,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.actionWeight,
      lineHeight: typography.bodyLineHeight,
    },
    step: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.captionWeight,
      lineHeight: typography.captionLineHeight,
    },
    pieRow: {
      gap: spacing.xs,
    },
    pieHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    pieTrack: {
      backgroundColor: colors.fieldMuted,
      borderRadius: radii.sm,
      height: 6,
    },
    pieBar: {
      backgroundColor: colors.primary,
      borderRadius: radii.sm,
      height: 6,
    },
    viewAll: {
      alignItems: "center",
      borderTopColor: colors.border,
      borderTopWidth: 1,
      justifyContent: "center",
      minHeight: CONTROL_HEIGHT,
    },
    viewAllLabel: {
      color: colors.primary,
      fontFamily: typography.family,
      fontSize: typography.action,
      fontWeight: typography.actionWeight,
      lineHeight: typography.actionLineHeight,
    },
    loadFailedTitle: {
      color: colors.ink,
      fontFamily: typography.family,
      /*
       * `title`, not `headline`: there is no `headlineLineHeight` token, and a
       * 28px headline with a 28px line box is the clipping bug #2630 fixed in
       * the amount field. The title pair is the largest scale that ships with
       * a line height measured for it.
       */
      fontSize: typography.title,
      fontWeight: typography.pageTitleWeight,
      lineHeight: typography.titleLineHeight,
    },
    /* ── the add sheet and the button that raises it ──────────────── */
    /** A definite box for the floating button to anchor against. */
    screenRoot: {
      flex: 1,
    },
    addFab: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: FAB_SIZE / 2,
      /*
       * `floating` — the top of theme/elevation.ts's ladder, and the only
       * surface on this page that earns it. The button is absolute over a
       * scrolling list of cards and had no depth at all: on the light theme
       * its edge against a pale card was the only thing saying it was in
       * front, and a card scrolling under it read as a collision.
       *
       * `zIndex` alone cannot say this. It settles paint order; it draws
       * nothing.
       */
      boxShadow: elevationCss(colors, "floating"),
      height: FAB_SIZE,
      justifyContent: "center",
      position: "absolute",
      right: spacing.md,
      width: FAB_SIZE,
      /* Over the page's own cards, under the modal the sheet opens in. */
      zIndex: 2,
    },
    /** Read for its colour by the glyph; never applied to a View. */
    addFabGlyph: {
      color: colors.onPrimary,
    },
    /*
     * Lighter than the `#00000099` / `#00000066` it replaces (light was the
     * HEAVIER of the two, at 60% black, with nothing on record saying why).
     * The sheet is glass now, and a 60%-black scrim leaves nothing behind the
     * pane for the blur to blur — the material would read as a flat grey card
     * and the `floating` shadow under it would be invisible. The separation
     * moves off the scrim and onto the sheet itself.
     */
    sheetBackdrop: {
      backgroundColor: pickThemed(colors, "#00000059", "#00000040"),
      flex: 1,
      justifyContent: "flex-end",
    },
    /** The blur layer under the sheet's content — never a touch target. */
    sheetGlass: {
      pointerEvents: "none",
    },
    /*
     * Web frost. expo-blur's web build drags a ~0.7 darkening scrim along
     * with `intensity` (CustomerMobileBottomNav.tsx:452-459), so web drives
     * backdrop-filter directly at materialGlass's own px value instead.
     * `saturate(150%)` matches the bottom nav's frost exactly, so GoGoSpend
     * gains no second glass recipe.
     *
     * The two web-only CSS properties are cast through a parenthesized
     * spread, not a trailing `} as ViewStyle,` on this block itself: RN's
     * `ViewStyle` has no `backdropFilter` member (see `bottomNavBlurWeb` for
     * the same cast), and a cast suffixed onto THIS block's own close is
     * exactly what spend-depth-ladder.test.ts's block scanner cannot read —
     * it finds a style by its bare `},` close, and a suffixed close makes it
     * swallow the next style whole.
     */
    sheetGlassWeb: {
      ...({
        backdropFilter: `blur(${materialGlass(colors).blurCssPx}px) saturate(150%)`,
        WebkitBackdropFilter: `blur(${materialGlass(colors).blurCssPx}px) saturate(150%)`,
      } as ViewStyle),
      pointerEvents: "none",
    },
    sheet: {
      /*
       * The translucent fallback, not `colors.card`. On a path where the blur
       * cannot render — an Android Modal is its own window, so
       * dimezisBlurView may have nothing behind it to sample — this alone
       * still reads as a tinted pane over the month rather than a clear one.
       */
      backgroundColor: materialGlass(colors).backgroundColor,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      boxShadow: elevationCss(colors, "floating"),
      gap: spacing.sm,
      /*
       * Load-bearing with the glass: the blur layer is an absolute fill, and
       * without a clip it paints square corners straight over the two top
       * radii above it.
       */
      overflow: "hidden",
      /*
       * Room for the sheet to grow with its content, but never the whole
       * screen: leaving the page visible behind it is what says this is a
       * layer over the month rather than a page that replaced it.
       */
      maxHeight: "88%",
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    sheetHead: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    sheetTitle: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.title,
      fontWeight: typography.pageTitleWeight,
      lineHeight: typography.titleLineHeight,
    },
    sheetClose: {
      alignItems: "center",
      /** 44pt floor — every control a finger touches. */
      height: CONTROL_HEIGHT,
      justifyContent: "center",
      width: CONTROL_HEIGHT,
    },
    cashbackCard: {
      gap: spacing.sm,
    },
    cashbackRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "space-between",
      /** 44pt floor: the offers row is a control (UI_DESIGN_SYSTEM §1). */
      minHeight: CONTROL_HEIGHT,
    },
    summaryHeroCard: {
      borderColor: pickThemed(colors, "#3B4A44", colors.borderStrong),
      gap: spacing.md,
    },
    /*
     * The tappable body. It carries the card's own gap, because wrapping the
     * rows in one view took them out of the card's flex gap and stacked the
     * frames, the chart and the list flush against each other.
     */
    summaryBody: {
      gap: spacing.md,
    },
    monthSection: {
      position: "relative",
      zIndex: 10,
    },
    monthDropdown: {
      alignItems: "center",
      backgroundColor: colors.fieldMuted,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 44,
      paddingHorizontal: spacing.md,
    },
    monthDropdownLabel: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: 17,
      fontWeight: typography.actionWeight,
      lineHeight: typography.bodyLineHeight,
    },
    monthMenu: {
      backgroundColor: colors.fieldMuted,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      /* Same level as slipMenu — one treatment for one idea across the tabs. */
      boxShadow: elevationCss(colors, "raised"),
      marginTop: spacing.xs,
      overflow: "hidden",
    },
    monthMenuItem: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.md,
    },
    monthMenuItemActive: {
      backgroundColor: colors.primarySoft,
    },
    monthMenuItemText: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      lineHeight: typography.bodyLineHeight,
    },
    monthMenuItemTextActive: {
      color: colors.primary,
      fontWeight: typography.actionWeight,
    },
    monthMenuItemSub: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontVariant: ["tabular-nums"],
      lineHeight: typography.captionLineHeight,
    },
    ...createSpendSharedControlStyles(colors),
    frameCard: {
      backgroundColor: colors.fieldMuted,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      flex: 1,
      gap: 3,
      minWidth: 0,
      paddingHorizontal: 9,
      paddingVertical: 10,
    },
    frameLabel: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: 13,
      fontWeight: typography.captionWeight,
      lineHeight: 14,
    },
    frameValue: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: 15,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
      lineHeight: 18,
    },
    /*
     * The card is read in bands — filters, then the chart, then the
     * categories. `md` above the chart's heading and below the chart itself
     * makes the three read apart at a glance (owner call 2026-09-07), where the
     * card's own `sm` gap had them running together.
     */
    sectionLeadRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    sectionLeadText: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.labelWeight,
      lineHeight: typography.captionLineHeight,
    },
    /*
     * "All" · money in against money out, two lengths off one edge (owner call
     * 2026-09-07). The larger fills the scale, so an overspent month just flips
     * which bar is long — no negative widths, nothing invented.
     */
    duo: {
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    duoRow: {
      gap: 5,
    },
    duoHead: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    duoLabelIn: {
      // Match frameLabel / duoBalanceLabel — semantic colour stays on amounts.
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      lineHeight: typography.captionLineHeight,
    },
    duoValueIn: {
      color: pickThemed(colors, colors.accentSoft, colors.primary),
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.actionWeight,
      lineHeight: typography.captionLineHeight,
    },
    duoLabelOut: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      lineHeight: typography.captionLineHeight,
    },
    duoValueOut: {
      color: colors.danger,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.actionWeight,
      lineHeight: typography.captionLineHeight,
    },
    duoTrack: {
      backgroundColor: colors.fieldMuted,
      borderRadius: radii.sm,
      height: 14,
      overflow: "hidden",
    },
    duoFillIn: {
      backgroundColor: pickThemed(colors, colors.accentSoft, colors.primary),
      borderRadius: radii.sm,
      height: 14,
    },
    duoFillOut: {
      backgroundColor: colors.danger,
      borderRadius: radii.sm,
      height: 14,
    },
    /** The answer the two bars are being compared for, so it closes them off. */
    duoBalance: {
      alignItems: "baseline",
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingTop: spacing.xs,
    },
    duoBalanceLabel: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      lineHeight: typography.captionLineHeight,
    },
    /*
     * The month's answer, so it gets what every other amount on this card
     * already has: tabular digits, so it lines up under the two bar totals it
     * is the difference of, and a line box of its own — the #2630 clipping
     * class, which happy-dom cannot see.
     */
    duoBalanceLeft: {
      color: pickThemed(colors, colors.accentSoft, colors.primary),
      fontFamily: typography.family,
      fontSize: typography.body,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.actionWeight,
      lineHeight: typography.bodyLineHeight,
    },
    duoBalanceShort: {
      color: colors.danger,
      fontFamily: typography.family,
      fontSize: typography.body,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.actionWeight,
      lineHeight: typography.bodyLineHeight,
    },
    /** One direction's categories, headed only when both are on screen. */
    groupWrap: {
      gap: spacing.sm,
    },
    groupHead: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
    },
    groupDotIn: {
      backgroundColor: pickThemed(colors, colors.accentSoft, colors.primary),
      borderRadius: 2,
      height: 9,
      width: 9,
    },
    groupDotOut: {
      backgroundColor: colors.danger,
      borderRadius: 2,
      height: 9,
      width: 9,
    },
    groupHeadLabel: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.labelWeight,
      letterSpacing: 0.6,
      lineHeight: typography.captionLineHeight,
      textTransform: "uppercase",
    },
    donutWrap: {
      alignItems: "center",
      flexDirection: "row",
      // 24 between the ring and its names (owner call 2026-09-07).
      gap: spacing.lg,
      marginBottom: spacing.md,
      paddingVertical: spacing.xs,
    },
    /*
     * The ring spends whatever width the names do not need, and stays round
     * doing it — `flex: 1` for the leftover, `aspectRatio` to keep it square,
     * so the Svg inside can be 100% of both and let the viewBox do the scaling.
     */
    donutRing: {
      aspectRatio: 1,
      flex: 1,
    },
    /*
     * Sized by its own text now, not by what is left over. `flexShrink` keeps
     * a long category name giving way on a narrow phone rather than shoving
     * the ring off the card.
     */
    donutLegend: {
      flexShrink: 1,
      gap: 5,
      minWidth: 0,
    },
    donutLegendRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
    },
    donutDot: {
      borderRadius: 3,
      flexShrink: 0,
      height: 10,
      width: 10,
    },
    donutLegendText: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: 13,
      fontWeight: typography.bodyWeight,
      lineHeight: 16,
    },
  });
}
