// The wallet card stack and the cards' frames (P2-T12; bw-home, dk-home,
// ax-large-home, ax-voiceover, ax-motion). Each case mounts through
// mountWallet, in Thai and by day unless it says otherwise, and settles the
// phone's answer and the stores inside act. The stack reads the wallet's
// reduced-motion answer at each press, so a case presses after the answer.
//
// happy-dom lays nothing out, so the cases read the styles that place each
// card. The frames' cases give each card's view a place in the window by
// stubbing getBoundingClientRect, which react-native-web's measureInWindow
// reads a moment after it is asked (a setTimeout of 0). react-native-web keeps
// a view's onLayout on its node as __reactLayoutHandler and calls it from a
// ResizeObserver, which happy-dom never fires, so the frames' case calls it as
// a layout would. Reanimated's springs run on the timers: a case that watches
// the lift uses vi.useFakeTimers() and reads each card's transform frame by
// frame. withSpring is watched (vi.fn around the real one), so a case sees the
// spring the lift asked for; vi.clearAllMocks() after each case.
import { act, cleanup, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ReduceMotion, withSpring } from 'react-native-reanimated';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

// react-native-web drops numberOfLines and the other clamps from the DOM, so
// the test records the props that reach the app's Text and still renders the
// real one, as WalletCard.render.test.tsx does.
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

// The lift's spring, watched.
vi.mock('react-native-reanimated', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native-reanimated')>();
  return { ...actual, withSpring: vi.fn(actual.withSpring) };
});

import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { setCurrentHapticPreference } from '@mobile/lib/hapticPreference';
import { haptics } from '@mobile/lib/haptics';
import { AX5, mountWallet } from '../testing/walletHarness';
import { CardFramesProvider, useCardFrames, useRegisterCardFrame } from './cardFrames';
import type { CardFrame, CardFrames } from './cardFrames';
import { CARD_HEIGHT, CARD_LIFT, CardStack, STACK_PEEK } from './CardStack';
import type { StackWallet } from './CardStack';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  seen.props.length = 0;
  setCurrentHapticPreference('on');
});

/** Lets the phone's answer, the stores and the measurements arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const MODES = ['light', 'dark'] as const;
const LOCALES = ['th', 'en'] as const;
const MINUS = '−';
const press = () => undefined;

/** bw-home's four wallets, back to front. Each carries today's money out; the stack shows the front card's only. */
const HOME: readonly StackWallet[] = [
  { id: 'w-credit', name: 'บัตรเครดิต', balanceMinor: '-392000', todayOutMinor: '1500', look: { kind: 'credit_card', material: 'titanium', face: 'calm' } },
  { id: 'w-transit', name: 'บัตรเดินทาง', balanceMinor: '18600', todayOutMinor: '3000', look: { kind: 'transit', material: 'sky', face: 'wow' } },
  { id: 'w-cash', name: 'เงินสด', balanceMinor: '124000', todayOutMinor: '6000', look: { kind: 'cash', material: 'paper', face: 'wink' } },
  { id: 'w-main', name: 'บัญชีหลัก', balanceMinor: '2486000', todayOutMinor: '4700', look: { kind: 'bank', material: 'silk', face: 'smile' } },
];

/** What each card says, in the drawn order (ax-voiceover's 9 to 12). */
const WORDS = {
  th: ['บัตรเครดิต, ใช้ไป 3,920 บาท', 'บัตรเดินทาง, เหลือ 186 บาท', 'เงินสด, เหลือ 1,240 บาท', 'บัญชีหลัก, เหลือ 24,860 บาท, วันนี้ใช้ 47 บาท'],
  en: ['บัตรเครดิต, 3,920 baht spent', 'บัตรเดินทาง, 186 baht left', 'เงินสด, 1,240 baht left', 'บัญชีหลัก, 24,860 baht left, 47 baht spent today'],
} as const;

/** 80 code points of Thai (Review Focus 3). */
const LONG_NAME = 'บัญชีออมทรัพย์สำหรับค่าเทอมลูกและค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดปีนะ';

