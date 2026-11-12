// Editing a wallet (P2-T21; wc-wallet-edit; Review Focus 2). Each case
// mounts through mountWallet, in Thai and by day unless it says otherwise, on
// Bangkok's 24 October 2026, on wc-wallet-edit's บัญชีหลัก: opened at ฿30,000
// on 1 October, with ฿5,140 spent since, so ฿24,860 now; with a wallet at ฿0,
// a credit card ฿500 below zero, and a jar with no entries.
//
// Reanimated keeps the correction tray's card unseen until its entering
// animation starts, which happy-dom never fires: startAnimations() fires it,
// as Tray.render.test.tsx does. expo-router is the catalogue's recorded
// router. The wallets' and the entries' reads, and the commands, are the
// case's own fake.
//
// The fix round (R115) adds the cases for #429's review: no navigation once
// the person has left (m1, the probe PR1), a cleared opening balance sent as
// ฿0 (PR4, the survivor Y7), Try again held by the ref (PR7, Y4), archive held
// while a save's answer is unknown (Y6), the notice cleared by the next save
// (Y9), and the refused archive's ฿0 in private mode (n2, PR5).
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
// Saving keys its commands with Quick add's helpers, which load the device's id maker (as the catalogue suites mock it).
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import type { TransactionDto, WalletSnapshot } from '@gogospend/contracts';

import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import { translateCopy } from '@mobile/i18n/messages';
import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { LOOKS_NAME } from '../looks/WalletLooksProvider';
import type { WalletLook } from '../looks/walletLooks';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { mountWallet, TEST_ACCOUNT_ID } from '../testing/walletHarness';
import { WalletEditScreen } from './WalletEditScreen';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const fn of [router.push, router.replace, router.back, router.dismissTo]) fn.mockReset();
  router.canGoBack.mockReset();
  router.canGoBack.mockReturnValue(true);
});

/** Bangkok's 24 October 2026, at noon. */
const NOW = new Date('2026-10-24T05:00:00.000Z');
const LOOKS_KEY = `jotbun.account.${TEST_ACCOUNT_ID}.${LOOKS_NAME}`;

