// The Bun Wallet shell (P2-T18; R58, W13, W31, C5, ax-voiceover,
// ax-large-home rule 8): the bar, the +, Magic Tap, the saved toast and the
// one add tray host. Each case mounts the real shell through mountWallet on
// the fakes, in Thai and by day unless it says otherwise, around a screen and
// a probe that keeps the latest useAddTray() and useWalletTabInset(). The
// shell's resources are the shared singleton every route wraps, which this
// file swaps for the case's fakes; the route's path is the case's.
//
// The traps, as the add tray's own suite meets them (AddTray.render.test.tsx):
// the tray's card and each step's content stay unseen until their entering
// animation starts, which happy-dom never does, so startAnimations() fires it
// after every opening and step; the Modal says it has gone at once unless a
// case holds its dismissals back, as UIKit may (the bound's cases); iOS is
// set after the mount (before it, ThemeProvider reads the native store), with
// a no-op for the focus call react-native-web lacks. react-native-web drops
// onMagicTap, so the Magic Tap case reads the source, and calls the root's
// prop from the View's own props, which React keeps on the root's element.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Platform, Text, View } from 'react-native';
import type { ModalProps } from 'react-native';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
// The router, with the route's path the case sets, and the device's id maker (Quick add's keys).
const nav = vi.hoisted(() => ({ pathname: '/spend' }));
vi.mock('expo-router', async () => ({ ...(await import('../../dev/catalogue/routerTestStub')), usePathname: () => nav.pathname }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock('@mobile/lib/hapticMoment', () => ({ playHaptic: vi.fn() }));
// The shared v1 resources every route wraps: the case's fakes.
const shared = vi.hoisted(() => ({ resources: null as unknown }));
vi.mock('@mobile/api/sharedV1', () => ({ getSharedV1Resources: () => shared.resources }));

// The Modal, which says it has gone at once unless a case holds its dismissals back (`hold`): a held one keeps the
// Modal's own onDismiss (the tray's), as UIKit does with a dismissal it never ends.
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

import type { TransactionDto, WalletSnapshot } from '@gogospend/contracts';

import { COMMON_RULES } from '@mobile/analytics/catalog';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import type { Recorded } from '@mobile/analytics/testing/recordAnalytics';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { command, pending } from '@mobile/spend/v1/redesign/testing/fixtures';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import type { SyncOutcome } from '@mobile/sync/types';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { useAddTray } from '../add/AddTrayHost';
import type { AddTray } from '../add/AddTrayHost';
import { useRegisterCardFrame } from '../card/cardFrames';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { AX5, mountWallet } from '../testing/walletHarness';
import type { MountWalletOptions } from '../testing/walletHarness';
import { useWalletTabInset } from './WalletTabBar';
import { WalletShell } from './WalletShell';

const os = Platform.OS;
beforeEach(() => {
  nav.pathname = '/spend';
});
afterEach(() => {
  cleanup();
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
  vi.restoreAllMocks();
  vi.clearAllMocks();
  probe.tray = null;
  probe.inset = null;
  shared.resources = null;
  Object.assign(dismissals, { hold: false, held: [] });
  delete (AccessibilityInfo as { sendAccessibilityEvent?: unknown }).sendAccessibilityEvent;
});

/** Lets the stores, the lists and the phone's answer arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
/** Lets time pass, such as a tray's exit (220 ms). */
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

/** Starts the entering animations, as a browser does a frame after they mount (see the note at the top). */
function startAnimations() {
  act(() => {
    for (const node of document.querySelectorAll<HTMLElement>('[style*="visibility: hidden"]')) node.dispatchEvent(new Event('animationstart'));
  });
}

/** The one element with this role and name. */
function named(role: string, name: string): HTMLElement {
  const elements = screen.queryAllByRole(role, { name });
  expect(elements, `one ${role} named ${name}`).toHaveLength(1);
  return elements[0] as HTMLElement;
}

/** The one element with this test id. */
function found(testID: string): HTMLElement {
  const elements = screen.queryAllByTestId(testID);
  expect(elements, testID).toHaveLength(1);
  return elements[0] as HTMLElement;
}

/** A tap, then the next step's content shows. */
function tap(element: HTMLElement) {
  fireEvent.click(element);
  startAnimations();
}
const press = (...names: string[]) => { for (const name of names) tap(named('button', name)); };
const source = (file: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), file), 'utf8');
/** iOS for what follows, with a no-op for the focus call react-native-web has not; or the web. */
function onIos(ios: boolean) {
  Object.defineProperty(Platform, 'OS', { value: ios ? 'ios' : os, configurable: true, writable: true });
  if (ios) Object.defineProperty(AccessibilityInfo, 'sendAccessibilityEvent', { value: () => undefined, configurable: true, writable: true });
  else delete (AccessibilityInfo as { sendAccessibilityEvent?: unknown }).sendAccessibilityEvent;
}
const rgb = (hex: string) => expect.stringMatching(new RegExp(`^rgba?\\(${[1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).join(', ')}(, 1(\\.0+)?)?\\)$`));

