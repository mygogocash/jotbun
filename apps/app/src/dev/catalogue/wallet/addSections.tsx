// The add tray's catalogue sections (P2-T14, development only): the amount
// step for spending (bw-tray-amount) and for income (rh-income), each inside a
// Tray with the type switch as its header (at the largest text sizes, in the
// step under the amount, R106) and the keys and Next pinned in its footer,
// starting from fixed sample props as the boards draw them. Each tray opens at
// once, so a screenshot of its section shows it over the page; the keys, the
// switch, the chips and the name field work (a chip fills the amount as a
// fill, which private mode masks until a key is pressed), the keypad's problem
// shows in today's words under the amount (as the host shows it, P2-T16), the
// name field's focus leaves Next alone in the footer, and Open the tray brings
// it back as it started. Next, the wallet chip and บอกบัน go nowhere here: the
// steps after the amount and Tell Bun's sheet are P2-T15's and P2-T16's. Their
// own list, spread after the tray's in ./index.ts. The sample words are
// catalogue samples, not app copy. A section never imports the wallet test
// harness, which loads vitest.
import { useState } from 'react';
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { keypadFromMinor } from '@mobile/ui/keypadExpression';
import type { KeypadProblem, KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_SPACE } from '@mobile/ui/layout';
import { amountProblem, filledKeypad, trayTitleKey } from '@mobile/wallet/add/addFlow';
import type { AddType } from '@mobile/wallet/add/addFlow';
import { AmountFooter, AmountStep } from '@mobile/wallet/add/AmountStep';
import { COPY } from '@mobile/wallet/add/copy';
import type { QuickChip } from '@mobile/wallet/add/QuickChips';
import { TypeSwitchHeader, useSwitchInHeader } from '@mobile/wallet/add/TypeSwitchHeader';
import type { DraftTable } from '@mobile/wallet/copy/draftText';
import { useDraftCopy } from '@mobile/wallet/copy/useDraftCopy';
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
];
