import { spacing, typography } from "@mobile/theme/tokens";

/*
 * GoGoSpend's layout numbers, in one place because two modules need them: the
 * screen's markup and `createSpendStyles`. They lived beside the markup while
 * the screen was one file; nothing about their meaning changed when the file
 * was split, so neither did their values or the reasoning above each one.
 */

export const INTRO_GROUP_GAP = 32;
export const INTRO_PAIR_GAP = 8;
/**
 * 8px down from `typography.headline` (owner call 2026-08-30). Below
 * `typography.displayLg.size` by a wide margin, which is the point — the eye
 * is meant to land on the number first and only then read the sentence.
 */
export const INTRO_HEADLINE_SIZE = typography.headline - 8;
export const INTRO_HEADLINE_LINE = 26;

/* ── the first look's figure frame ───────────────────────────────── */
export const INTRO_SUM_GRADIENT_ID = "spendIntroSum";
/**
 * Squarer than `radii.lg`, and taller than the content needs. Both were set on
 * the preview the owner approved: the block has to read as an object before it
 * reads as text, and at the card radius it read as another card.
 */
export const INTRO_SUM_RADIUS = 20;
export const INTRO_SUM_HEIGHT = 214;

/** Gradient ids are module constants — see the Quest card for why. */
export const PANEL_BASE_GRADIENT_ID = "spendPanelBase";

/** Shared by the panel's own corner and the gradient painted inside it. */
export const PANEL_RADIUS = 26;
export const PANEL_GLOW_GRADIENT_ID = "spendPanelGlow";

/** 44pt floor — every control a finger touches (UI_DESIGN_SYSTEM §1). */
export const CONTROL_HEIGHT = 44;

/** The Quest tab strip's track padding, so the two strips stay identical. */
export const SEGMENT_TRACK_PADDING = 4;

/** Profile's Edit button height. Below the 44 floor — see the `chip` comment. */
export const EDIT_BUTTON_HEIGHT = 32;

/** Owner's chosen Save height. Below the 44 floor — see the `saveButton` comment. */
export const SAVE_BUTTON_HEIGHT = 38;

/** How much bigger the typed amount runs than the headline scale. Owner's number. */
export const AMOUNT_TYPE_LIFT = 8;

/**
 * 4 more than the panel's own `spacing.sm` rhythm (owner call 2026-08-30) — the
 * amount, categories and note need room to breathe now that the typed number
 * runs at 36pt.
 */
export const ENTRY_GROUP_ROW_GAP = spacing.sm + 4;

/**
 * Air above and below the entry group, on top of the panel's own `spacing.sm`.
 *
 * Equal on both sides (owner call 2026-09-07). The group carried 6 above and 19
 * below, which put 16 between it and the row above and 29 between it and Save —
 * enough of a difference to read as a mistake rather than a grouping.
 */
export const ENTRY_GROUP_OUTER_GAP = spacing.sm;


/**
 * How far the add button floats above the bottom safe-area inset.
 *
 * Clear of the bottom nav rather than over it: the nav is the way out of
 * GoGoSpend, and a button covering Home would cost more than it gave.
 */
export const FAB_CLEARANCE = 76;

/** 56pt, the floor for a primary floating action — above the 44 minimum. */
export const FAB_SIZE = 56;