/** Lets the wallets' read, the entries' read, the kept looks and the commands land. */
const settle = async () => {
  for (let tick = 0; tick < 4; tick += 1) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
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
const W = { main: id(1), zero: id(2), below: id(3), jar: id(4) } as const;
const snapshot = (walletId: string, name: string, openingMinor: string, trackingStart = '2026-10-01'): WalletSnapshot => ({
  id: walletId, name, currency: 'THB', opening_minor: openingMinor, tracking_start: trackingStart, archived: false, version: 1,
});
const spent = (recordId: string, walletId: string, amountMinor: string) => ({
  id: recordId, type: 'expense', amount_minor: amountMinor, occurred_on: '2026-10-05', wallet_id: walletId,
  category_id: BUILTINS[0].id, note: null, merchant: null, deleted_at: null, version: 1,
}) as TransactionDto;

/** wc-wallet-edit's บัญชีหลัก (฿30,000 opening, ฿5,140 spent), a wallet at ฿0, a credit card ฿500 below zero and a jar with no entries. */
const board = () => createFakeResources({
  wallets: [snapshot(W.main, 'บัญชีหลัก', '3000000'), snapshot(W.zero, 'บัตรเก่า', '0'), snapshot(W.below, 'บัตรเครดิต', '0'), snapshot(W.jar, 'กระปุก', '10000')],
  records: [spent('0000000b-0000-4000-8000-000000000001', W.main, '514000'), spent('0000000b-0000-4000-8000-000000000002', W.below, '50000')],
});
const LOOKS: Readonly<Record<string, WalletLook>> = {
  [W.main]: { kind: 'bank', material: 'silk', face: 'smile' },
  [W.below]: { kind: 'credit_card', material: 'titanium', face: 'calm' },
};
const KEPT = { [LOOKS_NAME]: JSON.stringify(LOOKS) };

const LOCALES = ['th', 'en'] as const;
const MODES = [['light', walletLight], ['dark', walletDark]] as const;
const WORDS = {
  th: {
    back: 'กลับ', save: 'บันทึก', title: 'แก้ไขกระเป๋า', name: 'ชื่อกระเป๋า',
    preview: 'ตัวอย่างการ์ด บัญชีหลัก ยอด 24,860 บาท',
    opening: 'ยอดเริ่มต้น 30,000 บาท',
    tracking: 'เริ่มจด พฤหัส 1 ต.ค.',
    hasRecords: 'กระเป๋านี้มีรายการแล้ว ถ้าแก้ยอดนี้ บันจะถามเหตุผลก่อนบันทึก',
    later: ['เก็บได้เมื่อยอดเหลือ ฿0 ตอนนี้มี ฿24,860 โอนไปกระเป๋าอื่นก่อนนะ', 'เก็บได้เมื่อยอดเหลือ 0 บาท ตอนนี้มี 24,860 บาท โอนไปกระเป๋าอื่นก่อนนะ'],
    below: ['เก็บได้เมื่อยอดเหลือ ฿0 ตอนนี้ติดลบ ฿500 โอนเงินเข้ามาก่อนนะ', 'เก็บได้เมื่อยอดเหลือ 0 บาท ตอนนี้ติดลบ 500 บาท โอนเงินเข้ามาก่อนนะ'],
    archive: 'เก็บกระเป๋านี้ถาวร',
    faces: 'ขยิบตา', materials: 'พีช',
  },
  en: {
    back: 'Back', save: 'Save', title: 'Edit wallet', name: 'Wallet name',
    preview: 'Card preview บัญชีหลัก balance 24,860 baht',
    opening: 'Opening balance 30,000 baht',
    tracking: 'Tracking from Thu 1 Oct',
    hasRecords: 'This wallet has entries. If you change this amount, Bun asks why before saving.',
    later: ['You can archive it at ฿0. It holds ฿24,860 now: move it to another wallet first.', 'You can archive it at 0 baht. It holds 24,860 baht now: move it to another wallet first.'],
    below: ['You can archive it at ฿0. It is ฿500 below zero now: move money in first.', 'You can archive it at 0 baht. It is 500 baht below zero now: move money in first.'],
    archive: 'Archive this wallet',
    faces: 'Wink', materials: 'Peach',
  },
} as const;
const QUESTION = translateCopy('Why are you changing this?', 'th');
const REASONS = [translateCopy('A mistake when I set it up', 'th'), translateCopy('Match my real balance', 'th')];

const press = (...keys: string[]) => { for (const key of keys) fireEvent.click(named('button', key)); };
const keptLooks = (stored: Map<string, string>) => JSON.parse(stored.get(LOOKS_KEY) ?? '{}') as Record<string, unknown>;
const updates = (fake: ReturnType<typeof board>) => fake.callsOf('updateWallet').map((call) => call.args.slice(0, 3));
const trays = () => screen.queryAllByRole('dialog', { name: QUESTION });

test("editing shows the wallet's card, its fields, its look and why archive waits, in both modes and languages", async () => {
  for (const locale of LOCALES) {
    for (const [mode, colors] of MODES) {
      const at = `${locale} ${mode}`;
      const words = WORDS[locale];
      mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: board().resources, account: KEPT, locale, mode });
      await settle();
      expect(screen.queryAllByRole('heading', { name: words.title }), at).toHaveLength(1);
      expect([named('button', words.back), named('button', words.save)].length, at).toBe(2);
      expect(found('wallet-edit').style.backgroundColor, at).toBe(rgba(colors.ground));
      // The preview: the card as it reads now, in its kept material, one image.
      const preview = found('wallet-preview');
      expect([preview.getAttribute('role'), preview.getAttribute('aria-label')], at).toEqual(['img', words.preview]);
      expect(preview.querySelector('linearGradient')?.getAttribute('id'), at).toBe(`wallet-material-silk-${mode}`);
      expect((named('textbox', words.name) as HTMLInputElement).value, at).toBe('บัญชีหลัก');
      expect([found('look-face-smile').getAttribute('aria-checked'), found('look-material-silk').getAttribute('aria-checked')], at).toEqual(['true', 'true']);
      expect([found('wallet-opening').textContent, found('wallet-opening').getAttribute('aria-label'), found('wallet-tracking').textContent], at).toEqual(['฿30,000', words.opening, words.tracking]);
      expect(found('wallet-has-records').textContent, at).toBe(words.hasRecords);
      // ฿24,860 is held, so archiving waits, and the screen says why with both amounts.
      const later = found('wallet-archive-later');
      expect([later.textContent, later.getAttribute('aria-label')], at).toEqual(words.later);
      expect(screen.queryByRole('button', { name: words.archive }), at).toBeNull();
      expect(trays(), at).toHaveLength(0);
      cleanup();
    }
  }
});

