// The Bun Wallet's record (plan P2-T26; bw-record, rh-actions, rh-undo): the
// plan's seven cases, in Thai and English (and light and dark where they draw
// colour), then the rules the screen keeps from today's record and the parts
// the board draws: income and moves, the tile and the wallet's swatch, a
// frozen delete, an undo whose answer never came, the undo bar's time and its
// screen-reader rule, a record deleted elsewhere, load problems, a delete on
// its way, one tray at a time (R69), no event of its own (R61), the largest
// text size, and the catalogue's sections on their own fakes. Everything
// mounts through mountWallet on the fakes, on bw-record's entry: ฿50.00 of
// chicken rice from the main account on Saturday 24 October 2026, with its
// note, at version 3.
//
// The traps: Reanimated keeps a tray's card unseen (visibility: hidden) until
// its entering animation starts, which happy-dom never does, and queries by
// role skip what is unseen, so startAnimations() fires it after a tray opens.
// A tray leaves in 220 ms, then says it has gone (onClosed). Each
// startEditing() is counted by a stand-in around the real hook: P2-T27's tray
// is what will show the edit. The undo bar's time is read from the timer it
// sets, and react-native-web says a screen reader always runs, so a case that
// needs the time answers for the phone. Today's receipt section stands in as
// a button that says what it was given, as RecordReceiptReload.render.test.tsx
// does for today's record. Every lookup asserts one match, so a missing
// element fails on an AssertionError.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AccessibilityInfo, Platform } from 'react-native';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('@mobile/lib/hapticMoment', () => ({ playHaptic: vi.fn() }));
vi.mock('@mobile/screens/redesign/import/RecordReceipt', async () => {
  const { createElement } = await import('react');
  const { Pressable, Text } = await import('react-native');
  return {
    RecordReceipt: ({ recordId, version, attachmentId, onChanged }: { recordId: string; version: number; attachmentId?: string | null; onChanged?: (version: number) => void }) =>
      createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Receipt changed', onPress: () => onChanged?.(version + 1) },
        createElement(Text, null, `receipt of ${recordId} at ${version} holding ${String(attachmentId)}`)),
  };
});

// The real record rules, with each startEditing() counted.
const edits = vi.hoisted(() => ({ started: 0 }));
vi.mock('@mobile/screens/redesign/record/recordActions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mobile/screens/redesign/record/recordActions')>();
  return {
    ...actual,
    useRecordActions: (input: Parameters<typeof actual.useRecordActions>[0]) => {
      const state = actual.useRecordActions(input);
      return {
        ...state,
        startEditing: () => {
          edits.started += 1;
          state.startEditing();
        },
      };
    },
  };
});

// react-native-web drops numberOfLines and the other clamps from the DOM, so
// the props that reach the app's Text are recorded and the real one renders.
const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('@mobile/theme/AppText', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mobile/theme/AppText')>();
  const { createElement, forwardRef } = await import('react');
  const Text = forwardRef<unknown, Record<string, unknown>>(function RecordedText(props, ref) {
    seen.props.push(props);
    return createElement(actual.Text as never, { ...props, ref });
  });
  return { ...actual, Text };
});

