import { LayoutAnimation } from "react-native";

import { motion } from "./motion";

/**
 * One native layout transition for a state flip that reflows layout.
 *
 * The GoLink cover taught the rule (#1859): a menu press often reflows several
 * siblings at once — a banner unmounts, paddings change, a list refilters, tab
 * widths redistribute. Animating any one component desynchronizes the others
 * (verified live on the simulator), so the press configures ONE LayoutAnimation
 * for the next layout pass and the native UI thread moves the whole tree.
 *
 * Owned here so a call site can forget neither the configure call nor the
 * reduced-motion guard: pass the current `useReducedMotion()` value and the
 * stage change snaps instantly when the member asked for less motion.
 * react-native-web treats configureNext as a no-op, so web is unchanged.
 */
export function configureStageChange(reducedMotion: boolean): void {
  if (reducedMotion) return;
  LayoutAnimation.configureNext(
    LayoutAnimation.create(
      motion.duration.accordionExpand,
      LayoutAnimation.Types.easeInEaseOut,
      LayoutAnimation.Properties.opacity,
    ),
  );
}