const stack = () => screen.getByTestId('card-stack');
/** The frame that places a wallet's card, and lifts it. */
const cardFrame = (id: string) => screen.getByTestId(`card-stack-${id}`);
const buttons = () => screen.getAllByRole('button');
const labels = () => buttons().map((button) => button.getAttribute('aria-label'));
/** The text each of a card's Text elements draws, in order. */
const drawn = (element: Element) => [...element.querySelectorAll('[dir="auto"]')].map((node) => node.textContent);
/** Bun's face on a card (BunFace's drawing). */
const faces = (element: Element) => element.querySelectorAll('svg[viewBox="4 6 56 50"]').length;
/** The frames' order in the stack, by wallet id. */
const order = () => [...stack().children].map((child) => child.getAttribute('data-testid')?.replace('card-stack-', ''));

/** How far a card is lifted, in points (0 while it is in its place). */
function liftOf(id: string): number {
  const transform = cardFrame(id).style.transform;
  return transform === '' ? 0 : Number.parseFloat(transform.slice('translateY('.length));
}

/** Each card's lift, frame by frame (16 ms), for `ms`, on the faked timers. */
function trace(ids: readonly string[], ms: number): Record<string, number[]> {
  const lifts: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, []]));
  for (let at = 0; at < ms; at += 16) {
    act(() => { vi.advanceTimersByTime(16); });
    for (const id of ids) lifts[id].push(liftOf(id));
  }
  return lifts;
}

/** The spring each withSpring call asked for, in order. */
const springs = () => vi.mocked(withSpring).mock.calls.map(([to, config]) => [to, config]);
const GENTLE = { damping: 30, stiffness: 180, mass: 1, reduceMotion: ReduceMotion.Never };

type Place = { left: number; top: number; width: number; height: number };

/** Gives elements a place in the window, as the page's layout would; anything else is at 0, 0 with no size, as happy-dom says. */
function placeViews(places: Map<Element, Place>) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function placed(this: HTMLElement) {
    const { left, top, width, height } = places.get(this) ?? { left: 0, top: 0, width: 0, height: 0 };
    return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) } as DOMRect;
  });
}

/** What a layout of this view tells its onLayout (see the note at the top). */
function layOut(element: HTMLElement) {
  const handler = (element as unknown as { __reactLayoutHandler?: (event: unknown) => void }).__reactLayoutHandler;
  expect(typeof handler, 'the view has an onLayout').toBe('function');
  act(() => { handler?.({ nativeEvent: { layout: { x: 0, y: 0, width: 370, height: 362 } }, timeStamp: 0 }); });
}

/** Hands the test the frames the cards register in. */
function FramesProbe({ onFrames }: { onFrames: (frames: CardFrames) => void }) {
  onFrames(useCardFrames());
  return null;
}

/** A view registered under a wallet's id, as a card's is. */
function Registrar({ walletId, testID }: { walletId: string; testID: string }) {
  return <View testID={testID} ref={useRegisterCardFrame(walletId)} collapsable={false} />;
}

test('the stack is 54 pt per card plus one whole card', async () => {
  expect([STACK_PEEK, CARD_HEIGHT]).toEqual([54, 200]);
  for (const mode of MODES) {
    mountWallet(<CardStack wallets={HOME} onOpen={press} />, { mode });
    await settle();
    // In the order given: the three cards behind are placed 54 pt apart, over the front card...
    expect(order(), mode).toEqual(['w-credit', 'w-transit', 'w-cash', 'w-main']);
    const frames = HOME.map(({ id }) => cardFrame(id));
    expect(frames.slice(0, 3).map((frame) => [frame.style.position, frame.style.top, frame.style.left, frame.style.right]), mode).toEqual([
      ['absolute', '0px', '0px', '0px'],
      ['absolute', '54px', '0px', '0px'],
      ['absolute', '108px', '0px', '0px'],
    ]);
    // ...which is whole, in the stack's own flow, 3 × 54 pt down, so the stack grows with it and covers nothing under it.
    expect([frames[3].style.position, frames[3].style.top, frames[3].style.marginTop], mode).toEqual(['', '', '162px']);
    // Every card is 200 pt: the stack is 3 × 54 + 200 = 362 pt.
    const cards = buttons();
    expect(cards.map((card) => card.style.minHeight), mode).toEqual(['200px', '200px', '200px', '200px']);
    expect(Number.parseFloat(frames[3].style.marginTop) + Number.parseFloat(cards[3].style.minHeight), mode).toBe(362);
    cleanup();
  }
  // One wallet is one whole card at the top; no wallets draw nothing.
  mountWallet(<CardStack wallets={HOME.slice(3)} onOpen={press} />);
  await settle();
  expect([cardFrame('w-main').style.position, cardFrame('w-main').style.marginTop, cardFrame('w-main').style.boxShadow]).toEqual(['', '0px', '']);
  cleanup();
  mountWallet(<CardStack wallets={[]} onOpen={press} />);
  await settle();
  expect([stack().childElementCount, screen.queryAllByRole('button').length]).toEqual([0, 0]);
});

