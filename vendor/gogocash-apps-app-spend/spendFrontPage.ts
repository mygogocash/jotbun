import type { SpendTxRow } from "@mobile/spend/spendResource";

/**
 * Ours as ideas, not a fixed list — the API upserts a category by name when a row
 * is saved, so anything a member types becomes theirs without a second call.
 * Owner call 2026-08-30: "some provided by us as base and idea, users also allow
 * to set category themselves".
 */
export const STARTER_EXPENSE_CATEGORIES = [
  "Food",
  "Travel",
  "Household",
  "Bills",
  "Shopping",
  "Fun",
] as const;

export const STARTER_INCOME_CATEGORIES = [
  "Salary",
  "Bonus",
  "Side job",
  "Gift",
] as const;

/**
 * The front page prints this month's spend against last month's. There is no API
 * for the comparison — the screen asks `/spend/summary` twice and subtracts here.
 *
 * Returns `null` rather than 0 or Infinity when there is nothing to compare
 * against: a first month has no "vs July" line to show, and printing "▲ ∞%" or a
 * flat 0% would both be lies.
 */
export function monthOverMonthPercent(
  thisMonthMinor: number,
  lastMonthMinor: number,
): number | null {
  if (!Number.isFinite(thisMonthMinor) || !Number.isFinite(lastMonthMinor)) {
    return null;
  }
  if (lastMonthMinor <= 0) return null;
  return Math.round(((thisMonthMinor - lastMonthMinor) / lastMonthMinor) * 100);
}

export type SpendDayGroup = {
  date: string;
  rows: SpendTxRow[];
  out_minor: number;
  in_minor: number;
};

/**
 * The day-by-day diary the owner picked on 2026-08-30 lives inside "View all",
 * not on the front page — so the grouping happens here and the list screen just
 * renders it.
 *
 * A transfer moves money between a member's own wallets, so it belongs in the
 * day's rows but in neither total. Counting it would double the day: once as it
 * leaves one wallet, once as it lands in the other.
 */
