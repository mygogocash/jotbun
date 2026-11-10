// The wallet card (P2-T11; bw-home, bw-wallet, rh-offline, ax-large-home,
// ax-voiceover): a credit card reads what was spent, every other wallet what
// is left; one button that says its words; the pending total on every
// variant; the material's text colours and dark titanium's edge; nothing
// clamped at AX5 (Review Focus 3); at least 44 pt tall; and looks kept for
// the open diary's account, or derived with none.
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

// react-native-web drops maxFontSizeMultiplier and numberOfLines from the DOM,
// so the test records the props that reach the app's Text and still renders
// the real one, as WalletAmount.render.test.tsx does.
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

import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { materialPaint } from '@mobile/theme/walletPalette';
import type { WalletMaterial } from '@mobile/theme/walletPalette';
import { amountMaxScale, WALLET_TYPE } from '@mobile/theme/walletType';
import { derivedLook } from '../looks/walletLooks';
import type { WalletLook } from '../looks/walletLooks';
import { useWalletLooks } from '../looks/WalletLooksProvider';
import { AX5, mountWallet } from '../testing/walletHarness';
import { WalletCard } from './WalletCard';
import type { WalletCardModel } from './WalletCard';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  seen.props.length = 0;
});

/** Lets the stores, the phone's answer and Bun's AI preferences arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const MODES = ['light', 'dark'] as const;
const LOCALES = ['th', 'en'] as const;
const MINUS = '−';
const HIDDEN = '฿••••';
const press = () => undefined;

const CREDIT: WalletCardModel = { id: 'w-credit', name: 'บัตรเครดิต', balanceMinor: '-392000' };
const TRANSIT: WalletCardModel = { id: 'w-transit', name: 'บัตรเดินทาง', balanceMinor: '18600' };
const MAIN: WalletCardModel = { id: 'w-main', name: 'บัญชีหลัก', balanceMinor: '2481000', pendingMinor: '5000', todayOutMinor: '9700' };
const CREDIT_LOOK: WalletLook = { kind: 'credit_card', material: 'titanium', face: 'calm' };
const TRANSIT_LOOK: WalletLook = { kind: 'transit', material: 'sky', face: 'wow' };
const MAIN_LOOK: WalletLook = { kind: 'bank', material: 'silk', face: 'smile' };

/** 80 code points of Thai (Review Focus 3). */
const LONG_NAME = 'บัญชีออมทรัพย์สำหรับค่าเทอมลูกและค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดปีนะ';

/** A card by its words: a button when pressable, else the element that says them. */
const card = (spoken: string) => screen.queryByRole('button', { name: spoken }) ?? (document.querySelector(`[aria-label="${spoken}"]`) as HTMLElement);
/** The text each of a card's Text elements draws, in order. */
const drawn = (element: HTMLElement) => [...element.querySelectorAll('[dir="auto"]')].map((node) => node.textContent);
/** The material a card's fill draws, by its gradient's id. */
const materialOf = (element: HTMLElement) => element.querySelector('linearGradient')?.getAttribute('id');

