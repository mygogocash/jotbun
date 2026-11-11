// The add tray's amount step (P2-T14; W14, W29; bw-tray-amount, rh-income,
// ax-large-tray; Review Focus 3; the fix round's R106). Most cases mount the
// step as P2-T16's host and the catalogue do: inside a Tray, with the type
// switch as its header (at the largest text sizes, given to the step, which
// draws it under the amount: useSwitchInHeader) and AmountFooter (the keys and
// Next) as its footer. A probe holds the draft, the keypad and whether the
// name field has focus, fills the amount from a chip as a fill (filledKeypad),
// and gives the step the keypad's problem in today's words (amountProblem,
// then KEYPAD_PROBLEM_TEXT through tc), as the host will. Each case mounts
// through mountWallet, in Thai and by day unless it says otherwise.
//
// The tray behaviours these cases rely on (P2-T13's Tray, not changed here):
// `header` is drawn in the header row in the title's place, and with no
// header the row draws the title; `footer` is pinned under the scrolling
// content; the title names the dialog.
//
// Reanimated keeps the tray's card unseen (visibility: hidden) until its
// entering animation starts, which happy-dom never fires, and queries by role
// skip what is unseen: startAnimations() fires it, as Tray.render.test.tsx
// does. react-native-web drops maxFontSizeMultiplier and numberOfLines from
// the DOM, so the props that reach the app's Text and TextInput are recorded,
// as WalletCard.render.test.tsx does. react-native-web has no keyboard, so the
// case for Android's back reads the step's keyboard listener and calls it.
// Each haptic moment is recorded by name.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { Keyboard } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

const seen = vi.hoisted(() => ({ props: [] as Record<string, unknown>[], inputs: [] as Record<string, unknown>[] }));
vi.mock('@mobile/theme/AppText', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mobile/theme/AppText')>();
  const { createElement, forwardRef } = await import('react');
  const Text = forwardRef<unknown, Record<string, unknown>>(function RecordedText(props, ref) {
    seen.props.push(props);
    return createElement(actual.Text as never, { ...props, ref });
  });
  const TextInput = forwardRef<unknown, Record<string, unknown>>(function RecordedTextInput(props, ref) {
    seen.inputs.push(props);
    return createElement(actual.TextInput as never, { ...props, ref });
  });
  return { ...actual, Text, TextInput };
});

vi.mock('@mobile/lib/hapticMoment', () => ({ playHaptic: vi.fn() }));
// Today's keypad words live beside Quick add's helpers, which load the device's id maker (as the catalogue suites mock it).
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));

import type { Minor } from '@gogospend/contracts';

import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { KEYPAD_PROBLEM_TEXT } from '@mobile/screens/redesign/entry/entryHelpers';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';
import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { amountMaxScale, WALLET_TYPE } from '@mobile/theme/walletType';
import { EMPTY_KEYPAD, keypadFromMinor } from '@mobile/ui/keypadExpression';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { useDraftCopy } from '../copy/useDraftCopy';
import { derivedLook } from '../looks/walletLooks';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { AX5, mountWallet } from '../testing/walletHarness';
import { Tray } from '../tray/Tray';
import { amountProblem, filledKeypad, trayTitleKey } from './addFlow';
import type { AddStep, StepProps } from './addFlow';
import { AmountFooter, AmountStep, useCanTellBun } from './AmountStep';
import { COPY } from './copy';
import { QuickChips } from './QuickChips';
import type { QuickChip } from './QuickChips';
import { TypeSwitchHeader, useSwitchInHeader } from './TypeSwitchHeader';
import { WalletKeypad } from './WalletKeypad';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  seen.props.length = 0;
  seen.inputs.length = 0;
});

/** Lets the stores, the phone's answer and Bun's AI preferences arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
/** Lets time pass, such as a tray's exit. */
const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

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

const amount = () => found('add-amount');
const press = (...names: string[]) => { for (const name of names) fireEvent.click(named('button', name)); };
const moments = () => vi.mocked(playHaptic).mock.calls.map(([moment]) => moment);
/** The step's parts with a test id, in the order a screen reader meets them. */
const PARTS = ['type-switch', 'add-amount', 'add-problem', 'add-wallet', 'add-name', 'add-tell-bun', 'quick-chips', 'wallet-keypad', 'add-next'];
const partsInOrder = (within: HTMLElement = document.body) => [...within.querySelectorAll('[data-testid]')]
  .map((element) => element.getAttribute('data-testid') ?? '')
  .filter((id) => PARTS.includes(id));