test('look changes are kept at once and need no command', async () => {
  const fake = board();
  const view = mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: fake.resources, account: KEPT });
  await settle();
  fireEvent.click(named('radio', 'ขยิบตา'));
  await settle();
  expect(keptLooks(view.stored)[W.main]).toEqual({ kind: 'bank', material: 'silk', face: 'wink' });
  fireEvent.click(named('radio', 'พีช'));
  await settle();
  expect(keptLooks(view.stored)[W.main]).toEqual({ kind: 'bank', material: 'peach', face: 'wink' });
  // The preview and the choices follow what is kept; nothing is sent.
  expect(found('wallet-preview').querySelector('linearGradient')?.getAttribute('id')).toBe('wallet-material-peach-light');
  expect([found('look-face-wink').getAttribute('aria-checked'), found('look-material-peach').getAttribute('aria-checked')]).toEqual(['true', 'true']);
  expect([fake.callsOf('updateWallet'), router.back.mock.calls]).toEqual([[], []]);
});

test('editing a wallet with records asks why before a correction is sent', async () => {
  const fake = board();
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: fake.resources, account: KEPT });
  await settle();
  // The first key starts the opening balance over: ฿5.
  press('5');
  expect(found('wallet-opening').textContent).toBe('฿5');
  expect(found('wallet-preview').getAttribute('aria-label')).toBe('ตัวอย่างการ์ด บัญชีหลัก ยอด ติดลบ 5,135 บาท');
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  startAnimations();
  expect(trays()).toHaveLength(1);
  expect(within(trays()[0]).getAllByRole('button').map((button) => button.getAttribute('aria-label')).filter((label) => REASONS.includes(label ?? ''))).toEqual(REASONS);
  expect(updates(fake)).toEqual([]);
  // Closed without a reason: nothing is sent.
  fireEvent.click(named('button', 'ปิด'));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
  expect([trays(), updates(fake)]).toEqual([[], []]);
  // Asked again, and answered: the correction goes with its reason, once.
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  startAnimations();
  fireEvent.click(named('button', REASONS[1]));
  await settle();
  expect(updates(fake)).toEqual([[W.main, 1, { opening_minor: '500', correction_reason: 'balance_reconciliation' }]]);
  expect(router.back.mock.calls).toHaveLength(1);
  cleanup();

  // A rename is not a correction: no question, and only the name is sent.
  const renamed = board();
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: renamed.resources, account: KEPT });
  await settle();
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  expect([trays(), updates(renamed)]).toEqual([[], [[W.main, 1, { name: 'บัญชีเงินเดือน' }]]]);
  cleanup();

  // A wallet with no entries is corrected without a reason.
  const jar = board();
  mountWallet(<WalletEditScreen walletId={W.jar} now={NOW} />, { resources: jar.resources, account: KEPT });
  await settle();
  expect(screen.queryByTestId('wallet-has-records')).toBeNull();
  press('5');
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  expect([trays(), updates(jar)]).toEqual([[], [[W.jar, 1, { opening_minor: '500' }]]]);
  cleanup();

  // While it is not known whether the wallet has entries, the question is asked too.
  const unknown = board();
  unknown.hold('history');
  mountWallet(<WalletEditScreen walletId={W.jar} now={NOW} />, { resources: unknown.resources, account: KEPT });
  await settle();
  // The note says the wallet has entries only once that is known.
  expect(screen.queryByTestId('wallet-has-records')).toBeNull();
  press('5');
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  startAnimations();
  expect([trays().length, updates(unknown)]).toEqual([1, []]);
  cleanup();

  // Jotbun asks for the reason itself (its entries arrived meanwhile): the question opens, and the answer goes with it.
  const late = board();
  mountWallet(<WalletEditScreen walletId={W.jar} now={NOW} />, { resources: late.resources, account: KEPT });
  await settle();
  late.records.set('0000000b-0000-4000-8000-000000000009', spent('0000000b-0000-4000-8000-000000000009', W.jar, '100'));
  press('5');
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  startAnimations();
  expect(trays()).toHaveLength(1);
  fireEvent.click(named('button', REASONS[0]));
  await settle();
  expect(updates(late)).toEqual([[W.jar, 1, { opening_minor: '500' }], [W.jar, 1, { opening_minor: '500', correction_reason: 'entry_error' }]]);
});