import type { CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { translateCopy } from '@mobile/i18n/messages';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import type { OutboxCommand, OutboxState, PendingEntry } from '@mobile/storage/types';
import { motion } from '@mobile/theme/motion';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { AddTrayHost } from '../add/AddTrayHost';
import { glyphShapes } from '../looks/categoryGlyphs';
import type { GlyphKey } from '../looks/categoryGlyphs';
import { HIDDEN_AMOUNT } from '../money/walletMoney';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { AX5, mountWallet } from '../testing/walletHarness';
import type { MountWalletOptions } from '../testing/walletHarness';
import { WalletRecordScreen } from './WalletRecordScreen';
import { WalletUndoBar } from './WalletUndoBar';

const os = Platform.OS;
beforeEach(() => {
  edits.started = 0;
  vi.mocked(playHaptic).mockClear();
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  router.canGoBack.mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  seen.props.length = 0;
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
});

const LOCALES = ['th', 'en'] as const;
const MODES = ['light', 'dark'] as const;
const PALETTE = { light: walletLight, dark: walletDark } as const;
const PRIVATE = { [PRIVATE_MODE_NAME]: '1' } as const;
type Locale = (typeof LOCALES)[number];

/** Saturday 24 October 2026, 10:00 in Bangkok: bw-record's day. */
const NOW = new Date('2026-10-24T03:00:00Z');

const wallet = (index: number, name: string): WalletSnapshot => ({
  id: `0000000a-0000-4000-8000-0000000007${String(index).padStart(2, '0')}`, name, currency: 'THB', opening_minor: '0', tracking_start: '2026-01-01', archived: false, version: 1,
});
/** Its derived material is paper; a kept look says otherwise. */
const MAIN = wallet(1, 'บัญชีหลัก');
const CASH = wallet(2, 'เงินสด');
const WALLETS = [MAIN, CASH];
const [FOOD, , , SALARY] = BUILTINS as [CategoryDto, CategoryDto, CategoryDto, CategoryDto];

/** bw-record's entry, at version 3: a delete sends 3 and its undo the 4 the delete returns. */
const LUNCH: TransactionDto = {
  id: '0000000b-0000-4000-8000-000000000701', type: 'expense', amount_minor: '5000', occurred_on: '2026-10-24', wallet_id: MAIN.id,
  category_id: FOOD.id, merchant: 'ข้าวมันไก่', note: 'กับเพื่อนที่ออฟฟิศ', deleted_at: null, version: 3,
} as TransactionDto;
/** Income, with no merchant or note. */
const PAY: TransactionDto = {
  id: '0000000b-0000-4000-8000-000000000702', type: 'income', amount_minor: '2800000', occurred_on: '2026-10-23', wallet_id: MAIN.id,
  category_id: SALARY.id, merchant: null, note: null, deleted_at: null, version: 1,
} as TransactionDto;
/** Money moved from cash to the main account. */
const MOVE: TransactionDto = {
  id: '0000000b-0000-4000-8000-000000000703', type: 'transfer', amount_minor: '150000', occurred_on: '2026-10-22', source_wallet_id: CASH.id,
  destination_wallet_id: MAIN.id, merchant: null, note: null, deleted_at: null, version: 1,
} as TransactionDto;
/** An expense whose category this phone does not know. */
const UNKNOWN: TransactionDto = { ...LUNCH, id: '0000000b-0000-4000-8000-000000000704', category_id: '0000000c-0000-4000-8000-0000000007ff', merchant: null, note: null } as TransactionDto;

/** The draft of bw-record's entry on this phone, in `state`. */
function draft(state: OutboxState, n: number): OutboxCommand {
  const payload = {
    id: `0000000e-0000-4000-8000-00000000070${n}`, type: 'expense', amount_minor: '5000', occurred_on: '2026-10-24', wallet_id: MAIN.id,
    category_id: FOOD.id, merchant: 'ข้าวมันไก่', note: 'กับเพื่อนที่ออฟฟิศ',
  } as PendingEntry;
  return {
    commandId: `0000000f-0000-4000-8000-00000000070${n}`, accountId: '00000000-0000-4000-8000-0000000000aa', schemaVersion: 1, kind: 'transaction.create', payload, state,
    firstTransmissionAt: state === 'unsent' ? null : '2026-10-24T02:00:00.000Z', createdAt: '2026-10-24T02:00:00.000Z', ackedRevision: null,
  };
}

/** The words each case looks for: the draft tables' (Thai first) and dateStep's. Today's words come through translateCopy. */
const WORDS = {
  th: {
    edit: 'แก้ไข', copyToday: 'ทำซ้ำวันนี้', delete: 'ลบ', more: 'ตัวเลือกเพิ่มเติม', back: 'กลับ', close: 'ปิด', undo: 'เลิกทำ',
    status: 'สถานะ', wallet: 'กระเป๋า', category: 'หมวด', note: 'โน้ต', food: 'อาหาร', salary: 'เงินเดือน', date: 'เสาร์ 24 ต.ค. 2569',
    baht: '50 บาท', pay: '28,000 บาท', hidden: 'ซ่อนยอดเงินอยู่', noteHidden: 'ซ่อนอยู่', today: 'วันนี้',
    editRow: 'แก้ไข ยอด หมวด กระเป๋า วันที่ หรือโน้ต', copyRow: (amount: string) => `ทำซ้ำ จดใหม่เป็นของวันนี้ ${amount}`, deleteRow: 'ลบ กู้คืนได้ภายใน 30 วัน',
    deletedBar: 'ลบ ข้าวมันไก่ ฿50 แล้ว', deletedBarHidden: 'ลบ อาหาร แล้ว', daysLeft: 'เหลือ 30 วัน', lastDay: 'วันสุดท้ายที่กู้คืนได้',
  },
  en: {
    edit: 'Edit', copyToday: 'Again today', delete: 'Delete', more: 'More options', back: 'Back', close: 'Close', undo: 'Undo',
    status: 'Status', wallet: 'Wallet', category: 'Category', note: 'Note', food: 'Food', salary: 'Salary', date: 'Sat 24 Oct 2026',
    baht: '50 baht', pay: '28,000 baht', hidden: 'Amount hidden', noteHidden: 'Hidden', today: 'Today',
    editRow: 'Edit Amount, category, wallet, date or note', copyRow: (amount: string) => `Log it again A new entry for today ${amount}`, deleteRow: 'Delete You can restore it for 30 days',
    deletedBar: 'Deleted ข้าวมันไก่ ฿50', deletedBarHidden: 'Deleted Food', daysLeft: '30 days left', lastDay: 'Last day to restore',
  },
} as const;

/** Today's words, as the catalogs say them in this language. */
const tc = (english: string, locale: Locale) => translateCopy(english, locale);
const NOT_CONFIRMED = 'Not confirmed yet. Your entry is kept; try again.';
/** How long a catalogue section's lazy import may take under load: inside the case's 30 s. */
const LAZY = 10_000;
/** The saved check on the status row (§5.3: neutral). */
const CHECK = 'path[d="M5 12.5l4.5 4.5L19 7.5"]';

// Every lookup takes the queryAll form and asserts one match, so a missing or doubled element fails on an
// AssertionError, never a TestingLibraryElementError (a closing tray's Modal stays in the DOM for its exit).

/** The one element with this role and name. */
function named(role: string, name: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
  const elements = within(inside).queryAllByRole(role, { name });
  expect(elements, `one ${role} named ${name}`).toHaveLength(1);
  return elements[0] as HTMLElement;
}

/** The one element with this test id. */
function found(testID: string): HTMLElement {
  const elements = screen.queryAllByTestId(testID);
  expect(elements, `one testID ${testID}`).toHaveLength(1);
  return elements[0] as HTMLElement;
}

/** The one element showing these words. */
function shown(words: string | RegExp, inside: HTMLElement = document.body): HTMLElement {
  const elements = within(inside).queryAllByText(words);
  expect(elements, `one text "${words}"`).toHaveLength(1);
  return elements[0] as HTMLElement;
}

/** Nothing with this role and name is drawn. */
function absent(role: string, name: string | RegExp) {
  expect(screen.queryAllByRole(role, { name }), `no ${role} named ${name}`).toHaveLength(0);
}

/** Waits for the one element with this role and name. */
async function findNamed(role: string, name: string | RegExp, inside: HTMLElement = document.body): Promise<HTMLElement> {
  let matched: HTMLElement | null = null;
  await waitFor(() => {
    matched = named(role, name, inside);
  });
  return matched!;
}

/** Waits for the one element showing these words. */
async function findShown(words: string): Promise<HTMLElement> {
  let matched: HTMLElement | null = null;
  await waitFor(() => {
    matched = shown(words);
  });
  return matched!;
}

/** Waits for the one element with this test id: waitFor's second by default, longer for a lazy import (LAZY). */
async function findFound(testID: string, timeout = 1000): Promise<HTMLElement> {
  let matched: HTMLElement | null = null;
  await waitFor(() => {
    matched = found(testID);
  }, { timeout });
  return matched!;
}

/** Lets the stores, the lists and the phone's answers arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
/** Lets time pass, such as a tray's exit (220 ms). */
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

/** Starts the entering animations, as a browser does a frame after they mount. */
function startAnimations() {
  act(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[style*="visibility: hidden"]')) node.dispatchEvent(new Event('animationstart'));
  });
}

/** A tap, then whatever it opened shows. */
function tap(element: HTMLElement) {
  fireEvent.click(element);
  startAnimations();
}