const LOCALES = ['th', 'en'] as const;
const MODES = [['light', walletLight], ['dark', walletDark]] as const;
const WORDS = {
  th: {
    next: 'ถัดไป', spending: 'จดรายจ่าย', incomeTitle: 'จดรายรับ', moving: 'โอนเงิน', group: 'ประเภทรายการ', expense: 'รายจ่าย', income: 'รายรับ', transfer: 'โอน',
    from: 'จากบัญชีหลัก', into: 'เข้าบัญชีหลัก', choose: 'เลือกกระเป๋า', name: 'ชื่อรายการ', notInBudget: 'ไม่นับในงบ', tellBun: 'บอกบัน', delete: 'ลบตัวเลข',
    zero: 'กรอกจำนวนเงินที่มากกว่าศูนย์', cap: 'จำนวนเงินสูงสุด ฿999,999,999.99', baht: (amount: string) => `${amount} บาท`, hidden: 'ซ่อนยอดเงินอยู่',
  },
  en: {
    next: 'Next', spending: 'Add spending', incomeTitle: 'Add income', moving: 'Move money', group: 'Entry type', expense: 'Spending', income: 'Income', transfer: 'Move',
    from: 'From บัญชีหลัก', into: 'Into บัญชีหลัก', choose: 'Choose a wallet', name: 'Name', notInBudget: 'Not counted in the budget', tellBun: 'Tell Bun', delete: 'Delete a digit',
    zero: 'Enter an amount above zero', cap: 'Amounts go up to ฿999,999,999.99', baht: (amount: string) => `${amount} baht`, hidden: 'Amount hidden',
  },
} as const;

/** 80 code points of Thai (Review Focus 3). */
const LONG_NAME = 'บัญชีออมทรัพย์สำหรับค่าเทอมลูกและค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดปีนะ';

const LOOKUPS: Lookups = {
  wallets: new Map([['w-main', { id: 'w-main', name: 'บัญชีหลัก' }], ['w-long', { id: 'w-long', name: LONG_NAME }]]),
  categories: new Map(),
};

const DRAFT: QuickAddDraft = {
  mode: 'create', recordId: 'r-1', commandId: 'k-1', type: 'expense', amountMinor: '', occurredOn: '2026-10-24', walletId: 'w-main',
  categoryByType: { expense: null, income: null }, fromWalletId: 'w-main', toWalletId: null, note: '', merchant: '',
};

/** Four of what this person often logs; the step shows three. */
const chipsOf = (apply: () => void = () => undefined): QuickChip[] => [
  { label: 'กาแฟเย็น', amountMinor: '6500', apply },
  { label: 'วิน', amountMinor: '2000', apply },
  { label: 'BTS', amountMinor: '4700', apply },
  { label: 'ข้าวมันไก่', amountMinor: '5000', apply },
];

/** The host's part: the draft, the keypad, the name field's focus and the problem in today's words, around the step in a tray. */
function Probe({ minor, walletId = 'w-main', chips = [], canTellBun, locked = false, onStep = () => undefined, onTellBun = () => undefined }: {
  minor?: Minor;
  walletId?: string | null;
  chips?: readonly QuickChip[];
  /** Left out, the step offers บอกบัน as the host will: useCanTellBun(). */
  canTellBun?: boolean;
  /** A save in flight (P2-T16): the tray and its switch are locked. */
  locked?: boolean;
  onStep?: (step: AddStep) => void;
  onTellBun?: () => void;
}) {
  const tc = useCopy();
  const t = useDraftCopy(COPY);
  const offered = useCanTellBun();
  const inHeader = useSwitchInHeader();
  const [draft, setDraft] = useState<QuickAddDraft>(() => ({ ...DRAFT, walletId }));
  const [keypad, setKeypad] = useState<KeypadState>(() => (minor === undefined ? EMPTY_KEYPAD : keypadFromMinor(minor)));
  const [naming, setNaming] = useState(false);
  const problem = amountProblem(keypad);
  const step: StepProps = { draft, keypad, onDraft: setDraft, onKeypad: setKeypad, onStep };
  // A chip fills the amount as P2-T16's will: as a fill, which the person did not type (R106).
  const filling = chips.map((chip) => ({ ...chip, apply: () => { chip.apply(); setKeypad(filledKeypad(chip.amountMinor)); } }));
  const typeSwitch = <TypeSwitchHeader type={draft.type} onType={(type) => setDraft((now) => ({ ...now, type }))} disabled={locked} />;
  return (
    <Tray
      visible
      onClose={() => undefined}
      locked={locked}
      title={t(trayTitleKey(draft.type))}
      header={inHeader ? typeSwitch : undefined}
      footer={<AmountFooter {...step} type={draft.type} naming={naming} />}
    >
      <AmountStep
        {...step}
        type={draft.type}
        lookups={LOOKUPS}
        chips={filling}
        canTellBun={canTellBun ?? offered}
        onTellBun={onTellBun}
        problem={problem === null ? null : tc(KEYPAD_PROBLEM_TEXT[problem])}
        typeSwitch={inHeader ? null : typeSwitch}
        onNaming={setNaming}
      />
    </Tray>
  );
}