test("by day each card casts bw-home's shadow up onto the card behind it; at night, and in the list, none", async () => {
  for (const mode of MODES) {
    mountWallet(<CardStack wallets={HOME} onOpen={press} />, { mode });
    await settle();
    const frames = HOME.map(({ id }) => cardFrame(id));
    // The first card has no card behind it; the front card's shadow is deeper (dk-home draws none).
    expect(frames.map((frame) => frame.style.boxShadow), mode).toEqual(mode === 'light'
      ? ['', '0px -4px 14px rgba(17, 16, 20, 0.1)', '0px -4px 14px rgba(17, 16, 20, 0.1)', '0px -6px 18px rgba(17, 16, 20, 0.12)']
      : ['', '', '', '']);
    // Each frame has the card's corner, which the shadow follows.
    expect(frames.map((frame) => frame.style.borderRadius), mode).toEqual(['22px', '22px', '22px', '22px']);
    cleanup();
    mountWallet(<CardStack wallets={HOME} onOpen={press} />, { mode, fontScale: AX5 });
    await settle();
    expect(HOME.map(({ id }) => cardFrame(id).style.boxShadow), `${mode} AX5`).toEqual(['', '', '', '']);
    cleanup();
  }
});

test('pressing a card plays the walletOpen tick and opens that wallet at once', async () => {
  for (const mode of MODES) {
    const onOpen = vi.fn();
    const tick = vi.spyOn(haptics, 'selection');
    mountWallet(<CardStack wallets={HOME} onOpen={onOpen} />, { mode });
    await settle();
    vi.useFakeTimers();
    // A card behind the front one, then the front card: each opens its own wallet with its tick, in the same act, before any frame of the lift.
    act(() => { buttons()[1].click(); });
    expect([onOpen.mock.calls, tick.mock.calls.length], mode).toEqual([[['w-transit']], 1]);
    act(() => { buttons()[3].click(); });
    expect([onOpen.mock.calls, tick.mock.calls.length], mode).toEqual([[['w-transit'], ['w-main']], 2]);
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  }
  // The person's Haptics setting applies (playHaptic): with it off, a press opens the wallet and plays nothing.
  setCurrentHapticPreference('off');
  const onOpen = vi.fn();
  const tick = vi.spyOn(haptics, 'selection');
  mountWallet(<CardStack wallets={HOME} onOpen={onOpen} />);
  await settle();
  act(() => { buttons()[0].click(); });
  expect([onOpen.mock.calls, tick.mock.calls.length]).toEqual([[['w-credit']], 0]);
});

