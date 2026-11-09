// The wallet test harness (P2-T8). Every Bun Wallet render test mounts
// through mountWallet: the app's providers, nested as the app nests them
// (R58), around fakes, in Thai or English, light or dark, at any text size,
// with the phone's reduced-motion answer given or held, and the wallet's two
// stores in memory. The catalogue lists the Bun Wallet's sections last.
import { act, cleanup, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { AccessibilityInfo, Text, useWindowDimensions } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { useLanguage } from '@mobile/i18n/LanguageProvider';
import { useActiveLocale } from '@mobile/i18n/useCopy';
import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { useReducedMotionKnown, useWalletReducedMotion } from '../motion/reducedMotion';
import { eraseDeviceSettings, walletAccountStore, walletDeviceStore } from '../store/deviceWalletStore';
import { AX5, mountWallet, TEST_ACCOUNT_ID } from './walletHarness';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Lets the phone's answer and Bun's AI preferences arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

/** A provider's value, or null when it is missing: a missing provider then fails an assertion, not the render. */
function orNull<T>(read: () => T): T | null {
  try {
    return read();
  } catch {
    return null;
  }
}

type Seen = {
  v1: unknown; diary: unknown; accountId: string | null; ai: unknown; language: boolean;
  locale: string | null; dark: boolean | null; fontScale: number; reduced: boolean; known: boolean;
};
let seen: Seen | null = null;

/** Reads every provider the harness mounts. */
function Probe() {
  const v1 = orNull(useSpendV1);
  const language = orNull(useLanguage) !== null;
  const locale = orNull(useActiveLocale);
  const colors = orNull(useWalletColors);
  const diary = useSpendDiary();
  const { accountId } = useDiaryView();
  const { resources: ai } = useAiCompanion();
  const { fontScale } = useWindowDimensions();
  const reduced = useWalletReducedMotion();
  const known = useReducedMotionKnown();
  seen = { v1, diary, accountId, ai, language, locale, dark: colors?.isDark ?? null, fontScale, reduced, known };
  return <Text testID="probe">{`reduced=${reduced} known=${known}`}</Text>;
}

const shown = () => screen.getByTestId('probe').textContent;

const ONCE = "answerReducedMotion gives a reducedMotion: 'pending' mount its answer, once.";

test('the harness nests the providers as the app does', async () => {
  const errors = vi.spyOn(console, 'error');
  const { stored } = mountWallet(<Probe />, { device: { 'private-mode': '1' } });
  await settle();
  expect(seen?.accountId).toBe(TEST_ACCOUNT_ID);
  expect(seen?.ai).not.toBeNull();
  expect(seen?.v1).not.toBeNull();
  expect(seen?.language).toBe(true);
  expect(shown()).toBe('reduced=false known=true');
  expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
  expect(await walletDeviceStore().get('private-mode')).toBe('1');
  await walletDeviceStore().set('private-tip-seen', '1');
  expect(stored.get('jotbun.wallet.private-tip-seen')).toBe('1');
  expect(errors).not.toHaveBeenCalled();
});

test("reducedMotion: 'pending' reads as reduced until answerReducedMotion(false)", async () => {
  const { answerReducedMotion } = mountWallet(<Probe />, { reducedMotion: 'pending' });
  await settle();
  expect(shown()).toBe('reduced=true known=false');
  await act(async () => { answerReducedMotion(false); });
  expect(shown()).toBe('reduced=false known=true');
  expect(() => answerReducedMotion(true)).toThrow(ONCE);
});

test('the harness mounts what it is given: the language, the mode, the text size, the answer and its own fakes', async () => {
  mountWallet(<Probe />);
  await settle();
  expect(seen).toMatchObject({ locale: 'th', dark: false, fontScale: 1 });
  cleanup();

  const fake = createFakeResources();
  const diary = createFakeDiary({ accountId: '00000000-0000-4000-8000-0000000000bb' }).diary;
  const ai = fakeAiResources().resources;
  const given = mountWallet(<Probe />, { locale: 'en', mode: 'dark', fontScale: AX5, reducedMotion: true, resources: fake.resources, diary, ai });
  await settle();
  expect(seen).toMatchObject({ locale: 'en', dark: true, fontScale: 3.571, reduced: true, known: true, accountId: '00000000-0000-4000-8000-0000000000bb' });
  expect(seen?.v1).toBe(fake.resources);
  expect(seen?.diary).toBe(diary);
  expect(seen?.ai).toBe(ai);
  expect(() => given.answerReducedMotion(false)).toThrow(ONCE);
  cleanup();

  mountWallet(<Probe />, { diary: null });
  await settle();
  expect(seen).toMatchObject({ diary: null, accountId: null });
});

test("the wallet's two stores live in memory: seeds by scope, every change in stored, and the sign-out erase keeps the account's", async () => {
  const { stored } = mountWallet(<Text>stores</Text>, { device: { lock: 'on' }, account: { looks: '{}' } });
  await settle();
  const looks = 'jotbun.account.00000000-0000-4000-8000-0000000000aa.looks';
  expect([...stored]).toEqual([['jotbun.wallet.lock', 'on'], [looks, '{}']]);
  expect(await walletAccountStore(TEST_ACCOUNT_ID).get('looks')).toBe('{}');
  await walletDeviceStore().remove('lock');
  await walletDeviceStore().set('private-mode', '1');
  expect([...stored.keys()]).toEqual([looks, 'jotbun.wallet.private-mode']);
  await eraseDeviceSettings();
  expect([...stored.keys()]).toEqual([looks]);
});

/** A wallet animation's rule (W6): it reads the answer once, at mount. */
function DecidesAtMount() {
  const reduced = useWalletReducedMotion();
  const [atMount] = useState(reduced);
  return <Text testID="at-mount">{`reduced at mount=${atMount}`}</Text>;
}

test('a part mounted after the answer reads it at mount, since rerender keeps the providers', async () => {
  const view = mountWallet(<Text>before</Text>);
  await settle();
  view.rerender(<DecidesAtMount />);
  expect(screen.getByTestId('at-mount').textContent).toBe('reduced at mount=false');
  expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
});

test("the catalogue lists the Bun Wallet's sections last, each with a bw- id and a 'Bun Wallet: ' title (R72)", () => {
  const registry = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../dev/catalogue/registry.tsx'), 'utf8');
  expect(registry).toContain("import { WALLET_SECTIONS as BUN_WALLET_SECTIONS } from './wallet';");
  // Whatever lists other areas add, the Bun Wallet's stay last (plan P2, P2-T8).
  expect(registry.slice(registry.indexOf('export const CATALOGUE_SECTIONS'))).toMatch(/\.\.\.BUN_WALLET_SECTIONS,\s*\];/);
  for (const section of WALLET_SECTIONS) {
    expect(section.id).toMatch(/^bw(-[a-z0-9]+)+$/);
    expect(section.title.startsWith('Bun Wallet: '), section.title).toBe(true);
  }
});
