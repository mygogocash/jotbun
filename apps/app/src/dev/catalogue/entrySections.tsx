// Catalogue sections for the R2b entry and data components (redesign R2c+,
// development only). Each section shows one component's states and fits one
// 402 × 874 pt screen under the catalogue's header; WalletPicker and PaceRing
// take two. Interface copy goes through `tc`, as on a screen; what a person
// types (wallet and category names, notes) comes from ./samples in each
// locale. Dates are pinned to the fixtures' today, 29 September 2026, so
// "Today" and "Yesterday" never drift.
import { BUILTIN_CATEGORIES, CATEGORY_COLORS } from '@gogospend/contracts';
import type { BudgetDto, BuiltinCategoryKey, CategoryDto, CategoryType, Minor, MonthSummary } from '@gogospend/contracts';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { budgetPace } from '@mobile/spend/v1/redesign/budgetPace';
import { categoryName } from '@mobile/spend/v1/viewModels';
import { Amount } from '@mobile/ui/Amount';
import { BudgetBar } from '@mobile/ui/BudgetBar';
import type { BudgetPace } from '@mobile/ui/budgetWords';
import { BunText } from '@mobile/ui/BunText';
import { CategoryChips } from '@mobile/ui/CategoryChips';
import { CategoryGrid } from '@mobile/ui/CategoryGrid';
import { categoryLook } from '@mobile/ui/categoryIcons';
import { DateChip } from '@mobile/ui/DateChip';
import { DayHeader } from '@mobile/ui/DayHeader';
import { FieldError } from '@mobile/ui/FieldError';
import { Keypad } from '@mobile/ui/Keypad';
import { EMPTY_KEYPAD, applyKey, evaluateKeypad, keypadDisplay } from '@mobile/ui/keypadExpression';
import type { KeypadKey, KeypadProblem, KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_SPACE } from '@mobile/ui/layout';
import { NoteField } from '@mobile/ui/NoteField';
import { PaceRing } from '@mobile/ui/PaceRing';
import { toKitPace } from '@mobile/ui/paceAdapter';
import { RecordRow } from '@mobile/ui/RecordRow';
import { Sheet } from '@mobile/ui/Sheet';
import { TypeSwitch } from '@mobile/ui/TypeSwitch';
import type { EntryKind } from '@mobile/ui/TypeSwitch';
import { WalletPicker } from '@mobile/ui/WalletPicker';
import type { WalletChoice } from '@mobile/ui/WalletPicker';
import { Specimen, SpecimenLabel } from './parts';
import type { CatalogueSection } from './registry';
import { SAMPLE_MINOR, useSamples } from './samples';
import type { Samples } from './samples';
import { CATALOGUE_TODAY } from './screenFixtures';

const noop = () => {};

// ---------------------------------------------------------------------------
// Keypad: the expression worked out live

/** Keys as typed on the pad: digits, `.`, `+ - * /` and `=`. */
const KEY_OF: Readonly<Record<string, KeypadKey>> = { '.': '.', '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide', '=': 'equals' };
const typed = (text: string): KeypadState => [...text].reduce((state, char) => applyKey(state, KEY_OF[char] ?? (char as KeypadKey)), EMPTY_KEYPAD);

/** The words the keypad's screens use for a refused key (Quick add's own). */
const KEYPAD_PROBLEM: Readonly<Record<KeypadProblem, string>> = {
  empty: 'Enter an amount',
  zero: 'Enter an amount above zero',
  too_precise: 'Use at most two decimal places',
  too_large: 'Amounts go up to ฿999,999,999.99',
  negative: "The sum can't go below zero.",
  divide_by_zero: "You can't divide by zero.",
};

