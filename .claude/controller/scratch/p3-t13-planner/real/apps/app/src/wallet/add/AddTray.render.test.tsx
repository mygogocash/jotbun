// The add tray host (P2-T16; W14, W17, W27, R61, R69; Review Focus 1 and 2):
// opening an entry, its steps, Tell Bun, the quick chips, saving on Quick add's
// rules, and one tray at a time. Each case mounts through mountWallet on the
// fakes (a ready device diary unless it says online), in Thai and by day unless
// it says otherwise, with a probe inside the host that keeps the latest
// useAddTray() so a case can open, close and wait as P2-T17, P2-T18 and P2-T30
// will.
//
// The traps, as the steps' own tests meet them: Reanimated keeps the tray's
// card, and each new step's content, unseen (visibility: hidden) until its
// entering animation starts, which happy-dom never does, and queries by role
// skip what is unseen, so startAnimations() fires it after every opening and
// step change (tap). Tell Bun's sheet is today's, kept as it is: its props are
// recorded as it renders, so a case hands the host a draft as the sheet's Use
// this does (onUse, then onClose). On the web every Modal is its own layer
// under the page, so the sheet's place inside the tray is read through the
// tray: the sheet goes the moment the tray's content does. The swipe during a
// save goes through Gesture Handler's own web pointer path: happy-dom lays
// nothing out, so every element is given a box (the P2-T13 review's probe 1).
// Each haptic moment is recorded by name. react-native-web omits
// aria-disabled when it is false.
//
// The fix round (R117) adds the cases for #439's reviews: a conflict in private
// mode (both reviews' M1 and m2, their probes PROBE-5 and P5), Bun's words on
// confirm in private mode (the second review's m3, its probe P4a), the bound on
// a tray whose Modal never says it has gone (both reviews' m1, their wedge
// probes), the save's problem above Save (the first review's n1, its R8), and
// the second review's six survivors (M3 to M6, M8 and M10, its probes P1, P2,
// P8, P11, P12 and P13). For the bound the Modal holds its dismissals back when
// a case asks (`dismissals.hold`), as UIKit may.
//
// P3-T13 adds how each record was made: the source a save carries (typed, the
// sheet's tell_bun, or an AI draft's own) and the review each AI draft gets
// once (kept, edited with its count, or dropped). A case hands the host an AI
// draft through the probe's useAddTray().applyAiDraft, as P3-T17's slip read
// and P3-T18's tell step will. The suite defines __DEV__, so each review also
// counts in the draft tally (P3-T5), which no case reads.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import type { ModalProps } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
// The router, outside a host and in the catalogue's screen sections, and the device's id maker (Quick add's keys).
vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('@mobile/lib/hapticMoment', () => ({ playHaptic: vi.fn() }));

// Tell Bun's sheet, unchanged; the props the host gives it are kept for the case.
const bun = vi.hoisted(() => ({ props: null as unknown }));
vi.mock('@mobile/screens/redesign/ai/TellBunSheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mobile/screens/redesign/ai/TellBunSheet')>();
  const { createElement } = await import('react');
  function RecordedSheet(props: Parameters<typeof actual.TellBunSheet>[0]) {
    bun.props = props;
    return createElement(actual.TellBunSheet, props);
  }
  return { ...actual, TellBunSheet: RecordedSheet };
});

// The Modal, which says it has gone at once unless a case holds its dismissals back (`hold`): a held one keeps the
// Modal's own onDismiss (the tray's), as UIKit does with a dismissal it never ends, so the case can send it late.
const dismissals = vi.hoisted(() => ({ hold: false, held: [] as (() => void)[] }));
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();
  const { createElement, forwardRef } = await import('react');
  const Modal = forwardRef<unknown, ModalProps>(({ onDismiss, ...props }, ref) => createElement(actual.Modal as never, {
    ...props,
    ref,
    onDismiss: onDismiss && (() => {
      if (dismissals.hold) dismissals.held.push(onDismiss);
      else onDismiss();
    }),
  }));
  return { ...actual, Modal };
});

import type { AiDraft, TransactionDto, WalletSnapshot } from '@gogospend/contracts';

import { COMMON_RULES } from '@mobile/analytics/catalog';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import type { Recorded } from '@mobile/analytics/testing/recordAnalytics';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { translateCopy } from '@mobile/i18n/messages';
import { playHaptic } from '@mobile/lib/hapticMoment';
import type { TellBunSheetProps } from '@mobile/screens/redesign/ai/TellBunSheet';
import type { SavedEntry } from '@mobile/screens/redesign/entry/entrySave';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';
import { addDays } from '@mobile/spend/v1/redesign/shared';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import type { SyncOutcome } from '@mobile/sync/types';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { AX5, mountWallet } from '../testing/walletHarness';
import type { MountWalletOptions } from '../testing/walletHarness';
import { AddTrayHost, useAddTray } from './AddTrayHost';
import type { AddRequest, AddTray, AiDraftMeta, SavedContext } from './AddTrayHost';

const os = Platform.OS;
afterEach(() => {
  cleanup();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
  bun.props = null;
  probe.tray = null;
  Object.assign(dismissals, { hold: false, held: [] });
  delete (AccessibilityInfo as { sendAccessibilityEvent?: unknown }).sendAccessibilityEvent;
});

/** Lets the stores, the lists, the phone's answer and Bun's AI preferences arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
/** Lets time pass, such as a tray's exit (220 ms). */
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

/** Starts the entering animations, as a browser does a frame after they mount (see the note at the top). */
function startAnimations() {
  act(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[style*="visibility: hidden"]')) node.dispatchEvent(new Event('animationstart'));
  });
}

/** The element with this role and name, which must be there. */
function named(role: string, name: string): HTMLElement {
  const element = screen.queryByRole(role, { name });
  expect(element, `a ${role} named ${name}`).not.toBeNull();
  return element as HTMLElement;
}

/** The element with this test id, which must be there. */
function found(testID: string): HTMLElement {
  const element = screen.queryByTestId(testID);
  expect(element, testID).not.toBeNull();
  return element as HTMLElement;
}

/** A tap, then the next step's content shows (see the note at the top). */
function tap(element: HTMLElement) {
  fireEvent.click(element);
  startAnimations();
}

const press = (...names: string[]) => { for (const name of names) tap(named('button', name)); };
const radio = (name: string) => named('radio', name);
const text = (testID: string) => found(testID).textContent;
const label = (testID: string) => found(testID).getAttribute('aria-label');
const moments = () => vi.mocked(playHaptic).mock.calls.map(([moment]) => moment);
const rowLabels = () => [...found('confirm-rows').querySelectorAll('[role="button"]')].map((row) => row.getAttribute('aria-label'));
const chipLabels = () => [...found('quick-chips').querySelectorAll('[role="button"]')].map((chip) => chip.getAttribute('aria-label'));
const alertIn = (testID: string) => found(testID).querySelector('[role="alert"]')?.textContent ?? null;
const escape = () => act(() => { document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' })); });
const source = (file: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), file), 'utf8');
/** iOS for what follows (the conflict case's way), with a no-op for the focus call react-native-web has not; or the web. */
function onIos(ios: boolean) {
  Object.defineProperty(Platform, 'OS', { value: ios ? 'ios' : os, configurable: true, writable: true });
  if (ios) Object.defineProperty(AccessibilityInfo, 'sendAccessibilityEvent', { value: () => undefined, configurable: true, writable: true });
  else delete (AccessibilityInfo as { sendAccessibilityEvent?: unknown }).sendAccessibilityEvent;
}

/** A wallet's radio in a pick, named by the wallet and its balance: the one whose name starts with `name`. */
function walletRadio(name: string): HTMLElement {
  const element = screen.queryAllByRole('radio').find((each) => (each.getAttribute('aria-label') ?? '').startsWith(name));
  expect(element, `a radio for ${name}`).toBeDefined();
  return element as HTMLElement;
}

/** Each record_started sent, without the properties every event carries. */
const starts = (sent: readonly Recorded[]) => sent
  .filter((event) => event.name === 'record_started')
  .map(({ properties }) => Object.fromEntries(Object.entries(properties).filter(([key]) => key !== 'origin' && !(key in COMMON_RULES))));

const LOCALES = ['th', 'en'] as const;
const MODES = ['light', 'dark'] as const;
const WORDS = {
  th: { spending: 'จดรายจ่าย', expense: 'รายจ่าย', next: 'ถัดไป', save: 'บันทึก', back: 'กลับ', food: 'อาหาร', tryAgain: 'ลองอีกครั้ง', amountHidden: 'ซ่อนยอดเงินอยู่' },
  en: { spending: 'Add spending', expense: 'Spending', next: 'Next', save: 'Save', back: 'Back', food: 'Food', tryAgain: 'Try again', amountHidden: 'Amount hidden' },
} as const;
const PRIVATE = { [PRIVATE_MODE_NAME]: '1' };
const TODAY = todayInBangkok(new Date());