/** Each record_started sent, without the properties every event carries. */
const starts = (sent: readonly Recorded[]) => sent
  .filter((event) => event.name === 'record_started')
  .map(({ properties }) => Object.fromEntries(Object.entries(properties).filter(([key]) => key !== 'origin' && !(key in COMMON_RULES))));

const LOCALES = ['th', 'en'] as const;
const MODES = ['light', 'dark'] as const;
const WORDS = {
  th: { wallets: 'กระเป๋า', insights: 'สรุป', me: 'ฉัน', places: ['1 จาก 3', '2 จาก 3', '3 จาก 3'], add: 'จดรายการ', spending: 'จดรายจ่าย', income: 'จดรายรับ' },
  en: { wallets: 'Wallet', insights: 'Insights', me: 'Me', places: ['1 of 3', '2 of 3', '3 of 3'], add: 'Add an entry', spending: 'Add spending', income: 'Add income' },
} as const;
const TODAY = todayInBangkok(new Date());

const wallet = (n: number, name: string, opening: string): WalletSnapshot => ({
  id: `0000000a-0000-4000-8000-00000000000${n}`, name, currency: 'THB', opening_minor: opening, tracking_start: '2026-01-01', archived: false, version: 1,
});
const MAIN = wallet(1, 'บัญชีหลัก', '2486000');
const CASH = wallet(2, 'เงินสด', '124000');
const WALLETS = [MAIN, CASH];
const SYNCED = { status: 'synced', progress: { sent: 0, total: 0 }, nextAttemptAt: null, uncertain: 0, needsReview: 0 } as SyncOutcome;
const resources = () => createFakeResources({ wallets: WALLETS, categories: BUILTINS });
/** A phone's diary: open, its lists synced, its last sync done. */
const readyDiary = (view: Parameters<typeof createFakeDiary>[0] = {}) => createFakeDiary({ wallets: WALLETS, categories: BUILTINS, outcome: SYNCED, ...view });

/** The latest useAddTray() and useWalletTabInset() inside the shell. */
const probe = { tray: null as AddTray | null, inset: null as number | null };
function tray(): AddTray {
  expect(probe.tray, 'useAddTray()').not.toBeNull();
  return probe.tray as AddTray;
}
function Probe() {
  probe.tray = useAddTray();
  probe.inset = useWalletTabInset();
  return null;
}
/** The shell around a screen and the probe, as the layout mounts it around the Slot. */
function Shell({ children }: { children?: ReactNode }) {
  return (
    <WalletShell>
      <Probe />
      {children ?? <Text>wallet home screen</Text>}
    </WalletShell>
  );
}

/** Mounts the shell on fresh fakes (or the case's), the shell's resources the same as the route's. */
async function mount(options: MountWalletOptions & { children?: ReactNode } = {}) {
  const { children, ...rest } = options;
  const fake = rest.resources ?? resources().resources;
  shared.resources = fake;
  const view = mountWallet(<Shell>{children}</Shell>, { diary: readyDiary().diary, ...rest, resources: fake });
  await settle();
  return view;
}

async function pressAdd(name = 'จดรายการ') {
  tap(named('button', name));
  await settle();
  startAnimations();
}

