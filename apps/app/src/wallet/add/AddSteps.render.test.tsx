// The add tray's transfer, confirm and pick steps (P2-T15; W10, W12, W14;
// rh-transfer, bw-tray-confirm, dk-tray-confirm; Review Focus 2 and 3). Most
// cases mount the steps as P2-T16's host and the catalogue do: inside a Tray,
// through a probe that holds the draft, the keypad, the step shown, where a
// pick goes back to (isPickStep) and Bun's guesses (P2-T14's stillGuessed),
// and switches steps as onStep asks. The tray's back leaves a pick for the
// step that opened it; the back from the transfer and confirm steps to the
// amount is the host's (P2-T16), so the probe draws none there. Each case
// mounts through mountWallet, in Thai and by day unless it says otherwise.
//
// The traps, as AmountStep.render.test.tsx meets them: Reanimated keeps the
// tray's card, and each new step's content, unseen (visibility: hidden) until
// its entering animation starts, which happy-dom never fires, and queries by
// role skip what is unseen, so startAnimations() fires it after every mount
// and step change (tap). react-native-web drops numberOfLines,
// adjustsFontSizeToFit and maxFontSizeMultiplier from the DOM, so the props
// that reach the app's Text are recorded, as WalletCard.render.test.tsx does.
// Each haptic moment is recorded by name. react-native-web omits
// aria-disabled when it is false, so an enabled button has none.
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

import type { CategoryDto, Minor, WalletSnapshot } from '@gogospend/contracts';
import { Text } from 'react-native';

import { rgba } from '@mobile/dev/catalogue/catalogueTestHarness';
import { WALLET_SECTIONS } from '@mobile/dev/catalogue/wallet';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import type { Ranking } from '@mobile/screens/redesign/entry/entryHelpers';
import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { walletDark, walletLight } from '@mobile/theme/walletPalette';
import { amountMaxScale } from '@mobile/theme/walletType';
import { keypadFromMinor } from '@mobile/ui/keypadExpression';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { derivedLook } from '../looks/walletLooks';
import { PRIVATE_MODE_NAME } from '../privacy/PrivateModeProvider';
import { AX5, mountWallet } from '../testing/walletHarness';
import { Tray } from '../tray/Tray';
import { confirmRows, filledKeypad, stillGuessed, trayTitleKey } from './addFlow';
import type { AddStep, StepProps } from './addFlow';
import { ConfirmStep, confirmTitle } from './ConfirmStep';
import { COPY } from './copy';
import { CategoryPick, DatePick, isPickStep, NotePick, WalletPick } from './PickSteps';
import { TransferFooter, TransferStep } from './TransferStep';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  seen.props.length = 0;
});

/** Lets the stores and the phone's answer arrive. */
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

/** A tap, then the next step's content shows (see the note at the top). */
function tap(element: HTMLElement) {
  fireEvent.click(element);
  startAnimations();
}

const moments = () => vi.mocked(playHaptic).mock.calls.map(([moment]) => moment);
const label = (testID: string) => found(testID).getAttribute('aria-label');
const text = (testID: string) => found(testID).textContent;
const minHeight = (element: HTMLElement) => Number.parseFloat(element.style.minHeight || element.style.height);
const radios = (group: string) => within(named('radiogroup', group)).getAllByRole('radio');
const rowLabels = () => within(found('confirm-rows')).getAllByRole('button').map((row) => row.getAttribute('aria-label'));

const LOCALES = ['th', 'en'] as const;
const MODES = [['light', walletLight], ['dark', walletDark]] as const;
const TODAY = '2026-10-24';

/** 80 code points of Thai (Review Focus 3). */
const LONG_NAME = 'บัญชีออมทรัพย์สำหรับค่าเทอมลูกและค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดปีนะ';

const wallet = (id: string, name: string, more: Partial<WalletSnapshot> = {}): WalletSnapshot => ({
  id, name, currency: 'THB', opening_minor: '0', tracking_start: '2026-01-01', archived: false, version: 1, ...more,
});
const WALLETS: WalletSnapshot[] = [
  wallet('w-main', 'บัญชีหลัก', { tracking_start: '2026-10-22' }),
  wallet('w-cash', 'เงินสด'),
  wallet('w-old', 'กระเป๋าเก่า', { archived: true }),
  wallet('w-long', LONG_NAME),
];
/** rh-transfer's ฿24,860 and ฿1,240; the archived wallet ฿300; the long one at the cap, ฿999,999,999.99. */
const BALANCES: ReadonlyMap<string, Minor> = new Map([['w-main', '2486000'], ['w-cash', '124000'], ['w-old', '30000'], ['w-long', '99999999999']]);

const category = (id: string, type: 'expense' | 'income', builtin: CategoryDto['builtin_key'], label: string | null = null, archived = false): CategoryDto => ({
  id, type, builtin_key: builtin, label, color: builtin === null ? null : '#F0A868', archived, version: 1,
});
const FOOD = category('c-food', 'expense', 'food');
const TRAVEL = category('c-travel', 'expense', 'travel');
const BILLS = category('c-bills', 'expense', 'bills');
/** Archived since the ranking was made. */
const OLD = category('c-old', 'expense', null, 'หมวดเก่า', true);
/** Made since the ranking was made. */
const PETS = category('c-pets', 'expense', null, 'ค่าอาหารแมว');
const SALARY = category('c-salary', 'income', 'salary');
const BONUS = category('c-bonus', 'income', 'bonus');
const CATEGORIES = [FOOD, TRAVEL, BILLS, OLD, PETS, SALARY, BONUS];
const ranked = (top: CategoryDto[], rest: CategoryDto[]) => ({ top, rest, scores: new Map<string, number>() });
/** Travel used most; the old category still open when it was ranked, and the cat's not there yet. */
const RANKING: Ranking = { expense: ranked([TRAVEL, FOOD, { ...OLD, archived: false }], [BILLS]), income: ranked([SALARY, BONUS], []) };