/** Every live region inside `container`: what a screen reader reads out as it changes. */
function liveRegions(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[aria-live], [role="status"], [role="alert"]')];
}

/** The phone's answer to whether a screen reader runs (react-native-web always says yes). */
function screenReader(on: boolean) {
  vi.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(() => Promise.resolve(on));
}

type TimerSpy = { mock: { calls: readonly (readonly unknown[])[]; results: readonly { value: unknown }[] } };

/** The timers set for the undo bar's time (toastLong), each to run at once, with its id. */
function barTimers(timers: TimerSpy): { run: () => void; id: unknown }[] {
  return timers.mock.calls.flatMap((call, index) => (call[1] === motion.duration.toastLong ? [{ run: call[0] as () => void, id: timers.mock.results[index]?.value }] : []));
}

/** The glyph's drawn paths, as CategoryGlyph draws them. */
const pathsOf = (key: GlyphKey) => glyphShapes(key).flatMap((shape) => ('d' in shape ? [shape.d] : []));
const tilePaths = (testID: string) => [...found(testID).querySelectorAll('path')].map((path) => path.getAttribute('d'));

type Mount = { records?: TransactionDto[]; locale?: Locale; mode?: 'light' | 'dark'; id?: string } & Omit<MountWalletOptions, 'resources' | 'locale' | 'mode'>;

/** The record screen on the fakes, outside an add tray host (today's routes). */
function mount(options: Mount = {}) {
  const { records = [LUNCH], locale = 'th', mode = 'light', id = LUNCH.id, ...rest } = options;
  const fake = createFakeResources({ wallets: WALLETS, categories: BUILTINS, records });
  const mounted = mountWallet(<WalletRecordScreen id={id} now={NOW} />, { resources: fake.resources, locale, mode, ...rest });
  return { fake, mounted };
}

/** The same, inside an add tray host (as the wallet shell will mount it, P2-T18). */
function mountInHost(options: Mount = {}) {
  const { records = [LUNCH], locale = 'th', mode = 'light', id = LUNCH.id, ...rest } = options;
  const fake = createFakeResources({ wallets: WALLETS, categories: BUILTINS, records });
  const diary = createFakeDiary({ wallets: WALLETS, categories: BUILTINS });
  const mounted = mountWallet(<AddTrayHost><WalletRecordScreen id={id} now={NOW} /></AddTrayHost>, { resources: fake.resources, diary: diary.diary, locale, mode, ...rest });
  return { fake, mounted };
}

/** Opens the actions tray from more, and returns its dialog. */
async function openActions(locale: Locale, title = 'ข้าวมันไก่'): Promise<HTMLElement> {
  tap(await findNamed('button', WORDS[locale].more));
  return findNamed('dialog', title);
}

// ---------------------------------------------------------------------------
// The plan's seven cases

test('the record shows its amount exactly, its facts and no time (฿50.00, เสาร์ 24 ต.ค. 2569)', async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const words = WORDS[locale];
      const colors = PALETTE[mode];
      const { mounted } = mount({ locale, mode });
      await findNamed('heading', 'ข้าวมันไก่');
      const amount = found('wallet-record-amount');
      expect([amount.textContent, amount.getAttribute('aria-label'), amount.style.fontSize, amount.style.color], `${locale} ${mode}: the amount`).toEqual(['฿50.00', `${tc('Expense', locale)} ${words.baht}`, '44px', rgba(colors.ink)]);
      shown(words.date);
      // Status, wallet, category and note, in that order: no merchant row (it is the title) and no จดจาก row (W35).
      const facts = found('wallet-record-facts');
      expect(facts.textContent, `${locale} ${mode}: the facts`).toBe(`${words.status}${tc('Saved', locale)}${words.wallet}บัญชีหลัก${words.category}${words.food}${words.note}กับเพื่อนที่ออฟฟิศ`);
      expect(facts.querySelectorAll(CHECK), `${locale} ${mode}: the saved check`).toHaveLength(1);
      // Each fact is read as one: its label, then its value.
      expect([...facts.querySelectorAll('[aria-label]')].map((row) => row.getAttribute('aria-label')), `${locale} ${mode}: read as`).toEqual([
        `${words.status} ${tc('Saved', locale)}`, `${words.wallet} บัญชีหลัก`, `${words.category} ${words.food}`, `${words.note} กับเพื่อนที่ออฟฟิศ`,
      ]);
      expect(tilePaths('wallet-record-tile'), `${locale} ${mode}: the category's tile`).toEqual(pathsOf('food'));
      // No time anywhere (W12).
      expect(mounted.container.textContent, `${locale} ${mode}: no time`).not.toMatch(/\d{1,2}:\d{2}/);
      // The amount ghosted large behind: art, never read.
      const ghost = found('wallet-record-ghost');
      expect([ghost.getAttribute('aria-hidden'), ghost.textContent], `${locale} ${mode}: the ghost`).toEqual(['true', '฿50.00']);
      for (const name of [words.back, words.more, words.edit, words.copyToday, words.delete]) named('button', name);
      expect(found('wallet-record-screen').style.backgroundColor, `${locale} ${mode}: the page`).toBe(rgba(colors.ground));
      expect(facts.style.backgroundColor, `${locale} ${mode}: the card`).toBe(rgba(colors.card));
      cleanup();
    }
  }
});

test('ทำซ้ำวันนี้ opens the add tray copying this record; from the tray, once the tray has gone (R69)', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    const { fake } = mountInHost({ locale });
    tap(await findNamed('button', words.copyToday));
    await settle();
    startAnimations();
    // Quick add's copy: the copied amount as a fill, read from this record.
    expect(found('add-amount').textContent, `${locale}: the copy`).toBe('฿50');
    expect(fake.callsOf('transaction').map((call) => call.args[0]), `${locale}: the reads`).toEqual([LUNCH.id, LUNCH.id]);
    cleanup();

    mountInHost({ locale });
    const tray = await openActions(locale);
    tap(named('button', words.copyRow(words.baht), tray));
    // The actions tray is leaving: the add tray waits for it to go.
    expect(screen.queryAllByTestId('add-amount'), `${locale}: not while the tray leaves`).toHaveLength(0);
    await wait(300);
    startAnimations();
    expect(found('add-amount').textContent, `${locale}: the copy from the tray`).toBe('฿50');
    expect(screen.queryAllByRole('dialog', { name: 'ข้าวมันไก่' }), `${locale}: the actions tray has gone`).toHaveLength(0);
    cleanup();
  }
  // Outside a host (today's routes, until the wallet shell, P2-T18): today's Quick add, copying this record.
  mount();
  tap(await findNamed('button', WORDS.th.copyToday));
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/spend/add', params: { copyOf: LUNCH.id } });
});

