import { Redirect, useRouter } from "expo-router";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { IntlContext } from "react-intl";
import { Animated, Pressable, StyleSheet, View } from "react-native";

import { ProfileSubPageFrame } from "@mobile/components/ProfileSubPageFrame";
import { SpendSectionTabs } from "@mobile/spend/SpendSectionTabs";
import { isSpendEnabled } from "@mobile/config/featureFlags";
import { useMarketSpendEnabled } from "@mobile/navigation/appChrome";
import { useCopy } from "@mobile/i18n/useCopy";
import { useThemedStyles } from "@mobile/theme/useThemedStyles";
import { Text, TextInput } from "@mobile/theme/AppText";
import { useThemeColors } from "@mobile/theme/ThemeProvider";
import { pickThemed, type ThemeColors } from "@mobile/theme/colorPalettes";
import { elevationCss } from "@mobile/theme/elevation";
import { ChevronDown } from "@mobile/theme/icons";
import { radii, spacing, typography } from "@mobile/theme/tokens";
import { MINIMUM_TAP_TARGET } from "@mobile/theme/tapTarget";
import { createSpendSharedControlStyles } from "@mobile/spend/spendSharedControlStyles";
import { useAuthGuardSession } from "@mobile/auth/useAuthGuardSession";
import {
  addSpendTx,
  deleteSpendTx,
  fetchSpendCategories,
  fetchSpendMonths,
  fetchSpendSummary,
  fetchSpendTxs,
  updateSpendTx,
  type SpendCategoryRow,
  type SpendMonthRow,
  type SpendSummary,
  type SpendTxRow,
} from "@mobile/spend/spendResource";
import {
  filterSpendRowsByDirection,
  isSpendAmountEditable,
  spendCategoryLookFor,
  spendDayLabel,
  spendMonthLabel,
  spendRowSecondLine,
  STARTER_EXPENSE_CATEGORIES,
  type SpendMoneyDirection,
} from "@mobile/spend/spendFrontPage";
import { spendCategoryLine } from "@mobile/spend/spendCategoryLine";
import { spendCategoryPaint } from "@mobile/spend/spendCategoryPaint";
import { trackSpendTxAdded } from "@mobile/spend/spendTelemetry";
import { copyToClipboard } from "@mobile/lib/clipboard";
import { useReducedMotion } from "@mobile/hooks/useReducedMotion";
import { playHaptic } from "@mobile/lib/hapticMoment";
import { AnimatedPressable } from "@mobile/theme/animatedMotion";
import { motion } from "@mobile/theme/motion";
import { configureStageChange } from "@mobile/theme/stageChange";
import { useSpringPop } from "@mobile/theme/useSpringPop";

/** 44pt floor — every control a finger touches (UI_DESIGN_SYSTEM §1). */
const CONTROL_HEIGHT = 44;

/**
 * The category chip keeps its compact painted box and buys the floor back.
 *
 * The chips wrap, so a 44pt painted height would turn a two-row grid into a
 * wall. 32 still clears WCAG 2.2 SC 2.5.8's painted 24 — which is the figure
 * web actually gets, since react-native-web ignores hitSlop entirely — and the
 * slop below carries native to 44.
 */
const CHIP_HEIGHT = 32;

/*
 * (44 - 32) / 2 = 6 vertically, which is exactly `chipRow`'s gap: the slop of
 * two stacked rows meets and never overlaps, so no tap in the gutter is
 * ambiguous. Horizontally the same gap is split 3 a side; chips are already
 * far wider than the floor, so this is only there to match.
 */
const CHIP_HIT_SLOP = { bottom: 6, left: 3, right: 3, top: 6 };

/**
 * "View all" — one list holding a member's own records and the GoGoCash cashback
 * we logged for them, every row labelled with where it came from (owner call
 * 2026-08-30).
 *
 * The day-by-day diary lives here rather than on the front page: the same
 * decision put the add panel first, so the days had to go somewhere with room.
 */
