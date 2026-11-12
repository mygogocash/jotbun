// The Bun Wallet's add tray host (P2-T16; W14, W17, W27, R61, R69; bw-tray-amount,
// rh-income, rh-transfer, bw-tray-confirm; Review Focus 1 and 2). One tray serves
// spending, income and money moved between the person's own wallets, on Quick
// add's own rules (P2-T5's hooks), never a fork of them.
//
// - Opening (`useAddTray().open`) is the rule that starts an entry: one tray,
//   the draft from firstDraft with the request's type and wallet (a copy is as
//   Quick add copies it), the time it opened, and one record_started (R61:
//   1D-T7 gives the start to this rule). While `blocked` (C5) it does
//   nothing. Outside a host it pushes today's Quick add.
// - The steps go amount, then confirm; a transfer goes amount, transfer,
//   confirm. Confirm's rows open the picks, and a pick goes back to the step
//   that opened it. The tray's back goes from the transfer and confirm steps
//   to the amount, and from a pick to its opener. A new type keeps the amount
//   step; elsewhere it goes on to the type's next step after the amount, so a
//   change to transfer always goes to the transfer step (the P2-T14 reviews).
//   At the largest text sizes the type is chosen on the amount step only: the
//   pinned header is the tray's title there (R106).
// - Each entry's draft, keypad, step and save live here, above the tray: the
//   lock cover unmounts the tray's content, never what it holds (R63). Until
//   the first touch the default category follows the recent-use read, as in
//   Quick add; after it nothing moves.
// - Tell Bun: บอกบัน opens today's TellBunSheet unchanged, inside the tray's
//   content, so iOS presents it from the tray's window (R69). Its draft fills
//   the entry through applyDraft, its amount as a fill (R106), and the rows it
//   filled are Bun's guesses (บันเดา) until the person changes them. The sheet
//   hands back no sentence, so confirm quotes none (P3-T18's step does). The
//   amount step's quick chips are the type's often-logged entries, named by
//   their place only (R106), so the sheet offers none of its own.
// - Saving is useEntrySave's save with the track (W27): Tell Bun's source while
//   any of its guesses stand, the category's analytics key and when the tray
//   opened. This file sends no record_saved (R61: 1D-T7's call in finish reads
//   the track). While a save is in flight nothing closes the tray (Review
//   Focus 1); when it lands the host is told, with the lookups and whether it
//   stayed on the phone unsynced, and the tray closes. An unconfirmed online
//   save keeps today's frozen Try again, which resends the same command; a
//   conflict says today's words with Done; either can be closed. A refused save
//   says why above Save in today's words.
// - One tray at a time (R69): whenClosed runs once the tray's Modal has hidden
//   (onClosed), or at once with no tray; an open asked while a tray leaves
//   waits for it. On iOS onClosed can come twice for two hides, and a second
//   call finds nothing queued. It does not come at all for a Modal that never
//   presented (the tray-hardening review's R-f): the entry then stays, hidden,
//   and an open waits for it, which a device check is to settle.
import type { AiDraft, CategoryDto, WalletSnapshot } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { trackRecordStarted } from '@mobile/analytics/events';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { TellBunSheet } from '@mobile/screens/redesign/ai/TellBunSheet';
import { earliestFor, firstDraft, KEYPAD_PROBLEM_TEXT, rank, withDefaults } from '@mobile/screens/redesign/entry/entryHelpers';
import type { CopySource, Ranking } from '@mobile/screens/redesign/entry/entryHelpers';
import { useEntryReferences } from '@mobile/screens/redesign/entry/entryReferences';
import type { EntryReferences } from '@mobile/screens/redesign/entry/entryReferences';
import { useEntrySave } from '@mobile/screens/redesign/entry/entrySave';
import type { SavedEntry } from '@mobile/screens/redesign/entry/entrySave';
import { oftenLogged } from '@mobile/spend/v1/ai/oftenLogged';
import { applyDraft } from '@mobile/spend/v1/ai/tellBun';
import { analyticsCategoryKey } from '@mobile/spend/v1/redesign/planning/thaiPack';
import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { useAnnouncement } from '@mobile/ui/a11y';
import { EMPTY_KEYPAD } from '@mobile/ui/keypadExpression';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { PrimaryButton } from '../tray/PrimaryButton';
import { TextLink } from '../tray/TextLink';
import { Tray } from '../tray/Tray';
import { WalletText } from '../WalletText';
import { amountProblem, confirmRows, filledKeypad, stepAfterAmount, stillGuessed, trayTitleKey } from './addFlow';
import type { AddStep, AddType, StepProps } from './addFlow';
import { AmountFooter, AmountStep, useCanTellBun } from './AmountStep';
import { ConfirmStep, confirmTitle } from './ConfirmStep';
import { COPY } from './copy';
import { CategoryPick, DatePick, isPickStep, NotePick, WalletPick } from './PickSteps';
import type { QuickChip } from './QuickChips';
import { TransferFooter, TransferStep } from './TransferStep';
import { TypeSwitchHeader, useSwitchInHeader } from './TypeSwitchHeader';