test('under reduced motion the card opens with no lift', async () => {
  for (const mode of MODES) {
    const onOpen = vi.fn();
    const tick = vi.spyOn(haptics, 'selection');
    mountWallet(<CardStack wallets={HOME} onOpen={onOpen} />, { mode, reducedMotion: true });
    await settle();
    vi.useFakeTimers();
    act(() => { buttons()[3].click(); });
    // It opens at once, with the same tick (haptics never change, ax-motion)...
    expect([onOpen.mock.calls, tick.mock.calls.length], mode).toEqual([[['w-main']], 1]);
    // ...and nothing moves.
    const lifts = trace(['w-main', 'w-cash'], 1500);
    expect([...lifts['w-main'], ...lifts['w-cash']].every((lift) => lift === 0), mode).toBe(true);
    expect(springs(), mode).toEqual([]);
    vi.useRealTimers();
    cleanup();
    vi.restoreAllMocks();
  }
  // Before the phone answers, motion reads as reduced (R66): nothing moves.
  const onOpen = vi.fn();
  const { answerReducedMotion } = mountWallet(<CardStack wallets={HOME} onOpen={onOpen} />, { reducedMotion: 'pending' });
  await settle();
  vi.useFakeTimers();
  act(() => { buttons()[3].click(); });
  expect(onOpen.mock.calls).toEqual([['w-main']]);
  expect(trace(['w-main'], 1500)['w-main'].every((lift) => lift === 0)).toBe(true);
  expect(springs()).toEqual([]);
  // The press reads the answer when it has come: at full motion the card lifts.
  await act(async () => { answerReducedMotion(false); });
  act(() => { buttons()[3].click(); });
  expect(springs()).toEqual([[-CARD_LIFT, GENTLE], [0, GENTLE]]);
  expect(Math.min(...trace(['w-main'], 3000)['w-main'])).toBeLessThan(-11.5);
});

test('at full motion a pressed card lifts 12 pt on the gentle spring and settles back in its place; the others stay', async () => {
  const ids = HOME.map(({ id }) => id);
  for (const mode of MODES) {
    mountWallet(<CardStack wallets={HOME} onOpen={press} />, { mode });
    await settle();
    vi.useFakeTimers();
    act(() => { buttons()[1].click(); });
    expect(CARD_LIFT).toBe(12);
    // Up 12 pt and back down, each on the gentle spring, whatever Reanimated's own setting says (W6).
    expect(springs(), mode).toEqual([[-12, GENTLE], [0, GENTLE]]);
    const lifts = trace(ids, 3000);
    const lifted = lifts['w-transit'];
    // It rises to 12 pt and no further (the gentle spring does not overshoot), then comes back to its place.
    expect(Math.min(...lifted), mode).toBeLessThan(-11.5);
    expect(Math.min(...lifted), mode).toBeGreaterThanOrEqual(-12);
    expect(Math.max(...lifted), mode).toBeLessThanOrEqual(0);
    expect(lifted.findIndex((lift) => lift < -11.5), mode).toBeGreaterThan(lifted.findIndex((lift) => lift < 0));
    expect(cardFrame('w-transit').style.transform, mode).toBe('translateY(0px)');
    // The cards around it never move.
    for (const id of ['w-credit', 'w-cash', 'w-main']) expect(lifts[id].every((lift) => lift === 0), `${mode} ${id}`).toBe(true);
    vi.useRealTimers();
    cleanup();
    vi.clearAllMocks();
  }
});

test('at AX5 the stack is a list with the front card first, and nothing truncates', async () => {
  const wallets: readonly StackWallet[] = [
    ...HOME.slice(0, 3),
    { ...HOME[3], name: LONG_NAME, balanceMinor: '99999999999', pendingMinor: '99999999999', todayOutMinor: '99999999999' },
  ];
  expect([...LONG_NAME]).toHaveLength(80);
  for (const mode of MODES) {
    mountWallet(<CardStack wallets={wallets} onOpen={press} />, { mode, fontScale: AX5 });
    await settle();
    // One column, front card first, then back to the first card (ax-large-home), 14 pt apart.
    expect(order(), mode).toEqual(['w-main', 'w-cash', 'w-transit', 'w-credit']);
    expect(stack().style.gap, mode).toBe('14px');
    // Spine cards (no face), each in the column's flow: no card is placed over another.
    const cards = buttons();
    expect(cards.map(faces), mode).toEqual([0, 0, 0, 0]);
    expect(wallets.map(({ id }) => [cardFrame(id).style.position, cardFrame(id).style.top, cardFrame(id).style.marginTop]), mode).toEqual(wallets.map(() => ['', '', '']));
    // Every word and digit drawn whole: the front card with its pending total and today's money out, the others with neither.
    expect(cards.map(drawn), mode).toEqual([
      [LONG_NAME, '฿999,999,999.99', 'รวม ฿999,999,999.99 ที่กำลังบันทึก', `วันนี้ ${MINUS}฿999,999,999.99`],
      ['เงินสด', '฿1,240'],
      ['บัตรเดินทาง', '฿186'],
      ['บัตรเครดิต', 'ใช้ไป', '฿3,920'],
    ]);
    // No Text is clamped or shrunk to fit.
    expect(seen.props.length, mode).toBeGreaterThan(0);
    for (const props of seen.props) {
      expect([props.numberOfLines, props.adjustsFontSizeToFit, props.ellipsizeMode], mode).toEqual([undefined, undefined, undefined]);
    }
    cleanup();
    seen.props.length = 0;
  }
});