test('archive is offered only at ฿0; otherwise the screen says why', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    const fake = board();
    mountWallet(<WalletEditScreen walletId={W.zero} now={NOW} />, { resources: fake.resources, account: KEPT, locale });
    await settle();
    expect(screen.queryByTestId('wallet-archive-later'), locale).toBeNull();
    // Two presses before React draws again send one archive; archived, the person is taken to the list.
    const archive = named('button', words.archive);
    act(() => {
      fireEvent.click(archive);
      fireEvent.click(archive);
    });
    await settle();
    expect(fake.callsOf('archiveWallet').map((call) => call.args.slice(0, 2)), locale).toEqual([[W.zero, 1]]);
    expect(router.dismissTo.mock.calls, locale).toEqual([['/spend/wallets']]);
    cleanup();
    router.dismissTo.mockReset();
    // Below zero, the line says so, and says to move money in.
    mountWallet(<WalletEditScreen walletId={W.below} now={NOW} />, { resources: board().resources, account: KEPT, locale });
    await settle();
    const later = found('wallet-archive-later');
    expect([later.textContent, later.getAttribute('aria-label')], locale).toEqual(words.below);
    expect(screen.queryByRole('button', { name: words.archive }), locale).toBeNull();
    cleanup();
  }
});

test('nothing changed goes back once with nothing sent, and two presses on บันทึก send one update', async () => {
  const fake = board();
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: fake.resources, account: KEPT });
  await settle();
  // Two presses before React draws again leave once (R115, m1).
  const unchanged = named('button', 'บันทึก');
  act(() => {
    fireEvent.click(unchanged);
    fireEvent.click(unchanged);
  });
  expect([updates(fake), router.back.mock.calls.length]).toEqual([[], 1]);
  cleanup();
  // With nothing to go back to, it goes to the list.
  router.canGoBack.mockReturnValue(false);
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: fake.resources, account: KEPT });
  await settle();
  fireEvent.click(named('button', 'บันทึก'));
  expect(router.replace.mock.calls).toEqual([['/spend/wallets']]);
  cleanup();
  router.canGoBack.mockReturnValue(true);
  router.back.mockReset();
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: fake.resources, account: KEPT });
  await settle();
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  const save = named('button', 'บันทึก');
  act(() => {
    fireEvent.click(save);
    fireEvent.click(save);
  });
  await settle();
  expect([updates(fake), router.back.mock.calls.length]).toEqual([[[W.main, 1, { name: 'บัญชีเงินเดือน' }]], 1]);
  // A name it cannot save says so on its field, and sends nothing.
  cleanup();
  const blank = board();
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: blank.resources, account: KEPT });
  await settle();
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: '   ' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  expect([found('wallet-name-problem').textContent, updates(blank)]).toEqual([translateCopy('Enter a wallet name', 'th'), []]);
});

