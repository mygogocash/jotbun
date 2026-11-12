// RED stub (P6A-T2): the plan's interface, with no behaviour yet.
import type { Minor } from '@gogospend/contracts';

import type { BudgetPace } from '../../spend/v1/redesign/budgetPace.ts';
import type { WalletT } from '../copy/draftText.ts';

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

export function nextBangkokMidnight(nowMs: number): number {
  return 0;
}

export function buildWidgetSnapshot(facts: WidgetFacts, links: WidgetLinks, t: WalletT, spoken: (minor: Minor) => string): WidgetSnapshot {
  return { v: 1, links, labels: { record: '', scan: '', log: '' }, entries: [] };
}

export function signedOutSnapshot(now: Date, links: WidgetLinks, t: WalletT): WidgetSnapshot {
  return { v: 1, links, labels: { record: '', scan: '', log: '' }, entries: [] };
}

export function entryAt(snapshot: WidgetSnapshot, nowMs: number): WidgetEntry {
  return snapshot.entries[0];
}

export function faceFor(entry: WidgetEntry, family: WidgetFamily): WidgetFace | null {
  return null;
}

export function sameSnapshot(a: WidgetSnapshot, b: WidgetSnapshot): boolean {
  return false;
}