export function groupSpendTxsByDay(rows: SpendTxRow[]): SpendDayGroup[] {
  const byDate = new Map<string, SpendDayGroup>();

  for (const row of rows) {
    let group = byDate.get(row.occurred_on);
    if (!group) {
      group = { date: row.occurred_on, rows: [], out_minor: 0, in_minor: 0 };
      byDate.set(row.occurred_on, group);
    }
    group.rows.push(row);
    if (row.type === "expense") group.out_minor += row.amount_minor;
    else if (row.type === "income") group.in_minor += row.amount_minor;
  }

  // ISO dates sort correctly as plain strings; newest day first.
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * One line explaining where a row came from, so a member's own record and money
 * we filled in for them are never mistaken for each other in "View all".
 *
 * Hand-typed rows return an empty string: the member wrote it, there is nothing
 * to explain, and a "from you" label on most of the list would be noise. An
 * unrecognised source stays silent for the same reason a wrong guess is worse
 * than no guess.
 *
 * English is the catalogue key — `tc()` resolves the Thai and Vietnamese.
 */
export function spendSourceLabel(source: string): string {
  switch (source) {
    case "autolog":
      return "from GoGoCash";
    case "slip_qr":
    case "slip_ocr":
      return "from a slip photo";
    case "spendee":
      return "from Spendee";
    case "meowjot":
      return "from MeowJot";
    case "moneylover":
      return "from Money Lover";
    case "saltedge":
      return "from your bank";
    default:
      return "";
  }
}

/**
 * The second line of a row in "View all".
 *
 * A row with no merchant already shows its category as the title, so repeating
 * it underneath reads as a stutter ("Food / Food"). Only the parts that add
 * something appear, and an empty result means the row needs no second line.
 */
export function spendRowSubtitleParts(row: {
  title: string;
  category: string;
  origin: string;
  note?: string;
}): string[] {
  const parts: string[] = [];
  if (row.category && row.category !== row.title) parts.push(row.category);
  if (row.origin) parts.push(row.origin);
  const note = row.note?.trim();
  if (note && note !== row.title) parts.push(note);
  return parts;
}

/**
 * Sources whose amount the member may correct — the same set the API enforces in
 * `SpendService.updateTx`. Kept in step by hand rather than shared through a
 * package: this is the screen deciding what to OFFER, and the server stays the
 * one that decides what is allowed.
 *
 * Anything unrecognised locks. A new source that turns out to be the member's
 * own should be added deliberately, in both places.
 */
const MEMBER_OWNED_AMOUNT_SOURCES = new Set([
  "manual",
  "spendee",
  "meowjot",
  "moneylover",
  "slip_qr",
  "slip_ocr",
]);

export function isSpendAmountEditable(source: string): boolean {
  return MEMBER_OWNED_AMOUNT_SOURCES.has(source);
}

export type SpendCategoryLook = {
  /** Shown before the label so a chip is recognisable without reading it. */
  emoji: string;
  /**
   * Border and fill only — never the label. These are pastels chosen against
   * the dark card; using one as text colour would fail contrast on the light
   * theme, so the label always takes the theme's own ink.
   *
   * `null` for a category the member invented: a neutral chip is honest, where
   * a hue picked by hashing the name would imply a meaning we do not have.
   */
  hue: string | null;
};

const CATEGORY_LOOKS: Record<string, SpendCategoryLook> = {
  food: { emoji: "🍜", hue: "#F0A868" },
  travel: { emoji: "🚕", hue: "#6FB3F2" },
  household: { emoji: "🏠", hue: "#B49BE8" },
  bills: { emoji: "🧾", hue: "#F2857E" },
  shopping: { emoji: "🛍️", hue: "#F291C4" },
  fun: { emoji: "🎉", hue: "#F2CE5C" },
  /*
   * Owner call 2026-09-07: the brand mint belongs to Cashback and nothing
   * else. Salary wore it, which made GoGoCash's own colour read as "a category
   * someone happens to have" — and left Cashback itself with no colour at all.
   */
  salary: { emoji: "💼", hue: "#A8CC4A" },
  bonus: { emoji: "🎁", hue: "#F2CE5C" },
  "side job": { emoji: "🛠️", hue: "#6FB3F2" },
  gift: { emoji: "🎀", hue: "#F291C4" },
  /** Reserved. The only category that may wear the GoGoCash green. */
  cashback: { emoji: "💰", hue: "#33D9AD" },
};

const NEUTRAL_LOOK: SpendCategoryLook = { emoji: "🏷️", hue: null };

export function spendCategoryLook(name: string): SpendCategoryLook {
  return CATEGORY_LOOKS[name.trim().toLowerCase()] ?? NEUTRAL_LOOK;
}

export type SpendBank = {
  /**
   * Three-letter stand-in drawn until the real logo art arrives. Deliberately
   * not a lookalike: a member should never mistake it for the bank's own mark.
   */
  code: string;
  /** English display name — `tc()` resolves Thai from it. */
  name: string;
  /**
   * The bank's own colour, for the placeholder letters only — never a surface.
   *
   * Three of the five are the brand hue DARKENED: Kasikorn's green, Krungsri's
   * yellow and Krungthai's sky all fall under 4.5:1 on a white tile at 11px,
   * so they are taken down until the letters read. A test enforces it. The
   * real logo art is exempt — it replaces these marks entirely.
   */
  hue: string;
};

/**
 * Thailand's big five, in the order the row draws them (owner call
 * 2026-08-30). All five are tappable even though only Kasikorn and Krungsri
 * can be linked today — the row is the pattern for every bank we add later.
 */
export const SPEND_BANKS: readonly SpendBank[] = [
  { code: "KBK", name: "Kasikorn", hue: "#12852A" },
  { code: "SCB", name: "SCB", hue: "#4E2A84" },
  { code: "BAY", name: "Krungsri", hue: "#9A6E00" },
  { code: "BBL", name: "Bangkok", hue: "#1E4598" },
  { code: "KTB", name: "Krungthai", hue: "#0079B0" },
];

/**
 * Satang from a slip read, typed into the amount field as baht.
 *
 * Always two decimals: the field is free text and "240" would save the same
 * number, but a slip read should show exactly what was printed on the paper so
 * the member can check it against the photo in their hand.
 *
 * `null` for anything that is not a real positive amount — better an empty
 * field than "NaN" typed into it.
 */
export function slipAmountToInput(amountMinor: number): string | null {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return null;
  return (Math.round(amountMinor) / 100).toFixed(2);
}

export type SpendPanelGradient = {
  /** Top-left of the base wash. */
  from: string;
  /** Held at 62% so the fade lands below the amount, not across it. */
  mid: string;
  /** Bottom-right of the base wash. */
  to: string;
  /** The corner glow, top-right. Brand green in both themes. */
  glow: string;
  glowOpacity: number;
};

/**
 * The add panel's gradient (owner call 2026-08-30, "design C").
 *
 * Two grounds, not one: the panel's own labels are `colors.ink`, which flips to
 * near-black on the light theme, so a single dark gradient would paint dark
 * text on a dark ground for half the members. Same geometry, same green corner
 * glow, opposite ground — tests pin both.
 */
export function spendPanelGradient(
  theme: "dark" | "light",
): SpendPanelGradient {
  return theme === "dark"
    ? {
        from: "#1D3B34",
        mid: "#14211D",
        to: "#101715",
        glow: "#33D9AD",
        glowOpacity: 0.34,
      }
    : {
        from: "#DCF2E9",
        mid: "#EDF7F3",
        to: "#F6FBF9",
        glow: "#0D7A5C",
        glowOpacity: 0.18,
      };
}

/** One of the member's own categories, as the server hands it back. */
export type SpendOwnCategory = {
  name: string;
  type: string;
  emoji?: string;
  hue?: string;
};

/**
 * How a chip should look, preferring what the member chose for it.
 *
 * Order matters: their own styling wins over the built-in map, because someone
 * who restyled "Food" meant it — the built-in look is a default, not a rule.
 * A category they named but never styled falls through to the neutral tag, the
 * same as before, and so does anything the list has not reached yet.
 *
 * `own` empty (the list is still in flight) leaves every chip exactly as it
 * was, so nothing flashes the tag on the way in.
 */
export function spendCategoryLookFor(
  name: string,
  own: readonly SpendOwnCategory[],
): SpendCategoryLook {
  const key = name.trim().toLowerCase();
  const mine = own.find((row) => row.name.trim().toLowerCase() === key);
  if (mine && (mine.emoji || mine.hue)) {
    return {
      emoji: mine.emoji ?? NEUTRAL_LOOK.emoji,
      hue: mine.hue ?? null,
    };
  }
  return spendCategoryLook(name);
}

/**
 * Money in against money out, as two lengths on one scale.
 *
 * Owner call 2026-09-07. "All" used to draw the expense ring, so a month's
 * income was named in the frames and then disappeared. A ring was the wrong
 * shape for it as well: two arcs need a whole to be parts of, and income plus
 * spending only adds up to "money that moved in either direction", which is not
 * a figure anyone tracks — the ring would have been dividing up a number that
 * does not exist. Two bars off one edge say which is bigger, and by how much,
 * with nothing invented.
 *
 * The larger of the two fills the scale, so an overspent month simply flips
 * which bar is long.
 */
export type SpendDirectionBars = {
  /** Percentage strings, ready for a `width` style. */
  inWidth: string;
  outWidth: string;
  /** Income minus spending. Negative when the month went over. */
  balance_minor: number;
  short: boolean;
};

export function spendDirectionBars(
  incomeMinor: number,
  expenseMinor: number,
): SpendDirectionBars {
  const scale = Math.max(incomeMinor, expenseMinor);
  const width = (amount: number) =>
    scale <= 0 ? "0%" : `${Math.round((amount / scale) * 1000) / 10}%`;
  const balance = incomeMinor - expenseMinor;
  return {
    inWidth: width(incomeMinor),
    outWidth: width(expenseMinor),
    balance_minor: balance,
    short: balance < 0,
  };
}

/** One direction's categories, with its own total for scaling its bars. */
export type SpendSliceGroup = {
  direction: "in" | "out";
  slices: SpendSlice[];
  total_minor: number;
};

/**
 * The categories under the chart, grouped by direction.
 *
 * On "All" both halves are kept — the owner's second ask — in the same order as
 * the chart directly above them, money in first (owner call 2026-09-07).
 * Reading the two halves one way in the bars and the other way in the list made
 * the card feel like two separate things.
 *
 * Each group totals itself so its bars scale within the group: shared scaling
 * would let a salary flatten every expense bar to a sliver.
 *
 * An empty direction is dropped rather than drawn as a heading with nothing
 * under it.
 */
export function spendGroupedSlices(
  filter: "all" | "in" | "out",
  income: readonly SpendSlice[],
  expenses: readonly SpendSlice[],
): SpendSliceGroup[] {
  const build = (
    direction: "in" | "out",
    slices: readonly SpendSlice[],
  ): SpendSliceGroup => ({
    direction,
    slices: sortSpendSlices(slices),
    total_minor: slices.reduce((sum, slice) => sum + slice.amount_minor, 0),
  });

  const wanted: SpendSliceGroup[] = [];
  if (filter !== "out") wanted.push(build("in", income));
  if (filter !== "in") wanted.push(build("out", expenses));
  return wanted.filter((group) => group.slices.length > 0);
}

/** One category's share of a month, as `/spend/summary` hands it back. */
export type SpendSlice = {
  category: string;
  amount_minor: number;
};

/**
 * Biggest first, ties settled by name.
 *
 * The ring and the list underneath it read the same array, so the order has to
 * be decided once, here. Two categories that landed on the same amount would
 * otherwise swap places between renders — the server returns them in whatever
 * order the map iterated — and a legend that reshuffles while you read it looks
 * broken even though the numbers are right.
 *
 * Copies rather than sorts in place: the caller is holding the server's own
 * array in state, and reordering it there would be a change nothing asked for.
 */
export function sortSpendSlices(slices: readonly SpendSlice[]): SpendSlice[] {
  return [...slices].sort(
    (a, b) =>
      b.amount_minor - a.amount_minor || a.category.localeCompare(b.category),
  );
}

export type SpendDonutArc = SpendSlice & {
  colour: string;
  /** Length of this arc along the ring, in the same units as `circumference`. */
  length: number;
  /** Where the arc starts, already negated for `strokeDashoffset`. */
  offset: number;
};

/**
 * The ring on the summary card, as arcs laid end to end around a circle.
 *
 * Returns nothing at all for an empty month rather than a full circle of
 * "Other": there is no honest ring to draw when nothing was recorded, and a
 * total of zero would divide.
 */
export function spendDonutArcs(
  slices: readonly SpendSlice[],
  circumference: number,
  colourFor: (category: string) => string,
): SpendDonutArc[] {
  const ordered = sortSpendSlices(slices).filter(
    (slice) => slice.amount_minor > 0,
  );
  const total = ordered.reduce((sum, slice) => sum + slice.amount_minor, 0);
  if (total <= 0) return [];

  let used = 0;
  return ordered.map((slice) => {
    const length = (slice.amount_minor / total) * circumference;
    const arc = {
      ...slice,
      colour: colourFor(slice.category),
      length,
      // `-used` on the first arc is negative zero, which is not 0 to anything
      // that compares strictly — including the tests below.
      offset: used ? -used : 0,
    };
    used += length;
    return arc;
  });
}

/**
 * "September 2026", in the member's own language.
 *
 * `calendar: "gregory"` is deliberate. Thai defaults to the Buddhist era, so
 * the same month would read 2569 here and 2026 on every date beside it — the
 * transaction rows, the slip photos, the bank's own statements. One calendar
 * across the feature, and it is the one the money arrived on.
 *
 * Anything that is not a real `YYYY-MM` comes straight back out. A dropdown
 * showing a raw month code is a small ugliness; one showing a confidently
 * wrong date is a lie about someone's money.
 */
export function spendMonthLabel(month: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) return month;
  const year = Number(match[1]);
  const mon = Number(match[2]);
  if (mon < 1 || mon > 12) return month;

  try {
    return new Intl.DateTimeFormat(locale, {
      calendar: "gregory",
      month: "long",
      timeZone: "UTC",
      year: "numeric",
    }).format(new Date(Date.UTC(year, mon - 1, 1)));
  } catch {
    // No Intl data for this locale on this device — the code still names it.
    return month;
  }
}