export function CustomerSpendAllScreen() {
  const styles = useThemedStyles(createStyles);
  const tc = useCopy();
  const spendLive = useMarketSpendEnabled();
  const { isAuthed } = useAuthGuardSession();
  const router = useRouter();
  /*
   * Back returns to GoGoSpend, not Profile.
   *
   * The frame's default back row links to /profile, which suits the four
   * Profile pages that own that layout. This page is only ever reached from
   * GoGoSpend, so the default would drop the member somewhere they were never
   * standing. `canGoBack` first so the chevron undoes their actual last step;
   * the replace is for a cold open with no history to pop.
   */
  const goBackToSpend = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/spend");
  }, [router]);

  const themeColors = useThemeColors();
  const locale = useContext(IntlContext)?.locale ?? "en";

  /*
   * The same filter section as the summary card (owner call 2026-09-07), so a
   * member who changed month there recognises the control here. It is a second
   * copy rather than a shared component for now: the summary card is signed off
   * and working, and lifting its markup out mid-flight would risk the page the
   * owner has already approved. Worth unifying once both are settled.
   */
  const [selectedMonth, setSelectedMonth] = useState(() => bangkokMonth());
  const [months, setMonths] = useState<SpendMonthRow[]>([]);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [direction, setDirection] = useState<SpendMoneyDirection>("all");
  const [summary, setSummary] = useState<SpendSummary | null>(null);
  const [ownCategories, setOwnCategories] = useState<SpendCategoryRow[]>([]);

  const [rows, setRows] = useState<SpendTxRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  /** Which row's id just went to the clipboard, so only that one says so. */
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draftAmount, setDraftAmount] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  /*
   * Text, kind, and WHERE it belongs. `at` is not decoration: onSave, onAdd
   * and onDelete each close their control on success, so a success line has
   * nothing left to sit under and goes to the page, while a failure or a
   * validation line always still has its control on screen.
   */
  const [message, setMessage] = useState<{
    text: string;
    tone: "good" | "bad";
    at: "add" | "row" | "page";
  } | null>(null);
  /*
   * A counter, not the message text: two saves in a row produce the same
   * "Saved." string, and a pop that fires only when the words change would
   * skip the second one.
   */
  const [savedCount, setSavedCount] = useState(0);

  /*
   * Adding, from the page a member is already reading (owner call 2026-09-11).
   * This page used to tell them "add something on the GoGoSpend page" — a full
   * screen away, and back again to check it landed.
   *
   * Deliberately smaller than the front page's panel: amount, category, Save.
   * Anything more (the date strip, a slip photo, money in) belongs to the panel
   * that already does it well, and duplicating it here would fork two entry
   * forms that have to stay in step.
   */
  const [adding, setAdding] = useState(false);
  const [newAmount, setNewAmount] = useState("");
  const [newCategory, setNewCategory] = useState<string>(
    STARTER_EXPENSE_CATEGORIES[0],
  );

  /*
   * Pressed feedback for the two `AnimatedPressable` controls below.
   *
   * `directionPop`/`categoryPop` only fire on an actual selection CHANGE —
   * `useSpringPop` is gated in a `useEffect` on the token changing — so
   * pressing an already-selected segment or chip triggers no animation at
   * all, and neither spring distinguishes "finger down" from "finger up"
   * even when it does fire. `AnimatedPressable` cannot take a function
   * style, so this tracks press state by hand and folds it into the array
   * style both controls already use.
   */
  const [pressedSegment, setPressedSegment] =
    useState<SpendMoneyDirection | null>(null);
  const [pressedChip, setPressedChip] = useState<string | null>(null);

  const reducedMotion = useReducedMotion();
  const directionPop = useSpringPop(direction);
  const categoryPop = useSpringPop(newCategory);
  /*
   * The one earned overshoot on these three tabs.
   *
   * The bouncy spring preset (motion.ts's spring table) is rationed by its
   * own doc comment to moments that are genuinely good news — "a save
   * landing" is the example it gives. Every other control here arrives and
   * stops.
   */
  const savedPop = useSpringPop(savedCount, motion.spring.bouncy);

  const refresh = useCallback(async () => {
    try {
      const [txs, monthSummary, monthList, mine] = await Promise.all([
        fetchSpendTxs(selectedMonth),
        // Each fails quiet on its own: a member who can still read their records
        // is better served than one staring at an empty page because the totals
        // did not arrive.
        fetchSpendSummary(selectedMonth).catch(() => null),
        fetchSpendMonths().catch(() => [] as SpendMonthRow[]),
        fetchSpendCategories().catch(() => [] as SpendCategoryRow[]),
      ]);
      setRows(txs);
      setSummary(monthSummary);
      setMonths(monthList);
      setOwnCategories(mine);
    } catch {
      setRows([]);
    } finally {
      setLoaded(true);
    }
  }, [selectedMonth]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onOpen = useCallback((row: SpendTxRow) => {
    setMessage(null);
    setConfirmingDelete(false);
    setOpenId((current) => {
      if (current === row.id) return null;
      setDraftAmount((row.amount_minor / 100).toString());
      setDraftCategory(row.category);
      setDraftNote(row.note ?? "");
      return row.id;
    });
  }, []);

  const onSave = useCallback(
    async (row: SpendTxRow) => {
      const patch: {
        amount_minor?: number;
        category?: string;
        note?: string;
      } = {};
      if (isSpendAmountEditable(row.source)) {
        const baht = Number(draftAmount.replace(/,/g, ""));
        if (!Number.isFinite(baht) || baht <= 0) {
          setMessage({ text: tc("Type an amount first."), tone: "bad", at: "row" });
          return;
        }
        const minor = Math.round(baht * 100);
        if (minor !== row.amount_minor) patch.amount_minor = minor;
      }
      const category = draftCategory.trim();
      if (!category) {
        setMessage({ text: tc("Give the category a name."), tone: "bad", at: "row" });
        return;
      }
      if (category !== row.category) patch.category = category;
      if (draftNote !== (row.note ?? "")) patch.note = draftNote;

      if (Object.keys(patch).length === 0) {
        setOpenId(null);
        return;
      }
      setBusy(true);
      try {
        await updateSpendTx(row.id, patch);
        setOpenId(null);
        setMessage({ text: tc("Changed."), tone: "good", at: "page" });
        setSavedCount((count) => count + 1);
        playHaptic("saveLanded");
        await refresh();
      } catch {
        setMessage({ text: tc("Could not change that. Try again."), tone: "bad", at: "row" });
        playHaptic("saveFailed");
      } finally {
        setBusy(false);
      }
    },
    [draftAmount, draftCategory, draftNote, refresh, tc],
  );

  const onAdd = useCallback(async () => {
    const baht = Number(newAmount.replace(/,/g, ""));
    if (!Number.isFinite(baht) || baht <= 0) {
      setMessage({ text: tc("Type an amount first."), tone: "bad", at: "add" });
      return;
    }
    const named = newCategory.trim();
    if (!named) {
      setMessage({ text: tc("Give the category a name."), tone: "bad", at: "add" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await addSpendTx({
        amount_minor: Math.round(baht * 100),
        type: "expense",
        occurred_on: bangkokToday(),
        category: named,
      });
      trackSpendTxAdded("manual");
      setNewAmount("");
      setAdding(false);
      setMessage({ text: tc("Saved."), tone: "good", at: "page" });
      setSavedCount((count) => count + 1);
      playHaptic("saveLanded");
      await refresh();
    } catch {
      setMessage({ text: tc("Could not save that. Try again."), tone: "bad", at: "add" });
      playHaptic("saveFailed");
    } finally {
      setBusy(false);
    }
  }, [newAmount, newCategory, refresh, tc]);

  /*
   * The conversion id is what support asks a member to quote, so the whole id
   * goes to the clipboard while the row only ever shows its last four.
   *
   * The confirmation replaces the id itself rather than floating over the list:
   * it lands where the finger already is, and covers nothing.
   */
  const onCopyRef = useCallback(async (rowId: string, ref: string) => {
    const ok = await copyToClipboard(ref);
    if (!ok) return;
    setCopiedId(rowId);
  }, []);

  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), 1600);
    return () => clearTimeout(timer);
  }, [copiedId]);

  const onDelete = useCallback(
    async (row: SpendTxRow) => {
      setBusy(true);
      try {
        await deleteSpendTx(row.id);
        setOpenId(null);
        setConfirmingDelete(false);
        setMessage({ text: tc("Deleted."), tone: "good", at: "page" });
        await refresh();
      } catch {
        setMessage({ text: tc("Could not delete that. Try again."), tone: "bad", at: "row" });
      } finally {
        setBusy(false);
      }
    },
    [refresh, tc],
  );

  /*
   * Worked out before the guards below: these are hooks, and a hook that only
   * runs on some renders changes the hook count between them, which React
   * refuses. The GoGoSpend card came up blank for exactly that reason.
   */
  const visibleRows = useMemo(
    () => filterSpendRowsByDirection(rows, direction),
    [direction, rows],
  );

  /*
   * The member's own categories first, then any starter they have not used yet.
   * Their own come first because a member who has named "Coffee" reaches for it
   * far more often than for our "Household".
   */
  const addCategories = useMemo(() => {
    const mine = ownCategories
      .filter((row) => row.type !== "income")
      .map((row) => row.name);
    const seen = new Set(mine);
    return [
      ...mine,
      ...STARTER_EXPENSE_CATEGORIES.filter((name) => !seen.has(name)),
    ];
  }, [ownCategories]);

  /*
   * Only the months with something in them, newest first — plus the month being
   * shown, so the dropdown never renders empty while the list is in flight.
   */
  const dropdownMonths = useMemo(() => {
    if (months.some((m) => m.month === selectedMonth)) return months;
    return [
      {
        month: selectedMonth,
        expense_minor: summary?.expense_minor ?? 0,
        income_minor: summary?.income_minor ?? 0,
      },
      ...months,
    ];
  }, [months, selectedMonth, summary]);

  if (!isSpendEnabled() || !spendLive) {
    return <Redirect href="/" />;
  }
  if (!isAuthed) {
    return <Redirect href="/login" />;
  }

  const came = summary?.income_minor ?? 0;
  const spent = summary?.expense_minor ?? 0;

  /*
   * Pinned above the list on phone (#2526). Same markup as before — month,
   * direction, three totals — so the signed-off control does not fork. The
   * frame puts this in the shell's stickyHeader slot; the records stay in
   * the scrolling children.
   */
  const filterSection = (
    <View style={styles.filterCard}>
      {/* month */}
      <View style={styles.monthSection}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={spendMonthLabel(selectedMonth, locale)}
          onPress={() => {
            configureStageChange(reducedMotion);
            setMonthDropdownOpen((open) => !open);
          }}
          style={({ pressed }) => [
            styles.monthDropdown,
            pressed && styles.controlPressed,
          ]}
        >
          <Text style={styles.monthDropdownLabel}>
            {spendMonthLabel(selectedMonth, locale)}
          </Text>
          <ChevronDown
            color={themeColors.muted}
            size={18}
            strokeWidth={typography.iconStrokeWidth}
          />
        </Pressable>

        {monthDropdownOpen ? (
          <View style={styles.monthMenu}>
            {dropdownMonths.map((m) => {
              const isSelected = m.month === selectedMonth;
              return (
                <Pressable
                  key={m.month}
                  accessibilityRole="button"
                  onPress={() => {
                    playHaptic("segmentChange");
                    configureStageChange(reducedMotion);
                    setSelectedMonth(m.month);
                    setMonthDropdownOpen(false);
                    setOpenId(null);
                  }}
                  style={({ pressed }) => [
                    styles.monthMenuItem,
                    isSelected && styles.monthMenuItemActive,
                    pressed && styles.controlPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.monthMenuItemText,
                      isSelected && styles.monthMenuItemTextActive,
                    ]}
                  >
                    {spendMonthLabel(m.month, locale)}
                  </Text>
                  <Text style={styles.monthMenuItemSub}>
                    {formatCompactBaht(m.expense_minor)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* all / money in / money out */}
      <View style={styles.segmentRow}>
        {(
          [
            ["all", "All"],
            ["in", "Income"],
            ["out", "Expense"],
          ] as const
        ).map(([value, label]) => (
          <AnimatedPressable
            key={value}
            accessibilityRole="button"
            onPress={() => {
              playHaptic("segmentChange");
              configureStageChange(reducedMotion);
              setDirection(value);
              setOpenId(null);
            }}
            onPressIn={() => setPressedSegment(value)}
            onPressOut={() => setPressedSegment(null)}
            style={[
              styles.segmentButton,
              direction === value && styles.segmentButtonActive,
              direction === value ? directionPop : null,
              pressedSegment === value && styles.controlPressed,
            ]}
          >
            <Text
              style={[
                styles.segmentButtonLabel,
                direction === value && styles.segmentButtonLabelActive,
              ]}
            >
              {tc(label)}
            </Text>
          </AnimatedPressable>
        ))}
      </View>

      {/* the three totals — always all three, whichever button is on */}
      <View style={styles.framesRow}>
        <View style={styles.frameCard}>
          <Text style={styles.frameLabel}>{tc("Income")}</Text>
          <Text style={styles.frameValue}>
            +{formatCompactBaht(came)}
          </Text>
        </View>
        <View style={styles.frameCard}>
          <Text style={styles.frameLabel}>{tc("Expense")}</Text>
          <Text style={styles.frameValue}>{formatCompactBaht(spent)}</Text>
        </View>
        <View style={styles.frameCard}>
          <Text style={styles.frameLabel}>{tc("Left over")}</Text>
          <Text style={styles.frameValue}>
            {came - spent >= 0 ? "+" : "−"}
            {formatCompactBaht(Math.abs(came - spent))}
          </Text>
        </View>
      </View>
    </View>
  );

  const messageNode = (where: "add" | "row" | "page") => {
    if (!message || message.at !== where) return null;
    /*
     * Only the page-level slot ever carries a landed save: onAdd and onSave
     * both close their own control on success and hand the line off here, so
     * this is the one messageNode call that can ever show "Saved."/"Changed."
     * The add/row slots only ever show a validation or failure line, and a
     * bounce on bad news is not the one earned overshoot.
     */
    if (where === "page") {
      return (
        <Animated.Text
          accessibilityRole={message.tone === "bad" ? "alert" : undefined}
          style={[
            styles.message,
            message.tone === "bad" && styles.messageBad,
            savedPop,
          ]}
          testID={`spend-message-${message.tone}`}
        >
          {message.text}
        </Animated.Text>
      );
    }
    return (
      <Text
        accessibilityRole={message.tone === "bad" ? "alert" : undefined}
        style={[styles.message, message.tone === "bad" && styles.messageBad]}
        testID={`spend-message-${message.tone}`}
      >
        {message.text}
      </Text>
    );
  };

  return (
    /*
     * The header names GoGoSpend, not this page (owner call 2026-08-31), the
     * same as "More ways to add". The row is a chevron plus a title, so naming
     * the parent makes the two read as one control — "back to GoGoSpend" —
     * which is where back now goes. The route keeps "View all" as its own
     * title for the desktop sidebar and the web page name.
     */
    <ProfileSubPageFrame
      onBackPress={goBackToSpend}
      onRefresh={refresh}
      /*
       * Strip above the filters, both inside the one sticky slot the frame
       * offers. The filters were already pinned here (#2526) and must stay
       * pinned — scrolling a month's list with its month selector off screen
       * is what that ticket fixed.
       */
      stickyHeader={
        <>
          <SpendSectionTabs active="records" />
          {filterSection}
        </>
      }
      title={tc("Jotbun")}
    >
      {/* ── add one from here ───────────────────────────────────────── */}
      <View style={styles.addCard}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: adding }}
          onPress={() => {
            setMessage(null);
            // Opening raises a form; closing abandons one. Only the first is
            // a commitment, so only the first gets a verb.
            if (!adding) playHaptic("sheetOpen");
            configureStageChange(reducedMotion);
            setAdding((open) => !open);
          }}
          style={({ pressed }) => [
            styles.addToggle,
            pressed && styles.controlPressed,
          ]}
        >
          <Text style={styles.addToggleLabel}>
            {adding ? tc("Cancel") : `＋ ${tc("Add expense")}`}
          </Text>
        </Pressable>

        {adding ? (
          <View style={styles.addBody}>
            <View style={styles.amountRow}>
              <Text style={styles.amountCurrency}>฿</Text>
              <TextInput
                value={newAmount}
                onChangeText={setNewAmount}
                inputMode="decimal"
                placeholder="0"
                placeholderTextColor={styles.placeholder.color}
                style={styles.amountInput}
                accessibilityLabel={tc("Amount in baht")}
              />
            </View>

            <View style={styles.chipRow}>
              {addCategories.map((name) => {
                const look = spendCategoryLookFor(name, ownCategories);
                const picked = newCategory === name;
                return (
                  <AnimatedPressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: picked }}
                    hitSlop={CHIP_HIT_SLOP}
                    onPress={() => {
                      playHaptic("segmentChange");
                      setNewCategory(name);
                    }}
                    onPressIn={() => setPressedChip(name)}
                    onPressOut={() => setPressedChip(null)}
                    style={[
                      styles.chip,
                      /*
                      * The BORDER is not the hue. Every pastel measures under
                      * 2.5:1 on the white card, where 3:1 is what a UI boundary
                      * needs — see spendCategoryLine. The fill below keeps the
                      * hue untouched, because a picked chip puts near-black ink
                      * on it and the pastels are light on purpose.
                      */
                      look.hue
                        ? { borderColor: spendCategoryLine(look.hue, themeColors.isDark) }
                        : null,
                      picked && look.hue
                        ? { backgroundColor: look.hue, borderColor: look.hue }
                        : null,
                      picked && !look.hue ? styles.chipOnNeutral : null,
                      picked ? categoryPop : null,
                      pressedChip === name && styles.controlPressed,
                    ]}
                  >
                    <Text style={styles.chipEmoji}>{look.emoji}</Text>
                    <Text
                      style={[
                        styles.chipLabel,
                        picked && look.hue ? styles.chipLabelOn : null,
                        picked && !look.hue ? styles.chipLabelOnNeutral : null,
                      ]}
                    >
                      {tc(name)}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void onAdd()}
              style={({ pressed }) => [
                styles.primaryButton,
                busy && styles.controlDisabled,
                pressed && !busy && styles.controlPressed,
              ]}
            >
              <Text style={styles.primaryLabel}>{tc("Save")}</Text>
            </Pressable>
            {messageNode("add")}
          </View>
        ) : null}
      </View>

      {/* ── the records ─────────────────────────────────────────────── */}
      {loaded && visibleRows.length === 0 ? (
        <Text style={styles.empty}>
          {tc(
            direction === "all"
              ? "Nothing here yet. Add your first expense above."
              : "Nothing here this month.",
          )}
        </Text>
      ) : null}

      {visibleRows.length > 0 ? (
        <View style={styles.card}>
          {visibleRows.map((row, index) => {
            const look = spendCategoryLookFor(row.category, ownCategories);
            const line = spendRowSecondLine(row);
            const open = openId === row.id;
            const justCopied = copiedId === row.id;
            return (
              <View
                key={row.id}
                style={[styles.rowBlock, index > 0 && styles.rowDivider]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${tc(row.category)} ${formatBaht(row.amount_minor)}`}
                  onPress={() => onOpen(row)}
                  style={({ pressed }) => [
                    styles.row,
                    pressed && styles.controlPressed,
                  ]}
                >
                  {/*
                   * Where the product photo sits in the apps the owner sent
                   * (design B). This tile is the one SURFACE in the diary that
                   * carries a category's identity, which is exactly where the
                   * spec allows colour: it attaches to surfaces and categories,
                   * never to the figures. The amount at the end of this row
                   * stays in ink on the card, untouched.
                   *
                   * The TINT, not the hue at a tenth of its alpha. `hue + "1A"`
                   * composited against whatever happened to be behind it, so
                   * its real colour was a property of the stacking context and
                   * no test could name it; and one alpha served both themes,
                   * where a wash toward white can carry far more hue than the
                   * same wash toward #1A1F1D before the tile starts to glow.
                   * `spendCategoryPaint` mixes toward the exact card this row
                   * sits on, per theme, and hands back an opaque colour —
                   * measured 1.04:1 to 1.17:1 against that card across all
                   * thirteen shipped hues, a surface that is plainly there and
                   * still quieter than the amount beside it.
                   *
                   * No border here, deliberately: `spendCategoryLine`'s 3:1 was
                   * measured against the CARD, and a tint behind it drops that
                   * to 2.69-2.94:1 on the light theme. See the guard test.
                   */}
                  <View
                    testID={`spend-row-tile-${row.id}`}
                    style={[
                      styles.rowChip,
                      {
                        backgroundColor: spendCategoryPaint(
                          look.hue ?? themeColors.muted,
                          themeColors.isDark,
                        ).tint,
                      },
                    ]}
                  >
                    <Text style={styles.rowChipEmoji}>{look.emoji}</Text>
                  </View>

                  <View style={styles.rowMain}>
                    <Text numberOfLines={1} style={styles.rowCategory}>
                      {tc(row.category)}
                    </Text>
                    {/*
                     * Shop · id on a row GoGoCash filled in; the member's own
                     * note alone on anything else. Only the id is tappable —
                     * a note that happens to read like one never becomes a
                     * control.
                     */}
                    {line.lead || line.refMasked || line.note ? (
                      <View style={styles.rowSubLine}>
                        {line.lead ? (
                          <Text numberOfLines={1} style={styles.rowSub}>
                            {line.lead}
                          </Text>
                        ) : null}
                        {line.lead && line.refMasked ? (
                          <Text style={styles.rowSub}>·</Text>
                        ) : null}
                        {line.refMasked && line.ref ? (
                          /*
                           * A Text with `onPress`, not a Pressable: the whole
                           * row is already a Pressable, and on web that renders
                           * a <button> — a second one inside it is invalid HTML
                           * and broke hydration. Text renders a <div>, so the
                           * id stays tappable without nesting one button in
                           * another.
                           */
                          <Text
                            accessibilityLabel={`${tc("Copy")} ${line.refMasked}`}
                            onPress={() => void onCopyRef(row.id, line.ref!)}
                            style={styles.rowRef}
                            suppressHighlighting
                          >
                            {justCopied ? tc("Copied") : line.refMasked}
                          </Text>
                        ) : null}
                        {(line.lead || line.refMasked) && line.note ? (
                          <Text style={styles.rowSub}>·</Text>
                        ) : null}
                        {line.note ? (
                          <Text
                            numberOfLines={1}
                            style={[styles.rowSub, styles.rowSubNote]}
                          >
                            {line.note}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                    <Text style={styles.rowDate}>
                      {spendDayLabel(row.occurred_on, locale)}
                    </Text>
                  </View>

                  <Text style={styles.rowAmount}>
                    {row.type === "income" ? "+" : ""}
                    {formatBaht(row.amount_minor)}
                  </Text>
                </Pressable>

                {open ? (
                  <View style={styles.editor}>
                    {isSpendAmountEditable(row.source) ? (
                      <TextInput
                        value={draftAmount}
                        onChangeText={setDraftAmount}
                        inputMode="decimal"
                        placeholder={tc("Amount in baht")}
                        placeholderTextColor={styles.placeholder.color}
                        style={styles.input}
                        accessibilityLabel={tc("Amount in baht")}
                      />
                    ) : (
                      <Text style={styles.rowSub}>
                        {tc(
                          "We filled this amount in — you can delete it, not change it.",
                        )}
                      </Text>
                    )}
                    <TextInput
                      value={draftCategory}
                      onChangeText={setDraftCategory}
                      placeholder={tc("Name your own category")}
                      placeholderTextColor={styles.placeholder.color}
                      style={styles.input}
                      accessibilityLabel={tc("Name your own category")}
                    />
                    <TextInput
                      value={draftNote}
                      onChangeText={setDraftNote}
                      placeholder={tc("Note (optional)")}
                      placeholderTextColor={styles.placeholder.color}
                      style={styles.input}
                      accessibilityLabel={tc("Note (optional)")}
                    />
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void onSave(row)}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        busy && styles.controlDisabled,
                        pressed && !busy && styles.controlPressed,
                      ]}
                    >
                      <Text style={styles.primaryLabel}>
                        {tc("Save changes")}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        if (confirmingDelete) void onDelete(row);
                        else setConfirmingDelete(true);
                      }}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.deleteButton,
                        busy && styles.controlDisabled,
                        pressed && !busy && styles.controlPressed,
                      ]}
                    >
                      <Text style={styles.deleteLabel}>
                        {confirmingDelete
                          ? tc("Tap again to delete for good")
                          : tc("Delete this")}
                      </Text>
                    </Pressable>
                    {messageNode("row")}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {messageNode("page")}
    </ProfileSubPageFrame>
  );
}

/** Today in Bangkok as `YYYY-MM-DD` — what a row added here is filed under. */
function bangkokToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** `offset` in whole months from the current Bangkok month. */
function bangkokMonth(offset = 0): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
}

/** Whole baht unless the satang matter — the summary card's own rule. */
function formatCompactBaht(minor: number): string {
  return `฿${(minor / 100).toLocaleString("th-TH", {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatBaht(minor: number): string {
  return `฿${(minor / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    /*
     * The filter section, copied property-for-property from the summary card so
     * the two pages present one control rather than two that nearly match.
     */
    filterCard: {
      backgroundColor: colors.card,
      borderColor: pickThemed(colors, "#3B4A44", colors.borderStrong),
      borderRadius: radii.lg,
      borderWidth: 1,
      boxShadow: elevationCss(colors, "card"),
      gap: spacing.md,
      padding: spacing.md,
    },
    monthSection: {
      position: "relative",
      zIndex: 10,
    },
    monthDropdown: {
      alignItems: "center",
      backgroundColor: colors.fieldMuted,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.md,
    },
    monthDropdownLabel: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: 17,
      fontWeight: typography.actionWeight,
      lineHeight: typography.bodyLineHeight,
    },
    monthMenu: {
      backgroundColor: colors.fieldMuted,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      /* Same level as slipMenu — one treatment for one idea across the tabs. */
      boxShadow: elevationCss(colors, "raised"),
      marginTop: spacing.xs,
      overflow: "hidden",
    },
    monthMenuItem: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.md,
    },
    monthMenuItemActive: {
      backgroundColor: colors.primarySoft,
    },
    monthMenuItemText: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      lineHeight: typography.bodyLineHeight,
    },
    monthMenuItemTextActive: {
      color: colors.primary,
      fontWeight: typography.actionWeight,
    },
    monthMenuItemSub: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontVariant: ["tabular-nums"],
      lineHeight: typography.captionLineHeight,
    },
    ...createSpendSharedControlStyles(colors),
    frameCard: {
      backgroundColor: colors.fieldMuted,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      flex: 1,
      gap: 3,
      minWidth: 0,
      paddingHorizontal: 9,
      paddingVertical: 10,
    },
    frameLabel: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: 13,
      fontWeight: typography.captionWeight,
      lineHeight: 14,
    },
    frameValue: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: 15,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
      lineHeight: 18,
    },
    /* The tile that stands where a product photo does in the apps sent. */
    rowChip: {
      alignItems: "center",
      borderRadius: 11,
      flexShrink: 0,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    rowChipEmoji: {
      fontFamily: typography.family,
      fontSize: 20,
      lineHeight: 24,
    },
    rowCategory: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      fontWeight: typography.actionWeight,
      lineHeight: typography.bodyLineHeight,
    },
    /* Shop, id and note sit on one line, so it wraps as a row not a column. */
    rowSubLine: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
    },
    /* The member's words give way first — the id must never be cut in half. */
    rowSubNote: {
      flexShrink: 1,
    },
    /*
     * The one tappable thing on the line. Brand green and the action weight, so
     * it reads as a control beside text that is not one.
     *
     * The line box IS the tap target here, and 16pt of it failed even the
     * painted 24 that `tapTarget.ts` asks of a control. There is no other
     * lever: RN 0.86's `Text` takes `pressRetentionOffset` and no `hitSlop`,
     * and it cannot become a Pressable — the row around it already is one, and
     * on web that nested a button in a button (see the note at its `onPress`).
     * `lineHeight` rather than padding so the glyph stays centred in the box
     * and no negative margin reaches across the note beside it. 44 is out of
     * reach without stealing taps from the row.
     */
    rowRef: {
      // The masked reference reads as a control, so it keeps a brand colour —
      // but the light arm has to be the legible one.
      color: pickThemed(colors, colors.accentSoft, colors.primary),
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.actionWeight,
      lineHeight: MINIMUM_TAP_TARGET,
    },
    rowDate: {
      color: colors.placeholder,
      fontFamily: typography.family,
      fontSize: 13,
      fontWeight: typography.captionWeight,
      lineHeight: 15,
    },
    /* A hairline between rows, never above the first one. */
    rowDivider: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      paddingTop: spacing.sm,
    },
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      boxShadow: elevationCss(colors, "card"),
      gap: spacing.sm,
      padding: spacing.md,
    },
    rowBlock: {
      gap: spacing.sm,
    },
    editor: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      gap: spacing.sm,
      paddingTop: spacing.sm,
    },
    input: {
      borderColor: colors.controlLine,
      borderRadius: radii.md,
      borderWidth: 1,
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.sm,
    },
    placeholder: {
      color: colors.placeholder,
    },
    /*
     * ── adding from this page ──────────────────────────────────────
     *
     * A card that is one button until it is asked to be a form, so the page
     * still opens as the list it is. The chip styles mirror the front panel's
     * (same borders, same fill-on-pick) rather than being imported from it:
     * that panel's stylesheet is built against its own gradient ground, and
     * lifting it out mid-flight would touch the screen the owner signed off.
     */
    addCard: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: radii.lg,
      borderWidth: 1,
      boxShadow: elevationCss(colors, "card"),
      gap: spacing.md,
      padding: spacing.md,
    },
    addToggle: {
      alignItems: "center",
      borderColor: colors.primary,
      borderRadius: radii.chip,
      borderStyle: "dashed",
      borderWidth: 1,
      justifyContent: "center",
      minHeight: CONTROL_HEIGHT,
    },
    addToggleLabel: {
      color: colors.primary,
      fontFamily: typography.family,
      fontSize: typography.action,
      fontWeight: typography.actionWeight,
      lineHeight: typography.actionLineHeight,
    },
    addBody: {
      gap: spacing.md,
    },
    amountRow: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: spacing.xs,
      paddingBottom: spacing.xs,
    },
    amountCurrency: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.title,
      // Matches the add sheet's own amountCurrency, which has had this since
      // it shipped — the two copies of this style had drifted apart.
      fontVariant: ["tabular-nums"],
      fontWeight: typography.titleWeight,
    },
    amountInput: {
      color: colors.ink,
      flex: 1,
      fontFamily: typography.family,
      fontSize: typography.headline,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.titleWeight,
      // Without this the field keeps its intrinsic width and pushes the row
      // past the card's right edge.
      minWidth: 0,
      paddingVertical: spacing.xs,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    chip: {
      alignItems: "center",
      borderColor: colors.borderStrong,
      borderRadius: radii.chip,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      height: CHIP_HEIGHT,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
    },
    /** A category the member invented has no hue, so a pick falls back to brand. */
    chipOnNeutral: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipEmoji: {
      fontSize: 15,
    },
    chipLabel: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: 13,
      fontWeight: "500",
    },
    /*
     * The hues are light pastels, so a picked chip takes the dark ink; a
     * category the member invented is filled with brand green instead and takes
     * the light one. Same two tokens the front panel's chips use.
     */
    chipLabelOn: {
      color: colors.onPrimaryDark,
      fontWeight: "700",
    },
    chipLabelOnNeutral: {
      color: colors.onPrimary,
      fontWeight: "700",
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: radii.chip,
      justifyContent: "center",
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.md,
    },
    primaryLabel: {
      color: colors.onPrimary,
      fontFamily: typography.family,
      fontSize: typography.action,
      fontWeight: typography.actionWeight,
      lineHeight: typography.actionLineHeight,
    },
    deleteButton: {
      alignItems: "center",
      borderColor: colors.danger,
      borderRadius: radii.chip,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.md,
    },
    deleteLabel: {
      color: colors.danger,
      fontFamily: typography.family,
      fontSize: typography.action,
      fontWeight: typography.actionWeight,
      lineHeight: typography.actionLineHeight,
    },
    row: {
      alignItems: "center",
      flexDirection: "row",
      gap: spacing.sm,
      justifyContent: "space-between",
      /*
       * The whole record is one control and it had no floor of its own —
       * `rowBlock` adds no padding, so the row was exactly as tall as the 42pt
       * emoji tile inside it. The biggest target on the page, two points short.
       */
      minHeight: CONTROL_HEIGHT,
    },
    rowMain: {
      flex: 1,
      gap: 2,
    },
    rowSub: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.captionWeight,
      lineHeight: typography.captionLineHeight,
    },
    /*
     * One style for both directions. Income used the brand green — #00CC99 on
     * a white card, ~2:1 — and the row already prefixes `+`, so the colour was
     * carrying nothing the sign did not. Two identical styles would only be a
     * place for them to drift apart again.
     */
    rowAmount: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      fontVariant: ["tabular-nums"],
      fontWeight: typography.actionWeight,
      lineHeight: typography.bodyLineHeight,
    },
    empty: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.body,
      fontWeight: typography.bodyWeight,
      lineHeight: typography.bodyLineHeight,
    },
  });
}