test('a credit card shows what was spent, others show what is left', async () => {
  const cards: readonly [WalletCardModel, WalletLook][] = [
    [CREDIT, CREDIT_LOOK],
    [TRANSIT, TRANSIT_LOOK],
    // A new credit card has spent nothing yet; one paid ahead has money left; a bank account can go below zero.
    [{ id: 'w-new', name: 'บัตรใหม่', balanceMinor: '0' }, CREDIT_LOOK],
    [{ id: 'w-ahead', name: 'บัตรจ่ายล่วงหน้า', balanceMinor: '50000' }, CREDIT_LOOK],
    [{ id: 'w-below', name: 'บัญชีติดลบ', balanceMinor: '-392000' }, MAIN_LOOK],
  ];
  for (const locale of LOCALES) {
    for (const mode of MODES) {
      mountWallet(<>{cards.map(([wallet, look]) => <WalletCard key={wallet.id} wallet={wallet} look={look} variant="stack" onPress={press} />)}</>, { locale, mode });
      await settle();
      const at = `${locale} ${mode}`;
      const spent = locale === 'th' ? 'ใช้ไป' : 'Spent';
      expect(screen.getAllByRole('button').map(drawn), at).toEqual([
        ['บัตรเครดิต', spent, '฿3,920'],
        ['บัตรเดินทาง', '฿186'],
        ['บัตรใหม่', spent, '฿0'],
        ['บัตรจ่ายล่วงหน้า', '฿500'],
        ['บัญชีติดลบ', `${MINUS}฿3,920`],
      ]);
      expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label')), at).toEqual(locale === 'th'
        ? ['บัตรเครดิต, ใช้ไป 3,920 บาท', 'บัตรเดินทาง, เหลือ 186 บาท', 'บัตรใหม่, ใช้ไป 0 บาท', 'บัตรจ่ายล่วงหน้า, เหลือ 500 บาท', 'บัญชีติดลบ, เหลือ ติดลบ 3,920 บาท']
        : ['บัตรเครดิต, 3,920 baht spent', 'บัตรเดินทาง, 186 baht left', 'บัตรใหม่, 0 baht spent', 'บัตรจ่ายล่วงหน้า, 500 baht left', 'บัญชีติดลบ, minus 3,920 baht left']);
      cleanup();
    }
  }
});

test('each card says itself as ax-voiceover and rh-offline write it', async () => {
  const opened: string[] = [];
  for (const locale of LOCALES) {
    mountWallet(
      <>
        <WalletCard wallet={CREDIT} look={CREDIT_LOOK} variant="stack" onPress={press} />
        <WalletCard wallet={TRANSIT} look={TRANSIT_LOOK} variant="stack" onPress={press} />
        <WalletCard wallet={MAIN} look={MAIN_LOOK} variant="stack" onPress={() => opened.push(locale)} />
      </>,
      { locale },
    );
    await settle();
    const words = locale === 'th'
      ? ['บัตรเครดิต, ใช้ไป 3,920 บาท', 'บัตรเดินทาง, เหลือ 186 บาท', 'บัญชีหลัก, เหลือ 24,810 บาท, รวม 50 บาทที่กำลังบันทึก, วันนี้ใช้ 97 บาท']
      : ['บัตรเครดิต, 3,920 baht spent', 'บัตรเดินทาง, 186 baht left', 'บัญชีหลัก, 24,810 baht left, including 50 baht still saving, 97 baht spent today'];
    // Each card is one button, in the order drawn, and a tap opens it.
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label')), locale).toEqual(words);
    await act(async () => { screen.getByRole('button', { name: words[2] }).click(); });
    cleanup();

    const { container } = mountWallet(<WalletCard wallet={MAIN} look={MAIN_LOOK} variant="stack" onPress={press} />, { locale, device: { 'private-mode': '1' } });
    await settle();
    expect(screen.getByRole('button').getAttribute('aria-label'), locale).toBe(locale === 'th' ? 'บัญชีหลัก, ซ่อนยอดเงินอยู่' : 'บัญชีหลัก, Amount hidden');
    expect(container.textContent, locale).not.toMatch(/\d/);
    cleanup();

    // Without onPress the card is no button, and still says its words as one element.
    mountWallet(<WalletCard wallet={TRANSIT} look={TRANSIT_LOOK} variant="full" />, { locale });
    await settle();
    expect(screen.queryByRole('button'), locale).toBeNull();
    expect(card(words[1]), locale).not.toBeNull();
    cleanup();
  }
  expect(opened).toEqual(['th', 'en']);
});