/**
 * Previous month code `YYYY-MM`.
 *
 * For comparing against last month when any month is selected from the dropdown.
 */
export function previousMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) return month;
  const year = Number(match[1]);
  const mon = Number(match[2]);
  if (mon < 1 || mon > 12) return month;
  if (mon === 1) return `${year - 1}-12`;
  const prev = String(mon - 1).padStart(2, "0");
  return `${year}-${prev}`;
}

/** Which way the money went, as the "View all" filter asks it. */
export type SpendMoneyDirection = "all" | "in" | "out";

/**
 * The rows one of All / Money in / Money out should show.
 *
 * A transfer survives only under "All". It moves a member's own money between
 * their own wallets, so it is neither money in nor money out — and putting it
 * under "Money out" would disagree with the Money out figure in the frame
 * directly above the list, which has never counted it either.
 *
 * Copies rather than filtering in place so the caller's state array is left
 * exactly as the server sent it, order included.
 */
export function filterSpendRowsByDirection(
  rows: readonly SpendTxRow[],
  direction: SpendMoneyDirection,
): SpendTxRow[] {
  if (direction === "all") return [...rows];
  const wanted = direction === "in" ? "income" : "expense";
  return rows.filter((row) => row.type === wanted);
}

/**
 * "6 Sep 2026" — the date on a single row, in the member's own language.
 *
 * Short month, because this repeats on every row of a flat list (owner call
 * 2026-09-07) and the full name would push the shop name off a phone. Gregorian
 * for the same reason `spendMonthLabel` is: one calendar across the feature, and
 * it is the one the money arrived on.
 *
 * Anything that is not a real `YYYY-MM-DD` comes straight back out rather than
 * being guessed at.
 */