test('a save whose answer is lost offers Try again under the same key; a wallet changed on another device says so and starts over; an archive refused because the balance moved says so', async () => {
  const lost = board();
  lost.loseResponse('updateWallet');
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: lost.resources, account: KEPT });
  await settle();
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  expect(within(found('wallet-edit-problem')).getByRole('alert').textContent).toBe(translateCopy('Not confirmed yet. Your entry is kept; try again.', 'th'));
  // Held: nothing else is sent, and nothing on the form changes, while this one's outcome is unknown.
  expect(named('button', 'บันทึก').getAttribute('aria-disabled')).toBe('true');
  expect(named('textbox', 'ชื่อกระเป๋า').hasAttribute('readonly')).toBe(true);
  expect(named('button', '5').getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(named('button', 'ลองอีกครั้ง'));
  await settle();
  const calls = lost.callsOf('updateWallet');
  expect(calls).toHaveLength(2);
  expect(calls[1].args).toEqual(calls[0].args);
  expect(router.back.mock.calls).toHaveLength(1);
  cleanup();
  router.back.mockReset();

  // A resend refused before processing because the session changed: still unknown, still held, and no Try again.
  const blocked = board();
  blocked.loseResponse('updateWallet');
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: blocked.resources, account: KEPT });
  await settle();
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  blocked.fail('updateWallet', 'session_changed');
  fireEvent.click(named('button', 'ลองอีกครั้ง'));
  await settle();
  expect(within(found('wallet-edit-problem')).getByRole('alert').textContent).toBe(translateCopy('Your session changed. Sign in again to save.', 'th'));
  expect([screen.queryByRole('button', { name: 'ลองอีกครั้ง' }), named('button', 'บันทึก').getAttribute('aria-disabled')]).toEqual([null, 'true']);
  cleanup();

  // A refusal that names a field says so on it, whatever else it says (here the terms' refusal); one that waits on an update holds บันทึก.
  const field = board();
  field.fail('updateWallet', 'policy_required', { status: 403, code: 'POLICY_REQUIRED', fields: { name: 'POLICY_REQUIRED' } });
  field.fail('updateWallet', 'upgrade_required');
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: field.resources, account: KEPT });
  await settle();
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  expect([within(found('wallet-edit-problem')).getByRole('alert').textContent, found('wallet-name-problem').textContent]).toEqual([translateCopy('Check the highlighted fields.', 'th'), translateCopy('Check this and try again.', 'th')]);
  expect(named('button', 'บันทึก').getAttribute('aria-disabled')).toBeNull();
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  expect([field.callsOf('updateWallet').length, named('button', 'บันทึก').getAttribute('aria-disabled')]).toEqual([2, 'true']);
  cleanup();

  // Refused for good: said in today's words, nothing held, and บันทึก sends again.
  const refused = board();
  refused.fail('updateWallet', 'signed_out');
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: refused.resources, account: KEPT });
  await settle();
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  expect(within(found('wallet-edit-problem')).getByRole('alert').textContent).toBe(translateCopy('Sign in again to save.', 'th'));
  expect([screen.queryByRole('button', { name: 'ลองอีกครั้ง' }), named('button', 'บันทึก').getAttribute('aria-disabled')]).toEqual([null, null]);
  cleanup();

  // Changed on another device: said so, read again, and the form starts over from what Jotbun holds now.
  const moved = board();
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: moved.resources, account: KEPT });
  await settle();
  const main = moved.wallets.get(W.main) as WalletSnapshot;
  moved.wallets.set(W.main, { ...main, opening_minor: '3500000', version: 2 });
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  expect(found('wallet-edit-notice').textContent).toBe(translateCopy('This wallet changed on another device.', 'th'));
  expect(moved.callsOf('wallets')).toHaveLength(2);
  expect([(named('textbox', 'ชื่อกระเป๋า') as HTMLInputElement).value, found('wallet-opening').textContent]).toEqual(['บัญชีหลัก', '฿35,000']);
  expect(router.back.mock.calls).toHaveLength(0);
  // Saved again on the newer version, the opening balance theirs.
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  expect(updates(moved)).toEqual([[W.main, 1, { name: 'บัญชีเงินเดือน' }], [W.main, 2, { name: 'บัญชีเงินเดือน' }]]);
  cleanup();

  // An archive refused because the balance moved: said so, and read again, so the screen says why it waits.
  const spentMeanwhile = board();
  mountWallet(<WalletEditScreen walletId={W.zero} now={NOW} />, { resources: spentMeanwhile.resources, account: KEPT });
  await settle();
  spentMeanwhile.records.set('0000000b-0000-4000-8000-000000000003', { ...spent('0000000b-0000-4000-8000-000000000003', W.zero, '2000'), type: 'income' } as TransactionDto);
  fireEvent.click(named('button', 'เก็บกระเป๋านี้ถาวร'));
  await settle();
  expect(found('wallet-archive-refused').textContent).toBe(translateCopy("{name} wasn't archived: its balance is no longer {zero}.", 'th', { name: 'บัตรเก่า', zero: '฿0' }));
  expect(spentMeanwhile.callsOf('wallets')).toHaveLength(2);
  expect(found('wallet-archive-later').textContent).toBe('เก็บได้เมื่อยอดเหลือ ฿0 ตอนนี้มี ฿20 โอนไปกระเป๋าอื่นก่อนนะ');
  expect(router.dismissTo.mock.calls).toEqual([]);
});