test('typing 5 and 0 shows ฿50 and enables Next', async () => {
  for (const locale of LOCALES) {
    for (const [mode, colors] of MODES) {
      const at = `${locale} ${mode}`;
      const words = WORDS[locale];
      const onStep = vi.fn();
      mountWallet(<Probe onStep={onStep} />, { locale, mode });
      await settle();
      startAnimations();
      // Nothing typed: ฿0, and Next waits without a word (nothing nags).
      expect([amount().textContent, amount().getAttribute('aria-label')], at).toEqual(['฿0', words.baht('0')]);
      expect(named('button', words.next).getAttribute('aria-disabled'), at).toBe('true');
      expect(screen.queryByTestId('add-problem'), at).toBeNull();
      fireEvent.click(named('button', words.next));
      expect(onStep, at).not.toHaveBeenCalled();
      press('5', '0');
      // The boards' amount: DM Sans 700 at 58 pt in ink, centred, and said in baht, in a polite live region.
      expect([amount().textContent, amount().getAttribute('aria-label')], at).toEqual(['฿50', words.baht('50')]);
      expect([amount().style.fontSize, amount().style.fontWeight, amount().style.color, amount().style.textAlign], at).toEqual(['58px', '700', rgba(colors.ink), 'center']);
      expect([amount().parentElement?.getAttribute('role'), amount().parentElement?.getAttribute('aria-live')], at).toEqual(['status', 'polite']);
      // The wallet chip draws the wallet's own material.
      expect(found('add-wallet').querySelector('linearGradient')?.getAttribute('id'), at).toBe(`wallet-material-${derivedLook('w-main').material}-${mode}`);
      expect(named('button', words.next).getAttribute('aria-disabled'), at).toBeNull();
      fireEvent.click(named('button', words.next));
      expect(onStep.mock.calls, at).toEqual([['confirm']]);
      expect(moments(), at).toEqual(['keyTap', 'keyTap']);
      cleanup();
      vi.clearAllMocks();
    }
  }
});

test("the keypad's problem shows right under the amount in today's words, and Next waits for an amount it can save", async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    mountWallet(<Probe />, { locale });
    await settle();
    startAnimations();
    press('0');
    const problem = found('add-problem');
    // A polite alert: the web reads it without cutting in (iOS hears it from useAnnouncement, pinned in amountStepNative.test.ts).
    expect([problem.textContent, problem.getAttribute('role'), problem.getAttribute('aria-live')], locale).toEqual([words.zero, 'alert', 'polite']);
    // In the scrolling middle at every size, right under the amount and over the wallet chip; the footer is the keys and Next.
    expect([problem.previousElementSibling, problem.nextElementSibling], locale).toEqual([amount().parentElement, found('add-wallet')]);
    expect(partsInOrder(found('tray-footer')), locale).toEqual(['wallet-keypad', 'add-next']);
    expect(named('button', words.next).getAttribute('aria-disabled'), locale).toBe('true');
    press(words.delete);
    expect(screen.queryByTestId('add-problem'), locale).toBeNull();
    // A tenth 9 would pass ฿999,999,999.99: refused, the amount stays and says why, and Next still takes it.
    press(...Array<string>(10).fill('9'));
    expect([amount().textContent, found('add-problem').textContent], locale).toEqual(['฿999,999,999', words.cap]);
    expect(named('button', words.next).getAttribute('aria-disabled'), locale).toBeNull();
    press(words.delete);
    expect([amount().textContent, screen.queryByTestId('add-problem')], locale).toEqual(['฿99,999,999', null]);
    cleanup();
  }
});

