// WalletAmount (P2-T10, §5.1, W9, W10, W30): DM Sans 700 in every language;
// income violet with a plus, an expense in a list with no sign; a tone or the
// material's colour; the label, then the amount in words; never clamped to a
// line and never past 64 pt; and in private mode ฿•••• at the amount's own
// size and line, saying only that it is hidden (Review Focus 2).
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

// react-native-web drops maxFontSizeMultiplier from the DOM, so the test records
// the props that reach the app's Text and still renders the real one, as
// WalletText.render.test.tsx does.
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
import { LATIN_UI_FONT_FAMILY } from '@mobile/theme/uiFontFamily';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { amountMaxScale } from '@mobile/theme/walletType';
import { AX5, mountWallet } from '../testing/walletHarness';
import { WalletAmount } from './WalletAmount';
import type { WalletAmountSize } from './WalletAmount';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  seen.props.length = 0;
});

/** Lets the private-mode setting, the phone's answer and Bun's AI preferences arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const MODES = [['light', walletLight], ['dark', walletDark]] as const;
const LOCALES = ['th', 'en'] as const;
const SIZES: readonly WalletAmountSize[] = [58, 44, 36, 34, 28, 22, 17, 16, 13];
const MINUS = '\u2212';
const HIDDEN = '฿\u2022\u2022\u2022\u2022';
const node = (testID: string) => screen.getByTestId(testID);

test('income is violet with a plus, an expense in a list has no sign', async () => {
  for (const locale of LOCALES) {
    for (const [mode, colors] of MODES) {
      mountWallet(
        <>
          <WalletAmount minor="3500000" sign="income" size={17} testID="income" />
          <WalletAmount minor="5000" size={17} testID="row" />
          <WalletAmount minor="5000" sign="expense" size={17} testID="expense" />
        </>,
        { locale, mode },
      );
      await settle();
      const at = `${locale} ${mode}`;
      expect([node('income').textContent, node('income').style.color], at).toEqual(['+฿35,000', rgba(colors.violet)]);
      expect([node('row').textContent, node('row').style.color], at).toEqual(['฿50', rgba(colors.ink)]);
      expect([node('expense').textContent, node('expense').style.color], at).toEqual([`${MINUS}฿50`, rgba(colors.ink)]);
      for (const id of ['income', 'row', 'expense']) {
        expect([node(id).style.fontFamily, node(id).style.fontWeight], `${at} ${id}`).toEqual([LATIN_UI_FONT_FAMILY, '700']);
      }
      cleanup();
    }
  }
});

test('a tone or the colour of a material decides the colour; the label comes first, then the amount in words', async () => {
  mountWallet(
    <>
      <WalletAmount minor="42000" size={17} tone="over" testID="over" />
      <WalletAmount minor="69000" size={17} tone="quiet" testID="quiet" />
      <WalletAmount minor="3500000" sign="income" size={17} color={walletLight.onPrimary} testID="on-material" />
      <WalletAmount minor="1248000" size={28} label="ใช้ไปเดือนนี้" testID="labelled" />
      <WalletAmount minor="-392000" sign="balance" size={17} testID="below" />
      <WalletAmount minor="-392000" size={17} testID="size-only" />
      <WalletAmount minor="5000" sign="expense" exact size={17} testID="expense" />
    </>,
  );
  await settle();
  expect(node('over').style.color).toBe(rgba(walletLight.over));
  expect(node('quiet').style.color).toBe(rgba(walletLight.quiet));
  expect(node('on-material').style.color).toBe(rgba(walletLight.onPrimary));
  expect(node('labelled').getAttribute('aria-label')).toBe('ใช้ไปเดือนนี้ 12,480 บาท');
  // Only a balance says it is below zero; any other sign says the amount's size.
  expect([node('below').textContent, node('below').getAttribute('aria-label')]).toEqual([`${MINUS}฿3,920`, 'ติดลบ 3,920 บาท']);
  expect([node('size-only').textContent, node('size-only').getAttribute('aria-label')]).toEqual(['฿3,920', '3,920 บาท']);
  expect([node('expense').textContent, node('expense').getAttribute('aria-label')]).toEqual([`${MINUS}฿50.00`, '50 บาท']);
  cleanup();

  mountWallet(<WalletAmount minor="1248000" size={28} label="Spent this month" testID="labelled" />, { locale: 'en' });
  await settle();
  expect(node('labelled').getAttribute('aria-label')).toBe('Spent this month 12,480 baht');
});

test('private mode draws ฿•••• and says the amount is hidden, with no digit anywhere', async () => {
  for (const locale of LOCALES) {
    for (const [mode, colors] of MODES) {
      const { container } = mountWallet(
        <>
          <WalletAmount minor="1248000" size={28} label="ใช้ไปเดือนนี้" testID="month" />
          <WalletAmount minor="3500000" sign="income" size={17} testID="income" />
          <WalletAmount minor="-392000" sign="balance" exact size={13} testID="below" />
        </>,
        { device: { 'private-mode': '1' }, locale, mode },
      );
      await settle();
      const at = `${locale} ${mode}`;
      const word = locale === 'th' ? 'ซ่อนยอดเงินอยู่' : 'Amount hidden';
      expect(['month', 'income', 'below'].map((id) => node(id).textContent), at).toEqual([HIDDEN, HIDDEN, HIDDEN]);
      expect(node('month').getAttribute('aria-label'), at).toBe(`ใช้ไปเดือนนี้ ${word}`);
      expect(['income', 'below'].map((id) => node(id).getAttribute('aria-label')), at).toEqual([word, word]);
      // The mask keeps the amount's colour: an income is still violet.
      expect(node('income').style.color, at).toBe(rgba(colors.violet));
      expect(container.textContent, at).not.toMatch(/\d/);
      for (const labelled of container.querySelectorAll('[aria-label]')) {
        expect(labelled.getAttribute('aria-label'), at).not.toMatch(/\d/);
      }
      cleanup();
    }
  }
});

test("a hidden amount keeps the amount's size and line, so rows never change height", async () => {
  for (const size of [58, 28, 17, 13] as const) {
    mountWallet(<WalletAmount minor="1248000" size={size} testID="shown" />);
    await settle();
    const shown = node('shown').style;
    // −0.02 em at 28 pt and above, none below.
    const spacing = size >= 28 ? `${(size * -2) / 100}px` : '';
    expect([shown.fontSize, shown.lineHeight, shown.letterSpacing], `shown ${size}`).toEqual([`${size}px`, `${Math.ceil(size * 1.3)}px`, spacing]);
    cleanup();

    mountWallet(<WalletAmount minor="1248000" size={size} testID="hidden" />, { device: { 'private-mode': '1' } });
    await settle();
    const hidden = node('hidden').style;
    // The same size and line; the dots are spaced 0.12 em, as bw-private draws them.
    expect([hidden.fontSize, hidden.lineHeight, hidden.letterSpacing], `hidden ${size}`).toEqual([shown.fontSize, shown.lineHeight, `${(size * 12) / 100}px`]);
    cleanup();
  }
});

test('an amount is never clamped to a line, and grows to 64 pt at most and never more than body text', async () => {
  mountWallet(<>{SIZES.map((size) => <WalletAmount key={size} minor="99999999999" size={size} />)}</>, { fontScale: AX5 });
  await settle();
  expect(screen.queryAllByText('฿999,999,999.99')).toHaveLength(SIZES.length);
  const drawn = new Map(seen.props.map((props) => [(props.style as { fontSize?: number } | undefined)?.fontSize, props]));
  for (const size of SIZES) {
    const props = drawn.get(size);
    expect(props?.maxFontSizeMultiplier, `${size}`).toBe(amountMaxScale(size));
    expect([props?.numberOfLines, props?.adjustsFontSizeToFit, props?.ellipsizeMode], `${size}`).toEqual([undefined, undefined, undefined]);
  }
});
