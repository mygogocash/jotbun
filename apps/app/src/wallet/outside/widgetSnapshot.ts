// The widget snapshot (P6A-T2; X2, X3; ox-widget-home, ox-widget-lock; D41,
// B21): what Home writes for the home-screen and lock-screen widgets. Every
// string is ready to draw, since a widget never formats money, reads copy or
// works out a day (P6A-T8 draws it).
// - Faces (X2): `home` for the system families, `lock` for the accessory
//   ones. Private mode masks both; the Face ID lock masks the lock face
//   (B21; default pending owner Q9). A masked face shows HIDDEN_AMOUNT for
//   every amount, keeps the words and the count, and has no gauge figure.
//   Nothing the person wrote (a note, a payee, a category name) is ever in
//   the snapshot, so masking the amounts hides all of it (R114).
// - Entries (X3), each from the start of the Bangkok date in its `day`: now;
//   the next Bangkok midnight, a new day with nothing logged; the midnight
//   after, a prompt to open Jotbun.
// - Budget figures come from budgetPace's limit and estimated spending, and
//   only for a face whose day is in the pace's month: a new month starts
//   with none, and so does a pace Home has not yet moved past midnight on
//   the 1st (Review Focus 2). The left-a-day figure is worked out for each
//   face's own day.
// - Money (§4) is satang through BigInt and P2-T10's money text, never a JS
//   number. The gauge's fraction is the one number: thousandths, capped at
//   1000 while still a BigInt, as the budget rows' permille is.
// Pure: a Node test reads it.
import { bangkokDate } from '@gogospend/contracts';
import type { Minor } from '@gogospend/contracts';

import type { BudgetPace } from '../../spend/v1/redesign/budgetPace.ts';
import { daysBetween, daysInMonth } from '../../spend/v1/redesign/shared.ts';
import { monthName, shortDayName, stepDate } from '../../ui/dateStep.ts';
import type { WalletT } from '../copy/draftText.ts';
import { HIDDEN_AMOUNT, perDayText, walletMoneyText } from '../money/walletMoney.ts';

export type WidgetFacts = {
  now: Date;
  /** Home's rows today: records and drafts. */
  todayCount: number;
  /** Money out today, in satang. */
  todayOutMinor: Minor;
  /** This month's pace (Home's); null with no budget. */
  pace: BudgetPace | null;
  /** Private mode (D41). */
  hidden: boolean;
  /** The Face ID lock (B21). */
  lockOn: boolean;
  locale: 'th' | 'en' | 'vi';
};

/** One widget face, every string ready to draw. */
export type WidgetFace = {
  masked: boolean;
  /** The face's day: ส. 24, Sat 24. */
  dayLabel: string;
  /** ใช้วันนี้ */
  outLabel: string;
  /** ฿132, or ฿•••• masked. */
  out: string;
  /** 3 รายการ */
  count: string;
  /** วันนี้ · 3 รายการ */
  today: string;
  /** เหลือวันนี้ or เกินงบไป; null without budget figures. */
  sideLabel: string | null;
  /** ≈ ฿580 or ฿420, or ฿•••• masked; null without budget figures. */
  side: string | null;
  /** The side line says how far over. */
  over: boolean;
  /** งบ ต.ค.: the face's month, with figures or without. */
  gaugeLabel: string;
  /** 74%; null when masked or without budget figures. */
  gaugeText: string | null;
  /** 0 to 1, three decimals; null when masked or without budget figures. */
  gaugeFraction: number | null;
  /** What VoiceOver says for each family (฿ read as บาท). */
  spoken: { small: string; inline: string; gauge: string; rectangular: string };
};

export type WidgetLinks = { record: string; today: string; scan: string | null };
/** The link words, since a widget layout cannot read copy (P6A-T8). */
export type WidgetLabels = { record: string; scan: string; log: string };
export type WidgetEntry = { from: number; day: string; kind: 'today' | 'stale' | 'signed_out'; home: WidgetFace | null; lock: WidgetFace | null; prompt: string | null };
export type WidgetSnapshot = { v: 1; links: WidgetLinks; labels: WidgetLabels; entries: WidgetEntry[] };
export type WidgetFamily = 'systemSmall' | 'systemMedium' | 'accessoryInline' | 'accessoryCircular' | 'accessoryRectangular';

