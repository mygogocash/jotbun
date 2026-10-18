import { useCallback, useContext, useMemo, useRef, useState, type ComponentRef } from "react";
import { IntlContext } from "react-intl";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { useCopy } from "@mobile/i18n/useCopy";
import { CalendarDays } from "@mobile/theme/icons";
import { Text } from "@mobile/theme/AppText";
import {
  spendCalendarMonthLabel,
  spendCalendarWeeks,
  spendFullDateLabel,
} from "@mobile/spend/spendCalendar";
import type { ThemeColors } from "@mobile/theme/colorPalettes";
import { radii, spacing, typography } from "@mobile/theme/tokens";
import { useThemedStyles } from "@mobile/theme/useThemedStyles";

/** 44pt floor — every control a finger touches (UI_DESIGN_SYSTEM §1). */
const CONTROL_HEIGHT = 44;
/** Close enough to the field to read as attached, far enough to be its own card. */
const ATTACH_GAP = 6;
const CARD_PADDING = 11;
const WEEK_HEAD_HEIGHT = 20;
/** Breathing room before the screen edge when deciding which way to hang. */
const SCREEN_MARGIN = 16;

/**
 * The day this record is filed under (owner call 2026-09-07, design C).
 *
 * A field spelling the chosen day out in full, with our own calendar under it.
 * The browser's `<input type="date">` is what this replaces: it cannot be
 * styled, Chrome and Safari draw different ones, and on a phone it becomes the
 * OS wheel — so the same control looked like three different things and none of
 * them looked like GoGoSpend.
 *
 * The calendar is the same card it always was, lifted off the page (owner call
 * 2026-09-07, design A of three). A bottom sheet was tried first and rejected:
 * full width, square bottom corners and a grab handle make it a different
 * object, where this is meant to be the card that belongs to the field.
 *
 * It hangs from the field, measured rather than guessed, and the field stays
 * visible above it wearing the brand edge — so the two read as one control and
 * whoever taps a day can check the answer without closing anything.
 *
 * The cell used to give every day a perfect square: seven across the panel
 * makes each 42pt wide, so `aspectRatio: 1` made it 42pt tall as well, with an
 * 11.5px number filling barely a quarter of it. That is the "too much space,
 * tiny text" the owner reported. It now takes the app's own 44pt finger target
 * and the app's own text size.
 *
 * Two taps for any day: open, tap. Picking closes the sheet, so there is no
 * footer to confirm anything. The month name opens a list of months, because a
 * receipt from a few months back should not be six presses on an arrow.
 */
