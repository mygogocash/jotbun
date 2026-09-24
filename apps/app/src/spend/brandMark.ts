import {
  contrastAgainst,
  leastDarkeningWhere,
  parseHex,
  toHex,
} from "@mobile/spend/colourDarkening";

/**
 * The fill behind a three-letter brand monogram.
 *
 * GoGoSpend draws two rows of marks it has no logo art for — the five Thai
 * banks, and the apps a member can move their history across from. The source
 * of both says these are stand-ins "until the real logo art arrives", and
 * deliberately not lookalikes: a member must never mistake one for the brand's
 * own mark.
 *
 * Stand-in is not the same as unfinished, though, and the two rows had drifted
 * into opposite treatments — banks were a solid brand fill carrying a white
 * mark, apps were a hardcoded white box carrying a coloured one. Side by side
 * on one screen that reads as two half-finished systems rather than one
 * decision. This is the single treatment both now use.
 *
 * The brand's own hue is kept wherever it can carry white, and darkened only as
 * far as it must otherwise — the same move `SPEND_BANKS` already documents,
 * where three of the five bank hues ship darkened for their letters alone. All
 * five banks already clear the bar; MeowJot's orange and Money Lover's green
 * are the only two that move.
 */

/** WCAG 1.4.3 AA. The mark is text, so 4.5:1 rather than a border's 3:1. */
const WHITE_MINIMUM = 4.51;
/** #FFFFFF. */
const WHITE_LUMINANCE = 1;

/**
 * The tile fill for `hue` — the hue itself when white already reads on it.
 *
 * Returns the input untouched when it cannot be parsed: an app or bank entry
 * could carry anything, and one unreadable colour must not take the row down.
 */
export function brandMarkFill(hue: string): string {
  const rgb = parseHex(hue);
  if (!rgb) return hue;
  if (contrastAgainst(rgb, WHITE_LUMINANCE) >= WHITE_MINIMUM) return hue;
  return toHex(
    leastDarkeningWhere(
      rgb,
      (candidate) => contrastAgainst(candidate, WHITE_LUMINANCE) >= WHITE_MINIMUM,
    ),
  );
}