test('the pending line shows on stack cards too', async () => {
  const pending: WalletCardModel = { ...MAIN, todayOutMinor: null };
  for (const variant of ['stack', 'full', 'spine'] as const) {
    for (const locale of LOCALES) {
      mountWallet(
        <>
          <WalletCard wallet={pending} look={MAIN_LOOK} variant={variant} onPress={press} />
          <WalletCard wallet={{ ...pending, id: 'w-none', name: 'ไม่มีรอ', pendingMinor: '0' }} look={MAIN_LOOK} variant={variant} onPress={press} />
          <WalletCard wallet={{ ...pending, id: 'w-unset', name: 'ไม่ได้ส่ง', pendingMinor: undefined }} look={MAIN_LOOK} variant={variant} onPress={press} />
        </>,
        { locale },
      );
      await settle();
      const [saving, none, unset] = screen.getAllByRole('button').map(drawn);
      const line = locale === 'th' ? 'รวม ฿50 ที่กำลังบันทึก' : 'Includes ฿50 still saving';
      expect(saving, `${variant} ${locale}`).toContain(line);
      // A zero or unset total draws no pending line at all.
      expect([none, unset].flat().some((text) => text?.startsWith(locale === 'th' ? 'รวม' : 'Includes')), `${variant} ${locale}`).toBe(false);
      cleanup();
    }
  }
});

test("the full card adds the kind line; today's money out shows when it is passed; private mode masks each line in place", async () => {
  const kinds = [['cash', 'ในกระเป๋าสตางค์'], ['bank', 'บัญชีธนาคาร'], ['credit_card', 'ยอดที่ใช้ไป'], ['transit', 'BTS / MRT']] as const;
  for (const [kind, line] of kinds) {
    mountWallet(
      <>
        <WalletCard wallet={TRANSIT} look={{ ...TRANSIT_LOOK, kind }} variant="full" onPress={press} />
        <WalletCard wallet={{ ...TRANSIT, id: 'w-stack', name: 'กองบัตร' }} look={{ ...TRANSIT_LOOK, kind }} variant="stack" onPress={press} />
        <WalletCard wallet={{ ...TRANSIT, id: 'w-spine', name: 'แถว' }} look={{ ...TRANSIT_LOOK, kind }} variant="spine" onPress={press} />
      </>,
    );
    await settle();
    const [full, stack, spine] = screen.getAllByRole('button').map(drawn);
    expect([full.includes(line), stack.includes(line), spine.includes(line)], kind).toEqual([true, false, false]);
    cleanup();
  }
  // No kind kept: no kind line, even on the full card.
  mountWallet(<WalletCard wallet={TRANSIT} look={derivedLook(TRANSIT.id)} variant="full" onPress={press} />);
  await settle();
  expect(drawn(screen.getByRole('button'))).toEqual(['บัตรเดินทาง', '฿186']);
  cleanup();

  for (const variant of ['stack', 'full', 'spine'] as const) {
    mountWallet(
      <>
        <WalletCard wallet={MAIN} look={MAIN_LOOK} variant={variant} onPress={press} />
        <WalletCard wallet={{ ...MAIN, id: 'w-quiet', name: 'วันเงียบ', todayOutMinor: '0' }} look={MAIN_LOOK} variant={variant} onPress={press} />
      </>,
      { locale: 'en' },
    );
    await settle();
    const [today, quiet] = screen.getAllByRole('button').map(drawn);
    expect(today, variant).toContain(`Today ${MINUS}฿97`);
    expect(quiet.some((text) => text?.startsWith('Today')), variant).toBe(false);
    cleanup();

    const { container } = mountWallet(<WalletCard wallet={MAIN} look={MAIN_LOOK} variant={variant} onPress={press} />, { device: { 'private-mode': '1' } });
    await settle();
    // Each line keeps its place, so nothing moves when amounts are hidden (W10).
    expect(drawn(screen.getByRole('button')), variant).toEqual(expect.arrayContaining([HIDDEN, `รวม ${HIDDEN} ที่กำลังบันทึก`, `วันนี้ ${HIDDEN}`]));
    expect(container.textContent, variant).not.toMatch(/\d/);
    cleanup();
  }
});

