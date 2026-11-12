// The Bun Wallet's wallets list (P2-T20; wc-wallets, W28; Review Focus 2 and
// 3). Each case mounts through mountWallet, in Thai and by day unless it says
// otherwise, on wc-wallets' four wallets (the account's kept looks and order)
// with one archived at ฿0.
//
// Reanimated keeps the reorder tray's card unseen (visibility: hidden) until
// its entering animation starts, which happy-dom never fires, and queries by
// role skip what is unseen: startAnimations() fires it, as
// Tray.render.test.tsx does. react-native-web drops numberOfLines from the
// DOM, so the props that reach the app's Text are recorded, as
// WalletCard.render.test.tsx does. expo-router and its params context are the
// catalogue's recorded router, and the route's shared resources are the
// case's own fake.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
// Unarchive keys its commands with Quick add's helpers, which load the device's id maker (as the catalogue suites mock it).
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
const shared = vi.hoisted(() => ({ resources: null as unknown }));
vi.mock('@mobile/api/sharedV1', () => ({ getSharedV1Resources: () => shared.resources }));
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

import type { WalletSnapshot } from '@gogospend/contracts';
import type { ReactElement } from 'react';
import { Text } from 'react-native';

import SpendWalletsRoute from '../../../app/spend/wallets';
import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { LocalRouteParamsContext, router } from '@mobile/dev/catalogue/routerTestStub';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { translateCopy } from '@mobile/i18n/messages';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { materialPaint, walletDark, walletLight } from '@mobile/theme/walletPalette';
import { LOOKS_NAME, useWalletLooks, WALLET_ORDER_NAME } from '../looks/WalletLooksProvider';
import type { WalletLook } from '../looks/walletLooks';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { AX5, mountWallet, TEST_ACCOUNT_ID } from '../testing/walletHarness';
import { WalletsListScreen } from './WalletsListScreen';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  router.canGoBack.mockReset();
  router.canGoBack.mockReturnValue(true);
  seen.props.length = 0;
  shared.resources = null;
});