function KeypadSection() {
  const tc = useCopy();
  const [state, setState] = useState(() => typed('12.50+7.25'));
  const live = evaluateKeypad(state, { allowZero: true });
  return (
    <>
      <Specimen label="Typed 12.50 + 7.25: what was typed, then the exact sum. Every key works.">
        <View style={{ alignItems: 'center', gap: BUN_SPACE.xxs }}>
          <BunText variant="label" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{keypadDisplay(state)}</BunText>
          {live.ok
            ? <Amount minor={live.minor} type={live.minor === '0' ? undefined : 'expense'} size="xl" />
            : <BunText variant="hero" style={{ fontVariant: ['tabular-nums'] }}>{keypadDisplay(state)}</BunText>}
          {state.problem ? <FieldError message={tc(KEYPAD_PROBLEM[state.problem])} /> : null}
        </View>
      </Specimen>
      <Keypad onKey={(key) => setState((previous) => applyKey(previous, key))} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Type switch

function TypeSwitchSection() {
  const [kind, setKind] = useState<EntryKind>('expense');
  return (
    <>
      <Specimen label="Expense (tap to switch)"><TypeSwitch value={kind} onChange={setKind} /></Specimen>
      <Specimen label="Income"><TypeSwitch value="income" onChange={noop} /></Specimen>
      <Specimen label="Move"><TypeSwitch value="transfer" onChange={noop} /></Specimen>
      <Specimen label="Disabled while saving"><TypeSwitch value="expense" onChange={noop} disabled /></Specimen>
    </>
  );
}

// ---------------------------------------------------------------------------
// Categories: built-in and the person's own

const builtin = (key: BuiltinCategoryKey): CategoryDto => {
  const found = BUILTIN_CATEGORIES.find((category) => category.key === key)!;
  return { id: `catalogue-${key}`, type: found.type, builtin_key: key, label: null, color: found.color, archived: false, version: 1 };
};
const own = (id: string, label: string, type: CategoryType, color: string | null): CategoryDto => ({ id: `catalogue-own-${id}`, type, builtin_key: null, label, color, archived: false, version: 1 });

type SampleCategories = { expense: CategoryDto[]; income: CategoryDto[]; coffee: CategoryDto; pets: CategoryDto; misc: CategoryDto; byKey: (key: BuiltinCategoryKey) => CategoryDto };

/** Every built-in, plus three of the person's own: two on a pastel and one plain. */
function useSampleCategories(): SampleCategories {
  const samples = useSamples();
  return useMemo(() => {
    const coffee = own('coffee', samples.coffee, 'expense', CATEGORY_COLORS[3]);
    const pets = own('pets', samples.pets, 'expense', CATEGORY_COLORS[5]);
    const misc = own('misc', samples.misc, 'expense', null);
    const builtins = BUILTIN_CATEGORIES.map((category) => builtin(category.key));
    return {
      expense: [...builtins.filter((category) => category.type === 'expense'), coffee, pets, misc],
      income: builtins.filter((category) => category.type === 'income'),
      coffee, pets, misc,
      byKey: (key) => builtins.find((category) => category.builtin_key === key)!,
    };
  }, [samples]);
}

function CategoryChipsSection() {
  const tc = useCopy();
  const categories = useSampleCategories();
  const { byKey, coffee, pets } = categories;
  // Ranked by recent use, as the screen's view model hands them over.
  const ranked = [byKey('food'), coffee, byKey('travel'), byKey('shopping'), pets, byKey('bills')];
  const income = [byKey('salary'), byKey('side_job'), byKey('bonus'), byKey('gift')];
  const [chosen, setChosen] = useState<string | null>(byKey('food').id);
  const [more, setMore] = useState(false);
  return (
    <>
      <Specimen label="Top three by recent use, the first chosen. More opens the grid.">
        <CategoryChips ranked={ranked} selectedId={chosen} onSelect={setChosen} onMore={() => setMore(true)} />
      </Specimen>
      <Specimen label="A pick from More stays in view">
        <CategoryChips ranked={ranked} selectedId={pets.id} onSelect={noop} onMore={noop} />
      </Specimen>
      <Specimen label="Income, nothing chosen yet">
        <CategoryChips ranked={income} selectedId={null} onSelect={noop} onMore={noop} />
      </Specimen>
      <Specimen label="Disabled while saving">
        <CategoryChips ranked={ranked} selectedId={byKey('food').id} onSelect={noop} onMore={noop} disabled />
      </Specimen>
      <Sheet visible={more} onClose={() => setMore(false)} title={tc('Choose a category')}>
        <CategoryGrid
          categories={ranked}
          selectedId={chosen}
          onSelect={(id) => {
            setChosen(id);
            setMore(false);
          }}
        />
      </Sheet>
    </>
  );
}

function CategoryGridSection() {
  const categories = useSampleCategories();
  const [expense, setExpense] = useState(categories.coffee.id);
  const [income, setIncome] = useState(categories.byKey('salary').id);
  return (
    <>
      <Specimen label="Expense: the six built-ins and three of the person's own (one without a colour)">
        <CategoryGrid categories={categories.expense} selectedId={expense} onSelect={setExpense} />
      </Specimen>
      <Specimen label="Income">
        <CategoryGrid categories={categories.income} selectedId={income} onSelect={setIncome} />
      </Specimen>
    </>
  );
}

// ---------------------------------------------------------------------------
// Wallets

function sampleWallets(samples: Samples): { cash: WalletChoice; daily: WalletChoice; all: WalletChoice[] } {
  const cash: WalletChoice = { id: 'catalogue-cash', name: samples.cash, balance_minor: SAMPLE_MINOR.cashBalance, archived: false };
  const daily: WalletChoice = { id: 'catalogue-daily', name: samples.daily, balance_minor: SAMPLE_MINOR.dailyBalance, archived: false };
  const old: WalletChoice = { id: 'catalogue-old', name: samples.oldPurse, balance_minor: '50000' as Minor, archived: true };
  return { cash, daily, all: [cash, daily, old] };
}

function WalletPickerSection() {
  const samples = useSamples();
  const { cash, all } = sampleWallets(samples);
  const [chosen, setChosen] = useState(cash.id);
  return (
    <>
      <Specimen label="One wallet, with exact balances (tap to choose)">
        <WalletPicker mode="single" wallets={all} selectedId={chosen} onSelect={setChosen} />
      </Specimen>
      <Specimen label="Disabled while saving">
        <WalletPicker mode="single" wallets={all} selectedId={cash.id} onSelect={noop} disabled />
      </Specimen>
      <SpecimenLabel>{`An archived wallet (${samples.oldPurse}) is never offered.`}</SpecimenLabel>
    </>
  );
}

function WalletMoveSection() {
  const samples = useSamples();
  const { cash, daily, all } = sampleWallets(samples);
  const [from, setFrom] = useState<string | null>(cash.id);
  const [to, setTo] = useState<string | null>(daily.id);
  return (
    <>
      <Specimen label="Move: From → To, Swap and Move all (tap a side to choose)">
        <WalletPicker
          mode="move"
          wallets={all}
          fromId={from}
          toId={to}
          onChangeFrom={setFrom}
          onChangeTo={setTo}
          onSwap={() => {
            setFrom(to);
            setTo(from);
          }}
          onMoveAll={noop}
        />
      </Specimen>
      <Specimen label="The same wallet on both sides">
        <WalletPicker mode="move" wallets={all} fromId={cash.id} toId={cash.id} onChangeFrom={noop} onChangeTo={noop} onSwap={noop} onMoveAll={noop} />
      </Specimen>
    </>
  );
}

// ---------------------------------------------------------------------------
// Dates

/** The golden wallets' tracking start: the chip never steps before it. */
const TRACKING_START = '2026-09-01';

function Chip({ initial, earliest }: { initial: string; earliest?: string }) {
  const [value, setValue] = useState(initial);
  return <DateChip value={value} today={CATALOGUE_TODAY} earliest={earliest} onChange={setValue} />;
}

function DateChipSection() {
  return (
    <>
      <Specimen label="Today: it never steps past today"><Chip initial={CATALOGUE_TODAY} earliest={TRACKING_START} /></Specimen>
      <Specimen label="One day back: yesterday"><Chip initial="2026-09-28" earliest={TRACKING_START} /></Specimen>
      <Specimen label="A past date (tap the chip for the calendar)"><Chip initial="2026-09-15" earliest={TRACKING_START} /></Specimen>
      <Specimen label="Last year: Thai shows the Buddhist-era year"><Chip initial="2025-12-31" /></Specimen>
    </>
  );
}

// ---------------------------------------------------------------------------
// Note and merchant

function NoteFieldSection() {
  const tc = useCopy();
  const samples = useSamples();
  const [note, setNote] = useState('');
  const [merchant, setMerchant] = useState(samples.merchant);
  const tooLong = Array.from({ length: 12 }, () => samples.merchant).join(' ');
  return (
    <>
      <Specimen label="Note, empty"><NoteField kind="note" value={note} onChangeText={setNote} /></Specimen>
      <Specimen label="Merchant, filled"><NoteField kind="merchant" value={merchant} onChangeText={setMerchant} /></Specimen>
      <Specimen label="Merchant over 120 characters: its own rule"><NoteField kind="merchant" value={tooLong} onChangeText={noop} /></Specimen>
      <Specimen label="Note with a problem from the server">
        <NoteField kind="note" value={samples.note} onChangeText={noop} error={tc('Check this and try again.')} />
      </Specimen>
    </>
  );
}

// ---------------------------------------------------------------------------
// Rows and days

function RecordRowSection() {
  const tc = useCopy();
  const samples = useSamples();
  const { byKey, pets } = useSampleCategories();
  const look = (category: CategoryDto) => categoryLook(category, categoryName(category, tc));
  const name = (key: BuiltinCategoryKey) => categoryName(byKey(key), tc);
  return (
    <>
      <Specimen label="Confirmed (long-press it for Edit, Copy and Delete), saving, checking, needs a look">
        <View>
          <RecordRow title={name('food')} detail={samples.cash} type="expense" amountMinor={SAMPLE_MINOR.coffee} category={look(byKey('food'))} onPress={noop} onEdit={noop} onCopy={noop} onDelete={noop} />
          <RecordRow title={name('food')} detail={samples.cash} type="expense" amountMinor={SAMPLE_MINOR.lunch} category={look(byKey('food'))} state="saving" onPress={noop} />
          <RecordRow title={name('travel')} detail={samples.cash} type="expense" amountMinor={'4000' as Minor} category={look(byKey('travel'))} state="checking" onPress={noop} />
          <RecordRow title={name('shopping')} detail={`${samples.daily} · ${samples.note}`} type="expense" amountMinor={'999' as Minor} category={look(byKey('shopping'))} state="needs_look" onPress={noop} />
        </View>
      </Specimen>
      <Specimen label="Income, a move, and a category of the person's own">
        <View>
          <RecordRow title={name('salary')} detail={`${samples.daily} · ${samples.salary}`} type="income" amountMinor={SAMPLE_MINOR.salary} category={look(byKey('salary'))} onPress={noop} />
          <RecordRow title={tc('Transfer')} detail={`${samples.cash} → ${samples.daily}`} type="transfer" amountMinor={SAMPLE_MINOR.move} onPress={noop} />
          <RecordRow title={pets.label ?? ''} detail={samples.cash} type="expense" amountMinor={'35000' as Minor} category={look(pets)} onPress={noop} />
        </View>
      </Specimen>
    </>
  );
}

function DayHeaderSection() {
  const { coffee, lunch, rent, salary } = SAMPLE_MINOR;
  const today = (BigInt(coffee) + BigInt(lunch)).toString() as Minor;
  const none = '0' as Minor;
  return (
    <>
      <Specimen label="Today: money out only"><DayHeader date={CATALOGUE_TODAY} today={CATALOGUE_TODAY} outMinor={today} inMinor={none} /></Specimen>
      <Specimen label="Yesterday: out and in, kept apart"><DayHeader date="2026-09-28" today={CATALOGUE_TODAY} outMinor={rent} inMinor={salary} /></Specimen>
      <Specimen label="A past date: money in only"><DayHeader date="2026-09-25" today={CATALOGUE_TODAY} outMinor={none} inMinor={salary} /></Specimen>
      <Specimen label="Last year: Thai shows the Buddhist-era year"><DayHeader date="2025-12-31" today={CATALOGUE_TODAY} outMinor={coffee} inMinor={none} /></Specimen>
      <Specimen label="Nothing confirmed yet (only drafts that day)"><DayHeader date="2026-09-20" today={CATALOGUE_TODAY} outMinor={none} inMinor={none} /></Specimen>
    </>
  );
}

// ---------------------------------------------------------------------------
// Budget: real budgetPace() output through the kit's adapter

/** Mid-month, so every state can happen: the 21st of September, ten days to go (counting today). */
const BUDGET_DAY = '2026-09-21';
const BUDGET_MONTH = '2026-09';

/** The month's pace as `budgetPace()` works it out, then `toKitPace`, as the screens do. */
function samplePace(spentMinor: string, limitMinor: string | null): BudgetPace {
  const summary: MonthSummary = {
    month: BUDGET_MONTH, income_minor: '0', expense_minor: spentMinor, balance_minor: (-BigInt(spentMinor)).toString(),
    by_wallet: {}, categories: [], budget: null, as_of_revision: '1',
  };
  const budget: BudgetDto | null = limitMinor === null ? null : { id: 'catalogue-budget', month: BUDGET_MONTH, overall_limit_minor: limitMinor, category_limits: [], version: 1 };
  return toKitPace(budgetPace({ budget, summary, today: BUDGET_DAY }));
}

const LIMIT = SAMPLE_MINOR.monthBudget;
/** On track: the golden month's ฿12,450.00 of ฿18,000.00. Tight: ฿14,000.00, ahead of an even pace. Over: ฿18,120.00. */
const PACES = {
  onTrack: samplePace(SAMPLE_MINOR.monthSpent, LIMIT),
  tight: samplePace('1400000', LIMIT),
  over: samplePace('1812000', LIMIT),
  none: samplePace(SAMPLE_MINOR.monthSpent, null),
} as const;

function BudgetBarSection() {
  return (
    <>
      <SpecimenLabel>budgetPace() on 21 September (10 days to go), through toKitPace.</SpecimenLabel>
      <Specimen label="On track"><BudgetBar {...PACES.onTrack} /></Specimen>
      <Specimen label="Tight: ahead of an even pace"><BudgetBar {...PACES.tight} /></Specimen>
      <Specimen label="Over"><BudgetBar {...PACES.over} /></Specimen>
      <Specimen label="No budget"><BudgetBar {...PACES.none} /></Specimen>
    </>
  );
}

function PaceRingSection({ which }: { which: 'under' | 'over' }) {
  return (
    <>
      <SpecimenLabel>budgetPace() on 21 September (10 days to go), through toKitPace.</SpecimenLabel>
      {which === 'under' ? (
        <>
          <Specimen label="On track"><PaceRing {...PACES.onTrack} /></Specimen>
          <Specimen label="Tight: ahead of an even pace"><PaceRing {...PACES.tight} /></Specimen>
        </>
      ) : (
        <>
          <Specimen label="Over"><PaceRing {...PACES.over} /></Specimen>
          <Specimen label="No budget"><PaceRing {...PACES.none} /></Specimen>
        </>
      )}
    </>
  );
}

/** The R2b kit, one section per component (or per screenful). */
export const ENTRY_SECTIONS: readonly CatalogueSection[] = [
  { id: 'keypad', title: 'Keypad', group: 'Kit', render: () => <KeypadSection /> },
  { id: 'type-switch', title: 'Type switch', group: 'Kit', render: () => <TypeSwitchSection /> },
  { id: 'category-chips', title: 'Category chips', group: 'Kit', render: () => <CategoryChipsSection /> },
  { id: 'category-grid', title: 'Category grid', group: 'Kit', render: () => <CategoryGridSection /> },
  { id: 'wallet-picker', title: 'Wallet picker: one', group: 'Kit', render: () => <WalletPickerSection /> },
  { id: 'wallet-picker-move', title: 'Wallet picker: move', group: 'Kit', render: () => <WalletMoveSection /> },
  { id: 'date-chip', title: 'Date chip', group: 'Kit', render: () => <DateChipSection /> },
  { id: 'note-field', title: 'Note field', group: 'Kit', render: () => <NoteFieldSection /> },
  { id: 'record-row', title: 'Record row', group: 'Kit', render: () => <RecordRowSection /> },
  { id: 'day-header', title: 'Day header', group: 'Kit', render: () => <DayHeaderSection /> },
  { id: 'budget-bar', title: 'Budget bar', group: 'Kit', render: () => <BudgetBarSection /> },
  { id: 'pace-ring', title: 'Pace ring: under', group: 'Kit', render: () => <PaceRingSection which="under" /> },
  { id: 'pace-ring-over', title: 'Pace ring: over, none', group: 'Kit', render: () => <PaceRingSection which="over" /> },
];