const DAY_MS = 86_400_000;
/** Asia/Bangkok is UTC+7 all year: no daylight saving. */
const BANGKOK_OFFSET_MS = 7 * 3_600_000;

type Say = { t: WalletT; spoken: (minor: Minor) => string; words: 'th' | 'en' };

/** The month's limit and estimated spending, as budgetPace counts them. */
type Budget = { limit: bigint; spent: bigint };

/** What one entry's faces show: the day, what it has logged, and its month's budget. */
type DayFigures = { day: string; count: number; outMinor: Minor; budget: Budget | null };

/** The line beside today's spending, and the amount VoiceOver says for it. */
type Side = { over: boolean; label: string; text: string; said: { key: string; minor: Minor } };

type Gauge = { percent: string; fraction: number };

/** The pace's figures for a face on `day`: none with no budget, a limit of zero, or a pace for another month. */
function budgetOn(pace: BudgetPace | null, day: string): Budget | null {
  if (pace === null || pace.limitMinor === null || pace.month !== day.slice(0, 7)) return null;
  const limit = BigInt(pace.limitMinor);
  return limit > 0n ? { limit, spent: BigInt(pace.spent.estimatedMinor) } : null;
}

/** Days left in the month from `day`, that day included: budgetPace's daysLeft on that day. */
function daysLeftOn(day: string): bigint {
  const month = day.slice(0, 7);
  return BigInt(daysInMonth(month) - daysBetween(`${month}-01`, day));
}

/** A per-day figure as the face shows it: whole baht, rounded down (W9). */
function wholeBaht(minor: bigint): Minor {
  return ((minor / 100n) * 100n).toString();
}

/** How far over, or about how much is left a day from `day` on, today included. */
function sideLine(budget: Budget, day: string, t: WalletT): Side {
  const left = budget.limit - budget.spent;
  if (left < 0n) {
    const overBy = (-left).toString();
    return { over: true, label: t('outside.overBy'), text: walletMoneyText(overBy), said: { key: 'outside.spokenOver', minor: overBy } };
  }
  const perDay = left / daysLeftOn(day);
  // The face shows whole baht, so VoiceOver says whole baht too.
  return { over: false, label: t('outside.leftToday'), text: t('outside.about', { amount: perDayText(perDay.toString()) }), said: { key: 'outside.spokenLeft', minor: wholeBaht(perDay) } };
}

/** Spent as a share of the limit: the percent rounded down, and the fraction in thousandths, at most 1. */
function gaugeOf({ limit, spent }: Budget): Gauge {
  const thousandths = (spent * 1000n) / limit;
  return { percent: ((spent * 100n) / limit).toString(), fraction: Number(thousandths > 1000n ? 1000n : thousandths) / 1000 };
}

function shownWords(figures: DayFigures, side: Side | null, gauge: Gauge | null, { t, spoken, words }: Say): WidgetFace['spoken'] {
  const today = t('outside.spokenToday', { amount: spoken(figures.outMinor), count: figures.count });
  const line = side === null ? null : t(side.said.key, { amount: spoken(side.said.minor) });
  const both = line === null ? today : `${today} ${line}`;
  const month = monthName(figures.day.slice(0, 7), words, 'long');
  return {
    small: both,
    inline: line ?? today,
    gauge: gauge === null ? t('outside.noBudget') : t('outside.spokenGauge', { month, percent: gauge.percent }),
    rectangular: both,
  };
}

function hiddenWords(count: number, t: WalletT): WidgetFace['spoken'] {
  const line = t('outside.spokenHidden', { count });
  return { small: line, inline: line, gauge: t('outside.spokenGaugeHidden'), rectangular: line };
}

function face(figures: DayFigures, masked: boolean, say: Say): WidgetFace {
  const { t, words } = say;
  const { day, count, outMinor, budget } = figures;
  const side = budget === null ? null : sideLine(budget, day, t);
  const gauge = budget === null ? null : gaugeOf(budget);
  return {
    masked,
    dayLabel: shortDayName(day, words),
    outLabel: t('outside.spentToday'),
    out: masked ? HIDDEN_AMOUNT : walletMoneyText(outMinor),
    count: t('outside.count', { count }),
    today: t('outside.today', { count }),
    sideLabel: side === null ? null : side.label,
    side: side === null ? null : masked ? HIDDEN_AMOUNT : side.text,
    over: side !== null && side.over,
    gaugeLabel: t('outside.budgetMonth', { month: monthName(day.slice(0, 7), words, 'short') }),
    gaugeText: gauge === null || masked ? null : t('outside.percent', { percent: gauge.percent }),
    gaugeFraction: gauge === null || masked ? null : gauge.fraction,
    spoken: masked ? hiddenWords(count, t) : shownWords(figures, side, gauge, say),
  };
}

