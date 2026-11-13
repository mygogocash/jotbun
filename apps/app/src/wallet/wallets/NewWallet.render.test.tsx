// A new wallet (P2-T21; wc-wallet-type, the fields, bw-adding; Review Focus
// 2 and 3). Each case mounts through mountWallet, in Thai and by day unless it
// says otherwise, on Bangkok's 24 October 2026.
//
// Reanimated keeps an entering view unseen (visibility: hidden) until its
// animation starts, which happy-dom never fires, and queries by role skip what
// is unseen: startAnimations() fires it, as Tray.render.test.tsx does. The
// ceremony's card builder and the haptics are recorded (the builder still
// builds the real animation). react-native-web drops numberOfLines, so the
// props that reach the app's Text are recorded, as WalletCard.render.test.tsx
// does. expo-router is the catalogue's recorded router, and the route's shared
// resources are the case's own fake.
//
// The fix round (R115) adds the cases for #429's review: step 2's back once a
// create's answer is unknown (M1, the probe PR2, the survivor Y1), the look
// held while it is (PR8, Y2 and Y3), one wallet id per flow (Y8) and the
// card's own place to drop in (n1).
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
// The create keys its command with Quick add's helpers, which load the device's id maker (as the catalogue suites mock it).
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
const shared = vi.hoisted(() => ({ resources: null as unknown }));
vi.mock('@mobile/api/sharedV1', () => ({ getSharedV1Resources: () => shared.resources }));
const haptics = vi.hoisted(() => ({ played: [] as string[] }));
vi.mock('@mobile/lib/hapticMoment', () => ({ playHaptic: (moment: string) => { haptics.played.push(moment); } }));
const drops = vi.hoisted(() => ({ asked: [] as boolean[] }));
vi.mock('../motion/useWalletMotion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../motion/useWalletMotion')>();
  return { ...actual, walletAddedEntering: (reduced: boolean) => { drops.asked.push(reduced); return actual.walletAddedEntering(reduced); } };
});
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

import type { ReactElement } from 'react';

import SpendNewWalletRoute from '../../../app/spend/wallet/new';
import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import type { Recorded } from '@mobile/analytics/testing/recordAnalytics';
import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { LocalRouteParamsContext, router } from '@mobile/dev/catalogue/routerTestStub';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { translateCopy } from '@mobile/i18n/messages';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { LOOKS_NAME } from '../looks/WalletLooksProvider';
import { derivedLook } from '../looks/walletLooks';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { AX5, mountWallet, TEST_ACCOUNT_ID } from '../testing/walletHarness';
import { NewWalletFlow } from './NewWalletFlow';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const fn of [router.push, router.replace, router.back, router.dismissTo]) fn.mockReset();
  router.canGoBack.mockReset();
  router.canGoBack.mockReturnValue(true);
  shared.resources = null;
  haptics.played.length = 0;
  drops.asked.length = 0;
  seen.props.length = 0;
});

/** Bangkok's 24 October 2026, at noon. */
const NOW = new Date('2026-10-24T05:00:00.000Z');
const TODAY = '2026-10-24';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOOKS_KEY = `jotbun.account.${TEST_ACCOUNT_ID}.${LOOKS_NAME}`;

/** Lets the create, the kept look's write and the reads behind them land. */
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

const LOCALES = ['th', 'en'] as const;
const MODES = [['light', walletLight], ['dark', walletDark]] as const;
const WORDS = {
  th: {
    back: 'กลับ', close: 'ปิด', done: 'เสร็จ', add: 'เพิ่มกระเป๋า', tryAgain: 'ลองอีกครั้ง', name: 'ชื่อกระเป๋า',
    step: (n: number) => `กระเป๋าใหม่ · ขั้นที่ ${n} จาก 3`,
    question: 'อยากเพิ่มกระเป๋าแบบไหน?',
    kinds: ['เงินสด เงินในกระเป๋าสตางค์ จดเองเมื่อจ่าย', 'บัญชีธนาคาร ออมทรัพย์ บัญชีเงินเดือน หรือพร้อมเพย์', 'บัตรเครดิต ดูยอดที่ใช้ไป จนกว่าจะจ่ายคืน', 'บัตรเดินทาง BTS / MRT บัตรที่เติมเงินไว้ จดค่าเดินทางแต่ละเที่ยว'],
    bank: 'บัญชีธนาคาร',
    faces: ['ยิ้ม', 'ขยิบตา', 'สบาย ๆ', 'ดีใจ', 'ว้าว'],
    materials: ['ไหม', 'กระดาษ', 'ไทเทเนียม', 'ฟ้า', 'พีช'],
    tracking: 'เริ่มจด วันนี้',
    opening: 'ยอดเริ่มต้น 24,860 บาท',
    preview: 'ตัวอย่างการ์ด บัญชีหลัก ยอด 24,860 บาท',
    unnamed: 'ตัวอย่างการ์ด ยอด 0 บาท',
    added: 'เพิ่มกระเป๋าแล้ว',
    ready: 'บัญชีหลักพร้อมให้จดแล้ว',
    card: 'บัญชีหลัก, เหลือ 24,860 บาท',
    summary: 'ชื่อกระเป๋าบัญชีหลักยอดเริ่มต้น฿24,860',
  },
  en: {
    back: 'Back', close: 'Close', done: 'Done', add: 'Add a wallet', tryAgain: 'Try again', name: 'Wallet name',
    step: (n: number) => `New wallet · step ${n} of 3`,
    question: 'What kind of wallet is it?',
    kinds: ['Cash Money in your purse, noted when you pay', 'Bank account Savings, salary or PromptPay', 'Credit card See what you spent until you pay it back', 'Travel card BTS / MRT A card you top up, with each trip noted'],
    bank: 'Bank account',
    faces: ['Smile', 'Wink', 'Calm', 'Happy', 'Wow'],
    materials: ['Silk', 'Paper', 'Titanium', 'Sky', 'Peach'],
    tracking: 'Tracking from Today',
    opening: 'Opening balance 24,860 baht',
    preview: 'Card preview บัญชีหลัก balance 24,860 baht',
    unnamed: 'Card preview balance 0 baht',
    added: 'Wallet added',
    ready: 'บัญชีหลัก is ready to use',
    card: 'บัญชีหลัก, 24,860 baht left',
    summary: 'Wallet nameบัญชีหลักOpening balance฿24,860',
  },
} as const;

