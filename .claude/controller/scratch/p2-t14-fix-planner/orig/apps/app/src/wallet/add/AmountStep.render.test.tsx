// The add tray's amount step (P2-T14; W14, W29; bw-tray-amount, rh-income,
// ax-large-tray; Review Focus 3). Most cases mount the step as P2-T16's host
// and the catalogue do: inside a Tray, with the type switch as its header and
// AmountFooter (the keypad, the problem, Next) as its footer. A probe holds the
// draft and the keypad, and shows the keypad's problem in today's words
// (amountProblem, then KEYPAD_PROBLEM_TEXT through tc), as the host will. Each
// case mounts through mountWallet, in Thai and by day unless it says otherwise.
//
// The tray behaviours these cases rely on (P2-T13's Tray, not changed here):
// `header` is drawn in the header row in the title's place; `footer` is
// pinned under the scrolling content; the title names the dialog.
//
// Reanimated keeps the tray's card unseen (visibility: hidden) until its
// entering animation starts, which happy-dom never fires, and queries by role
// skip what is unseen: startAnimations() fires it, as Tray.render.test.tsx
// does. react-native-web drops maxFontSizeMultiplier and numberOfLines from
// the DOM, so the props that reach the app's Text are recorded, as
// WalletCard.render.test.tsx does. Each haptic moment is recorded by name.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

// The real safe-area package loads React Native itself, which vitest cannot run.
vi.mock('react-native-safe-area-context', () => import('../../dev/catalogue/safeAreaTestStub'));

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
import { amountMaxScale } from '@mobile/theme/walletType';
import { EMPTY_KEYPAD, keypadFromMinor } from '@mobile/ui/keypadExpression';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { useDraftCopy } from '../copy/useDraftCopy';
import { derivedLook } from '../looks/walletLooks';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { AX5, mountWallet } from '../testing/walletHarness';
import { Tray } from '../tray/Tray';
import { amountProblem, trayTitleKey } from './addFlow';
import type { AddStep, StepProps } from './addFlow';
import { AmountFooter, AmountStep, useCanTellBun } from './AmountStep';
import { COPY } from './copy';
import { QuickChips } from './QuickChips';
import type { QuickChip } from './QuickChips';
import { TypeSwitchHeader } from './TypeSwitchHeader';
import { WalletKeypad } from './WalletKeypad';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  seen.props.length = 0;
});

/** Lets the stores, the phone's answer and Bun's AI preferences arrive. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

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

/** The host's part: the draft, the keypad and the problem in today's words, around the step in a tray. */
function Probe({ minor, walletId = 'w-main', chips = [], canTellBun, onStep = () => undefined, onTellBun = () => undefined }: {
  minor?: Minor;
  walletId?: string | null;
  chips?: readonly QuickChip[];
  /** Left out, the step offers บอกบัน as the host will: useCanTellBun(). */
  canTellBun?: boolean;
  onStep?: (step: AddStep) => void;
  onTellBun?: () => void;
}) {
  const tc = useCopy();
  const t = useDraftCopy(COPY);
  const offered = useCanTellBun();
  const [draft, setDraft] = useState<QuickAddDraft>(() => ({ ...DRAFT, walletId }));
  const [keypad, setKeypad] = useState<KeypadState>(() => (minor === undefined ? EMPTY_KEYPAD : keypadFromMinor(minor)));
  const problem = amountProblem(keypad);
  const step: StepProps = { draft, keypad, onDraft: setDraft, onKeypad: setKeypad, onStep };
  return (
    <Tray
      visible
      onClose={() => undefined}
      title={t(trayTitleKey(draft.type))}
      header={<TypeSwitchHeader type={draft.type} onType={(type) => setDraft((now) => ({ ...now, type }))} />}
      footer={<AmountFooter {...step} type={draft.type} problem={problem === null ? null : tc(KEYPAD_PROBLEM_TEXT[problem])} />}
    >
      <AmountStep {...step} type={draft.type} lookups={LOOKUPS} chips={chips} canTellBun={canTellBun ?? offered} onTellBun={onTellBun} />
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
      // The boards' amount: DM Sans 700 at 58 pt in ink, centred, and said in baht.
      expect([amount().textContent, amount().getAttribute('aria-label')], at).toEqual(['฿50', words.baht('50')]);
      expect([amount().style.fontSize, amount().style.fontWeight, amount().style.color, amount().style.textAlign], at).toEqual(['58px', '700', rgba(colors.ink), 'center']);
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

test("the keypad's problem shows above Next in today's words", async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    mountWallet(<Probe />, { locale });
    await settle();
    startAnimations();
    press('0');
    const problem = found('add-problem');
    expect([problem.textContent, problem.getAttribute('role')], locale).toEqual([words.zero, 'alert']);
    // Right above Next, which waits for an amount above zero.
    expect(problem.nextElementSibling, locale).toBe(named('button', words.next));
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
    mountWallet(<Probe onStep={onStep} />, { locale });
    await settle();
    startAnimations();
    // Spending says the wallet it comes from, and has no name field or budget note.
    expect(screen.queryByRole('dialog', { name: words.spending }), locale).not.toBeNull();
    named('button', words.from);
    expect([screen.queryByRole('textbox'), screen.queryByText(words.notInBudget)], locale).toEqual([null, null]);
    fireEvent.click(named('radio', words.income));
    expect(screen.queryByRole('dialog', { name: words.incomeTitle }), locale).not.toBeNull();
    expect(screen.queryByRole('button', { name: words.from }), locale).toBeNull();
    const field = named('textbox', words.name);
    expect(field.getAttribute('maxlength'), locale).toBe('120');
    fireEvent.change(field, { target: { value: 'เงินเดือน' } });
    expect((named('textbox', words.name) as HTMLInputElement).value, locale).toBe('เงินเดือน');
    expect(screen.queryByText(words.notInBudget), locale).not.toBeNull();
    // The wallet chip opens the wallet step.
    fireEvent.click(named('button', words.into));
    expect(onStep.mock.calls, locale).toEqual([['wallet']]);
    cleanup();
    // A wallet not chosen (a copied record's closed wallet) asks for one, with no material.
    mountWallet(<Probe walletId={null} />, { locale });
    await settle();
    startAnimations();
    expect([named('button', words.choose).querySelector('linearGradient')], locale).toEqual([null]);
    cleanup();
  }
});