/** The links by name, so nothing else the object carries reaches the app group. */
function linksOf(links: WidgetLinks): WidgetLinks {
  return { record: links.record, today: links.today, scan: links.scan };
}

function labelsOf(t: WalletT): WidgetLabels {
  return { record: t('outside.record'), scan: t('outside.scan'), log: t('outside.log') };
}

/** The next 00:00 in Asia/Bangkok strictly after `nowMs`. */
export function nextBangkokMidnight(nowMs: number): number {
  return (Math.floor((nowMs + BANGKOK_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - BANGKOK_OFFSET_MS;
}

/**
 * Three entries (X3): now; the next Bangkok midnight, with nothing logged
 * and the same month's budget worked out again for that day; the midnight
 * after, stale. `t` reads the outside lines (useOutsideCopy); `spoken` says
 * an amount in words (spokenMoney over P2's common lines).
 */
export function buildWidgetSnapshot(facts: WidgetFacts, links: WidgetLinks, t: WalletT, spoken: (minor: Minor) => string): WidgetSnapshot {
  // Thai words for th; English for en and vi, as the lines are (X2).
  const say: Say = { t, spoken, words: facts.locale === 'th' ? 'th' : 'en' };
  const faces = (figures: DayFigures) => ({
    home: face(figures, facts.hidden, say),
    lock: face(figures, facts.hidden || facts.lockOn, say),
  });
  const nowMs = facts.now.getTime();
  const today = bangkokDate(facts.now);
  const tomorrow = stepDate(today, 1);
  const tomorrowFrom = nextBangkokMidnight(nowMs);
  return {
    v: 1,
    links: linksOf(links),
    labels: labelsOf(t),
    entries: [
      { from: nowMs, day: today, kind: 'today', ...faces({ day: today, count: facts.todayCount, outMinor: facts.todayOutMinor, budget: budgetOn(facts.pace, today) }), prompt: null },
      { from: tomorrowFrom, day: tomorrow, kind: 'today', ...faces({ day: tomorrow, count: 0, outMinor: '0', budget: budgetOn(facts.pace, tomorrow) }), prompt: null },
      { from: nextBangkokMidnight(tomorrowFrom), day: stepDate(tomorrow, 1), kind: 'stale', home: null, lock: null, prompt: t('outside.stale') },
    ],
  };
}

/** What the widgets show signed out, or while the `outside` area is off (X1): one prompt and no figures. */
export function signedOutSnapshot(now: Date, links: WidgetLinks, t: WalletT): WidgetSnapshot {
  return {
    v: 1,
    links: linksOf(links),
    labels: labelsOf(t),
    entries: [{ from: now.getTime(), day: bangkokDate(now), kind: 'signed_out', home: null, lock: null, prompt: t('outside.signedOut') }],
  };
}

/** The newest entry that has started (entries run oldest first), else the first. */
export function entryAt(snapshot: WidgetSnapshot, nowMs: number): WidgetEntry {
  let chosen = snapshot.entries[0];
  for (const entry of snapshot.entries) {
    if (entry.from <= nowMs) chosen = entry;
  }
  return chosen;
}

/** The home face for the system families, the lock face for the accessory ones (and any other). */
export function faceFor(entry: WidgetEntry, family: WidgetFamily): WidgetFace | null {
  return family.startsWith('system') ? entry.home : entry.lock;
}

/** Equal apart from `entries[0].from`, so Home writes only when what a widget shows changes. */
export function sameSnapshot(a: WidgetSnapshot, b: WidgetSnapshot): boolean {
  const comparable = (snapshot: WidgetSnapshot) => JSON.stringify({ ...snapshot, entries: snapshot.entries.map((entry, index) => (index === 0 ? { ...entry, from: 0 } : entry)) });
  return comparable(a) === comparable(b);
}