const wallet = (n: number, name: string, opening: string, trackingStart: string): WalletSnapshot => ({
  id: `0000000a-0000-4000-8000-00000000000${n}`, name, currency: 'THB', opening_minor: opening, tracking_start: trackingStart, archived: false, version: 1,
});
/** rh-transfer's ฿24,860 main account, tracked from the day before yesterday, and ฿1,240 in cash. */
const MAIN = wallet(1, 'บัญชีหลัก', '2486000', addDays(TODAY, -2));
const CASH = wallet(2, 'เงินสด', '124000', '2026-01-01');
const WALLETS = [MAIN, CASH];
const [FOOD, TRAVEL, , SALARY, GIFT] = BUILTINS as [(typeof BUILTINS)[number], (typeof BUILTINS)[number], (typeof BUILTINS)[number], (typeof BUILTINS)[number], (typeof BUILTINS)[number]];

const record = (n: number, more: Partial<TransactionDto>): TransactionDto => ({
  id: `0000000b-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, type: 'expense', amount_minor: '2000', occurred_on: addDays(TODAY, -n),
  wallet_id: CASH.id, category_id: TRAVEL.id, note: null, merchant: null, deleted_at: null, version: 1, ...more,
} as TransactionDto);
/**
 * Four often-logged entries: two kinds of spending from cash, logged twice each (a ฿20 motorbike taxi, the latest,
 * and ฿50 of chicken rice), and two of income into the main account, logged three times each (a ฿30,000 salary,
 * the latest, and ฿5,000 of rent from a room). By count the two incomes come first.
 */
const salary = (n: number) => record(n, { type: 'income', amount_minor: '3000000', wallet_id: MAIN.id, category_id: SALARY.id, merchant: 'บริษัท' });
const rent = (n: number) => record(n, { type: 'income', amount_minor: '500000', wallet_id: MAIN.id, category_id: GIFT.id, merchant: 'ค่าเช่าห้อง' });
const OFTEN = [
  record(1, { merchant: 'วิน' }),
  record(2, { merchant: 'วิน' }),
  record(3, { amount_minor: '5000', category_id: FOOD.id, merchant: 'ข้าวมันไก่' }),
  record(4, { amount_minor: '5000', category_id: FOOD.id, merchant: 'ข้าวมันไก่' }),
  salary(5), salary(6), salary(7),
  rent(8), rent(9), rent(10),
];

const SYNCED = { status: 'synced', progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0 } as SyncOutcome;
const resources = (seed: { records?: TransactionDto[] } = {}) => createFakeResources({ wallets: WALLETS, categories: BUILTINS, records: seed.records });
/** A phone's diary: open, its lists synced, its last sync done. */
const readyDiary = (view: Parameters<typeof createFakeDiary>[0] = {}) => createFakeDiary({ wallets: WALLETS, categories: BUILTINS, outcome: SYNCED, ...view });
const bunOn = () => fakeAiResources({}, { companion: true }).resources;

/** What Tell Bun read from "วิน 65": ฿65 of travel from cash today. */
const BUN_DRAFT: AiDraft = {
  type: 'expense', amount_minor: '6500', occurred_on: TODAY, category_id: TRAVEL.id, wallet_id: CASH.id, merchant: 'วิน', note: null, confidence: 'high', flags: [],
};

/** The latest useAddTray() inside the host (or outside one). */
const probe = { tray: null as AddTray | null };
function tray(): AddTray {
  expect(probe.tray, 'useAddTray()').not.toBeNull();
  return probe.tray as AddTray;
}
function Probe() {
  probe.tray = useAddTray();
  return null;
}
function Host({ onSaved, blocked }: { onSaved?: (saved: SavedEntry, context: SavedContext) => void; blocked?: boolean }) {
  return (
    <AddTrayHost onSaved={onSaved} blocked={blocked}>
      <Probe />
    </AddTrayHost>
  );
}

async function mount(element: ReactElement, options: MountWalletOptions = {}) {
  const view = mountWallet(element, { diary: readyDiary().diary, resources: resources().resources, ...options });
  await settle();
  return view;
}

async function openTray(request?: AddRequest) {
  act(() => { tray().open(request); });
  await settle();
  startAnimations();
}

/** Today's Tell Bun sheet, as the host renders it. */
function sheet(): TellBunSheetProps {
  expect(bun.props, "Tell Bun's sheet").not.toBeNull();
  return bun.props as TellBunSheetProps;
}
/** Use this, as the sheet's own button does: the draft, then the sheet closes. */
function useBun(draft: AiDraft) {
  act(() => {
    sheet().onUse(draft);
    sheet().onClose();
  });
  startAnimations();
}

/** An AI draft handed to the host as P3-T17's slip read and P3-T18's tell step will (applyAiDraft); then its content shows. */
function aiDraft(draft: AiDraft, meta: AiDraftMeta) {
  act(() => { tray().applyAiDraft(draft, meta); });
  startAnimations();
}
/** A photo Bun read with Haiku, and a sentence Opus read after Haiku: each draft's word on itself. */
const HAIKU_PHOTO: AiDraftMeta = { source: 'photo', model: 'claude-haiku-5-5', escalated: false };
const OPUS_TELL: AiDraftMeta = { source: 'tell_bun', model: 'claude-opus-5-5', escalated: true };
/** An event's own properties, without the ones every event carries. */
const own = (properties: Recorded['properties']) => Object.fromEntries(Object.entries(properties).filter(([key]) => key !== 'origin' && !(key in COMMON_RULES)));
/** Each ai_draft_reviewed sent (P3-T5's review), by its own properties. */
const reviews = (sent: readonly Recorded[]) => sent.filter((event) => event.name === 'ai_draft_reviewed').map(({ properties }) => own(properties));
/** Each record_saved's source and photo flag. */
const savedAs = (sent: readonly Recorded[]) => sent.filter((event) => event.name === 'record_saved').map(({ properties }) => [properties.source, properties.has_photo]);
/** The review of each AI draft below: kept, edited with a count, or dropped, with its model and whether Opus answered. */
const reviewOf = (outcome: string, fieldsEdited: number, meta: AiDraftMeta) => ({ outcome, fields_edited: fieldsEdited, model: meta.model, escalated: meta.escalated });

/** Every element gets a box, so Gesture Handler's web build reads the pointer (see the note at the top). */
function boxes() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 800, width: 400, height: 800, toJSON: () => ({}) }) as DOMRect,
  );
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  if (typeof proto.setPointerCapture !== 'function') proto.setPointerCapture = () => undefined;
  if (typeof proto.releasePointerCapture !== 'function') proto.releasePointerCapture = () => undefined;
  if (typeof proto.hasPointerCapture !== 'function') proto.hasPointerCapture = () => true;
}
/** A finger down on `target`, moved through `ys`, then let go: Gesture Handler's own web path. */
async function drag(target: Element, ys: readonly number[]) {
  const send = (type: string, y: number) => {
    const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 100, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 });
    act(() => { target.dispatchEvent(event); });
  };
  send('pointerdown', 0);
  for (const y of ys.slice(0, -1)) {
    await wait(16);
    send('pointermove', y);
  }
  await wait(16);
  send('pointerup', ys[ys.length - 1] as number);
  await wait(16);
}

/** Mounts one of the host's catalogue sections, which loads lazily and runs its script, and waits until it is ready. */
async function openSection(id: string, options: MountWalletOptions = {}) {
  mountWallet(<>{WALLET_SECTIONS.find((each) => each.id === id)?.render()}</>, options);
  await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
  expect(screen.queryByTestId('catalogue-screen-ready'), id).not.toBeNull();
  startAnimations();
}

test('open() shows the amount tray named จดรายจ่าย and sends one record_started', async () => {
  const recorded = await recordAnalytics();
  try {
    for (const locale of LOCALES) {
      for (const mode of MODES) {
        const at = `${locale} ${mode}`;
        const words = WORDS[locale];
        await mount(<Host />, { locale, mode });
        await openTray();
        // The amount step, the dialog named by the tray's title: spending chosen, nothing typed, and Next waiting.
        named('dialog', words.spending);
        expect(radio(words.expense).getAttribute('aria-checked'), at).toBe('true');
        expect(text('add-amount'), at).toBe('฿0');
        expect(named('button', words.next).getAttribute('aria-disabled'), at).toBe('true');
        expect(screen.queryByRole('button', { name: words.back }), at).toBeNull();
        expect(tray().isOpen, at).toBe(true);
        // Asked again while it is open, the tray stays as it is and starts nothing.
        act(() => { tray().open({ type: 'income' }); });
        startAnimations();
        expect(radio(words.expense).getAttribute('aria-checked'), at).toBe('true');
        cleanup();
      }
    }
    // One record_started per opening, typed, for spending (R61).
    expect(starts(recorded.sent)).toEqual(Array(4).fill({ kind: 'expense', source: 'typed' }));
  } finally {
    recorded.restore();
  }
});

test('saving with a ready diary keeps the entry on the phone, closes the tray and hands on the track', async () => {
  const recorded = await recordAnalytics();
  try {
    for (const locale of LOCALES) {
      const words = WORDS[locale];
      const diary = readyDiary();
      const onSaved = vi.fn();
      await mount(<Host onSaved={onSaved} />, { locale, diary: diary.diary });
      const before = Date.now();
      await openTray();
      const opened = Date.now();
      await wait(20);
      press('5', '0');
      tap(named('button', words.next));
      // Confirm: ฿50 of the first category, from the first wallet, today.
      expect([text('confirm-amount'), text('confirm-title')], locale).toEqual(['฿50', words.food]);
      tap(named('button', words.save));
      await settle();
      // Kept on the phone once: the entry the person checked.
      expect(diary.saves, locale).toEqual([expect.objectContaining({ type: 'expense', amount_minor: '5000', wallet_id: MAIN.id, category_id: FOOD.id })]);
      // The host is told once: the track for 1D-T7's record_saved, and the lookups P2-T17's toast reads.
      expect(onSaved, locale).toHaveBeenCalledTimes(1);
      const [saved, context] = onSaved.mock.calls[0] as [SavedEntry, SavedContext];
      expect([saved.via, saved.track?.source, saved.track?.categoryKey, typeof saved.track?.openedAt, context.offline], locale).toEqual(['device', 'typed', 'food', 'number', false]);
      expect(context.lookups.wallets.get(MAIN.id)?.name, locale).toBe(MAIN.name);
      // openedAt is when the tray opened, for seconds_to_save.
      expect((saved.track?.openedAt ?? 0) >= before && (saved.track?.openedAt ?? 0) <= opened, locale).toBe(true);
      // A save that lands is a success, kept on the phone or not (W17).
      expect(moments(), locale).toContain('saveLanded');
      expect(moments(), locale).not.toContain('saveQueued');
      // The tray closes: the card at once, its Modal once the card has left.
      expect(screen.queryByTestId('tray'), locale).toBeNull();
      expect(tray().isOpen, locale).toBe(false);
      await wait(250);
      expect(screen.queryByRole('dialog'), locale).toBeNull();
      cleanup();
      vi.clearAllMocks();
    }
    // A phone whose last sync did not end synced keeps the entry for later: offline.
    const onSaved = vi.fn();
    await mount(<Host onSaved={onSaved} />, { diary: readyDiary({ outcome: null }).diary });
    await openTray();
    press('5', '0');
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect((onSaved.mock.calls[0] as [SavedEntry, SavedContext])[1].offline).toBe(true);
    // Nothing of the entry reaches analytics, and the tray sends no saved event of its own (R61: useEntrySave's finish does).
    const json = JSON.stringify(recorded.sent);
    for (const secret of ['5000', MAIN.name]) expect(json).not.toContain(secret);
    expect(source('AddTrayHost.tsx')).not.toMatch(/trackRecordSaved/);
  } finally {
    recorded.restore();
  }
});

test("the track names the category's key, income's own and none for a move, and a move keeps its amount and wallets exactly", async () => {
  // Income, online: its own category's key, and the 000 key's satang (the second review's P2, its M4).
  const fake = resources();
  const onSaved = vi.fn();
  await mount(<Host onSaved={onSaved} />, { resources: fake.resources, diary: null });
  await openTray({ type: 'income' });
  press('3', '000', '0');
  expect(text('add-amount')).toBe('฿30,000');
  tap(named('button', 'ถัดไป'));
  tap(named('button', 'บันทึก'));
  await settle();
  expect(onSaved).toHaveBeenCalledTimes(1);
  const income = fake.callsOf('createTransaction')[0]?.args[0] as Record<string, unknown>;
  expect([income.amount_minor, (onSaved.mock.calls[0] as [SavedEntry])[0].track?.categoryKey]).toEqual(['3000000', 'salary']);
  cleanup();
  // A move kept on the phone: from and to as chosen, the amount exact, and no category, so no key (P1, its M5).
  const diary = readyDiary();
  const moved = vi.fn();
  await mount(<Host onSaved={moved} />, { diary: diary.diary });
  await openTray({ type: 'transfer' });
  press('5', '0', '0');
  tap(named('button', 'ถัดไป'));
  tap(found('transfer-next'));
  tap(named('button', 'บันทึก'));
  await settle();
  expect(diary.saves).toEqual([expect.objectContaining({ type: 'transfer', amount_minor: '50000', source_wallet_id: MAIN.id, destination_wallet_id: CASH.id })]);
  expect(moved).toHaveBeenCalledTimes(1);
  expect((moved.mock.calls[0] as [SavedEntry])[0].track?.categoryKey).toBeNull();
});

test('a tray that is saving cannot be closed by close, the backdrop, escape or a swipe, and the result still lands', async () => {
  boxes();
  const fake = resources();
  const release = fake.hold('createTransaction');
  const onSaved = vi.fn();
  await mount(<Host onSaved={onSaved} />, { resources: fake.resources, diary: null, reducedMotion: true });
  await openTray();
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  tap(named('button', 'บันทึก'));
  await settle();
  // Saving: Save says so, and close says it is unavailable.
  expect(named('button', 'กำลังบันทึก…').getAttribute('aria-busy')).toBe('true');
  expect(named('button', 'ปิด').getAttribute('aria-disabled')).toBe('true');
  // Nothing closes it: close, the backdrop, escape, a swipe past the line, or the host's own close.
  fireEvent.click(named('button', 'ปิด'));
  fireEvent.click(found('tray-backdrop'));
  escape();
  await drag(found('tray-header'), [20, 60, 100, 150, 150]);
  act(() => { tray().close(); });
  await settle();
  found('tray');
  expect((found('tray').parentElement as HTMLElement).style.transform).toBe('translateY(0px)');
  expect(tray().isOpen).toBe(true);
  // Nothing on the step moves either: no back, and a row opens no pick.
  expect(screen.queryByRole('button', { name: 'กลับ' })).toBeNull();
  tap(found('confirm-row-category'));
  expect(screen.queryByTestId('pick-category')).toBeNull();
  expect(onSaved).not.toHaveBeenCalled();
  // The answer comes: the save lands online, the host is told, and the tray closes.
  await act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(onSaved).toHaveBeenCalledTimes(1);
  const [saved, context] = onSaved.mock.calls[0] as [SavedEntry, SavedContext];
  expect([saved.via, context.offline]).toEqual(['online', false]);
  expect(screen.queryByTestId('tray')).toBeNull();
}, 20_000);

test("an unconfirmed online save keeps today's Try again, which resends the same command key; a conflict says so, and Done closes", async () => {
  const fake = resources();
  fake.fail('createTransaction', 'network');
  const onSaved = vi.fn();
  await mount(<Host onSaved={onSaved} />, { resources: fake.resources, diary: null });
  await openTray();
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  // On iOS, which reads no live region, the problem is also said once.
  const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  tap(named('button', 'บันทึก'));
  await settle();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  expect(announce).toHaveBeenCalledWith(translateCopy('Not confirmed yet. Your entry is kept; try again.', 'th'));
  // Today's words above Try again, which takes Save's place.
  expect(text('add-save-problem')).toBe(translateCopy('Not confirmed yet. Your entry is kept; try again.', 'th'));
  expect(found('add-save-problem').getAttribute('role')).toBe('alert');
  expect(screen.queryByRole('button', { name: 'บันทึก' })).toBeNull();
  // Frozen, as Quick add freezes it: no new type, no pick and no back; but the tray can be closed.
  for (const name of ['รายจ่าย', 'รายรับ', 'โอน']) expect(radio(name).getAttribute('aria-disabled'), name).toBe('true');
  tap(found('confirm-row-note'));
  expect(screen.queryByTestId('pick-note')).toBeNull();
  expect(screen.queryByRole('button', { name: 'กลับ' })).toBeNull();
  expect(named('button', 'ปิด').getAttribute('aria-disabled')).toBeNull();
  // Try again resends the very same command: the same entry under the same key.
  tap(named('button', 'ลองอีกครั้ง'));
  await settle();
  const calls = fake.callsOf('createTransaction');
  expect(calls).toHaveLength(2);
  expect(calls[1]?.args).toEqual(calls[0]?.args);
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('tray')).toBeNull();
  cleanup();
  // A resend that finds the entry already saved with other details is a conflict: today's words, and Done closes the tray.
  const other = resources();
  other.fail('createTransaction', 'network');
  await mount(<Host onSaved={onSaved} />, { resources: other.resources, diary: null });
  await openTray();
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  tap(named('button', 'บันทึก'));
  await settle();
  const sent = other.callsOf('createTransaction')[0]?.args[0] as Record<string, unknown>;
  other.fail('createTransaction', 'conflict', { status: 409, code: 'VERSION_CONFLICT', current: { ...sent, amount_minor: '9900' } });
  tap(named('button', 'ลองอีกครั้ง'));
  await settle();
  expect(text('add-save-problem')).toBe(translateCopy('This entry is already saved in Jotbun as {amount}. Check it in History.', 'th', { amount: '฿99.00' }));
  tap(named('button', 'เสร็จ'));
  expect(screen.queryByTestId('tray')).toBeNull();
  expect(onSaved).toHaveBeenCalledTimes(1);
  cleanup();
  // A resend refused because the session changed cannot be tried again for now: Try again waits, and says why.
  const changed = resources();
  changed.fail('createTransaction', 'network');
  await mount(<Host />, { resources: changed.resources, diary: null });
  await openTray();
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  tap(named('button', 'บันทึก'));
  await settle();
  changed.fail('createTransaction', 'session_changed');
  tap(named('button', 'ลองอีกครั้ง'));
  await settle();
  expect(text('add-save-problem')).toBe(translateCopy('Your session changed. Sign in again to save.', 'th'));
  expect(named('button', 'ลองอีกครั้ง').getAttribute('aria-disabled')).toBe('true');
  cleanup();
  // A first save refused until Jotbun is updated: Save waits, and says why.
  const outdated = resources();
  outdated.fail('createTransaction', 'upgrade_required');
  await mount(<Host />, { resources: outdated.resources, diary: null });
  await openTray();
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  tap(named('button', 'บันทึก'));
  await settle();
  expect(text('add-save-problem')).toBe(translateCopy('Update Jotbun to keep saving. Your entry is kept.', 'th'));
  expect(named('button', 'บันทึก').getAttribute('aria-disabled')).toBe('true');
});

test("in private mode a conflict draws and says no amount: today's words, with the amount Jotbun holds masked and said as hidden", async () => {
  const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    const other = resources();
    other.fail('createTransaction', 'network');
    await mount(<Host />, { locale, resources: other.resources, diary: null, device: PRIVATE });
    await openTray();
    press('5', '0');
    tap(named('button', words.next));
    tap(named('button', words.save));
    await settle();
    // Private mode changes no other words: an answer lost is said as it always is.
    expect(text('add-save-problem'), locale).toBe(translateCopy('Not confirmed yet. Your entry is kept; try again.', locale));
    // The resend finds the entry saved with ฿99.00 (both reviews' probe, PROBE-5 and P5), on iOS, which says it too.
    const sent = other.callsOf('createTransaction')[0]?.args[0] as Record<string, unknown>;
    other.fail('createTransaction', 'conflict', { status: 409, code: 'VERSION_CONFLICT', current: { ...sent, amount_minor: '9900' } });
    announce.mockClear();
    onIos(true);
    tap(named('button', words.tryAgain));
    await settle();
    onIos(false);
    const line = 'This entry is already saved in Jotbun as {amount}. Check it in History.';
    const said = translateCopy(line, locale, { amount: words.amountHidden });
    expect([text('add-save-problem'), label('add-save-problem'), announce.mock.calls.map(([each]) => each)], locale).toEqual([
      translateCopy(line, locale, { amount: '฿••••' }),
      said,
      [said],
    ]);
    // No digit of it anywhere: drawn, in its words, or said (Review Focus 2).
    expect([text('add-save-problem'), label('add-save-problem'), ...announce.mock.calls.map(([each]) => each)].join(' '), locale).not.toMatch(/\p{Nd}/u);
    cleanup();
  }
});

test('a draft from Tell Bun marks its fields guessed and saves with source tell_bun', async () => {
  const diary = readyDiary();
  const onSaved = vi.fn();
  await mount(<Host onSaved={onSaved} />, { ai: bunOn(), diary: diary.diary });
  await openTray();
  tap(named('button', 'บอกบัน'));
  named('dialog', 'บอกบัน');
  useBun(BUN_DRAFT);
  // Bun's amount is in as a fill; the step waits for the person to go on.
  expect(text('add-amount')).toBe('฿65');
  tap(named('button', 'ถัดไป'));
  // Confirm: Bun's place is the title, and each row Bun filled says บันเดา; the note it left empty does not.
  expect(text('confirm-title')).toBe('วิน');
  expect(rowLabels()).toEqual(['หมวด การเดินทาง บันเดา', 'กระเป๋า เงินสด บันเดา', 'วันที่ วันนี้ บันเดา', 'โน้ต เพิ่มโน้ต']);
  // Today's sheet hands back no sentence, so confirm quotes none.
  expect(screen.queryByTestId('confirm-bun')).toBeNull();
  // A row the person changes is theirs again; the other guesses stand.
  tap(found('confirm-row-category'));
  tap(radio('อาหาร'));
  expect(rowLabels()).toEqual(['หมวด อาหาร', 'กระเป๋า เงินสด บันเดา', 'วันที่ วันนี้ บันเดา', 'โน้ต เพิ่มโน้ต']);
  tap(named('button', 'บันทึก'));
  await settle();
  expect(diary.saves).toEqual([expect.objectContaining({ amount_minor: '6500', wallet_id: CASH.id, category_id: FOOD.id, merchant: 'วิน' })]);
  expect(onSaved).toHaveBeenCalledTimes(1);
  const [saved] = onSaved.mock.calls[0] as [SavedEntry];
  expect([saved.track?.source, saved.track?.categoryKey]).toEqual(['tell_bun', 'food']);
  cleanup();
  // In private mode Bun's amount is a fill, so it is masked until a key is pressed (R106).
  await mount(<Host />, { ai: bunOn(), device: PRIVATE });
  await openTray();
  tap(named('button', 'บอกบัน'));
  useBun(BUN_DRAFT);
  expect([text('add-amount'), label('add-amount')]).toEqual(['฿••••', 'ซ่อนยอดเงินอยู่']);
  cleanup();
  // A draft whose amount Bun could not read (amount_unclear) leaves the amount to the person: what they typed stays,
  // and their typing shows.
  await mount(<Host />, { ai: bunOn(), device: PRIVATE });
  await openTray();
  press('4');
  tap(named('button', 'บอกบัน'));
  useBun({ ...BUN_DRAFT, amount_minor: null, flags: ['amount_unclear'] });
  expect(text('add-amount')).toBe('฿4');
  press('5');
  expect(text('add-amount')).toBe('฿45');
  tap(named('button', 'ถัดไป'));
  expect([text('confirm-amount'), screen.queryByTestId('confirm-bun')]).toEqual(['฿45', null]);
  expect(rowLabels()[0]).toBe('หมวด การเดินทาง บันเดา');
  cleanup();
  // A note Bun wrote is one of its guesses too (the second review's P11, its M3).
  await mount(<Host />, { ai: bunOn() });
  await openTray();
  tap(named('button', 'บอกบัน'));
  useBun({ ...BUN_DRAFT, note: 'ค่าข้าวกับพี่' });
  tap(named('button', 'ถัดไป'));
  expect(rowLabels()[3]).toBe('โน้ต ค่าข้าวกับพี่ บันเดา');
});

test("in private mode confirm draws none of Bun's words: a title it would quote is the tray's own, a note it guessed reads as hidden, and what the person writes shows", async () => {
  // Bun named no place, only a note: out of private mode that note would be the title (R117).
  await mount(<Host />, { ai: bunOn(), device: PRIVATE });
  await openTray();
  tap(named('button', 'บอกบัน'));
  useBun({ ...BUN_DRAFT, merchant: null, note: 'ข้าวมันไก่ 65 บาท' });
  tap(named('button', 'ถัดไป'));
  expect([text('confirm-title'), rowLabels()[3]]).toEqual(['จดรายจ่าย', 'โน้ต ซ่อนอยู่ บันเดา']);
  // A note the person writes is theirs: it shows, and is the title.
  tap(found('confirm-row-note'));
  fireEvent.change(named('textbox', 'โน้ต'), { target: { value: 'ข้าวกลางวัน' } });
  tap(found('pick-note-done'));
  expect([text('confirm-title'), rowLabels()[3]]).toEqual(['ข้าวกลางวัน', 'โน้ต ข้าวกลางวัน']);
  cleanup();
  // Bun named the place and wrote a note, each with the amount in it (the second review's P4a): confirm draws and
  // says none of it, and no digit at all.
  await mount(<Host />, { ai: bunOn(), device: PRIVATE });
  await openTray();
  tap(named('button', 'บอกบัน'));
  useBun({ ...BUN_DRAFT, merchant: 'ข้าวมันไก่ 65', note: 'ข้าวมันไก่ 65 บาท' });
  tap(named('button', 'ถัดไป'));
  expect([text('confirm-title'), text('confirm-amount')]).toEqual(['จดรายจ่าย', '฿••••']);
  expect(rowLabels()).toEqual(['หมวด การเดินทาง บันเดา', 'กระเป๋า เงินสด บันเดา', 'วันที่ วันนี้ บันเดา', 'โน้ต ซ่อนอยู่ บันเดา']);
  const step = found('confirm-step');
  const spoken = [...step.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label'));
  expect([step.textContent, ...spoken].join(' ')).not.toMatch(/\p{Nd}/u);
  // Told again, of the amount only: the place is still the one Bun named, and still not drawn.
  tap(named('button', 'กลับ'));
  tap(named('button', 'บอกบัน'));
  useBun({ ...BUN_DRAFT, amount_minor: '7000', merchant: null, note: null });
  tap(named('button', 'ถัดไป'));
  expect(text('confirm-title')).toBe('จดรายจ่าย');
  // A name the person types (income's name field) is theirs: it shows.
  tap(named('button', 'กลับ'));
  tap(radio('รายรับ'));
  fireEvent.change(named('textbox', 'ชื่อรายการ'), { target: { value: 'ค่าจ้าง' } });
  tap(named('button', 'ถัดไป'));
  expect([text('confirm-title'), rowLabels()[3]]).toEqual(['ค่าจ้าง', 'โน้ต ซ่อนอยู่ บันเดา']);
});

test('a typed save sends source typed', async () => {
  const recorded = await recordAnalytics();
  try {
    // Kept on the phone: the outbox entry says typed.
    const diary = readyDiary();
    await mount(<Host />, { diary: diary.diary });
    await openTray();
    press('5', '0');
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(diary.saves).toEqual([expect.objectContaining({ amount_minor: '5000', source: 'typed' })]);
    cleanup();
    // Sent online, from a quick chip (the person's own entry, logged before): the create says typed too.
    const fake = resources({ records: OFTEN });
    await mount(<Host />, { resources: fake.resources, diary: null });
    await openTray();
    tap(named('button', 'วิน 20 บาท'));
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(fake.callsOf('createTransaction').map((call) => (call.args[0] as Record<string, unknown>).source)).toEqual(['typed']);
    // record_saved says typed, with no photo (until P3-T15), and nothing is reviewed.
    expect([savedAs(recorded.sent), reviews(recorded.sent)]).toEqual([[['typed', false], ['typed', false]], []]);
  } finally {
    recorded.restore();
  }
});

test('a Tell Bun sheet draft saves as tell_bun without a review', async () => {
  const recorded = await recordAnalytics();
  try {
    const diary = readyDiary();
    await mount(<Host />, { ai: bunOn(), diary: diary.diary });
    await openTray();
    tap(named('button', 'บอกบัน'));
    useBun(BUN_DRAFT);
    tap(named('button', 'ถัดไป'));
    // The person changes every row Bun filled, so no guess of Bun's stands: the record still says tell_bun, since
    // the entry's origin decides it, not a guess still standing (P2's rule; followups, P2-T16's reviews).
    tap(found('confirm-row-category'));
    tap(radio('อาหาร'));
    tap(found('confirm-row-wallet'));
    tap(walletRadio(MAIN.name));
    tap(found('confirm-row-date'));
    tap(named('button', translateCopy('Previous day', 'th')));
    tap(found('pick-date-done'));
    expect(rowLabels().filter((row) => row?.includes('บันเดา'))).toEqual([]);
    tap(named('button', 'บันทึก'));
    await settle();
    expect(diary.saves).toEqual([expect.objectContaining({ category_id: FOOD.id, wallet_id: MAIN.id, occurred_on: addDays(TODAY, -1), source: 'tell_bun' })]);
    // The sheet does not say which model read the sentence, so nothing is reviewed.
    expect([savedAs(recorded.sent), reviews(recorded.sent)]).toEqual([[['tell_bun', false]], []]);
  } finally {
    recorded.restore();
  }
});

test('an AI draft saved as filled is reviewed kept, and one changed is edited with its count', async () => {
  const recorded = await recordAnalytics();
  try {
    // A photo Bun read with Haiku: the draft fills the entry as the sheet's does, each row it filled Bun's guess.
    const diary = readyDiary();
    await mount(<Host />, { diary: diary.diary });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    expect(text('add-amount')).toBe('฿65');
    tap(named('button', 'ถัดไป'));
    expect([text('confirm-title'), rowLabels()]).toEqual(['วิน', ['หมวด การเดินทาง บันเดา', 'กระเป๋า เงินสด บันเดา', 'วันที่ วันนี้ บันเดา', 'โน้ต เพิ่มโน้ต']]);
    tap(named('button', 'บันทึก'));
    await settle();
    // Saved as filled: the record says photo, and the draft is reviewed kept, once.
    expect(diary.saves).toEqual([expect.objectContaining({ amount_minor: '6500', category_id: TRAVEL.id, wallet_id: CASH.id, merchant: 'วิน', source: 'photo' })]);
    expect([savedAs(recorded.sent), reviews(recorded.sent)]).toEqual([[['photo', false]], [reviewOf('kept', 0, HAIKU_PHOTO)]]);
    cleanup();
    // The same draft with its category changed: edited, one field.
    const changed = readyDiary();
    await mount(<Host />, { diary: changed.diary });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    tap(named('button', 'ถัดไป'));
    tap(found('confirm-row-category'));
    tap(radio('อาหาร'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(changed.saves).toEqual([expect.objectContaining({ amount_minor: '6500', category_id: FOOD.id, source: 'photo' })]);
    expect(reviews(recorded.sent)).toEqual([reviewOf('kept', 0, HAIKU_PHOTO), reviewOf('edited', 1, HAIKU_PHOTO)]);
    cleanup();
    // A sentence Opus read after Haiku, saved online with its amount and note changed: edited, two fields, and the
    // create says tell_bun.
    const fake = resources();
    await mount(<Host />, { resources: fake.resources, diary: null });
    await openTray();
    aiDraft(BUN_DRAFT, OPUS_TELL);
    press('7', '0');
    expect(text('add-amount')).toBe('฿70');
    tap(named('button', 'ถัดไป'));
    tap(found('confirm-row-note'));
    fireEvent.change(named('textbox', 'โน้ต'), { target: { value: 'ข้าวกลางวัน' } });
    tap(found('pick-note-done'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(fake.callsOf('createTransaction').map((call) => call.args[0])).toEqual([expect.objectContaining({ amount_minor: '7000', note: 'ข้าวกลางวัน', source: 'tell_bun' })]);
    expect(reviews(recorded.sent)).toEqual([reviewOf('kept', 0, HAIKU_PHOTO), reviewOf('edited', 1, HAIKU_PHOTO), reviewOf('edited', 2, OPUS_TELL)]);
    cleanup();
    // Bun read no amount: the amount the person had typed stays, and saved as the draft left it, the draft is kept.
    const typed = readyDiary();
    await mount(<Host />, { diary: typed.diary });
    await openTray();
    press('4', '5');
    aiDraft({ ...BUN_DRAFT, amount_minor: null, flags: ['amount_unclear'] }, HAIKU_PHOTO);
    expect(text('add-amount')).toBe('฿45');
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(typed.saves).toEqual([expect.objectContaining({ amount_minor: '4500', category_id: TRAVEL.id, source: 'photo' })]);
    expect(reviews(recorded.sent)[3]).toEqual(reviewOf('kept', 0, HAIKU_PHOTO));
    expect(savedAs(recorded.sent)).toEqual([['photo', false], ['photo', false], ['tell_bun', false], ['photo', false]]);
    // No amount, place, note or wallet reaches analytics (1D-T7's allow-list is the boundary), and the host reviews
    // only through useDraftReview, the one way to the development tally (P3-T5's review, m2).
    const json = JSON.stringify(recorded.sent);
    for (const secret of ['6500', '7000', '4500', 'วิน', 'ข้าวกลางวัน', CASH.name]) expect(json).not.toContain(secret);
    expect(source('AddTrayHost.tsx')).not.toMatch(/draftTally|trackAiDraftReviewed/);
  } finally {
    recorded.restore();
  }
});

test('closing the tray with an unsaved AI draft reviews it dropped, once', async () => {
  const recorded = await recordAnalytics();
  try {
    const diary = readyDiary();
    const view = await mount(<Host />, { diary: diary.diary });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    tap(named('button', 'ถัดไป'));
    // Closed unsaved: dropped at once, with its model. Drawn again while the tray leaves, and once it has gone,
    // nothing more is sent.
    fireEvent.click(named('button', 'ปิด'));
    expect(reviews(recorded.sent)).toEqual([reviewOf('dropped', 0, HAIKU_PHOTO)]);
    view.rerender(<Host />);
    await wait(250);
    expect(reviews(recorded.sent)).toEqual([reviewOf('dropped', 0, HAIKU_PHOTO)]);
    // A typed entry closed unsaved has nothing to review.
    await openTray();
    press('5');
    fireEvent.click(named('button', 'ปิด'));
    await wait(250);
    expect(reviews(recorded.sent)).toHaveLength(1);
    // Escape closes it the same way: the next AI draft is dropped too, once, and nothing was kept.
    await openTray();
    aiDraft(BUN_DRAFT, OPUS_TELL);
    escape();
    await wait(250);
    expect(reviews(recorded.sent)).toEqual([reviewOf('dropped', 0, HAIKU_PHOTO), reviewOf('dropped', 0, OPUS_TELL)]);
    expect([diary.saves, savedAs(recorded.sent)]).toEqual([[], []]);
  } finally {
    recorded.restore();
  }
});

test('a second AI draft over an unsaved one reviews the first dropped', async () => {
  const recorded = await recordAnalytics();
  try {
    const diary = readyDiary();
    await mount(<Host />, { ai: bunOn(), diary: diary.diary });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    // The second fills the entry, and the first, never saved, is dropped at once.
    aiDraft({ ...BUN_DRAFT, amount_minor: '12000', category_id: FOOD.id, merchant: 'ข้าวมันไก่' }, OPUS_TELL);
    expect([text('add-amount'), reviews(recorded.sent)]).toEqual(['฿120', [reviewOf('dropped', 0, HAIKU_PHOTO)]]);
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    // Saved as the second filled it: its source, and reviewed kept with its own model.
    expect(diary.saves).toEqual([expect.objectContaining({ amount_minor: '12000', category_id: FOOD.id, merchant: 'ข้าวมันไก่', source: 'tell_bun' })]);
    expect(reviews(recorded.sent)).toEqual([reviewOf('dropped', 0, HAIKU_PHOTO), reviewOf('kept', 0, OPUS_TELL)]);
    cleanup();
    // P2's sheet over an unsaved AI draft: the AI draft is dropped, and the sheet's is saved as tell_bun, unreviewed.
    const sheetDiary = readyDiary();
    await mount(<Host />, { ai: bunOn(), diary: sheetDiary.diary });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    tap(named('button', 'บอกบัน'));
    useBun({ ...BUN_DRAFT, amount_minor: '8000' });
    expect(reviews(recorded.sent)).toEqual([reviewOf('dropped', 0, HAIKU_PHOTO), reviewOf('kept', 0, OPUS_TELL), reviewOf('dropped', 0, HAIKU_PHOTO)]);
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(sheetDiary.saves).toEqual([expect.objectContaining({ amount_minor: '8000', source: 'tell_bun' })]);
    expect([reviews(recorded.sent).length, savedAs(recorded.sent)]).toEqual([3, [['tell_bun', false], ['tell_bun', false]]]);
  } finally {
    recorded.restore();
  }
});

test('an AI draft handed over while a save is on its way, or while its answer is unknown, changes nothing', async () => {
  const recorded = await recordAnalytics();
  try {
    // A save on its way online: a second draft is not taken, and the first is reviewed once it lands.
    const fake = resources();
    const release = fake.hold('createTransaction');
    await mount(<Host />, { resources: fake.resources, diary: null });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    aiDraft({ ...BUN_DRAFT, amount_minor: '9900', category_id: FOOD.id }, OPUS_TELL);
    expect([text('confirm-amount'), reviews(recorded.sent)]).toEqual(['฿65', []]);
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(fake.callsOf('createTransaction').map((call) => call.args[0])).toEqual([expect.objectContaining({ amount_minor: '6500', category_id: TRAVEL.id, source: 'photo' })]);
    expect(reviews(recorded.sent)).toEqual([reviewOf('kept', 0, HAIKU_PHOTO)]);
    cleanup();
    // An answer lost: the same; Try again resends the first draft, which is then reviewed.
    const lost = resources();
    lost.fail('createTransaction', 'network');
    await mount(<Host />, { resources: lost.resources, diary: null });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    aiDraft({ ...BUN_DRAFT, amount_minor: '9900' }, OPUS_TELL);
    expect([text('confirm-amount'), reviews(recorded.sent)]).toEqual(['฿65', [reviewOf('kept', 0, HAIKU_PHOTO)]]);
    tap(named('button', 'ลองอีกครั้ง'));
    await settle();
    expect(lost.callsOf('createTransaction').map((call) => (call.args[0] as Record<string, unknown>).amount_minor)).toEqual(['6500', '6500']);
    expect(reviews(recorded.sent)).toEqual([reviewOf('kept', 0, HAIKU_PHOTO), reviewOf('kept', 0, HAIKU_PHOTO)]);
  } finally {
    recorded.restore();
  }
});

test("Tell Bun's sheet opens inside the tray", async () => {
  await mount(<Host />, { ai: bunOn() });
  await openTray();
  tap(named('button', 'บอกบัน'));
  named('dialog', 'บอกบัน');
  // Escape closes only the sheet, the top Modal; the tray stays.
  escape();
  expect(screen.queryByRole('dialog', { name: 'บอกบัน' })).toBeNull();
  found('tray');
  // Opened again, the sheet goes with the tray's content the moment the tray closes, while the tray's own Modal is
  // still leaving: it is inside the tray (R69). A sheet beside the tray would stay until the entry goes.
  tap(named('button', 'บอกบัน'));
  named('dialog', 'บอกบัน');
  act(() => { tray().close(); });
  expect(screen.queryByRole('dialog', { name: 'บอกบัน' })).toBeNull();
  named('dialog', 'จดรายจ่าย');
});

test('while blocked, open does nothing', async () => {
  const recorded = await recordAnalytics();
  try {
    const view = await mount(<Host blocked />);
    act(() => { tray().open(); });
    await settle();
    expect([tray().blocked, tray().isOpen, screen.queryByTestId('tray')]).toEqual([true, false, null]);
    expect(starts(recorded.sent)).toEqual([]);
    // Unblocked (the update has come), it opens.
    view.rerender(<Host />);
    await settle();
    await openTray();
    found('tray');
    expect([tray().blocked, tray().isOpen]).toEqual([false, true]);
    expect(starts(recorded.sent)).toEqual([{ kind: 'expense', source: 'typed' }]);
  } finally {
    recorded.restore();
  }
});

test('at AX5 the tray is full height, its title pinned, and the type is chosen under the amount', async () => {
  await mount(<Host />, { fontScale: AX5 });
  await openTray();
  expect(found('tray').style.flexGrow).toBe('1');
  // The pinned header is the title; the switch is the amount step's, under the amount.
  const header = found('tray-header');
  expect(within(header).queryByRole('radiogroup')).toBeNull();
  expect(within(header).queryByRole('heading', { name: 'จดรายจ่าย' })).not.toBeNull();
  const parts = [...found('tray').querySelectorAll('[data-testid]')].map((element) => element.getAttribute('data-testid')).filter((id) => id === 'add-amount' || id === 'type-switch');
  expect(parts).toEqual(['add-amount', 'type-switch']);
  // The steps after the amount offer no switch: the type is chosen on the amount step.
  press('5');
  tap(named('button', 'ถัดไป'));
  found('confirm-step');
  expect(screen.queryByTestId('type-switch')).toBeNull();
  tap(named('button', 'กลับ'));
  found('type-switch');
});

test('a transfer goes amount, transfer, confirm; back goes to the amount; a pick goes back to its opener; a new type goes on to its own next step', async () => {
  await mount(<Host />);
  await openTray();
  // The keypad's problem shows in today's words, under the amount.
  press('0');
  expect(text('add-problem')).toBe(translateCopy('Enter an amount above zero', 'th'));
  press('ลบตัวเลข');
  expect(screen.queryByTestId('add-problem')).toBeNull();
  // While income's name has focus, the footer is Next alone; the keys come back after.
  tap(radio('รายรับ'));
  fireEvent.focus(named('textbox', 'ชื่อรายการ'));
  expect(screen.queryByTestId('wallet-keypad')).toBeNull();
  fireEvent.blur(named('textbox', 'ชื่อรายการ'));
  found('wallet-keypad');
  // A new type on the amount step keeps it.
  tap(radio('โอน'));
  named('dialog', 'โอนเงิน');
  found('add-amount');
  press('5', '0', '0');
  tap(named('button', 'ถัดไป'));
  // The transfer step, from the first wallet to the second, each with its balance and what it holds after the move,
  // and Next for two different wallets (R114.2).
  expect([label('transfer-from'), label('transfer-to')]).toEqual(['จาก บัญชีหลัก 24,860 บาท หลังโอน 24,360 บาท', 'ไป เงินสด 1,240 บาท หลังโอน 1,740 บาท']);
  expect(found('transfer-next').getAttribute('aria-disabled')).toBeNull();
  // A card's pick goes back to the transfer step.
  tap(found('transfer-from'));
  named('radiogroup', 'จาก');
  tap(named('button', 'กลับ'));
  found('transfer-step');
  tap(found('transfer-next'));
  expect(rowLabels()).toEqual(['จาก บัญชีหลัก', 'ไป เงินสด', 'วันที่ วันนี้', 'โน้ต เพิ่มโน้ต']);
  // Back from confirm is the amount, and Next comes round through the transfer step again.
  tap(named('button', 'กลับ'));
  found('add-amount');
  tap(named('button', 'ถัดไป'));
  found('transfer-step');
  tap(found('transfer-next'));
  // On confirm spending keeps confirm, and a change to transfer goes to the transfer step, never staying on confirm.
  tap(radio('รายจ่าย'));
  found('confirm-step');
  // The day goes back no further than the main account's start, two days ago.
  tap(found('confirm-row-date'));
  const previous = named('button', translateCopy('Previous day', 'th'));
  tap(previous);
  tap(previous);
  expect(named('button', translateCopy('Previous day', 'th')).getAttribute('aria-disabled')).toBe('true');
  tap(named('button', 'กลับ'));
  found('confirm-step');
  tap(radio('โอน'));
  found('transfer-step');
  expect(screen.queryByTestId('confirm-step')).toBeNull();
  // A pick the amount step opened goes back there, even after a new type.
  tap(named('button', 'กลับ'));
  tap(radio('รายจ่าย'));
  tap(found('add-wallet'));
  named('radiogroup', 'กระเป๋า');
  tap(radio('รายรับ'));
  found('add-amount');
});

test("Save refuses a day before the wallet started tracking, in today's words, and keeps nothing", async () => {
  // A day three days back, chosen for cash (tracked since January); then the main account, which started two days
  // ago (the second review's P8, its M6).
  const diary = readyDiary();
  await mount(<Host />, { diary: diary.diary });
  await openTray({ walletId: CASH.id });
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  tap(found('confirm-row-date'));
  const previous = named('button', translateCopy('Previous day', 'th'));
  tap(previous);
  tap(previous);
  tap(previous);
  tap(found('pick-date-done'));
  tap(found('confirm-row-wallet'));
  tap(walletRadio(MAIN.name));
  tap(named('button', 'บันทึก'));
  await settle();
  expect([text('add-save-problem'), diary.saves]).toEqual([translateCopy('This date is before the wallet started tracking.', 'th'), []]);
});

test('open with a type and a wallet starts there: the wallet spent from or paid into, or the one a move leaves', async () => {
  await mount(<Host />);
  const closeTray = async () => {
    fireEvent.click(named('button', 'ปิด'));
    await wait(250);
  };
  await openTray({ walletId: CASH.id });
  expect(text('add-wallet')).toBe('จากเงินสด');
  await closeTray();
  await openTray({ type: 'income', walletId: CASH.id });
  named('dialog', 'จดรายรับ');
  expect(text('add-wallet')).toBe('เข้าเงินสด');
  await closeTray();
  // A move leaves the wallet; its other side, which was that wallet, becomes the other one.
  await openTray({ type: 'transfer', walletId: CASH.id });
  press('5', '0', '0');
  tap(named('button', 'ถัดไป'));
  expect([label('transfer-from')?.startsWith('จาก เงินสด'), label('transfer-to')?.startsWith('ไป บัญชีหลัก')]).toEqual([true, true]);
  await closeTray();
  // A wallet not listed is left out: the entry starts as a new one does.
  await openTray({ walletId: '0000000a-0000-4000-8000-0000000000ff' });
  expect(text('add-wallet')).toBe('จากบัญชีหลัก');
});

test("whenClosed runs once the tray's Modal has hidden, or at once with no tray; an open asked while a tray leaves waits for it (R69)", async () => {
  const recorded = await recordAnalytics();
  try {
    const view = await mount(<Host />);
    // No tray: at once.
    const first = vi.fn();
    act(() => { tray().whenClosed(first); });
    expect(first).toHaveBeenCalledTimes(1);
    // A tray open: once it has closed and its Modal has hidden, never before.
    await openTray();
    const second = vi.fn();
    act(() => { tray().whenClosed(second); });
    fireEvent.click(named('button', 'ปิด'));
    expect(screen.queryByTestId('tray')).toBeNull();
    expect(second).not.toHaveBeenCalled();
    await wait(250);
    expect(second).toHaveBeenCalledTimes(1);
    // Opened and closed again, it does not run twice.
    await openTray();
    fireEvent.click(named('button', 'ปิด'));
    await wait(250);
    expect(second).toHaveBeenCalledTimes(1);
    // An open asked while the tray leaves opens once the first has gone, never in the same render.
    await openTray();
    fireEvent.click(named('button', 'ปิด'));
    act(() => { tray().open({ type: 'income' }); });
    await settle();
    expect(screen.queryByTestId('tray')).toBeNull();
    expect(starts(recorded.sent)).toHaveLength(3);
    await wait(250);
    startAnimations();
    named('dialog', 'จดรายรับ');
    expect(starts(recorded.sent)).toEqual([...Array(3).fill({ kind: 'expense', source: 'typed' }), { kind: 'income', source: 'typed' }]);
    // An open that waited asks again when it runs: blocked by then, nothing opens (the second review's P13, its M10).
    fireEvent.click(named('button', 'ปิด'));
    act(() => { tray().open(); });
    view.rerender(<Host blocked />);
    await wait(250);
    startAnimations();
    expect([screen.queryByTestId('tray'), starts(recorded.sent).length]).toEqual([null, 4]);
  } finally {
    recorded.restore();
  }
});

test('on iOS a tray whose Modal never says it has gone closes anyway once the bound has passed: what waited runs once, and a late word changes nothing', async () => {
  const recorded = await recordAnalytics();
  try {
    const view = await mount(<Host />);
    await openTray();
    // iOS hears the close only from the Modal's onDismiss, and this dismissal never ends (both reviews' wedge probes).
    // A run queued for after the close (P2-T30's) and the + wait for it, as R69 says.
    dismissals.hold = true;
    onIos(true);
    fireEvent.click(named('button', 'ปิด'));
    const later = vi.fn();
    act(() => { tray().whenClosed(later); });
    expect(later).not.toHaveBeenCalled();
    act(() => { tray().open({ type: 'income' }); });
    // The card's exit has ended and the Modal has hidden, but no word has come: nothing has run.
    await wait(250);
    onIos(false);
    expect([dismissals.held.length, screen.queryByTestId('tray'), later.mock.calls.length, starts(recorded.sent).length]).toEqual([1, null, 0, 1]);
    // Past the bound, 1.5 s from the close (R117), the entry goes: the income tray opens, and the run runs, once.
    await wait(1500);
    startAnimations();
    named('dialog', 'จดรายรับ');
    expect([tray().isOpen, later.mock.calls.length, starts(recorded.sent)]).toEqual([true, 1, [{ kind: 'expense', source: 'typed' }, { kind: 'income', source: 'typed' }]]);
    // The first tray's word comes at last: it changes nothing, and the open tray stays open past another bound.
    act(() => { dismissals.held[0]?.(); });
    named('dialog', 'จดรายรับ');
    await wait(1600);
    startAnimations();
    named('dialog', 'จดรายรับ');
    expect([tray().isOpen, later.mock.calls.length, starts(recorded.sent).length]).toEqual([true, 1, 2]);
    // A host that goes away (a sign-out, say) while its tray leaves runs nothing more, past the bound too.
    fireEvent.click(named('button', 'ปิด'));
    act(() => { tray().open(); });
    view.unmount();
    await wait(1600);
    expect(starts(recorded.sent)).toHaveLength(2);
  } finally {
    recorded.restore();
  }
}, 20_000);

test("outside a host, open pushes today's Quick add with the request", async () => {
  await mount(<Probe />);
  act(() => { tray().open({ copyOf: '0000000b-0000-4000-8000-000000000001' }); });
  expect(router.push).toHaveBeenCalledWith({ pathname: '/spend/add', params: { copyOf: '0000000b-0000-4000-8000-000000000001' } });
  act(() => { tray().open(); });
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/spend/add', params: {} });
  const run = vi.fn();
  act(() => { tray().whenClosed(run); });
  expect(run).toHaveBeenCalledTimes(1);
  expect([tray().isOpen, tray().blocked, screen.queryByTestId('tray')]).toEqual([false, false, null]);
});

test("the quick chips are the type's often-logged entries, named by place and filled as fills; Bun's sheet offers none of its own", async () => {
  const onSaved = vi.fn();
  await mount(<Host onSaved={onSaved} />, { resources: resources({ records: OFTEN }).resources, ai: bunOn() });
  await openTray();
  // Spending's own, both, though the two incomes are logged more often: never an income's.
  expect(chipLabels()).toEqual(['วิน 20 บาท', 'ข้าวมันไก่ 50 บาท']);
  // Bun's sheet gets none: an often-logged label ends with its amount in digits (R106).
  tap(named('button', 'บอกบัน'));
  expect(sheet().often ?? []).toEqual([]);
  escape();
  // Income's own.
  tap(radio('รายรับ'));
  expect(chipLabels()).toEqual(['บริษัท 30,000 บาท', 'ค่าเช่าห้อง 5,000 บาท']);
  tap(radio('รายจ่าย'));
  // A chip fills the entry as the person logged it, its amount as a fill; none of it is Bun's guess.
  tap(named('button', 'วิน 20 บาท'));
  expect(text('add-amount')).toBe('฿20');
  tap(named('button', 'ถัดไป'));
  expect(rowLabels()).toEqual(['หมวด การเดินทาง', 'กระเป๋า เงินสด', 'วันที่ วันนี้', 'โน้ต เพิ่มโน้ต']);
  tap(named('button', 'บันทึก'));
  await settle();
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect((onSaved.mock.calls[0] as [SavedEntry])[0].track?.source).toBe('typed');
  cleanup();
  // In private mode a chip says its place and that its amount is hidden, and fills a masked amount.
  await mount(<Host />, { resources: resources({ records: OFTEN }).resources, device: PRIVATE });
  await openTray();
  const chip = named('button', 'วิน ซ่อนยอดเงินอยู่');
  expect(chip.textContent).toBe('วิน฿••••');
  tap(chip);
  expect(text('add-amount')).toBe('฿••••');
});

test('the tray says while its lists load, offers Try again on a load problem and a new entry for a copy that is gone, and says when there is no wallet', async () => {
  // Online and still loading: today's words for it, in the tray, then the amount step.
  const slow = resources();
  const release = slow.hold('wallets');
  await mount(<Host />, { resources: slow.resources, diary: null });
  await openTray();
  named('dialog', 'จดรายจ่าย');
  named('progressbar', translateCopy('Loading your wallets', 'th'));
  await act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  startAnimations();
  expect(text('add-amount')).toBe('฿0');
  cleanup();
  // An opening that names its type is named for it while it loads (the second review's P12, its M8).
  const slower = resources();
  const income = slower.hold('wallets');
  await mount(<Host />, { resources: slower.resources, diary: null });
  await openTray({ type: 'income' });
  named('dialog', 'จดรายรับ');
  await act(async () => {
    income();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  cleanup();
  // A load that fails: what happened, in today's words, and Try again.
  const failing = resources();
  failing.fail('wallets', 'network');
  await mount(<Host />, { resources: failing.resources, diary: null });
  await openTray();
  expect(alertIn('add-load-problem')).toBe(translateCopy("We couldn't load your diary.", 'th'));
  tap(named('button', 'ลองอีกครั้ง'));
  await settle();
  startAnimations();
  expect(text('add-amount')).toBe('฿0');
  cleanup();
  // No wallet yet: today's words.
  await mount(<Host />, { resources: createFakeResources({ categories: BUILTINS }).resources, diary: null });
  await openTray();
  expect(text('add-no-wallet')).toBe(`${translateCopy('No wallets yet', 'th')}${translateCopy('Add a wallet on the home screen first.', 'th')}`);
  cleanup();
  // A copy of an entry that is gone: today's words, and a new entry instead.
  await mount(<Host />);
  await openTray({ copyOf: '0000000b-0000-4000-8000-0000000000ff' });
  expect(alertIn('add-load-problem')).toBe(translateCopy("This entry isn't available to copy.", 'th'));
  expect(screen.queryByRole('button', { name: 'ลองอีกครั้ง' })).toBeNull();
  tap(named('button', translateCopy('Start a new entry', 'th')));
  await settle();
  startAnimations();
  expect(text('add-amount')).toBe('฿0');
});

test('until the first touch the default category follows the recent-use read; after it, nothing moves', async () => {
  /** Travel used most among spending, and a gift most among income: what the read, once it lands, ranks first. */
  const used = [...[1, 2, 3].map((n) => record(n, {})), ...[4, 5, 6].map((n) => record(n, { type: 'income', amount_minor: '100000', wallet_id: MAIN.id, category_id: GIFT.id }))];
  /** Opens the tray while the read is held, does `first` (the first touch), then lets the read land. */
  async function touchedFirst(first: () => void) {
    const fake = resources({ records: used });
    const late = fake.hold('history');
    await mount(<Host />, { resources: fake.resources });
    await openTray();
    first();
    await act(async () => {
      late();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    startAnimations();
  }
  // A key first: spending's category stays the one shown first.
  await touchedFirst(() => press('5'));
  press('0');
  tap(named('button', 'ถัดไป'));
  expect(rowLabels()[0], 'a key first').toBe('หมวด อาหาร');
  cleanup();
  // A pick first, the wallet chip's: the same.
  await touchedFirst(() => tap(found('add-wallet')));
  tap(named('button', 'กลับ'));
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  expect(rowLabels()[0], 'a pick first').toBe('หมวด อาหาร');
  cleanup();
  // A new type first: income's category stays the one shown first.
  await touchedFirst(() => tap(radio('รายรับ')));
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  expect(rowLabels()[0], 'a new type first').toBe('หมวด เงินเดือน');
  cleanup();
  // The read lands before any touch: travel, used most, is spending's default.
  await touchedFirst(() => undefined);
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  expect(rowLabels()[0], 'no touch before the read').toBe('หมวด การเดินทาง');
});

test("a copy opens on the copied entry with its amount as a fill and today's date, and sends no kind; a closed category is left to choose, and Save says so", async () => {
  const recorded = await recordAnalytics();
  try {
    const copied = record(9, { amount_minor: '18200', wallet_id: MAIN.id, category_id: '0000000c-0000-4000-8000-0000000000c9', note: 'ข้าวกลางวัน' });
    const diary = readyDiary();
    await mount(<Host />, { resources: resources({ records: [copied] }).resources, diary: diary.diary, device: PRIVATE });
    await openTray({ copyOf: copied.id });
    // The copied amount is a fill: masked until a key is pressed (R106).
    expect([text('add-amount'), label('add-amount')]).toEqual(['฿••••', 'ซ่อนยอดเงินอยู่']);
    // The copy's type is not known when it starts.
    expect(starts(recorded.sent)).toEqual([{ source: 'typed' }]);
    tap(named('button', 'ถัดไป'));
    // The copied wallet and note, today, and its closed category left for the person to choose.
    expect(rowLabels()).toEqual([`หมวด ${translateCopy('Choose a category', 'th')}`, 'กระเป๋า บัญชีหลัก', 'วันที่ วันนี้', 'โน้ต ข้าวกลางวัน']);
    // Save says why it cannot go, in today's words, and keeps nothing.
    tap(named('button', 'บันทึก'));
    await settle();
    expect(text('add-save-problem')).toBe(translateCopy('Choose a category', 'th'));
    expect(diary.saves).toEqual([]);
    // Above Save, in the tray's pinned footer (P9e; the first review's n1, its R8).
    const [footer, problem, save] = [found('tray-footer'), found('add-save-problem'), named('button', 'บันทึก')];
    expect([footer.contains(problem), footer.contains(save), Boolean(problem.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING)]).toEqual([true, true, true]);
    // Back on the amount, the first key starts it over, and what is typed shows.
    tap(named('button', 'กลับ'));
    press('9');
    expect(text('add-amount')).toBe('฿9');
  } finally {
    recorded.restore();
  }
});

test("the host's sections come after the steps', and each opens in its state", async () => {
  // The list loads the host lazily and never imports it: the host reaches Quick add's keys, and so expo-crypto,
  // which the kit's suites that read the wallet's list cannot load (the controller's rule).
  const list = source('../../dev/catalogue/wallet/addSections.tsx');
  expect(list).toMatch(/const HostTray = lazy\(\(\) => import\('\.\/addHostSection'\)\);/);
  expect(list).not.toMatch(/AddTrayHost/);
  const ids = WALLET_SECTIONS.map((section) => section.id);
  const at = ids.indexOf('bw-tray-saving');
  expect(ids.slice(at - 1, at + 4)).toEqual(['bw-tray-pick-category', 'bw-tray-saving', 'bw-tray-unconfirmed', 'bw-tray-add-large', 'bw-saved-toast']);
  // A save in flight: Save says it is saving, and close is unavailable.
  await openSection('bw-tray-saving');
  expect(named('button', 'กำลังบันทึก…').getAttribute('aria-busy')).toBe('true');
  expect(named('button', 'ปิด').getAttribute('aria-disabled')).toBe('true');
  cleanup();
  // An answer lost: today's words and Try again, and the tray can be closed.
  await openSection('bw-tray-unconfirmed');
  expect(text('add-save-problem')).toBe(translateCopy('Not confirmed yet. Your entry is kept; try again.', 'th'));
  named('button', 'ลองอีกครั้ง');
  expect(named('button', 'ปิด').getAttribute('aria-disabled')).toBeNull();
  cleanup();
  // The tray to capture at AX5: open on the amount step, its title pinned and the switch under the amount.
  await openSection('bw-tray-add-large', { fontScale: AX5 });
  named('dialog', 'จดรายจ่าย');
  expect(within(found('tray-header')).queryByRole('radiogroup')).toBeNull();
  found('type-switch');
}, 60_000);