const KINDS = ['cash', 'bank', 'credit_card', 'transit'] as const;
const kindIds = () => screen.queryAllByTestId(/^wallet-kind-/).map((row) => row.getAttribute('data-testid'));
const checked = (testID: string) => found(testID).getAttribute('aria-checked');
const press = (...keys: string[]) => { for (const key of keys) fireEvent.click(named('button', key)); };
const typeName = (label: string, name: string) => fireEvent.change(named('textbox', label), { target: { value: name } });
/** The kept looks, by wallet id. */
const keptLooks = (stored: Map<string, string>) => JSON.parse(stored.get(LOOKS_KEY) ?? '{}') as Record<string, unknown>;
/** The wallet_added events, each with what it says of the wallet (without `origin` and `ai_enabled`, which every capture carries). */
const added = (sent: Recorded[]) => sent.filter((event) => event.name === 'wallet_added').map(({ properties }) => {
  const { origin: _origin, ai_enabled: _ai, ...rest } = properties;
  return rest;
});

/** Picks the bank account and fills บัญชีหลัก at ฿24,860, as bw-adding draws it. */
function fillBank(locale: 'th' | 'en' = 'th') {
  fireEvent.click(found('wallet-kind-bank'));
  typeName(WORDS[locale].name, 'บัญชีหลัก');
  press('2', '4', '8', '6', '0');
}

