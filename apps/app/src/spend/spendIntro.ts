/**
 * The GoGoSpend first look: shown once, then never again on this phone.
 *
 * Seen-ness is stored on the DEVICE, not the account (owner call 2026-08-30).
 * A member who changes phone or clears the app meets the intro a second time.
 * That was the accepted trade for not building an account-level flag.
 */
export const SPEND_INTRO_STORAGE_KEY = "gogocash.spend.introSeen";

/** What one 60-baht coffee a day comes to in a year. The page's whole argument. */
export const SPEND_INTRO_YEARLY_BAHT = 60 * 365;

/**
 * Every line the page renders, so the i18n pin can assert that none of them
 * falls back to English for a Thai or Vietnamese member.
 */
export const SPEND_INTRO_COPY = [
  "One ฿60 coffee, every day",
  "a year",
  "Your money has been sneaking off",
  "Let's catch it. Seconds a day, and it stops getting away with it.",
  "Where did it all go?",
  "We sort your month out so you do not have to.",
  "The small stuff is not small",
  "The ones you forget about are exactly the ones adding up.",
  "No more payday surprises",
  "Find out while there is still time to do something.",
  "Let's start!",
] as const;

/**
 * The yearly figure, grouped and with no decimals: "฿21,900".
 *
 * Not `formatBaht`, which is built for real amounts and prints "฿21,900.00" —
 * two zeroes that make a headline number look like a receipt. Grouped by hand
 * rather than through `toLocaleString` so the oldest Android engines without
 * Intl produce the same string as everything else.
 */
export function formatIntroBaht(baht: number): string {
  const grouped = String(Math.round(baht)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return `฿${grouped}`;
}

/** The subset of Storage/AsyncStorage this module needs, sync or async. */
export type SpendIntroStore = {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<unknown> | unknown;
};

let storeOverride: SpendIntroStore | null = null;

/**
 * The suite runs on node, where there is no `localStorage` and `Platform.OS` is
 * not "web" — so the store is injectable, the same seam `pendingReferral` uses
 * for the same reason.
 */
export function setSpendIntroStoreForTests(
  store: SpendIntroStore | null,
): void {
  storeOverride = store;
}

function webStore(): SpendIntroStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Some embedded webviews throw on property access rather than returning null.
    return null;
  }
}

async function resolveStore(): Promise<SpendIntroStore | null> {
  if (storeOverride) return storeOverride;
  const web = webStore();
  if (web) return web;
  try {
    return (await import("@react-native-async-storage/async-storage")).default;
  } catch {
    return null;
  }
}

/** `true` only when this phone has already dismissed the intro. */
export async function readSpendIntroSeen(): Promise<boolean> {
  try {
    const store = await resolveStore();
    return (await store?.getItem(SPEND_INTRO_STORAGE_KEY)) === "1";
  } catch {
    /*
     * Private browsing and blocked site data both throw on access. Showing the
     * intro one extra time is a far better failure than a page that will not
     * render, so an unreadable store reads as "not seen".
     */
    return false;
  }
}

export async function markSpendIntroSeen(): Promise<void> {
  try {
    const store = await resolveStore();
    await store?.setItem(SPEND_INTRO_STORAGE_KEY, "1");
  } catch {
    // Non-fatal: the member sees the intro again next time they open GoGoSpend.
  }
}

/* ── the frame ──────────────────────────────────────────────────── */

/**
 * How long the figure takes to count up from zero.
 *
 * Long enough to be watched, short enough that a member who came to record a
 * coffee is not waiting on an animation to finish before they can read.
 */
export const SPEND_INTRO_COUNT_MS = 1400;

/**
 * The orange block, with ONE set of values for both themes (owner call
 * 2026-08-30, previewed as "B · corner spill").
 *
 * Not a light/dark pair. A pale orange panel measured 1.09:1 against the
 * light-mode page, so the frame stopped reading as a block at all, and
 * deepening it until the block read pushed the figure too close to its own
 * ground. Keeping the dark block in light mode is what resolved that, and it
 * means these values must clear the readability bar unassisted — `spend-intro`
 * pins exactly that.
 */
export const SPEND_INTRO_FRAME = {
  gradientFrom: "#2F1F14",
  gradientTo: "#3E2A1B",
  edge: "#61402A",
  /** The figure. Never the brand green — that belongs to the button alone. */
  figure: "#F2954E",
  /** The two small lines above and below it. */
  caption: "#D0916A",
} as const;

/** How much bigger the two small lines are than a normal caption. */
export const SPEND_INTRO_CAPTION_LIFT = 4;

/* ── the spilled cup ────────────────────────────────────────────── */

/**
 * The real system emoji, not a drawing — so it cannot be recoloured, and
 * opacity is the only lever. It keeps its own brown and cream, which reads
 * slightly cool against the warm block; the owner saw that and chose it anyway
 * on 2026-08-30. iPhone draws Apple's cup, Android draws Google's.
 */
export const SPEND_INTRO_CUP = "☕";

/**
 * Geometry for the cup, in the corner the old arrow occupied.
 *
 * The rotation is what does the work: it throws the cup's visible mass up and
 * left of this box, which is what puts the mouth under the figure so the
 * number reads as having spilled out of it.
 */
export const SPEND_INTRO_CUP_LOOK = {
  size: 196,
  fontSize: 180,
  rotation: "-52deg",
  opacity: 0.16,
  bottom: -14,
  right: -10,
} as const;

export type SpendIntroDrop = {
  /**
   * Percentages across and down the frame, typed as percentage literals rather
   * than plain strings so they satisfy React Native's `DimensionValue`.
   */
  left: `${number}%`;
  top: `${number}%`;
  size: number;
  opacity: number;
};

/**
 * The splash, thrown up and left out of the cup's mouth.
 *
 * Four, not the eleven the first pass had: the figure already counts up, and
 * a long trail of drips behind moving text is two attention devices fighting
 * over the same spot.
 */
export const SPEND_INTRO_DROPS: readonly SpendIntroDrop[] = [
  { left: "56%", top: "53%", size: 24, opacity: 0.19 },
  { left: "44%", top: "42%", size: 16, opacity: 0.16 },
  { left: "33%", top: "32%", size: 10, opacity: 0.13 },
  { left: "24%", top: "24%", size: 6, opacity: 0.11 },
];

/**
 * Where the count-up has got to, `elapsedMs` into a `durationMs` run.
 *
 * Split out of the component because the two things that actually go wrong
 * here are arithmetic: easing that only approaches the target leaves "฿21,899"
 * on screen for good, and a frame delivered after the end runs past it. Both
 * are pinned in `spend-intro`.
 *
 * Cubic ease-out — fast first, slowing to settle. A linear count reads
 * mechanical.
 */
export function introCountValue(
  elapsedMs: number,
  durationMs: number,
  target: number,
): number {
  if (!(durationMs > 0)) return target;
  const t = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
  if (t >= 1) return target;
  return Math.round(target * (1 - (1 - t) ** 3));
}