export function spendDayLabel(day: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return day;
  const [year, mon, date] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  if (mon < 1 || mon > 12 || date < 1 || date > 31) return day;

  const when = new Date(Date.UTC(year, mon - 1, date));
  // Date.UTC rolls 31 February forward, which would print a day nobody wrote.
  if (when.getUTCMonth() !== mon - 1 || when.getUTCDate() !== date) return day;

  try {
    /*
     * Assembled from the parts rather than taken whole, so the order is always
     * day-month-year — "28 Mar 2026", which is how every other date in this app
     * is written and how Thailand writes them. Handed straight to
     * `Intl.DateTimeFormat` the `en` locale returns "Sep 6, 2026", so a Thai
     * member reading the app in English would meet US order on this one screen
     * and day-first on every other. The locale still chooses the month's NAME,
     * which is the part that actually needs translating.
     */
    const parts = new Intl.DateTimeFormat(locale, {
      calendar: "gregory",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
      year: "numeric",
    }).formatToParts(when);
    const pick = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const assembled = [pick("day"), pick("month"), pick("year")]
      .filter(Boolean)
      .join(" ");
    return assembled || day;
  } catch {
    // No Intl data for this locale on this device — the code still reads.
    return day;
  }
}

/** What the second line of a row in "View all" is made of. */
export type SpendRowSecondLine = {
  /** Plain text before the id — the shop, on a row GoGoCash filled in. */
  lead: string;
  /** The full id, for copying. `null` on anything the member typed. */
  ref: string | null;
  /** What is drawn instead of the full id, e.g. "***4b2c". */
  refMasked: string | null;
  /** The member's own words. Always plain text, never a control. */
  note: string;
};