test('a new wallet: kind, name, face, material and opening balance, then the ceremony', async () => {
  for (const locale of LOCALES) {
    for (const [mode, colors] of MODES) {
      const at = `${locale} ${mode}`;
      const words = WORDS[locale];
      const { sent, restore } = await recordAnalytics();
      const fake = createFakeResources();
      const view = mountWallet(<NewWalletFlow now={NOW} />, { resources: fake.resources, locale, mode });
      await settle();
      // Step 1, the kind.
      expect(found('new-wallet-step').textContent, at).toBe(words.step(1));
      expect(screen.queryAllByRole('heading', { name: words.question }), at).toHaveLength(1);
      expect(found('new-wallet').style.backgroundColor, at).toBe(rgba(colors.ground));
      fireEvent.click(named('button', words.kinds[1]));
      // Step 2, the fields: a bank account starts on silk, with Bun smiling.
      expect(found('new-wallet-step').textContent, at).toBe(words.step(2));
      expect(screen.queryAllByRole('heading', { name: words.bank }), at).toHaveLength(1);
      expect([checked('look-material-silk'), checked('look-face-smile')], at).toEqual(['true', 'true']);
      expect(found('wallet-tracking').textContent, at).toBe(words.tracking);
      // With no name yet the preview says none, with no gap where it goes.
      expect(found('wallet-preview').getAttribute('aria-label'), at).toBe(words.unnamed);
      typeName(words.name, 'บัญชีหลัก');
      fireEvent.click(named('radio', words.faces[1]));
      fireEvent.click(named('radio', words.materials[3]));
      press('2', '4', '8', '6', '0');
      expect([checked('look-face-wink'), checked('look-face-smile'), checked('look-material-sky'), checked('look-material-silk')], at).toEqual(['true', 'false', 'true', 'false']);
      // The chosen face and material are ringed in violet.
      expect(found('look-material-sky').style.boxShadow, at).toContain(colors.violet);
      expect(found('look-face-smile').style.boxShadow, at).toBe('');
      expect([found('wallet-opening').textContent, found('wallet-opening').getAttribute('aria-label')], at).toEqual(['฿24,860', words.opening]);
      // The live preview: the card as it will read, one image.
      const preview = found('wallet-preview');
      expect([preview.getAttribute('role'), preview.getAttribute('aria-label')], at).toEqual(['img', words.preview]);
      expect(preview.querySelector('linearGradient')?.getAttribute('id'), at).toBe(`wallet-material-sky-${mode}`);
      fireEvent.click(named('button', words.add));
      await settle();
      // One create, with its own id, today's tracking start and the exact opening balance.
      const creates = fake.callsOf('createWallet').map((call) => call.args[0] as { id: string });
      expect(creates, at).toHaveLength(1);
      const walletId = creates[0].id;
      expect(creates[0], at).toEqual({ id: walletId, name: 'บัญชีหลัก', opening_minor: '2486000', tracking_start: TODAY });
      expect(walletId, at).toMatch(UUID);
      // The look is kept for the new wallet, and one wallet_added carries it, with no name or amount.
      expect(keptLooks(view.stored)[walletId], at).toEqual({ kind: 'bank', material: 'sky', face: 'wink' });
      expect(added(sent), at).toEqual([{ wallet_type: 'bank', material: 'sky', bun_face: 'wink' }]);
      for (const secret of ['บัญชีหลัก', '2486000', '24,860', '24860']) expect(JSON.stringify(sent), `${at}: ${secret}`).not.toContain(secret);
      // Step 3, the ceremony: the card drops in, walletAdded plays once, and the wallet is ready.
      expect(found('new-wallet-card').style.visibility, at).toBe('hidden');
      startAnimations();
      expect([drops.asked, haptics.played.filter((moment) => moment === 'walletAdded')], at).toEqual([[false], ['walletAdded']]);
      const status = found('new-wallet-added');
      expect([status.getAttribute('role'), status.textContent], at).toEqual(['status', `${words.added}${words.ready}`]);
      expect(named('img', words.card).querySelector('linearGradient')?.getAttribute('id'), at).toBe(`wallet-material-sky-${mode}`);
      expect(found('new-wallet-summary').textContent, at).toBe(words.summary);
      fireEvent.click(named('button', words.done));
      expect(router.dismissTo.mock.calls, at).toEqual([['/spend']]);
      restore();
      cleanup();
      router.dismissTo.mockReset();
      haptics.played.length = 0;
      drops.asked.length = 0;
    }
  }
});

test('a look is not kept when the create is refused', async () => {
  const { sent, restore } = await recordAnalytics();
  try {
    // Refused before the server processed it: said in today's words, nothing kept, nothing sent to analytics.
    const refused = createFakeResources();
    refused.fail('createWallet', 'signed_out');
    const view = mountWallet(<NewWalletFlow now={NOW} />, { resources: refused.resources });
    await settle();
    fillBank();
    fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
    await settle();
    expect(refused.callsOf('createWallet')).toHaveLength(1);
    expect(within(found('new-wallet-problem')).getByRole('alert').textContent).toBe(translateCopy('Sign in again to save.', 'th'));
    expect(keptLooks(view.stored)).toEqual({});
    expect([added(sent), haptics.played.includes('walletAdded'), screen.queryByTestId('new-wallet-added')]).toEqual([[], false, null]);
    // Pressing again sends again: nothing is held after a refusal.
    expect(named('button', 'เพิ่มกระเป๋า').getAttribute('aria-disabled')).toBeNull();
    cleanup();

    // A refusal that names fields says so on each field, whatever else it says (here the terms' refusal, whose own
    // words differ), and each clears as it is changed.
    const field = createFakeResources();
    field.fail('createWallet', 'policy_required', { status: 403, code: 'POLICY_REQUIRED', fields: { name: 'POLICY_REQUIRED', opening_minor: 'MINOR_OUT_OF_RANGE' } });
    const named2 = mountWallet(<NewWalletFlow now={NOW} />, { resources: field.resources });
    await settle();
    fillBank();
    fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
    await settle();
    expect(within(found('new-wallet-problem')).getByRole('alert').textContent).toBe(translateCopy('Check the highlighted fields.', 'th'));
    expect([found('wallet-name-problem').textContent, found('wallet-opening-problem').textContent]).toEqual([translateCopy('Check this and try again.', 'th'), translateCopy('Amounts go up to ฿999,999,999.99', 'th')]);
    expect(keptLooks(named2.stored)).toEqual({});
    expect(added(sent)).toEqual([]);
    typeName('ชื่อกระเป๋า', 'บัญชีเงินเดือน');
    expect([screen.queryByTestId('wallet-name-problem'), screen.queryByTestId('wallet-opening-problem') !== null]).toEqual([null, true]);
    press('5');
    expect(screen.queryByTestId('wallet-opening-problem')).toBeNull();
    cleanup();

    // Refused until Jotbun is updated: said, and เพิ่มกระเป๋า is held.
    const update = createFakeResources();
    update.fail('createWallet', 'upgrade_required');
    mountWallet(<NewWalletFlow now={NOW} />, { resources: update.resources });
    await settle();
    fillBank();
    fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
    await settle();
    expect(named('button', 'เพิ่มกระเป๋า').getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('button', { name: 'ลองอีกครั้ง' })).toBeNull();
  } finally {
    restore();
  }
});

