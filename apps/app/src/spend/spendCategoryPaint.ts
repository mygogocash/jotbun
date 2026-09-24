/**
 * A category hue's paint triple: the hue itself, a surface tint derived from
 * it, and the text guaranteed readable on that tint.
 *
 * `spendCategoryLine` already tells this story for the border: one hue was
 * doing two jobs — a 1px border when a chip is unpicked, and the fill behind
 * the label when picked — which forced every hue to be dark enough to read as
 * a hairline AND pale enough to carry dark text. That is why the shipped set
 * comes out pastel rather than expressive. This does the same split for a
 * surface: `hue` is untouched (still the donut arc and the picked fill),
 * `tint` is a card-level surface derived from it, and `onTint` is that surface's
 * own readable text.
 *
 * THE HUE ITSELF DOES NOT MOVE, for the same reason `spendCategoryLine`
 * preserves it: `SPEND_CATEGORY_HUES` records the pastels as light ON PURPOSE
 * — a picked chip puts near-black ink on its own colour, and the owner's "dark
 * purple" was pulled a step lighter for exactly that reason. Darkening `hue`
 * here would reverse that recorded decision.
 *
 * Derived rather than hand-kept, for the reason `SPEND_CATEGORY_HUES`'s own
 * comment gives: a table of thirty values "cannot quietly break" when a future
 * hue is added, because there would be nothing to add it to.
 */

import {
  contrastAgainst,
  leastDarkeningWhere,
  leastLighteningWhere,
  luminanceOf,
  parseHex,
  toHex,
} from "@mobile/spend/colourDarkening";

export type SpendCategoryPaint = {
  readonly hue: string;
  readonly tint: string;
  readonly onTint: string;
};

/** The two cards a tint gets mixed toward. See `colorPalettes.ts` `.card`. */
const LIGHT_CARD = [255, 255, 255]; // #FFFFFF
const DARK_CARD = [26, 31, 29]; // #1A1F1D

/**
 * How much of the hue survives the mix into its card.
 *
 * The two themes need very different weights, not just different cards: a
 * wash toward white can carry a generous helping of hue and still read as a
 * pale surface, but the same helping toward near-black would make the tint
 * itself glow. Light keeps enough hue that twelve categories stay tellable
 * apart on a white card — measured across the eight shipped chips and the
 * twelve custom colours `SPEND_CATEGORY_HUES` offers, the LARGEST raw
 * hue-vs-tint contrast at this weight is 2.8053:1 (#9B7EDB), so every hue's
 * `onTint` always needs deriving; none is already readable unaided.
 *
 * Dark stays a visible wash rather than chasing a margin by shrinking toward
 * the plain card — a tint that has been thinned down to 2-4 RGB units from
 * `#1A1F1D` is not a surface, it is the card with a rounding error, and
 * `tint` exists to be a surface. The margin for `onTint` against a visible
 * tint is earned below by lightening the few hues that need it, not by
 * erasing the tint.
 */
const LIGHT_HUE_WEIGHT = 0.15;
const DARK_HUE_WEIGHT = 0.06;

/** WCAG 1.4.3 AA. `onTint` carries a label, so 4.5:1 rather than a border's 3:1. */
const LIGHT_TEXT_MINIMUM = 4.5;

/**
 * The dark-theme bar is set past the AA floor on purpose, the same move
 * `spendCategoryLine`'s `DARK_TARGET` makes (there, 5.2 against a 3.05 floor)
 * so nothing lands right on the wire. Measured against a 0.06-weight tint,
 * eleven of the thirteen documented hues already clear this without moving;
 * only #4E93D9 (raw 4.82) and #9B7EDB (raw 4.75) need lightening, and the
 * worst case after lightening is #4E93D9 at 5.0038:1 — see the test file for
 * the full sweep.
 */
const DARK_TEXT_MINIMUM = 5.0;

function mixToward(rgb: readonly number[], card: readonly number[], hueWeight: number): number[] {
  return rgb.map((channel, index) => card[index] + (channel - card[index]) * hueWeight);
}

/**
 * The category paint triple for `hue` in the given theme.
 *
 * Returns the input for all three fields when `hue` cannot be parsed: a
 * member's own category can hold whatever the API let through, and one
 * unreadable colour must not take the whole set down with it.
 */
export function spendCategoryPaint(hue: string, isDark: boolean): SpendCategoryPaint {
  const rgb = parseHex(hue);
  if (!rgb) return { hue, tint: hue, onTint: hue };

  const card = isDark ? DARK_CARD : LIGHT_CARD;
  const hueWeight = isDark ? DARK_HUE_WEIGHT : LIGHT_HUE_WEIGHT;
  const tint = toHex(mixToward(rgb, card, hueWeight));
  // The tint's own hex, not the pre-floor mix: this is the exact surface a
  // consumer will paint, so `onTint` must be derived against the exact same
  // luminance a caller (or this file's test) would measure back from it.
  const tintLuminance = luminanceOf(parseHex(tint)!);
  const textMinimum = isDark ? DARK_TEXT_MINIMUM : LIGHT_TEXT_MINIMUM;

  // The hue is already legible on its own tint for most hues in both themes:
  // on light, this essentially never fires (see the weight comment above);
  // on dark, it fires for eleven of the thirteen documented hues, because a
  // pastel is already far lighter than a tint that is still mostly the
  // near-black card — the effect `spendCategoryLine` documents at
  // 6.7:1-10.9:1 for the raw hues against that same card.
  if (contrastAgainst(rgb, tintLuminance) >= textMinimum) {
    return { hue, tint, onTint: hue };
  }

  if (isDark) {
    // On a dark tint the text needs to get LIGHTER to pull away from it —
    // `leastDarkeningWhere` only ever darkens, which would push the hue
    // toward the tint here, not away from it. `leastLighteningWhere` is that
    // missing direction. Its `enough` predicate checks the FLOORED emitted
    // candidate, not the pre-floor one the search bisects over: toHex's floor
    // is safe when darkening against a light surface but pulls a lightened
    // channel back toward the original colour, which can silently drop
    // contrast below the bar it was just measured to clear — the same class
    // of miss `colourDarkening.ts` documents for Money Lover's green.
    const onTint = toHex(
      leastLighteningWhere(rgb, (candidate) => {
        const floored = parseHex(toHex(candidate))!;
        return contrastAgainst(floored, tintLuminance) >= textMinimum;
      }),
    );
    return { hue, tint, onTint };
  }

  // Otherwise darken the hue, the same move `brandMarkFill` makes against a
  // fixed white — here the fixed reference is the tint's own luminance.
  const onTint = toHex(
    leastDarkeningWhere(
      rgb,
      (candidate) => contrastAgainst(candidate, tintLuminance) >= textMinimum,
    ),
  );
  return { hue, tint, onTint };
}