/** How much of an id a member sees — the same four as `***1115` on Profile. */
const REF_VISIBLE = 4;

/** Rows saved before the id had a field of its own. */
const LEGACY_REF_PREFIX = "cashback:";

/**
 * The second line of a row in "View all" (owner call 2026-09-07).
 *
 * Two shapes, decided by whether GoGoCash filled the row in:
 *
 *     Cashback          Shopee · ***4b2c      shop and id, both filled in
 *     everything else   Craft beer            the member's own words, alone
 *
 * The shop only appears on the first. The owner's call: nothing that asks a
 * member to record something asks them for a shop, so on their own rows it is
 * not theirs to show. (Imported rows and slip photos DO carry one — that is a
 * known cost of the rule, not an oversight.)
 *
 * The id is the conversion id support asks a member to quote, so it is the one
 * thing on the line worth tapping. Their note is never a control, whatever they
 * type into it — someone whose note happens to read like an id must not end up
 * with a tappable one.
 */
export function spendRowSecondLine(row: {
  merchant?: string;
  note?: string;
  external_ref?: string;
}): SpendRowSecondLine {
  const note = row.note?.trim() ?? "";
  const legacy = note.startsWith(LEGACY_REF_PREFIX)
    ? note.slice(LEGACY_REF_PREFIX.length).trim()
    : "";
  const ref = row.external_ref?.trim() || legacy;

  if (!ref) {
    return { lead: "", ref: null, refMasked: null, note };
  }
  return {
    lead: row.merchant?.trim() ?? "",
    ref,
    refMasked: `***${ref.slice(-REF_VISIBLE)}`,
    // An old row's note WAS the id. Showing it again as words would print the
    // same thing twice, once masked and once not.
    note: legacy ? "" : note,
  };
}

