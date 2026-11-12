// The add tray's catalogue sections (P2-T14, P2-T15; development only).
//
// P2-T14's two: the amount step for spending (bw-tray-amount) and for income
// (rh-income), each inside a Tray with the type switch as its header (at the
// largest text sizes, in the step under the amount, R106) and the keys and
// Next pinned in its footer, starting from fixed sample props as the boards
// draw them. Each tray opens at once, so a screenshot of its section shows it
// over the page; the keys, the switch, the chips and the name field work (a
// chip fills the amount as a fill, which private mode masks until a key is
// pressed), the keypad's problem shows in today's words under the amount (as
// the host shows it, P2-T16), the name field's focus leaves Next alone in the
// footer, and Open the tray brings it back as it started. Next, the wallet
// chip and บอกบัน go nowhere here: the steps after the amount and Tell Bun's
// sheet are P2-T15's and P2-T16's.
//
// P2-T15's four: the transfer step (rh-transfer's numbers), the confirm step
// (bw-tray-confirm) typed and as Tell Bun filled it, and the category pick,
// each in a Tray that opens at once at its step. The steps move as a host
// moves them: Next goes from the transfer step to confirm, a row opens its
// pick, a card opens its wallet pick, and a pick goes back to the step that
// opened it, with the choice, or with nothing changed by the tray's back. A
// change undoes Bun's guess on that row (stillGuessed). Save goes nowhere
// here, and there is no back to the amount: saving and the amount step's place
// in the flow are the host's (P2-T16).
//
// Their own list, spread after the tray's in ./index.ts. The sample words are
// catalogue samples, not app copy. A section never imports the wallet test
// harness, which loads vitest.
import { BUILTIN_CATEGORIES } from '@gogospend/contracts';
import type { CategoryDto, Minor, WalletSnapshot } from '@gogospend/contracts';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import { rankRecentCategories } from '@mobile/spend/v1/redesign/recentCategories';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { keypadFromMinor } from '@mobile/ui/keypadExpression';
import type { KeypadProblem, KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_SPACE } from '@mobile/ui/layout';
import { amountProblem, confirmRows, filledKeypad, stillGuessed, trayTitleKey } from '@mobile/wallet/add/addFlow';
import type { AddStep, AddType, StepProps } from '@mobile/wallet/add/addFlow';
import { AmountFooter, AmountStep } from '@mobile/wallet/add/AmountStep';
import { ConfirmStep, confirmTitle } from '@mobile/wallet/add/ConfirmStep';
import { COPY } from '@mobile/wallet/add/copy';
import { CategoryPick, DatePick, isPickStep, NotePick, WalletPick } from '@mobile/wallet/add/PickSteps';
import type { QuickChip } from '@mobile/wallet/add/QuickChips';
import { TransferFooter, TransferStep } from '@mobile/wallet/add/TransferStep';
import { TypeSwitchHeader, useSwitchInHeader } from '@mobile/wallet/add/TypeSwitchHeader';
import { COMMON_COPY } from '@mobile/wallet/common/copy';
import type { DraftTable } from '@mobile/wallet/copy/draftText';
import { useDraftCopy } from '@mobile/wallet/copy/useDraftCopy';
import { PrimaryButton } from '@mobile/wallet/tray/PrimaryButton';
import { TextLink } from '@mobile/wallet/tray/TextLink';
import { Tray } from '@mobile/wallet/tray/Tray';
import { SpecimenLabel } from '../parts';
import type { CatalogueSection } from '../registry';

const SAMPLES = {
  ...COPY,
  'sample.open': { th: 'เปิดถาด', en: 'Open the tray' },
  'sample.wallet': { th: 'บัญชีหลัก', en: 'Main account' },
  'sample.salary': { th: 'เงินเดือน', en: 'Salary' },
  'sample.coffee': { th: 'กาแฟเย็น', en: 'Iced coffee' },
  'sample.ride': { th: 'วิน', en: 'Motorbike taxi' },
  'sample.train': { th: 'BTS', en: 'BTS' },
} as const satisfies DraftTable;

/**
 * Today's words for the two problems this keypad can meet (a fill starts over
 * at the first key, so no key is refused as too precise), read through tc as
 * the host reads KEYPAD_PROBLEM_TEXT (screens/redesign/entry/entryHelpers.ts,
 * P2-T16). That module loads the device's id maker (expo-crypto), which no
 * catalogue list may load: every test that reads the wallet's list would.
 */