const LOOKUPS: Lookups = {
  wallets: new Map(WALLETS.map((each) => [each.id, { id: each.id, name: each.name }])),
  categories: new Map(CATEGORIES.map((each) => [each.id, each])),
};

const DRAFT: QuickAddDraft = {
  mode: 'create', recordId: 'r-1', commandId: 'k-1', type: 'expense', amountMinor: '', occurredOn: TODAY, walletId: 'w-main',
  categoryByType: { expense: 'c-food', income: 'c-salary' }, fromWalletId: 'w-main', toWalletId: 'w-cash', note: '', merchant: '',
};

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** The host's part: the draft, the keypad, the step shown, where a pick goes back to and Bun's guesses, around the steps in a tray. */
function Probe({ step: first = 'confirm', draft: change = {}, minor = '5000', filled = false, balances = BALANCES, guessed: guesses = [], bunSentence = null, earliest }: {
  step?: AddStep;
  draft?: Partial<QuickAddDraft>;
  minor?: Minor;
  /** The amount is a fill (Bun's reading, a chip, move all), not typed. */
  filled?: boolean;
  balances?: ReadonlyMap<string, Minor> | null;
  guessed?: readonly string[];
  bunSentence?: string | null;
  earliest?: string;
}) {
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const locale = useActiveLocale();
  const [draft, setDraft] = useState<QuickAddDraft>(() => ({ ...DRAFT, ...change }));
  const [keypad, setKeypad] = useState<KeypadState>(() => (filled ? filledKeypad(minor) : keypadFromMinor(minor)));
  const [step, setStep] = useState<AddStep>(first);
  const [back, setBack] = useState<AddStep>('confirm');
  const [guessed, setGuessed] = useState<ReadonlySet<string>>(() => new Set(guesses));
  const props: StepProps = {
    draft,
    keypad,
    onKeypad: setKeypad,
    onDraft: (next) => {
      setGuessed((now) => stillGuessed(now, draft, next));
      setDraft(next);
    },
    onStep: (next) => {
      if (isPickStep(next)) setBack(step);
      setStep(next);
    },
  };
  const rows = confirmRows(draft, { lookups: LOOKUPS, today: TODAY, dateLocale: locale, guessed, tc });
  const middle = step === 'transfer' ? <TransferStep {...props} wallets={WALLETS} balances={balances} />
    : step === 'confirm' ? <ConfirmStep {...props} rows={rows} title={confirmTitle(draft, rows, t)} bunSentence={bunSentence} type={draft.type} lookups={LOOKUPS} />
    : step === 'category' ? <CategoryPick {...props} categories={CATEGORIES} ranking={RANKING} />
    : step === 'wallet' || step === 'from' || step === 'to' ? <WalletPick {...props} wallets={WALLETS} balances={balances} role={step} back={back} />
    : step === 'date' ? <DatePick {...props} today={TODAY} earliest={earliest} />
    : step === 'note' ? <NotePick {...props} />
    : <Text testID="probe-amount">amount</Text>;
  return (
    <Tray
      visible
      onClose={() => undefined}
      title={t(trayTitleKey(draft.type))}
      step={step}
      onBack={isPickStep(step) ? () => setStep(back) : undefined}
      footer={step === 'transfer' ? <TransferFooter {...props} /> : undefined}
    >
      {middle}
    </Tray>
  );
}

async function mount(element: Parameters<typeof mountWallet>[0], options: Parameters<typeof mountWallet>[1] = {}) {
  const view = mountWallet(element, options);
  await settle();
  startAnimations();
  return view;
}

const WORDS = {
  th: {
    food: 'อาหาร', travel: 'การเดินทาง', category: 'หมวด', wallet: 'กระเป๋า', from: 'จาก', to: 'ไป', date: 'วันที่', note: 'โน้ต',
    today: 'วันนี้', yesterday: 'เมื่อวาน', addNote: 'เพิ่มโน้ต', guess: 'บันเดา', swap: 'สลับกระเป๋าเงิน', next: 'ถัดไป', done: 'เสร็จ', back: 'กลับ',
    baht: (amount: string) => `${amount} บาท`, after: (amount: string) => `หลังโอน ${amount}`, moveAll: (amount: string) => `ย้ายทั้งหมด ${amount}`,
    bunRead: (sentence: string) => `บันอ่านจาก “${sentence}”`, two: 'เลือกกระเป๋าเงินสองใบที่ต่างกัน', choose: 'เลือกกระเป๋า',
    transferNote: 'โอนระหว่างกระเป๋าของคุณเอง ไม่นับเป็นรายจ่าย', previous: 'วันก่อนหน้า', following: 'วันถัดไป', hidden: 'ซ่อนยอดเงินอยู่',
  },
  en: {
    food: 'Food', travel: 'Travel', category: 'Category', wallet: 'Wallet', from: 'From', to: 'To', date: 'Date', note: 'Note',
    today: 'Today', yesterday: 'Yesterday', addNote: 'Add a note', guess: "Bun's guess", swap: 'Swap wallets', next: 'Next', done: 'Done', back: 'Back',
    baht: (amount: string) => `${amount} baht`, after: (amount: string) => `After ${amount}`, moveAll: (amount: string) => `Move all ${amount}`,
    bunRead: (sentence: string) => `Bun read this from “${sentence}”`, two: 'Choose two different wallets', choose: 'Choose a wallet',
    transferNote: 'A move between your own wallets is not spending', previous: 'Previous day', following: 'Next day', hidden: 'Amount hidden',
  },
} as const;