/** Lets the wallets' read, the kept looks' read and the commands land. */
const settle = async () => {
  for (let tick = 0; tick < 3; tick += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
};

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

const id = (n: number) => `0000000a-0000-4000-8000-00000000000${n}`;
const W = { main: id(1), cash: id(2), card: id(3), transit: id(4), old: id(5) } as const;
const snapshot = (walletId: string, name: string, openingMinor: string, archived = false): WalletSnapshot => ({
  id: walletId, name, currency: 'THB', opening_minor: openingMinor, tracking_start: '2026-09-01', archived, version: 1,
});

/** wc-wallets: ฿24,860, ฿1,240, a credit card that has spent ฿3,920 and ฿186; and one archived at ฿0. */
const board = (extra: readonly WalletSnapshot[] = []) => createFakeResources({
  wallets: [
    snapshot(W.main, 'บัญชีหลัก', '2486000'),
    snapshot(W.cash, 'เงินสด', '124000'),
    snapshot(W.card, 'บัตรเครดิต', '-392000'),
    snapshot(W.transit, 'บัตรเดินทาง', '18600'),
    snapshot(W.old, 'บัตรเก่า', '0', true),
    ...extra,
  ],
});
const LOOKS: Readonly<Record<string, WalletLook>> = {
  [W.main]: { kind: 'bank', material: 'silk', face: 'smile' },
  [W.cash]: { kind: 'cash', material: 'paper', face: 'wink' },
  [W.card]: { kind: 'credit_card', material: 'titanium', face: 'calm' },
  [W.transit]: { kind: 'transit', material: 'sky', face: 'wow' },
  [W.old]: { kind: 'credit_card', material: 'peach', face: 'happy' },
};
/** The account's kept looks, and the board's order, front first. */
const KEPT = { [LOOKS_NAME]: JSON.stringify(LOOKS), [WALLET_ORDER_NAME]: JSON.stringify([W.main, W.cash, W.card, W.transit]) };
const ORDER_KEY = `jotbun.account.${TEST_ACCOUNT_ID}.${WALLET_ORDER_NAME}`;

const LOCALES = ['th', 'en'] as const;
const MODES = [['light', walletLight], ['dark', walletDark]] as const;
const WORDS = {
  th: {
    title: 'กระเป๋าเงิน', back: 'กลับ', reorder: 'จัดเรียง', close: 'ปิด', tryAgain: 'ลองอีกครั้ง', cardKind: 'ยอดที่ใช้ไป',
    summary: ['รวมทุกกระเป๋า', 'ใช้อยู่ 4 ใบ', 'เงินที่มี', '· หักบัตรเครดิตที่ใช้ไป'],
    rows: ['บัญชีหลัก บัญชีธนาคาร ยอด 24,860 บาท', 'เงินสด ในกระเป๋าสตางค์ ยอด 1,240 บาท', 'บัตรเครดิต ใช้ไป 3,920 บาท', 'บัตรเดินทาง BTS / MRT ยอด 186 บาท'],
    shown: ['บัญชีหลักบัญชีธนาคาร฿24,860', 'เงินสดในกระเป๋าสตางค์฿1,240', 'บัตรเครดิตยอดที่ใช้ไปใช้ไป฿3,920', 'บัตรเดินทางBTS / MRT฿186'],
    hiddenRows: ['บัญชีหลัก บัญชีธนาคาร ยอด ซ่อนยอดเงินอยู่', 'เงินสด ในกระเป๋าสตางค์ ยอด ซ่อนยอดเงินอยู่', 'บัตรเครดิต ใช้ไป ซ่อนยอดเงินอยู่', 'บัตรเดินทาง BTS / MRT ยอด ซ่อนยอดเงินอยู่'],
    add: 'เพิ่มกระเป๋า เงินสด บัญชี บัตร หรือบัตรเดินทาง',
    archived: 'เก็บถาวร 1 ใบ',
    note: 'รายการของกระเป๋าที่เก็บถาวรยังอยู่ในประวัติ นำกลับมาใช้ได้ทุกเมื่อ',
    unarchive: (name: string) => `นำ${name}กลับมาใช้`,
    up: (name: string) => `ย้าย${name}ขึ้น`,
    down: (name: string) => `ย้าย${name}ลง`,
  },
  en: {
    title: 'Wallets', back: 'Back', reorder: 'Arrange', close: 'Close', tryAgain: 'Try again', cardKind: 'Amount spent',
    summary: ['All wallets', '4 in use', 'Money you have', '· less credit card spending'],
    rows: ['บัญชีหลัก Bank account balance 24,860 baht', 'เงินสด Cash in hand balance 1,240 baht', 'บัตรเครดิต spent 3,920 baht', 'บัตรเดินทาง BTS / MRT balance 186 baht'],
    shown: ['บัญชีหลักBank account฿24,860', 'เงินสดCash in hand฿1,240', 'บัตรเครดิตAmount spentSpent฿3,920', 'บัตรเดินทางBTS / MRT฿186'],
    hiddenRows: ['บัญชีหลัก Bank account balance Amount hidden', 'เงินสด Cash in hand balance Amount hidden', 'บัตรเครดิต spent Amount hidden', 'บัตรเดินทาง BTS / MRT balance Amount hidden'],
    add: 'Add a wallet Cash, a bank account, a card or a travel card',
    archived: 'Archived 1',
    note: "An archived wallet's entries stay in History. You can use it again any time.",
    unarchive: (name: string) => `Use ${name} again`,
    up: (name: string) => `Move ${name} up`,
    down: (name: string) => `Move ${name} down`,
  },
} as const;

/** The rows of the list, front first. */
const rows = () => screen.queryAllByTestId(/^wallet-row-/);
const rowIds = () => rows().map((row) => row.getAttribute('data-testid')?.slice('wallet-row-'.length));
/** The reorder tray's rows, front first: each wallet's name. */
const trayNames = () => screen.queryAllByTestId(/^reorder-row-/).map((row) => row.textContent);
const kept = (stored: Map<string, string>, key = ORDER_KEY) => JSON.parse(stored.get(key) ?? 'null') as unknown;

test('the list shows each wallet with its kind line and amount, the add tile and the archived count', async () => {
  for (const locale of LOCALES) {
    for (const [mode, colors] of MODES) {
      const at = `${locale} ${mode}`;
      const words = WORDS[locale];
      mountWallet(<WalletsListScreen />, { resources: board().resources, account: KEPT, locale, mode });
      await settle();
      expect(screen.queryAllByRole('heading', { name: words.title }), at).toHaveLength(1);
      expect([named('button', words.back), named('button', words.reorder)].length, at).toBe(2);
      // The summary: every wallet in use added up, and what the credit card spent taken off what is held.
      const summary = found('wallets-summary');
      for (const line of words.summary) expect(summary.textContent, `${at}: ${line}`).toContain(line);
      expect([found('wallets-total').textContent, found('wallets-held-amount').textContent, found('wallets-credit-used').textContent], at).toEqual(['฿22,366', '฿26,286', '฿3,920']);
      expect(summary.style.backgroundColor, at).toBe(rgba(colors.card));
      // A row per wallet in use, front first, each said as the board says it; the archived one is not among them.
      expect(rowIds(), at).toEqual([W.main, W.cash, W.card, W.transit]);
      expect(rows().map((row) => row.getAttribute('aria-label')), at).toEqual(words.rows);
      expect(rows().map((row) => row.textContent), at).toEqual(words.shown);
      // Each row's words are in its material's colours.
      expect(within(found(`wallet-row-${W.card}`)).getByText('บัตรเครดิต').style.color, at).toBe(rgba(materialPaint('titanium', mode === 'dark').text));
      expect(within(found(`wallet-row-${W.main}`)).getByText('บัญชีหลัก').style.color, at).toBe(rgba(materialPaint('silk', mode === 'dark').text));
      expect(within(found(`wallet-row-${W.card}`)).getByText(words.cardKind).style.color, at).toBe(rgba(materialPaint('titanium', mode === 'dark').quietText));
      // On its own material, with Bun's face (the material, the face and the chevron are its three drawings).
      expect(found(`wallet-row-${W.card}`).querySelector('linearGradient')?.getAttribute('id'), at).toBe(`wallet-material-titanium-${mode}`);
      expect(found(`wallet-row-${W.main}`).querySelectorAll('svg'), at).toHaveLength(3);
      expect(found('wallets-add').style.borderStyle, at).toBe('dashed');
      expect(found('wallets-add').getAttribute('aria-label'), at).toBe(words.add);
      const archived = found('wallets-archived-row');
      expect([archived.getAttribute('aria-label'), archived.getAttribute('aria-expanded')], at).toEqual([words.archived, 'false']);
      expect(screen.queryByText(words.note), at).not.toBeNull();
      expect(screen.queryByTestId('wallets-archived'), at).toBeNull();
      expect(found('wallets-list').style.backgroundColor, at).toBe(rgba(colors.ground));
      cleanup();
    }
  }
});

test('unarchive sends one command and the wallet returns', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    const fake = board();
    mountWallet(<WalletsListScreen />, { resources: fake.resources, account: KEPT, locale });
    await settle();
    const chevron = () => [...found('wallets-archived-row').querySelectorAll('path')].at(-1)?.getAttribute('d');
    expect(chevron(), locale).toBe('M6 9l6 6 6-6');
    fireEvent.click(found('wallets-archived-row'));
    expect([found('wallets-archived-row').getAttribute('aria-expanded'), chevron()], locale).toEqual(['true', 'M6 15l6-6 6 6']);
    // The archived wallet, with its kind line, and นำกลับมาใช้ naming it.
    expect(found(`archived-wallet-${W.old}`).textContent, locale).toBe(locale === 'th' ? 'บัตรเก่ายอดที่ใช้ไปนำกลับมาใช้' : 'บัตรเก่าAmount spentUse again');
    // Two presses before React draws again send one command.
    const button = named('button', words.unarchive('บัตรเก่า'));
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await settle();
    expect(fake.callsOf('unarchiveWallet').map((call) => call.args.slice(0, 2)), locale).toEqual([[W.old, 1]]);
    // Read again in place: the wallet has its row again, after the kept order, and nothing is archived.
    expect(fake.callsOf('wallets'), locale).toHaveLength(2);
    expect(rowIds(), locale).toEqual([W.main, W.cash, W.card, W.transit, W.old]);
    expect(screen.queryByTestId('wallets-archived-row'), locale).toBeNull();
    cleanup();
  }
});