const PROBLEM_WORDS: Partial<Readonly<Record<KeypadProblem, string>>> = {
  zero: 'Enter an amount above zero',
  too_large: 'Amounts go up to ฿999,999,999.99',
};

/** The sample wallet; its id derives the boards' lavender silk. */
const WALLET_ID = 'bw-add-main-account';

type Start = { type: AddType; amountMinor: string; named: boolean; chips: boolean; tellBun: boolean };

function firstDraft(type: AddType, merchant: string): QuickAddDraft {
  return {
    mode: 'create', recordId: 'bw-add-record', commandId: 'bw-add-command', type, amountMinor: '', occurredOn: '2026-10-24',
    walletId: WALLET_ID, categoryByType: { expense: null, income: null }, fromWalletId: WALLET_ID, toWalletId: null, note: '', merchant,
  };
}

/** The amount step in a tray that opens at once, on the board's sample props; closed and opened again, it starts over. */
function AmountTray({ label, start }: { label: string; start: Start }) {
  const t = useDraftCopy(SAMPLES);
  const tc = useCopy();
  const begin = () => firstDraft(start.type, start.named ? t('sample.salary') : '');
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(begin);
  const [keypad, setKeypad] = useState<KeypadState>(() => keypadFromMinor(start.amountMinor));
  const [naming, setNaming] = useState(false);
  const inHeader = useSwitchInHeader();
  const lookups: Lookups = { wallets: new Map([[WALLET_ID, { id: WALLET_ID, name: t('sample.wallet') }]]), categories: new Map() };
  const fill = (minor: string) => () => setKeypad(filledKeypad(minor));
  const chips: QuickChip[] = start.chips
    ? [
      { label: t('sample.coffee'), amountMinor: '6500', apply: fill('6500') },
      { label: t('sample.ride'), amountMinor: '2000', apply: fill('2000') },
      { label: t('sample.train'), amountMinor: '4700', apply: fill('4700') },
    ]
    : [];
  const problem = amountProblem(keypad);
  const problemWords = problem === null ? undefined : PROBLEM_WORDS[problem];
  const step = { draft, keypad, onDraft: setDraft, onKeypad: setKeypad, onStep: () => undefined };
  const typeSwitch = <TypeSwitchHeader type={draft.type} onType={(type) => setDraft((now) => ({ ...now, type }))} />;
  return (
    <View style={{ gap: BUN_SPACE.xs, alignItems: 'flex-start' }}>
      <SpecimenLabel>{label}</SpecimenLabel>
      <TextLink label={t('sample.open')} onPress={() => setOpen(true)} />
      <Tray
        visible={open}
        onClose={() => setOpen(false)}
        onClosed={() => {
          setDraft(begin());
          setKeypad(keypadFromMinor(start.amountMinor));
        }}
        title={t(trayTitleKey(draft.type))}
        header={inHeader ? typeSwitch : undefined}
        footer={<AmountFooter {...step} type={draft.type} naming={naming} />}
      >
        <AmountStep
          {...step}
          type={draft.type}
          lookups={lookups}
          chips={chips}
          canTellBun={start.tellBun}
          onTellBun={() => undefined}
          problem={problemWords === undefined ? null : tc(problemWords)}
          typeSwitch={inHeader ? null : typeSwitch}
          onNaming={setNaming}
        />
      </Tray>
    </View>
  );
}

// ---------------------------------------------------------------------------
// P2-T15: the transfer, confirm and pick steps

const STEP_SAMPLES = {
  ...COMMON_COPY,
  ...SAMPLES,
  'sample.cash': { th: 'เงินสด', en: 'Cash' },
  'sample.savings': { th: 'บัญชีออม', en: 'Savings' },
  'sample.chickenRice': { th: 'ข้าวมันไก่', en: 'Chicken rice' },
  'sample.bunSaid': { th: 'ข้าวมันไก่ 50', en: 'chicken rice 50' },
} as const satisfies DraftTable;

/** The boards' day, so every capture reads the same. */
const SAMPLE_TODAY = '2026-10-24';
/** The sample wallets: the main account (lavender silk), cash (cream paper, rh-transfer's) and savings (peach). */
const CASH_ID = 'bw-add-cash-wallet';
const SAVINGS_ID = 'bw-add-savings-wallet';
/** rh-transfer's balances: ฿24,860 and ฿1,240; savings ฿120,000. */
const SAMPLE_BALANCES: ReadonlyMap<string, Minor> = new Map([[WALLET_ID, '2486000'], [CASH_ID, '124000'], [SAVINGS_ID, '12000000']]);