test("a transfer's amount stands alone, and its Next goes on to choose the two wallets", async () => {
  const onStep = vi.fn();
  mountWallet(<Probe onStep={onStep} canTellBun />);
  await settle();
  startAnimations();
  fireEvent.click(named('radio', 'โอน'));
  expect(screen.queryByRole('dialog', { name: 'โอนเงิน' })).not.toBeNull();
  expect([screen.queryByTestId('add-wallet'), screen.queryByTestId('add-tell-bun'), screen.queryByRole('textbox')]).toEqual([null, null, null]);
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

test('every key, chip and segment is at least 44 pt', async () => {
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
      // The chosen type: a card segment with bold ink words; the others quiet on the raised track.
      const [chosen, other] = [within(segments[0] as HTMLElement).getByText(words.expense), within(segments[1] as HTMLElement).getByText(words.income)];
      expect([group.style.backgroundColor, (segments[0] as HTMLElement).style.backgroundColor], at).toEqual([rgba(colors.raised), rgba(colors.card)]);
      expect((segments[1] as HTMLElement).style.backgroundColor, at).not.toBe(rgba(colors.card));
      expect([chosen.style.color, chosen.style.fontWeight, other.style.color, other.style.fontWeight], at).toEqual([rgba(colors.ink), '700', rgba(colors.quiet), '500']);
      fireEvent.click(segments[0] as HTMLElement);
      expect(onType, at).not.toHaveBeenCalled();
      fireEvent.click(segments[2] as HTMLElement);
      expect([onType.mock.calls, moments()], at).toEqual([[['transfer']], ['segmentChange']]);
      cleanup();
      vi.clearAllMocks();
    }
  }
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

test("private mode hides the chips' amounts, never the amount being typed", async () => {
  mountWallet(<Probe minor="5000" chips={chipsOf()} />, { device: { [PRIVATE_MODE_NAME]: '1' } });
  await settle();
  startAnimations();
  expect([amount().textContent, amount().getAttribute('aria-label')]).toEqual(['฿50', '50 บาท']);
  const chips = within(found('quick-chips')).getAllByRole('button');
  expect(chips.map((chip) => chip.textContent)).toEqual(['กาแฟเย็น฿••••', 'วิน฿••••', 'BTS฿••••']);
  expect(chips.map((chip) => chip.getAttribute('aria-label'))).toEqual(['กาแฟเย็น ซ่อนยอดเงินอยู่', 'วิน ซ่อนยอดเงินอยู่', 'BTS ซ่อนยอดเงินอยู่']);
  press('0');
  expect(amount().textContent).toBe('฿500');
});

test("the add tray's sections come right after the tray's, and each opens at once on its board's words", async () => {
  const ids = WALLET_SECTIONS.map((section) => section.id);
  const at = ids.indexOf('bw-tray-amount');
  expect(ids.slice(at - 4, at + 2)).toEqual(['bw-tray-short', 'bw-tray-tall', 'bw-tray-large', 'bw-buttons', 'bw-tray-amount', 'bw-tray-income']);
  const cases = [
    ['bw-tray-amount', 'จดรายจ่าย', '฿50', 'จากบัญชีหลัก'],
    ['bw-tray-income', 'จดรายรับ', '฿35,000', 'เข้าบัญชีหลัก'],
  ] as const;
  for (const [id, title, shown, wallet] of cases) {
    const section = WALLET_SECTIONS.find((each) => each.id === id);
    mountWallet(<>{section?.render()}</>);
    await settle();
    startAnimations();
    expect(screen.queryAllByRole('dialog', { name: title }), id).toHaveLength(1);
    expect([amount().textContent, found('add-wallet').getAttribute('aria-label')], id).toEqual([shown, wallet]);
    if (id === 'bw-tray-amount') {
      expect([screen.queryByTestId('add-tell-bun') !== null, within(found('quick-chips')).getAllByRole('button').length], id).toEqual([true, 3]);
    } else {
      expect((named('textbox', 'ชื่อรายการ') as HTMLInputElement).value, id).toBe('เงินเดือน');
    }
    cleanup();
  }
});
