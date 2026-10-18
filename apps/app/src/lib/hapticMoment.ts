import { haptics } from "@mobile/lib/haptics";
import { motion } from "@mobile/theme/motion";

/*
 * The policy, read out loud.
 *
 * `lib/haptics` has had the four verbs since the bottom nav shipped, and
 * ~20 screens call them directly. What none of them read is `motion.haptic`,
 * which says WHICH verb a moment gets — so every author picked one by feel and
 * the three "none" moments could not be expressed at all.
 *
 * A call site here names the MOMENT. The table decides the verb, including
 * deciding that the answer is nothing. That is the only arrangement in which
 * silence is enforceable: `playHaptic("navigate")` is a call that provably
 * fires no motor, and a later author who changes the table changes every
 * call site with it.
 */
export type HapticMoment = keyof typeof motion.haptic;

/** The verbs the table can name — `lib/haptics` minus its options argument. */
export type HapticEngine = {
  [Verb in Exclude<
    (typeof motion.haptic)[HapticMoment],
    "none"
  >]: () => Promise<void>;
};

export function playHaptic(
  moment: HapticMoment,
  engine: HapticEngine = haptics,
): void {
  const verb = motion.haptic[moment];
  if (verb === "none") return;
  /*
   * Fire-and-forget, and caught here as well as inside the wrapper: a press
   * must never wait on the haptics engine, and must never fail because of it.
   */
  engine[verb]().catch(() => {});
}