test('the flow offers four kinds, never e-wallet', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    mountWallet(<NewWalletFlow now={NOW} />, { locale });
    await settle();
    expect(kindIds(), locale).toEqual(KINDS.map((kind) => `wallet-kind-${kind}`));
    expect(KINDS.map((kind) => found(`wallet-kind-${kind}`).getAttribute('aria-label')), locale).toEqual(words.kinds);
    expect(document.body.textContent, locale).not.toMatch(/วอลเล็ต|e-wallet|TrueMoney/i);
    // Each kind starts on the material its tile is drawn in, with Bun smiling.
    for (const [kind, material] of [['cash', 'paper'], ['bank', 'silk'], ['credit_card', 'titanium'], ['transit', 'sky']] as const) {
      expect(found(`wallet-kind-${kind}`).querySelector('linearGradient')?.getAttribute('id'), `${locale} ${kind}`).toBe(`wallet-material-${material}-light`);
      fireEvent.click(found(`wallet-kind-${kind}`));
      expect([checked(`look-material-${material}`), checked('look-face-smile')], `${locale} ${kind}`).toEqual(['true', 'true']);
      // Back keeps the step's place: the kinds again.
      fireEvent.click(named('button', words.back));
      expect(kindIds(), `${locale} ${kind}`).toHaveLength(4);
    }
    cleanup();
  }
});

test('opened with ?setup=1 the ceremony returns to /spend/setup', async () => {
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', 'wallet');
  const at = (params: Record<string, string>, element: ReactElement) => <LocalRouteParamsContext.Provider value={params}>{element}</LocalRouteParamsContext.Provider>;
  for (const [params, destination, leaveBy] of [
    [{ setup: '1' }, '/spend/setup', 'เสร็จ'],
    [{ returnTo: '/spend/wallets' }, '/spend/wallets', 'ปิด'],
    [{ returnTo: 'https://example.com' }, '/spend', 'เสร็จ'],
  ] as const) {
    const fake = createFakeResources();
    shared.resources = fake.resources;
    mountWallet(at(params, <SpendNewWalletRoute />), { resources: fake.resources });
    await settle();
    fillBank();
    fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
    await settle();
    startAnimations();
    expect(fake.callsOf('createWallet'), destination).toHaveLength(1);
    fireEvent.click(named('button', leaveBy));
    expect(router.dismissTo.mock.calls, destination).toEqual([[destination]]);
    cleanup();
    router.dismissTo.mockReset();
  }
  // Back on the first step leaves the flow: back where it came from, or to where it would return (a mount of its
  // own, since the flow is left once).
  mountWallet(at({ setup: '1' }, <SpendNewWalletRoute />));
  await settle();
  fireEvent.click(named('button', 'กลับ'));
  expect([router.back.mock.calls.length, router.replace.mock.calls]).toEqual([1, []]);
  cleanup();
  router.canGoBack.mockReturnValue(false);
  mountWallet(at({ setup: '1' }, <SpendNewWalletRoute />));
  await settle();
  fireEvent.click(named('button', 'กลับ'));
  expect([router.back.mock.calls.length, router.replace.mock.calls]).toEqual([1, [['/spend/setup']]]);
});

