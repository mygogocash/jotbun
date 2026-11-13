// The saved moment (P2-T17; bw-saved, dk-saved, rh-offline, ax-motion; W6,
// W31, R61, R65, R114; Review Focus 2 and 4): the toast with today's total and
// Undo, the rule Undo runs, and the chip that drops into the card. Each case
// mounts through mountWallet on the fakes (a ready device diary holding one
// other ฿50 draft of today unless it says otherwise), in Thai and by day unless
// it says otherwise, with a probe inside the host that keeps the latest
// useSavedToast(), so a case shows a notice as the wallet shell will from the
// add tray's onSaved (P2-T18).
//
// The traps, as the tray's tests meet them: Reanimated keeps the toast unseen
// (visibility: hidden) until its entering animation starts, which happy-dom
// never does, and queries by role skip what is unseen, so startAnimations()
// fires it once the toast has appeared. The chip's frame comes from
// react-native-web's measureInWindow, which reads getBoundingClientRect a
// moment after it is asked (a setTimeout of 0); happy-dom lays nothing out, so
// the flight's cases give the card's view a place, as CardStack's tests do, and
// keep the clock (vi.useFakeTimers) once the card has been measured. The read
// of today's total is a promise, which fake timers leave alone, so a case that
// keeps the clock lets it land with flush().
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactElement, ReactNode } from 'react';
import { AccessibilityInfo, Dimensions, Platform, View } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
// The catalogue's screen sections (the route params context), and the device's id maker (the delete's command key).
vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import type { TransactionDto, WalletSnapshot } from '@gogospend/contracts';

import { COMMON_RULES } from '@mobile/analytics/catalog';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import type { Recorded } from '@mobile/analytics/testing/recordAnalytics';
import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { translateCopy } from '@mobile/i18n/messages';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import type { OutboxCommand, PendingEntry } from '@mobile/storage/types';
import type { SyncOutcome } from '@mobile/sync/types';
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { CardFramesProvider, useRegisterCardFrame } from '../card/cardFrames';
import { STACK_PEEK } from '../card/CardStack';
import { TRAY_EXIT_MS } from '../motion/useWalletMotion';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { mountWallet } from '../testing/walletHarness';
import type { MountWalletOptions } from '../testing/walletHarness';
import { CHIP_HALF, CHIP_MARGIN, FLIGHT_MS } from './SaveFlight';
import type { SavedNotice } from './savedMoment';
import { SavedToastHost, TOAST_MS, TOTAL_WAIT_MS, useSavedToast } from './SavedToastHost';
import type { SavedToast } from './SavedToastHost';

const os = Platform.OS;
afterEach(() => {
  cleanup();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  vi.useRealTimers();
  vi.restoreAllMocks();
  probe.toast = null;
});

/** Lets the stores, the read and the phone's answer arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
/** Lets promises land while the case keeps the clock. */
const flush = () => act(async () => { for (let turn = 0; turn < 20; turn += 1) await Promise.resolve(); });
/** Moves the kept clock on. */
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
/**
 * From a save to its chip: the tray's exit, then the cards' measurements and the read of the frame, each a 0 ms timer
 * asked for as the exit ends, which a kept clock runs 1 ms later.
 */
const LANDED = TRAY_EXIT_MS + 1;

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

