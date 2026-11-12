// The Bun Wallet month recap (bw-recap, P2-T32): bw-recap's facts in both
// modes and both languages, its colours and type from the wallet kit, the
// month read in full, A5's cashback count and its switches, the month's one
// celebration, the analytics, a share that cannot open, private mode, every
// state with a way out, Close, and the catalogue's sections drawing the real
// screen. The fakes are the Bun diary recap's (insights/recapSections.tsx),
// on the catalogue's clock: August 2026 is a past month.
import type { TransactionDto } from '@gogospend/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AccessibilityInfo, Linking, Share } from 'react-native';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

const haptics = vi.hoisted(() => ({ playHaptic: vi.fn() }));
vi.mock('@mobile/lib/hapticMoment', () => ({ playHaptic: haptics.playHaptic }));

import { recordAnalytics } from '@mobile/analytics/testing/recordAnalytics';
import { V1Error } from '@mobile/api/client';
import { hiddenFromScreenReaders } from '@mobile/mascot/mascotTestHarness';
import type { AiResources } from '@mobile/spend/v1/ai/aiResources';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';
import { contrastRatio } from '@mobile/theme/contrast';
import { LATIN_UI_FONT_FAMILY, THAI_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { materialPaint, WALLET_TEXT_PAIRS, walletDark, walletLight } from '@mobile/theme/walletPalette';
import type { WalletColors } from '@mobile/theme/walletPalette';
import { rgba } from '../../dev/catalogue/catalogueTestHarness';
import { recapBudget, recapFake } from '../../dev/catalogue/insights/recapSections';
import { router } from '../../dev/catalogue/routerTestStub';
import { CATALOGUE_NOW, expense } from '../../dev/catalogue/screenFixtures';
import { WALLET_SECTIONS } from '../../dev/catalogue/wallet';
import { WALLET_RECAP_SECTIONS } from '../../dev/catalogue/wallet/recapSections';
import { installStoreBackend } from '../store/deviceWalletStore';
import { mountWallet } from '../testing/walletHarness';
import { CONFETTI_NAME, Confetti } from './Confetti';
import { WalletRecapScreen } from './WalletRecapScreen';

beforeEach(() => {
  haptics.playHaptic.mockClear();
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  router.canGoBack.mockReturnValue(true);
  vi.spyOn(Share, 'share').mockImplementation(async () => ({ action: 'sharedAction', activityType: undefined }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Harness

/** 29 September 2026, 10:00 in Bangkok: August is a past month, September this one. */
const NOW = CATALOGUE_NOW;
const AUGUST = '2026-08';
const BUDGET = [recapBudget(AUGUST, '1800000')];
const MARK = `jotbun.wallet.${CONFETTI_NAME(AUGUST)}`;

type Mode = 'light' | 'dark';
type Locale = 'th' | 'en';

/** August in the Bun diary recap's fakes: ฿13,962.51 out over Bills, Travel and Food, the rent on Sunday 2 August, seven days logged. */
const WORDS = {
  th: {
    title: 'สรุปเดือนสิงหาคม 2569', month: 'สิงหาคม 2569', days: 'จดครบ 7 จาก 31 วัน', rentDay: 'อาทิตย์ 2 ส.ค. · ',
    top: 'หมวดที่ใช้มากสุด', topRows: ['ค่าบิล฿13,167', 'การเดินทาง฿480', 'อาหาร฿315.51'], share: 'แชร์สรุป',
  },
  en: {
    title: 'Month recap: August 2026', month: 'August 2026', days: 'Logged 7 of 31 days', rentDay: 'Sun 2 Aug · ',
    top: 'Top categories', topRows: ['Bills฿13,167', 'Travel฿480', 'Food฿315.51'], share: 'Share recap',
  },
} as const;

/** Seven August days of shopping at Shopee (four) and Lazada (three). */
const SHOPPING: readonly TransactionDto[] = [3, 6, 9, 13, 16, 22, 26].map((day, index) =>
  expense(900 + index, `${AUGUST}-${String(day).padStart(2, '0')}`, '29900', { merchant: index % 3 === 0 ? 'Lazada' : 'Shopee' }),
);
const CASHBACK_SEVEN = '7 รายการเดือนนี้ อาจได้เงินคืนผ่าน GoGoCashจาก Shopee และ Lazada · GoGoCash เป็นบริการในเครือ';

const tipsOn = (): AiResources => fakeAiResources({}, { cashback_tips: true }).resources;

/** Thai letters and marks; ฿ (U+0E3F) is not one of them, since English amounts carry it too. */
const THAI_LETTERS = /[\u0E01-\u0E3A\u0E40-\u0E5B]/;

/** The element with this test id, which must be there. */
function found(testID: string, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByTestId(testID);
  expect(element, testID).not.toBeNull();
  return element as HTMLElement;
}

/** The element with this role and name, which must be there. */
function named(role: string, name: string, inside: HTMLElement = document.body): HTMLElement {
  const element = within(inside).queryByRole(role, { name });
  expect(element, `${role} ${name}`).not.toBeNull();
  return element as HTMLElement;
}

/** The recap's facts are drawn. */
const recapShown = () => waitFor(() => found('recap-card'));
/** Lets every promise the fakes have started land. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const headings = () => screen.getAllByRole('heading').map((heading) => heading.textContent);
const pieces = () => screen.queryAllByTestId('confetti-piece');

function mountRecap(month: string, options: Parameters<typeof mountWallet>[1] = {}) {
  return mountWallet(<WalletRecapScreen month={month} now={NOW} />, { resources: recapFake({ budgets: BUDGET }).resources, ...options });
}

/** `#RRGGBB` of a colour react-native-web wrote; null when there is none. */
function hexOf(css: string): string | null {
  const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(css);
  if (!match || (match[4] !== undefined && Number(match[4]) === 0)) return null;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Each element that draws words of its own, and is not hidden from screen readers. */
function wordsIn(root: HTMLElement): { element: HTMLElement; words: string }[] {
  return [...root.querySelectorAll<HTMLElement>('*')]
    .map((element) => ({ element, words: [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent ?? '').join('').trim() }))
    .filter(({ element, words }) => words !== '' && !hiddenFromScreenReaders(element));
}

/** Every word is a wallet text token on its nearest ground, a pair walletPalette.test.ts holds at 4.5:1 (§4, §5.1). */
function expectKitColours(root: HTMLElement, colors: WalletColors) {
  const tokens = (hex: string | null) => Object.entries(colors).filter(([, value]) => typeof value === 'string' && value.toUpperCase() === hex).map(([name]) => name);
  const drawn = wordsIn(root);
  for (const { element, words } of drawn) {
    const fg = hexOf(element.style.color);
    let ground: string | null = null;
    for (let node: HTMLElement | null = element; node && !ground; node = node.parentElement) ground = node.style?.backgroundColor ? hexOf(node.style.backgroundColor) : null;
    expect(WALLET_TEXT_PAIRS.some(([text, on]) => tokens(fg).includes(text) && tokens(ground).includes(on)), `${words}: ${fg} on ${ground}`).toBe(true);
    expect(contrastRatio(fg ?? '#000000', ground ?? '#000000'), words).toBeGreaterThanOrEqual(4.5);
  }
  expect(drawn.length).toBeGreaterThan(10);
}

/** Words in Anuphan (WalletText) and amounts in DM Sans 700 (WalletAmount): §5.1, R74. */
function expectKitType(root: HTMLElement) {
  const drawn = wordsIn(root);
  for (const { element, words } of drawn) {
    const amount = words.startsWith('฿');
    expect(element.style.fontFamily, words).toBe(amount ? LATIN_UI_FONT_FAMILY : THAI_UI_FONT_FAMILY);
    if (amount) expect(element.style.fontWeight, words).toBe('700');
  }
  expect(drawn.length).toBeGreaterThan(10);
}

// ---------------------------------------------------------------------------
// The recap

test.each([['light', 'th'], ['dark', 'th'], ['light', 'en'], ['dark', 'en']] as const)("the recap draws bw-recap's facts from the month (%s, %s)", async (mode: Mode, locale: Locale) => {
  mountRecap(AUGUST, { mode, locale });
  await recapShown();
  const words = WORDS[locale];
  const colors = mode === 'dark' ? walletDark : walletLight;
  // The title and the top categories are the screen's headings.
  expect(headings()).toEqual([words.title, words.top]);
  expect(found('recap-month').textContent).toBe(words.month);
  expect(found('recap-days').textContent).toBe(words.days);
  // The month's money out, the budget, and what is left in `under`.
  expect(found('recap-spent').textContent).toBe('฿13,962.51');
  expect(found('recap-budget').textContent).toBe('฿18,000');
  expect([found('recap-under').textContent, found('recap-under').style.color]).toEqual(['฿4,037.49', rgba(colors.under)]);
  expect(screen.queryByTestId('recap-over')).toBeNull();
  // The biggest day: the rent, through dateStep, on no payday.
  expect(found('recap-biggest-day').textContent).toBe(words.rentDay);
  expect(found('recap-biggest-day-amount').textContent).toBe('฿12,268');
  // The top three, largest first.
  expect(within(found('recap-top')).getAllByTestId('recap-top-row').map((row) => row.textContent)).toEqual(words.topRows);
  expect(named('button', words.share).textContent).toBe(words.share);
  // Tips are off on the harness's AI: no cashback card.
  expect(screen.queryByTestId('recap-cashback')).toBeNull();
  if (locale === 'en') expect(document.body.textContent).not.toMatch(THAI_LETTERS);
  expectKitColours(found('bw-recap-screen'), colors);
  expectKitType(found('bw-recap-screen'));
});

test('over budget: how far over, in `over`, and the share text says so', async () => {
  for (const mode of ['light', 'dark'] as const) {
    mountRecap(AUGUST, { mode, resources: recapFake({ budgets: [recapBudget(AUGUST, '1000000')] }).resources });
    await recapShown();
    const over = found('recap-over');
    expect([over.textContent, over.style.color]).toEqual(['฿3,962.51', rgba((mode === 'dark' ? walletDark : walletLight).over)]);
    expect(screen.queryByText('เกิน')).not.toBeNull();
    expect(screen.queryByTestId('recap-under')).toBeNull();
    await act(async () => { fireEvent.click(named('button', 'แชร์สรุป')); });
    await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));
    expect(vi.mocked(Share.share).mock.calls[0]?.[0]).toEqual({
      message: [
        'สรุปเดือนสิงหาคม 2569', 'จดครบ 7 จาก 31 วัน', 'ใช้ไปทั้งเดือน: ฿13,962.51', 'งบ: ฿10,000 (เกิน ฿3,962.51)',
        'หมวดที่ใช้มากสุด', '• ค่าบิล: ฿13,167', '• การเดินทาง: ฿480', '• อาหาร: ฿315.51',
      ].join('\n'),
    });
    cleanup();
    vi.mocked(Share.share).mockClear();
  }
});

test('money in only, with no budget: the money out alone, and no top categories', async () => {
  mountRecap('2026-07', { resources: recapFake().resources });
  await recapShown();
  expect(found('recap-spent').textContent).toBe('฿0');
  expect(found('recap-days').textContent).toBe('จดครบ 2 จาก 31 วัน');
  expect(screen.queryByTestId('recap-card-rows')).toBeNull();
  expect(screen.queryByTestId('recap-top')).toBeNull();
  expect(headings()).toEqual(['สรุปเดือนกรกฎาคม 2569']);
});

test("the top three only, in topCategories' order, ties by name, a category no longer listed named as one", async () => {
  const august = (id: string, day: string, amountMinor: string, categoryId: string): TransactionDto => ({
    id, type: 'expense', amount_minor: amountMinor, occurred_on: `${AUGUST}-${day}`, wallet_id: '0000000a-0000-4000-8000-000000000001',
    category_id: categoryId, note: null, merchant: null, deleted_at: null, version: 1,
  });
  const extra = [
    // Food reaches ฿480, Travel's total: the tie goes to การเดินทาง by name in Thai, though Food is read first.
    august('0000000b-0000-4000-8000-000000000991', '05', '16449', '0000000c-0000-4000-8000-000000000001'),
    // ฿1,000 in a category the list no longer has.
    august('0000000b-0000-4000-8000-000000000992', '12', '100000', '0000000c-0000-4000-8000-0000000000ff'),
  ];
  mountRecap(AUGUST, { resources: recapFake({ budgets: BUDGET, extra }).resources });
  await recapShown();
  expect(within(found('recap-top')).getAllByTestId('recap-top-row').map((row) => row.textContent)).toEqual(['ค่าบิล฿13,167', 'หหมวดหมู่฿1,000', 'การเดินทาง฿480']);
});

test('the biggest day says payday only when that day holds a salary income', async () => {
  const salaryOnTheRentDay: TransactionDto = {
    id: '0000000b-0000-4000-8000-000000000990', type: 'income', amount_minor: '100000', occurred_on: `${AUGUST}-02`,
    wallet_id: '0000000a-0000-4000-8000-000000000002', category_id: '0000000c-0000-4000-8000-000000000004',
    note: null, merchant: null, deleted_at: null, version: 1,
  };
  mountRecap(AUGUST, { resources: recapFake({ budgets: BUDGET, extra: [salaryOnTheRentDay] }).resources });
  await recapShown();
  expect(found('recap-biggest-day').textContent).toBe('อาทิตย์ 2 ส.ค. วันเงินเดือนออก · ');
});

test('the biggest day and the cashback count read every page of the month', async () => {
  // A fully logged August with more than one page of history: every day shows on the first page, so
  // the days read stops there, while the rent and four Shopee buys of the 1st are on the second.
  const records: TransactionDto[] = [];
  for (let day = 2; day <= 31; day += 1) {
    for (let k = 0; k < 6; k += 1) {
      records.push(expense(10000 + day * 10 + k, `${AUGUST}-${String(day).padStart(2, '0')}`, '10000', day === 31 && k < 3 ? { merchant: 'Lazada' } : {}));
    }
  }
  records.push(expense(1001, `${AUGUST}-01`, '800000', { note: 'Rent' }));
  for (let k = 2; k <= 5; k += 1) records.push(expense(1000 + k, `${AUGUST}-01`, '1000', { merchant: 'Shopee' }));
  for (let k = 10; k < 30; k += 1) records.push(expense(1000 + k, `${AUGUST}-01`, '1000'));
  const { fake, resources } = recapFake({ records });
  mountRecap(AUGUST, { resources, ai: tipsOn() });
  await recapShown();
  expect(found('recap-days').textContent).toBe('จดครบ 31 จาก 31 วัน');
  expect(found('recap-biggest-day').textContent).toBe('เสาร์ 1 ส.ค. · ');
  expect(found('recap-biggest-day-amount').textContent).toBe('฿8,240');
  expect((await waitFor(() => found('recap-cashback'))).textContent).toBe(CASHBACK_SEVEN);
  // The days read took the first page; the records read took both.
  expect(fake.callsOf('history').map((call) => call.args[1])).toEqual([undefined, undefined, 'c200']);
});

// ---------------------------------------------------------------------------
// The cashback card (A5, D42, R73)

test('the cashback card is a count and shows only when tips are on', async () => {
  const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const mount = (ai: AiResources, extra: readonly TransactionDto[], month = AUGUST, mode: Mode = 'light') =>
    mountRecap(month, { mode, ai, resources: recapFake({ budgets: BUDGET, extra: [...extra] }).resources });

  // Tips on: a count of the month's buys at the shops that matched, never baht, that opens nothing (R73).
  mount(tipsOn(), SHOPPING, AUGUST, 'dark');
  const card = await waitFor(() => found('recap-cashback'));
  expect(card.textContent).toBe(CASHBACK_SEVEN);
  expect(card.textContent).not.toContain('฿');
  // Nothing in it, the card itself included, is a link or a button, or takes focus.
  const parts = [card, ...card.querySelectorAll<HTMLElement>('*')];
  expect(parts.map((part) => part.getAttribute('role')).filter((role) => role !== null)).toEqual([]);
  expect(parts.filter((part) => part.hasAttribute('tabindex'))).toHaveLength(0);
  fireEvent.click(card);
  expect(open).not.toHaveBeenCalled();
  expectKitColours(found('bw-recap-screen'), walletDark);
  cleanup();

  // One shop: the card names it.
  mount(tipsOn(), [expense(950, `${AUGUST}-05`, '120000', { merchant: 'Agoda' })]);
  expect((await waitFor(() => found('recap-cashback'))).textContent).toBe('1 รายการเดือนนี้ อาจได้เงินคืนผ่าน GoGoCashจาก Agoda · GoGoCash เป็นบริการในเครือ');
  cleanup();

  // Three shops: the first two, then และ the last.
  mount(tipsOn(), [...SHOPPING, expense(951, `${AUGUST}-05`, '120000', { merchant: 'Agoda' })]);
  expect((await waitFor(() => found('recap-cashback'))).textContent).toContain('จาก Shopee, Lazada และ Agoda · ');
  cleanup();

  // Tips off; the bridge switched off on the server (404); fewer than seven days logged; the AI
  // preferences unread (offline), so whether tips are on is unknown: no card.
  const bridgeOff = fakeAiResources({ cashbackCatalogue: vi.fn(async () => { throw new V1Error('not_found', 404, 'NOT_FOUND'); }) }, { cashback_tips: true }).resources;
  const unread = fakeAiResources({ preferences: vi.fn(async () => { throw new V1Error('network', 0, 'NETWORK_ERROR'); }) }, { cashback_tips: true }).resources;
  const cases = [
    ['tips off', fakeAiResources({}, { cashback_tips: false }).resources, SHOPPING, AUGUST],
    ['bridge off', bridgeOff, SHOPPING, AUGUST],
    ['three days logged', tipsOn(), [expense(960, '2026-06-18', '29900', { merchant: 'Shopee' })], '2026-06'],
    ['preferences unread', unread, SHOPPING, AUGUST],
  ] as const;
  for (const [why, ai, extra, month] of cases) {
    mount(ai, extra, month);
    await recapShown();
    await waitFor(() => expect(ai.cashbackCatalogue).toHaveBeenCalled());
    await settle();
    expect(screen.queryByTestId('recap-cashback'), why).toBeNull();
    cleanup();
  }
});

// ---------------------------------------------------------------------------
// The month's one celebration (W20, W6, R66)

test('confetti plays once per month on this phone, never under reduced motion, and never before the phone answers', async () => {
  // Full motion, the first opening of a past month: 24 pieces and one celebration haptic, and the month is kept.
  const first = mountRecap(AUGUST);
  await recapShown();
  await waitFor(() => expect(pieces()).toHaveLength(24));
  expect(haptics.playHaptic.mock.calls).toEqual([['celebration']]);
  expect(first.stored.get(MARK)).toBe('1');
  // The wallet's one answer: the root asked the phone, and the recap did not ask again (W6).
  expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
  cleanup();

  // The same month again on this phone: nothing.
  haptics.playHaptic.mockClear();
  mountRecap(AUGUST, { device: { [CONFETTI_NAME(AUGUST)]: '1' } });
  await recapShown();
  await settle();
  expect(pieces()).toHaveLength(0);
  expect(haptics.playHaptic).not.toHaveBeenCalled();
  cleanup();

  // Reduce Motion: the haptic alone, and the month is kept.
  const reduced = mountRecap(AUGUST, { reducedMotion: true });
  await recapShown();
  await waitFor(() => expect(haptics.playHaptic.mock.calls).toEqual([['celebration']]));
  expect(pieces()).toHaveLength(0);
  expect(reduced.stored.get(MARK)).toBe('1');
  cleanup();

  // Before the phone answers, motion reads as reduced and the moment is decided then: the haptic alone, even once the answer comes.
  haptics.playHaptic.mockClear();
  const pending = mountRecap(AUGUST, { reducedMotion: 'pending' });
  await recapShown();
  await waitFor(() => expect(haptics.playHaptic.mock.calls).toEqual([['celebration']]));
  await act(async () => { pending.answerReducedMotion(false); });
  await settle();
  expect(pieces()).toHaveLength(0);
  expect(haptics.playHaptic.mock.calls).toEqual([['celebration']]);
});

test("the confetti is 24 pieces in the materials' colours for 1.2 s, hidden from screen readers", () => {
  vi.useFakeTimers();
  try {
    render(<Confetti />);
    expect(pieces()).toHaveLength(24);
    const colours = [...new Set(pieces().map((piece) => piece.style.backgroundColor))].sort();
    expect(colours).toEqual((['silk', 'peach', 'sky', 'paper'] as const).map((material) => rgba(materialPaint(material, false).stops[1].color)).sort());
    expect(hiddenFromScreenReaders(pieces()[0] ?? null)).toBe(true);
    act(() => { vi.advanceTimersByTime(1199); });
    expect(pieces()).toHaveLength(24);
    act(() => { vi.advanceTimersByTime(1); });
    expect(pieces()).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});

test('a recap whose month changes in place starts afresh: no confetti or share problem from the month before', async () => {
  const view = mountRecap(AUGUST, { device: { [CONFETTI_NAME('2026-07')]: '1' } });
  await recapShown();
  await waitFor(() => expect(pieces()).toHaveLength(24));
  // August's confetti goes with August: July was celebrated before.
  view.rerender(<WalletRecapScreen month="2026-07" now={NOW} />);
  expect(pieces()).toHaveLength(0);
  await waitFor(() => expect(found('recap-title').textContent).toBe('สรุปเดือนกรกฎาคม 2569'));
  await recapShown();
  // July's share problem goes with July.
  vi.mocked(Share.share).mockRejectedValueOnce(new Error('Share is not supported in this browser'));
  await act(async () => { fireEvent.click(named('button', 'แชร์สรุป')); });
  await waitFor(() => found('recap-share-problem'));
  view.rerender(<WalletRecapScreen month={AUGUST} now={NOW} />);
  await waitFor(() => expect(found('recap-title').textContent).toBe('สรุปเดือนสิงหาคม 2569'));
  await recapShown();
  expect(screen.queryByTestId('recap-share-problem')).toBeNull();
});

test('this month, still going, never celebrates', async () => {
  const view = mountRecap('2026-09');
  await recapShown();
  await settle();
  expect(haptics.playHaptic).not.toHaveBeenCalled();
  expect(pieces()).toHaveLength(0);
  expect(view.stored.has(`jotbun.wallet.${CONFETTI_NAME('2026-09')}`)).toBe(false);
});

test('a phone whose store fails still celebrates once on this open, and only once', async () => {
  const view = mountRecap(AUGUST, { reducedMotion: 'pending' });
  // The phone's store can neither read nor keep the month's mark.
  const broken = async (): Promise<never> => { throw new Error('The store is full.'); };
  installStoreBackend({ getItem: broken, setItem: broken, removeItem: broken, getAllKeys: broken, multiRemove: broken });
  await recapShown();
  await waitFor(() => expect(haptics.playHaptic.mock.calls).toEqual([['celebration']]));
  // The answer arriving later decides nothing again.
  await act(async () => { view.answerReducedMotion(false); });
  await settle();
  expect(haptics.playHaptic.mock.calls).toEqual([['celebration']]);
  expect(pieces()).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// States, each with a way out (M7, m2, m3, m4)

test('a load problem says so with Try again and spends nothing; the recap celebrates once it loads', async () => {
  const { fake, resources } = recapFake({ budgets: BUDGET });
  fake.fail('summary', 'network');
  const view = mountRecap(AUGUST, { resources });
  const problem = await waitFor(() => found('recap-problem'));
  expect(named('heading', 'โหลดข้อมูลเดือนนี้ไม่สำเร็จ', problem)).toBeTruthy();
  expect(problem.textContent).toContain('ข้อมูลของคุณยังอยู่ครบ นี่เป็นปัญหาการเชื่อมต่อ ไม่ใช่เดือนที่ไม่มีรายการ');
  expect(document.body.textContent).not.toMatch(/[A-Za-z]/);
  // Close's and the month's glyphs only: no cheering Bun over a problem.
  expect(document.body.querySelectorAll('svg')).toHaveLength(2);
  await settle();
  expect(haptics.playHaptic).not.toHaveBeenCalled();
  expect(view.stored.has(MARK)).toBe(false);
  // Try again reads the month, and only now does it celebrate.
  fireEvent.click(named('button', 'ลองอีกครั้ง', problem));
  await recapShown();
  await waitFor(() => expect(haptics.playHaptic.mock.calls).toEqual([['celebration']]));
  expect(view.stored.get(MARK)).toBe('1');
});

test('loading says so in Thai with Close at hand; a problem a retry cannot fix offers no Try again', async () => {
  const held = recapFake({ budgets: BUDGET });
  held.fake.hold('summary');
  mountRecap(AUGUST, { resources: held.resources });
  expect(found('recap-loading').textContent).toBe('กำลังโหลดบันทึกของคุณ');
  expect(headings()).toEqual(['สรุปเดือนสิงหาคม 2569']);
  expect(screen.queryByTestId('recap-days')).toBeNull();
  expect(named('button', 'ปิด')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/[A-Za-z]/);
  cleanup();

  const update = recapFake({ budgets: BUDGET });
  update.fake.fail('summary', 'upgrade_required');
  mountRecap(AUGUST, { resources: update.resources });
  const problem = await waitFor(() => found('recap-problem'));
  expect(named('heading', 'อัปเดต Jotbun', problem)).toBeTruthy();
  expect(problem.textContent).toContain('อัปเดต Jotbun เพื่อใช้งานบันทึกต่อ ข้อมูลที่บันทึกไว้จะไม่หาย');
  expect(within(problem).queryAllByRole('button')).toHaveLength(0);
  expect(named('button', 'ปิด')).toBeTruthy();
});

test('a month not started and an empty month say so, with nothing to share or celebrate', async () => {
  const future = recapFake({ budgets: BUDGET });
  const first = mountRecap('2026-11', { resources: future.resources });
  const notStarted = await waitFor(() => found('recap-empty'));
  expect(named('heading', 'ไม่มีรายการในเดือนนี้', notStarted)).toBeTruthy();
  expect(notStarted.textContent).toContain('เดือนนี้ยังไม่เริ่ม');
  // Nothing of a month that has not started is read.
  expect(future.fake.callsOf('history')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'แชร์สรุป' })).toBeNull();
  await settle();
  expect(haptics.playHaptic).not.toHaveBeenCalled();
  expect(first.stored.has(`jotbun.wallet.${CONFETTI_NAME('2026-11')}`)).toBe(false);
  cleanup();

  const empty = mountRecap('2026-04');
  const nothing = await waitFor(() => found('recap-empty'));
  expect(named('heading', 'ไม่มีรายการในเดือนนี้', nothing)).toBeTruthy();
  expect(nothing.textContent).toContain('รายการที่คุณเพิ่มสำหรับเดือนนี้จะแสดงที่นี่');
  expect(screen.queryByRole('button', { name: 'แชร์สรุป' })).toBeNull();
  await settle();
  expect(haptics.playHaptic).not.toHaveBeenCalled();
  expect(empty.stored.has(`jotbun.wallet.${CONFETTI_NAME('2026-04')}`)).toBe(false);
});

test('Close goes back, or to Insights when there is nothing to go back to', async () => {
  mountRecap(AUGUST);
  await recapShown();
  const close = named('button', 'ปิด');
  expect([close.style.width, close.style.height]).toEqual(['44px', '44px']);
  fireEvent.click(close);
  expect(router.back).toHaveBeenCalledTimes(1);
  router.canGoBack.mockReturnValue(false);
  fireEvent.click(close);
  expect(router.replace).toHaveBeenCalledWith('/spend/insights');
  expect(router.back).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// Sharing, analytics and private mode

test('opening sends one recap_opened, sharing one recap_shared', async () => {
  const { sent, restore } = await recordAnalytics();
  try {
    mountRecap(AUGUST);
    await recapShown();
    const names = () => sent.filter((event) => event.kind === 'capture').map((event) => event.name);
    expect(names()).toEqual(['recap_opened']);
    // A share that cannot open sends nothing.
    vi.mocked(Share.share).mockRejectedValueOnce(new Error('Share is not supported in this browser'));
    await act(async () => { fireEvent.click(named('button', 'แชร์สรุป')); });
    await waitFor(() => found('recap-share-problem'));
    expect(names()).toEqual(['recap_opened']);
    // The sheet resolving sends one.
    await act(async () => { fireEvent.click(named('button', 'แชร์สรุป')); });
    await waitFor(() => expect(names()).toEqual(['recap_opened', 'recap_shared']));
    // No amount, note or name from the month.
    const json = JSON.stringify(sent);
    for (const secret of ['1226800', '12,268', '13,962', 'Rent', 'Bills', 'ค่าบิล', 'Cash', 'Daily account']) expect(json, secret).not.toContain(secret);
  } finally {
    restore();
  }
});

test('a share that cannot open says so, and the next press tries again', async () => {
  mountRecap(AUGUST);
  await recapShown();
  vi.mocked(Share.share).mockRejectedValueOnce(new Error('Share is not supported in this browser'));
  await act(async () => { fireEvent.click(named('button', 'แชร์สรุป')); });
  const problem = await waitFor(() => found('recap-share-problem'));
  expect([problem.textContent, problem.getAttribute('role')]).toEqual(['เปิดการแชร์ไม่ได้ ลองอีกครั้ง', 'alert']);
  expect(found('recap-card')).toBeTruthy();
  await act(async () => { fireEvent.click(named('button', 'แชร์สรุป')); });
  await waitFor(() => expect(screen.queryByTestId('recap-share-problem')).toBeNull());
  expect(Share.share).toHaveBeenCalledTimes(2);
});

test('private mode hides every amount', async () => {
  mountRecap(AUGUST, { device: { 'private-mode': '1' } });
  await recapShown();
  const root = found('bw-recap-screen');
  // Seven amounts, each ฿•••• and said as hidden: spent, the budget, what is left, the biggest day and the top three.
  expect(within(root).getAllByLabelText('ซ่อนยอดเงินอยู่')).toHaveLength(7);
  const said = [root.textContent ?? '', ...[...root.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label') ?? '')].join('\n');
  expect(said).not.toMatch(/฿\s?\d/);
  expect(said).not.toMatch(/\d\s?(บาท|baht)/);
  // The share text: the month, the days and the categories' names only (D41).
  await act(async () => { fireEvent.click(named('button', 'แชร์สรุป')); });
  await waitFor(() => expect(Share.share).toHaveBeenCalledTimes(1));
  expect(vi.mocked(Share.share).mock.calls[0]?.[0]).toEqual({ message: ['สรุปเดือนสิงหาคม 2569', 'จดครบ 7 จาก 31 วัน', 'หมวดที่ใช้มากสุด', '• ค่าบิล', '• การเดินทาง', '• อาหาร'].join('\n') });
});

test('the share button never says การ์ด', async () => {
  for (const locale of ['th', 'en'] as const) {
    mountRecap(AUGUST, { locale });
    await recapShown();
    expect(named('button', WORDS[locale].share).textContent).not.toMatch(/การ์ด|card/i);
    cleanup();
  }
});

test('screen readers meet no glyph: every drawing is hidden, and no symbol is spoken as text', async () => {
  mountRecap(AUGUST, { ai: tipsOn(), resources: recapFake({ budgets: BUDGET, extra: [...SHOPPING] }).resources });
  await waitFor(() => found('recap-cashback'));
  const root = found('bw-recap-screen');
  // Close, the calendar, Bun's face, three category tiles and the sparkle.
  const drawings = [...root.querySelectorAll('svg')];
  expect(drawings.length).toBeGreaterThanOrEqual(7);
  for (const drawing of drawings) expect(hiddenFromScreenReaders(drawing)).toBe(true);
  expect(root.textContent).not.toMatch(/[✦›✕]/);
});

// ---------------------------------------------------------------------------
// The catalogue (E2-C)

test("the catalogue's recap sections draw the real screen on fakes, one state each", async () => {
  expect(WALLET_RECAP_SECTIONS.map((section) => [section.id, section.group, section.layout])).toEqual([
    ['bw-recap', 'Screens', 'screen'],
    ['bw-recap-over', 'Screens', 'screen'],
    ['bw-recap-private', 'Screens', 'screen'],
    ['bw-recap-cashback', 'Screens', 'screen'],
  ]);
  // Listed in the catalogue together, after the tray's (index.ts adds each task's list in plan order).
  const ids = WALLET_SECTIONS.map((section) => section.id);
  const at = ids.indexOf('bw-recap');
  expect(ids.slice(at, at + 4)).toEqual(['bw-recap', 'bw-recap-over', 'bw-recap-private', 'bw-recap-cashback']);
  expect(at).toBeGreaterThan(ids.indexOf('bw-buttons'));
  const open = async (id: string, locale: Locale = 'th') => {
    const section = WALLET_RECAP_SECTIONS.find((each) => each.id === id);
    mountWallet(<>{section?.render()}</>, { locale });
    await waitFor(() => found('catalogue-screen-ready'), { timeout: 10_000 });
    return found('bw-recap-screen');
  };
  expect(found('recap-under', await open('bw-recap')).textContent).toBe('฿4,037.49');
  cleanup();
  expect((await open('bw-recap', 'en')).textContent).not.toMatch(THAI_LETTERS);
  cleanup();
  expect(found('recap-over', await open('bw-recap-over')).textContent).toBe('฿3,962.51');
  cleanup();
  const hidden = await open('bw-recap-private');
  expect(within(hidden).getAllByLabelText('ซ่อนยอดเงินอยู่')).toHaveLength(7);
  expect(hidden.textContent).not.toMatch(/฿\s?\d/);
  cleanup();
  expect(found('recap-cashback', await open('bw-recap-cashback')).textContent).toBe(CASHBACK_SEVEN);
}, 30_000);