test('income asks เข้า{wallet} and ชื่อรายการ, and says it is not counted in the budget', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    const onStep = vi.fn();
    mountWallet(<Probe onStep={onStep} canTellBun />, { locale });
    await settle();
    startAnimations();
    // Spending says the wallet it comes from, and has no name field or budget note.
    expect(screen.queryByRole('dialog', { name: words.spending }), locale).not.toBeNull();
    named('button', words.from);
    expect([screen.queryByRole('textbox'), screen.queryByText(words.notInBudget)], locale).toEqual([null, null]);
    press('5');
    fireEvent.click(named('radio', words.income));
    expect(screen.queryByRole('dialog', { name: words.incomeTitle }), locale).not.toBeNull();
    expect(screen.queryByRole('button', { name: words.from }), locale).toBeNull();
    // The amount being typed is ink with no sign, for income too (it is not an income row).
    expect([amount().textContent, amount().style.color], locale).toEqual(['฿5', rgba(walletLight.ink)]);
    const field = named('textbox', words.name);
    expect(field.getAttribute('maxlength'), locale).toBe('120');
    fireEvent.change(field, { target: { value: 'เงินเดือน' } });
    expect((named('textbox', words.name) as HTMLInputElement).value, locale).toBe('เงินเดือน');
    expect(screen.queryByText(words.notInBudget), locale).not.toBeNull();
    // The name grows with the text no more than body text (W30); its caption is for the eye, as the field says its own name.
    expect(seen.inputs.filter((props) => props.accessibilityLabel === words.name).map((props) => props.maxFontSizeMultiplier).at(-1), locale).toBe(WALLET_TYPE.body.maxScale);
    expect(within(found('add-name')).getByText(words.name).getAttribute('aria-hidden'), locale).toBe('true');
    // The name comes right under the wallet chip, as rh-income draws it, before Tell Bun.
    expect(partsInOrder(), locale).toEqual(['type-switch', 'add-amount', 'add-wallet', 'add-name', 'add-tell-bun', 'wallet-keypad', 'add-next']);
    // The wallet chip opens the wallet step.
    fireEvent.click(named('button', words.into));
    expect(onStep.mock.calls, locale).toEqual([['wallet']]);
    cleanup();
    // A wallet not chosen, or no longer listed (a copied record's closed wallet), asks for one, with no material.
    for (const walletId of [null, 'w-gone']) {
      mountWallet(<Probe walletId={walletId} />, { locale });
      await settle();
      startAnimations();
      expect([named('button', words.choose).querySelector('linearGradient')], `${locale} ${walletId}`).toEqual([null]);
      cleanup();
    }
  }
});

test("a transfer's amount stands alone, and its Next goes on to choose the two wallets", async () => {
  const onStep = vi.fn();
  mountWallet(<Probe onStep={onStep} canTellBun chips={chipsOf()} />);
  await settle();
  startAnimations();
  expect(screen.queryByTestId('quick-chips')).not.toBeNull();
  fireEvent.click(named('radio', 'โอน'));
  expect(screen.queryByRole('dialog', { name: 'โอนเงิน' })).not.toBeNull();
  // No wallet chip, no Tell Bun, no name and no quick chips: an often-logged amount is never a transfer's.
  expect([screen.queryByTestId('add-wallet'), screen.queryByTestId('add-tell-bun'), screen.queryByRole('textbox'), screen.queryByTestId('quick-chips')]).toEqual([null, null, null, null]);
  press('5');
  fireEvent.click(named('button', 'ถัดไป'));
  expect(onStep.mock.calls).toEqual([['transfer']]);
});

test('บอกบัน shows only when Bun is on in the companion area', async () => {
  const bunOn = () => fakeAiResources({}, { companion: true }).resources;
  const onTellBun = vi.fn();
  mountWallet(<Probe onTellBun={onTellBun} />, { ai: bunOn() });
  await settle();
  startAnimations();
  fireEvent.click(named('button', 'บอกบัน'));
  expect(onTellBun).toHaveBeenCalledTimes(1);
  // For income too, as Quick add offers it; never for a transfer.
  fireEvent.click(named('radio', 'รายรับ'));
  expect(screen.queryByRole('button', { name: 'บอกบัน' })).not.toBeNull();
  fireEvent.click(named('radio', 'โอน'));
  expect(screen.queryByRole('button', { name: 'บอกบัน' })).toBeNull();
  cleanup();
  // Bun's AI help off (the fakes' own setting): no row.
  mountWallet(<Probe />);
  await settle();
  startAnimations();
  expect(screen.queryByRole('button', { name: 'บอกบัน' })).toBeNull();
  cleanup();
  // The companion area switched off: no row, even with Bun's help on.
  vi.stubEnv('EXPO_PUBLIC_REDESIGN', '-companion');
  mountWallet(<Probe />, { ai: bunOn() });
  await settle();
  startAnimations();
  expect(screen.queryByRole('button', { name: 'บอกบัน' })).toBeNull();
});