const text = (testID: string) => found(testID).textContent;
const label = (testID: string) => found(testID).getAttribute('aria-label');
const noUndo = () => expect(screen.queryByRole('button', { name: 'เลิกทำ' }), 'no Undo').toBeNull();
/** A source file next to this test, or nothing when it is not there yet. */
function source(file: string): string {
  const path = join(dirname(fileURLToPath(import.meta.url)), file);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
/** Each undo_used sent, without the properties every event carries. */
const undos = (sent: readonly Recorded[]) => sent
  .filter((event) => event.name === 'undo_used')
  .map(({ properties }) => Object.fromEntries(Object.entries(properties).filter(([key]) => key !== 'origin' && !(key in COMMON_RULES))));

const LOCALES = ['th', 'en'] as const;
const MODES = ['light', 'dark'] as const;
const WORDS = {
  th: { toast: 'บันทึกแล้ว · วันนี้ ฿182', spoken: 'บันทึกแล้ว · วันนี้ 182 บาท', undo: 'เลิกทำ' },
  en: { toast: 'Saved · Today ฿182', spoken: 'Saved · Today 182 baht', undo: 'Undo' },
} as const;
const PLAIN = 'บันทึกแล้ว';
const OFFLINE_WORDS = 'เก็บไว้ในเครื่องแล้ว · จะบันทึกเมื่อออนไลน์';
const UNDONE = 'เลิกทำแล้ว';
const UNDONE_DELETED = 'เลิกทำแล้ว กู้คืนได้ในรายการที่เพิ่งลบ';
const CONFLICT = 'ลบไม่ได้ รายการนี้ถูกแก้ในอีกเครื่อง';
const TODAY = todayInBangkok(new Date());

const wallet = (n: number, name: string): WalletSnapshot => ({
  id: `0000000a-0000-4000-8000-00000000000${n}`, name, currency: 'THB', opening_minor: '1000000', tracking_start: '2026-01-01', archived: false, version: 1,
});
const MAIN = wallet(1, 'บัญชีหลัก');
const CASH = wallet(2, 'เงินสด');
const WALLETS = [MAIN, CASH];
const [FOOD] = BUILTINS as [(typeof BUILTINS)[number]];
const RECORD_ID = '0000000b-0000-4000-8000-000000000050';
const COMMAND_ID = '0000000f-0000-4000-8000-000000000050';

/** A spending record of today: food from cash. */
const spent = (id: string, amount: string, more: Partial<TransactionDto> = {}): TransactionDto => ({
  id, type: 'expense', amount_minor: amount, occurred_on: TODAY, wallet_id: CASH.id, category_id: FOOD.id, note: null, merchant: null, deleted_at: null, version: 1, ...more,
} as TransactionDto);
/** bw-saved's day in Jotbun: ฿82 earlier, and the ฿50 of chicken rice just saved. */
const EARLIER = spent('0000000b-0000-4000-8000-000000000082', '8200');
const SAVED = spent(RECORD_ID, '5000', { merchant: 'ข้าวมันไก่' });
/** A draft of today kept on this phone. */
const draft = (id: string, amount: string): PendingEntry => ({
  id, type: 'expense', amount_minor: amount, occurred_on: TODAY, wallet_id: CASH.id, category_id: FOOD.id, note: null, merchant: null,
} as PendingEntry);
const queued = (payload: PendingEntry, state: OutboxCommand['state'], commandId: string): OutboxCommand => ({
  commandId, accountId: '00000000-0000-4000-8000-0000000000aa', schemaVersion: 1, kind: 'transaction.create', payload, state,
  firstTransmissionAt: state === 'unsent' ? null : `${TODAY}T03:00:00.000Z`, createdAt: `${TODAY}T03:00:00.000Z`, ackedRevision: state === 'acknowledged' ? '9' : null,
});
/** Another ฿50 of today kept on this phone, never sent: bw-saved's ฿182 counts it. */
const OTHER = queued(draft('0000000e-0000-4000-8000-000000000050', '5000'), 'unsent', '0000000f-0000-4000-8000-000000000099');
/** This save's own draft, never sent. */
const OWN = queued(draft(RECORD_ID, '5000'), 'unsent', COMMAND_ID);

const SYNCED = { status: 'synced', progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0 } as SyncOutcome;
const resources = (records: TransactionDto[] = [EARLIER, SAVED]) => createFakeResources({ wallets: WALLETS, categories: BUILTINS, records });
const readyDiary = (view: Parameters<typeof createFakeDiary>[0] = {}) => createFakeDiary({ wallets: WALLETS, categories: BUILTINS, outcome: SYNCED, outbox: [OTHER], ...view });

/** The notice the shell hands on for the ฿50 of chicken rice from cash: saved online unless told otherwise. */
const notice = (overrides: Partial<SavedNotice> = {}): SavedNotice => ({
  recordId: RECORD_ID, commandId: COMMAND_ID, kind: 'expense', title: 'ข้าวมันไก่', walletId: CASH.id, via: 'online', amountMinor: '5000', offline: false, ...overrides,
});

/** The latest useSavedToast() inside the host. */
const probe = { toast: null as SavedToast | null };
function Probe() {
  probe.toast = useSavedToast();
  return null;
}
function Host({ children }: { children?: ReactNode }) {
  return (
    <SavedToastHost>
      <Probe />
      {children}
    </SavedToastHost>
  );
}
/** A view registered under a wallet's id, as a card's is. */
function Registrar({ walletId, testID }: { walletId: string; testID: string }) {
  return <View testID={testID} ref={useRegisterCardFrame(walletId)} collapsable={false} />;
}
/** The host over a page that shows cash's card. */
const withCard = (
  <CardFramesProvider>
    <Registrar walletId={CASH.id} testID="cash-card" />
    <Host />
  </CardFramesProvider>
);

type Place = { left: number; top: number; width: number; height: number };
/** Gives elements a place in the window, as the page's layout would; anything else is at 0, 0 with no size, as happy-dom says. */
function placeViews(places: Map<Element, Place>) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function placed(this: HTMLElement) {
    const { left, top, width, height } = places.get(this) ?? { left: 0, top: 0, width: 0, height: 0 };
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  });
}