test("screen readers meet the cards in the drawn order, each a button with its card's words", async () => {
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      const at = `${locale} ${mode}`;
      mountWallet(<CardStack wallets={HOME} onOpen={press} />, { locale, mode });
      await settle();
      // Back to front, as drawn: only the front card says today's money out, though every wallet carries it.
      expect(labels(), at).toEqual(WORDS[locale]);
      const spent = locale === 'th' ? 'ใช้ไป' : 'Spent';
      expect(buttons().map(drawn), at).toEqual([
        ['บัตรเครดิต', spent, '฿3,920'],
        ['บัตรเดินทาง', '฿186'],
        ['เงินสด', '฿1,240'],
        ['บัญชีหลัก', '฿24,860', locale === 'th' ? `วันนี้ ${MINUS}฿47` : `Today ${MINUS}฿47`],
      ]);
      // The stack itself says nothing and is no control: only its four cards are.
      expect([stack().getAttribute('role'), stack().getAttribute('aria-label')], at).toEqual([null, null]);
      expect(within(stack()).getAllByRole('button'), at).toHaveLength(4);
      cleanup();
    }
  }
});

test('a wallet added later joins the front of the stack at once: the stack plays no drop', async () => {
  const view = mountWallet(<CardStack wallets={HOME.slice(0, 3)} onOpen={press} />);
  await settle();
  expect(drawn(buttons()[2])).toEqual(['เงินสด', '฿1,240', `วันนี้ ${MINUS}฿60`]);
  view.rerender(<CardStack wallets={HOME} onOpen={press} />);
  // The new card is drawn at once, whole, in front, with no entering animation (its drop is P2-T21's, on bw-adding)...
  const added = cardFrame('w-main');
  expect([added.style.marginTop, added.style.visibility, added.style.animationName]).toEqual(['162px', '', '']);
  expect(drawn(buttons()[3])).toEqual(['บัญชีหลัก', '฿24,860', `วันนี้ ${MINUS}฿47`]);
  // ...and the card that was in front moves back into its place, and loses its today line.
  expect([cardFrame('w-cash').style.position, cardFrame('w-cash').style.top]).toEqual(['absolute', '108px']);
  expect(drawn(buttons()[2])).toEqual(['เงินสด', '฿1,240']);
});

test("a bank account below zero keeps its minus in the stack and in the list, in words and on screen (P2-T11's review, K5)", async () => {
  const below: StackWallet = { id: 'w-over', name: 'บัญชีติดลบ', balanceMinor: '-392000', look: { kind: 'bank', material: 'silk', face: 'smile' } };
  for (const fontScale of [1, AX5]) {
    mountWallet(<CardStack wallets={[below]} onOpen={press} />, { fontScale });
    await settle();
    // The stack card at the standard sizes, the spine card at the largest.
    expect(faces(screen.getByRole('button')), `${fontScale}`).toBe(fontScale === 1 ? 1 : 0);
    expect(drawn(screen.getByRole('button')), `${fontScale}`).toContain(`${MINUS}฿3,920`);
    expect(screen.getByRole('button').getAttribute('aria-label'), `${fontScale}`).toBe('บัญชีติดลบ, เหลือ ติดลบ 3,920 บาท');
    cleanup();
  }
});