export function SpendDatePicker({
  onChange,
  today,
  value,
}: {
  onChange: (next: string) => void;
  /** `YYYY-MM-DD` in the member's own day, so the strip never starts on yesterday. */
  today: string;
  /** `YYYY-MM-DD`. */
  value: string;
}) {
  const styles = useThemedStyles(createStyles);
  const tc = useCopy();
  const locale = useContext(IntlContext)?.locale ?? "en";

  const [calendarOpen, setCalendarOpen] = useState(false);
  /** Where the field sits on screen, so the card can hang off it. */
  const [anchor, setAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const fieldRef = useRef<ComponentRef<typeof View>>(null);
  /** The month list, over the day grid, when the month name is pressed. */
  const [monthListOpen, setMonthListOpen] = useState(false);
  /** Which month the calendar is showing — not which day is chosen. */
  const [visibleMonth, setVisibleMonth] = useState(() => value.slice(0, 7));

  const weeks = useMemo(
    () => spendCalendarWeeks(visibleMonth, today),
    [today, visibleMonth],
  );

  const openCalendar = useCallback(() => {
    // Always open on the chosen day's month, not wherever it was left.
    setVisibleMonth(value.slice(0, 7));
    setMonthListOpen(false);
    fieldRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setCalendarOpen(true);
    });
  }, [value]);

  const closeCalendar = useCallback(() => {
    setCalendarOpen(false);
    setMonthListOpen(false);
  }, []);

  const stepMonth = useCallback((by: number) => {
    setVisibleMonth((current) => {
      const [year, mon] = current.split("-").map(Number);
      return new Date(Date.UTC(year, mon - 1 + by, 1))
        .toISOString()
        .slice(0, 7);
    });
  }, []);

  const pick = useCallback(
    (date: string) => {
      onChange(date);
      setCalendarOpen(false);
      setMonthListOpen(false);
    },
    [onChange],
  );

  /**
   * Where to hang the card, and which way.
   *
   * Below the field is the point of design A, but a field low on the screen
   * would push the card off the bottom, so it flips above instead. The height
   * is estimated from the row count rather than measured: measuring would need
   * a second render, and the card would visibly jump into place.
   */
  const placement = useMemo(() => {
    if (!anchor) return null;
    const screen = Dimensions.get("window").height;
    const cardHeight =
      CARD_PADDING * 2 +
      CONTROL_HEIGHT +
      WEEK_HEAD_HEIGHT +
      weeks.length * CONTROL_HEIGHT +
      (weeks.length - 1) * 2;
    const below = anchor.y + anchor.height + ATTACH_GAP;
    const flipAbove = below + cardHeight > screen - SCREEN_MARGIN;
    return {
      left: anchor.x,
      width: anchor.width,
      ...(flipAbove
        ? { bottom: screen - anchor.y + ATTACH_GAP }
        : { top: below }),
    };
  }, [anchor, weeks.length]);

  /** Two years back, newest first — further than anyone records a spend. */
  const monthChoices = useMemo(() => {
    const [year, mon] = today.split("-").map(Number);
    return Array.from({ length: 24 }, (_, back) =>
      new Date(Date.UTC(year, mon - 1 - back, 1)).toISOString().slice(0, 7),
    );
  }, [today]);

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>{tc("Date")}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: calendarOpen }}
        accessibilityLabel={tc("Pick another date")}
        onPress={openCalendar}
        ref={fieldRef}
        style={[styles.field, calendarOpen && styles.fieldOn]}
      >
        <Text style={styles.fieldValue}>
          {spendFullDateLabel(value, locale)}
        </Text>
        {/*
         * The app's own calendar icon, not the calendar emoji this used to be
         * (seen on the simulator 2026-09-11). Apple draws that emoji as a page
         * torn off at JUL 17 — a second, wrong date sat in the field beside the
         * real one, and it read as a rendering fault rather than a button.
         */}
        <CalendarDays
          color={styles.fieldGlyph.color as string}
          size={18}
          strokeWidth={typography.iconStrokeWidth}
        />
      </Pressable>

      {calendarOpen && placement ? (
        <Modal
          animationType="none"
          // Android routes hardware/gesture back exclusively here while a Modal
          // is visible — without it, back dead-ends (repo convention).
          onRequestClose={closeCalendar}
          statusBarTranslucent
          transparent
          visible
        >
          <View style={styles.modalRoot}>
            <Pressable
              accessibilityLabel={tc("Close")}
              accessibilityRole="button"
              onPress={closeCalendar}
              style={styles.scrim}
            />
            <View
              {...({ role: "dialog" } as const)}
              accessibilityLabel={tc("Pick another date")}
              style={[styles.card, placement]}
            >
              <View style={styles.sheetHead}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: monthListOpen }}
                  accessibilityLabel={tc("Choose a month")}
                  hitSlop={8}
                  onPress={() => setMonthListOpen((open) => !open)}
                  style={styles.monthButton}
                >
                  <Text style={styles.sheetMonth}>
                    {spendCalendarMonthLabel(visibleMonth, locale)}
                  </Text>
                  <Text style={styles.monthCaret}>
                    {monthListOpen ? "▴" : "▾"}
                  </Text>
                </Pressable>

                {monthListOpen ? null : (
                  <View style={styles.sheetNav}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={tc("Previous month")}
                      hitSlop={8}
                      onPress={() => stepMonth(-1)}
                    >
                      <Text style={styles.sheetNavGlyph}>‹</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={tc("Next month")}
                      disabled={visibleMonth >= today.slice(0, 7)}
                      hitSlop={8}
                      onPress={() => stepMonth(1)}
                    >
                      <Text
                        style={[
                          styles.sheetNavGlyph,
                          visibleMonth >= today.slice(0, 7) &&
                            styles.sheetNavOff,
                        ]}
                      >
                        ›
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>

              {monthListOpen ? (
                <ScrollView style={styles.monthList}>
                  <View style={styles.monthGrid}>
                    {monthChoices.map((month) => {
                      const chosen = month === visibleMonth;
                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected: chosen }}
                          key={month}
                          onPress={() => {
                            setVisibleMonth(month);
                            setMonthListOpen(false);
                          }}
                          style={[
                            styles.monthCell,
                            chosen && styles.monthCellOn,
                          ]}
                        >
                          <Text
                            style={[
                              styles.monthCellText,
                              chosen && styles.monthCellTextOn,
                            ]}
                          >
                            {spendCalendarMonthLabel(month, locale)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              ) : (
                <>
                  <View style={styles.weekHead}>
                    {weekdayInitials(locale).map((initial, index) => (
                      <Text
                        key={`${initial}-${index}`}
                        style={styles.weekHeadCell}
                      >
                        {initial}
                      </Text>
                    ))}
                  </View>

                  {weeks.map((week) => (
                    <View key={week[0]?.date} style={styles.weekRow}>
                      {week.map((day) => {
                        const chosen = day.date === value;
                        return (
                          <Pressable
                            key={day.date}
                            accessibilityRole="button"
                            accessibilityState={{
                              disabled: day.future,
                              selected: chosen,
                            }}
                            accessibilityLabel={day.date}
                            disabled={day.future}
                            onPress={() => pick(day.date)}
                            style={[styles.calCell, chosen && styles.calCellOn]}
                          >
                            <Text
                              style={[
                                styles.calCellText,
                                !day.inMonth && styles.calCellOutside,
                                day.future && styles.calCellFuture,
                                chosen && styles.calCellTextOn,
                              ]}
                            >
                              {Number(day.date.slice(8, 10))}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </>
              )}
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

/**
 * The seven column heads, Sunday first, taken from real dates rather than a
 * hardcoded list so Thai and Vietnamese get their own initials.
 */
function weekdayInitials(locale: string): string[] {
  // 2026-02-01 is a Sunday, so this walks one whole week from a known Sunday.
  return Array.from({ length: 7 }, (_, index) => {
    const when = new Date(`2026-02-0${index + 1}T00:00:00Z`);
    try {
      return new Intl.DateTimeFormat(locale, {
        calendar: "gregory",
        timeZone: "UTC",
        weekday: "narrow",
      }).format(when);
    } catch {
      // No Intl data for this locale on this device — the grid still lines up.
      return "";
    }
  });
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      gap: spacing.sm,
    },
    heading: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.labelWeight,
      lineHeight: typography.captionLineHeight,
    },
    /* The same shape as the note field below it, so the panel reads as one form. */
    field: {
      alignItems: "center",
      borderColor: colors.panelLine,
      borderRadius: radii.md,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: CONTROL_HEIGHT,
      paddingHorizontal: spacing.sm,
    },
    /** Open, the field is the card's head — same edge, so they read as one. */
    fieldOn: {
      borderColor: colors.primary,
    },
    fieldValue: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      fontWeight: typography.actionWeight,
    },
    /* Only the colour is read now — the icon carries its own size. */
    fieldGlyph: {
      color: colors.muted,
    },
    modalRoot: {
      flex: 1,
    },
    /*
     * Design A: nothing behind the card dims. It is still a full-screen
     * pressable, so tapping anywhere off the card closes it — the only way out
     * that does not commit to a date.
     */
    scrim: {
      backgroundColor: "transparent",
      inset: 0,
      position: "absolute",
    },
    /*
     * The card the calendar always was — rounded all round, inset, its own
     * object — now hanging off the field rather than pushing the page down.
     * `placement` supplies left / width and either top or bottom.
     *
     * Its edge is the brand green, the same one the field wears while open, so
     * the two read as one control instead of two that happen to overlap.
     */
    card: {
      backgroundColor: colors.card,
      borderColor: colors.primary,
      borderRadius: radii.lg,
      borderWidth: 1,
      boxShadow: "0px 14px 26px rgba(0, 0, 0, 0.42)",
      gap: 5,
      padding: CARD_PADDING,
      position: "absolute",
    },
    sheetHead: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: CONTROL_HEIGHT,
    },
    monthButton: {
      alignItems: "center",
      flexDirection: "row",
      gap: 5,
    },
    sheetMonth: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      fontWeight: typography.actionWeight,
      lineHeight: typography.bodyLineHeight,
    },
    monthCaret: {
      color: colors.muted,
      fontFamily: typography.family,
      fontSize: typography.caption,
    },
    sheetNav: {
      flexDirection: "row",
      gap: spacing.lg,
    },
    sheetNavGlyph: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.title,
      lineHeight: 24,
    },
    sheetNavOff: {
      color: colors.placeholder,
    },
    monthList: {
      // A whole month grid's worth, so the sheet does not jump size when the
      // list opens over it.
      maxHeight: CONTROL_HEIGHT * 6,
    },
    monthGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    monthCell: {
      alignItems: "center",
      borderColor: colors.border,
      borderRadius: radii.md,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: CONTROL_HEIGHT,
      // Three across, allowing for the two gaps between them.
      width: "31%",
    },
    monthCellOn: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    monthCellText: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.caption,
      textAlign: "center",
    },
    monthCellTextOn: {
      color: colors.onPrimaryDark,
      fontWeight: typography.actionWeight,
    },
    weekHead: {
      flexDirection: "row",
    },
    weekHeadCell: {
      color: colors.placeholder,
      flex: 1,
      fontFamily: typography.family,
      fontSize: typography.caption,
      fontWeight: typography.captionWeight,
      textAlign: "center",
    },
    weekRow: {
      flexDirection: "row",
      gap: 2,
    },
    /*
     * 44pt tall, not "as tall as it is wide". Seven columns across a phone make
     * each cell 42pt wide, and the old `aspectRatio: 1` turned that width into
     * a height nobody chose — a big box around an 11.5px number.
     */
    calCell: {
      alignItems: "center",
      borderRadius: radii.sm,
      flex: 1,
      height: CONTROL_HEIGHT,
      justifyContent: "center",
    },
    calCellOn: {
      backgroundColor: colors.primary,
    },
    calCellText: {
      color: colors.ink,
      fontFamily: typography.family,
      fontSize: typography.body,
      lineHeight: typography.bodyLineHeight,
    },
    /** A padding day from the month either side — reachable, just quieter. */
    calCellOutside: {
      color: colors.muted,
    },
    /** After today. Not a style choice: these cannot be tapped at all. */
    calCellFuture: {
      color: colors.placeholder,
      opacity: 0.45,
    },
    calCellTextOn: {
      color: colors.onPrimaryDark,
      fontWeight: "700",
    },
  });
}