async function mount(element: ReactElement, options: MountWalletOptions = {}) {
  const view = mountWallet(element, { resources: resources().resources, diary: readyDiary().diary, ...options });
  await settle();
  return view;
}

/** The shell's show; then the read lands and the toast's entering animation starts. */
async function show(shown: SavedNotice) {
  act(() => { probe.toast?.show(shown); });
  await settle();
  await settle();
  startAnimations();
}

test("after a save the toast shows today's total and Undo, and its check is neutral", async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const at = `${locale} ${mode}`;
      const fake = resources();
      await mount(<Host />, { locale, mode, resources: fake.resources });
      await show(notice());
      const toast = found('saved-toast');
      // A polite status, which iOS also hears.
      expect([toast.getAttribute('role'), toast.getAttribute('aria-live')], at).toEqual(['status', 'polite']);
      // At full motion it slides down from the top (ax-motion's savedToast).
      expect(toast.style.animationName, at).toBe('SlideInUp');
      // bw-saved: today's money out after the save, the ฿82 and the ฿50 in Jotbun and the other ฿50 kept on this phone.
      expect(text('saved-line'), at).toBe(WORDS[locale].toast);
      expect(label('saved-line'), at).toBe(WORDS[locale].spoken);
      // The amount in DM Sans 700, inside the line.
      const amount = within(found('saved-line')).getByText('฿182');
      expect([amount.style.fontFamily, amount.style.fontWeight], at).toEqual([LATIN_UI_FONT_FAMILY, '700']);
      // One read: one page of today's expenses.
      expect(fake.callsOf('history').map((call) => call.args), at).toEqual([[{ from: TODAY, through: TODAY, type: 'expense', sort: 'date_desc' }, undefined, 200]]);
      // The toast's fill, and its check: an onToast circle with a toast-coloured tick, never the under colour.
      const colors = mode === 'dark' ? walletDark : walletLight;
      expect((found('saved-line').parentElement as HTMLElement).style.backgroundColor, at).toBe(rgba(colors.toast));
      const check = found('saved-check');
      expect(check.style.backgroundColor, at).toBe(rgba(colors.onToast));
      expect(check.querySelector('path')?.getAttribute('stroke'), at).toBe(colors.toast);
      expect([check.style.backgroundColor, check.querySelector('path')?.getAttribute('stroke')], at).not.toContain(rgba(colors.under));
      expect(check.getAttribute('aria-hidden'), at).toBe('true');
      // Undo, a link in the toast's own link colour.
      const undo = named('button', WORDS[locale].undo);
      expect(within(undo).getByText(WORDS[locale].undo).style.color, at).toBe(rgba(colors.toastLink));
      cleanup();
    }
  }
});