test('an unarchive whose answer is lost offers Try again under the same key; a refusal says so; a wallet changed on another device says so and is read again', async () => {
  const lost = board();
  lost.loseResponse('unarchiveWallet');
  mountWallet(<WalletsListScreen />, { resources: lost.resources, account: KEPT });
  await settle();
  fireEvent.click(found('wallets-archived-row'));
  fireEvent.click(named('button', 'นำบัตรเก่ากลับมาใช้'));
  await settle();
  expect(within(found('wallets-unarchive-problem')).getByRole('alert').textContent).toBe(translateCopy('Not confirmed yet. Your entry is kept; try again.', 'th'));
  // Held: nothing else is sent while this one's outcome is unknown.
  expect(named('button', 'นำบัตรเก่ากลับมาใช้').getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(named('button', 'ลองอีกครั้ง'));
  await settle();
  const calls = lost.callsOf('unarchiveWallet');
  expect(calls).toHaveLength(2);
  expect(calls[1].args).toEqual(calls[0].args);
  expect(rowIds()).toContain(W.old);
  expect(screen.queryByTestId('wallets-unarchive-problem')).toBeNull();
  cleanup();

  // A resend refused before processing because the session changed: still unknown, still held, and no Try again.
  const blocked = board();
  blocked.loseResponse('unarchiveWallet');
  mountWallet(<WalletsListScreen />, { resources: blocked.resources, account: KEPT });
  await settle();
  fireEvent.click(found('wallets-archived-row'));
  fireEvent.click(named('button', 'นำบัตรเก่ากลับมาใช้'));
  await settle();
  blocked.fail('unarchiveWallet', 'session_changed');
  fireEvent.click(named('button', 'ลองอีกครั้ง'));
  await settle();
  expect(blocked.callsOf('unarchiveWallet')).toHaveLength(2);
  expect(within(found('wallets-unarchive-problem')).getByRole('alert').textContent).toBe(translateCopy('Your session changed. Sign in again to save.', 'th'));
  expect(screen.queryByRole('button', { name: 'ลองอีกครั้ง' })).toBeNull();
  expect(named('button', 'นำบัตรเก่ากลับมาใช้').getAttribute('aria-disabled')).toBe('true');
  cleanup();

  // Refused before the server processed it: said in today's words, nothing held, no Try again.
  const refused = board();
  refused.fail('unarchiveWallet', 'signed_out');
  mountWallet(<WalletsListScreen />, { resources: refused.resources, account: KEPT });
  await settle();
  fireEvent.click(found('wallets-archived-row'));
  fireEvent.click(named('button', 'นำบัตรเก่ากลับมาใช้'));
  await settle();
  expect(within(found('wallets-unarchive-problem')).getByRole('alert').textContent).toBe(translateCopy('Sign in again to save.', 'th'));
  expect(screen.queryByRole('button', { name: 'ลองอีกครั้ง' })).toBeNull();
  expect(named('button', 'นำบัตรเก่ากลับมาใช้').getAttribute('aria-disabled')).toBeNull();
  expect(refused.callsOf('wallets')).toHaveLength(1);
  cleanup();

  // Changed on another device after the list was read: said so, and the list is read again as it is now.
  const moved = board();
  mountWallet(<WalletsListScreen />, { resources: moved.resources, account: KEPT });
  await settle();
  const old = moved.wallets.get(W.old) as WalletSnapshot;
  moved.wallets.set(W.old, { ...old, name: 'บัตรเก่ามาก', version: 2 });
  fireEvent.click(found('wallets-archived-row'));
  fireEvent.click(named('button', 'นำบัตรเก่ากลับมาใช้'));
  await settle();
  expect(within(found('wallets-unarchive-problem')).getByRole('alert').textContent).toBe(translateCopy('This wallet changed on another device.', 'th'));
  expect(moved.callsOf('wallets')).toHaveLength(2);
  expect(named('button', 'นำบัตรเก่ามากกลับมาใช้').getAttribute('aria-disabled')).toBeNull();
});

test('reorder moves a wallet up and keeps the order front-first for this account', async () => {
  const diary = createFakeDiary();
  const view = mountWallet(<WalletsListScreen />, { resources: board().resources, account: KEPT, diary: diary.diary });
  await settle();
  fireEvent.click(named('button', 'จัดเรียง'));
  await settle();
  startAnimations();
  expect(screen.queryAllByRole('dialog', { name: 'จัดเรียง' })).toHaveLength(1);
  expect(trayNames()).toEqual(['บัญชีหลัก', 'เงินสด', 'บัตรเครดิต', 'บัตรเดินทาง']);
  expect(found(`reorder-row-${W.card}`).querySelector('linearGradient')?.getAttribute('id')).toBe('wallet-material-titanium-light');
  fireEvent.click(named('button', 'ย้ายเงินสดขึ้น'));
  // The tray shows the move at once, ahead of the kept order.
  expect(trayNames()).toEqual(['เงินสด', 'บัญชีหลัก', 'บัตรเครดิต', 'บัตรเดินทาง']);
  await settle();
  // Kept for this account, front first, and the list behind the tray follows it.
  expect(kept(view.stored)).toEqual([W.cash, W.main, W.card, W.transit]);
  expect(rowIds()).toEqual([W.cash, W.main, W.card, W.transit]);
  // Two presses before React draws again move a wallet two places.
  const up = named('button', 'ย้ายบัตรเดินทางขึ้น');
  act(() => {
    fireEvent.click(up);
    fireEvent.click(up);
  });
  await settle();
  expect(kept(view.stored)).toEqual([W.cash, W.transit, W.main, W.card]);
  expect(trayNames()).toEqual(['เงินสด', 'บัตรเดินทาง', 'บัญชีหลัก', 'บัตรเครดิต']);
  fireEvent.click(named('button', 'ปิด'));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
  expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  // Another account opens with an order of its own: the tray opens on that order, not on what it made before.
  const other = '00000000-0000-4000-8000-0000000000bb';
  view.stored.set(`jotbun.account.${other}.${WALLET_ORDER_NAME}`, JSON.stringify([W.card, W.main, W.transit, W.cash]));
  act(() => diary.set({ accountId: other }));
  await settle();
  fireEvent.click(named('button', 'จัดเรียง'));
  await settle();
  startAnimations();
  expect(trayNames()).toEqual(['บัตรเครดิต', 'บัญชีหลัก', 'บัตรเดินทาง', 'เงินสด']);
  fireEvent.click(named('button', 'ย้ายบัญชีหลักลง'));
  await settle();
  expect(kept(view.stored, `jotbun.account.${other}.${WALLET_ORDER_NAME}`)).toEqual([W.card, W.transit, W.main, W.cash]);
  // The first account's order is untouched.
  expect(kept(view.stored)).toEqual([W.cash, W.transit, W.main, W.card]);
});

test('?reorder=1 opens the reorder tray', async () => {
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'wallet');
  const withParam = (element: ReactElement) => <LocalRouteParamsContext.Provider value={{ reorder: '1' }}>{element}</LocalRouteParamsContext.Provider>;
  const fake = board();
  shared.resources = fake.resources;
  mountWallet(withParam(<SpendWalletsRoute />), { resources: fake.resources, account: KEPT });
  await settle();
  startAnimations();
  expect(screen.queryAllByRole('dialog', { name: 'จัดเรียง' })).toHaveLength(1);
  expect(trayNames()).toEqual(['บัญชีหลัก', 'เงินสด', 'บัตรเครดิต', 'บัตรเดินทาง']);
  cleanup();
  // Without it, the list alone.
  mountWallet(<SpendWalletsRoute />, { resources: fake.resources, account: KEPT });
  await settle();
  expect(screen.queryAllByRole('heading', { name: 'กระเป๋าเงิน' })).toHaveLength(1);
  expect(screen.queryAllByRole('dialog')).toHaveLength(0);
  cleanup();
  // With no account open nothing could be kept: no จัดเรียง, and ?reorder=1 opens nothing.
  mountWallet(withParam(<SpendWalletsRoute />), { resources: fake.resources, diary: null });
  await settle();
  const labels = rows().map((row) => row.getAttribute('aria-label'));
  expect(labels).toHaveLength(4);
  expect(labels).toEqual(expect.arrayContaining(['บัญชีหลัก ยอด 24,860 บาท', 'เงินสด ยอด 1,240 บาท', 'บัตรเครดิต ยอด ติดลบ 3,920 บาท', 'บัตรเดินทาง ยอด 186 บาท']));
  expect(found(`wallet-row-${W.card}`).textContent).toBe('บัตรเครดิต−฿3,920');
  // No kind is kept, so no wallet is a credit card: the total alone, with no line for what is held.
  expect([found('wallets-total').textContent, screen.queryByTestId('wallets-held')]).toEqual(['฿22,366', null]);
  expect(screen.queryByRole('button', { name: 'จัดเรียง' })).toBeNull();
  expect(screen.queryAllByRole('dialog')).toHaveLength(0);
});