/** The built-in categories, as a new account has them. */
const SAMPLE_CATEGORIES: readonly CategoryDto[] = BUILTIN_CATEGORIES.map((category) => ({
  id: `bw-add-category-${category.key}`, type: category.type, builtin_key: category.key, label: null, color: category.color, archived: false, version: 1,
}));

/** No records yet, so each type's ranking is the built-in order (P2-T5's rank, without the module that loads expo-crypto). */
const SAMPLE_RANKING = {
  expense: rankRecentCategories({ type: 'expense', categories: SAMPLE_CATEGORIES, records: [], today: SAMPLE_TODAY }),
  income: rankRecentCategories({ type: 'income', categories: SAMPLE_CATEGORIES, records: [], today: SAMPLE_TODAY }),
};

type StepStart = {
  step: 'transfer' | 'confirm' | 'category';
  type: AddType;
  amountMinor: string;
  /** Bun filled the amount: a fill, which private mode masks. */
  filled: boolean;
  merchant: string;
  /** Tell Bun filled the entry from this sample line. */
  bunSaid: boolean;
  guessed: readonly string[];
};

function stepDraft(start: StepStart, merchant: string): QuickAddDraft {
  return {
    mode: 'create', recordId: 'bw-add-record', commandId: 'bw-add-command', type: start.type, amountMinor: '', occurredOn: SAMPLE_TODAY,
    walletId: WALLET_ID, categoryByType: { expense: 'bw-add-category-food', income: 'bw-add-category-salary' },
    fromWalletId: WALLET_ID, toWalletId: CASH_ID, note: '', merchant,
  };
}

/** The later tracking start of the entry's wallets: no earlier day can be saved (as entryHelpers' earliestFor). */
function earliestOf(draft: QuickAddDraft, wallets: readonly WalletSnapshot[]): string | undefined {
  const ids = draft.type === 'transfer' ? [draft.fromWalletId, draft.toWalletId] : [draft.walletId];
  const starts = wallets.filter((wallet) => ids.includes(wallet.id)).map((wallet) => wallet.tracking_start).sort();
  return starts.at(-1);
}

/** The transfer, confirm and pick steps in a tray that opens at once at its step, moving as a host moves them; closed and opened again, it starts over. */
function StepsTray({ label, start }: { label: string; start: StepStart }) {
  const t = useDraftCopy(STEP_SAMPLES);
  const tc = useCopy();
  const locale = useActiveLocale();
  const wallets = useMemo(() => [
    [WALLET_ID, t('sample.wallet')],
    [CASH_ID, t('sample.cash')],
    [SAVINGS_ID, t('sample.savings')],
  ].map(([id, name]): WalletSnapshot => ({ id, name, currency: 'THB', opening_minor: '0', tracking_start: '2026-10-01', archived: false, version: 1 })), [t]);
  const lookups: Lookups = {
    wallets: new Map(wallets.map((wallet) => [wallet.id, { id: wallet.id, name: wallet.name }])),
    categories: new Map(SAMPLE_CATEGORIES.map((category) => [category.id, category])),
  };
  const keypadOf = () => (start.filled ? filledKeypad(start.amountMinor) : keypadFromMinor(start.amountMinor));
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(() => stepDraft(start, start.merchant === '' ? '' : t(start.merchant)));
  const [keypad, setKeypad] = useState<KeypadState>(keypadOf);
  const [step, setStep] = useState<AddStep>(start.step);
  const [back, setBack] = useState<AddStep>('confirm');
  const [guessed, setGuessed] = useState<ReadonlySet<string>>(() => new Set(start.guessed));
  const reset = () => {
    setDraft(stepDraft(start, start.merchant === '' ? '' : t(start.merchant)));
    setKeypad(keypadOf());
    setStep(start.step);
    setBack('confirm');
    setGuessed(new Set(start.guessed));
  };
  const props: StepProps = {
    draft,
    keypad,
    onDraft: (next) => {
      setGuessed((now) => stillGuessed(now, draft, next));
      setDraft(next);
    },
    onKeypad: setKeypad,
    onStep: (next) => {
      if (isPickStep(next)) setBack(step);
      setStep(next);
    },
  };
  const rows = confirmRows(draft, { lookups, today: SAMPLE_TODAY, dateLocale: locale, guessed, tc });
  let middle: ReactNode = null;
  let footer: ReactNode;
  if (step === 'transfer') {
    middle = <TransferStep {...props} wallets={wallets} balances={SAMPLE_BALANCES} />;
    footer = <TransferFooter {...props} />;
  } else if (step === 'confirm') {
    middle = <ConfirmStep {...props} rows={rows} title={confirmTitle(draft, rows, t)} bunSentence={start.bunSaid ? t('sample.bunSaid') : null} type={draft.type} lookups={lookups} />;
    footer = <PrimaryButton label={t('common.save')} onPress={() => undefined} />;
  } else if (step === 'category') {
    middle = <CategoryPick {...props} categories={SAMPLE_CATEGORIES} ranking={SAMPLE_RANKING} />;
  } else if (step === 'wallet' || step === 'from' || step === 'to') {
    middle = <WalletPick {...props} wallets={wallets} balances={SAMPLE_BALANCES} role={step} back={back} />;
  } else if (step === 'date') {
    middle = <DatePick {...props} today={SAMPLE_TODAY} earliest={earliestOf(draft, wallets)} />;
  } else if (step === 'note') {
    middle = <NotePick {...props} />;
  }
  return (
    <View style={{ gap: BUN_SPACE.xs, alignItems: 'flex-start' }}>
      <SpecimenLabel>{label}</SpecimenLabel>
      <TextLink label={t('sample.open')} onPress={() => setOpen(true)} />
      <Tray
        visible={open}
        onClose={() => setOpen(false)}
        onClosed={reset}
        title={t(trayTitleKey(draft.type))}
        step={step}
        onBack={isPickStep(step) ? () => setStep(back) : undefined}
        footer={footer}
      >
        {middle}
      </Tray>
    </View>
  );
}

