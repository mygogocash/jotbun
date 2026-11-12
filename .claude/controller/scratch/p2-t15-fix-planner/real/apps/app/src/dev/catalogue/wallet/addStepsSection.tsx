// The add tray's transfer, confirm and pick steps in the catalogue (P2-T15,
// development only): the host of the four sections that addSections.tsx lists
// and loads lazily, so the wallet's section list never loads the steps (the
// controller's rule for sections, as recordSections.tsx loads its screen).
// Each section puts its step in a Tray that opens at once: the transfer step
// (rh-transfer's numbers), the confirm step (bw-tray-confirm) typed and as Tell
// Bun filled it, and the category pick. The steps move as a host moves them:
// Next goes from the transfer step to confirm, a row opens its pick, a card
// opens its wallet pick, and a pick goes back to the step that opened it, with
// the choice, or with nothing changed by the tray's back. A change undoes
// Bun's guess on that row (stillGuessed). Save goes nowhere here, and there is
// no back to the amount: saving and the amount step's place in the flow are
// the host's (P2-T16). The sample words are catalogue samples, not app copy. A
// section never imports the wallet test harness, which loads vitest.
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
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_SPACE } from '@mobile/ui/layout';
import { confirmRows, filledKeypad, stillGuessed, trayTitleKey } from '@mobile/wallet/add/addFlow';
import type { AddStep, AddType, StepProps } from '@mobile/wallet/add/addFlow';
import { ConfirmStep, confirmTitle } from '@mobile/wallet/add/ConfirmStep';
import { COPY } from '@mobile/wallet/add/copy';
import { CategoryPick, DatePick, isPickStep, NotePick, WalletPick } from '@mobile/wallet/add/PickSteps';
import { TransferFooter, TransferStep } from '@mobile/wallet/add/TransferStep';
import { COMMON_COPY } from '@mobile/wallet/common/copy';
import type { DraftTable } from '@mobile/wallet/copy/draftText';
import { useDraftCopy } from '@mobile/wallet/copy/useDraftCopy';
import { PrimaryButton } from '@mobile/wallet/tray/PrimaryButton';
import { TextLink } from '@mobile/wallet/tray/TextLink';
import { Tray } from '@mobile/wallet/tray/Tray';
import { SpecimenLabel } from '../parts';

const STEP_SAMPLES = {
  ...COMMON_COPY,
  ...COPY,
  'sample.open': { th: 'เปิดถาด', en: 'Open the tray' },
  'sample.wallet': { th: 'บัญชีหลัก', en: 'Main account' },
  'sample.cash': { th: 'เงินสด', en: 'Cash' },
  'sample.savings': { th: 'บัญชีออม', en: 'Savings' },
  'sample.chickenRice': { th: 'ข้าวมันไก่', en: 'Chicken rice' },
  'sample.bunSaid': { th: 'ข้าวมันไก่ 50', en: 'chicken rice 50' },
} as const satisfies DraftTable;

/** The boards' day, so every capture reads the same. */
const SAMPLE_TODAY = '2026-10-24';
/** The sample wallets: the main account (lavender silk, P2-T14's sample), cash (cream paper, rh-transfer's) and savings (peach). */
const WALLET_ID = 'bw-add-main-account';
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

export type StepStart = {
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
export default function StepsTray({ label, start }: { label: string; start: StepStart }) {
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
    footer = <TransferFooter {...props} wallets={wallets} />;
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