test('every face, material and key is at least 44 pt, and each is named', async () => {
  for (const locale of LOCALES) {
    for (const [mode] of MODES) {
      const at = `${locale} ${mode}`;
      const words = WORDS[locale];
      mountWallet(<NewWalletFlow now={NOW} />, { locale, mode });
      await settle();
      const box = (element: HTMLElement) => [Number.parseFloat(element.style.width || '0'), Number.parseFloat(element.style.minHeight || element.style.height)];
      for (const kind of KINDS) expect(box(found(`wallet-kind-${kind}`))[1], `${at}: ${kind}`).toBeGreaterThanOrEqual(44);
      expect(box(named('button', words.back)), at).toEqual([44, 44]);
      fireEvent.click(found('wallet-kind-cash'));
      // The five faces at 48 pt and the five materials at 56 × 44, each named, in the boards' order.
      const faces = within(named('radiogroup', locale === 'th' ? 'หน้าบัน' : "Bun's face")).getAllByRole('radio');
      expect(faces.map((face) => face.getAttribute('aria-label')), at).toEqual(words.faces);
      for (const face of faces) expect(box(face), `${at}: ${face.getAttribute('aria-label')}`).toEqual([48, 48]);
      const materials = within(named('radiogroup', locale === 'th' ? 'วัสดุ' : 'Material')).getAllByRole('radio');
      expect(materials.map((material) => material.getAttribute('aria-label')), at).toEqual(words.materials);
      for (const material of materials) expect(box(material), `${at}: ${material.getAttribute('aria-label')}`).toEqual([56, 44]);
      // The keys: digits, 000, 0 and delete, each at least 44 pt tall.
      const keys = within(found('wallet-keypad')).getAllByRole('button');
      expect(keys.map((key) => key.getAttribute('aria-label')), at).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', locale === 'th' ? 'ลบตัวเลข' : 'Delete a digit']);
      for (const key of keys) expect(box(key)[1], `${at}: ${key.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
      expect(Number.parseFloat(named('textbox', words.name).style.minHeight), at).toBeGreaterThanOrEqual(44);
      expect(Number.parseFloat(named('button', words.add).style.minHeight), at).toBeGreaterThanOrEqual(44);
      cleanup();
    }
  }
});

test('two presses on เพิ่มกระเป๋า send one create and one wallet_added; a lost answer offers Try again under the same key', async () => {
  const { sent, restore } = await recordAnalytics();
  try {
    const fake = createFakeResources();
    mountWallet(<NewWalletFlow now={NOW} />, { resources: fake.resources });
    await settle();
    fillBank();
    const add = named('button', 'เพิ่มกระเป๋า');
    act(() => {
      fireEvent.click(add);
      fireEvent.click(add);
    });
    await settle();
    expect([fake.callsOf('createWallet').length, added(sent).length, fake.wallets.size]).toEqual([1, 1, 1]);
    cleanup();

    // The answer is lost after the wallet was saved: held, then Try again sends the same command under the same key.
    const lost = createFakeResources();
    lost.loseResponse('createWallet');
    mountWallet(<NewWalletFlow now={NOW} />, { resources: lost.resources });
    await settle();
    fillBank();
    fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
    await settle();
    expect(within(found('new-wallet-problem')).getByRole('alert').textContent).toBe(translateCopy('Not confirmed yet. Your entry is kept; try again.', 'th'));
    expect(named('button', 'เพิ่มกระเป๋า').getAttribute('aria-disabled')).toBe('true');
    expect(named('textbox', 'ชื่อกระเป๋า').hasAttribute('readonly')).toBe(true);
    expect(added(sent)).toHaveLength(1);
    const tryAgain = named('button', 'ลองอีกครั้ง');
    act(() => {
      fireEvent.click(tryAgain);
      fireEvent.click(tryAgain);
    });
    await settle();
    const calls = lost.callsOf('createWallet');
    expect(calls).toHaveLength(2);
    expect(calls[1].args).toEqual(calls[0].args);
    expect([lost.wallets.size, added(sent).length, screen.queryByTestId('new-wallet-added') !== null]).toEqual([1, 2, true]);
    cleanup();

    // A resend refused before processing because the session changed: still unknown, still held, and no Try again.
    const blocked = createFakeResources();
    blocked.loseResponse('createWallet');
    mountWallet(<NewWalletFlow now={NOW} />, { resources: blocked.resources });
    await settle();
    fillBank();
    fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
    await settle();
    blocked.fail('createWallet', 'session_changed');
    fireEvent.click(named('button', 'ลองอีกครั้ง'));
    await settle();
    expect(within(found('new-wallet-problem')).getByRole('alert').textContent).toBe(translateCopy('Your session changed. Sign in again to save.', 'th'));
    expect(screen.queryByRole('button', { name: 'ลองอีกครั้ง' })).toBeNull();
    expect(named('button', 'เพิ่มกระเป๋า').getAttribute('aria-disabled')).toBe('true');
  } finally {
    restore();
  }
});

test("step 2's back is held only while the create is out; once its answer is unknown, or its resend is blocked, back leaves the flow and keeps no look", async () => {
  // While the create is out, back is held, and a press changes nothing.
  const out = createFakeResources();
  const release = out.hold('createWallet');
  mountWallet(<NewWalletFlow now={NOW} />, { resources: out.resources });
  await settle();
  fillBank();
  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
  await settle();
  expect(named('button', 'กลับ').getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(named('button', 'กลับ'));
  expect([found('new-wallet-step').textContent, router.back.mock.calls.length, router.replace.mock.calls]).toEqual([WORDS.th.step(2), 0, []]);
  await act(async () => { release(); });
  await settle();
  expect(screen.queryByTestId('new-wallet-added')).not.toBeNull();
  cleanup();

  // The answer is lost: back leaves the flow, as step 1's back does, and no look is kept (the list reads again on return).
  const lost = createFakeResources();
  lost.loseResponse('createWallet');
  const view = mountWallet(<NewWalletFlow now={NOW} />, { resources: lost.resources });
  await settle();
  fillBank();
  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
  await settle();
  expect(named('button', 'กลับ').getAttribute('aria-disabled')).toBeNull();
  fireEvent.click(named('button', 'กลับ'));
  expect([router.back.mock.calls.length, router.replace.mock.calls, keptLooks(view.stored)]).toEqual([1, [], {}]);
  cleanup();
  router.back.mockReset();

  // The review's PR2: a resend blocked because the session changed holds every other control, and back still leaves,
  // here with nothing to go back to, so to the list the flow was opened from.
  const blocked = createFakeResources();
  blocked.loseResponse('createWallet');
  const again = mountWallet(<NewWalletFlow returnTo="/spend/wallets" now={NOW} />, { resources: blocked.resources });
  await settle();
  fillBank();
  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
  await settle();
  blocked.fail('createWallet', 'session_changed');
  fireEvent.click(named('button', 'ลองอีกครั้ง'));
  await settle();
  expect([screen.queryByRole('button', { name: 'ลองอีกครั้ง' }), named('button', 'เพิ่มกระเป๋า').getAttribute('aria-disabled')]).toEqual([null, 'true']);
  router.canGoBack.mockReturnValue(false);
  fireEvent.click(named('button', 'กลับ'));
  expect([router.back.mock.calls.length, router.replace.mock.calls, keptLooks(again.stored)]).toEqual([0, [['/spend/wallets']], {}]);
});

// P2-T18a (P2-T21's confirming review, m2 and n1). Once the shell hides its bar on /spend/wallet/*, step 2's back is
// the flow's only way out while a create's answer is unknown, so the flow is left once.
test("the flow is left once: two quick presses on a back pop one screen, on step 1 and on step 2 once a create's answer is unknown", async () => {
  mountWallet(<NewWalletFlow now={NOW} />);
  await settle();
  const first = named('button', 'กลับ');
  act(() => {
    fireEvent.click(first);
    fireEvent.click(first);
  });
  expect([router.back.mock.calls.length, router.replace.mock.calls]).toEqual([1, []]);
  cleanup();
  router.back.mockReset();
  const lost = createFakeResources();
  lost.loseResponse('createWallet');
  mountWallet(<NewWalletFlow now={NOW} />, { resources: lost.resources });
  await settle();
  fillBank();
  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
  await settle();
  const second = named('button', 'กลับ');
  act(() => {
    fireEvent.click(second);
    fireEvent.click(second);
  });
  expect([router.back.mock.calls.length, router.replace.mock.calls]).toEqual([1, []]);
});

test("after a refusal, held or not, step 2's back goes to the kinds and leaves nothing", async () => {
  for (const outcome of ['signed_out', 'upgrade_required'] as const) {
    const refused = createFakeResources();
    refused.fail('createWallet', outcome);
    mountWallet(<NewWalletFlow now={NOW} />, { resources: refused.resources });
    await settle();
    fillBank();
    fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
    await settle();
    // Back is never held after a refusal; เพิ่มกระเป๋า is held only until Jotbun is updated.
    expect([named('button', 'กลับ').getAttribute('aria-disabled'), named('button', 'เพิ่มกระเป๋า').getAttribute('aria-disabled')], outcome).toEqual([null, outcome === 'upgrade_required' ? 'true' : null]);
    fireEvent.click(named('button', 'กลับ'));
    expect([found('new-wallet-step').textContent, router.back.mock.calls.length, router.replace.mock.calls], outcome).toEqual([WORDS.th.step(1), 0, []]);
    cleanup();
  }
});

test("while a create's answer is unknown the faces and the materials are held, so the look kept is the one wallet_added reported", async () => {
  const { sent, restore } = await recordAnalytics();
  try {
    const lost = createFakeResources();
    lost.loseResponse('createWallet');
    const view = mountWallet(<NewWalletFlow now={NOW} />, { resources: lost.resources });
    await settle();
    fillBank();
    fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
    await settle();
    // The review's PR8, for the faces and the materials: all ten are held, and a press on one changes nothing.
    expect(screen.queryAllByRole('radio').map((radio) => radio.getAttribute('aria-disabled'))).toEqual(Array<string>(10).fill('true'));
    fireEvent.click(found('look-face-wink'));
    fireEvent.click(found('look-material-sky'));
    expect([checked('look-face-smile'), checked('look-face-wink'), checked('look-material-silk'), checked('look-material-sky')]).toEqual(['true', 'false', 'true', 'false']);
    fireEvent.click(named('button', 'ลองอีกครั้ง'));
    await settle();
    const walletId = (lost.callsOf('createWallet')[0].args[0] as { id: string }).id;
    expect([keptLooks(view.stored)[walletId], added(sent)]).toEqual([{ kind: 'bank', material: 'silk', face: 'smile' }, [{ wallet_type: 'bank', material: 'silk', bun_face: 'smile' }]]);
  } finally {
    restore();
  }
});

test('one wallet id per flow, however often the flow draws: the card it shows is the wallet it creates', async () => {
  // With no account open the card shows the look derived from the wallet's id, so a new id would change it as keys are pressed.
  const ids = vi.spyOn(globalThis.crypto, 'randomUUID');
  const fake = createFakeResources();
  mountWallet(<NewWalletFlow now={NOW} />, { resources: fake.resources, diary: null });
  await settle();
  fillBank();
  const gradient = () => found('wallet-preview').querySelector('linearGradient')?.getAttribute('id');
  const [asked, drawn] = [ids.mock.calls.length, gradient()];
  press('ลบตัวเลข', 'ลบตัวเลข', '1', '5');
  typeName('ชื่อกระเป๋า', 'บัญชีเงินเดือน');
  expect([ids.mock.calls.length, gradient(), found('wallet-opening').textContent]).toEqual([asked, drawn, '฿24,815']);
  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
  await settle();
  const walletId = (fake.callsOf('createWallet')[0].args[0] as { id: string }).id;
  expect(`wallet-material-${derivedLook(walletId).material}-light`).toBe(drawn);
});

test('a name or an opening balance the create cannot take says so on its field, and sends nothing', async () => {
  const fake = createFakeResources();
  mountWallet(<NewWalletFlow now={NOW} />, { resources: fake.resources });
  await settle();
  fireEvent.click(found('wallet-kind-cash'));
  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
  expect(found('wallet-name-problem').textContent).toBe(translateCopy('Enter a wallet name', 'th'));
  // A key past ฿999,999,999.99 is refused, and says so.
  press('9', '9', '9', '9', '9', '9', '9', '9', '9', '9');
  expect([found('wallet-opening').textContent, found('wallet-opening-problem').textContent]).toEqual(['฿999,999,999', translateCopy('Amounts go up to ฿999,999,999.99', 'th')]);
  // Typing the name clears its problem; zero is an opening balance too.
  typeName('ชื่อกระเป๋า', 'กระปุก');
  expect(screen.queryByTestId('wallet-name-problem')).toBeNull();
  expect(fake.callsOf('createWallet')).toHaveLength(0);
  press(...Array<string>(9).fill('ลบตัวเลข'));
  expect(found('wallet-opening').textContent).toBe('฿0');
  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
  await settle();
  expect(fake.callsOf('createWallet').map((call) => (call.args[0] as { opening_minor: string }).opening_minor)).toEqual(['0']);
});

test('private mode hides the preview card\'s amount and the ceremony\'s, while what the person types shows', async () => {
  for (const locale of LOCALES) {
    const hidden = locale === 'th' ? 'ซ่อนยอดเงินอยู่' : 'Amount hidden';
    mountWallet(<NewWalletFlow now={NOW} />, { device: { [PRIVATE_MODE_NAME]: '1' }, locale });
    await settle();
    fillBank(locale);
    // What the person types is never masked (R106); the card is.
    expect(found('wallet-opening').textContent, locale).toBe('฿24,860');
    expect(found('wallet-preview').getAttribute('aria-label'), locale).toBe(locale === 'th' ? `ตัวอย่างการ์ด บัญชีหลัก ยอด ${hidden}` : `Card preview บัญชีหลัก balance ${hidden}`);
    expect(within(found('wallet-preview')).queryByText('฿24,860'), locale).toBeNull();
    fireEvent.click(named('button', WORDS[locale].add));
    await settle();
    startAnimations();
    expect(found('new-wallet-opening').textContent, locale).toBe('฿••••');
    expect(found('new-wallet-card').querySelector('[aria-label]')?.getAttribute('aria-label'), locale).toBe(`บัญชีหลัก, ${hidden}`);
    // No digit of the amount on screen or in a label (Review Focus 2).
    const said = [document.body.textContent ?? '', ...[...document.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label') ?? '')].join(' ');
    expect(said, locale).not.toContain('24,860');
    cleanup();
  }
});

test('with no account open the look is not offered, and the wallet shows the look it will have', async () => {
  const { sent, restore } = await recordAnalytics();
  try {
    // A wallet id whose derived look (peach, happy) is not the bank account's own (silk, smile).
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('0000000a-0000-4000-8000-0000000000a1');
    const fake = createFakeResources();
    const view = mountWallet(<NewWalletFlow now={NOW} />, { resources: fake.resources, diary: null });
    await settle();
    fillBank();
    expect([screen.queryByTestId('wallet-look'), screen.queryAllByRole('radio')]).toEqual([null, []]);
    fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
    await settle();
    const walletId = (fake.callsOf('createWallet')[0].args[0] as { id: string }).id;
    const look = derivedLook(walletId);
    expect([walletId, look.material, look.face]).toEqual(['0000000a-0000-4000-8000-0000000000a1', 'peach', 'happy']);
    startAnimations();
    expect(found('new-wallet-card').querySelector('linearGradient')?.getAttribute('id')).toBe(`wallet-material-${look.material}-light`);
    expect(added(sent)).toEqual([{ wallet_type: 'bank', material: look.material, bun_face: look.face }]);
    expect([...view.stored.keys()].filter((key) => key.includes(LOOKS_NAME))).toEqual([]);
  } finally {
    restore();
  }
});

test('under Reduce Motion the card fades in, and walletAdded still plays once', async () => {
  mountWallet(<NewWalletFlow now={NOW} />, { reducedMotion: true });
  await settle();
  fillBank();
  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
  await settle();
  expect([drops.asked, haptics.played.filter((moment) => moment === 'walletAdded')]).toEqual([[true], ['walletAdded']]);
});

test("the new card drops in a place of its own, so it falls about one card's height to where it rests", async () => {
  mountWallet(<NewWalletFlow now={NOW} />);
  await settle();
  fillBank();
  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
  await settle();
  // Reanimated's originY is in the parent's coordinates: the card's parent holds only the card, so -200 is one card's
  // height above where it rests, not above the scroll view's top (the review's n1).
  const place = found('new-wallet-card-place');
  expect([found('new-wallet-card').parentElement === place, place.children.length, drops.asked]).toEqual([true, 1, [false]]);
  // A stacking context on a phone too: a nativeID, which react-native-web draws as the id (P2-T21's confirming review m1).
  expect(place.id).toBe('new-wallet-card-place');
});

test('at AX5 nothing is clamped to a line, and the kinds and the looks wrap', async () => {
  const LONG_NAME = 'บัญชีออมทรัพย์สำหรับค่าเทอมลูกและค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดปีนะ';
  mountWallet(<NewWalletFlow now={NOW} />, { fontScale: AX5 });
  await settle();
  fireEvent.click(found('wallet-kind-transit'));
  typeName('ชื่อกระเป๋า', LONG_NAME);
  press('9', '9', '9', '9', '9', '9', '9', '9', '9');
  expect(within(found('wallet-preview')).queryByText(LONG_NAME)).not.toBeNull();
  expect(found('wallet-opening').textContent).toBe('฿999,999,999');
  for (const group of screen.queryAllByRole('radiogroup')) expect(group.style.flexWrap).toBe('wrap');
  fireEvent.click(named('button', 'เพิ่มกระเป๋า'));
  await settle();
  startAnimations();
  expect(found('new-wallet-summary').textContent).toContain(LONG_NAME);
  expect(seen.props.filter((props) => props.numberOfLines !== undefined)).toEqual([]);
});

test("the new wallet's and editing's sections come right after the wallets list's, and each opens in its state on the catalogue's own account", async () => {
  const ids = WALLET_SECTIONS.map((section) => section.id);
  const at = ids.indexOf('bw-wallet-new-type');
  expect(ids.slice(at - 1, at + 5)).toEqual(['bw-wallets-reorder', 'bw-wallet-new-type', 'bw-wallet-new-form', 'bw-wallet-added', 'bw-wallet-edit', 'bw-wallet-correction']);
  const expected: Record<string, () => void> = {
    'bw-wallet-new-type': () => expect(kindIds()).toHaveLength(4),
    'bw-wallet-new-form': () => expect([found('wallet-preview').getAttribute('aria-label'), found('new-wallet-step').textContent]).toEqual([WORDS.th.preview, WORDS.th.step(2)]),
    'bw-wallet-added': () => expect(found('new-wallet-added').textContent).toBe(`${WORDS.th.added}${WORDS.th.ready}`),
    'bw-wallet-edit': () => expect([found('wallet-preview').getAttribute('aria-label'), found('wallet-preview').querySelector('linearGradient')?.getAttribute('id'), screen.queryAllByRole('dialog').length]).toEqual(['ตัวอย่างการ์ด บัญชีหลัก ยอด 24,860 บาท', 'wallet-material-silk-light', 0]),
    'bw-wallet-correction': () => expect(screen.queryAllByRole('dialog', { name: translateCopy('Why are you changing this?', 'th') })).toHaveLength(1),
  };
  for (const [sectionId, check] of Object.entries(expected)) {
    const section = WALLET_SECTIONS.find((each) => each.id === sectionId);
    const view = mountWallet(<>{section?.render()}</>);
    // The section's script runs its steps (each may wait up to 8 s), then the stage says ready, or where it stopped.
    await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
    expect(screen.queryByTestId('catalogue-screen-ready'), sectionId).not.toBeNull();
    startAnimations();
    check();
    // The person's own account is never written.
    expect([...view.stored.keys()].filter((key) => key.includes(TEST_ACCOUNT_ID)), sectionId).toEqual([]);
    cleanup();
  }
}, 90_000);