test('confirm shows ฿50, the category, the wallet and วันนี้, each row 44 pt', async () => {
  for (const locale of LOCALES) {
    for (const [mode, colors] of MODES) {
      const at = `${locale} ${mode}`;
      const words = WORDS[locale];
      await mount(<Probe />, { locale, mode });
      // The amount at 44 in ink, DM Sans 700, said in baht.
      expect([text('confirm-amount'), label('confirm-amount')], at).toEqual(['฿50', words.baht('50')]);
      const amount = found('confirm-amount');
      expect([amount.style.fontSize, amount.style.fontWeight, amount.style.color], at).toEqual(['44px', '700', rgba(colors.ink)]);
      // No merchant and no note: the title is the category's name, beside the category's own tile.
      expect([text('confirm-title'), screen.queryByTestId('confirm-tile'), screen.queryByTestId('confirm-bun')], at).toEqual([words.food, null, null]);
      // One row each, in order, saying its name and its value; the empty note says what to add.
      expect(rowLabels(), at).toEqual([
        `${words.category} ${words.food}`, `${words.wallet} บัญชีหลัก`, `${words.date} ${words.today}`, `${words.note} ${words.addNote}`,
      ]);
      for (const row of within(found('confirm-rows')).getAllByRole('button')) expect(minHeight(row), `${at}: ${row.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
      // The wallet row draws the wallet's own material; the rows sit on raised, the empty note in quiet ink.
      expect(found('confirm-row-wallet').querySelector('linearGradient')?.getAttribute('id'), at).toBe(`wallet-material-${derivedLook('w-main').material}-${mode}`);
      expect(found('confirm-rows').style.backgroundColor, at).toBe(rgba(colors.raised));
      expect(within(found('confirm-row-note')).getByText(words.addNote).style.color, at).toBe(rgba(colors.quiet));
      expect(within(found('confirm-row-wallet')).getByText('บัญชีหลัก').style.color, at).toBe(rgba(colors.ink));
      // A row opens its pick.
      tap(found('confirm-row-wallet'));
      expect(screen.queryByRole('radiogroup', { name: words.wallet }), at).not.toBeNull();
      cleanup();
    }
  }
});

test('a guessed row says บันเดา', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    await mount(<Probe draft={{ merchant: 'ข้าวมันไก่' }} filled guessed={['category']} bunSentence="ข้าวมันไก่ 50" />, { locale });
    // bw-tray-confirm: the merchant is the title, and what Bun read is under it in violet.
    expect([text('confirm-title'), text('confirm-bun')], locale).toEqual(['ข้าวมันไก่', words.bunRead('ข้าวมันไก่ 50')]);
    expect(found('confirm-bun').style.color, locale).toBe(rgba(walletLight.violet));
    // Only the row Bun filled carries the mark, in violet, and its label says so.
    expect(text('confirm-guess-category'), locale).toBe(words.guess);
    expect(within(found('confirm-guess-category')).getByText(words.guess).style.color, locale).toBe(rgba(walletLight.violet));
    expect(['wallet', 'date', 'note'].map((key) => screen.queryByTestId(`confirm-guess-${key}`)), locale).toEqual([null, null, null]);
    expect(rowLabels()[0], locale).toBe(`${words.category} ${words.food} ${words.guess}`);
    // Once the person changes it, the guess goes.
    tap(found('confirm-row-category'));
    tap(named('radio', words.travel));
    expect([rowLabels()[0], screen.queryByTestId('confirm-guess-category')], locale).toEqual([`${words.category} ${words.travel}`, null]);
    cleanup();
  }
});

test("a transfer shows each wallet's balance after the move, swaps, and fills move all; offline there is no move all", async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    await mount(<Probe step="transfer" draft={{ type: 'transfer' }} minor="50000" />, { locale });
    // rh-transfer: ฿500 from ฿24,860 leaves ฿24,360; ฿1,240 becomes ฿1,740.
    expect(text('transfer-amount'), locale).toBe('฿500');
    expect([text('transfer-from-balance'), text('transfer-from-after'), text('transfer-to-balance'), text('transfer-to-after')], locale).toEqual(['฿24,860', '฿24,360', '฿1,240', '฿1,740']);
    expect([label('transfer-from'), label('transfer-to')], locale).toEqual([
      `${words.from} บัญชีหลัก ${words.baht('24,860')} ${words.after(words.baht('24,360'))}`,
      `${words.to} เงินสด ${words.baht('1,240')} ${words.after(words.baht('1,740'))}`,
    ]);
    // The after line says what it is, before or after its amount as the language puts it.
    expect(within(found('transfer-from')).queryByText(locale === 'th' ? 'หลังโอน' : 'After'), locale).not.toBeNull();
    // Each card is its wallet's material.
    expect(found('transfer-from').querySelector('linearGradient')?.getAttribute('id'), locale).toBe(`wallet-material-${derivedLook('w-main').material}-light`);
    expect(found('transfer-to').querySelector('linearGradient')?.getAttribute('id'), locale).toBe(`wallet-material-${derivedLook('w-cash').material}-light`);
    // Swap: each card's name, balance and after line go with its wallet.
    tap(named('button', words.swap));
    expect([label('transfer-from'), label('transfer-to')], locale).toEqual([
      `${words.from} เงินสด ${words.baht('1,240')} ${words.after(words.baht('740'))}`,
      `${words.to} บัญชีหลัก ${words.baht('24,860')} ${words.after(words.baht('25,360'))}`,
    ]);
    expect([text('transfer-from-balance'), text('transfer-from-after'), text('transfer-to-balance'), text('transfer-to-after')], locale).toEqual(['฿1,240', '฿740', '฿24,860', '฿25,360']);
    // Move all: the from wallet's whole balance, which then holds nothing.
    const moveAll = named('button', words.moveAll(words.baht('1,240')));
    expect(moveAll.textContent, locale).toBe(`${words.moveAll('').trim()}฿1,240`);
    tap(moveAll);
    expect([text('transfer-amount'), text('transfer-from-after'), text('transfer-to-after')], locale).toEqual(['฿1,240', '฿0', '฿26,100']);
    // Next goes on to confirm, with the two wallets as the rows.
    tap(named('button', words.next));
    expect(rowLabels().slice(0, 2), locale).toEqual([`${words.from} เงินสด`, `${words.to} บัญชีหลัก`]);
    cleanup();
    // Offline there are no balances: names only, no after line and no move all.
    await mount(<Probe step="transfer" draft={{ type: 'transfer' }} minor="50000" balances={null} />, { locale });
    expect([label('transfer-from'), label('transfer-to')], locale).toEqual([`${words.from} บัญชีหลัก`, `${words.to} เงินสด`]);
    expect(['transfer-from-balance', 'transfer-from-after', 'transfer-to-after', 'transfer-move-all'].map((id) => screen.queryByTestId(id)), locale).toEqual([null, null, null, null]);
    cleanup();
  }
  // Exact past 2^53: ฿500 from ฿90,071,992,547,409.93, which is above the cap, so it offers no move all.
  await mount(<Probe step="transfer" draft={{ type: 'transfer' }} minor="50000" balances={new Map([['w-main', '9007199254740993'], ['w-cash', '124000']])} />);
  expect([text('transfer-from-balance'), text('transfer-from-after'), screen.queryByTestId('transfer-move-all')]).toEqual(['฿90,071,992,547,409.93', '฿90,071,992,546,909.93', null]);
});

test('a pick returns to confirm with the choice', async () => {
  await mount(<Probe earliest="2026-10-22" />);
  // The category: a tap ticks once and comes back with it (the tray ticks each step change itself).
  tap(found('confirm-row-category'));
  tap(named('radio', 'การเดินทาง'));
  expect([rowLabels()[0], moments()]).toEqual(['หมวด การเดินทาง', ['trayStep', 'chipPick', 'trayStep']]);
  // The wallet: wallets in use only, with their balances; the chosen one is checked.
  tap(found('confirm-row-wallet'));
  expect(radios('กระเป๋า').map((radio) => [radio.getAttribute('aria-label'), radio.getAttribute('aria-checked')])).toEqual([
    ['บัญชีหลัก 24,860 บาท', 'true'], ['เงินสด 1,240 บาท', 'false'], [`${LONG_NAME} 999,999,999 บาท 99 สตางค์`, 'false'],
  ]);
  tap(named('radio', 'เงินสด 1,240 บาท'));
  expect(rowLabels()[1]).toBe('กระเป๋า เงินสด');
  // The day: one back, kept with เสร็จ.
  tap(found('confirm-row-date'));
  tap(named('button', 'วันก่อนหน้า'));
  tap(named('button', 'เสร็จ'));
  expect(rowLabels()[2]).toBe('วันที่ เมื่อวาน');
  // The note: written and kept, and the title follows it.
  tap(found('confirm-row-note'));
  fireEvent.change(named('textbox', 'โน้ต'), { target: { value: 'ข้าวเที่ยงกับทีม' } });
  expect(named('textbox', 'โน้ต').getAttribute('maxlength')).toBe('500');
  tap(named('button', 'เสร็จ'));
  expect([rowLabels()[3], text('confirm-title')]).toEqual(['โน้ต ข้าวเที่ยงกับทีม', 'ข้าวเที่ยงกับทีม']);
  // The tray's back leaves a pick with nothing changed: a day stepped, a note rewritten, then back.
  tap(found('confirm-row-date'));
  tap(named('button', 'วันก่อนหน้า'));
  tap(named('button', 'กลับ'));
  tap(found('confirm-row-note'));
  fireEvent.change(named('textbox', 'โน้ต'), { target: { value: 'อย่าเก็บ' } });
  tap(named('button', 'กลับ'));
  expect(rowLabels().slice(2)).toEqual(['วันที่ เมื่อวาน', 'โน้ต ข้าวเที่ยงกับทีม']);
});

test("the date cannot pass today or go before the wallet's start", async () => {
  await mount(<Probe step="date" earliest="2026-10-22" />);
  const day = () => text('pick-date-day');
  const later = () => named('button', 'วันถัดไป');
  const earlier = () => named('button', 'วันก่อนหน้า');
  // Today: no later day, and วันนี้ is not offered.
  expect([day(), later().getAttribute('aria-disabled'), earlier().getAttribute('aria-disabled'), screen.queryByRole('button', { name: 'วันนี้' })]).toEqual(['วันนี้', 'true', null, null]);
  fireEvent.click(later());
  expect([day(), moments()]).toEqual(['วันนี้', []]);
  // Back to the wallet's start, a tick for each day, and no further.
  fireEvent.click(earlier());
  expect(day()).toBe('เมื่อวาน');
  fireEvent.click(earlier());
  expect([day(), within(found('pick-date')).getByText('วันพฤหัสบดีที่ 22 ตุลาคม 2569') !== null, earlier().getAttribute('aria-disabled')]).toEqual(['พฤหัส 22 ต.ค.', true, 'true']);
  fireEvent.click(earlier());
  expect([day(), moments()]).toEqual(['พฤหัส 22 ต.ค.', ['dateStep', 'dateStep']]);
  // วันนี้ comes back to today.
  fireEvent.click(named('button', 'วันนี้'));
  expect([day(), later().getAttribute('aria-disabled'), moments().length]).toEqual(['วันนี้', 'true', 3]);
  cleanup();
  // A draft dated before the wallet's start opens at the start, and keeps it.
  await mount(<Probe step="date" draft={{ occurredOn: '2026-10-01' }} earliest="2026-10-22" />);
  expect([day(), earlier().getAttribute('aria-disabled')]).toEqual(['พฤหัส 22 ต.ค.', 'true']);
  tap(named('button', 'เสร็จ'));
  expect(rowLabels()[2]).toBe('วันที่ พฤหัส 22 ต.ค.');
  cleanup();
  // With no start, a day steps back freely, and forward to today only.
  await mount(<Probe step="date" draft={{ occurredOn: '2026-10-23' }} />);
  fireEvent.click(named('button', 'วันถัดไป'));
  expect([day(), named('button', 'วันถัดไป').getAttribute('aria-disabled')]).toEqual(['วันนี้', 'true']);
});

test("from the transfer step a card opens its wallet pick, which comes back to it; picking the other side's wallet swaps the two", async () => {
  await mount(<Probe step="transfer" draft={{ type: 'transfer' }} minor="50000" />);
  tap(found('transfer-from'));
  // The from side's group, wallets in use, the from wallet checked.
  expect(radios('จาก').map((radio) => radio.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
  tap(named('radio', 'เงินสด 1,240 บาท'));
  expect([label('transfer-from'), label('transfer-to')]).toEqual([
    'จาก เงินสด 1,240 บาท หลังโอน 740 บาท', 'ไป บัญชีหลัก 24,860 บาท หลังโอน 25,360 บาท',
  ]);
  tap(found('transfer-to'));
  tap(named('radio', `${LONG_NAME} 999,999,999 บาท 99 สตางค์`));
  expect(label('transfer-to')).toBe(`ไป ${LONG_NAME} 999,999,999 บาท 99 สตางค์ หลังโอน 1,000,000,499 บาท 99 สตางค์`);
  // The to side: picking the from wallet swaps them too.
  tap(found('transfer-to'));
  tap(named('radio', 'เงินสด 1,240 บาท'));
  expect([label('transfer-from'), label('transfer-to')].map((each) => each?.split(' ').slice(0, 2).join(' '))).toEqual(['จาก บัญชีออมทรัพย์สำหรับค่าเทอมลูกและค่าใช้จ่ายในบ้านของครอบครัวใหญ่ทุกเดือนตลอดปีนะ', 'ไป เงินสด']);
  // The tray's back leaves the pick with nothing changed, for the transfer step.
  tap(found('transfer-from'));
  tap(named('button', 'กลับ'));
  expect(label('transfer-to')?.startsWith('ไป เงินสด')).toBe(true);
  // For spending, the wallet pick sets the entry's wallet only.
  cleanup();
  await mount(<Probe />);
  tap(found('confirm-row-wallet'));
  tap(named('radio', `${LONG_NAME} 999,999,999 บาท 99 สตางค์`));
  expect(rowLabels()[1]).toBe(`กระเป๋า ${LONG_NAME}`);
});

test('the same wallet on both sides says so and Next waits; with two wallets Next goes to confirm', async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    await mount(<Probe step="transfer" draft={{ type: 'transfer', toWalletId: 'w-main' }} minor="50000" />, { locale });
    const problem = found('transfer-problem');
    expect([problem.textContent, problem.getAttribute('role'), problem.getAttribute('aria-live')], locale).toEqual([words.two, 'alert', 'polite']);
    // The note is in the pinned footer, above Next.
    expect(within(found('tray-footer')).queryByText(words.transferNote)?.style.color, locale).toBe(rgba(walletLight.quiet));
    expect(named('button', words.next).getAttribute('aria-disabled'), locale).toBe('true');
    fireEvent.click(named('button', words.next));
    expect(screen.queryByTestId('transfer-step'), locale).not.toBeNull();
    cleanup();
    // A side with no wallet asks for one, says nothing, and Next waits.
    await mount(<Probe step="transfer" draft={{ type: 'transfer', toWalletId: null }} minor="50000" />, { locale });
    expect([label('transfer-to'), screen.queryByTestId('transfer-problem'), named('button', words.next).getAttribute('aria-disabled')], locale).toEqual([
      `${words.to} ${words.choose}`, null, 'true',
    ]);
    cleanup();
    // Neither side chosen: both ask, nothing is said, and Next waits.
    await mount(<Probe step="transfer" draft={{ type: 'transfer', fromWalletId: null, toWalletId: null }} minor="50000" />, { locale });
    expect([label('transfer-from'), label('transfer-to'), screen.queryByTestId('transfer-problem'), named('button', words.next).getAttribute('aria-disabled')], locale).toEqual([
      `${words.from} ${words.choose}`, `${words.to} ${words.choose}`, null, 'true',
    ]);
    cleanup();
    // An archived wallet is never shown: the side asks for another.
    await mount(<Probe step="transfer" draft={{ type: 'transfer', fromWalletId: 'w-old' }} minor="50000" />, { locale });
    expect([label('transfer-from'), screen.queryByTestId('transfer-move-all')], locale).toEqual([`${words.from} ${words.choose}`, null]);
    cleanup();
  }
});

test('private mode hides every balance, after line and move all, a fill on the amount line, and the numbers in what Bun read; a typed amount shows', async () => {
  const device = { [PRIVATE_MODE_NAME]: '1' };
  /** Every word and name inside the tray but the amount line the person typed. */
  const said = (except: string | null) => [...found('tray').querySelectorAll<HTMLElement>('*')]
    .filter((element) => except === null || (element.getAttribute('data-testid') !== except && !element.closest(`[data-testid="${except}"]`)))
    .flatMap((element) => [element.getAttribute('aria-label') ?? '', ...[...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent ?? '')])
    .join(' ');
  await mount(<Probe step="transfer" draft={{ type: 'transfer' }} minor="50000" />, { device });
  expect([text('transfer-from-balance'), text('transfer-from-after'), text('transfer-to-balance'), text('transfer-to-after')]).toEqual(Array(4).fill('฿••••'));
  expect([label('transfer-from'), label('transfer-to')]).toEqual([
    'จาก บัญชีหลัก ซ่อนยอดเงินอยู่ หลังโอน ซ่อนยอดเงินอยู่', 'ไป เงินสด ซ่อนยอดเงินอยู่ หลังโอน ซ่อนยอดเงินอยู่',
  ]);
  const moveAll = named('button', 'ย้ายทั้งหมด ซ่อนยอดเงินอยู่');
  expect(moveAll.textContent).toBe('ย้ายทั้งหมด฿••••');
  // What the person typed shows; no other digit is anywhere in the tray.
  expect(text('transfer-amount')).toBe('฿500');
  expect(said('transfer-amount')).not.toMatch(/[0-9]/);
  // Move all is a fill: masked, at the amount's own size.
  tap(moveAll);
  expect([text('transfer-amount'), label('transfer-amount'), found('transfer-amount').style.fontSize]).toEqual(['฿••••', 'ซ่อนยอดเงินอยู่', '52px']);
  expect(said(null)).not.toMatch(/[0-9]/);
  // The wallet pick masks every balance.
  tap(found('transfer-from'));
  expect(radios('จาก').map((radio) => radio.getAttribute('aria-label'))).toEqual(['บัญชีหลัก ซ่อนยอดเงินอยู่', 'เงินสด ซ่อนยอดเงินอยู่', `${LONG_NAME} ซ่อนยอดเงินอยู่`]);
  expect(said(null)).not.toMatch(/[0-9]/);
  cleanup();
  // Confirm as Bun filled it: the amount is masked, and so is every number Bun read.
  await mount(<Probe draft={{ merchant: 'ข้าวมันไก่' }} filled guessed={['category']} bunSentence="ข้าวมันไก่ ฿50 กับน้ำ 1,250.50 และ ๒๐" />, { device });
  expect([text('confirm-amount'), label('confirm-amount')]).toEqual(['฿••••', 'ซ่อนยอดเงินอยู่']);
  expect(text('confirm-bun')).toBe('บันอ่านจาก “ข้าวมันไก่ ฿•••• กับน้ำ ฿•••• และ ฿••••”');
  expect(said(null)).not.toMatch(/[0-9๐-๙]/);
  cleanup();
  // A typed amount shows on confirm too, as the person typed it.
  await mount(<Probe />, { device });
  expect([text('confirm-amount'), label('confirm-amount')]).toEqual(['฿50', '50 บาท']);
});

test('move all is offered only for a known balance above zero and within the amount cap', async () => {
  const offered = async (balance: Minor, tapIt = false) => {
    await mount(<Probe step="transfer" draft={{ type: 'transfer' }} minor="50000" balances={new Map([['w-main', balance], ['w-cash', '124000']])} />);
    const button = screen.queryByTestId('transfer-move-all');
    const answer = [button === null ? null : button.getAttribute('aria-label')];
    if (tapIt && button !== null) {
      tap(button);
      answer.push(text('transfer-amount'));
    }
    cleanup();
    return answer;
  };
  expect(await offered('0')).toEqual([null]);
  expect(await offered('-500')).toEqual([null]);
  // One satang above ฿999,999,999.99: a record cannot hold it, so nothing is offered or said.
  expect(await offered('100000000000')).toEqual([null]);
  expect(await offered('99999999999', true)).toEqual(['ย้ายทั้งหมด 999,999,999 บาท 99 สตางค์', '฿999,999,999.99']);
  expect(await offered('1', true)).toEqual(['ย้ายทั้งหมด 0 บาท 1 สตางค์', '฿0.01']);
  // No from wallet: no balance to move.
  await mount(<Probe step="transfer" draft={{ type: 'transfer', fromWalletId: null }} minor="50000" />);
  expect(screen.queryByTestId('transfer-move-all')).toBeNull();
});

test('at AX5 the cards, the summary and the rows stack, and the longest name and ฿999,999,999.99 never truncate', async () => {
  expect([...LONG_NAME]).toHaveLength(80);
  await mount(<Probe step="transfer" draft={{ type: 'transfer', fromWalletId: 'w-long' }} minor="99999999999" />, { fontScale: AX5 });
  // The card stacks its amounts under its name, and the swap takes its own row.
  expect([found('transfer-from').style.flexDirection, found('transfer-to').style.flexDirection]).toEqual(['column', 'column']);
  expect(named('button', 'สลับกระเป๋าเงิน').parentElement?.style.height).toBe('');
  expect([text('transfer-amount'), text('transfer-from-balance')]).toEqual(['฿999,999,999.99', '฿999,999,999.99']);
  expect(within(found('transfer-from')).getByText(LONG_NAME)).not.toBeNull();
  // The amount grows to 64 pt and no more (W30).
  expect(seen.props.find((props) => props.testID === 'transfer-amount')?.maxFontSizeMultiplier).toBe(amountMaxScale(52));
  for (const props of seen.props) expect([props.numberOfLines, props.adjustsFontSizeToFit, props.ellipsizeMode]).toEqual([undefined, undefined, undefined]);
  cleanup();
  seen.props.length = 0;
  await mount(<Probe draft={{ walletId: 'w-long' }} minor="99999999999" />, { fontScale: AX5 });
  expect([text('confirm-amount'), seen.props.find((props) => props.testID === 'confirm-amount')?.maxFontSizeMultiplier]).toEqual(['฿999,999,999.99', amountMaxScale(44)]);
  expect(within(found('confirm-row-wallet')).getByText(LONG_NAME)).not.toBeNull();
  expect(within(found('confirm-rows')).getAllByRole('button').map((row) => row.style.flexDirection)).toEqual(Array(4).fill('column'));
  expect(found('confirm-summary').style.flexDirection).toBe('column');
  for (const props of seen.props) expect([props.numberOfLines, props.adjustsFontSizeToFit, props.ellipsizeMode]).toEqual([undefined, undefined, undefined]);
  // The pick's grid is two across, and a wallet row stacks.
  tap(found('confirm-row-category'));
  expect(radios('หมวด').map((radio) => radio.style.width)).toEqual(Array(4).fill('50%'));
  tap(named('button', 'กลับ'));
  tap(found('confirm-row-wallet'));
  expect(radios('กระเป๋า').map((radio) => radio.style.flexDirection)).toEqual(Array(3).fill('column'));
  cleanup();
  // At the default size: the card is a row, the swap sits on the seam over the cards' padding, and the grid is four across.
  await mount(<Probe step="transfer" draft={{ type: 'transfer' }} minor="50000" />);
  expect([found('transfer-from').style.flexDirection, named('button', 'สลับกระเป๋าเงิน').parentElement?.style.height, found('transfer-from').style.paddingBottom]).toEqual(['row', '22px', '11px']);
  cleanup();
  await mount(<Probe step="category" />);
  expect(radios('หมวด').map((radio) => radio.style.width)).toEqual(Array(4).fill('25%'));
  cleanup();
  await mount(<Probe />);
  expect([found('confirm-summary').style.flexDirection, found('confirm-row-wallet').style.flexDirection]).toEqual(['row', 'row']);
});

test('every row, card, radio, arrow and button is at least 44 pt', async () => {
  for (const [mode] of MODES) {
    await mount(<Probe step="transfer" draft={{ type: 'transfer' }} minor="50000" />, { mode });
    const transfer = [found('transfer-from'), found('transfer-to'), named('button', 'สลับกระเป๋าเงิน'), found('transfer-move-all'), named('button', 'ถัดไป')];
    for (const control of transfer) expect(minHeight(control), `${mode}: ${control.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
    expect(minHeight(found('transfer-from')), mode).toBe(84);
    tap(named('button', 'ถัดไป'));
    for (const row of within(found('confirm-rows')).getAllByRole('button')) expect(minHeight(row), `${mode}: ${row.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
    tap(found('confirm-row-from'));
    for (const radio of radios('จาก')) expect(minHeight(radio), `${mode}: ${radio.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
    tap(named('button', 'กลับ'));
    tap(found('confirm-row-date'));
    for (const control of [named('button', 'วันก่อนหน้า'), named('button', 'วันถัดไป'), named('button', 'เสร็จ')]) {
      expect(minHeight(control), `${mode}: ${control.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
    }
    tap(named('button', 'วันก่อนหน้า'));
    expect(minHeight(named('button', 'วันนี้')), mode).toBeGreaterThanOrEqual(44);
    cleanup();
    await mount(<Probe step="category" />, { mode });
    for (const radio of radios('หมวด')) expect(minHeight(radio), `${mode}: ${radio.getAttribute('aria-label')}`).toBeGreaterThanOrEqual(44);
    cleanup();
  }
});

test("the category pick offers the type's categories in use in ranked order, the ranking's missing ones last, and says which is chosen", async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    await mount(<Probe step="category" />, { locale });
    const group = named('radiogroup', words.category);
    // Travel first, as ranked; the archived one left out; the cat's, made since, last.
    expect(within(group).getAllByRole('radio').map((radio) => [radio.getAttribute('aria-label'), radio.getAttribute('aria-checked')]), locale).toEqual([
      [words.travel, 'false'], [words.food, 'true'], [locale === 'th' ? 'ค่าบิล' : 'Bills', 'false'], ['ค่าอาหารแมว', 'false'],
    ]);
    // The chosen tile is ringed in violet and its name is bold.
    const chosen = named('radio', words.food);
    expect([(chosen.firstElementChild as HTMLElement).style.borderColor, within(chosen).getByText(words.food).style.fontWeight], locale).toEqual([rgba(walletLight.violet), '700']);
    expect((named('radio', words.travel).firstElementChild as HTMLElement).style.borderColor, locale).toBe('rgba(0, 0, 0, 0.00)');
    cleanup();
  }
  // Income's own categories, and a pick sets income's; a transfer has none to pick.
  await mount(<Probe step="category" draft={{ type: 'income' }} minor="3500000" />);
  expect(radios('หมวด').map((radio) => radio.getAttribute('aria-label'))).toEqual(['เงินเดือน', 'โบนัส']);
  tap(named('radio', 'โบนัส'));
  expect(rowLabels()[0]).toBe('หมวด โบนัส');
  cleanup();
  await mount(<Probe step="category" draft={{ type: 'transfer' }} />);
  expect([screen.queryByTestId('pick-category'), screen.queryByRole('radiogroup')]).toEqual([null, null]);
});

test("confirm for a move shows its two wallets and the move's mark, and income its amount in violet with a plus", async () => {
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    await mount(<Probe draft={{ type: 'transfer' }} minor="50000" />, { locale });
    expect(rowLabels(), locale).toEqual([`${words.from} บัญชีหลัก`, `${words.to} เงินสด`, `${words.date} ${words.today}`, `${words.note} ${words.addNote}`]);
    // No category: the tile is the move's mark, and the title is the tray's.
    expect([found('confirm-tile').querySelector('svg') !== null, text('confirm-title'), text('confirm-amount')], locale).toEqual([true, locale === 'th' ? 'โอนเงิน' : 'Move money', '฿500']);
    expect(found('confirm-row-to').querySelector('linearGradient')?.getAttribute('id'), locale).toBe(`wallet-material-${derivedLook('w-cash').material}-light`);
    cleanup();
    await mount(<Probe draft={{ type: 'income' }} minor="3500000" />, { locale });
    const amount = found('confirm-amount');
    expect([amount.textContent, amount.getAttribute('aria-label'), amount.style.color], locale).toEqual(['+฿35,000', words.baht('35,000'), rgba(walletLight.violet)]);
    cleanup();
  }
  // An expense with no category chosen: an empty tile, the tray's title, and the row asks for one.
  await mount(<Probe draft={{ categoryByType: { expense: null, income: null } }} />);
  expect([found('confirm-tile').querySelector('svg'), text('confirm-title'), rowLabels()[0]]).toEqual([null, 'จดรายจ่าย', 'หมวด เลือกหมวดหมู่']);
});

test("the steps' sections come right after the amount step's, and each opens at its step on its board's words", async () => {
  const ids = WALLET_SECTIONS.map((section) => section.id);
  const at = ids.indexOf('bw-tray-transfer');
  expect(ids.slice(at - 2, at + 4)).toEqual(['bw-tray-amount', 'bw-tray-income', 'bw-tray-transfer', 'bw-tray-confirm', 'bw-tray-confirm-bun', 'bw-tray-pick-category']);
  const section = (id: string) => WALLET_SECTIONS.find((each) => each.id === id)?.render();
  // rh-transfer's move, and its Next goes on to confirm.
  await mount(<>{section('bw-tray-transfer')}</>);
  expect(screen.queryAllByRole('dialog', { name: 'โอนเงิน' })).toHaveLength(1);
  expect([label('transfer-from'), label('transfer-to'), text('transfer-amount')]).toEqual([
    'จาก บัญชีหลัก 24,860 บาท หลังโอน 24,360 บาท', 'ไป เงินสด 1,240 บาท หลังโอน 1,740 บาท', '฿500',
  ]);
  expect(found('transfer-from').querySelector('linearGradient')?.getAttribute('id')).toBe('wallet-material-silk-light');
  expect(found('transfer-to').querySelector('linearGradient')?.getAttribute('id')).toBe('wallet-material-paper-light');
  // A card's pick comes back to the transfer step, and Next goes on to confirm.
  tap(found('transfer-from'));
  tap(named('radio', 'เงินสด 1,240 บาท'));
  expect(label('transfer-from')).toBe('จาก เงินสด 1,240 บาท หลังโอน 740 บาท');
  tap(named('button', 'ถัดไป'));
  expect(rowLabels().slice(0, 2)).toEqual(['จาก เงินสด', 'ไป บัญชีหลัก']);
  cleanup();
  // bw-tray-confirm typed: food from the main account today, and a row opens its pick and comes back.
  await mount(<>{section('bw-tray-confirm')}</>);
  expect([text('confirm-title'), text('confirm-amount'), rowLabels()]).toEqual(['อาหาร', '฿50', ['หมวด อาหาร', 'กระเป๋า บัญชีหลัก', 'วันที่ วันนี้', 'โน้ต เพิ่มโน้ต']]);
  expect(named('button', 'บันทึก')).not.toBeNull();
  tap(found('confirm-row-date'));
  tap(named('button', 'วันก่อนหน้า'));
  tap(named('button', 'เสร็จ'));
  expect(rowLabels()[2]).toBe('วันที่ เมื่อวาน');
  cleanup();
  // bw-tray-confirm as Tell Bun filled it.
  await mount(<>{section('bw-tray-confirm-bun')}</>);
  expect([text('confirm-title'), text('confirm-bun'), text('confirm-amount'), rowLabels()[0]]).toEqual(['ข้าวมันไก่', 'บันอ่านจาก “ข้าวมันไก่ 50”', '฿50', 'หมวด อาหาร บันเดา']);
  tap(found('confirm-row-category'));
  tap(named('radio', 'การเดินทาง'));
  expect([rowLabels()[0], screen.queryByTestId('confirm-guess-category')]).toEqual(['หมวด การเดินทาง', null]);
  cleanup();
  // The category pick: food chosen, and a tap goes back to confirm with the choice.
  await mount(<>{section('bw-tray-pick-category')}</>);
  expect(radios('หมวด').map((radio) => radio.getAttribute('aria-checked'))[0]).toBe('true');
  tap(named('radio', 'การเดินทาง'));
  expect(rowLabels()[0]).toBe('หมวด การเดินทาง');
});
