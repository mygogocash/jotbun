// The add tray's catalogue sections (P2-T14, P2-T15, P2-T16; development only).
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
// (bw-tray-confirm) typed and as Tell Bun filled it, and the category pick.
// Their host, StepsTray, is addStepsSection.tsx, loaded lazily (the
// controller's rule for sections, as recordSections.tsx loads its screen), so
// this list never loads the steps. While it loads, the section reads
// `catalogue-screen-running`, as a screen section's stage does while its
// script runs, so the catalogue's suites wait for it.
//
// P2-T16's three: the real add tray host on the catalogue's fakes, opened at
// once over a page: a save in flight (Save says กำลังบันทึก… and nothing
// closes the tray), an online save whose answer was lost (today's words and
// Try again), and the tray to capture at the largest text size by hand. Their
// stage, addHostSection.tsx, loads lazily: the host reaches Quick add's keys
// (screens/v1/parts.tsx loads expo-crypto), which no catalogue list may load.
// Each runs on a screen section's stage (its own fakes, and a script: the
// first two type 5 and 0, go on and save), drawn as a kit section beside the
// add tray's others: the tray covers the page, and its title names the dialog.
//
// Their own list, spread after the tray's in ./index.ts. The sample words are
// catalogue samples, not app copy. A section never imports the wallet test
// harness, which loads vitest.
import { lazy, Suspense, useState } from 'react';
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
import { goldenFake } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep } from '../screenSection';
import type { StepStart } from './addStepsSection';

const StepsTray = lazy(() => import('./addStepsSection'));
const HostTray = lazy(() => import('./addHostSection'));

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

/** One of P2-T15's sections: its steps load lazily, and until they do the section reads `catalogue-screen-running`. */
function stepsSection(label: string, start: StepStart) {
  return (
    <Suspense fallback={<View testID="catalogue-screen-running" style={{ flex: 1 }} />}>
      <StepsTray label={label} start={start} />
    </Suspense>
  );
}

/** The amount step is drawn: the host has opened the tray on its lists. */
const OPENED: ScriptStep = { waitFor: 'add-next' };
const tap = (testID: string): ScriptStep => ({ call: 'onPress', on: { testID } });
/** ฿50 typed, on to confirm, then Save. */
const SAVE_50: readonly ScriptStep[] = [OPENED, { press: '5' }, { press: '0' }, tap('add-next'), { waitFor: 'add-save' }, tap('add-save')];

/** Online, with no diary, on the golden fakes; `prepare` holds or fails the save. */
function online(prepare: (fake: ReturnType<typeof goldenFake>) => void = () => undefined): ScreenFixture {
  const fake = goldenFake();
  prepare(fake);
  return { resources: fake.resources, diary: null };
}

/** One of P2-T16's sections: the real host, opened at once (it loads lazily), on a screen section's stage, as a kit section. */
function hostSection(spec: { id: string; title: string; label: string; fixture: () => ScreenFixture; script: readonly ScriptStep[] }): CatalogueSection {
  const { render } = screenSection({
    id: spec.id,
    title: spec.title,
    fixture: spec.fixture,
    script: () => spec.script,
    render: () => (
      <Suspense fallback={null}>
        <HostTray label={spec.label} />
      </Suspense>
    ),
  });
  return { id: spec.id, title: spec.title, group: 'Kit', render };
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
    render: () => stepsSection(
      "Move: ฿500 from the main account to cash, each card's balance after the move, swap and move all, over the note and Next",
      { step: 'transfer', type: 'transfer', amountMinor: '50000', filled: false, merchant: '', bunSaid: false, guessed: [] },
    ),
  },
  {
    id: 'bw-tray-confirm',
    title: 'Bun Wallet: add tray, confirm',
    group: 'Kit',
    render: () => stepsSection(
      'Confirm: ฿50 of food from the main account today, each row opening its pick (Save goes nowhere here)',
      { step: 'confirm', type: 'expense', amountMinor: '5000', filled: false, merchant: '', bunSaid: false, guessed: [] },
    ),
  },
  {
    id: 'bw-tray-confirm-bun',
    title: "Bun Wallet: add tray, confirm with Bun's reading",
    group: 'Kit',
    render: () => stepsSection(
      "Confirm as Tell Bun filled it: what Bun read, ฿50 as Bun's fill, and the category marked as Bun's guess",
      { step: 'confirm', type: 'expense', amountMinor: '5000', filled: true, merchant: 'sample.chickenRice', bunSaid: true, guessed: ['category'] },
    ),
  },
  {
    id: 'bw-tray-pick-category',
    title: 'Bun Wallet: add tray, choose a category',
    group: 'Kit',
    render: () => stepsSection(
      "The category pick: spending's categories in ranked order, food chosen; a tap goes back to confirm with the choice",
      { step: 'category', type: 'expense', amountMinor: '5000', filled: false, merchant: '', bunSaid: false, guessed: [] },
    ),
  },
  hostSection({
    id: 'bw-tray-saving',
    title: 'Bun Wallet: add tray, saving',
    label: 'Saving ฿50 online while Jotbun has not answered: Save says it is saving, and nothing closes the tray',
    // Jotbun never answers, so the save stays in flight.
    fixture: () => online((fake) => { fake.hold('createTransaction'); }),
    script: SAVE_50,
  }),
  hostSection({
    id: 'bw-tray-unconfirmed',
    title: 'Bun Wallet: add tray, not confirmed',
    label: "An online save whose answer was lost: today's words and Try again, which resends the same entry; the tray can be closed",
    fixture: () => online((fake) => { fake.fail('createTransaction', 'network'); }),
    script: [...SAVE_50, { waitFor: 'add-try-again' }],
  }),
  hostSection({
    id: 'bw-tray-add-large',
    title: 'Bun Wallet: add tray, largest text',
    label: 'Capture at AX5: the add tray fills the screen, its title pinned and the type switch under the amount',
    fixture: () => online(),
    script: [OPENED],
  }),
];
