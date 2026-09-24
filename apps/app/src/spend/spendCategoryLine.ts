/**
 * The border colour for a category chip, which is NOT its hue.
 *
 * An unpicked chip draws its category's hue as a 1px border. Measured against
 * the white card every hue in both palettes lands between 1.53:1 and 2.49:1 —
 * Fun and Bonus at 1.53:1 are effectively invisible — where WCAG 1.4.11 asks
 * 3:1 for the boundary of a UI component. GoGoSpend already holds that line
 * everywhere else and did so deliberately: `panelLine` was tuned to exactly
 * 3.00:1 and `controlLine` to 3.76:1, each stopped at the threshold on purpose
 * and one of them faded twice on the owner's call. The category chips are the
 * one control that never got the same treatment.
 *
 * THE HUE ITSELF DOES NOT MOVE. It is the fill behind a picked chip and the
 * colour of the donut arc, and `SPEND_CATEGORY_HUES` records that the pastels
 * are light ON PURPOSE — a chosen chip puts near-black ink on its own colour,
 * and the owner's "dark purple" was pulled a step lighter for exactly that
 * reason. Darkening the hue to fix the border would make the label unreadable
 * and reverse a recorded decision. So the border gets a colour of its own, the
 * same move `SPEND_BANKS` already makes where three bank hues are darkened for
 * their placeholder letters and nothing else.
 *
 * Derived rather than hand-kept. The palette's own comment worries that "a
 * future addition cannot quietly break it" — a table would need editing every
 * time a hue is added, and would be forgotten. This gives a new hue a correct
 * border on the day it lands.
 */

import {
  contrastAgainst,
  leastDarkeningWhere,
  parseHex,
  toHex,
} from "@mobile/spend/colourDarkening";

/** The ten hues `CATEGORY_LOOKS` ships, for the contrast guard to enumerate. */
export const CATEGORY_HUES_IN_USE = [
  "#F0A868",
  "#6FB3F2",
  "#B49BE8",
  "#F2857E",
  "#F291C4",
  "#F2CE5C",
  "#A8CC4A",
  "#33D9AD",
] as const;

const LIGHT_CARD_LUMINANCE = 1; // #FFFFFF
const DARK_CARD_LUMINANCE = 0.011_72; // #1A1F1D

/** WCAG 1.4.11. The bar `panelLine` and `controlLine` were each tuned to. */
const UI_MINIMUM = 3.05;
/**
 * On the near-black card the raw pastels measure 6.7:1 to 10.9:1. Never a
 * failure — but the brightest objects on the screen, which is the opposite of
 * premium. Pulling them under this keeps the boundary plainly visible without
 * it shouting over the content it surrounds.
 */
const DARK_TARGET = 5.2;

/**
 * The border a chip of this hue should draw, for the theme it is drawn in.
 *
 * Returns the input untouched when it cannot be parsed: a member's own category
 * can hold whatever the API let through, and one unreadable colour must not
 * take the whole chip row down with it.
 */
export function spendCategoryLine(hue: string, isDark: boolean): string {
  const rgb = parseHex(hue);
  if (!rgb) return hue;

  if (!isDark) {
    // White card: the pastel is far too pale to read as an edge. Take it down
    // only as far as 3:1, so it stays recognisably its own colour.
    return toHex(
      leastDarkeningWhere(
        rgb,
        (candidate) =>
          contrastAgainst(candidate, LIGHT_CARD_LUMINANCE) >= UI_MINIMUM,
      ),
    );
  }

  // Dark card: already well past 3:1, so this is the taste half — bring it DOWN
  // toward the card until it stops being the loudest thing on the screen. A hue
  // already quieter than the target is left exactly as it is.
  if (contrastAgainst(rgb, DARK_CARD_LUMINANCE) <= DARK_TARGET) return hue;
  return toHex(
    leastDarkeningWhere(
      rgb,
      (candidate) => contrastAgainst(candidate, DARK_CARD_LUMINANCE) <= DARK_TARGET,
    ),
  );
}