/** The bar's items, in order: role, name, place and whether it is selected. */
function items() {
  const bar = found('wallet-tab-bar');
  return [...bar.querySelectorAll('[role="tab"], [role="link"]')].map((item) => [
    item.getAttribute('role'),
    item.getAttribute('aria-label'),
    item.getAttribute('aria-valuetext'),
    item.getAttribute('aria-selected'),
  ]);
}

/** The root's onMagicTap: react-native-web draws no such prop, so it is read from the root View's own props. */
function magicTapOfRoot(): unknown {
  const root = found('wallet-shell');
  const key = Object.keys(root).find((name) => name.startsWith('__reactFiber$'));
  expect(key, "the root's React fiber").toBeDefined();
  type Fiber = { type: unknown; memoizedProps: Record<string, unknown> | null; return: Fiber | null };
  for (let fiber: Fiber | null = (root as unknown as Record<string, Fiber | undefined>)[key as string] ?? null; fiber !== null; fiber = fiber.return) {
    if (typeof fiber.type !== 'string' && fiber.memoizedProps?.testID === 'wallet-shell') return fiber.memoizedProps.onMagicTap;
  }
  return undefined;
}

test('the bar has กระเป๋า and สรุป as tabs and ฉัน as a link, each 44 pt, and the + opens the add tray', async () => {
  const recorded = await recordAnalytics();
  try {
    for (const locale of LOCALES) {
      for (const mode of MODES) {
        const at = `${locale} ${mode}`;
        const words = WORDS[locale];
        const colors = mode === 'light' ? walletLight : walletDark;
        await mount({ locale, mode });
        // Two tabs, กระเป๋า selected on Home, and a link that is never selected; each says its place (ax-voiceover).
        expect(items(), at).toEqual([
          ['tab', words.wallets, words.places[0], 'true'],
          ['tab', words.insights, words.places[1], 'false'],
          ['link', words.me, words.places[2], null],
        ]);
        for (const name of [words.wallets, words.insights, words.me]) {
          const item = within(found('wallet-tab-bar')).queryAllByLabelText(name)[0] as HTMLElement | undefined;
          expect(item?.style.minHeight, `${at} ${name}`).toBe('44px');
          expect(item?.style.minWidth, `${at} ${name}`).toBe('56px');
        }
        // The selected item in ink, the others quiet on the ground; the labels stop at iOS's largest standard size.
        const labels = within(found('wallet-tab-bar')).queryAllByText(new RegExp(`^(${words.wallets}|${words.insights}|${words.me})$`));
        expect(labels.map((label) => label.style.color), at).toEqual([rgb(colors.ink), rgb(colors.quietOnGround), rgb(colors.quietOnGround)]);
        // A tablist row under the screen, above the phone's own bottom inset (34 pt here).
        expect([found('wallet-tab-bar').getAttribute('role'), found('wallet-tab-bar').style.paddingBottom], at).toEqual(['tablist', '34px']);
        // The + : 60 pt, primary, named จดรายการ, at the bottom right of the screen and above the bar.
        const add = named('button', words.add);
        expect([add.style.width, add.style.height, add.style.backgroundColor], at).toEqual(['60px', '60px', rgb(colors.primary)]);
        expect([add.style.position, add.style.right, add.style.bottom], at).toEqual(['absolute', '18px', '16px']);
        expect(add.getAttribute('aria-disabled'), at).toBeNull();
        expect(found('wallet-shell').contains(found('wallet-tab-bar')), at).toBe(true);
        expect(add.compareDocumentPosition(found('wallet-tab-bar')) & Node.DOCUMENT_POSITION_FOLLOWING, at).toBeTruthy();
        // The + opens the add tray: spending, once.
        await pressAdd(words.add);
        named('dialog', words.spending);
        expect(tray().isOpen, at).toBe(true);
        cleanup();
      }
    }
    expect(starts(recorded.sent)).toEqual(Array(4).fill({ kind: 'expense', source: 'typed' }));
  } finally {
    recorded.restore();
  }
  // What react-native-web drops, read from the source: the labels stop at iOS's largest standard size, a long press
  // shows each item's name large, and the + says what a double tap does.
  const bar = source('WalletTabBar.tsx');
  expect(bar).toMatch(/maxFontSizeMultiplier=\{LARGEST_STANDARD_SCALE\}/);
  expect(bar).toMatch(/accessibilityShowsLargeContentViewer\n\s+accessibilityLargeContentTitle=\{name\}/);
  expect(source('AddButton.tsx')).toMatch(/accessibilityHint=\{t\('home\.addHint'\)\}/);
  // The tabs go to their routes; the selected one stays; ฉัน opens Settings, outside the shell.
  await mount();
  fireEvent.click(named('tab', 'สรุป'));
  expect(router.navigate).toHaveBeenLastCalledWith('/spend/insights');
  fireEvent.click(named('tab', 'กระเป๋า'));
  expect(router.navigate).toHaveBeenCalledTimes(1);
  fireEvent.click(named('link', 'ฉัน'));
  expect(router.push).toHaveBeenCalledWith('/settings');
  cleanup();
  // On Insights, สรุป is selected and กระเป๋า goes back to Home.
  nav.pathname = '/spend/insights';
  await mount();
  expect(items().map(([, name, , selected]) => [name, selected])).toEqual([['กระเป๋า', 'false'], ['สรุป', 'true'], ['ฉัน', null]]);
  fireEvent.click(named('tab', 'กระเป๋า'));
  expect(router.navigate).toHaveBeenLastCalledWith('/spend');
  cleanup();
  // Elsewhere neither the bar nor the + is drawn, and the screen keeps no inset for them.
  for (const pathname of ['/spend/wallet/0000000a-0000-4000-8000-000000000001', '/spend/all', '/spend/record/r1']) {
    nav.pathname = pathname;
    await mount();
    expect(screen.queryAllByTestId('wallet-tab-bar'), pathname).toHaveLength(0);
    expect(screen.queryAllByRole('button', { name: 'จดรายการ' }), pathname).toHaveLength(0);
    expect(within(found('wallet-shell')).queryAllByText('wallet home screen'), pathname).toHaveLength(1);
    expect(probe.inset, pathname).toBe(0);
    cleanup();
  }
});