test('ลบ deletes, and Undo restores with the version the delete returned', async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const words = WORDS[locale];
      const colors = PALETTE[mode];
      const { fake } = mount({ locale, mode });
      tap(await findNamed('button', words.delete));
      const bar = await findFound('wallet-undo-bar');
      expect([bar.getAttribute('role'), bar.getAttribute('aria-live'), bar.style.backgroundColor], `${locale} ${mode}: the bar`).toEqual(['status', 'polite', rgba(colors.toast)]);
      expect(shown(words.deletedBar, bar).style.color, `${locale} ${mode}: its words`).toBe(rgba(colors.onToast));
      expect(fake.callsOf('deleteTransaction'), `${locale} ${mode}: one delete`).toHaveLength(1);
      const [removal] = fake.callsOf('deleteTransaction');
      expect(removal.args.slice(0, 2), `${locale} ${mode}: the delete`).toEqual([LUNCH.id, 3]);
      // Deleted here: the facts stay for reference, and nothing acts on the entry but Undo.
      found('wallet-record-facts');
      for (const name of [words.edit, words.copyToday, words.delete, words.more]) absent('button', name);
      tap(named('button', words.undo, bar));
      await findNamed('button', words.edit);
      expect(fake.callsOf('restoreTransaction'), `${locale} ${mode}: one undo`).toHaveLength(1);
      const [undo] = fake.callsOf('restoreTransaction');
      expect(undo.args.slice(0, 2), `${locale} ${mode}: the undo`).toEqual([LUNCH.id, 4]);
      expect(undo.args[2], `${locale} ${mode}: its own key`).not.toBe(removal.args[2]);
      expect(screen.queryAllByTestId('wallet-undo-bar'), `${locale} ${mode}: the bar goes`).toHaveLength(0);
      cleanup();
    }
  }
});

test('the actions tray offers edit, copy and delete in 66 pt rows', async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const words = WORDS[locale];
      mount({ locale, mode });
      const tray = await openActions(locale);
      const rows = [words.editRow, words.copyRow(words.baht), words.deleteRow].map((name) => named('button', name, tray));
      expect(rows.map((row) => row.style.minHeight), `${locale} ${mode}: the rows`).toEqual(['66px', '66px', '66px']);
      // The header: the tile, the title (named once, by the tray), the entry's wallet and day, and its amount
      // (28 pt) above the copy row's (13 pt).
      expect(tilePaths('record-actions-tile'), `${locale} ${mode}: the tile`).toEqual(pathsOf('food'));
      expect(shown('ข้าวมันไก่', tray).closest('[aria-hidden="true"]'), `${locale} ${mode}: the drawn title is not read twice`).not.toBeNull();
      shown(`บัญชีหลัก · ${words.today}`, tray);
      expect(within(tray).queryAllByText('฿50').map((amount) => amount.style.fontSize), `${locale} ${mode}: the amounts`).toEqual(['28px', '13px']);
      named('button', words.close, tray);
      cleanup();
    }
  }
});

test('from the tray, แก้ไข starts the edit once the tray has gone, ลบ deletes at once, and closing it does nothing', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    // The page's own แก้ไข starts the edit at once (P2-T27's tray shows it).
    mount({ locale });
    tap(await findNamed('button', words.edit));
    expect(edits.started, `${locale}: the page's แก้ไข`).toBe(1);
    cleanup();
    edits.started = 0;

    const { fake } = mount({ locale });
    let tray = await openActions(locale);
    tap(named('button', words.editRow, tray));
    expect(edits.started, `${locale}: not while the tray leaves`).toBe(0);
    await wait(300);
    expect(edits.started, `${locale}: once it has gone`).toBe(1);
    // Closed without a choice: nothing happens.
    tray = await openActions(locale);
    tap(named('button', words.close, tray));
    await wait(300);
    expect([edits.started, fake.callsOf('deleteTransaction').length], `${locale}: closed`).toEqual([1, 0]);
    tray = await openActions(locale);
    tap(named('button', words.deleteRow, tray));
    expect(fake.callsOf('deleteTransaction'), `${locale}: the delete`).toHaveLength(1);
    expect(fake.callsOf('deleteTransaction')[0].args.slice(0, 2), `${locale}: its version`).toEqual([LUNCH.id, 3]);
    // Undone, the record is live again, and the tray stays closed.
    tap(named('button', words.undo, await findFound('wallet-undo-bar')));
    await findNamed('button', words.edit);
    startAnimations();
    expect(screen.queryAllByRole('dialog', { name: 'ข้าวมันไก่' }), `${locale}: the tray stays closed`).toHaveLength(0);
    cleanup();
    edits.started = 0;
  }
});

test('a draft never sent can be removed and one that needs a look discarded; neither can be edited', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    const unsent = draft('unsent', 1);
    const review = draft('needs_review', 2);
    const checking = draft('uncertain', 3);
    const diary = createFakeDiary({ wallets: WALLETS, categories: BUILTINS, outbox: [unsent, review, checking] });

    const { fake } = mount({ locale, id: unsent.payload.id, diary: diary.diary });
    await findNamed('heading', 'ข้าวมันไก่');
    const facts = found('wallet-record-facts');
    expect(facts.textContent, `${locale}: saving`).toContain(`${words.status}${tc('Saving…', locale)}`);
    expect(facts.querySelectorAll(CHECK), `${locale}: no saved check`).toHaveLength(0);
    for (const name of [words.edit, words.more]) absent('button', name);
    // A draft is copied as today's is (outside a host, today's Quick add with copyOf).
    tap(named('button', words.copyToday));
    expect(router.push, `${locale}: the copy`).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/spend/add', params: { copyOf: unsent.payload.id } });
    absent('button', tc('Discard', locale));
    tap(named('button', tc('Remove', locale)));
    await waitFor(() => expect(diary.calls.removed, `${locale}: removed`).toEqual([unsent.commandId]));
    expect(router.back, `${locale}: back after the remove`).toHaveBeenCalledTimes(1);
    expect([fake.callsOf('transaction').length, fake.callsOf('deleteTransaction').length], `${locale}: from the phone`).toEqual([0, 0]);
    cleanup();

    mount({ locale, id: review.payload.id, diary: diary.diary });
    await findNamed('heading', 'ข้าวมันไก่');
    expect(found('wallet-record-facts').textContent, `${locale}: needs a look`).toContain(`${words.status}${tc('Needs a look', locale)}`);
    for (const name of [words.edit, words.more, tc('Remove', locale)]) absent('button', name);
    tap(named('button', tc('Discard', locale)));
    await waitFor(() => expect(diary.calls.discarded, `${locale}: discarded`).toEqual([review.commandId]));
    cleanup();

    // One being checked can only wait (and be copied).
    mount({ locale, id: checking.payload.id, diary: diary.diary });
    await findNamed('heading', 'ข้าวมันไก่');
    expect(found('wallet-record-facts').textContent, `${locale}: checking`).toContain(`${words.status}${tc('Checking with Jotbun', locale)}`);
    for (const name of [words.edit, words.more, tc('Remove', locale), tc('Discard', locale)]) absent('button', name);
    named('button', words.copyToday);
    cleanup();
    router.back.mockReset();
    router.push.mockReset();
  }
});

