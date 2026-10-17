import { Redirect, useRouter } from "expo-router";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IntlContext } from "react-intl";

import { ProfileSubPageFrame } from "@mobile/components/ProfileSubPageFrame";
import { SpendMediaPermissionPrimer } from "@mobile/components/SpendMediaPermissionPrimer";
import { isSpendEnabled } from "@mobile/config/featureFlags";
import { useMarketSpendEnabled } from "@mobile/navigation/appChrome";
import { useCopy } from "@mobile/i18n/useCopy";
import { openAppSettings } from "@mobile/lib/openAppSettings";
import { useThemedStyles } from "@mobile/theme/useThemedStyles";
import { Text, TextInput } from "@mobile/theme/AppText";
import { useThemeColors } from "@mobile/theme/ThemeProvider";
import { BlurView } from "expo-blur";
import { materialGlass } from "@mobile/theme/elevation";
import { typography } from "@mobile/theme/tokens";
import { useAuthGuardSession } from "@mobile/auth/useAuthGuardSession";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { ApiError } from "@mobile/api/client";
import { ChevronDown, Download, Plus, X } from "@mobile/theme/icons";
import { SpendNewCategorySheet } from "@mobile/components/SpendNewCategorySheet";
import { SpendDatePicker } from "@mobile/components/SpendDatePicker";
import {
  addSpendTx,
  createSpendCategory,
  fetchSpendCategories,
  fetchSpendMonths,
  fetchSpendSummary,
  fetchSpendTxs,
  readSpendSlip,
  type SpendCategoryRow,
  type SpendMonthRow,
  type SpendSummary,
  type SpendTxRow,
  type SpendTxType,
} from "@mobile/spend/spendResource";
import {
  monthOverMonthPercent,
  previousMonth,
  slipAmountToInput,
  spendCategoryLookFor,
  spendDirectionBars,
  spendGroupedSlices,
  spendDonutArcs,
  spendMonthLabel,
  spendPanelGradient,
  STARTER_EXPENSE_CATEGORIES,
  STARTER_INCOME_CATEGORIES,
} from "@mobile/spend/spendFrontPage";
import { spendCategoryLine } from "@mobile/spend/spendCategoryLine";
import { spendImportUserMessage } from "@mobile/spend/spendImportCopy";
import {
  markSpendIntroSeen,
  readSpendIntroSeen,
} from "@mobile/spend/spendIntro";
import {
  pickSpendSlipFromPhotos,
  pickSpendSlipPhoto,
  takeSpendSlipPhoto,
} from "@mobile/spend/pickSpendImportFile";
import { peekSpendMediaPermissionStatus } from "@mobile/spend/peekSpendMediaPermissionStatus";
import { spendMediaPermissionCopy } from "@mobile/spend/spendMediaPermissionCopy";
import {
  trackSpendMediaOpenSettings,
  trackSpendMediaPermissionDenied,
  trackSpendMediaPermissionGranted,
  trackSpendMediaPermissionRequested,
} from "@mobile/spend/spendMediaPermissionTelemetry";
import { isSpendPieShareUnlocked } from "@mobile/spend/spendShare";
import { trackSpendTxAdded } from "@mobile/spend/spendTelemetry";
import { SpendIntro } from "@mobile/spend/SpendIntroScreen";
import { SpendSectionTabs } from "@mobile/spend/SpendSectionTabs";
import {
  FAB_CLEARANCE,
  PANEL_BASE_GRADIENT_ID,
  PANEL_GLOW_GRADIENT_ID,
  PANEL_RADIUS,
} from "@mobile/spend/spendLayout";
import { createSpendStyles } from "@mobile/spend/spendStyles";
import { useReducedMotion } from "@mobile/hooks/useReducedMotion";
import { playHaptic } from "@mobile/lib/hapticMoment";
import { AnimatedPressable } from "@mobile/theme/animatedMotion";
import { configureStageChange } from "@mobile/theme/stageChange";
import { useSpringPop } from "@mobile/theme/useSpringPop";

/** Where a slip photo can come from, in the order the menu offers them. */
type SlipSource = "photos" | "camera" | "files";

/**
 * GoGoSpend front page — "A · the add bar", owner call 2026-08-30.
 *
 * Adding comes first and stays open: no button to press before you can type.
 * The month's numbers sit under it, and the file/slip/bank instructions that
 * used to own this whole screen now live one tap away on `/spend/import`.
 */