test("a slow total read leaves the toast saying บันทึกแล้ว after 600 ms, then today's total from the outbox as it is when the read lands", async () => {
  // The plan's 600 ms, and motion.duration.toastLong.
  expect([TOTAL_WAIT_MS, TOAST_MS]).toEqual([600, 6000]);
  const fake = resources();
  const release = fake.hold('history');
  const diary = readyDiary({ outbox: [] });
  await mount(<Host />, { resources: fake.resources, diary: diary.diary });
  vi.useFakeTimers();
  act(() => { probe.toast?.show(notice()); });
  await flush();
  tick(TOTAL_WAIT_MS - 1);
  expect(screen.queryByTestId('saved-toast')).toBeNull();
  tick(1);
  startAnimations();
  expect([text('saved-line'), label('saved-line')]).toEqual([PLAIN, PLAIN]);
  named('button', 'เลิกทำ');
  // Another ฿50 is kept on this phone while the read is on its way; the read lands a second later and counts it.
  act(() => { diary.set({ outbox: [OTHER] }); });
  tick(1000);
  release();
  await flush();
  expect([text('saved-line'), label('saved-line')]).toEqual([WORDS.th.toast, WORDS.th.spoken]);
  // A figure once shown never moves: that draft leaving the outbox afterwards changes nothing.
  act(() => { diary.set({ outbox: [] }); });
  expect(text('saved-line')).toBe(WORDS.th.toast);
  // The new words stay 6 s from when they changed.
  tick(TOAST_MS - 1);
  found('saved-toast');
  tick(1);
  expect(screen.queryByTestId('saved-toast')).toBeNull();
});

test('a total read that fails, or that holds more of today than one page, leaves บันทึกแล้ว at once', async () => {
  const failing = resources();
  failing.fail('history', 'network');
  await mount(<Host />, { resources: failing.resources });
  await show(notice());
  expect(text('saved-line')).toBe(PLAIN);
  cleanup();
  // 201 expenses today: the page holds 200 and says there are more, so a counted draft might be among the rest.
  const busy = resources(Array.from({ length: 201 }, (_, index) => spent(`0000000b-0000-4000-8000-${String(1000 + index).padStart(12, '0')}`, '100')));
  await mount(<Host />, { resources: busy.resources });
  await show(notice());
  expect(text('saved-line')).toBe(PLAIN);
});

test("offline, the toast says rh-offline's words at once, reads nothing and offers Undo", async () => {
  const fake = resources();
  await mount(<Host />, { resources: fake.resources, diary: readyDiary({ outbox: [OWN], outcome: null }).diary });
  act(() => { probe.toast?.show(notice({ via: 'device', offline: true })); });
  startAnimations();
  expect([text('saved-line'), label('saved-line')]).toEqual([OFFLINE_WORDS, OFFLINE_WORDS]);
  named('button', 'เลิกทำ');
  await settle();
  expect(fake.callsOf('history')).toEqual([]);
});