test("private mode hides the record's amount and the ghost, and draws none of the person's words", async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const words = WORDS[locale];
      const { mounted } = mount({ locale, mode, device: PRIVATE });
      // The title is the category's name: the merchant may be Bun's words (R114).
      await findNamed('heading', words.food);
      const amount = found('wallet-record-amount');
      expect([amount.textContent, amount.getAttribute('aria-label')], `${locale} ${mode}: the amount`).toEqual([HIDDEN_AMOUNT, `${tc('Expense', locale)} ${words.hidden}`]);
      expect(found('wallet-record-ghost').textContent, `${locale} ${mode}: the ghost`).toBe(HIDDEN_AMOUNT);
      const facts = found('wallet-record-facts');
      expect(facts.textContent, `${locale} ${mode}: the note`).toContain(`${words.note}${words.noteHidden}`);
      expect(facts.querySelectorAll(`[aria-label="${words.note} ${words.noteHidden}"]`), `${locale} ${mode}: the note, read`).toHaveLength(1);
      const tray = await openActions(locale, words.food);
      named('button', words.copyRow(words.hidden), tray);
      for (const text of [document.body.textContent ?? '', mounted.container.textContent ?? '']) {
        expect(text, `${locale} ${mode}: ฿ and a digit`).not.toMatch(/฿\s*\d/);
        expect(text, `${locale} ${mode}: the merchant`).not.toContain('ข้าวมันไก่');
        expect(text, `${locale} ${mode}: the note`).not.toContain('กับเพื่อนที่ออฟฟิศ');
      }
      // A delete's undo bar names the entry without its amount, on screen and in every live region.
      tap(named('button', words.deleteRow, tray));
      const bar = await findFound('wallet-undo-bar');
      shown(words.deletedBarHidden, bar);
      for (const region of liveRegions(mounted.container)) expect(region.textContent, `${locale} ${mode}: a live region`).not.toMatch(/฿\s*\d|50/);
      cleanup();
    }
  }
});

test('every action and row is at least 44 pt', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    mount({ locale });
    await findNamed('button', words.edit);
    for (const name of [words.back, words.more]) {
      const button = named('button', name);
      expect([button.style.width, button.style.height], `${locale}: ${name}`).toEqual(['44px', '44px']);
    }
    for (const name of [words.edit, words.copyToday, words.delete]) expect(named('button', name).style.minHeight, `${locale}: ${name}`).toBe('52px');
    const tray = await openActions(locale);
    for (const name of [words.editRow, words.copyRow(words.baht), words.deleteRow]) expect(named('button', name, tray).style.minHeight, `${locale}: ${name}`).toBe('66px');
    const close = named('button', words.close, tray);
    expect([close.style.width, close.style.height], `${locale}: close`).toEqual(['44px', '44px']);
    tap(named('button', words.deleteRow, tray));
    const bar = await findFound('wallet-undo-bar');
    expect(named('button', words.undo, bar).style.minHeight, `${locale}: undo`).toBe('44px');
    cleanup();
    // A draft's buttons too.
    const unsent = draft('unsent', 4);
    mount({ locale, id: unsent.payload.id, diary: createFakeDiary({ wallets: WALLETS, categories: BUILTINS, outbox: [unsent] }).diary });
    for (const name of [words.copyToday, tc('Remove', locale)]) expect((await findNamed('button', name)).style.minHeight, `${locale}: ${name}`).toBe('52px');
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// The parts the board draws

test("income is violet with its plus, a move names both wallets and no category, and the tile is the category's, the move's or the initial", async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const words = WORDS[locale];
      const colors = PALETTE[mode];
      mount({ locale, mode, records: [PAY], id: PAY.id });
      // No merchant: the title is the category's name.
      await findNamed('heading', words.salary);
      const amount = found('wallet-record-amount');
      expect([amount.textContent, amount.style.color, amount.getAttribute('aria-label')], `${locale} ${mode}: income`).toEqual(['+฿28,000.00', rgba(colors.violet), `${tc('Income', locale)} ${words.pay}`]);
      expect(tilePaths('wallet-record-tile'), `${locale} ${mode}: income's tile`).toEqual(pathsOf('salary'));
      // No note, no note row.
      expect(found('wallet-record-facts').textContent, `${locale} ${mode}: income's facts`).toBe(`${words.status}${tc('Saved', locale)}${words.wallet}บัญชีหลัก${words.category}${words.salary}`);
      const tray = await openActions(locale, words.salary);
      expect(within(tray).queryAllByText('+฿28,000').map((each) => each.style.color), `${locale} ${mode}: in the tray`).toEqual([rgba(colors.violet), rgba(colors.violet)]);
      cleanup();

      mount({ locale, mode, records: [MOVE], id: MOVE.id });
      await findNamed('heading', tc('Transfer', locale));
      expect(found('wallet-record-amount').textContent, `${locale} ${mode}: a move`).toBe('฿1,500.00');
      expect(found('wallet-record-facts').textContent, `${locale} ${mode}: a move's facts`).toBe(`${words.status}${tc('Saved', locale)}${words.wallet}เงินสด → บัญชีหลัก`);
      expect(screen.queryAllByTestId('wallet-record-swatch'), `${locale} ${mode}: no swatch for two wallets`).toHaveLength(0);
      expect(tilePaths('wallet-record-tile'), `${locale} ${mode}: a move's tile`).toEqual(pathsOf('transfer'));
      cleanup();

      mount({ locale, mode, records: [UNKNOWN], id: UNKNOWN.id });
      await findNamed('heading', tc('Category', locale));
      const tile = found('wallet-record-tile');
      expect([tile.textContent, tile.querySelectorAll('path').length], `${locale} ${mode}: an unknown category's tile`).toEqual([tc('Category', locale).charAt(0), 0]);
      cleanup();
    }
  }
});