export function CustomerSpendScreen() {
  const styles = useThemedStyles(createSpendStyles);
  const insets = useSafeAreaInsets();
  /*
   * The wash is drawn by Svg props, not styles, so it reads the theme directly
   * rather than coming out of the stylesheet.
   */
  const themeColors = useThemeColors();
  const panelWash = spendPanelGradient(themeColors.isDark ? "dark" : "light");
  const tc = useCopy();
  /*
   * Every hook has to run on every render, and four early returns sit below —
   * the feature flag, the auth guard, and the two the first-look page needs.
   * Reading the locale after those made the hook count jump the moment
   * `introSeen` resolved, which is the render every member reaches: React threw
   * "Rendered more hooks than during the previous render" and GoGoSpend came up
   * blank. `useContext` rather than `useIntl` because the latter throws when no
   * provider is mounted, and the month name has a sane English fallback.
   */
  const locale = useContext(IntlContext)?.locale ?? "en";
  const router = useRouter();
  const spendLive = useMarketSpendEnabled();
  const { isAuthed } = useAuthGuardSession();
  /*
   * ABOVE the four early returns at 586-589, like every other hook on this
   * screen. The comment at 118-127 records what happens otherwise: the hook
   * count grew on the render where `introSeen` resolved — the render every
   * member reaches — and React threw "Rendered more hooks than during the
   * previous render", so GoGoSpend came up blank.
   */
  const reducedMotion = useReducedMotion();

  const [txType, setTxType] = useState<SpendTxType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(
    STARTER_EXPENSE_CATEGORIES[0],
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /*
   * The panel's one feedback line. `tone` exists because success and failure
   * used to render in the same `colors.ink` and were indistinguishable even
   * when they were on screen at all.
   */
  const [message, setMessage] = useState<{
    text: string;
    tone: "good" | "bad";
  } | null>(null);
  /*
   * What the last slip photo did, shown as one line under the amount. `ok`
   * also drives the ring on the money out / in switch: the reader fills in
   * "money out" for every slip because it CANNOT tell a slip the member sent
   * from one they received, so the ring asks them to confirm rather than
   * letting the guess through silently.
   */
  const [slipHint, setSlipHint] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  /**
   * Camera/photos OS deny recovery (#2651). When set, show denied copy +
   * Open Settings (native) under the amount row — not the old inline hint only.
   * Value is the denied source so AppState resume only clears when *that*
   * grant flips on (photos vs camera are separate OS permissions).
   */
  const [slipMediaDeniedSource, setSlipMediaDeniedSource] = useState<
    "photos" | "camera" | null
  >(null);
  /** Primer before first camera/photos OS sheet — never cold start. */
  const [showMediaPrimer, setShowMediaPrimer] = useState(false);
  const [pendingMediaSource, setPendingMediaSource] = useState<
    "photos" | "camera" | null
  >(null);
  const mediaPickInFlightRef = useRef(false);
  /** Whether the "where is the slip" menu under the camera is showing. */
  const [slipMenuOpen, setSlipMenuOpen] = useState(false);
  /*
   * The day the row will be filed under, `YYYY-MM-DD`. Filled in with today and
   * changeable, because a spend is often recorded after the fact (owner call
   * 2026-09-07) — the panel used to save everything on today, so a Saturday
   * lunch remembered on Monday became a Monday lunch.
   *
   * A slip read WRITES here rather than to a hidden field of its own, so the
   * date printed on the paper is shown to the member and can be corrected
   * before saving. It stays where they leave it after a save, which is what
   * makes catching up on several days one pass instead of many.
   */
  const [entryDate, setEntryDate] = useState(() => bangkokToday());

  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    bangkokMonth(0),
  );
  const [months, setMonths] = useState<SpendMonthRow[]>([]);
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);
  const [summaryFilter, setSummaryFilter] = useState<"all" | "in" | "out">(
    "all",
  );

  const [summary, setSummary] = useState<SpendSummary | null>(null);
  const typePop = useSpringPop(txType);
  const filterPop = useSpringPop(summaryFilter);
  const categoryPop = useSpringPop(category);
  /*
   * Pressed feedback for this screen's three `AnimatedPressable` groups.
   *
   * `typePop`/`filterPop`/`categoryPop` only fire on an actual selection
   * CHANGE, and none of them distinguishes "finger down" from "finger up"
   * even when it does fire. `AnimatedPressable` cannot take a function
   * style (see `AnimatedPressableProps` in `theme/animatedMotion.ts`), so
   * this tracks press state by hand and folds it into the array style each
   * control already uses — the same shape the records tab's segment button
   * and category chip use.
   */
  const [pressedType, setPressedType] = useState<SpendTxType | null>(null);
  const [pressedFilter, setPressedFilter] = useState<
    "all" | "in" | "out" | null
  >(null);
  const [pressedCategory, setPressedCategory] = useState<string | null>(null);
  const [lastMonth, setLastMonth] = useState<SpendSummary | null>(null);
  /*
   * This month's own read did not come back — which is NOT a quiet synonym for
   * an empty month.
   *
   * Seen on the simulator 2026-09-11: every spend read returned 428 and the
   * card rendered ฿0.00, "No last month to compare" and "Nothing recorded
   * yet". `summary` was null because the read threw, and every
   * `summary?.<field> ?? 0` downstream turned that into a confident zero. On
   * the one screen in this app that is about a member's money, a request we
   * could not complete must never be drawn as a month they did not spend in.
   *
   * Still fabricated: the first paint of every visit, where `summary` is null
   * because nothing has been asked for yet and the card draws zeroes for that
   * moment too. Suppressing those needs a loading state the card does not have
   * a design for; it belongs with the summary card's own redesign, not here.
   */
  const [monthUnreachable, setMonthUnreachable] = useState(false);
  /** Whether the add sheet is up. Closed on arrival: the month leads. */
  const [addOpen, setAddOpen] = useState(false);
  /*
   * Tracked apart from `lastMonth` for the same reason. Both a failed read and
   * a genuinely first month leave `lastMonth` null, and only one of them
   * entitles the card to say "No last month to compare" — which is a claim
   * about what last month held, not about our own connection.
   */
  const [lastMonthFailed, setLastMonthFailed] = useState(false);
  const [txs, setTxs] = useState<SpendTxRow[]>([]);
  /*
   * The member's own categories. Empty until the fetch lands, which is exactly
   * what `spendCategoryLookFor` wants — every chip keeps its old look rather
   * than flashing the neutral tag on the way in.
   */
  const [ownCategories, setOwnCategories] = useState<SpendCategoryRow[]>([]);
  const [namingCategory, setNamingCategory] = useState(false);
  /*
   * `null` while the phone is still being asked. Rendering nothing for that
   * moment is what stops the panel flashing up before the intro replaces it on
   * a first visit.
   */
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);

  useEffect(() => {
    void readSpendIntroSeen().then(setIntroSeen);
  }, []);

  const onLeaveIntro = useCallback(() => {
    setIntroSeen(true);
    void markSpendIntroSeen();
  }, []);

  const refresh = useCallback(async () => {
    /*
     * This month is the one read the card cannot draw without, so it is
     * awaited on its own and its failure is a state rather than a silence.
     * The others still fail quiet — a chip row of starters is a far better
     * outcome than a page that will not draw because one list did not arrive
     * — but a failure is now RECORDED rather than flattened into an empty
     * success, because "we did not get last month" and "last month was empty"
     * are different sentences and the card says one of them out loud.
     */
    let thisMonth: SpendSummary | null;
    try {
      thisMonth = await fetchSpendSummary(selectedMonth);
    } catch {
      // The add panel stays usable: that was always the right call here, and
      // the only thing wrong with it was the fabricated zeroes beside it.
      setMonthUnreachable(true);
      return;
    }

    const [previous, monthList, rows, mine] = await Promise.all([
      fetchSpendSummary(previousMonth(selectedMonth))
        .then((row) => ({ reached: true, row }))
        .catch(() => ({ reached: false, row: null as SpendSummary | null })),
      fetchSpendMonths().catch(() => [] as SpendMonthRow[]),
      fetchSpendTxs(selectedMonth).catch(() => [] as SpendTxRow[]),
      fetchSpendCategories().catch(() => [] as SpendCategoryRow[]),
    ]);

    setSummary(thisMonth);
    setLastMonth(previous.row);
    setLastMonthFailed(!previous.reached);
    setMonths(monthList);
    setTxs(rows);
    setOwnCategories(mine);
    setMonthUnreachable(false);
  }, [selectedMonth]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /*
   * Starters first, then the member's own, deduped by name.
   *
   * Their categories were being stored and never handed back, so one they made
   * disappeared the moment they left the page and had to be retyped. Starters
   * lead because they are the ones most days need; a name that matches a
   * starter is not repeated, it just wears whatever look they gave it.
   */
  const starters =
    txType === "expense"
      ? STARTER_EXPENSE_CATEGORIES
      : STARTER_INCOME_CATEGORIES;
  const categories = useMemo(() => {
    const seen = new Set(starters.map((name) => name.trim().toLowerCase()));
    const mine = ownCategories
      .filter((row) => row.type === txType)
      .map((row) => row.name)
      .filter((name) => {
        const key = name.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    return [...starters, ...mine];
  }, [ownCategories, starters, txType]);

  const onNameCategory = useCallback(
    async (input: { name: string; emoji?: string; hue?: string }) => {
      setBusy(true);
      try {
        const made = await createSpendCategory({
          ...input,
          // Narrowed the same way the server does: categories are only ever
          // expense or income, while a transaction type can also be transfer.
          type: txType === "income" ? "income" : "expense",
        });
        // Straight into the list and straight into the field: the member named
        // it because they are about to use it.
        setOwnCategories((rows) => [
          made,
          ...rows.filter(
            (row) =>
              row.type !== made.type ||
              row.name.trim().toLowerCase() !== made.name.trim().toLowerCase(),
          ),
        ]);
        setCategory(made.name);
        setNamingCategory(false);
      } catch {
        setMessage({ text: tc("Could not add that category. Try again."), tone: "bad" });
      } finally {
        setBusy(false);
      }
    },
    [tc, txType],
  );

  /*
   * Closing drops whatever the sheet was saying, not what it was holding. A
   * member who closes and reopens gets their half-typed amount back; a stale
   * "Saved." or "Could not save that" from the last visit would be a lie about
   * what just happened.
   */
  const closeAddSheet = useCallback(() => {
    setAddOpen(false);
    setMessage(null);
  }, []);

  const onSwitchType = useCallback((next: SpendTxType) => {
    playHaptic("segmentChange");
    // Either segment answers the ring's question, including the one already on.
    setSlipHint((hint) => (hint?.ok ? null : hint));
    setTxType(next);
    setCategory(
      next === "expense"
        ? STARTER_EXPENSE_CATEGORIES[0]
        : STARTER_INCOME_CATEGORIES[0],
    );
  }, []);

  /**
   * Read a slip, from wherever the member keeps it.
   *
   * Three sources rather than one (owner call 2026-09-11). This button used to
   * be the file browser alone, which on a phone is the Files app — the slip a
   * member had just screenshotted or photographed was in their camera roll,
   * where this could not reach, so the camera glyph promised something it never
   * did.
   *
   * Photos / camera (#2651): peek → undetermined primer → OS sheet; denied →
   * Open Settings. Files stays document-picker and works when media is denied.
   */
  const surfaceMediaDenied = useCallback(
    (source: "photos" | "camera", isReprompt: boolean) => {
      trackSpendMediaPermissionDenied({ source, isReprompt });
      setSlipMediaDeniedSource(source);
      setSlipHint({
        ok: false,
        text: tc(spendMediaPermissionCopy.deniedBody),
      });
    },
    [tc],
  );

  const completeSlipPick = useCallback(
    async (
      from: SlipSource,
      denyReprompt: boolean = true,
    ): Promise<"ok" | "denied" | "other"> => {
      const picked =
        from === "photos"
          ? await pickSpendSlipFromPhotos()
          : from === "camera"
            ? await takeSpendSlipPhoto()
            : await pickSpendSlipPhoto();
      if (!picked.ok) {
        if (picked.reason === "denied") {
          surfaceMediaDenied(
            from === "camera" ? "camera" : "photos",
            denyReprompt,
          );
          return "denied";
        }
        if (picked.reason === "too_large") {
          setSlipHint({
            ok: false,
            text: tc(
              "That file is over 12 MB. Split the export into 12-month chunks.",
            ),
          });
        } else if (picked.reason === "unavailable") {
          setSlipHint({
            ok: false,
            text: tc(
              "This app build cannot pick files yet. Update GoGoCash, or open in the browser.",
            ),
          });
        }
        return "other";
      }
      setSlipMediaDeniedSource(null);
      setBusy(true);
      setSlipHint(null);
      try {
        const read = await readSpendSlip(picked.blob, picked.filename);
        const typed = slipAmountToInput(read.amount_minor);
        if (typed === null) {
          setSlipHint({
            ok: false,
            text: tc(spendImportUserMessage("BAD_AMOUNT")),
          });
          return "other";
        }
        setAmount(typed);
        setEntryDate(read.occurred_on);
        setSlipHint({ ok: true, text: tc("From your slip") });
        return "ok";
      } catch (error) {
        const code = error instanceof ApiError ? error.code : undefined;
        setSlipHint({ ok: false, text: tc(spendImportUserMessage(code)) });
        return "other";
      } finally {
        setBusy(false);
      }
    },
    [surfaceMediaDenied, tc],
  );

  const runMediaSlipPick = useCallback(
    async (from: "photos" | "camera", fromPrimer: boolean) => {
      if (mediaPickInFlightRef.current) return;
      mediaPickInFlightRef.current = true;
      if (fromPrimer) {
        trackSpendMediaPermissionRequested({ source: from });
      }
      try {
        const outcome = await completeSlipPick(from, !fromPrimer);
        if (fromPrimer) {
          if (outcome === "ok") {
            trackSpendMediaPermissionGranted({ source: from });
          }
          // denied is already tracked inside surfaceMediaDenied
        }
      } finally {
        mediaPickInFlightRef.current = false;
      }
    },
    [completeSlipPick],
  );

  const onReadSlip = useCallback(
    async (from: SlipSource) => {
      setSlipMenuOpen(false);
      if (from === "files") {
        // Document-picker path — leave media denied recovery up if the member
        // cancels/fails files; only a successful pick clears the banner.
        await completeSlipPick("files");
        return;
      }
      if (showMediaPrimer || mediaPickInFlightRef.current) return;

      const permission = await peekSpendMediaPermissionStatus(
        from === "camera" ? "camera" : "library",
      );
      if (permission === "undetermined") {
        setPendingMediaSource(from);
        setShowMediaPrimer(true);
        return;
      }
      if (permission === "denied") {
        surfaceMediaDenied(from, true);
        return;
      }
      // granted | unavailable — proceed (unavailable falls back to files).
      await runMediaSlipPick(from, false);
    },
    [completeSlipPick, runMediaSlipPick, showMediaPrimer, surfaceMediaDenied],
  );

  const confirmMediaPrimer = useCallback(() => {
    if (mediaPickInFlightRef.current || !pendingMediaSource) return;
    const source = pendingMediaSource;
    setShowMediaPrimer(false);
    setPendingMediaSource(null);
    void runMediaSlipPick(source, true);
  }, [pendingMediaSource, runMediaSlipPick]);

  const dismissMediaPrimer = useCallback(() => {
    setShowMediaPrimer(false);
    setPendingMediaSource(null);
  }, []);

  const openSpendMediaSettings = useCallback(async () => {
    const result = await openAppSettings();
    trackSpendMediaOpenSettings({
      outcome: result.ok
        ? "opened"
        : result.reason === "unsupported_platform"
          ? "unsupported"
          : "failed",
      ...(result.ok ? { method: result.method } : {}),
      ...(slipMediaDeniedSource
        ? { source: slipMediaDeniedSource }
        : {}),
    });
  }, [slipMediaDeniedSource]);

  // After Open Settings, re-peek when the app returns — clear denied UI only
  // when the *denied* source flips on (photos ≠ camera OS grants).
  useEffect(() => {
    if (!slipMediaDeniedSource) return;
    const deniedSource = slipMediaDeniedSource;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      void (async () => {
        const permission = await peekSpendMediaPermissionStatus(
          deniedSource === "camera" ? "camera" : "library",
        );
        if (permission === "granted") {
          setSlipMediaDeniedSource(null);
          setSlipHint(null);
        }
      })();
    });
    return () => subscription.remove();
  }, [slipMediaDeniedSource]);

  const onSave = useCallback(async () => {
    const baht = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(baht) || baht <= 0) {
      setMessage({ text: tc("Type an amount first."), tone: "bad" });
      return;
    }
    const named = category.trim();
    if (!named) {
      setMessage({ text: tc("Give the category a name."), tone: "bad" });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await addSpendTx({
        amount_minor: Math.round(baht * 100),
        type: txType,
        occurred_on: entryDate,
        category: named,
        note,
      });
      trackSpendTxAdded("manual");
      setAmount("");
      setNote("");
      setSlipHint(null);
      setMessage({
        text: txType === "expense" ? tc("Saved.") : tc("Money in saved."),
        tone: "good",
      });
      playHaptic("saveLanded");
      /*
       * Closes on success only. A failed save keeps the sheet up with the
       * amount still in it, because closing would throw away what they typed
       * AND hide the reason — the pairing that made Save look inert before
       * `1be840dd`.
       */
      setAddOpen(false);
      void refresh();
    } catch {
      setMessage({ text: tc("Could not save that. Try again."), tone: "bad" });
      playHaptic("saveFailed");
    } finally {
      setBusy(false);
    }
  }, [amount, category, entryDate, note, refresh, tc, txType]);

  const onSharePie = useCallback(async () => {
    if (!summary) return;
    const lines = [
      `GoGoSpend ${summary.month}`,
      `${tc("GoGoSpend expenses")}: ${formatBaht(summary.expense_minor)}`,
      ...summary.pie.map(
        (slice) => `${slice.category} · ${formatBaht(slice.amount_minor)}`,
      ),
    ];
    const messageText = lines.join("\n");
    try {
      await Share.share({ message: messageText });
    } catch {
      const url = `https://line.me/R/share?text=${encodeURIComponent(messageText)}`;
      await Linking.openURL(url).catch(() => {
        setMessage({ text: tc("Could not open LINE to share this month."), tone: "bad" });
      });
    }
  }, [summary, tc]);

  /*
   * Everything the card is drawn from, worked out BEFORE the guards below.
   *
   * Six of these are hooks, and the guards return early — most importantly the
   * two for the first-look page, which stop rendering until `introSeen` has
   * resolved. Leaving them underneath meant the hook count grew on the render
   * where it resolved, which is the render every member reaches: React threw
   * "Rendered more hooks than during the previous render" and GoGoSpend came up
   * blank. Cheap enough to compute on a render that is about to redirect.
   */
  const spent = summary?.expense_minor ?? 0;
  const came = summary?.income_minor ?? 0;
  const leftOver = came - spent;
  const change = monthOverMonthPercent(spent, lastMonth?.expense_minor ?? 0);
  /*
   * The server totals this in the pass it already makes over the month, which
   * keeps the figure right when the transaction list is capped at 200 rows.
   * The reduce stays as the fallback for an app talking to an API that has not
   * shipped the field, where the visible rows are all we have.
   */
  const cashback =
    summary?.cashback_minor ??
    txs
      .filter((row) => row.source === "autolog" && row.type === "income")
      .reduce((total, row) => total + row.amount_minor, 0);
  const missedOffers = summary?.missed_offer_count ?? 0;

  const activeSlices = useMemo(() => {
    if (!summary) return [];
    if (summaryFilter === "in") return summary.pie_in ?? [];
    return summary.pie ?? [];
  }, [summary, summaryFilter]);

  const SPEND_DONUT_RADIUS = 45;
  const SPEND_DONUT_CIRCUMFERENCE = 2 * Math.PI * SPEND_DONUT_RADIUS;

  const colourForCategory = useCallback(
    (categoryName: string) =>
      spendCategoryLookFor(categoryName, ownCategories).hue ??
      themeColors.muted,
    [ownCategories, themeColors.muted],
  );

  const donutArcs = useMemo(
    () =>
      spendDonutArcs(
        activeSlices,
        SPEND_DONUT_CIRCUMFERENCE,
        colourForCategory,
      ),
    [activeSlices, colourForCategory],
  );

  const directionBars = useMemo(
    () =>
      spendDirectionBars(
        summary?.income_minor ?? 0,
        summary?.expense_minor ?? 0,
      ),
    [summary],
  );

  const sliceGroups = useMemo(
    () =>
      spendGroupedSlices(
        summaryFilter,
        summary?.pie_in ?? [],
        summary?.pie ?? [],
      ),
    [summary, summaryFilter],
  );

  const dropdownMonths = useMemo(() => {
    if (months.length === 0) {
      return [
        {
          month: selectedMonth,
          expense_minor: summary?.expense_minor ?? 0,
          income_minor: summary?.income_minor ?? 0,
        },
      ];
    }
    if (!months.some((m) => m.month === selectedMonth)) {
      return [
        {
          month: selectedMonth,
          expense_minor: summary?.expense_minor ?? 0,
          income_minor: summary?.income_minor ?? 0,
        },
        ...months,
      ];
    }
    return months;
  }, [months, selectedMonth, summary]);

  if (!isSpendEnabled() || !spendLive) {
    return <Redirect href="/" />;
  }
  if (!isAuthed) {
    return <Redirect href="/login" />;
  }

  if (introSeen === null) {
    return (
      <ProfileSubPageFrame title={tc("GoGoSpend")}>{null}</ProfileSubPageFrame>
    );
  }
  if (!introSeen) {
    return <SpendIntro onLeave={onLeaveIntro} styles={styles} tc={tc} />;
  }

  return (
    <View style={styles.screenRoot}>
    {showMediaPrimer ? (
      <SpendMediaPermissionPrimer
        onCancel={dismissMediaPrimer}
        onContinue={confirmMediaPrimer}
      />
    ) : null}
    <ProfileSubPageFrame
      keyboardAware
      stickyHeader={<SpendSectionTabs active="overview" />}
      title={tc("GoGoSpend")}
    >
      {/*
       * ── adding, on request ────────────────────────────────────────
       *
       * A sheet raised by the button below, not a panel that is always open.
       *
       * This REVERSES the owner call of 2026-08-30 — "adding comes first and
       * stays open: no button to press before you can type" — approved on
       * 2026-09-11 for one reason: the open panel filled the whole first
       * screen, so the month's own numbers started below the fold on every
       * phone. That is how the fabricated ฿0.00 those numbers used to show
       * survived unnoticed. The page a member opens to see what their money
       * did now shows it, and adding costs one tap.
       *
       * Same shape as `SpendNewCategorySheet`: an RN Modal with the safe-area
       * inset, no bottom-sheet dependency anywhere in this app.
       */}
      {/*
       * Mounted only while it is open, rather than left in the tree with
       * `visible={false}`. On react-native-web a hidden Modal still renders
       * its children, so the amount field stayed in the document — reachable
       * by the keyboard and by any test asking whether the form was gone.
       */}
      {addOpen ? (
      <Modal
        animationType="slide"
        onRequestClose={closeAddSheet}
        transparent
        visible
      >
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {/*
             * The glass under the sheet's content, branched exactly as the
             * bottom nav branches it (CustomerMobileBottomNav.tsx:452-468):
             * a bare backdrop-filter on web, BlurView on native. No GlassView
             * branch — iOS 26 Liquid Glass is the nav's own call and
             * materialGlass does not model it.
             */}
            {Platform.OS === "web" ? (
              <View style={[StyleSheet.absoluteFill, styles.sheetGlassWeb]} />
            ) : (
              <BlurView
                experimentalBlurMethod="dimezisBlurView"
                intensity={materialGlass(themeColors).blurIntensity}
                style={[StyleSheet.absoluteFill, styles.sheetGlass]}
                tint={themeColors.isDark ? "dark" : "light"}
              />
            )}
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{tc("Add a transaction")}</Text>
              <Pressable
                accessibilityLabel={tc("Close")}
                accessibilityRole="button"
                onPress={closeAddSheet}
                style={({ pressed }) => [
                  styles.sheetClose,
                  pressed && styles.controlPressed,
                ]}
              >
                <X
                  color={themeColors.muted}
                  size={20}
                  strokeWidth={typography.iconStrokeWidth}
                />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
      <View style={styles.addPanel}>
        {/*
         * Painted behind the content: RN has no CSS gradient, and an absolutely
         * positioned Svg is how every other gradient in this app is drawn. `rx`
         * rounds the wash to the panel's own corner so no square edge shows.
         */}
        <Svg
          height="100%"
          // `pointerEvents` belongs in the style: react-native-web 0.21
          // deprecates the prop, and a test pins it.
          style={styles.panelWash}
          width="100%"
        >
          <Defs>
            <LinearGradient
              id={PANEL_BASE_GRADIENT_ID}
              x1="0"
              y1="0"
              x2="0.55"
              y2="1"
            >
              <Stop offset="0" stopColor={panelWash.from} />
              <Stop offset="0.62" stopColor={panelWash.mid} />
              <Stop offset="1" stopColor={panelWash.to} />
            </LinearGradient>
            <RadialGradient
              id={PANEL_GLOW_GRADIENT_ID}
              cx="1"
              cy="0"
              r="1.2"
              fx="1"
              fy="0"
            >
              <Stop
                offset="0"
                stopColor={panelWash.glow}
                stopOpacity={panelWash.glowOpacity}
              />
              <Stop offset="0.58" stopColor={panelWash.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect
            fill={`url(#${PANEL_BASE_GRADIENT_ID})`}
            height="100%"
            rx={PANEL_RADIUS}
            width="100%"
          />
          <Rect
            fill={`url(#${PANEL_GLOW_GRADIENT_ID})`}
            height="100%"
            rx={PANEL_RADIUS}
            width="100%"
          />
        </Svg>

        <View style={styles.segment}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityState={{ selected: txType === "expense" }}
            onPress={() => onSwitchType("expense")}
            onPressIn={() => setPressedType("expense")}
            onPressOut={() => setPressedType(null)}
            style={[
              styles.segmentOption,
              txType === "expense" && styles.segmentOptionOn,
              // A slip read guessed the direction — ask before it is saved.
              slipHint?.ok && txType === "expense"
                ? styles.segmentOptionAsk
                : null,
              txType === "expense" ? typePop : null,
              pressedType === "expense" && styles.controlPressed,
            ]}
          >
            <Text
              style={[
                styles.segmentArrow,
                txType === "expense" && styles.segmentLabelOn,
              ]}
            >
              ↑
            </Text>
            <Text
              style={[
                styles.segmentLabel,
                txType === "expense" && styles.segmentLabelOn,
              ]}
            >
              {tc("Expense")}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityState={{ selected: txType === "income" }}
            onPress={() => onSwitchType("income")}
            onPressIn={() => setPressedType("income")}
            onPressOut={() => setPressedType(null)}
            style={[
              styles.segmentOption,
              txType === "income" && styles.segmentOptionOn,
              // A slip read guessed the direction — ask before it is saved.
              slipHint?.ok && txType === "income"
                ? styles.segmentOptionAsk
                : null,
              txType === "income" ? typePop : null,
              pressedType === "income" && styles.controlPressed,
            ]}
          >
            <Text
              style={[
                styles.segmentArrow,
                txType === "income" && styles.segmentLabelOn,
              ]}
            >
              ↓
            </Text>
            <Text
              style={[
                styles.segmentLabel,
                txType === "income" && styles.segmentLabelOn,
              ]}
            >
              {tc("Income")}
            </Text>
          </AnimatedPressable>
        </View>

        {/*
         * The day this will be filed under (owner call 2026-09-07). Directly
         * under the money switch, because both answer "what am I recording"
         * before the amount answers "how much".
         *
         * A strip of the last fortnight with our own calendar behind it. This
         * briefly used the browser's `<input type="date">`, which cannot be
         * styled, which Chrome and Safari draw differently, and which becomes
         * the OS wheel on a phone — one control that looked like three things,
         * none of them GoGoSpend.
         */}
        <View style={styles.entryDateRow}>
          <SpendDatePicker
            onChange={setEntryDate}
            today={bangkokToday()}
            value={entryDate}
          />
        </View>

        {/*
         * Amount, categories and note are ONE entry group (owner call
         * 2026-08-30). The wrapper exists to buy extra air above and below it,
         * so the group reads as a unit separate from the date above and Save
         * below — the panel's own gap alone made all five rows equal.
         */}
        <View style={styles.entryGroup}>
          <View style={styles.amountRow}>
            <Text style={styles.amountCurrency}>฿</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              inputMode="decimal"
              placeholder="0"
              placeholderTextColor={themeColors.placeholder}
              style={styles.amountInput}
              accessibilityLabel={tc("Amount in baht")}
            />
            {/*
             * Where "tap to type" used to sit. The big grey nought already
             * invites typing; this spot is worth a real action.
             */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={tc("Read slip photo")}
              accessibilityState={{ expanded: slipMenuOpen }}
              onPress={() => setSlipMenuOpen((open) => !open)}
              disabled={busy}
              style={({ pressed }) => [
                styles.cameraButton,
                slipHint?.ok ? styles.cameraButtonOn : null,
                busy && styles.controlDisabled,
                pressed && !busy && styles.controlPressed,
              ]}
            >
              <Svg
                viewBox="0 0 24 24"
                width={18}
                height={18}
                fill="none"
                stroke={themeColors.primary}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.1-2h8.4l1.1 2h2.2A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />
                <Circle cx={12} cy={13} r={3.4} />
              </Svg>
            </Pressable>
          </View>
          {/*
           * Photos first, because that is where a slip already is: a member
           * screenshots a transfer far more often than they photograph paper,
           * and the files browser — the only source this button used to have —
           * cannot see the camera roll at all.
           */}
          {slipMenuOpen ? (
            <View style={styles.slipMenu}>
              {(
                [
                  ["photos", "Choose from photos"],
                  ["camera", "Take a photo"],
                  ["files", "Browse files"],
                ] as const
              ).map(([source, label]) => (
                <Pressable
                  key={source}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void onReadSlip(source)}
                  style={({ pressed }) => [
                    styles.slipMenuItem,
                    busy && styles.controlDisabled,
                    pressed && !busy && styles.controlPressed,
                  ]}
                >
                  <Text style={styles.slipMenuLabel}>{tc(label)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {slipMediaDeniedSource ? (
            <View style={styles.slipMediaDenied}>
              <Text style={styles.slipMediaDeniedTitle}>
                {tc(spendMediaPermissionCopy.deniedTitle)}
              </Text>
              <Text style={styles.slipHintBad}>
                {tc(spendMediaPermissionCopy.deniedBody)}
              </Text>
              {Platform.OS === "web" ? null : (
                <Pressable
                  accessibilityLabel={tc(spendMediaPermissionCopy.openSettings)}
                  accessibilityRole="button"
                  onPress={() => void openSpendMediaSettings()}
                  style={({ pressed }) => [
                    styles.slipOpenSettingsButton,
                    pressed && styles.controlPressed,
                  ]}
                >
                  <Text style={styles.slipOpenSettingsText}>
                    {tc(spendMediaPermissionCopy.openSettings)}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : slipHint ? (
            <Text style={slipHint.ok ? styles.slipHint : styles.slipHintBad}>
              {slipHint.ok ? `✦ ${slipHint.text}` : slipHint.text}
            </Text>
          ) : null}

          <View style={styles.chipRow}>
            {categories.map((name) => {
              const look = spendCategoryLookFor(name, ownCategories);
              const picked = category === name;
              return (
                <AnimatedPressable
                  key={name}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked }}
                  onPress={() => {
                    playHaptic("segmentChange");
                    setCategory(name);
                  }}
                  onPressIn={() => setPressedCategory(name)}
                  onPressOut={() => setPressedCategory(null)}
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
                    // Owner call 2026-08-30: a chosen chip is filled with its own
                    // colour at full strength — the earlier 15% tint read as
                    // "sort of selected".
                    picked && look.hue
                      ? { backgroundColor: look.hue, borderColor: look.hue }
                      : null,
                    picked && !look.hue ? styles.chipOnNeutral : null,
                    picked ? categoryPop : null,
                    pressedCategory === name && styles.controlPressed,
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
            <Pressable
              accessibilityRole="button"
              onPress={() => setNamingCategory(true)}
              style={({ pressed }) => [
                styles.chip,
                styles.chipNew,
                pressed && styles.controlPressed,
              ]}
            >
              <Text style={styles.chipLabel}>{tc("＋ New")}</Text>
            </Pressable>
          </View>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={tc("Note (optional)")}
            placeholderTextColor={themeColors.placeholder}
            style={styles.input}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => void onSave()}
          disabled={busy}
          style={({ pressed }) => [
            styles.saveButton,
            busy && styles.controlDisabled,
            pressed && !busy && styles.controlPressed,
          ]}
        >
          <Text style={styles.saveLabel}>{tc("Save")}</Text>
        </Pressable>

        {/*
         * Directly under the button that sets it.
         *
         * This line used to render at the very foot of the page, AFTER the
         * whole summary card, while Save sits at the top of the panel — so on
         * a phone both "Saved." and "Could not save that. Try again." landed a
         * full screen below the member's thumb. Save read as a button that did
         * nothing, which is exactly how a 428 on `POST /spend/txs` looked on
         * the simulator on 2026-09-11.
         */}
        {message ? (
          <Text
            accessibilityRole={message.tone === "bad" ? "alert" : undefined}
            style={[
              styles.message,
              message.tone === "bad" && styles.messageBad,
            ]}
            testID={`spend-message-${message.tone}`}
          >
            {message.text}
          </Text>
        ) : null}
      </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      ) : null}

      {/*
       * ── bring in your history ──────────────────────────────────────
       *
       * Was two tiles. "Slip photo" is gone — the camera in the panel above
       * does that job now, and a second door to it was only a second thing to
       * read. What is left takes the whole row in the Favorite Brands banner's
       * shape (owner call 2026-08-30, design C), copied rather than invented so
       * the app gains no new card pattern.
       *
       * The CARD is the control, not the pill: one Pressable wrapping the whole
       * thing gives a target far past the 44pt floor, and nesting a second
       * pressable inside it would put two overlapping targets in one card.
       */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tc("Get your whole money picture")}
        onPress={() => router.push("/spend/import")}
        style={({ pressed }) => [
          styles.historyCard,
          pressed && styles.controlPressed,
        ]}
      >
        <View style={styles.historyCopy}>
          <Text style={styles.historyTitle}>
            {tc("Get your whole money picture")}
          </Text>
          <Text style={styles.historyLine}>
            {tc(
              "Bring in past months from your apps and bank. Recording gets easier after that.",
            )}
          </Text>
          {/* Not a Pressable: see the note above. */}
          <View style={styles.historyPill}>
            <Text style={styles.historyPillLabel}>{tc("Bring it in")}</Text>
          </View>
        </View>
        <View style={styles.historyArt}>
          {/*
           * An arrow coming IN, not a rising line: the card's whole offer is
           * "Bring it in", and a growth chart promises numbers rather than
           * describing the thing the card actually does.
           */}
          <Download
            color={styles.historyArt.borderColor as string}
            size={40}
            strokeWidth={typography.iconStrokeWidth}
          />
        </View>
      </Pressable>

      {/*
       * ── what the month paid back ──────────────────────────────────
       *
       * Second position, behind the month's own figures (owner call
       * 2026-09-11). It used to be one line at the foot of the category list,
       * below the fold on every phone — the only thing on this page no other
       * spend tracker can show, filed where nobody would find it.
       *
       * ITS TWO HALVES ARE DIFFERENT KINDS OF NUMBER. Earned is money
       * GoGoCash already paid, mirrored into the diary as autolog income.
       * Opportunities is a COUNT of purchases at brands that pay cashback, and
       * never a baht total: the offer match carries `{ href, offer_name }` and
       * no rate whatsoever, so a figure there could only be invented — on the
       * screen a member opens to find out what their money actually did.
       *
       * Absent when there is nothing to say. A card that renders "฿0 back" and
       * "0 purchases" every month teaches people to stop reading it.
       */}
      {cashback > 0 || missedOffers > 0 ? (
        <View
          style={[styles.card, styles.cashbackCard]}
          testID="spend-cashback-card"
        >
          {cashback > 0 ? (
            <View style={styles.cashbackRow}>
              <Text style={styles.metric}>{tc("Cashback this month")}</Text>
              <Text style={styles.cashbackValue}>{formatBaht(cashback)}</Text>
            </View>
          ) : null}
          {missedOffers > 0 ? (
            <Pressable
              accessibilityRole="button"
              /*
               * The records list, not the brand catalogue. The count comes
               * from the month's own rows, and each of those carries the
               * offer it matched — so this opens the page that can actually
               * show WHICH purchases they were, rather than a shop wall the
               * member then has to search.
               */
              onPress={() => router.push("/spend/all")}
              style={({ pressed }) => [
                styles.cashbackRow,
                pressed && styles.controlPressed,
              ]}
              testID="spend-missed-offers"
            >
              <Text style={styles.step}>
                {tc("Purchases that could have earned cashback")}
              </Text>
              <Text style={styles.metric}>{missedOffers}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* ── summary card ─────────────────────────────────────────────── */}
      {monthUnreachable ? (
        /*
         * No figures at all. Absent beats wrong here: a member whose month did
         * not arrive is better served by "we could not load it" than by a
         * ฿0.00 that says their records are gone.
         */
        <View style={[styles.card, styles.summaryHeroCard]}>
          <Text style={styles.loadFailedTitle}>
            {tc("We could not load this month")}
          </Text>
          <Text style={styles.step}>
            {tc(
              "Your records are safe. This is a connection problem, not an empty month.",
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void refresh()}
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.controlPressed,
            ]}
          >
            <Text style={styles.saveLabel}>{tc("Try again")}</Text>
          </Pressable>
        </View>
      ) : (
      <View style={[styles.card, styles.summaryHeroCard]}>
        {/* 1 · month dropdown */}
        <View style={styles.monthSection}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={spendMonthLabel(selectedMonth, locale)}
            onPress={() => {
              // The menu is in normal flow (spendStyles.ts:851), so opening it
              // pushes the whole card down — one native layout pass for the
              // tree, per stageChange.ts. No verb: opening commits nothing.
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
                      {formatSummaryBaht(m.expense_minor)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {/* 2 · status */}
        <View style={styles.segmentRow}>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => {
              playHaptic("segmentChange");
              // Swapping the duo bars for the donut reflows the card beneath.
              configureStageChange(reducedMotion);
              setSummaryFilter("all");
            }}
            onPressIn={() => setPressedFilter("all")}
            onPressOut={() => setPressedFilter(null)}
            style={[
              styles.segmentButton,
              summaryFilter === "all" && styles.segmentButtonActive,
              summaryFilter === "all" ? filterPop : null,
              pressedFilter === "all" && styles.controlPressed,
            ]}
          >
            <Text
              style={[
                styles.segmentButtonLabel,
                summaryFilter === "all" && styles.segmentButtonLabelActive,
              ]}
            >
              {tc("All")}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => {
              playHaptic("segmentChange");
              configureStageChange(reducedMotion);
              setSummaryFilter("in");
            }}
            onPressIn={() => setPressedFilter("in")}
            onPressOut={() => setPressedFilter(null)}
            style={[
              styles.segmentButton,
              summaryFilter === "in" && styles.segmentButtonActive,
              summaryFilter === "in" ? filterPop : null,
              pressedFilter === "in" && styles.controlPressed,
            ]}
          >
            <Text
              style={[
                styles.segmentButtonLabel,
                summaryFilter === "in" && styles.segmentButtonLabelActive,
              ]}
            >
              {tc("Income")}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => {
              playHaptic("segmentChange");
              configureStageChange(reducedMotion);
              setSummaryFilter("out");
            }}
            onPressIn={() => setPressedFilter("out")}
            onPressOut={() => setPressedFilter(null)}
            style={[
              styles.segmentButton,
              summaryFilter === "out" && styles.segmentButtonActive,
              summaryFilter === "out" ? filterPop : null,
              pressedFilter === "out" && styles.controlPressed,
            ]}
          >
            <Text
              style={[
                styles.segmentButtonLabel,
                summaryFilter === "out" && styles.segmentButtonLabelActive,
              ]}
            >
              {tc("Expense")}
            </Text>
          </AnimatedPressable>
        </View>

        {/*
         * The month's body, and one big target for View all.
         *
         * The frames, the chart and the category list are ONE Pressable
         * (owner call 2026-09-11): a member after the detail aims at the
         * numbers, not at a 15px link under them. The month dropdown and the
         * All / in / out buttons stay OUTSIDE it — on web a Pressable renders
         * a <button>, and a button inside a button is invalid markup that
         * fires both handlers, so picking a filter would also navigate away.
         *
         * LEFT WITHOUT a pressed state, deliberately, along with `viewAll`
         * below (Task i1). `spend-uiux-round.test.ts`'s "wraps the frames..."
         * guard locates this Pressable by searching for the exact source text
         * of its plain, static `style` prop assignment (`styles.summaryBody`,
         * `styles.viewAll`) to slice out its body and prove the card's
         * structure; switching either to the array/function form every other
         * control on this screen now takes would make that search miss and
         * silently empty the slice instead of failing loudly. That test file
         * is outside this task's file list, so the fix here is to leave these
         * two static rather than break a guard this pass is not authorized to
         * update. See STATIC_EXEMPT in spend-control-states.test.ts.
         */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tc("View all")}
          onPress={() => router.push("/spend/all")}
          style={styles.summaryBody}
        >
          {/* 3 · frames */}
          <View style={styles.framesRow}>
            <View style={styles.frameCard}>
              <Text style={styles.frameLabel}>{tc("Income")}</Text>
              <Text style={styles.frameValue}>
                +{formatSummaryBaht(came)}
              </Text>
            </View>
            <View style={styles.frameCard}>
              <Text style={styles.frameLabel}>{tc("Expense")}</Text>
              <Text style={styles.frameValue}>{formatSummaryBaht(spent)}</Text>
            </View>
            <View style={styles.frameCard}>
              <Text style={styles.frameLabel}>{tc("Left over")}</Text>
              {/*
               * The sign carries the direction, not a colour: the brand green
               * on a figure was #00CC99 on a white card at ~2:1, and the frame
               * is already labelled. U+2212, matching the records tab and the
               * duo balance — an ASCII hyphen sat here while both of those
               * used the typographic minus.
               */}
              <Text style={styles.frameValue}>
                {leftOver >= 0
                  ? `+${formatSummaryBaht(leftOver)}`
                  : `−${formatSummaryBaht(Math.abs(leftOver))}`}
              </Text>
            </View>
          </View>

          {change === null ? (
            /*
             * Silence when the read failed. We do not know what last month
             * held, and "No last month to compare" asserts that we do.
             */
            lastMonthFailed ? null : (
              <Text style={styles.step}>{tc("No last month to compare")}</Text>
            )
          ) : (
            <Text style={change <= 0 ? styles.deltaDown : styles.deltaUp}>
              {change <= 0 ? "▼" : "▲"} {Math.abs(change)}%{" "}
              {tc("vs last month")}
            </Text>
          )}

          {/* 4 · the chart */}
          <View style={styles.sectionLeadRow}>
            <Text style={styles.sectionLeadText}>
              {tc(
                summaryFilter === "all"
                  ? "In and out"
                  : summaryFilter === "in"
                    ? "Where it came from"
                    : "Where it went",
              )}
            </Text>
          </View>

          {/*
           * All compares the two directions; a ring cannot, because its arcs
           * would be parts of income-plus-spending, a total nobody tracks. The
           * other two modes are one direction split by category, which is what a
           * ring is actually for (owner call 2026-09-07, design A of two).
           */}
          {summaryFilter === "all" ? (
            <View style={styles.duo}>
              <View style={styles.duoRow}>
                <View style={styles.duoHead}>
                  <Text style={styles.duoLabelIn}>{tc("Income")}</Text>
                  <Text style={styles.duoValueIn}>
                    {formatBaht(summary?.income_minor ?? 0)}
                  </Text>
                </View>
                <View style={styles.duoTrack}>
                  <View
                    style={[
                      styles.duoFillIn,
                      { width: directionBars.inWidth as `${number}%` },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.duoRow}>
                <View style={styles.duoHead}>
                  <Text style={styles.duoLabelOut}>{tc("Expense")}</Text>
                  <Text style={styles.duoValueOut}>
                    {formatBaht(summary?.expense_minor ?? 0)}
                  </Text>
                </View>
                <View style={styles.duoTrack}>
                  <View
                    style={[
                      styles.duoFillOut,
                      { width: directionBars.outWidth as `${number}%` },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.duoBalance}>
                <Text style={styles.duoBalanceLabel}>
                  {tc(directionBars.short ? "Short by" : "Left over")}
                </Text>
                <Text
                  style={
                    directionBars.short
                      ? styles.duoBalanceShort
                      : styles.duoBalanceLeft
                  }
                >
                  {directionBars.short ? "−" : "+"}
                  {formatBaht(Math.abs(directionBars.balance_minor))}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.donutWrap}>
              <View style={styles.donutRing}>
                <Svg
                  accessibilityRole="image"
                  height="100%"
                  viewBox="0 0 118 118"
                  width="100%"
                >
                  <G fill="none" transform="rotate(-90 59 59)">
                    <Circle
                      cx={59}
                      cy={59}
                      r={SPEND_DONUT_RADIUS}
                      stroke={themeColors.fieldMuted}
                      strokeWidth={15}
                    />
                    {donutArcs.map((arc) => (
                      <Circle
                        key={arc.category}
                        cx={59}
                        cy={59}
                        r={SPEND_DONUT_RADIUS}
                        stroke={arc.colour}
                        strokeDasharray={`${arc.length} ${SPEND_DONUT_CIRCUMFERENCE}`}
                        strokeDashoffset={arc.offset}
                        strokeWidth={15}
                      />
                    ))}
                  </G>
                </Svg>
              </View>

              <View style={styles.donutLegend}>
                {donutArcs.length === 0 ? (
                  <Text style={styles.step}>
                    {tc(
                      summaryFilter === "in"
                        ? "No income recorded"
                        : "Nothing recorded yet",
                    )}
                  </Text>
                ) : (
                  donutArcs.map((arc) => {
                    const look = spendCategoryLookFor(
                      arc.category,
                      ownCategories,
                    );
                    return (
                      <View key={arc.category} style={styles.donutLegendRow}>
                        <View
                          style={[
                            styles.donutDot,
                            { backgroundColor: arc.colour },
                          ]}
                        />
                        <Text numberOfLines={1} style={styles.donutLegendText}>
                          {look.emoji ? `${look.emoji} ` : ""}
                          {tc(arc.category)}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          )}

          {/*
           * 5 · list. Every category from both directions on All, grouped so a
           * salary is never mistaken for a bill. Only All shows the headings —
           * with one group there is nothing to tell apart.
           */}
          {sliceGroups.map((group) => (
            <View key={group.direction} style={styles.groupWrap}>
              {summaryFilter === "all" ? (
                <View style={styles.groupHead}>
                  <View
                    style={
                      group.direction === "in"
                        ? styles.groupDotIn
                        : styles.groupDotOut
                    }
                  />
                  <Text style={styles.groupHeadLabel}>
                    {tc(group.direction === "in" ? "Income" : "Expense")}
                  </Text>
                </View>
              ) : null}

              {group.slices.map((slice) => {
                const look = spendCategoryLookFor(
                  slice.category,
                  ownCategories,
                );
                const colour = colourForCategory(slice.category);
                return (
                  <View key={slice.category} style={styles.pieRow}>
                    <View style={styles.pieHeader}>
                      <Text style={styles.metric}>
                        {look.emoji ? `${look.emoji} ` : ""}
                        {tc(slice.category)}
                      </Text>
                      <Text style={styles.metric}>
                        {formatBaht(slice.amount_minor)}
                      </Text>
                    </View>
                    <View style={styles.pieTrack}>
                      <View
                        style={[
                          styles.pieBar,
                          {
                            backgroundColor: colour,
                            width: pieWidth(
                              slice.amount_minor,
                              group.total_minor,
                            ),
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          ))}

        </Pressable>

        {/* See the note above `summaryBody`: left static for the same reason. */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/spend/all")}
          style={styles.viewAll}
        >
          <Text style={styles.viewAllLabel}>{tc("View all")}</Text>
        </Pressable>

        {summary && isSpendPieShareUnlocked(summary.successful_import_count) ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void onSharePie()}
            style={({ pressed }) => [
              styles.secondaryButton,
              busy && styles.controlDisabled,
              pressed && !busy && styles.controlPressed,
            ]}
          >
            <Text style={styles.secondaryLabel}>
              {tc("Share this month on LINE")}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.step}>
            {tc("Share unlocks after 20 successful imports")}
          </Text>
        )}
      </View>
      )}

      {/*
       * A sheet, not rows in the panel (owner call 2026-08-31, design A). The
       * panel is already the busiest thing on this page and naming a category
       * is a once-ever act — and the emoji keyboard covers the bottom of the
       * screen, so inline it would hide the colours being chosen from.
       */}
      {namingCategory ? (
        <SpendNewCategorySheet
          busy={busy}
          onClose={() => setNamingCategory(false)}
          onCreate={(input) => void onNameCategory(input)}
        />
      ) : null}
    </ProfileSubPageFrame>

      {/*
       * The way in to the sheet, and the trade the 2026-08-30 reversal makes:
       * one tap before typing, in exchange for the whole first screen.
       *
       * OUTSIDE the frame, against a root box with a definite height. Inside
       * it the button is absolute against the SCROLLING CONTENT, so on a short
       * month it came to rest halfway up the screen, sitting on top of the
       * card's own Try again button.
       *
       * Clear of the bottom nav rather than over it: the nav is the way out of
       * GoGoSpend, and a button covering Home would cost more than it gave.
       */}
      <Pressable
        accessibilityLabel={tc("Add a transaction")}
        accessibilityRole="button"
        onPress={() => {
          playHaptic("sheetOpen");
          setAddOpen(true);
        }}
        style={({ pressed }) => [
          styles.addFab,
          { bottom: insets.bottom + FAB_CLEARANCE },
          pressed && styles.controlPressed,
        ]}
      >
        <Plus
          color={styles.addFabGlyph.color as string}
          size={26}
          strokeWidth={typography.iconStrokeWidth}
        />
      </Pressable>
    </View>
  );
}

function bangkokToday(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** `offset` in whole months from the current Bangkok month; -1 is last month. */
function bangkokMonth(offset = 0): string {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const shifted = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1),
  );
  return shifted.toISOString().slice(0, 7);
}

function formatBaht(minor: number): string {
  return `฿${(minor / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSummaryBaht(minor: number): string {
  const baht = minor / 100;
  return `฿${baht.toLocaleString("th-TH", {
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function pieWidth(amount: number, total: number): `${number}%` {
  if (total <= 0) return "0%";
  return `${Math.max(4, Math.round((amount / total) * 100))}%`;
}
