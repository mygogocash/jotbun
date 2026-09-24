/**
 * The apps a member can move their history across from, and the rule that keeps
 * the shelf above the picker one row tall however many we add.
 */

export type SpendImportApp = {
  id: string;
  /**
   * Four-letter stand-in on the brand-filled tile, until the real logo art
   * lands. Deliberately not a lookalike — nobody should mistake it for the
   * app's mark. (The shelf and the bank row left "the white tile" behind on
   * 2026-09-11; the select's option tile carried it a day longer, until this
   * fix brought all three onto the one treatment this doc now describes.)
   */
  code: string;
  /** English name; `tc()` resolves Thai and Vietnamese from it. */
  name: string;
  /** The app's own colour, for the placeholder letters only — never a surface. */
  hue: string;
  /**
   * Named for the app it belongs to rather than built from "In " + name: Thai
   * puts the app inside a phrase ("ในแอป MeowJot"), which string concatenation
   * cannot produce.
   */
  whereLabel: string;
  /** What the member does inside THEIR app. */
  theirSteps: readonly string[];
  /**
   * The warning that is not a step (owner call 2026-08-30). It sits under the
   * list with its own mark so nobody counts a caveat as a thing to do. `null`
   * when the app has nothing to warn about.
   */
  note: string | null;
};

/**
 * The last step is the same wherever the file came from, so it lives once here
 * rather than three times in the list.
 */
export const SPEND_IMPORT_FINAL_STEP = "Tap Upload your file and pick it";

/** The label over that final step. */
export const SPEND_IMPORT_HERE_LABEL = "In GoGoCash";

export const SPEND_IMPORT_APPS: readonly SpendImportApp[] = [
  {
    id: "meowjot",
    code: "MEOW",
    name: "MeowJot",
    hue: "#E8602C",
    whereLabel: "In MeowJot",
    theirSteps: [
      "Human menu → Saved items → Export data",
      "Choose up to 12 months, then create the CSV",
      "Save the file to your phone",
    ],
    note: "More than a year? Upload one file per year — we join them.",
  },
  {
    id: "spendee",
    code: "SPND",
    name: "Spendee",
    hue: "#2F6FED",
    whereLabel: "In Spendee",
    theirSteps: [
      "More → Export",
      "Choose CSV or XLSX, and the longest period offered",
      "Wait for the email, then open the file",
    ],
    note: "Free Spendee only goes back 365 days. That is Spendee's limit, not ours.",
  },
  {
    id: "moneylover",
    code: "MNYL",
    name: "Money Lover",
    hue: "#16A34A",
    whereLabel: "In Money Lover",
    theirSteps: ["Settings → Export", "Export as CSV or Excel"],
    note: null,
  },
];

/**
 * How wide the shelf is. Eight 67pt tiles is what fits a phone row without
 * wrapping or scrolling sideways, and the row is a shelf — it says what exists,
 * it is not how you choose.
 */
export const SPEND_SHELF_SLOTS = 8;

export type SpendImportShelf = {
  shown: readonly SpendImportApp[];
  /** How many apps did not fit. `0` means the shelf holds them all. */
  hiddenCount: number;
};

/**
 * Fit the app list into the shelf (owner rule, 2026-08-30).
 *
 * Past eight apps the LAST slot becomes the counter rather than a logo, so the
 * eighth app is counted rather than drawn: nine apps show seven logos and "2+",
 * not eight logos and "1+". That costs one logo and buys a row that can never
 * grow a second line.
 */
export function spendImportShelf(
  apps: readonly SpendImportApp[],
): SpendImportShelf {
  if (apps.length <= SPEND_SHELF_SLOTS) {
    return { shown: apps, hiddenCount: 0 };
  }
  const shown = apps.slice(0, SPEND_SHELF_SLOTS - 1);
  return { shown, hiddenCount: apps.length - shown.length };
}