test("the wallet's swatch is its kept look, else the one derived from its id", async () => {
  for (const mode of MODES) {
    mount({ mode, account: { looks: JSON.stringify({ [MAIN.id]: { kind: 'bank', material: 'peach', face: 'smile' } }) } });
    await findNamed('button', WORDS.th.edit);
    await settle();
    expect(found('wallet-record-swatch').querySelector('linearGradient')?.getAttribute('id'), `${mode}: kept`).toBe(`wallet-material-peach-${mode}`);
    cleanup();
    mount({ mode });
    await findNamed('button', WORDS.th.edit);
    await settle();
    expect(found('wallet-record-swatch').querySelector('linearGradient')?.getAttribute('id'), `${mode}: derived`).toBe(`wallet-material-paper-${mode}`);
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// Today's rules, in the wallet look

test('an unconfirmed delete is frozen: only Try again, which resends the same delete', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    const { fake } = mount({ locale });
    fake.loseResponse('deleteTransaction');
    tap(await findNamed('button', words.delete));
    await findShown(tc(NOT_CONFIRMED, locale));
    for (const name of [words.edit, words.copyToday, words.delete, words.more]) absent('button', name);
    tap(named('button', tc('Try again', locale)));
    await findFound('wallet-undo-bar');
    expect(fake.callsOf('deleteTransaction'), `${locale}: two sends`).toHaveLength(2);
    const [first, second] = fake.callsOf('deleteTransaction');
    expect(second.args, `${locale}: the same command`).toEqual(first.args);
    cleanup();
  }
});

test('the undo bar goes after its time, and the page then says the entry was deleted', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    screenReader(false);
    const timers = vi.spyOn(globalThis, 'setTimeout');
    mount({ locale });
    tap(await findNamed('button', words.delete));
    await findFound('wallet-undo-bar');
    await settle();
    expect(screen.queryAllByText(tc('Entry deleted', locale)), `${locale}: not while the bar shows`).toHaveLength(0);
    const dismissals = barTimers(timers);
    expect(dismissals, `${locale}: one toastLong`).toHaveLength(1);
    act(() => dismissals[0].run());
    expect(screen.queryAllByTestId('wallet-undo-bar'), `${locale}: gone`).toHaveLength(0);
    shown(tc('Entry deleted', locale));
    absent('button', words.undo);
    cleanup();
    vi.restoreAllMocks();
  }
});

test('an undo whose answer never came keeps the bar past its time, and Undo resends the same restore', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    screenReader(false);
    const timers = vi.spyOn(globalThis, 'setTimeout');
    const { fake } = mount({ locale });
    tap(await findNamed('button', words.delete));
    const bar = await findFound('wallet-undo-bar');
    await settle();
    fake.loseResponse('restoreTransaction');
    tap(named('button', words.undo, bar));
    await findShown(tc(NOT_CONFIRMED, locale));
    const dismissals = barTimers(timers);
    expect(dismissals, `${locale}: one toastLong`).toHaveLength(1);
    act(() => dismissals[0].run());
    // Its time has passed, but the undo may have landed: the bar stays, and its Undo is the Try again.
    tap(named('button', words.undo, found('wallet-undo-bar')));
    await findNamed('button', words.edit);
    expect(fake.callsOf('restoreTransaction'), `${locale}: two sends`).toHaveLength(2);
    const [first, second] = fake.callsOf('restoreTransaction');
    expect([second.args, first.args.slice(0, 2)], `${locale}: the same restore`).toEqual([first.args, [LUNCH.id, 4]]);
    cleanup();
    vi.restoreAllMocks();
  }
});

test('an undo on its way when the time runs out keeps the bar until it lands', async () => {
  screenReader(false);
  const timers = vi.spyOn(globalThis, 'setTimeout');
  const { fake } = mount();
  tap(await findNamed('button', WORDS.th.delete));
  const bar = await findFound('wallet-undo-bar');
  await settle();
  const release = fake.hold('restoreTransaction');
  tap(named('button', WORDS.th.undo, bar));
  const dismissals = barTimers(timers);
  expect(dismissals).toHaveLength(1);
  act(() => dismissals[0].run());
  found('wallet-undo-bar');
  await act(async () => { release(); });
  await findNamed('button', WORDS.th.edit);
  expect(screen.queryAllByTestId('wallet-undo-bar')).toHaveLength(0);
});

test('the undo bar: a 44 pt Undo on the toast colour, gone after toastLong, but never while a screen reader runs', async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const words = WORDS[locale];
      const colors = PALETTE[mode];
      screenReader(false);
      const timers = vi.spyOn(globalThis, 'setTimeout');
      const onUndo = vi.fn();
      const onDismiss = vi.fn();
      mountWallet(<WalletUndoBar message={words.deletedBar} onUndo={onUndo} onDismiss={onDismiss} />, { locale, mode });
      await settle();
      const bar = found('wallet-undo-bar');
      expect([bar.getAttribute('role'), bar.getAttribute('aria-live'), bar.style.backgroundColor], `${locale} ${mode}`).toEqual(['status', 'polite', rgba(colors.toast)]);
      const undo = named('button', words.undo, bar);
      expect(undo.style.minHeight, `${locale} ${mode}: 44 pt`).toBe('44px');
      expect(shown(words.undo, undo).style.color, `${locale} ${mode}: its words`).toBe(rgba(colors.onToast));
      const dismissals = barTimers(timers);
      expect(dismissals, `${locale} ${mode}: toastLong`).toHaveLength(1);
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => dismissals[0].run());
      expect(onDismiss, `${locale} ${mode}: dismissed`).toHaveBeenCalledTimes(1);
      tap(undo);
      expect([onUndo.mock.calls.length, vi.mocked(playHaptic).mock.calls.map(([moment]) => moment)], `${locale} ${mode}: undone`).toEqual([1, ['undoDone']]);
      cleanup();
      vi.restoreAllMocks();
      vi.mocked(playHaptic).mockClear();
    }
  }
  // With a screen reader running, it waits for the person (WCAG 2.2.1).
  screenReader(true);
  const timers = vi.spyOn(globalThis, 'setTimeout');
  mountWallet(<WalletUndoBar message={WORDS.th.deletedBar} onUndo={vi.fn()} onDismiss={vi.fn()} />);
  await settle();
  found('wallet-undo-bar');
  expect(barTimers(timers)).toHaveLength(0);
});

