import type { ViewStyle } from "react-native";

/**
 * Floor for a standalone interactive control.
 *
 * #1749: ten controls across the customer app painted boxes shorter than 24pt
 * — "View all" at 20, the Personal Information link cells at 19, a Wallet copy
 * control at 14x14. react-native-web implements `hitSlop` only on the legacy
 * `Touchable`, so on web **the painted box is the tap target**: there is no
 * invisible margin quietly making them bigger. That fails WCAG 2.2 SC 2.5.8,
 * which asks for 24x24.
 *
 * The repo already solved this twice — `ProfileSubPageFrame`'s back chevron and
 * `MaskedUserIdRow`'s copy button both pair a painted minimum with `hitSlop` —
 * so this is that pattern named once instead of a third open-coded copy.
 *
 * Note SC 2.5.8's inline exception: a link inside a sentence, sized by the
 * line-height of the prose around it, is exempt. The inline links in the legal
 * documents are deliberately left alone for that reason — padding them would
 * break the paragraph they sit in without helping anyone.
 */
export const MINIMUM_TAP_TARGET = 24;

/**
 * Extra tappable margin outside the painted box. 24 + 10 either side = 44, the
 * Apple HIG minimum, which native honours even though web ignores it.
 */
export const TAP_TARGET_HIT_SLOP = 10;

/** Painted box for a text control that would otherwise be only as tall as its label. */
export const minimumTapTargetStyle: ViewStyle = {
  justifyContent: "center",
  minHeight: MINIMUM_TAP_TARGET,
};