export const WALLET_ADD_SECTIONS: readonly CatalogueSection[] = [
  {
    id: 'bw-tray-amount',
    title: 'Bun Wallet: add tray, amount',
    group: 'Kit',
    render: () => (
      <AmountTray
        label="Spending: ฿50 typed, the wallet it comes from, Tell Bun and three quick chips, over the keypad and Next (capture AX5 by hand)"
        start={{ type: 'expense', amountMinor: '5000', named: false, chips: true, tellBun: true }}
      />
    ),
  },
  {
    id: 'bw-tray-income',
    title: 'Bun Wallet: add tray, income',
    group: 'Kit',
    render: () => (
      <AmountTray
        label="Income: ฿35,000 into the wallet, its name, and that income is not counted in the budget"
        start={{ type: 'income', amountMinor: '3500000', named: true, chips: false, tellBun: false }}
      />
    ),
  },
  {
    id: 'bw-tray-transfer',
    title: 'Bun Wallet: add tray, transfer',
    group: 'Kit',
    render: () => (
      <StepsTray
        label="Move: ฿500 from the main account to cash, each card's balance after the move, swap and move all, over the note and Next"
        start={{ step: 'transfer', type: 'transfer', amountMinor: '50000', filled: false, merchant: '', bunSaid: false, guessed: [] }}
      />
    ),
  },
  {
    id: 'bw-tray-confirm',
    title: 'Bun Wallet: add tray, confirm',
    group: 'Kit',
    render: () => (
      <StepsTray
        label="Confirm: ฿50 of food from the main account today, each row opening its pick (Save goes nowhere here)"
        start={{ step: 'confirm', type: 'expense', amountMinor: '5000', filled: false, merchant: '', bunSaid: false, guessed: [] }}
      />
    ),
  },
  {
    id: 'bw-tray-confirm-bun',
    title: "Bun Wallet: add tray, confirm with Bun's reading",
    group: 'Kit',
    render: () => (
      <StepsTray
        label="Confirm as Tell Bun filled it: what Bun read, ฿50 as Bun's fill, and the category marked as Bun's guess"
        start={{ step: 'confirm', type: 'expense', amountMinor: '5000', filled: true, merchant: 'sample.chickenRice', bunSaid: true, guessed: ['category'] }}
      />
    ),
  },
  {
    id: 'bw-tray-pick-category',
    title: 'Bun Wallet: add tray, choose a category',
    group: 'Kit',
    render: () => (
      <StepsTray
        label="The category pick: spending's categories in ranked order, food chosen; a tap goes back to confirm with the choice"
        start={{ step: 'category', type: 'expense', amountMinor: '5000', filled: false, merchant: '', bunSaid: false, guessed: [] }}
      />
    ),
  },
];