test("the undo bar's time follows the phone: no answer counts as no screen reader, a change stops or starts it, and drawing it again never restarts it", async () => {
  const handlers: Record<string, (value: boolean) => void> = {};
  const removed: string[] = [];
  vi.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((name: string, handler: (value: boolean) => void) => {
    handlers[name] = handler;
    return { remove: () => removed.push(name) };
  }) as never);
  vi.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(() => Promise.reject(new Error('no answer')));
  const timers = vi.spyOn(globalThis, 'setTimeout');
  const cleared = vi.spyOn(globalThis, 'clearTimeout');
  const first = vi.fn();
  const second = vi.fn();
  const view = mountWallet(<WalletUndoBar message={WORDS.th.deletedBar} onUndo={vi.fn()} onDismiss={first} />);
  await settle();
  expect(barTimers(timers), 'no answer: the time runs').toHaveLength(1);
  // Drawn again with a new onDismiss: the same time, and the latest onDismiss when it runs out.
  view.rerender(<WalletUndoBar message={WORDS.th.deletedBar} onUndo={vi.fn()} onDismiss={second} />);
  await settle();
  const [timer] = barTimers(timers);
  expect(barTimers(timers), 'not restarted').toHaveLength(1);
  act(() => timer.run());
  expect([first.mock.calls.length, second.mock.calls.length], 'the latest onDismiss').toEqual([0, 1]);
  // A screen reader turned on stops the time; turned off, it starts again.
  expect(handlers.screenReaderChanged, 'a listener').toBeTypeOf('function');
  act(() => handlers.screenReaderChanged(true));
  expect(cleared.mock.calls.map(([id]) => id), 'stopped').toContain(timer.id);
  act(() => handlers.screenReaderChanged(false));
  expect(barTimers(timers), 'started again').toHaveLength(2);
  view.unmount();
  expect(removed.filter((name) => name === 'screenReaderChanged'), 'the listener goes with the bar').toHaveLength(1);
});

test('the undo bar says its words once on iOS', async () => {
  const view = mountWallet(<WalletUndoBar message={WORDS.en.deletedBar} onUndo={vi.fn()} onDismiss={vi.fn()} />);
  await settle();
  // iOS from here on (the app's providers have read the web's settings): new words are said once, never again on a redraw.
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true, writable: true });
  const said = vi.spyOn(AccessibilityInfo, 'announceForAccessibility');
  view.rerender(<WalletUndoBar message={WORDS.th.deletedBar} onUndo={vi.fn()} onDismiss={vi.fn()} />);
  view.rerender(<WalletUndoBar message={WORDS.th.deletedBar} onUndo={vi.fn()} onDismiss={vi.fn()} />);
  await settle();
  expect(said.mock.calls.map(([text]) => text)).toEqual([WORDS.th.deletedBar]);
});

test('a record deleted elsewhere says so, counts its days and restores with its own version', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    const gone = { ...LUNCH, deleted_at: '2026-10-24T02:00:00.000Z', version: 5 } as TransactionDto;
    const { fake } = mount({ locale, records: [gone] });
    await findShown(tc('This entry was already deleted.', locale));
    shown(words.daysLeft);
    for (const name of [words.edit, words.copyToday, words.delete, words.more]) absent('button', name);
    tap(named('button', tc('Restore', locale)));
    await findNamed('button', words.edit);
    expect(fake.callsOf('restoreTransaction'), `${locale}: one restore`).toHaveLength(1);
    expect(fake.callsOf('restoreTransaction')[0].args.slice(0, 2), `${locale}: its version`).toEqual([LUNCH.id, 5]);
    cleanup();
    // On its last day it says so.
    mount({ locale, records: [{ ...gone, deleted_at: '2026-09-24T04:00:00.000Z' } as TransactionDto] });
    await findShown(words.lastDay);
    cleanup();
  }
  // A restore whose answer never came: Restore becomes Try again, which resends the same command.
  const { fake } = mount({ records: [{ ...LUNCH, deleted_at: '2026-10-24T02:00:00.000Z', version: 5 } as TransactionDto] });
  await findShown(tc('This entry was already deleted.', 'th'));
  fake.loseResponse('restoreTransaction');
  tap(named('button', tc('Restore', 'th')));
  await findShown(tc(NOT_CONFIRMED, 'th'));
  tap(named('button', tc('Try again', 'th')));
  await findNamed('button', WORDS.th.edit);
  expect(fake.callsOf('restoreTransaction')).toHaveLength(2);
  const [first, second] = fake.callsOf('restoreTransaction');
  expect([second.args, first.args.slice(0, 2)]).toEqual([first.args, [LUNCH.id, 5]]);
});

test("today's receipt section, unchanged (W15): it gets the record's id, version and receipt, and a change reads the record again", async () => {
  const { fake } = mount();
  await findShown(`receipt of ${LUNCH.id} at 3 holding null`);
  const reads = fake.callsOf('transaction').length;
  tap(named('button', 'Receipt changed'));
  await waitFor(() => expect(fake.callsOf('transaction')).toHaveLength(reads + 1));
});

test('load problems: a failed load can be tried again; a missing entry says so', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    const fake = createFakeResources({ wallets: WALLETS, categories: BUILTINS, records: [LUNCH] });
    fake.fail('transaction', 'network');
    mountWallet(<WalletRecordScreen id={LUNCH.id} now={NOW} />, { resources: fake.resources, locale });
    await findShown(tc("We couldn't load your diary.", locale));
    tap(named('button', tc('Try again', locale)));
    await findNamed('heading', 'ข้าวมันไก่');
    cleanup();
    mount({ locale, id: '0000000b-0000-4000-8000-0000000007ff' });
    await findShown(tc("This entry isn't in your diary.", locale));
    absent('button', tc('Try again', locale));
    absent('button', words.more);
    named('button', words.back);
    cleanup();
  }
});

