import { Redirect, useRouter } from "expo-router";
import { SPEND_MAX_UPLOAD_BYTES } from "@gogospend/contracts";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { ChevronDown as ChevronDownIcon } from "@mobile/theme/icons";
import { Text } from "@mobile/theme/AppText";
import { useTheme } from "@mobile/theme/ThemeProvider";

import { ProfileSubPageFrame } from "@mobile/components/ProfileSubPageFrame";
import { SpendSectionTabs } from "@mobile/spend/SpendSectionTabs";
import { isSpendEnabled } from "@mobile/config/featureFlags";
import { useMarketSpendEnabled } from "@mobile/navigation/appChrome";
import { useCopy } from "@mobile/i18n/useCopy";
import { useThemedStyles } from "@mobile/theme/useThemedStyles";
import { pickThemed, type ThemeColors } from "@mobile/theme/colorPalettes";
import { elevationCss } from "@mobile/theme/elevation";
import { radii, spacing, typography } from "@mobile/theme/tokens";
import { createSpendSharedControlStyles } from "@mobile/spend/spendSharedControlStyles";
import { useAuthGuardSession } from "@mobile/auth/useAuthGuardSession";
import { ApiError } from "@mobile/api/client";
import {
  autologCashbackPurchases,
  enqueueSpendImport,
  fetchSpendBankLinkStatus,
  fetchSpendImportJob,
  startSpendBankLink,
} from "@mobile/spend/spendResource";
import { SPEND_BANKS } from "@mobile/spend/spendFrontPage";
import { brandMarkFill } from "@mobile/spend/brandMark";
import {
  SPEND_IMPORT_STILL_RUNNING,
  spendImportSuccessCopy,
  spendImportUserMessage,
} from "@mobile/spend/spendImportCopy";
import { pickSpendImportFile } from "@mobile/spend/pickSpendImportFile";
import {
  SPEND_IMPORT_APPS,
  SPEND_IMPORT_FINAL_STEP,
  SPEND_IMPORT_HERE_LABEL,
  spendImportShelf,
} from "@mobile/spend/spendImportApps";
import {
  trackSpendImportStarted,
  trackSpendTxAdded,
} from "@mobile/spend/spendTelemetry";

/** 44pt floor — every control a finger touches (UI_DESIGN_SYSTEM §1). */
const CONTROL_HEIGHT = 44;

/** The bank row's tile, to the point: the shelf and it are the same size. */
const SHELF_SLOT = 67;

/**
 * The same tile, shrunk to sit in a list row.
 *
 * 36 is set by what it has to hold, not by taste: the app codes are four
 * glyphs (`MEOW`, `SPND`, `MNYL`), which at `typography.caption` with 0.3
 * tracking measure roughly 31pt. 36 leaves that a couple of points either
 * side. happy-dom has no font metrics, so only a device can confirm it — the
 * same limit `amountInput` records for #2630.
 */
const SELECT_OPTION_SLOT = 36;

/**
 * The corner every brand tile takes — shelf, counter, bank.
 *
 * They are three sizes (67, 67, and a fifth of the card) but one treatment,
 * and the counter had quietly shipped at 12 next to the shelf's 14 at exactly
 * the same 67pt. One number, so the next tile cannot drift off on its own.
 */
const BRAND_SLOT_RADIUS = 14;

/** The breathing room above the bank row and below it. */
const BANK_ROW_SEAM = spacing.xs + 2;

/**
 * The import poll, in the two numbers that decide it.
 *
 * 20 ticks at 1.5s is thirty seconds of asking. Named because the resume
 * control, the comment above it and the test all have to agree with the loop.
 */
const IMPORT_POLL_INTERVAL_MS = 1500;
const IMPORT_POLL_TICKS = 20;

/**
 * Every way of bringing money in that is NOT typing it yourself: old files from
 * another app, and your own cashback purchases.
 *
 * The slip card and the bank card both left on 2026-08-30 (owner calls). The
 * camera in the add panel reads slips now, and the bank offer lives on the
 * GoGoSpend front page — each was a second door to something that already had
 * one.
 *
 * This page holds what used to fill the whole GoGoSpend screen. Owner call
 * 2026-08-30: recording today owns the front page; the one-time import job moves
 * behind a tile.
 */