test('titanium carries white text, silk ink; dark titanium has a 1 pt edge of #5C5968', async () => {
  for (const mode of MODES) {
    const dark = mode === 'dark';
    mountWallet(
      <>
        <WalletCard wallet={CREDIT} look={CREDIT_LOOK} variant="stack" onPress={press} />
        <WalletCard wallet={MAIN} look={MAIN_LOOK} variant="full" onPress={press} />
      </>,
      { mode },
    );
    await settle();
    const [titanium, silk] = screen.getAllByRole('button');
    const colours = (element: HTMLElement) => [...element.querySelectorAll<HTMLElement>('[dir="auto"]')].map((node) => node.style.color);
    const paint = (material: WalletMaterial) => materialPaint(material, dark);
    // The name and the amount in the material's text colour, ใช้ไป in its quiet text.
    expect(colours(titanium), mode).toEqual([paint('titanium').text, paint('titanium').quietText, paint('titanium').text].map(rgba));
    expect(colours(titanium)[0], mode).toBe(rgba(dark ? '#F4F2FA' : '#FFFFFF'));
    expect(colours(silk)[0], mode).toBe(rgba(dark ? '#F4F2FA' : '#111014'));
    expect([materialOf(titanium), materialOf(silk)], mode).toEqual([`wallet-material-titanium-${mode}`, `wallet-material-silk-${mode}`]);
    const edges = (element: HTMLElement) => [...element.querySelectorAll<HTMLElement>('div')].filter((node) => node.style.borderWidth !== '').map((node) => [node.style.borderWidth, node.style.borderColor]);
    expect(edges(titanium), mode).toEqual(dark ? [['1px', rgba('#5C5968')]] : []);
    expect(edges(silk), mode).toEqual([]);
    cleanup();

    // The spine is the wallet's text on the card colour, with the material on its 12 pt spine alone.
    mountWallet(<WalletCard wallet={CREDIT} look={CREDIT_LOOK} variant="spine" onPress={press} />, { mode });
    await settle();
    const spine = screen.getByRole('button');
    expect([spine.style.backgroundColor, materialOf(spine)], mode).toEqual([rgba(dark ? '#1A1920' : '#FFFFFF'), `wallet-material-titanium-${mode}`]);
    expect(colours(spine), mode).toEqual([dark ? '#F4F2FA' : '#111014', dark ? '#A9A6B6' : '#6B6878', dark ? '#F4F2FA' : '#111014'].map(rgba));
    const strip = spine.querySelector('linearGradient')?.closest<HTMLElement>('[aria-hidden="true"]')?.parentElement;
    expect([strip?.style.width, strip?.style.left], mode).toEqual(['12px', '10px']);
    cleanup();
  }
});

test('at AX5 a ฿999,999,999.99 balance and an 80-code-point Thai name wrap and never truncate', async () => {
  expect([...LONG_NAME]).toHaveLength(80);
  const wallet: WalletCardModel = { id: 'w-long', name: LONG_NAME, balanceMinor: '99999999999', pendingMinor: '99999999999', todayOutMinor: '99999999999' };
  for (const variant of ['spine', 'stack', 'full'] as const) {
    mountWallet(<WalletCard wallet={wallet} look={MAIN_LOOK} variant={variant} onPress={press} />, { fontScale: AX5 });
    await settle();
    // Every word and digit is drawn whole; only the spine has no face.
    expect(drawn(screen.getByRole('button')), variant).toEqual(expect.arrayContaining([LONG_NAME, '฿999,999,999.99', 'รวม ฿999,999,999.99 ที่กำลังบันทึก', `วันนี้ ${MINUS}฿999,999,999.99`]));
    expect(screen.getByRole('button').querySelectorAll('svg[viewBox="4 6 56 50"]'), variant).toHaveLength(variant === 'spine' ? 0 : 1);
    // No Text is clamped or shrunk to fit.
    for (const props of seen.props) {
      expect([props.numberOfLines, props.adjustsFontSizeToFit, props.ellipsizeMode], variant).toEqual([undefined, undefined, undefined]);
    }
    if (variant === 'spine') {
      // ax-large-home's sizes: the name 17 to 53, the amount 17 to 53 (never past 64), the lines 13 to 44.
      const scaleOf = (text: string) => seen.props.find((props) => props.children === text)?.maxFontSizeMultiplier;
      expect([scaleOf(LONG_NAME), scaleOf('฿999,999,999.99'), scaleOf('รวม ฿999,999,999.99 ที่กำลังบันทึก')]).toEqual([WALLET_TYPE.body.maxScale, amountMaxScale(17), WALLET_TYPE.caption.maxScale]);
    }
    cleanup();
    seen.props.length = 0;
  }
});