test('Undo removes a draft still on the phone, says เลิกทำแล้ว and sends one undo_used', async () => {
  const recorded = await recordAnalytics();
  try {
    const fake = resources([EARLIER]);
    const diary = readyDiary({ outbox: [OWN] });
    await mount(<Host />, { resources: fake.resources, diary: diary.diary });
    await show(notice({ via: 'device' }));
    // ฿82 in Jotbun and this ฿50 kept on the phone.
    expect(text('saved-line')).toBe('บันทึกแล้ว · วันนี้ ฿132');
    // Two taps before the first lands: one removal.
    const undo = named('button', 'เลิกทำ');
    act(() => {
      fireEvent.click(undo);
      fireEvent.click(undo);
    });
    await settle();
    expect(diary.calls.removed).toEqual([COMMAND_ID]);
    expect(fake.callsOf('deleteTransaction')).toEqual([]);
    expect([text('saved-said'), label('saved-said')]).toEqual([UNDONE, UNDONE]);
    noUndo();
    expect(undos(recorded.sent)).toEqual([{ kind: 'expense' }]);
    // Nothing of the entry reaches analytics.
    const json = JSON.stringify(recorded.sent);
    for (const secret of ['5000', '฿50', 'ข้าวมันไก่', CASH.name, RECORD_ID]) expect(json).not.toContain(secret);
  } finally {
    recorded.restore();
  }
});

test('Undo after the draft has left the phone deletes the record, which stays restorable', async () => {
  const recorded = await recordAnalytics();
  try {
    // Kept on this phone, then sent and acknowledged: its command has left the outbox, and Jotbun holds the record.
    const fake = resources();
    const diary = readyDiary({ outbox: [] });
    await mount(<Host />, { resources: fake.resources, diary: diary.diary });
    await show(notice({ via: 'device', kind: 'income' }));
    fireEvent.click(named('button', 'เลิกทำ'));
    await settle();
    expect(fake.callsOf('deleteTransaction').map((call) => call.args.slice(0, 2))).toEqual([[RECORD_ID, 1]]);
    expect(diary.calls.removed).toEqual([]);
    expect([text('saved-said'), label('saved-said')]).toEqual([UNDONE_DELETED, UNDONE_DELETED]);
    noUndo();
    // Restorable for 30 days: in Recently deleted, at its next version.
    const deleted = await fake.resources.recentlyDeleted();
    expect(deleted.items.map((item) => [item.id, item.version])).toEqual([[RECORD_ID, 2]]);
    expect(undos(recorded.sent)).toEqual([{ kind: 'income' }]);
  } finally {
    recorded.restore();
  }
});

test('Undo refused by a newer version changes nothing and says so; one already gone says so', async () => {
  const recorded = await recordAnalytics();
  try {
    // Changed on another device since the save: version 2.
    const fake = resources([EARLIER, { ...SAVED, version: 2 }]);
    await mount(<Host />, { resources: fake.resources });
    await show(notice());
    fireEvent.click(named('button', 'เลิกทำ'));
    await settle();
    expect(fake.callsOf('deleteTransaction').map((call) => call.args.slice(0, 2))).toEqual([[RECORD_ID, 1]]);
    expect(fake.records.get(RECORD_ID)?.deleted_at).toBeNull();
    expect(text('saved-said')).toBe(CONFLICT);
    noUndo();
    cleanup();
    // Deleted on another device, or not in Jotbun at all: it says the entry was already deleted.
    for (const records of [[EARLIER, { ...SAVED, deleted_at: '2026-10-24T01:00:00.000Z' }], [EARLIER]]) {
      await mount(<Host />, { resources: resources(records).resources });
      await show(notice());
      fireEvent.click(named('button', 'เลิกทำ'));
      await settle();
      expect(text('saved-said')).toBe(translateCopy('This entry was already deleted.', 'th'));
      noUndo();
      cleanup();
    }
    expect(undos(recorded.sent)).toEqual([]);
  } finally {
    recorded.restore();
  }
});