test('once the person has left, a save or an archive that lands takes them nowhere more', async () => {
  // Back while a save is out goes back once; the save that lands after it goes nowhere.
  const out = board();
  const release = out.hold('updateWallet');
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: out.resources, account: KEPT });
  await settle();
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  fireEvent.click(named('button', 'กลับ'));
  await act(async () => { release(); });
  await settle();
  expect([updates(out), router.back.mock.calls.length]).toEqual([[[W.main, 1, { name: 'บัญชีเงินเดือน' }]], 1]);
  cleanup();
  router.back.mockReset();

  // The review's PR1: the spend layout's Slot unmounts the screen on back, then the save lands. Back once in all.
  const slot = board();
  const later = slot.hold('updateWallet');
  const view = mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: slot.resources, account: KEPT });
  await settle();
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  fireEvent.click(named('button', 'กลับ'));
  view.unmount();
  await act(async () => { later(); });
  await settle();
  expect(router.back.mock.calls.length).toBe(1);
  router.back.mockReset();

  // The screen went away another way (the system back) while its save was out: the save lands and takes no one anywhere.
  const gone = board();
  const landing = gone.hold('updateWallet');
  const away = mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: gone.resources, account: KEPT });
  await settle();
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  away.unmount();
  await act(async () => { landing(); });
  await settle();
  expect([updates(gone).length, router.back.mock.calls.length, router.replace.mock.calls]).toEqual([1, 0, []]);

  // An archive that lands after back goes nowhere either.
  const archiving = board();
  const archived = archiving.hold('archiveWallet');
  mountWallet(<WalletEditScreen walletId={W.zero} now={NOW} />, { resources: archiving.resources, account: KEPT });
  await settle();
  fireEvent.click(named('button', 'เก็บกระเป๋านี้ถาวร'));
  await settle();
  fireEvent.click(named('button', 'กลับ'));
  await act(async () => { archived(); });
  await settle();
  expect([archiving.callsOf('archiveWallet').length, router.back.mock.calls.length, router.dismissTo.mock.calls]).toEqual([1, 1, []]);
});

test('delete on the stored opening balance clears it to ฿0, and ฿0 is what is sent, with its reason', async () => {
  const fake = board();
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: fake.resources, account: KEPT });
  await settle();
  press('ลบตัวเลข');
  // The review's PR4: the screen says ฿0, and the card what ฿0 less the ฿5,140 spent leaves.
  expect([found('wallet-opening').textContent, found('wallet-opening').getAttribute('aria-label'), found('wallet-preview').getAttribute('aria-label')]).toEqual(['฿0', 'ยอดเริ่มต้น 0 บาท', 'ตัวอย่างการ์ด บัญชีหลัก ยอด ติดลบ 5,140 บาท']);
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  startAnimations();
  fireEvent.click(named('button', REASONS[0]));
  await settle();
  expect(updates(fake)).toEqual([[W.main, 1, { opening_minor: '0', correction_reason: 'entry_error' }]]);
});

test('two presses on Try again resend once, and the save that lands goes back once', async () => {
  // The review's PR7.
  const lost = board();
  lost.loseResponse('updateWallet');
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: lost.resources, account: KEPT });
  await settle();
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  const tryAgain = named('button', 'ลองอีกครั้ง');
  act(() => {
    fireEvent.click(tryAgain);
    fireEvent.click(tryAgain);
  });
  await settle();
  expect([lost.callsOf('updateWallet').length, router.back.mock.calls.length]).toEqual([2, 1]);
});