test('a save shows the toast once, with today\'s money out', async () => {
  const fake = resources();
  await mount({ resources: fake.resources, diary: null });
  await pressAdd();
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  tap(named('button', 'บันทึก'));
  await waitFor(() => expect(screen.queryAllByTestId('saved-toast')).toHaveLength(1));
  expect(found('saved-line').textContent).toBe('บันทึกแล้ว · วันนี้ ฿50');
  // One notice: a moment later the toast has still read today's spending once.
  await wait(200);
  expect(screen.queryAllByTestId('saved-toast')).toHaveLength(1);
  const reads = fake.callsOf('history').filter(({ args }) => {
    const [range] = args as [{ from?: string; through?: string; type?: string }];
    return range.from === TODAY && range.through === TODAY && range.type === 'expense';
  });
  expect(reads).toHaveLength(1);
  expect(tray().isOpen).toBe(false);
  cleanup();
  // A save kept on a phone whose last sync did not end synced says so (rh-offline), and reads nothing.
  const kept = resources();
  await mount({ resources: kept.resources, diary: readyDiary({ outcome: null }).diary });
  await pressAdd();
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  tap(named('button', 'บันทึก'));
  await waitFor(() => expect(screen.queryAllByTestId('saved-toast')).toHaveLength(1));
  expect(found('saved-line').textContent).toBe('เก็บไว้ในเครื่องแล้ว · จะบันทึกเมื่อออนไลน์');
});

/** A view registered under a wallet's id, as a card's is on Home. */
function CardPlace({ walletId }: { walletId: string }) {
  return <View testID="main-card" ref={useRegisterCardFrame(walletId)} collapsable={false} />;
}

test("a save's chip drops into its wallet's card on the screen: the card frames are the shell's", async () => {
  await mount({ diary: null, children: <CardPlace walletId={MAIN.id} /> });
  await pressAdd();
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  tap(named('button', 'บันทึก'));
  await waitFor(() => expect(screen.queryAllByTestId('save-flight')).toHaveLength(1));
  expect(found('save-flight').textContent).toContain('−฿50');
});