test('every row and arrow is at least 44 pt, and each arrow names its wallet', async () => {
  for (const locale of LOCALES) {
    for (const [mode] of MODES) {
      const at = `${locale} ${mode}`;
      const words = WORDS[locale];
      mountWallet(<WalletsListScreen />, { resources: board().resources, account: KEPT, locale, mode });
      await settle();
      fireEvent.click(found('wallets-archived-row'));
      const minimum = (element: HTMLElement) => Number.parseFloat(element.style.minHeight || element.style.height);
      for (const control of [...rows(), found('wallets-add'), found('wallets-archived-row'), found('wallets-reorder'), named('button', words.back), named('button', words.unarchive('บัตรเก่า'))]) {
        expect(minimum(control), `${at}: ${control.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
      }
      fireEvent.click(named('button', words.reorder));
      await settle();
      startAnimations();
      const names = ['บัญชีหลัก', 'เงินสด', 'บัตรเครดิต', 'บัตรเดินทาง'];
      for (const row of screen.queryAllByTestId(/^reorder-row-/)) expect(minimum(row), `${at}: ${row.textContent}`).toBeGreaterThanOrEqual(44);
      names.forEach((name, index) => {
        for (const [arrow, end] of [[named('button', words.up(name)), index === 0], [named('button', words.down(name)), index === names.length - 1]] as const) {
          expect([arrow.style.width, arrow.style.height], `${at}: ${arrow.getAttribute('aria-label')}`).toEqual(['44px', '44px']);
          // The first can go no higher and the last no lower.
          expect(arrow.getAttribute('aria-disabled'), `${at}: ${arrow.getAttribute('aria-label')}`).toBe(end ? 'true' : null);
        }
      });
      cleanup();
    }
  }
});

test('when the credit cards have spent more than is held, the total is below zero and says so', async () => {
  const deep = createFakeResources({ wallets: [snapshot(W.main, 'บัญชีหลัก', '120000'), snapshot(W.card, 'บัตรเครดิต', '-392000')] });
  mountWallet(<WalletsListScreen />, { resources: deep.resources, account: KEPT });
  await settle();
  const total = found('wallets-total');
  expect([total.textContent, total.getAttribute('aria-label')]).toEqual(['−฿2,720', 'ติดลบ 2,720 บาท']);
  expect([found('wallets-held-amount').textContent, found('wallets-credit-used').textContent]).toEqual(['฿1,200', '฿3,920']);
});

test('a row opens its wallet, the add tile a new wallet that comes back here, and back goes back or home', async () => {
  mountWallet(<WalletsListScreen />, { resources: board().resources, account: KEPT });
  await settle();
  fireEvent.click(found(`wallet-row-${W.card}`));
  fireEvent.click(found('wallets-add'));
  // P2-T21's flow returns to the list it was opened from (P2-T20's review).
  expect(router.push.mock.calls).toEqual([[`/spend/wallet/${W.card}`], [{ pathname: '/spend/wallet/new', params: { returnTo: '/spend/wallets' } }]]);
  fireEvent.click(named('button', 'กลับ'));
  expect([router.back.mock.calls.length, router.replace.mock.calls]).toEqual([1, []]);
  router.canGoBack.mockReturnValue(false);
  fireEvent.click(named('button', 'กลับ'));
  expect([router.back.mock.calls.length, router.replace.mock.calls]).toEqual([1, [['/spend']]]);
});

test('private mode hides every amount on the list, and each row says only that its amount is hidden', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    mountWallet(<WalletsListScreen />, { resources: board().resources, account: KEPT, device: { [PRIVATE_MODE_NAME]: '1' }, locale });
    await settle();
    expect([found('wallets-total').textContent, found('wallets-held-amount').textContent, found('wallets-credit-used').textContent], locale).toEqual(['฿••••', '฿••••', '฿••••']);
    expect(rows().map((row) => row.getAttribute('aria-label')), locale).toEqual(words.hiddenRows);
    // No digit of any amount on screen or in a label (Review Focus 2).
    const said = [document.body.textContent ?? '', ...[...document.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label') ?? '')].join(' ');
    for (const amount of ['22,366', '26,286', '24,860', '1,240', '3,920', '186']) expect(said, `${locale}: ${amount}`).not.toContain(amount);
    cleanup();
  }
});

test('at AX5 a row moves its amount under its name, and the longest name and the largest amount wrap', async () => {
  const LONG_NAME = 'บัญชีออมทรัพย์สำหรับค่าเทอมลูกและค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดปีนะ';
  const big = id(6);
  const resources = board([snapshot(big, LONG_NAME, '99999999999')]).resources;
  for (const [scale, under] of [[1, false], [AX5, true]] as const) {
    mountWallet(<WalletsListScreen />, { resources, account: KEPT, fontScale: scale });
    await settle();
    fireEvent.click(found('wallets-archived-row'));
    expect(found(`wallet-words-${big}`).contains(found(`wallet-amount-${big}`)), `${scale}`).toBe(under);
    expect(found(`wallet-amount-${big}`).textContent, `${scale}`).toBe('฿999,999,999.99');
    expect(found(`archived-wallet-${W.old}`).style.flexDirection, `${scale}`).toBe(under ? 'column' : 'row');
    fireEvent.click(named('button', 'จัดเรียง'));
    await settle();
    startAnimations();
    expect(found(`reorder-row-${big}`).style.flexDirection, `${scale}`).toBe(under ? 'column' : 'row');
    expect(found(`reorder-row-${big}`).textContent, `${scale}`).toBe(LONG_NAME);
    // Nothing is clamped to a line.
    expect(seen.props.filter((props) => props.numberOfLines !== undefined), `${scale}`).toEqual([]);
    cleanup();
    seen.props.length = 0;
  }
});

test('a load problem says so in today\'s words, and Try again reads the wallets again', async () => {
  const held = board();
  const release = held.hold('wallets');
  mountWallet(<WalletsListScreen />, { resources: held.resources, account: KEPT });
  await settle();
  expect(found('wallets-loading').textContent).toBe(translateCopy('Loading your wallets', 'th'));
  release();
  await settle();
  expect(rowIds()).toHaveLength(4);
  cleanup();

  const failing = board();
  failing.fail('wallets', 'network');
  mountWallet(<WalletsListScreen />, { resources: failing.resources, account: KEPT });
  await settle();
  expect(within(found('wallets-problem')).getByRole('alert').textContent).toBe(translateCopy("We couldn't load your diary.", 'th'));
  expect(rows()).toHaveLength(0);
  fireEvent.click(named('button', 'ลองอีกครั้ง'));
  await settle();
  expect(failing.callsOf('wallets')).toHaveLength(2);
  expect(rowIds()).toEqual([W.main, W.cash, W.card, W.transit]);
  cleanup();

  // A problem trying again cannot help offers no Try again.
  const signedOut = board();
  signedOut.fail('wallets', 'signed_out');
  mountWallet(<WalletsListScreen />, { resources: signedOut.resources, account: KEPT });
  await settle();
  expect(within(found('wallets-problem')).getByRole('alert').textContent).toBe(translateCopy('Sign in again to see your diary.', 'th'));
  expect(screen.queryByRole('button', { name: 'ลองอีกครั้ง' })).toBeNull();
});

test("the wallets list's sections come right after the add tray's, and each opens in its state on the catalogue's own account", async () => {
  const ids = WALLET_SECTIONS.map((section) => section.id);
  const at = ids.indexOf('bw-wallets');
  expect(ids.slice(at - 1, at + 3)).toEqual(['bw-tray-income', 'bw-wallets', 'bw-wallets-archived', 'bw-wallets-reorder']);
  for (const sectionId of ['bw-wallets', 'bw-wallets-archived', 'bw-wallets-reorder']) {
    const section = WALLET_SECTIONS.find((each) => each.id === sectionId);
    const view = mountWallet(<>{section?.render()}</>);
    // The section's script runs its steps (each may wait up to 8 s), then the stage says ready, or where it stopped.
    await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
    expect(screen.queryByTestId('catalogue-screen-ready'), sectionId).not.toBeNull();
    startAnimations();
    expect(rows().map((row) => row.getAttribute('aria-label')), sectionId).toEqual(WORDS.th.rows);
    expect(screen.queryByTestId('wallets-archived') !== null, sectionId).toBe(sectionId === 'bw-wallets-archived');
    expect(screen.queryAllByRole('dialog', { name: 'จัดเรียง' }).length, sectionId).toBe(sectionId === 'bw-wallets-reorder' ? 1 : 0);
    if (sectionId === 'bw-wallets-archived') expect(screen.queryByRole('button', { name: 'นำบัตรเก่ากลับมาใช้' }), sectionId).not.toBeNull();
    // The person's own account is never written.
    expect([...view.stored.keys()].filter((key) => key.includes(TEST_ACCOUNT_ID)), sectionId).toEqual([]);
    cleanup();
  }
}, 60_000);

// P2-T20's review pins (reviews/P2-T20.md: PA, PB and PF), carried by the next task that edits this file (P2-T21).

test('opening and closing the reorder tray keeps nothing; each press keeps the order once', async () => {
  // The kept order also names an unknown id and an archived one: a write of what the tray shows would drop them.
  const keptOrder = JSON.stringify([W.main, W.cash, W.card, W.transit, 'gone', W.old]);
  const view = mountWallet(<WalletsListScreen />, { resources: board().resources, account: { [LOOKS_NAME]: JSON.stringify(LOOKS), [WALLET_ORDER_NAME]: keptOrder } });
  const writes: string[] = [];
  const set = view.stored.set.bind(view.stored);
  view.stored.set = (key: string, value: string) => {
    if (key === ORDER_KEY) writes.push(value);
    return set(key, value);
  };
  await settle();
  fireEvent.click(named('button', 'จัดเรียง'));
  await settle();
  startAnimations();
  expect(screen.queryAllByRole('dialog', { name: 'จัดเรียง' })).toHaveLength(1);
  fireEvent.click(named('button', 'ปิด'));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
  expect(writes).toEqual([]);
  expect(view.stored.get(ORDER_KEY)).toBe(keptOrder);
  fireEvent.click(named('button', 'จัดเรียง'));
  await settle();
  startAnimations();
  fireEvent.click(named('button', 'ย้ายเงินสดขึ้น'));
  await settle();
  expect(writes.map((value) => JSON.parse(value) as unknown)).toEqual([[W.cash, W.main, W.card, W.transit]]);
});

function OrderProbe() {
  const { order } = useWalletLooks();
  return <Text testID="order-probe">{order.join(',')}</Text>;
}

test('the route mounts no looks provider of its own, so a press reaches the provider around it', async () => {
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'wallet');
  const fake = board();
  shared.resources = fake.resources;
  mountWallet(
    <LocalRouteParamsContext.Provider value={{ reorder: '1' }}>
      <SpendWalletsRoute />
      <OrderProbe />
    </LocalRouteParamsContext.Provider>,
    { resources: fake.resources, account: KEPT },
  );
  await settle();
  startAnimations();
  expect(screen.getByTestId('order-probe').textContent).toBe([W.main, W.cash, W.card, W.transit].join(','));
  fireEvent.click(named('button', 'ย้ายเงินสดขึ้น'));
  await settle();
  expect(screen.getByTestId('order-probe').textContent).toBe([W.cash, W.main, W.card, W.transit].join(','));
});

test('wallets the kept order does not name follow by name, as the device diary sorts names', async () => {
  mountWallet(<WalletsListScreen />, { resources: board().resources, account: { [LOOKS_NAME]: JSON.stringify(LOOKS) } });
  await settle();
  // localeCompare (spendDiary.ts:105): เงินสด, บัญชีหลัก, บัตรเครดิต, บัตรเดินทาง; by code point เงินสด would come last.
  expect(rowIds()).toEqual([W.cash, W.main, W.card, W.transit]);
});