test("each card's place in the window is known after layout, measured again when the stack lays out, and forgotten when the card leaves", async () => {
  const places = new Map<Element, Place>();
  placeViews(places);
  let frames: CardFrames | null = null;
  const take = (given: CardFrames) => { frames = given; };
  const frameOf = (id: string): CardFrame | null => (frames as CardFrames | null)?.frameOf(id) ?? null;
  const tree = (wallets: readonly StackWallet[]) => (
    <CardFramesProvider>
      <FramesProbe onFrames={take} />
      <CardStack wallets={wallets} onOpen={press} />
    </CardFramesProvider>
  );
  const view = mountWallet(tree(HOME));
  // The view each card registers is the card's own box, inside its frame.
  const viewOf = (id: string) => cardFrame(id).firstElementChild as HTMLElement;
  const placeAt = (down: number) => HOME.forEach(({ id }, index) => { places.set(viewOf(id), { left: 16, top: 300 + down + STACK_PEEK * index, width: 370, height: 200 }); });
  const expected = (down: number) => HOME.map((_, index) => ({ x: 16, y: 300 + down + STACK_PEEK * index, width: 370, height: 200 }));
  placeAt(0);
  // Nothing is known until the page has laid out.
  expect(frameOf('w-main')).toBeNull();
  await settle();
  expect(HOME.map(({ id }) => frameOf(id))).toEqual(expected(0));
  expect(frameOf('w-unknown')).toBeNull();

  // The stack moves 40 pt down the page (say the budget card above it grew): its layout measures every card again.
  placeAt(40);
  layOut(stack());
  await settle();
  expect(HOME.map(({ id }) => frameOf(id))).toEqual(expected(40));

  // measure() measures them again when asked (for P2-T17, before a flight).
  placeAt(-100);
  act(() => { (frames as CardFrames | null)?.measure(); });
  await settle();
  expect(HOME.map(({ id }) => frameOf(id))).toEqual(expected(-100));

  // A card that leaves is forgotten at once, and a measurement already asked for it is never given out; the others keep theirs.
  placeAt(0);
  act(() => { (frames as CardFrames | null)?.measure(); });
  view.rerender(tree(HOME.filter(({ id }) => id !== 'w-cash')));
  expect(frameOf('w-cash')).toBeNull();
  // The others keep what was measured last until the new answers land.
  expect(['w-credit', 'w-transit', 'w-main'].map(frameOf)).toEqual([expected(-100)[0], expected(-100)[1], expected(-100)[3]]);
  await settle();
  expect(frameOf('w-cash')).toBeNull();
  expect(['w-credit', 'w-transit', 'w-main'].map(frameOf)).toEqual([expected(0)[0], expected(0)[1], expected(0)[3]]);
  cleanup();

  // At the largest text sizes the list's cards register too, and its layout measures them again.
  const listView = mountWallet(tree(HOME), { fontScale: AX5 });
  const placeList = (down: number) => HOME.forEach(({ id }, index) => { places.set(viewOf(id), { left: 16, top: 120 + down + 300 * index, width: 370, height: 280 }); });
  placeList(0);
  await settle();
  expect(frameOf('w-credit')).toEqual({ x: 16, y: 120, width: 370, height: 280 });
  placeList(25);
  layOut(stack());
  await settle();
  expect(frameOf('w-credit')).toEqual({ x: 16, y: 145, width: 370, height: 280 });
  listView.unmount();
  expect(frameOf('w-credit')).toBeNull();
});