test("in private mode the shell's toast masks today's money out and quotes nothing typed", async () => {
  const fake = resources();
  await mount({ resources: fake.resources, diary: null, device: { [PRIVATE_MODE_NAME]: '1' } });
  await pressAdd();
  press('5', '0');
  tap(named('button', 'ถัดไป'));
  tap(named('button', 'บันทึก'));
  await waitFor(() => expect(screen.queryAllByTestId('saved-toast')).toHaveLength(1));
  const toast = found('saved-toast');
  expect(found('saved-line').textContent).toBe('บันทึกแล้ว · วันนี้ ฿••••');
  expect(found('saved-line').getAttribute('aria-label')).toBe('บันทึกแล้ว · วันนี้ ซ่อนยอดเงินอยู่');
  expect(`${toast.textContent} ${found('saved-line').getAttribute('aria-label')}`).not.toMatch(/[0-9]/);
});

test('a draft paused for an update, or an update-required outcome, disables the + and nothing opens (C5)', async () => {
  const recorded = await recordAnalytics();
  try {
    const paused = command(pending({ amount_minor: '5000', occurred_on: TODAY }), 'paused_upgrade');
    const cases: readonly (readonly [string, Parameters<typeof createFakeDiary>[0]])[] = [
      ['a paused draft', { outbox: [paused] }],
      ['update required', { outcome: { ...SYNCED, status: 'upgrade_required' } as SyncOutcome }],
    ];
    for (const [label, view] of cases) {
      const diary = readyDiary(view);
      await mount({ diary: diary.diary });
      const add = named('button', 'จดรายการ');
      expect(add.getAttribute('aria-disabled'), label).toBe('true');
      fireEvent.click(add);
      const magicTap = magicTapOfRoot();
      expect(typeof magicTap, label).toBe('function');
      act(() => { (magicTap as () => void)(); });
      act(() => { tray().open({ type: 'income' }); });
      await settle();
      startAnimations();
      expect(screen.queryAllByRole('dialog'), label).toHaveLength(0);
      expect([tray().blocked, tray().isOpen], label).toEqual([true, false]);
      // Once the update is no longer needed, the + opens the tray.
      act(() => { diary.set({ outbox: [], outcome: SYNCED }); });
      expect(named('button', 'จดรายการ').getAttribute('aria-disabled'), label).toBeNull();
      await pressAdd();
      named('dialog', 'จดรายจ่าย');
      cleanup();
    }
    expect(starts(recorded.sent)).toEqual(Array(2).fill({ kind: 'expense', source: 'typed' }));
  } finally {
    recorded.restore();
  }
});

test('Magic Tap opens the add tray', async () => {
  // react-native-web draws no onMagicTap, so the source says it is on the shell's root, the same openAdd as the +'s.
  const shell = source('WalletShell.tsx');
  expect(shell.match(/onMagicTap=/g) ?? []).toHaveLength(1);
  expect(shell).toMatch(/<View testID="wallet-shell" onMagicTap=\{openAdd\}/);
  expect(shell).toMatch(/<AddButton onPress=\{openAdd\}/);
  // And the root's own prop, called on a tab, opens the spending tray.
  nav.pathname = '/spend/insights';
  await mount();
  const magicTap = magicTapOfRoot();
  expect(typeof magicTap).toBe('function');
  act(() => { (magicTap as () => void)(); });
  await settle();
  startAnimations();
  named('dialog', 'จดรายจ่าย');
});

test('at AX5 the labels hide, the items keep their names and the inset is 96', async () => {
  await mount({ fontScale: AX5 });
  expect(items().map(([role, name]) => [role, name])).toEqual([['tab', 'กระเป๋า'], ['tab', 'สรุป'], ['link', 'ฉัน']]);
  const bar = found('wallet-tab-bar');
  expect(within(bar).queryAllByText(/^(กระเป๋า|สรุป|ฉัน)$/)).toHaveLength(0);
  expect([...bar.querySelectorAll('svg')].map((icon) => [icon.getAttribute('width'), icon.getAttribute('height')])).toEqual(Array(3).fill(['30', '30']));
  for (const name of ['กระเป๋า', 'สรุป', 'ฉัน']) {
    const item = within(bar).queryAllByLabelText(name)[0] as HTMLElement | undefined;
    expect([item?.style.minHeight, item?.style.minWidth], name).toEqual(['52px', '64px']);
  }
  expect(probe.inset).toBe(96);
  cleanup();
  // At the standard sizes the labels show, the icons are 24 pt and the inset is the bar's 84.
  await mount();
  expect(within(found('wallet-tab-bar')).queryAllByText(/^(กระเป๋า|สรุป|ฉัน)$/)).toHaveLength(3);
  expect([...found('wallet-tab-bar').querySelectorAll('svg')].map((icon) => icon.getAttribute('width'))).toEqual(['24', '24', '24']);
  expect(probe.inset).toBe(84);
});