test('an unconfirmed Undo keeps its command key, so Undo again resends the same delete; another refusal ends it', async () => {
  const recorded = await recordAnalytics();
  try {
    // The delete commits, and its answer is lost.
    const fake = resources();
    fake.loseResponse('deleteTransaction');
    await mount(<Host />, { resources: fake.resources });
    await show(notice());
    fireEvent.click(named('button', 'เลิกทำ'));
    await settle();
    expect(text('saved-said')).toBe(translateCopy('Not confirmed yet. Your entry is kept; try again.', 'th'));
    expect(undos(recorded.sent)).toEqual([]);
    fireEvent.click(named('button', 'เลิกทำ'));
    await settle();
    const keys = fake.callsOf('deleteTransaction').map((call) => call.args[2]);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(text('saved-said')).toBe(UNDONE_DELETED);
    expect(undos(recorded.sent)).toEqual([{ kind: 'expense' }]);
    cleanup();
    // A refusal Jotbun answered (signed out): today's words, and nothing more to tap.
    const refused = resources();
    refused.fail('deleteTransaction', 'signed_out');
    await mount(<Host />, { resources: refused.resources });
    await show(notice());
    fireEvent.click(named('button', 'เลิกทำ'));
    await settle();
    expect(text('saved-said')).toBe(translateCopy('Sign in again to save.', 'th'));
    noUndo();
  } finally {
    recorded.restore();
  }
});

test('Undo follows the diary: none while the draft is sent or checked, or with no diary open; a removal the diary refuses says so', async () => {
  const diary = readyDiary({ outbox: [OWN] });
  await mount(<Host />, { diary: diary.diary });
  await show(notice({ via: 'device' }));
  named('button', 'เลิกทำ');
  // The sync takes the draft: being sent, it may already be in Jotbun.
  act(() => { diary.set({ outbox: [{ ...OWN, state: 'sending', firstTransmissionAt: `${TODAY}T03:00:00.000Z` }] }); });
  noUndo();
  // Acknowledged and applied: it has left the outbox, so Undo is the delete.
  act(() => { diary.set({ outbox: [] }); });
  named('button', 'เลิกทำ');
  // The diary locks: where the draft is is unknown, so nothing is offered.
  act(() => { diary.set({ phase: 'locked', outbox: [] }); });
  noUndo();
  cleanup();
  // An online save does not wait on the diary; a closed diary's drafts are not counted in its total.
  await mount(<Host />, { diary: readyDiary({ phase: 'locked', outbox: [OTHER] }).diary });
  await show(notice());
  named('button', 'เลิกทำ');
  expect(text('saved-line')).toBe('บันทึกแล้ว · วันนี้ ฿132');
  cleanup();
  // The diary refuses the removal (the draft was sent between the plan and the tap): it says so, and Undo follows it.
  const refusing = readyDiary({ outbox: [OWN] });
  refusing.diary.removeDraft = async () => {
    throw new TypeError('Only a draft that was never transmitted can be removed.');
  };
  await mount(<Host />, { diary: refusing.diary });
  await show(notice({ via: 'device' }));
  fireEvent.click(named('button', 'เลิกทำ'));
  await settle();
  expect(text('saved-said')).toBe(translateCopy("Couldn't change this device's copy. Try again.", 'th'));
  // Still a draft never sent: Undo again.
  named('button', 'เลิกทำ');
});

test('the toast leaves 6 s after its words last change, never while Undo is on its way; a newer save takes its place', async () => {
  const fake = resources();
  const hold = fake.hold('deleteTransaction');
  await mount(<Host />, { resources: fake.resources });
  vi.useFakeTimers();
  act(() => { probe.toast?.show(notice()); });
  await flush();
  startAnimations();
  expect(text('saved-line')).toBe(WORDS.th.toast);
  tick(TOAST_MS - 1);
  found('saved-toast');
  tick(1);
  expect(screen.queryByTestId('saved-toast')).toBeNull();
  // Undo on its way keeps the toast past 6 s; its answer stays 6 s more.
  act(() => { probe.toast?.show(notice()); });
  await flush();
  startAnimations();
  tick(1000);
  fireEvent.click(named('button', 'เลิกทำ'));
  tick(TOAST_MS);
  found('saved-toast');
  hold();
  await flush();
  expect(text('saved-said')).toBe(UNDONE_DELETED);
  tick(TOAST_MS - 1);
  found('saved-toast');
  tick(1);
  expect(screen.queryByTestId('saved-toast')).toBeNull();
  // A newer save takes the toast's place, and stays its own 6 s.
  act(() => { probe.toast?.show(notice()); });
  await flush();
  tick(3000);
  act(() => { probe.toast?.show(notice({ via: 'device', offline: true })); });
  startAnimations();
  expect(screen.queryAllByTestId('saved-toast')).toHaveLength(1);
  expect(text('saved-line')).toBe(OFFLINE_WORDS);
  tick(TOAST_MS - 1);
  found('saved-toast');
  tick(1);
  expect(screen.queryByTestId('saved-toast')).toBeNull();
});