test("while a save's answer is unknown archive is held, and a press on it sends nothing", async () => {
  const lost = board();
  lost.loseResponse('updateWallet');
  mountWallet(<WalletEditScreen walletId={W.zero} now={NOW} />, { resources: lost.resources, account: KEPT });
  await settle();
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัตรใหม่' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  const archive = named('button', 'เก็บกระเป๋านี้ถาวร');
  expect(archive.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(archive);
  await settle();
  // Nothing was archived, and the update whose answer is unknown keeps its Try again.
  expect([lost.callsOf('archiveWallet'), screen.queryByRole('button', { name: 'ลองอีกครั้ง' }) !== null]).toEqual([[], true]);
});

test("the next save clears the notice that the wallet changed on another device, so it never sits beside that save's answer", async () => {
  const moved = board();
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: moved.resources, account: KEPT });
  await settle();
  const main = moved.wallets.get(W.main) as WalletSnapshot;
  moved.wallets.set(W.main, { ...main, opening_minor: '3500000', version: 2 });
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  expect(found('wallet-edit-notice').textContent).toBe(translateCopy('This wallet changed on another device.', 'th'));
  // Saved again on the newer version, and its answer lost: the notice is gone, and that save's own words show.
  moved.loseResponse('updateWallet');
  fireEvent.change(named('textbox', 'ชื่อกระเป๋า'), { target: { value: 'บัญชีเงินเดือน' } });
  fireEvent.click(named('button', 'บันทึก'));
  await settle();
  expect([screen.queryByTestId('wallet-edit-notice'), within(found('wallet-edit-problem')).getByRole('alert').textContent]).toEqual([null, translateCopy('Not confirmed yet. Your entry is kept; try again.', 'th')]);
});

test('an archive refused because the balance moved says its ฿0 in words, and in private mode masks it as the line below does', async () => {
  for (const locale of LOCALES) {
    for (const hidden of [false, true]) {
      const at = `${locale}${hidden ? ' private' : ''}`;
      const fake = board();
      mountWallet(<WalletEditScreen walletId={W.zero} now={NOW} />, { resources: fake.resources, account: KEPT, locale, device: hidden ? { [PRIVATE_MODE_NAME]: '1' } : {} });
      await settle();
      fake.records.set('0000000b-0000-4000-8000-000000000003', { ...spent('0000000b-0000-4000-8000-000000000003', W.zero, '2000'), type: 'income' } as TransactionDto);
      fireEvent.click(named('button', WORDS[locale].archive));
      await settle();
      const line = (zero: string) => translateCopy("{name} wasn't archived: its balance is no longer {zero}.", locale, { name: 'บัตรเก่า', zero });
      const said = hidden ? (locale === 'th' ? 'ซ่อนยอดเงินอยู่' : 'Amount hidden') : (locale === 'th' ? '0 บาท' : '0 baht');
      const refused = found('wallet-archive-refused');
      expect([refused.textContent, refused.getAttribute('aria-label')], at).toEqual([line(hidden ? '฿••••' : '฿0'), line(said)]);
      // In private mode no digit of an amount is left on the archive's lines (the review's PR5).
      expect(/[0-9]/.test(`${refused.textContent} ${found('wallet-archive-later').textContent}`), at).toBe(!hidden);
      cleanup();
    }
  }
});

test('private mode hides every amount on the edit screen, and the opening balance until a key is pressed', async () => {
  for (const locale of LOCALES) {
    const hidden = locale === 'th' ? 'ซ่อนยอดเงินอยู่' : 'Amount hidden';
    mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: board().resources, account: KEPT, device: { [PRIVATE_MODE_NAME]: '1' }, locale });
    await settle();
    expect(found('wallet-preview').getAttribute('aria-label'), locale).toBe(locale === 'th' ? `ตัวอย่างการ์ด บัญชีหลัก ยอด ${hidden}` : `Card preview บัญชีหลัก balance ${hidden}`);
    expect([found('wallet-opening').textContent, found('wallet-opening').getAttribute('aria-label')], locale).toEqual(['฿••••', `${locale === 'th' ? 'ยอดเริ่มต้น' : 'Opening balance'} ${hidden}`]);
    expect(found('wallet-archive-later').getAttribute('aria-label'), locale).toBe(locale === 'th'
      ? `เก็บได้เมื่อยอดเหลือ ${hidden} ตอนนี้มี ${hidden} โอนไปกระเป๋าอื่นก่อนนะ`
      : `You can archive it at ${hidden}. It holds ${hidden} now: move it to another wallet first.`);
    // No digit of any amount on screen or in a label (Review Focus 2).
    const said = () => [document.body.textContent ?? '', ...[...document.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label') ?? '')].join(' ');
    for (const amount of ['24,860', '30,000', '5,140']) expect(said(), `${locale}: ${amount}`).not.toContain(amount);
    // What the person types shows (R106).
    press('7');
    expect(found('wallet-opening').textContent, locale).toBe('฿7');
    cleanup();
  }
});