export function CustomerSpendImportScreen() {
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

  const [busy, setBusy] = useState(false);
  /*
   * Text and tone — the same shape the Records tab (`CustomerSpendAllScreen`)
   * carries, minus the landing-place field: this page has exactly one message
   * slot, so there is nowhere else for a line to go.
   */
  const [message, setMessage] = useState<{
    text: string;
    tone: "good" | "bad";
  } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  /*
   * The job the fast poll gave up on, kept apart from `jobId`.
   *
   * `jobId` is what the poll effect is keyed on, so anything left in it is a
   * live instruction to poll. A job that timed out is not that — it is a job
   * the member may want to ask about again, which is a different thing and
   * gets a different box.
   */
  const [stalledJobId, setStalledJobId] = useState<string | null>(null);
  /*
   * The bank card answers inside itself (owner call 2026-08-30). It cannot
   * reuse `message`: that line is shared with the import and the cashback
   * pull, so "Import finished." would appear under the bank subtitle.
   */
  const [bankMessage, setBankMessage] = useState<string | null>(null);
  const [bankAvailable, setBankAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchSpendBankLinkStatus()
      .then((status) => {
        if (!cancelled) setBankAvailable(status.available);
      })
      // Fail closed: the row still draws, and tapping explains rather than
      // opening a link that was never going to work.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const onBankLink = useCallback(async () => {
    if (!bankAvailable) {
      setBankMessage(tc(spendImportUserMessage("BANK_LINK_UNAVAILABLE")));
      return;
    }
    setBusy(true);
    setBankMessage(null);
    try {
      const session = await startSpendBankLink();
      await Linking.openURL(session.connect_url);
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      setBankMessage(
        tc(
          code === "BANK_LINK_UNAVAILABLE"
            ? spendImportUserMessage("BANK_LINK_UNAVAILABLE")
            : "Bank Open API is not configured. Upload a CSV instead — we never ask for a bank login.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [bankAvailable, tc]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      void fetchSpendImportJob(jobId)
        .then((job) => {
          if (cancelled) return;
          if (job.status === "succeeded") {
            setJobId(null);
            const done = spendImportSuccessCopy(
              job.row_ok ?? 0,
              job.row_reject ?? 0,
            );
            setMessage({
              text: tc(done.text, done.values),
              tone: "good",
            });
          } else if (job.status === "failed") {
            setJobId(null);
            setMessage({
              text: tc(spendImportUserMessage(job.error_code)),
              tone: "bad",
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setJobId(null);
            setMessage({ text: tc(spendImportUserMessage()), tone: "bad" });
          }
        });
      if (ticks >= IMPORT_POLL_TICKS) {
        clearInterval(timer);
        if (!cancelled) {
          /*
           * Hand the id over rather than drop it, and clear `jobId` the way
           * the three branches above do.
           *
           * This branch used to leave `jobId` set. The interval was gone, so
           * nothing polled — but the effect is keyed on `[jobId, tc]`, and
           * `tc` changes identity when the member switches language. A switch
           * after the timeout therefore re-armed a full thirty seconds of
           * polling against a job that had usually finished, and overwrote
           * this message while doing it.
           */
          setStalledJobId(jobId);
          setJobId(null);
          /*
           * Not a success, but not silent either: thirty seconds of promised
           * polling ended with nothing resolved, and a "Check again" button
           * just appeared below this line — a screen-reader user needs that
           * announced as much as an outright failure would be.
           */
          setMessage({ text: tc(SPEND_IMPORT_STILL_RUNNING), tone: "bad" });
        }
      }
    }, IMPORT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, tc]);

  const onNativePick = useCallback(async () => {
    const picked = await pickSpendImportFile();
    if (!picked.ok) {
      if (picked.reason === "too_large") {
        setMessage({
          text: tc("That file is over 12 MB. Split the export into 12-month chunks."),
          tone: "bad",
        });
      } else if (picked.reason === "unavailable") {
        setMessage({
          text: tc(
            "This app build cannot pick files yet. Update GoGoCash, or open in the browser.",
          ),
          tone: "bad",
        });
      }
      return;
    }
    if (picked.blob.size > SPEND_MAX_UPLOAD_BYTES) {
      setMessage({
        text: tc("That file is over 12 MB. Split the export into 12-month chunks."),
        tone: "bad",
      });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      trackSpendImportStarted("unknown");
      const result = await enqueueSpendImport(picked.blob, picked.filename);
      /*
       * A fresh import supersedes whatever the last one left behind.
       *
       * Without this, a stale `stalledJobId` from a PRIOR timed-out job
       * survives this new job's whole run: its "Check again" stays gated
       * only on `stalledJobId` being set, so it keeps rendering right through
       * this poll, and a tap on it hands the OLD id back to `setJobId` —
       * hijacking the effect away from the import that is actually running.
       */
      setStalledJobId(null);
      setJobId(result.job_id);
      setMessage({
        text: tc("Import queued. Stay on this page while we read it."),
        tone: "good",
      });
    } catch (error) {
      const code = error instanceof ApiError ? error.code : undefined;
      setMessage({
        text: tc(
          code === "IN_FLIGHT"
            ? spendImportUserMessage("IN_FLIGHT")
            : "Could not start the import. Try the file again.",
        ),
        tone: "bad",
      });
    } finally {
      setBusy(false);
    }
  }, [tc]);

  const onAutolog = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await autologCashbackPurchases();
      trackSpendTxAdded("autolog");
      if (result.added === 0 && result.skipped === 0) {
        /*
         * Neither a failure nor news worth an alert — the pull ran fine and
         * simply found nothing new. Tone "good" so it lands quietly next to
         * the real success line below, not as a role="alert" interruption.
         */
        setMessage({ text: tc("No new cashback purchases to add."), tone: "good" });
      } else {
        setMessage({
          text: tc("Added purchases from your cashback history."),
          tone: "good",
        });
      }
    } catch {
      setMessage({
        text: tc("Could not add cashback purchases. Try again."),
        tone: "bad",
      });
    } finally {
      setBusy(false);
    }
  }, [tc]);

  /*
   * The one thing to do about "still running": ask again.
   *
   * Putting the id back into `jobId` re-arms the same effect with a fresh tick
   * count, so the member gets another thirty seconds of asking for one tap —
   * rather than the page they were told to stay on never changing again.
   */
  const onCheckAgain = useCallback(() => {
    if (!stalledJobId) return;
    setMessage(null);
    setJobId(stalledJobId);
    setStalledJobId(null);
  }, [stalledJobId]);

  if (!isSpendEnabled() || !spendLive) {
    return <Redirect href="/" />;
  }
  if (!isAuthed) {
    return <Redirect href="/login" />;
  }

  return (
    /*
     * The header names GoGoSpend, not this page (owner call 2026-08-31). The
     * row is a chevron plus a title, so naming the parent makes the two read as
     * one control — "back to GoGoSpend" — which is exactly where back now goes.
     * The route keeps "More ways to add" as its own title for the desktop
     * sidebar and the web page name.
     */
    <ProfileSubPageFrame
      onBackPress={goBackToSpend}
      stickyHeader={<SpendSectionTabs active="import" />}
      title={tc("Jotbun")}
    >
      {/*
       * ── link a bank ──────────────────────────────────────────────
       *
       * First because it is the least work of the three: a minute, and the
       * days fill themselves in from then on. Moved here from the front page
       * on 2026-08-31 (owner call) — it is setup, and setup belongs with the
       * other two setup jobs rather than on the page used every day.
       */}
      <View style={styles.offerCard}>
        <Text style={styles.cardTitle}>{tc("Stop typing every coffee")}</Text>
        <Text style={styles.step}>
          {tc("Link your bank and we fill the day in for you.")}
        </Text>
        {/* Same size and colour as the line above it, so the answer reads as
            part of the card's own copy rather than an alert bolted on. */}
        {bankMessage ? <Text style={styles.step}>{bankMessage}</Text> : null}
        {/*
         * Design "A · quiet row" with C's names (owner call 2026-08-30): the
         * logos ARE the button, so there is no green primary here. A member
         * finds their own bank by its mark faster than they read a sentence
         * about linking one.
         */}
        <View style={styles.bankRow}>
          {SPEND_BANKS.map((bank) => (
            <Pressable
              key={bank.code}
              accessibilityRole="button"
              accessibilityLabel={tc(bank.name)}
              onPress={() => void onBankLink()}
              disabled={busy}
              style={({ pressed }) => [
                styles.bankColumn,
                busy && styles.controlDisabled,
                pressed && !busy && styles.controlPressed,
              ]}
            >
              {/*
               * The bank's own colour fills the tile and the mark sits on it in
               * white (owner call 2026-09-11). Five white squares with small
               * coloured lettering read as a form to fill in; five coloured
               * tiles read as the banks themselves, which is what a member is
               * actually scanning for. The real logo art still drops straight
               * in here — the slot keeps its square and its size.
               */}
              <View style={[styles.bankSlot, { backgroundColor: bank.hue }]}>
                <Text style={styles.bankCode}>{bank.code}</Text>
              </View>
              <Text numberOfLines={1} style={styles.bankName}>
                {tc(bank.name)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.bankMinute}>✦ {tc("Takes about a minute")}</Text>
      </View>

      {/*
       * ── move your history ────────────────────────────────────────
       *
       * Was three cards — MeowJot, Spendee, Money Lover — that differed only in
       * their steps and repeated the same button three times. One card now: a
       * shelf saying which apps can move across, a select that chooses, the
       * steps for the chosen one, and a single button (owner call 2026-08-30,
       * design D).
       */}
      <ImportPicker
        busy={busy}
        onPress={onNativePick}
        styles={styles}
        tc={tc}
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{tc("Add my earn cashback too")}</Text>
        <Text style={styles.step}>
          {tc(
            "Cashback history sync is not connected to this standalone app yet.",
          )}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void onAutolog()}
          disabled
          accessibilityState={{ disabled: true }}
          style={[
            styles.secondaryButton,
            styles.controlDisabled,
          ]}
        >
          <Text style={styles.secondaryLabel}>
            {tc("Add my GoGoCash purchases")}
          </Text>
        </Pressable>
      </View>

      {message ? (
        <Text
          accessibilityRole={message.tone === "bad" ? "alert" : undefined}
          style={[styles.message, message.tone === "bad" && styles.messageBad]}
          testID={`spend-message-${message.tone}`}
        >
          {message.text}
        </Text>
      ) : null}
      {/*
       * `!jobId` is inert today: every setter of `jobId` or `stalledJobId`
       * already nulls the other in the same handler, so the two can never
       * both be truthy at a settled render. The clear in `onNativePick`
       * above is what actually closes the hijack this guards against.
       *
       * Kept anyway, because that invariant is emergent, not enforced — a
       * future handler that sets `jobId` without also clearing
       * `stalledJobId` (the exact bug just fixed) would make this the only
       * thing standing between the member and the same hijack again.
       */}
      {stalledJobId && !jobId ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onCheckAgain}
          style={({ pressed }) => [
            styles.secondaryButton,
            busy && styles.controlDisabled,
            pressed && !busy && styles.controlPressed,
          ]}
        >
          <Text style={styles.secondaryLabel}>{tc("Check again")}</Text>
        </Pressable>
      ) : null}
    </ProfileSubPageFrame>
  );
}