test("the chip flies from the bottom to the card's top, measured again just before, once the tray has left, and is gone once it lands", async () => {
  const places = new Map<Element, Place>();
  placeViews(places);
  await mount(withCard);
  const card = found('cash-card');
  places.set(card, { left: 16, top: 300, width: 370, height: 200 });
  await settle();
  // The card moves (a reorder) with no layout: only a measurement finds it where it is now.
  places.set(card, { left: 16, top: 354, width: 370, height: 200 });
  vi.useFakeTimers();
  act(() => { probe.toast?.show(notice()); });
  // Nothing travels while the tray leaves.
  tick(TRAY_EXIT_MS - 1);
  expect(screen.queryByTestId('save-flight')).toBeNull();
  tick(LANDED - (TRAY_EXIT_MS - 1));
  const chip = found('save-flight');
  const room = Dimensions.get('window').width - 2 * CHIP_MARGIN;
  // It lands on the card's top, where the card is now: a card behind the front one shows only its top STACK_PEEK.
  expect([chip.style.left, chip.style.top, chip.style.width]).toEqual([`${16 + 370 / 2 - room / 2}px`, `${354 + STACK_PEEK / 2 - CHIP_HALF}px`, `${room}px`]);
  // It names the save and its amount, signed as spending; the toast says it, so the chip is unseen by screen readers.
  expect([text('save-flight-title'), text('save-flight-amount')]).toEqual(['ข้าวมันไก่', '−฿50']);
  expect(chip.getAttribute('aria-hidden')).toBe('true');
  // Gone once it has landed.
  tick(FLIGHT_MS - 1);
  found('save-flight');
  tick(1);
  expect(screen.queryByTestId('save-flight')).toBeNull();
  // Income lands with its plus.
  act(() => { probe.toast?.show(notice({ kind: 'income', amountMinor: '3500000', title: 'เงินเดือน' })); });
  tick(LANDED);
  expect([text('save-flight-title'), text('save-flight-amount')]).toEqual(['เงินเดือน', '+฿35,000']);
});

test('the flying chip hides its amount in private mode, and its title too, which may quote the person', async () => {
  const places = new Map<Element, Place>();
  placeViews(places);
  await mount(withCard, { device: { [PRIVATE_MODE_NAME]: '1' } });
  places.set(found('cash-card'), { left: 16, top: 300, width: 370, height: 200 });
  await settle();
  await show(notice());
  // The toast masks today's total and says it is hidden.
  expect([text('saved-line'), label('saved-line')]).toEqual(['บันทึกแล้ว · วันนี้ ฿••••', 'บันทึกแล้ว · วันนี้ ซ่อนยอดเงินอยู่']);
  vi.useFakeTimers();
  act(() => { probe.toast?.show(notice()); });
  tick(LANDED);
  expect(text('save-flight')).toBe('฿••••');
  expect(screen.queryByTestId('save-flight-title')).toBeNull();
  // Neither the amount nor the name reaches the screen.
  expect(document.body.textContent).not.toMatch(/182|50|ข้าวมันไก่/);
});