test('an archived or unknown wallet says it is gone; a load problem says so, and Try again reads again', async () => {
  const fake = board();
  const old = fake.wallets.get(W.zero) as WalletSnapshot;
  fake.wallets.set(W.zero, { ...old, archived: true, version: 2 });
  mountWallet(<WalletEditScreen walletId={W.zero} now={NOW} />, { resources: fake.resources, account: KEPT });
  await settle();
  expect(within(found('wallet-edit-gone')).getByRole('alert').textContent).toBe('กระเป๋านี้ถูกเก็บถาวรหรือไม่มีแล้ว');
  expect([screen.queryByRole('button', { name: 'บันทึก' }), screen.queryByTestId('wallet-preview')]).toEqual([null, null]);
  fireEvent.click(named('button', 'กลับ'));
  expect(router.back.mock.calls).toHaveLength(1);
  cleanup();
  mountWallet(<WalletEditScreen walletId="0000000a-0000-4000-8000-0000000000ff" now={NOW} />, { resources: board().resources, account: KEPT });
  await settle();
  expect(found('wallet-edit-gone').textContent).toBe('กระเป๋านี้ถูกเก็บถาวรหรือไม่มีแล้ว');
  cleanup();

  const held = board();
  const release = held.hold('wallets');
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: held.resources, account: KEPT });
  await settle();
  expect(found('wallet-edit-loading').textContent).toBe(translateCopy('Loading your wallets', 'th'));
  release();
  await settle();
  expect(screen.queryByTestId('wallet-preview')).not.toBeNull();
  cleanup();

  const failing = board();
  failing.fail('wallets', 'network');
  mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: failing.resources, account: KEPT });
  await settle();
  expect(within(found('wallet-edit-problem')).getByRole('alert').textContent).toBe(translateCopy("We couldn't load your diary.", 'th'));
  fireEvent.click(named('button', 'ลองอีกครั้ง'));
  await settle();
  expect([failing.callsOf('wallets').length, screen.queryByTestId('wallet-preview') !== null]).toEqual([2, true]);
});

test("every control on the edit screen is at least 44 pt, and the tray's reasons are named", async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    mountWallet(<WalletEditScreen walletId={W.zero} now={NOW} />, { resources: board().resources, account: KEPT, locale });
    await settle();
    const minimum = (element: HTMLElement) => Number.parseFloat(element.style.minHeight || element.style.height);
    for (const control of [named('button', words.back), named('button', words.save), named('button', words.archive), named('textbox', words.name), ...screen.getAllByRole('radio')]) {
      expect(minimum(control), `${locale}: ${control.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
    }
    press('5');
    fireEvent.click(named('button', words.save));
    await settle();
    // ฿0 to ฿5 on a wallet with no entries is sent at once; on บัญชีหลัก the tray asks.
    cleanup();
    mountWallet(<WalletEditScreen walletId={W.main} now={NOW} />, { resources: board().resources, account: KEPT, locale });
    await settle();
    press('5');
    fireEvent.click(named('button', words.save));
    await settle();
    startAnimations();
    const reasons = [translateCopy('A mistake when I set it up', locale), translateCopy('Match my real balance', locale)];
    for (const reason of reasons) expect(minimum(named('button', reason)), `${locale}: ${reason}`).toBeGreaterThanOrEqual(44);
    expect(screen.queryAllByRole('dialog', { name: translateCopy('Why are you changing this?', locale) }), locale).toHaveLength(1);
    cleanup();
  }
});