/**
 * The shelf shows what is possible; the select does the choosing. Nothing on
 * the shelf is tappable — one job each, so neither control has to be guessed at
 * (owner call 2026-08-30).
 *
 * The select mirrors `MoneyActionSelect` on Add withdrawal method: same bar,
 * same 1.5pt frame, same list opening in place rather than over the page. It
 * is copied rather than imported because that one is private to its screen;
 * pulling it out into a shared component would edit the withdraw flow, which
 * is a separate change to ask for.
 *
 * One thing is deliberately NOT copied. `MoneyActionSelect` takes a nullable
 * value and greens its frame when one arrives; here `appId` is seeded with the
 * first app and has no way back to empty, because the card below draws that
 * app's steps and would otherwise open blank. So the frame is green from the
 * first paint — the state it reports, "something is chosen", is simply always
 * true. It was written as a conditional that could never be false, over a base
 * border colour that was never once drawn.
 */
function ImportPicker({
  busy,
  onPress,
  styles,
  tc,
}: {
  busy: boolean;
  onPress: () => Promise<void>;
  styles: ReturnType<typeof createStyles>;
  tc: (value: string) => string;
}) {
  const { colors } = useTheme();
  const [appId, setAppId] = useState(SPEND_IMPORT_APPS[0].id);
  const [open, setOpen] = useState(false);
  const chosen =
    SPEND_IMPORT_APPS.find((app) => app.id === appId) ?? SPEND_IMPORT_APPS[0];
  const shelf = spendImportShelf(SPEND_IMPORT_APPS);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{tc("Move your history")}</Text>
      <Text style={styles.step}>
        {tc("About 90 seconds. These apps can move across.")}
      </Text>

      {/* A shelf, not a control: no Pressable, nothing to tap. */}
      <View style={styles.shelf}>
        {shelf.shown.map((app) => (
          <View
            key={app.id}
            style={[
              styles.shelfSlot,
              { backgroundColor: brandMarkFill(app.hue) },
            ]}
          >
            <Text style={styles.shelfCode}>{app.code}</Text>
          </View>
        ))}
        {shelf.hiddenCount > 0 ? (
          <View
            accessibilityLabel={tc("{n} more").replace(
              "{n}",
              String(shelf.hiddenCount),
            )}
            accessible
            style={styles.shelfMore}
          >
            <Text style={styles.shelfMoreLabel}>{`${shelf.hiddenCount}+`}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.selectWrap}>
        <Pressable
          accessibilityLabel={`${tc("Choose which app")}: ${tc(chosen.name)}`}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((isOpen) => !isOpen)}
          style={({ pressed }) => [
            styles.selectBar,
            pressed && styles.controlPressed,
          ]}
        >
          <Text numberOfLines={1} style={styles.selectValue}>
            {tc(chosen.name)}
          </Text>
          <ChevronDownIcon color={colors.muted} size={18} />
        </Pressable>
        {open ? (
          <View style={styles.selectMenu}>
            {SPEND_IMPORT_APPS.map((app) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: app.id === chosen.id }}
                key={app.id}
                onPress={() => {
                  setAppId(app.id);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.selectOption,
                  app.id === chosen.id ? styles.selectOptionPicked : null,
                  pressed && styles.controlPressed,
                ]}
              >
                <View
                  style={[
                    styles.selectOptionSlot,
                    { backgroundColor: brandMarkFill(app.hue) },
                  ]}
                >
                  <Text style={styles.selectOptionCode}>{app.code}</Text>
                </View>
                <Text style={styles.selectOptionLabel}>{tc(app.name)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/*
       * Two groups, each named by a coloured tag (owner call 2026-08-30, design
       * B): the confusing part was never the words, it was not knowing which
       * app you were meant to be holding. Numbering runs straight through both,
       * so "step 3" means the same thing to the member and to support.
       *
       * The box hugs its steps — Money Lover has fewer, and its card is shorter
       * for it.
       */}
      <View style={styles.stepList}>
        <View style={styles.stepGroup}>
          <View
            style={[styles.whereTag, { backgroundColor: `${chosen.hue}29` }]}
          >
            <Text style={[styles.whereTagLabel, { color: chosen.hue }]}>
              {tc(chosen.whereLabel)}
            </Text>
          </View>
          {chosen.theirSteps.map((step, at) => (
            <View key={step} style={styles.stepRow}>
              <Text style={styles.stepNumber}>{at + 1}</Text>
              <Text style={styles.step}>{tc(step)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.stepGroup}>
          <View style={[styles.whereTag, styles.whereTagHere]}>
            <Text style={[styles.whereTagLabel, styles.whereTagLabelHere]}>
              {tc(SPEND_IMPORT_HERE_LABEL)}
            </Text>
          </View>
          <View style={styles.stepRow}>
            <Text style={styles.stepNumber}>
              {chosen.theirSteps.length + 1}
            </Text>
            <Text style={styles.step}>{tc(SPEND_IMPORT_FINAL_STEP)}</Text>
          </View>
        </View>

        {/* Amber and marked, outside the numbers: it is not a thing to do. */}
        {chosen.note ? (
          <View style={styles.stepNote}>
            <Text style={styles.stepNoteMark}>⚠</Text>
            <Text style={styles.stepNoteText}>{tc(chosen.note)}</Text>
          </View>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => void onPress()}
        disabled={busy}
        style={({ pressed }) => [
          styles.primaryButton,
          busy && styles.controlDisabled,
          pressed && !busy && styles.controlPressed,
        ]}
      >
        <Text style={styles.primaryLabel}>{tc("Upload your file")}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    /* Eight 67pt squares is the shelf's whole width — see `spendImportShelf`. */
    shelf: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    /*
     * The same tile as the bank row above it — brand fill, white mark, no
     * outline (owner call 2026-09-11: make the stand-ins look intentional).
     *
     * It used to be the bank tile's opposite: a white box with a coloured mark
     * and a hairline. Two treatments for one idea on a single screen read as
     * two half-finished systems rather than one decision — and that literal
     * `"#FFFFFF"` never adapted, so the dark theme drew a stark white square.
     * The fill is set per tile in the markup because it depends on the brand.
     */
    shelfSlot: {
      alignItems: "center",
      borderRadius: BRAND_SLOT_RADIUS,
      height: SHELF_SLOT,
      justifyContent: "center",
      width: SHELF_SLOT,
    },
    /** Matches `bankCode` exactly — one mark, drawn one way. */
    shelfCode: {
      color: "#FFFFFF",
      fontFamily: typography.family,
      fontSize: 15,
      fontWeight: typography.titleWeight,
      letterSpacing: 0.6,
    },
    /*
     * The counter, not a logo: a faded green square with no outline and white
     * text (owner call 2026-08-30), so it reads as "and more" rather than as an
     * app nobody recognises.
     */
    shelfMore: {
      alignItems: "center",
      /*
       * Faded green on the dark theme is `primarySoft`. The light theme's
       * `primarySoft` is a pale mint, and white on pale mint is invisible — so
       * light takes the deeper `accentSoft` instead. Same idea, readable ground
       * either way; a test pins the contrast.
       */
      backgroundColor: pickThemed(
        colors,
        colors.accentSoft,
        colors.primarySoft,
      ),
      borderRadius: BRAND_SLOT_RADIUS,
      height: SHELF_SLOT,
      justifyContent: "center",
      width: SHELF_SLOT,
    },
    shelfMoreLabel: {
      color: colors.white,
      fontFamily: typography.family,
      fontSize: typography.label,
      fontWeight: typography.actionWeight,
    },
    /* Every number below is MoneyActionSelect's — see the ImportPicker note. */
    selectWrap: {
      gap: 6,
      marginTop: spacing.sm,
    },
    selectBar: {
      alignItems: "center",
      // Green from the first paint — see the ImportPicker note. This was the
      // theme's `controlLine` border token under a "chosen" variant that
      // always applied.
      borderColor: colors.primary,
      borderRadius: radii.md,
      borderWidth: 1.5,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: CONTROL_HEIGHT,
      overflow: "hidden",
      paddingHorizontal: spacing.md,
    },
    selectValue: {
      color: colors.ink,
      flex: 1,
      fontFamily: typography.family,
      fontSize: 17,
    },
    selectMenu: {
      /*
       * It had no fill at all — border and clip only — so it took the page's
       * ground and a shadow would have drawn a halo with the page showing
       * through the middle of it. `colors.card` is what every other menu on
       * these three tabs stands on.
       */
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: radii.md,
      borderWidth: 1,
      boxShadow: elevationCss(colors, "raised"),
      overflow: "hidden",
    },
    selectOption: {
      alignItems: "center",
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: spacing.sm,
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.md,
      // 36pt tile + 6 either side = 48, clear of the 44 floor.
      paddingVertical: spacing.xs,
    },
    selectOptionPicked: {
      backgroundColor: colors.primarySoft,
    },
    /*
     * The shelf tile at list size — the same decision, not a second one.
     *
     * It was the white box with a coloured mark and a hairline that the
     * `shelfSlot` note above records as removed, and it kept that literal
     * `"#FFFFFF"` too: on the dark theme the menu drew three stark white
     * squares. The fill is set per row in the markup because it depends on the
     * brand, and `brandMarkFill` darkens only the two hues that cannot carry
     * white.
     */
    selectOptionSlot: {
      alignItems: "center",
      borderRadius: radii.sm,
      height: SELECT_OPTION_SLOT,
      justifyContent: "center",
      width: SELECT_OPTION_SLOT,
    },
    /*
     * `shelfCode` at list size. It was 8pt — the smallest type in the entire
     * app, and the same four letters this file draws at 13 twice elsewhere.
     */
    selectOptionCode: {
      color: "#FFFFFF",
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.actionWeight,
      letterSpacing: 0.3,
    },
    selectOptionLabel: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: 17,
    },
    /* Hugs its steps (owner call 2026-08-30) — no floor, so the card is as tall
       as the app it is describing and no taller. */
    stepList: {
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    stepGroup: {
      alignItems: "flex-start",
      gap: spacing.xs,
    },
    /** Takes the app's own colour, so MeowJot and Spendee read apart at a glance. */
    whereTag: {
      borderRadius: radii.chip,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    whereTagHere: {
      backgroundColor: colors.primarySoft,
    },
    whereTagLabel: {
      fontFamily: typography.family,
      fontSize: 13,
      fontWeight: typography.actionWeight,
    },
    whereTagLabelHere: {
      color: pickThemed(colors, colors.accentSoft, colors.primary),
    },
    stepRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: spacing.xs,
    },
    stepNumber: {
      color: colors.primary,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.actionWeight,
      lineHeight: typography.captionLineHeight,
      // Wide enough for a two-digit step, so the text stays in one column.
      minWidth: 14,
    },
    stepNote: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 6,
    },
    stepNoteMark: {
      color: colors.warning,
      fontFamily: typography.family,
      fontSize: typography.caption,
      lineHeight: typography.captionLineHeight,
    },
    stepNoteText: {
      color: colors.warning,
      flex: 1,
      fontFamily: typography.family,
      fontSize: typography.caption,
      lineHeight: typography.captionLineHeight,
    },
    /*
     * The bank offer, moved here from the front page on 2026-08-31. Kept on
     * `primarySoft` rather than the plain card so it still reads as an offer
     * next to the two instruction cards below it.
     */
    offerCard: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.borderStrong,
      borderRadius: radii.lg,
      borderWidth: 1,
      boxShadow: elevationCss(colors, "card"),
      gap: spacing.xs,
      padding: spacing.md,
    },
    /*
     * Five columns that share the width, so the tiles stay wide enough to hit
     * and the whole row never scrolls.
     */
    bankRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: BANK_ROW_SEAM,
    },
    bankColumn: {
      alignItems: "center",
      flex: 1,
      gap: 6,
    },
    /*
     * The bank's colour is set per tile in the markup; everything shape-related
     * lives here. No border: the fill already separates the tile from the card
     * on both themes, and a hairline over a saturated ground only muddies it.
     *
     * `SPEND_BANKS` hues are pinned at 4.5:1 against white by
     * `spend-front-page`, which is the contrast the white mark on them needs.
     */
    bankSlot: {
      alignItems: "center",
      alignSelf: "stretch",
      // Square (owner call 2026-08-30) — the shape bank logos are drawn for.
      // The height follows the column width, which is never below the 44 floor:
      // five columns of the narrowest phone still leave 49 each.
      aspectRatio: 1,
      borderRadius: BRAND_SLOT_RADIUS,
      justifyContent: "center",
    },
    bankCode: {
      color: "#FFFFFF",
      fontFamily: typography.family,
      fontSize: 15,
      fontWeight: typography.titleWeight,
      letterSpacing: 0.6,
    },
    /*
     * `colors.ink` reads as white on the dark theme, which is what the owner
     * asked for, and flips to near-black on the light theme, where white on
     * pale mint would be invisible. 400 is the thinnest weight the app ships.
     */
    bankName: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: 13,
      fontWeight: typography.bodyWeight,
    },
    bankMinute: {
      color: colors.primary,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.labelWeight,
      marginTop: BANK_ROW_SEAM,
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
    cardTitle: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.title,
      fontWeight: typography.titleWeight,
      lineHeight: typography.titleLineHeight,
    },
    step: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.captionWeight,
      lineHeight: typography.captionLineHeight,
    },
    ...createSpendSharedControlStyles(colors),
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: radii.chip,
      justifyContent: "center",
      marginTop: spacing.xs,
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
    secondaryButton: {
      alignItems: "center",
      borderColor: colors.borderStrong,
      borderRadius: radii.chip,
      borderWidth: 1,
      justifyContent: "center",
      marginTop: spacing.xs,
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.md,
    },
    secondaryLabel: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.action,
      fontWeight: typography.actionWeight,
      lineHeight: typography.actionLineHeight,
    },
    // `message` and `messageBad` come from the shared spread above — this
    // page used to carry its own copy of `message` that had quietly drifted
    // (missing the shared version's `paddingTop: spacing.xs`).
  });
}