test('while a delete is on its way, แก้ไข, ลบ and more wait; ทำซ้ำวันนี้ does not', async () => {
  const words = WORDS.th;
  const { fake } = mount();
  await findNamed('button', words.edit);
  const release = fake.hold('deleteTransaction');
  tap(named('button', words.delete));
  expect([words.edit, words.delete, words.more, words.copyToday].map((name) => named('button', name).getAttribute('aria-disabled'))).toEqual(['true', 'true', 'true', null]);
  await act(async () => { release(); });
  await findFound('wallet-undo-bar');
});

test('a tray opened again before it has gone forgets the action it was leaving for', async () => {
  const words = WORDS.th;
  mountInHost();
  const tray = await openActions('th');
  tap(named('button', words.copyRow(words.baht), tray));
  // Opened again while it leaves, then closed: no copy.
  tap(named('button', words.more));
  tap(named('button', words.close, await findNamed('dialog', 'ข้าวมันไก่')));
  await wait(300);
  startAnimations();
  expect(screen.queryAllByTestId('add-amount')).toHaveLength(0);
});

test('the screen sends no event of its own: a delete and its undo send one record_deleted and one undo_used, with no amount or words', async () => {
  const recorded = await recordAnalytics();
  try {
    mount();
    tap(await findNamed('button', WORDS.th.delete));
    tap(named('button', WORDS.th.undo, await findFound('wallet-undo-bar')));
    await findNamed('button', WORDS.th.edit);
    expect(recorded.sent.filter((event) => event.kind === 'capture').map((event) => event.name)).toEqual(['record_deleted', 'undo_used']);
    const text = JSON.stringify(recorded.sent);
    for (const secret of ['5000', '50.00', 'ข้าวมันไก่', 'กับเพื่อนที่ออฟฟิศ', 'บัญชีหลัก']) expect(text, secret).not.toContain(secret);
  } finally {
    recorded.restore();
  }
});

test('at the largest text size the three buttons stack and nothing is clamped', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    mount({ locale, fontScale: AX5 });
    await findNamed('button', words.edit);
    expect(found('wallet-record-actions').style.flexDirection, `${locale}: stacked`).toBe('column');
    for (const name of [words.edit, words.copyToday, words.delete]) expect(named('button', name).style.flexGrow, `${locale}: ${name}`).toBe('');
    expect(seen.props.length, locale).toBeGreaterThan(0);
    for (const props of seen.props) {
      expect([props.numberOfLines, props.adjustsFontSizeToFit, props.ellipsizeMode], `${locale}: ${String(props.children)}`).toEqual([undefined, undefined, undefined]);
    }
    cleanup();
    seen.props.length = 0;
    // At the default size, one row.
    mount({ locale });
    await findNamed('button', words.edit);
    expect(found('wallet-record-actions').style.flexDirection, `${locale}: a row`).toBe('row');
    for (const name of [words.edit, words.copyToday, words.delete]) expect(named('button', name).style.flexGrow, `${locale}: ${name}`).toBe('1');
    cleanup();
  }
});

test('the catalogue draws the record, a draft, a deleted entry, the actions tray and the undo bar on their own fakes', async () => {
  const ids = WALLET_SECTIONS.map((section) => section.id);
  const at = ids.indexOf('bw-deleted');
  expect(ids.slice(at, at + 6)).toEqual(['bw-deleted', 'bw-record', 'bw-record-draft', 'bw-record-deleted', 'bw-record-actions', 'bw-record-undo']);
  const section = (id: string) => {
    const match = WALLET_SECTIONS.find((each) => each.id === id);
    expect(match, `section ${id}`).toBeDefined();
    return match!;
  };
  expect(['bw-record', 'bw-record-draft', 'bw-record-deleted', 'bw-record-actions', 'bw-record-undo'].map((id) => [section(id).title, section(id).group, section(id).layout])).toEqual([
    ['Bun Wallet: record', 'Screens', 'screen'],
    ['Bun Wallet: record, a draft on this phone', 'Screens', 'screen'],
    ['Bun Wallet: record, deleted', 'Screens', 'screen'],
    ["Bun Wallet: record's actions tray", 'Kit', undefined],
    ["Bun Wallet: record's undo bar", 'Kit', undefined],
  ]);
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    // The harness's own fakes hold no record: what each section draws is its own.
    mountWallet(<>{section('bw-record').render()}</>, { locale });
    found('catalogue-screen-running');
    await findFound('catalogue-screen-ready', LAZY);
    named('heading', 'ข้าวมันไก่');
    expect(found('wallet-record-amount').textContent).toBe('฿50.00');
    cleanup();
    mountWallet(<>{section('bw-record-draft').render()}</>, { locale });
    await findFound('catalogue-screen-ready', LAZY);
    named('button', tc('Remove', locale));
    absent('button', words.edit);
    cleanup();
    mountWallet(<>{section('bw-record-deleted').render()}</>, { locale });
    await findFound('catalogue-screen-ready', LAZY);
    shown(words.daysLeft);
    named('button', tc('Restore', locale));
    cleanup();
    mountWallet(<>{section('bw-record-actions').render()}</>, { locale });
    await findFound('record-actions', LAZY);
    startAnimations();
    const tray = await findNamed('dialog', locale === 'th' ? 'ข้าวมันไก่' : 'Chicken rice');
    named('button', words.editRow, tray);
    cleanup();
    mountWallet(<>{section('bw-record-undo').render()}</>, { locale });
    const bar = await findFound('wallet-undo-bar', LAZY);
    shown(locale === 'th' ? 'ลบ ข้าวมันไก่ ฿50 แล้ว' : 'Deleted Chicken rice ฿50', bar);
    cleanup();
    // In private mode, the screen's words without the amount.
    mountWallet(<>{section('bw-record-undo').render()}</>, { locale, device: PRIVATE });
    shown(locale === 'th' ? 'ลบ ข้าวมันไก่ แล้ว' : 'Deleted Chicken rice', await findFound('wallet-undo-bar', LAZY));
    cleanup();
  }
}, 30_000);