export type AddRequest = { type?: AddType; walletId?: string; copyOf?: string };
export type SavedContext = { lookups: Lookups; offline: boolean };
export type AddTray = { open(request?: AddRequest): void; close(): void; isOpen: boolean; blocked: boolean; whenClosed(run: () => void): void };

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** One opening of the tray: its request and when it opened (the track's openedAt). */
type Entry = { key: number; request: AddRequest; openedAt: number };
type Ready = Extract<EntryReferences, { state: 'ready' }>;

const AddTrayContext = createContext<AddTray | null>(null);

const NONE: ReadonlySet<string> = new Set();
const NO_WALLETS: readonly WalletSnapshot[] = [];
const NO_CATEGORIES: readonly CategoryDto[] = [];

/** Outside a host: today's Quick add, with what the request names as its params. */
function quickAddParams(request: AddRequest): Record<string, string> {
  return Object.fromEntries(Object.entries(request).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

export function useAddTray(): AddTray {
  const host = useContext(AddTrayContext);
  const router = useRouter();
  const outside = useMemo<AddTray>(() => ({
    open: (request = {}) => router.push({ pathname: '/spend/add', params: quickAddParams(request) }),
    close: () => undefined,
    isOpen: false,
    blocked: false,
    whenClosed: (run) => run(),
  }), [router]);
  return host ?? outside;
}

/** record_started's properties (R61): the type the tray opens on; a copy's type is not known until it loads. */
function startOf(request: AddRequest): { kind?: AddType; source: 'typed' } {
  const kind = request.type ?? (request.copyOf === undefined ? 'expense' : undefined);
  return kind === undefined ? { source: 'typed' } : { kind, source: 'typed' };
}

export function AddTrayHost({ children, onSaved, blocked = false }: {
  children: ReactNode;
  onSaved?: (saved: SavedEntry, context: SavedContext) => void;
  blocked?: boolean;
}) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [visible, setVisible] = useState(false);
  // What open, close and whenClosed read: the latest, also from a run queued before a render.
  const now = useRef({ entry: null as Entry | null, visible: false, blocked, saving: false });
  useEffect(() => {
    now.current.blocked = blocked;
  }, [blocked]);
  const queue = useRef<(() => void)[]>([]);
  const keys = useRef(0);
  const show = (next: Entry | null, shown: boolean) => {
    now.current.entry = next;
    now.current.visible = shown;
    setEntry(next);
    setVisible(shown);
  };
  const value = useMemo<AddTray>(() => {
    const whenClosed = (run: () => void) => {
      if (now.current.entry === null) run();
      else queue.current.push(run);
    };
    const open = (request: AddRequest = {}) => {
      if (now.current.blocked) return;
      if (now.current.entry !== null) {
        // A tray that is leaving: the next one opens once its Modal has gone (R69). An open one stays as it is.
        if (!now.current.visible) whenClosed(() => open(request));
        return;
      }
      keys.current += 1;
      show({ key: keys.current, request, openedAt: Date.now() }, true);
      trackRecordStarted(startOf(request));
    };
    const close = () => {
      // A save in flight is never dismissed (Review Focus 1).
      if (now.current.saving) return;
      show(now.current.entry, false);
    };
    return { open, close, whenClosed, isOpen: visible, blocked };
  }, [visible, blocked]);
  const saving = useCallback((inFlight: boolean) => {
    now.current.saving = inFlight;
  }, []);
  /** The tray's Modal has hidden: the entry goes, and what waited for it runs, once. */
  const closed = () => {
    show(null, false);
    for (const run of queue.current.splice(0)) run();
  };
  return (
    <AddTrayContext.Provider value={value}>
      {children}
      {entry === null ? null : (
        <AddEntry
          key={entry.key}
          entry={entry}
          visible={visible}
          onClose={value.close}
          onClosed={closed}
          onSaving={saving}
          onSaved={(saved, context) => {
            onSaved?.(saved, context);
            show(now.current.entry, false);
          }}
        />
      )}
    </AddTrayContext.Provider>
  );
}

/**
 * The entry's first draft (firstDraft: new, or a copy as Quick add copies it)
 * on the request's type and wallet, when it names them: the wallet spent from
 * or paid into, and the one a move leaves, its other side another wallet. A
 * wallet not listed is left out.
 */
function startDraft(ready: Ready, request: AddRequest, ranking: Ranking): QuickAddDraft {
  const draft = firstDraft(ready.source, { today: ready.today, wallets: ready.wallets, categories: ready.categories, ranking });
  const type = request.type ?? draft.type;
  const id = ready.wallets.find((wallet) => wallet.id === request.walletId)?.id;
  if (id === undefined) return { ...draft, type };
  const other = ready.wallets.find((wallet) => wallet.id !== id)?.id ?? draft.toWalletId;
  return { ...draft, type, walletId: id, fromWalletId: id, toWalletId: draft.toWalletId === id ? other : draft.toWalletId };
}

/** A copy opens with its amount as a fill, which private mode masks until a key is pressed (R106); a new entry opens empty. */
function keypadOf(source: CopySource | null): KeypadState {
  if (source === null) return EMPTY_KEYPAD;
  try {
    return filledKeypad(source.amount_minor);
  } catch {
    return EMPTY_KEYPAD;
  }
}

/** The rows a Bun draft filled: its guesses (บันเดา) until the person changes them. */
function guessedBy(draft: AiDraft): string[] {
  const filled = { category: draft.category_id, wallet: draft.wallet_id, date: draft.occurred_on, note: draft.note };
  return Object.entries(filled).filter(([, value]) => Boolean(value)).map(([key]) => key);
}

function AddEntry({ entry, visible, onClose, onClosed, onSaving, onSaved }: {
  entry: Entry;
  visible: boolean;
  onClose(): void;
  onClosed(): void;
  onSaving(inFlight: boolean): void;
  onSaved(saved: SavedEntry, context: SavedContext): void;
}) {
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  const locale = useActiveLocale();
  const diaryView = useDiaryView();
  const canTellBun = useCanTellBun();
  const inHeader = useSwitchInHeader();
  const references = useEntryReferences({ copyOf: entry.request.copyOf ?? null });
  const ready = references.state === 'ready' ? references : null;
  const today = ready?.today ?? todayInBangkok(new Date());
  const wallets = ready?.wallets ?? NO_WALLETS;
  const categories = ready?.categories ?? NO_CATEGORIES;
  const records = ready?.records;
  const drafts = ready?.drafts;
  const live = useMemo(() => (records === undefined || drafts === undefined ? null : rank(categories, records, drafts, today)), [categories, records, drafts, today]);
  const lookups = useMemo<Lookups>(() => ({
    wallets: new Map(wallets.map((wallet) => [wallet.id, { id: wallet.id, name: wallet.name }])),
    categories: new Map(categories.map((category) => [category.id, category])),
  }), [wallets, categories]);
  const often = useMemo(() => (records === undefined ? [] : oftenLogged({ records, today, wallets, categories, top: Number.POSITIVE_INFINITY })), [records, today, wallets, categories]);

  const [frozen, setFrozen] = useState<Ranking | null>(null);
  const [draft, setDraft] = useState<QuickAddDraft | null>(null);
  const [keypad, setKeypad] = useState<KeypadState>(EMPTY_KEYPAD);
  const [step, setStep] = useState<AddStep>('amount');
  const [back, setBack] = useState<AddStep>('confirm');
  const [guessed, setGuessed] = useState<ReadonlySet<string>>(NONE);
  const [naming, setNaming] = useState(false);
  const [telling, setTelling] = useState(false);
  // The entry starts once its lists are ready (a copy once it has loaded).
  if (ready !== null && live !== null && draft === null) {
    setDraft(startDraft(ready, entry.request, live));
    setKeypad(keypadOf(ready.source));
  }
  const current = draft === null || live === null ? null : frozen !== null ? draft : withDefaults(draft, live, ready?.source ?? null);

  const entrySave = useEntrySave({
    today,
    savedHaptic: 'success',
    onSaved: (saved) => onSaved(saved, { lookups, offline: saved.via === 'device' && diaryView.outcome?.status !== 'synced' }),
  });
  const { status, resendBlocked, locked } = entrySave;
  const inFlight = status === 'saving';
  useEffect(() => {
    onSaving(inFlight);
  }, [inFlight, onSaving]);
  // The save's problem in today's words: its message, else the first field the check refused.
  const problem = entrySave.message ?? Object.values(entrySave.errors)[0] ?? Object.values(entrySave.serverErrors)[0] ?? null;
  useAnnouncement(problem);

  /** The first touch fixes the category order and the draft's defaults (Quick add's rule). */
  const touch = () => {
    if (frozen !== null || live === null || current === null) return;
    setFrozen(live);
    setDraft(current);
  };
  const edit = (next: QuickAddDraft) => {
    if (current === null) return;
    touch();
    setGuessed((now) => stillGuessed(now, current, next));
    setDraft(next);
  };
  /** A draft laid over the entry (applyDraft): a quick chip's, or Bun's, whose rows become its guesses. The amount is a fill (R106). */
  const fill = (filled: AiDraft, bun: boolean) => {
    if (current === null) return;
    const applied = applyDraft(current, filled);
    edit({ ...current, ...applied.fields });
    if (bun) setGuessed((now) => new Set([...now, ...guessedBy(filled)]));
    if (applied.amountMinor !== null) setKeypad(filledKeypad(applied.amountMinor));
  };
  const goTo = (next: AddStep) => {
    if (locked) return;
    touch();
    if (isPickStep(next)) setBack(step);
    setStep(next);
  };
  /** A new type keeps the amount step; elsewhere (a pick counts as its opener) it goes on to the type's next step. */
  const changeType = (type: AddType) => {
    if (current === null) return;
    edit({ ...current, type });
    const from = isPickStep(step) ? back : step;
    setStep(from === 'amount' ? 'amount' : stepAfterAmount(type));
  };
  const save = () => {
    if (current === null) return;
    const categoryId = current.type === 'transfer' ? null : current.categoryByType[current.type];
    const category = categories.find((each) => each.id === categoryId) ?? null;
    void entrySave.save({
      draft: current,
      keypad,
      wallets,
      track: { source: guessed.size > 0 ? 'tell_bun' : 'typed', categoryKey: analyticsCategoryKey(category), openedAt: entry.openedAt },
    });
  };

  if (current === null || ready === null || live === null) {
    return (
      <Tray visible={visible} onClose={onClose} onClosed={onClosed} title={t(trayTitleKey(entry.request.type ?? 'expense'))} step="amount">
        <Waiting references={references} />
      </Tray>
    );
  }

  const props: StepProps = {
    draft: current,
    keypad,
    onDraft: edit,
    onKeypad: (next) => {
      touch();
      setKeypad(next);
    },
    onStep: goTo,
  };
  const typeSwitch = <TypeSwitchHeader type={current.type} onType={changeType} disabled={locked} />;
  const amountWords = amountProblem(keypad);
  // The type's often-logged entries, named by their place only: private mode masks the amount, never a name (R106).
  const chips: QuickChip[] = often
    .filter((item) => item.draft.type === current.type)
    .flatMap((item) => (item.draft.amount_minor === null ? [] : [{ label: item.draft.merchant ?? '', amountMinor: item.draft.amount_minor, apply: () => fill(item.draft, false) }]));
  const rows = confirmRows(current, { lookups, today, dateLocale: locale, guessed, tc });

  // Inside the tray's content, so iOS presents it from the tray's window (R69).
  const tellBun = canTellBun ? (
    <TellBunSheet
      visible={telling}
      onClose={() => setTelling(false)}
      context={{ today, wallets, categories }}
      locale={locale}
      onUse={(bunDraft) => fill(bunDraft, true)}
    />
  ) : null;

  let middle: ReactNode = null;
  let footer: ReactNode = null;
  if (step === 'amount') {
    middle = (
      <>
        <AmountStep
          {...props}
          type={current.type}
          lookups={lookups}
          chips={chips}
          canTellBun={canTellBun}
          onTellBun={() => setTelling(true)}
          problem={amountWords === null ? null : tc(KEYPAD_PROBLEM_TEXT[amountWords])}
          typeSwitch={inHeader ? null : typeSwitch}
          onNaming={setNaming}
        />
        {tellBun}
      </>
    );
    footer = <AmountFooter {...props} type={current.type} naming={naming} />;
  } else if (step === 'transfer') {
    middle = <TransferStep {...props} wallets={wallets} balances={ready.balances} />;
    footer = <TransferFooter {...props} wallets={wallets} />;
  } else if (step === 'confirm') {
    middle = <ConfirmStep {...props} rows={rows} title={confirmTitle(current, rows, t)} bunSentence={null} type={current.type} lookups={lookups} />;
    footer = (
      <View style={{ gap: 8 }}>
        {problem === null ? null : (
          <WalletText testID="add-save-problem" role="label" accessibilityRole="alert" aria-live="polite" style={{ textAlign: 'center' }}>
            {problem}
          </WalletText>
        )}
        {status === 'unconfirmed' ? (
          <PrimaryButton testID="add-try-again" label={t('common.tryAgain')} disabled={resendBlocked} onPress={save} />
        ) : status === 'conflict' ? (
          <PrimaryButton testID="add-done" label={t('common.done')} onPress={onClose} />
        ) : (
          <PrimaryButton testID="add-save" label={t('common.save')} busy={inFlight} busyLabel={t('add.saving')} disabled={status === 'blocked'} onPress={save} />
        )}
      </View>
    );
  } else if (step === 'category') {
    middle = <CategoryPick {...props} categories={categories} ranking={frozen ?? live} />;
  } else if (step === 'wallet' || step === 'from' || step === 'to') {
    middle = <WalletPick {...props} wallets={wallets} balances={ready.balances} role={step} back={back} />;
  } else if (step === 'date') {
    middle = <DatePick {...props} today={today} earliest={earliestFor(current, wallets) ?? undefined} />;
  } else {
    middle = <NotePick {...props} />;
  }

  return (
    <Tray
      visible={visible}
      onClose={onClose}
      onClosed={onClosed}
      title={t(trayTitleKey(current.type))}
      header={inHeader ? typeSwitch : undefined}
      onBack={locked || step === 'amount' ? undefined : () => setStep(isPickStep(step) ? back : 'amount')}
      step={step}
      footer={footer}
      locked={inFlight}
    >
      {middle}
    </Tray>
  );
}

/** Before the entry starts: its lists loading, a load problem with its way on, or no wallet yet, in today's words. */
function Waiting({ references }: { references: EntryReferences }) {
  const colors = useWalletColors();
  const tc = useCopy();
  const t = useDraftCopy(LINES);
  if (references.state === 'problem') {
    return (
      <View testID="add-load-problem" style={{ gap: 12 }}>
        <WalletText role="body" accessibilityRole="alert">{references.message}</WalletText>
        {references.retry === null ? null : <PrimaryButton label={t('common.tryAgain')} onPress={references.retry} />}
        {references.startBlank === null ? null : <TextLink label={tc('Start a new entry')} onPress={references.startBlank} />}
      </View>
    );
  }
  if (references.state === 'no_wallet') {
    return (
      <View testID="add-no-wallet" style={{ gap: 6 }}>
        <WalletText role="h2">{tc('No wallets yet')}</WalletText>
        <WalletText role="body" tone="quiet">{tc('Add a wallet on the home screen first.')}</WalletText>
      </View>
    );
  }
  return (
    <View testID="add-loading" style={{ alignItems: 'center', paddingVertical: 24 }}>
      <ActivityIndicator color={colors.ink} accessibilityLabel={references.state === 'loading' ? references.label : tc('Loading your wallets')} />
    </View>
  );
}