export type SpendCashFlowWeek = {
  /** Monday of the week, `YYYY-MM-DD`. */
  week_start: string;
  in_minor: number;
  out_minor: number;
};

/** Monday of the ISO week `day` (a `YYYY-MM-DD` Bangkok date) falls in. */
function isoWeekStart(day: string): string {
  const at = new Date(`${day}T00:00:00Z`);
  // getUTCDay is 0 on Sunday; ISO weeks start on Monday, so Sunday is 6 back.
  const back = (at.getUTCDay() + 6) % 7;
  at.setUTCDate(at.getUTCDate() - back);
  return at.toISOString().slice(0, 10);
}

/**
 * The month's money in against money out, one bucket per ISO week.
 *
 * EVERY week the month touches gets a bucket, including the empty ones. A
 * chart that drops quiet weeks silently rescales its own x-axis, so a month
 * where nothing happened in week three would draw week four right beside week
 * two and read as an unbroken run of spending.
 *
 * Transfers are left out of both sides, exactly as the pie and
 * `groupSpendTxsByDay` already leave them out: a transfer is the member's own
 * money moving between their own wallets, so counting it would show a week
 * where they both earned and spent money that never arrived or left.
 */
export function spendCashFlowWeeks(
  rows: readonly SpendTxRow[],
  month: string,
): SpendCashFlowWeek[] {
  const match = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!match) return [];
  const [, year, monthNumber] = match;

  const buckets = new Map<string, SpendCashFlowWeek>();
  const lastDay = new Date(
    Date.UTC(Number(year), Number(monthNumber), 0),
  ).getUTCDate();
  for (let day = 1; day <= lastDay; day += 1) {
    const date = `${year}-${monthNumber}-${String(day).padStart(2, "0")}`;
    const start = isoWeekStart(date);
    if (!buckets.has(start)) {
      buckets.set(start, { week_start: start, in_minor: 0, out_minor: 0 });
    }
  }

  for (const row of rows) {
    if (row.type === "transfer") continue;
    if (!row.occurred_on.startsWith(`${year}-${monthNumber}`)) continue;
    const bucket = buckets.get(isoWeekStart(row.occurred_on));
    if (!bucket) continue;
    if (row.type === "expense") bucket.out_minor += row.amount_minor;
    else bucket.in_minor += row.amount_minor;
  }

  return [...buckets.values()].sort((a, b) =>
    a.week_start < b.week_start ? -1 : 1,
  );
}

export type SpendWalletNet = { wallet: string; net_minor: number };

/**
 * What each wallet gained or lost this month.
 *
 * A NET, never a balance. GoGoSpend stores no opening balance for a wallet, so
 * the only figure the data supports is what moved — and a row that looked like
 * a balance but was not would be a lie about money on the screen a member
 * opens to check their money.
 *
 * A row with no wallet counts as Cash, which is what `addTx` upserts when the
 * caller names none. Transfers net nothing: the money is the member's either
 * side of the move.
 */
export function spendWalletNets(rows: readonly SpendTxRow[]): SpendWalletNet[] {
  const nets = new Map<string, number>();
  for (const row of rows) {
    if (row.type === "transfer") continue;
    const wallet = row.wallet?.trim() || "Cash";
    const signed = row.type === "expense" ? -row.amount_minor : row.amount_minor;
    nets.set(wallet, (nets.get(wallet) ?? 0) + signed);
  }
  return [...nets.entries()]
    .map(([wallet, net_minor]) => ({ wallet, net_minor }))
    .sort((a, b) => (a.wallet < b.wallet ? -1 : 1));
}