test("the shell's screens reach its one add tray host, and one tray shows at a time", async () => {
  const recorded = await recordAnalytics();
  try {
    await mount();
    // A screen inside the shell opens the shell's tray, never today's Quick add.
    act(() => { tray().open({ type: 'income' }); });
    await settle();
    startAnimations();
    named('dialog', 'จดรายรับ');
    expect(router.push).not.toHaveBeenCalled();
    // The + while it is open changes nothing: one tray, one start.
    fireEvent.click(named('button', 'จดรายการ'));
    await settle();
    expect(screen.queryAllByRole('dialog')).toHaveLength(1);
    expect(starts(recorded.sent)).toEqual([{ kind: 'income', source: 'typed' }]);
  } finally {
    recorded.restore();
  }
});

test("a record copied from a screen in the shell opens in the wallet's tray, never today's Quick add; in private mode the copied amount is masked", async () => {
  // The record the person copies (its screen's ทำซ้ำวันนี้, P2-T26: useAddTray().open({ copyOf })), with a place they typed.
  const copied = {
    id: '0000000b-0000-4000-8000-000000000009', type: 'expense', amount_minor: '18200', occurred_on: '2026-11-01', wallet_id: MAIN.id,
    category_id: BUILTINS[0].id, note: null, merchant: 'ข้าวมันไก่', deleted_at: null, version: 1,
  } as TransactionDto;
  const fake = createFakeResources({ wallets: WALLETS, categories: BUILTINS, records: [copied] });
  await mount({ resources: fake.resources, device: { [PRIVATE_MODE_NAME]: '1' } });
  act(() => { tray().open({ copyOf: copied.id }); });
  await settle();
  startAnimations();
  // The shell's own tray, so the wallet's private mode applies: no push to today's Quick add, which reads none.
  named('dialog', 'จดรายจ่าย');
  expect(router.push).not.toHaveBeenCalled();
  // The copied amount is a fill, masked until a key is pressed (R106), and the amount step draws nothing it copied.
  expect([found('add-amount').textContent, found('add-amount').getAttribute('aria-label')]).toEqual(['฿••••', 'ซ่อนยอดเงินอยู่']);
  expect([screen.queryAllByText(/182/), screen.queryAllByText(/ข้าวมันไก่/)].map((matches) => matches.length)).toEqual([0, 0]);
});

test('a tray that waits on iOS for a dismissal is freed at the bound while the shell keeps drawing (sync progress)', async () => {
  const diary = readyDiary();
  await mount({ diary: diary.diary });
  await pressAdd();
  dismissals.hold = true;
  onIos(true);
  fireEvent.click(named('button', 'ปิด'));
  const later = vi.fn();
  act(() => { tray().whenClosed(later); });
  expect(later).not.toHaveBeenCalled();
  // The shell draws again every 400 ms while the tray leaves, as sync progress redraws it.
  for (let sent = 1; sent <= 5; sent += 1) {
    await wait(400);
    act(() => { diary.set({ progress: { sent, total: 9 } }); });
  }
  onIos(false);
  expect(later).toHaveBeenCalledTimes(1);
}, 20_000);

test('an open and a close in one batch never show a tray, and the bound frees the host on every platform', async () => {
  await mount();
  act(() => {
    tray().open();
    tray().close();
  });
  await wait(300);
  const early = vi.fn();
  act(() => { tray().whenClosed(early); });
  expect(early).not.toHaveBeenCalled();
  await wait(1400);
  expect(early).toHaveBeenCalledTimes(1);
  await pressAdd();
  named('dialog', 'จดรายจ่าย');
}, 20_000);