test('no flight under reduced motion, or when the card is not on screen', async () => {
  const places = new Map<Element, Place>();
  placeViews(places);
  // Reduce Motion: nothing travels; the toast still says it.
  await mount(withCard, { reducedMotion: true });
  places.set(found('cash-card'), { left: 16, top: 300, width: 370, height: 200 });
  await settle();
  vi.useFakeTimers();
  act(() => { probe.toast?.show(notice()); });
  await flush();
  tick(TRAY_EXIT_MS + 100);
  expect(screen.queryByTestId('save-flight')).toBeNull();
  // The toast still says it, fading in where it is.
  startAnimations();
  expect(found('saved-toast').style.animationName).toBe('FadeIn');
  vi.useRealTimers();
  cleanup();
  // Full motion, for a wallet whose card is not on screen: nothing travels. Cash's card flies.
  await mount(withCard);
  places.set(found('cash-card'), { left: 16, top: 300, width: 370, height: 200 });
  await settle();
  vi.useFakeTimers();
  act(() => { probe.toast?.show(notice({ walletId: MAIN.id })); });
  tick(TRAY_EXIT_MS + 100);
  expect(screen.queryByTestId('save-flight')).toBeNull();
  act(() => { probe.toast?.show(notice()); });
  tick(LANDED);
  found('save-flight');
});

test("iOS hears the toast's words, and Undo's answer", async () => {
  const announce = vi.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  // This save's own draft, whose record Jotbun lists already: counted once.
  await mount(<Host />, { diary: readyDiary({ outbox: [OWN] }).diary });
  // iOS from here on (the theme read the web's store as the mount began).
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  await show(notice({ via: 'device' }));
  expect(announce.mock.calls.map(([words]) => words)).toEqual(['บันทึกแล้ว · วันนี้ 132 บาท']);
  fireEvent.click(named('button', 'เลิกทำ'));
  await settle();
  expect(announce.mock.calls.map(([words]) => words)).toEqual(['บันทึกแล้ว · วันนี้ 132 บาท', UNDONE]);
});

test('Undo is a 44 pt control', async () => {
  await mount(<Host />);
  await show(notice());
  const undo = named('button', 'เลิกทำ');
  expect(Number.parseFloat(undo.style.minHeight)).toBeGreaterThanOrEqual(44);
  expect(Number.parseFloat(undo.style.minWidth)).toBeGreaterThanOrEqual(44);
});

test("the saved moment's sections come after the add tray's, and each opens in its state", async () => {
  // The list loads the host lazily and never imports it: the host reaches Quick add's command keys, and so expo-crypto,
  // which the kit's suites that read the wallet's list cannot load (the controller's rule).
  const list = source('../../dev/catalogue/wallet/savedSections.tsx');
  expect(list).toMatch(/const SavedScreenSection = lazy\(\(\) => import\('\.\/savedScreens'\)\);/);
  expect(list).not.toMatch(/SavedToastHost/);
  const ids = WALLET_SECTIONS.map((section) => section.id);
  const at = ids.indexOf('bw-saved-toast');
  expect(ids.slice(at - 1, at + 5)).toEqual(['bw-tray-add-large', 'bw-saved-toast', 'bw-saved-offline', 'bw-saved-private', 'bw-saved-undone', 'bw-wallets']);
  const states = [
    ['bw-saved-toast', 'saved-line', WORDS.th.toast, true],
    ['bw-saved-offline', 'saved-line', OFFLINE_WORDS, true],
    ['bw-saved-private', 'saved-line', 'บันทึกแล้ว · วันนี้ ฿••••', true],
    ['bw-saved-undone', 'saved-said', UNDONE_DELETED, false],
  ] as const;
  for (const [id, line, words, undo] of states) {
    const section = WALLET_SECTIONS.find((each) => each.id === id);
    mountWallet(<>{section?.render()}</>, { diary: null });
    // The section's script runs its steps, then the stage says ready, or where it stopped.
    await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
    expect(screen.queryByTestId('catalogue-screen-ready'), id).not.toBeNull();
    startAnimations();
    expect(text(line), id).toBe(words);
    expect(screen.queryByRole('button', { name: 'เลิกทำ' }) !== null, id).toBe(undo);
    // A heading of its own (the screen-reader suite's rule), never the section's title.
    named('heading', 'สวัสดี');
    cleanup();
  }
}, 60_000);