test('at AX5 the chips are full-width rows and ฿999,999,999.99 never truncates', async () => {
  expect([...LONG_NAME]).toHaveLength(80);
  mountWallet(<Probe minor="99999999999" walletId="w-long" chips={chipsOf()} canTellBun />, { fontScale: AX5 });
  await settle();
  startAnimations();
  // Every digit and the whole name are drawn, and no Text is clamped or shrunk to fit.
  expect(amount().textContent).toBe('฿999,999,999.99');
  expect(named('button', `จาก${LONG_NAME}`).textContent).toContain(LONG_NAME);
  expect(seen.props.length).toBeGreaterThan(0);
  for (const props of seen.props) expect([props.numberOfLines, props.adjustsFontSizeToFit, props.ellipsizeMode]).toEqual([undefined, undefined, undefined]);
  // The amount grows with the text to 64 pt and no more (W30); the digits stop at 34 pt (ax-large-tray).
  const scaleOf = (text: string) => seen.props.find((props) => props.children === text)?.maxFontSizeMultiplier;
  expect([scaleOf('฿999,999,999.99'), scaleOf('5'), scaleOf('000')]).toEqual([amountMaxScale(58), 34 / 24, 34 / 24]);
  expect(58 * amountMaxScale(58)).toBeCloseTo(64);
  // The chips are a list of full-width rows of at least 64 pt, and the wallet chip is a full-width row.
  const list = found('quick-chips');
  expect(list.style.flexDirection).toBe('column');
  expect(within(list).queryAllByRole('button').map((chip) => [chip.style.minHeight, chip.style.borderRadius])).toEqual(Array(3).fill(['64px', '']));
  expect([found('add-wallet').style.alignSelf, found('add-wallet').style.minHeight]).toEqual(['stretch', '64px']);
  // Keys are 56 pt on raised (ax-large-tray), and the type switch stacks.
  expect(within(found('wallet-keypad')).queryAllByRole('button').map((key) => [key.style.minHeight, key.style.backgroundColor])).toEqual(Array(12).fill(['56px', rgba(walletLight.raised)]));
  expect(found('type-switch').style.flexDirection).toBe('column');
  cleanup();
  // At the default text size: a row of 44 pt pills, keys 46 pt on nothing, the switch in a row, the wallet chip centred.
  mountWallet(<Probe chips={chipsOf()} canTellBun />);
  await settle();
  startAnimations();
  expect(found('quick-chips').style.flexDirection).toBe('row');
  expect(within(found('quick-chips')).queryAllByRole('button').map((chip) => [chip.style.minHeight, chip.style.borderRadius])).toEqual(Array(3).fill(['44px', '22px']));
  expect(within(found('wallet-keypad')).queryAllByRole('button').map((key) => key.style.minHeight)).toEqual(Array(12).fill('46px'));
  expect(within(found('wallet-keypad')).queryAllByRole('button').map((key) => key.style.backgroundColor)).not.toContain(rgba(walletLight.raised));
  expect([found('type-switch').style.flexDirection, found('add-wallet').style.alignSelf, found('add-wallet').style.minHeight]).toEqual(['row', 'center', '44px']);
});

test('the pinned parts leave the middle room: at AX5 the header is the title and the switch sits under the amount and its problem; the footer is the keys and Next', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    mountWallet(<Probe minor="0" chips={chipsOf()} canTellBun />, { locale, fontScale: AX5 });
    await settle();
    startAnimations();
    // The pinned header is the tray's one-line title (ax-large-tray), drawn, with close; the switch is not there.
    const header = found('tray-header');
    expect([within(header).queryByText(words.spending) !== null, within(header).queryByTestId('type-switch')], locale).toEqual([true, null]);
    expect(screen.queryAllByTestId('type-switch'), locale).toHaveLength(1);
    // In the scrolling middle: the amount, its problem, then the switch, then the rest; the footer is the keys and Next.
    expect(partsInOrder(), locale).toEqual(['add-amount', 'add-problem', 'type-switch', 'add-wallet', 'add-tell-bun', 'quick-chips', 'wallet-keypad', 'add-next']);
    expect(partsInOrder(found('tray-footer')), locale).toEqual(['wallet-keypad', 'add-next']);
    // The switch still works from there.
    fireEvent.click(named('radio', words.income));
    expect(screen.queryByRole('dialog', { name: words.incomeTitle }), locale).not.toBeNull();
    cleanup();
    // At the default size the switch is the header, in the title's place.
    mountWallet(<Probe minor="0" chips={chipsOf()} canTellBun />, { locale });
    await settle();
    startAnimations();
    expect([within(found('tray-header')).queryByText(words.spending), within(found('tray-header')).queryByTestId('type-switch') !== null], locale).toEqual([null, true]);
    expect(partsInOrder(), locale).toEqual(['type-switch', 'add-amount', 'add-problem', 'add-wallet', 'add-tell-bun', 'quick-chips', 'wallet-keypad', 'add-next']);
    cleanup();
  }
});

test("while income's name field has focus the footer is Next alone, and the keys come back when it lets go, when the keyboard hides and when it leaves", async () => {
  const listeners = vi.spyOn(Keyboard, 'addListener');
  mountWallet(<Probe />);
  await settle();
  startAnimations();
  fireEvent.click(named('radio', 'รายรับ'));
  const field = () => named('textbox', 'ชื่อรายการ');
  act(() => { field().focus(); });
  expect(partsInOrder(found('tray-footer'))).toEqual(['add-next']);
  act(() => { field().blur(); });
  expect(partsInOrder(found('tray-footer'))).toEqual(['wallet-keypad', 'add-next']);
  // Android's back hides the keyboard but leaves the field focused: the field lets go, so the keys come back.
  act(() => { field().focus(); });
  expect(screen.queryByTestId('wallet-keypad')).toBeNull();
  const hide = listeners.mock.calls.filter(([event]) => event === 'keyboardDidHide').map(([, listener]) => listener).at(-1);
  expect(hide).toBeTypeOf('function');
  act(() => { hide?.(undefined as never); });
  expect([document.activeElement === field(), partsInOrder(found('tray-footer'))]).toEqual([false, ['wallet-keypad', 'add-next']]);
  // A field that leaves while it has focus (another type) gives the keys back too.
  act(() => { field().focus(); });
  expect(screen.queryByTestId('wallet-keypad')).toBeNull();
  fireEvent.click(named('radio', 'รายจ่าย'));
  expect(partsInOrder(found('tray-footer'))).toEqual(['wallet-keypad', 'add-next']);
});