test('one view per wallet id: the last registered answers, and a view that leaves never forgets another; outside a provider nothing is kept', async () => {
  const places = new Map<Element, Place>();
  placeViews(places);
  let frames: CardFrames | null = null;
  const take = (given: CardFrames) => { frames = given; };
  const frameOf = (id: string): CardFrame | null => (frames as CardFrames | null)?.frameOf(id) ?? null;
  const tree = (children: ReactNode) => (
    <CardFramesProvider>
      <FramesProbe onFrames={take} />
      {children}
    </CardFramesProvider>
  );
  const A = { x: 10, y: 20, width: 30, height: 40 };
  const B = { x: 50, y: 60, width: 70, height: 80 };
  const placeAs = (testID: string, frame: CardFrame) => { places.set(screen.getByTestId(testID), { left: frame.x, top: frame.y, width: frame.width, height: frame.height }); };

  // Each render passes its views as one keyed list, so React keeps a view that stays.
  const view = mountWallet(tree([<Registrar key="a" walletId="w1" testID="a" />]));
  placeAs('a', A);
  await settle();
  expect(frameOf('w1')).toEqual(A);
  // A second view under the same id answers once it is measured...
  view.rerender(tree([<Registrar key="a" walletId="w1" testID="a" />, <Registrar key="b" walletId="w1" testID="b" />]));
  placeAs('b', B);
  await settle();
  expect(frameOf('w1')).toEqual(B);
  // ...and the first one leaving does not forget it.
  view.rerender(tree([<Registrar key="b" walletId="w1" testID="b" />]));
  expect(frameOf('w1')).toEqual(B);
  // A view whose wallet changes is forgotten under the old id and known under the new one.
  view.rerender(tree([<Registrar key="b" walletId="w2" testID="b" />]));
  expect(frameOf('w1')).toBeNull();
  await settle();
  expect(frameOf('w2')).toEqual(B);
  cleanup();

  // Outside a provider nothing is kept and measure() does nothing; the stack still opens its wallets.
  frames = null;
  const onOpen = vi.fn();
  mountWallet(<><FramesProbe onFrames={take} /><CardStack wallets={HOME} onOpen={onOpen} /></>);
  places.set(cardFrame('w-main').firstElementChild as HTMLElement, { left: 1, top: 2, width: 3, height: 4 });
  await settle();
  act(() => { (frames as CardFrames | null)?.measure(); });
  await settle();
  expect([frames === null, frameOf('w-main')]).toEqual([false, null]);
  act(() => { buttons()[3].click(); });
  expect(onOpen.mock.calls).toEqual([['w-main']]);
});

test("the catalogue's stack sections come after the kit's and draw bw-home's stack; the largest-text one is the list at AX5", async () => {
  const ids = WALLET_SECTIONS.map((section) => section.id);
  const kitEnd = ids.indexOf('bw-category-icons');
  expect(ids.slice(kitEnd, kitEnd + 4)).toEqual(['bw-category-icons', 'bw-stack', 'bw-stack-large', 'bw-tray-short']);
  const sections = WALLET_SECTIONS.filter((section) => section.id.startsWith('bw-stack'));
  expect(sections.map(({ id, title, group }) => [id, title, group])).toEqual([
    ['bw-stack', 'Bun Wallet: card stack', 'Kit'],
    ['bw-stack-large', 'Bun Wallet: card stack, largest text', 'Kit'],
  ]);
  for (const mode of MODES) {
    mountWallet(<>{sections[0].render()}</>, { mode });
    await settle();
    expect(labels(), mode).toEqual(WORDS.th);
    expect([order(), buttons().map(faces)], mode).toEqual([['bw-stack-credit', 'bw-stack-transit', 'bw-stack-cash', 'bw-stack-main'], [1, 1, 1, 1]]);
    cleanup();
  }
  mountWallet(<>{sections[1].render()}</>, { fontScale: AX5 });
  await settle();
  expect(labels()).toEqual([
    `${LONG_NAME}, เหลือ 999,999,999 บาท 99 สตางค์, รวม 50 บาทที่กำลังบันทึก, วันนี้ใช้ 999,999,999 บาท 99 สตางค์`,
    'เงินสด, เหลือ 1,240 บาท',
    'บัตรเดินทาง, เหลือ 186 บาท',
    'บัตรเครดิต, ใช้ไป 3,920 บาท',
  ]);
  expect(buttons().map(faces)).toEqual([0, 0, 0, 0]);
});