test('a card is at least 44 pt tall in every variant', async () => {
  for (const variant of ['stack', 'full', 'spine'] as const) {
    for (const onPress of [press, undefined]) {
      mountWallet(<WalletCard wallet={TRANSIT} look={TRANSIT_LOOK} variant={variant} onPress={onPress} />);
      await settle();
      const at = `${variant} ${onPress ? 'button' : 'card'}`;
      const element = card('บัตรเดินทาง, เหลือ 186 บาท');
      expect(element, at).not.toBeNull();
      expect(Number.parseFloat(element.style.minHeight), at).toBe(variant === 'spine' ? 44 : 200);
      cleanup();
    }
  }
});

const W1 = '00000000-0000-4000-8000-000000000001';
const W2 = '00000000-0000-4000-8000-000000000002';
const PEACH_CARD: WalletLook = { kind: 'credit_card', material: 'peach', face: 'wow' };

/** Wallet cards drawn with the looks the provider keeps. */
function KeptCards({ ids }: { ids: readonly string[] }) {
  const { lookOf } = useWalletLooks();
  return <>{ids.map((id) => <WalletCard key={id} wallet={{ id, name: id, balanceMinor: '-10000' }} look={lookOf(id)} variant="full" onPress={press} />)}</>;
}

/** Bun's features on a card: 3 dots for wow, 2 dots and 2 cheeks for smile. */
const faceOf = (element: HTMLElement) => element.querySelectorAll('svg[viewBox="4 6 56 50"] circle, svg[viewBox="4 6 56 50"] ellipse').length;

test("looks come from the open diary's account, and a look kept for another wallet is ignored", async () => {
  const account = { looks: JSON.stringify({ [W1]: PEACH_CARD }) };
  for (const mode of MODES) {
    mountWallet(<KeptCards ids={[W1, W2]} />, { account, mode });
    await settle();
    const [kept, other] = screen.getAllByRole('button');
    expect([materialOf(kept), drawn(kept), faceOf(kept)], mode).toEqual([`wallet-material-peach-${mode}`, [W1, 'ใช้ไป', '฿100', 'ยอดที่ใช้ไป'], 3]);
    // W2 has no kept look: the one derived from its id (sky, happy), and no kind.
    expect(derivedLook(W2)).toEqual({ kind: null, material: 'sky', face: 'happy' });
    expect([materialOf(other), drawn(other)], mode).toEqual([`wallet-material-sky-${mode}`, [W2, `${MINUS}฿100`]]);
    cleanup();
  }

  // Another account is open: what was kept for this one does not show.
  mountWallet(<KeptCards ids={[W1]} />, { account, diary: createFakeDiary({ accountId: '00000000-0000-4000-8000-0000000000bb' }).diary });
  await settle();
  expect(derivedLook(W1)).toEqual({ kind: null, material: 'titanium', face: 'smile' });
  expect([materialOf(screen.getByRole('button')), drawn(screen.getByRole('button')), faceOf(screen.getByRole('button'))]).toEqual(['wallet-material-titanium-light', [W1, `${MINUS}฿100`], 4]);
});

test('with no diary open the derived look shows and setLook stores nothing', async () => {
  let keep: (() => Promise<void>) | null = null;
  function Setter() {
    const { lookOf, setLook, setOrder } = useWalletLooks();
    keep = async () => {
      await setLook(W1, PEACH_CARD);
      await setOrder([W2, W1]);
    };
    return <WalletCard wallet={{ id: W1, name: 'บัญชีบนเว็บ', balanceMinor: '100' }} look={lookOf(W1)} variant="full" onPress={press} />;
  }
  const { stored } = mountWallet(<Setter />, { diary: null });
  await settle();
  await act(async () => { await keep?.(); });
  expect([...stored.keys()]).toEqual([]);
  expect([materialOf(screen.getByRole('button')), drawn(screen.getByRole('button'))]).toEqual(['wallet-material-titanium-light', ['บัญชีบนเว็บ', '฿1']]);
});