test('every key, chip, segment and field is at least 44 pt', async () => {
  for (const locale of LOCALES) {
    for (const [mode] of MODES) {
      const at = `${locale} ${mode}`;
      const words = WORDS[locale];
      mountWallet(<Probe chips={chipsOf()} canTellBun />, { locale, mode });
      await settle();
      startAnimations();
      const keys = within(found('wallet-keypad')).queryAllByRole('button');
      expect(keys.map((key) => key.getAttribute('aria-label')), at).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', words.delete]);
      const segments = within(found('type-switch')).queryAllByRole('radio');
      expect(segments.map((segment) => segment.getAttribute('aria-label')), at).toEqual([words.expense, words.income, words.transfer]);
      const chips = within(found('quick-chips')).queryAllByRole('button');
      expect(chips, at).toHaveLength(3);
      for (const control of [...keys, ...segments, ...chips, found('add-wallet'), found('add-tell-bun'), named('button', words.next)]) {
        expect(Number.parseFloat(control.style.minHeight), `${at}: ${control.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
      }
      // Income's name field, in its own box (§4).
      fireEvent.click(named('radio', words.income));
      expect(Number.parseFloat(named('textbox', words.name).style.minHeight), `${at}: ${words.name}`).toBeGreaterThanOrEqual(44);
      cleanup();
    }
  }
});

test('the type switch is one named radio group: a new type ticks once and is chosen, and the chosen one does nothing', async () => {
  for (const locale of LOCALES) {
    for (const [mode, colors] of MODES) {
      const at = `${locale} ${mode}`;
      const words = WORDS[locale];
      const onType = vi.fn();
      mountWallet(<TypeSwitchHeader type="expense" onType={onType} />, { locale, mode });
      await settle();
      const group = named('radiogroup', words.group);
      const segments = within(group).getAllByRole('radio');
      expect(segments.map((segment) => [segment.getAttribute('aria-label'), segment.getAttribute('aria-checked')]), at).toEqual([
        [words.expense, 'true'], [words.income, 'false'], [words.transfer, 'false'],
      ]);
      // The chosen type: a card segment with bold ink words, lifted by day only; the others quiet on the raised track.
      const [chosen, other] = [within(segments[0] as HTMLElement).getByText(words.expense), within(segments[1] as HTMLElement).getByText(words.income)];
      expect([group.style.backgroundColor, (segments[0] as HTMLElement).style.backgroundColor], at).toEqual([rgba(colors.raised), rgba(colors.card)]);
      expect((segments[1] as HTMLElement).style.backgroundColor, at).not.toBe(rgba(colors.card));
      expect([(segments[0] as HTMLElement).style.boxShadow !== '', (segments[1] as HTMLElement).style.boxShadow], at).toEqual([!colors.isDark, '']);
      expect([chosen.style.color, chosen.style.fontWeight, other.style.color, other.style.fontWeight], at).toEqual([rgba(colors.ink), '700', rgba(colors.quiet), '500']);
      fireEvent.click(segments[0] as HTMLElement);
      expect(onType, at).not.toHaveBeenCalled();
      fireEvent.click(segments[2] as HTMLElement);
      expect([onType.mock.calls, moments()], at).toEqual([[['transfer']], ['segmentChange']]);
      cleanup();
      vi.clearAllMocks();
    }
  }
  // Locked for a save (P2-T16), as today's TypeSwitch: every segment dimmed and unavailable, and a tap changes nothing.
  const onType = vi.fn();
  mountWallet(<TypeSwitchHeader type="expense" onType={onType} disabled />);
  await settle();
  const segments = within(named('radiogroup', 'ประเภทรายการ')).getAllByRole('radio');
  expect(segments.map((segment) => [segment.getAttribute('aria-disabled'), segment.style.opacity])).toEqual(Array(3).fill(['true', '0.4']));
  fireEvent.click(segments[1] as HTMLElement);
  expect([onType.mock.calls, moments()]).toEqual([[], []]);
  cleanup();
  // In a locked tray the switch is locked too, so the type cannot change under a save.
  mountWallet(<Probe locked />);
  await settle();
  startAnimations();
  fireEvent.click(named('radio', 'รายรับ'));
  expect([screen.queryByRole('dialog', { name: 'จดรายจ่าย' }) !== null, moments()]).toEqual([true, []]);
});

test("the keypad types through today's rules: 000 on nothing is one 0, delete takes one digit, each key ticks once, and a disabled keypad takes nothing", async () => {
  mountWallet(<Probe />);
  await settle();
  startAnimations();
  press('000');
  expect(amount().textContent).toBe('฿0');
  press('5');
  expect(amount().textContent).toBe('฿5');
  press('000');
  expect(amount().textContent).toBe('฿5,000');
  press('ลบตัวเลข');
  expect(amount().textContent).toBe('฿500');
  expect(moments()).toEqual(['keyTap', 'keyTap', 'keyTap', 'keyTap']);
  cleanup();
  vi.clearAllMocks();
  const onKeypad = vi.fn();
  mountWallet(<WalletKeypad keypad={EMPTY_KEYPAD} onKeypad={onKeypad} disabled />);
  await settle();
  const five = named('button', '5');
  expect([five.getAttribute('aria-disabled'), five.style.opacity]).toEqual(['true', '0.4']);
  fireEvent.click(five);
  expect([onKeypad.mock.calls, moments()]).toEqual([[], []]);
});

test('a fill starts over at the first key: a digit begins a new amount and delete clears it, so satang never meets a point the keypad cannot type', async () => {
  const chips: QuickChip[] = [{ label: 'กาแฟเย็น', amountMinor: '6550', apply: () => undefined }, { label: 'วิน', amountMinor: '2000', apply: () => undefined }];
  mountWallet(<Probe chips={chips} />);
  await settle();
  startAnimations();
  const chip = (name: string) => within(found('quick-chips')).getByRole('button', { name: new RegExp(`^${name} `) });
  // Outside private mode a fill shows, as typed amounts do, and Next takes it.
  fireEvent.click(chip('กาแฟเย็น'));
  expect([amount().textContent, amount().getAttribute('aria-label'), named('button', 'ถัดไป').getAttribute('aria-disabled')]).toEqual(['฿65.50', '65 บาท 50 สตางค์', null]);
  // A digit starts a new amount: never refused as too precise.
  press('7');
  expect([amount().textContent, screen.queryByTestId('add-problem')]).toEqual(['฿7', null]);
  press('5');
  expect(amount().textContent).toBe('฿75');
  // Delete clears a fill, so the line never walks down to ฿65.5 and a bare ฿65.
  fireEvent.click(chip('กาแฟเย็น'));
  press('ลบตัวเลข');
  expect([amount().textContent, screen.queryByTestId('add-problem'), named('button', 'ถัดไป').getAttribute('aria-disabled')]).toEqual(['฿0', null, 'true']);
  // A whole-baht fill starts over too, and what is typed after it goes on by today's rules.
  fireEvent.click(chip('วิน'));
  press('ลบตัวเลข');
  expect(amount().textContent).toBe('฿0');
  press('2', '5', 'ลบตัวเลข');
  expect(amount().textContent).toBe('฿2');
  cleanup();
  // An amount opened with satang but not as a fill (6550 as typed) is one all the same: this keypad has no point.
  mountWallet(<Probe minor="6550" />);
  await settle();
  startAnimations();
  press('1');
  expect([amount().textContent, screen.queryByTestId('add-problem')]).toEqual(['฿1', null]);
});

test('the quick chips: at most three, each says its name and amount, and a tap fills the entry through apply', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    const apply = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    mountWallet(<QuickChips chips={chipsOf().map((chip, index) => ({ ...chip, apply: apply[index] as () => void }))} />, { locale });
    await settle();
    const chips = screen.queryAllByRole('button');
    expect(chips.map((chip) => chip.getAttribute('aria-label')), locale).toEqual([`กาแฟเย็น ${words.baht('65')}`, `วิน ${words.baht('20')}`, `BTS ${words.baht('47')}`]);
    expect(chips.map((chip) => chip.textContent), locale).toEqual(['กาแฟเย็น฿65', 'วิน฿20', 'BTS฿47']);
    fireEvent.click(chips[1] as HTMLElement);
    expect([apply.map((each) => each.mock.calls.length), moments()], locale).toEqual([[0, 1, 0, 0], ['chipPick']]);
    cleanup();
    vi.clearAllMocks();
  }
  mountWallet(<QuickChips chips={[]} />);
  await settle();
  expect(screen.queryByTestId('quick-chips')).toBeNull();
});

test("private mode hides the chips' amounts and a filled amount until a key is pressed, never the amount being typed", async () => {
  mountWallet(<Probe minor="5000" chips={chipsOf()} />, { device: { [PRIVATE_MODE_NAME]: '1' } });
  await settle();
  startAnimations();
  expect([amount().textContent, amount().getAttribute('aria-label')]).toEqual(['฿50', '50 บาท']);
  const chips = within(found('quick-chips')).getAllByRole('button');
  expect(chips.map((chip) => chip.textContent)).toEqual(['กาแฟเย็น฿••••', 'วิน฿••••', 'BTS฿••••']);
  expect(chips.map((chip) => chip.getAttribute('aria-label'))).toEqual(['กาแฟเย็น ซ่อนยอดเงินอยู่', 'วิน ซ่อนยอดเงินอยู่', 'BTS ซ่อนยอดเงินอยู่']);
  press('0');
  expect(amount().textContent).toBe('฿500');
  // A chip's stored amount stays hidden on the amount line, at the amount's size with the mask's spacing, and Next still takes it.
  fireEvent.click(chips[0] as HTMLElement);
  expect([amount().textContent, amount().getAttribute('aria-label'), amount().style.fontSize, amount().style.letterSpacing]).toEqual(['฿••••', 'ซ่อนยอดเงินอยู่', '58px', `${(58 * 12) / 100}px`]);
  expect(named('button', 'ถัดไป').getAttribute('aria-disabled')).toBeNull();
  // A key starts the amount over, and what the person types shows.
  press('7');
  expect([amount().textContent, amount().getAttribute('aria-label')]).toEqual(['฿7', '7 บาท']);
  fireEvent.click(chips[1] as HTMLElement);
  press('ลบตัวเลข');
  expect([amount().textContent, amount().getAttribute('aria-label')]).toEqual(['฿0', '0 บาท']);
});

test("the add tray's sections come right after the tray's, and each opens at once on its board's words", async () => {
  const ids = WALLET_SECTIONS.map((section) => section.id);
  const at = ids.indexOf('bw-tray-amount');
  expect(ids.slice(at - 4, at + 2)).toEqual(['bw-tray-short', 'bw-tray-tall', 'bw-tray-large', 'bw-buttons', 'bw-tray-amount', 'bw-tray-income']);
  const cases = [
    ['bw-tray-amount', 'จดรายจ่าย', '฿50', 'จากบัญชีหลัก'],
    ['bw-tray-income', 'จดรายรับ', '฿35,000', 'เข้าบัญชีหลัก'],
  ] as const;
  const section = (id: string) => WALLET_SECTIONS.find((each) => each.id === id);
  for (const [id, title, shown, wallet] of cases) {
    mountWallet(<>{section(id)?.render()}</>);
    await settle();
    startAnimations();
    expect(screen.queryAllByRole('dialog', { name: title }), id).toHaveLength(1);
    expect([amount().textContent, found('add-wallet').getAttribute('aria-label')], id).toEqual([shown, wallet]);
    if (id === 'bw-tray-amount') {
      expect([screen.queryByTestId('add-tell-bun') !== null, within(found('quick-chips')).getAllByRole('button').length], id).toEqual([true, 3]);
    } else {
      expect((named('textbox', 'ชื่อรายการ') as HTMLInputElement).value, id).toBe('เงินเดือน');
      // The name field's focus leaves Next alone in the footer.
      act(() => { named('textbox', 'ชื่อรายการ').focus(); });
      expect(partsInOrder(found('tray-footer')), id).toEqual(['add-next']);
    }
    cleanup();
  }
  // The spending section's problems are today's words, through tc; a chip fills the amount as a fill; and closing it and opening it again starts over.
  mountWallet(<>{section('bw-tray-amount')?.render()}</>);
  await settle();
  startAnimations();
  press('ลบตัวเลข', 'ลบตัวเลข', '0');
  expect(found('add-problem').textContent).toBe('กรอกจำนวนเงินที่มากกว่าศูนย์');
  press(...Array<string>(10).fill('9'));
  expect(found('add-problem').textContent).toBe('จำนวนเงินสูงสุด ฿999,999,999.99');
  fireEvent.click(within(found('quick-chips')).getAllByRole('button')[0] as HTMLElement);
  press('ลบตัวเลข');
  expect(amount().textContent).toBe('฿0');
  press('5');
  press('ปิด');
  await wait(400);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(named('button', 'เปิดถาด'));
  startAnimations();
  expect([amount().textContent, screen.queryByTestId('add-problem')]).toEqual(['฿50', null]);
  cleanup();
  // At AX5 the section gives the switch to the step, under the amount, and its header is the title.
  mountWallet(<>{section('bw-tray-amount')?.render()}</>, { fontScale: AX5 });
  await settle();
  startAnimations();
  expect([within(found('tray-header')).queryByText('จดรายจ่าย') !== null, screen.queryAllByTestId('type-switch').length]).toEqual([true, 1]);
  expect(partsInOrder()).toEqual(['add-amount', 'type-switch', 'add-wallet', 'add-tell-bun', 'quick-chips', 'wallet-keypad', 'add-next']);
});
