// Quick add (redesign R3, plan §6.1): amount first, one-handed. Expense,
// income or a move between the user's own wallets, typed on the kit keypad
// (exact satang, never the system keyboard), the top three categories by
// recent use with "More" for the rest, a date chip, the wallet, More details
// (merchant and note) and Save.
//
// Saving is the current AddTransactionScreen's, rule for rule:
// - With a ready device diary the entry is saved on the device first, and is
//   shown as saved only once that local commit succeeds; the outbox sends it.
// - Otherwise it is sent online as one immutable command (`keys.keyFor`), and
//   shown as saved only after the server's acknowledgement.
// - An unconfirmed online save freezes the whole entry; only "Try again" is
//   offered, and it resends the very same command online, never re-queued on
//   the device, even if the diary opens meanwhile.
// - One record id per draft and one device command id per draft (the
//   quickAddModel id rules). "Add another" and Copy always take new ids.
// - A create refused because this draft's record id already exists means an
//   earlier attempt committed (`isOwnCreate`): it counts as saved.
// - The wallets and categories the form first showed stay for its whole life.
// The category order is fixed at the first touch: until then it may still
// follow the recent-use load (so a slow network never blocks the form), after
// it no chip moves under the thumb.
//
// The bun appears only in the empty state and, at full intensity, as the
// `cheer` pose in the saved moment at most once a day (quickAddCheer.ts).
import { HISTORY_MAX_LIMIT, isUuid } from '@gogospend/contracts';
import type { CategoryDto, Minor, TransactionDto, WalletDto, WalletSnapshot } from '@gogospend/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { anotherDraft, buildQuickAdd, newQuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import type { EntryType, QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import { RECENT_WINDOW_DAYS, rankRecentCategories } from '@mobile/spend/v1/redesign/recentCategories';
import type { RecentCategories } from '@mobile/spend/v1/redesign/recentCategories';
import { duplicateDraft } from '@mobile/spend/v1/redesign/recordModel';
import { WAITING_STATES, addDays, openDrafts } from '@mobile/spend/v1/redesign/shared';
import type { Translate } from '@mobile/spend/v1/redesign/shared';
import type { CreateEntryInput, CreateTransferInput } from '@mobile/spend/v1/resources';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { categoryName, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { DiaryLocked, DraftReferenceUnavailable } from '@mobile/storage/types';
import type { OutboxCommand, PendingEntry } from '@mobile/storage/types';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { useSpringPop } from '@mobile/theme/useSpringPop';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { Amount, useAmountWords } from '@mobile/ui/Amount';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { CategoryChips } from '@mobile/ui/CategoryChips';
import { CategoryGrid } from '@mobile/ui/CategoryGrid';
import { DateChip } from '@mobile/ui/DateChip';
import { EmptyState } from '@mobile/ui/EmptyState';
import { FieldError } from '@mobile/ui/FieldError';
import { Keypad } from '@mobile/ui/Keypad';
import { EMPTY_KEYPAD, applyKey, evaluateKeypad, keypadDisplay, keypadFromMinor, keypadHasOperator, settleForSave } from '@mobile/ui/keypadExpression';
import type { KeypadKey, KeypadProblem, KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { NoteField } from '@mobile/ui/NoteField';
import { PillButton } from '@mobile/ui/PillButton';
import { Sheet } from '@mobile/ui/Sheet';
import { TypeSwitch } from '@mobile/ui/TypeSwitch';
import { WalletPicker } from '@mobile/ui/WalletPicker';
import type { WalletChoice } from '@mobile/ui/WalletPicker';
import { isOwnCreate, newId, ownCreateMatches, refusedBeforeProcessing, saveProblem, useCommandKeys, useLoad } from '../v1/parts';
import { readCheerDay, writeCheerDay } from './quickAddCheer';

export type QuickAddScreenProps = {
  /** The clock, for tests; today is its Bangkok date. */
  now?: Date;
};

/**
 * `unconfirmed`: an attempt may have committed; the entry is frozen with its
 * key and only Try again resends the same command. `conflict`: Jotbun
 * already holds this draft's record with other details, so it is never shown
 * as saved, and nothing more is sent.
 */
type Status = 'editing' | 'saving' | 'unconfirmed' | 'blocked' | 'saved' | 'conflict';
type Errors = Record<string, string>;
type Loaded = { wallets: WalletDto[]; categories: CategoryDto[] };
type References = { wallets: WalletSnapshot[]; categories: CategoryDto[] };
type CopySource = TransactionDto | PendingEntry;
type Ranking = Readonly<Record<'expense' | 'income', RecentCategories>>;
type CreateInput = CreateEntryInput | CreateTransferInput;
type SavedMomentData = { draft: QuickAddDraft; via: 'device' | 'online'; cheer: boolean };

const NO_RECORDS: readonly TransactionDto[] = [];

/** What the amount line says when the keypad refuses a key or a save. */
const KEYPAD_PROBLEM_TEXT: Readonly<Record<KeypadProblem, string>> = {
  empty: 'Enter an amount',
  zero: 'Enter an amount above zero',
  too_precise: 'Use at most two decimal places',
  too_large: 'Amounts go up to ฿999,999,999.99',
  negative: "The sum can't go below zero.",
  divide_by_zero: "You can't divide by zero.",
};

/** The current form's device-save messages, word for word. */
function localSaveProblem(error: unknown, tc: Translate): string {
  if (error instanceof DiaryLocked) return tc("This device's diary is locked. Nothing was saved.");
  if (error instanceof DraftReferenceUnavailable) return tc("This wallet or category isn't on this device yet. Connect and try again. Nothing was saved.");
  return tc("Couldn't save this entry on the device. Nothing was saved.");
}

/** A record that cannot be loaded for Copy: gone, or the same problems as any load. */
function copyProblem(error: unknown, tc: Translate): { message: string; retry: boolean } {
  const outcome = error instanceof V1Error ? error.outcome : undefined;
  if (outcome === 'not_found' || outcome === 'deleted' || outcome === 'purged') return { message: tc("This entry isn't available to copy."), retry: false };
  const problem = classifyLoadProblem(error, tc);
  return { message: problem.message, retry: problem.retry };
}

export function QuickAddScreen({ now }: QuickAddScreenProps) {
  const resources = useSpendV1();
  const tc = useCopy();
  const router = useRouter();
  const diaryView = useDiaryView();
  const params = useLocalSearchParams();
  const copyOf = typeof params.copyOf === 'string' && params.copyOf !== '' ? params.copyOf : null;
  const today = todayInBangkok(now ?? new Date());
  const loaded = useLoad(async (): Promise<Loaded> => {
    const [wallets, categories] = await Promise.all([resources.wallets(), resources.ensureBuiltinCategories()]);
    return { wallets: wallets.filter((wallet) => !wallet.archived), categories: categories.filter((category) => !category.archived) };
  }, [resources]);
  // Recent use for the category order: one page of the last 60 days. Best effort; it never blocks the form.
  const recent = useLoad(
    () => resources.history({ from: addDays(today, 1 - RECENT_WINDOW_DAYS), through: today, sort: 'date_desc' }, undefined, HISTORY_MAX_LIMIT),
    [resources, today],
  );
  const copied = useLoad(async () => (copyOf !== null && isUuid(copyOf) ? resources.transaction(copyOf) : null), [resources, copyOf]);
  const [blankInstead, setBlankInstead] = useState(false);
  // Synced to the device: usable offline, and exactly what a device save accepts.
  const onDevice = diaryView.phase === 'ready' && diaryView.wallets.length > 0 && diaryView.categories.length > 0 ? { wallets: diaryView.wallets, categories: diaryView.categories } : null;
  // The form keeps the lists it first showed for its whole life.
  const [shown, setShown] = useState<References | null>(null);
  const references = shown ?? onDevice ?? (loaded.state === 'ready' ? loaded.data : null);
  useEffect(() => {
    if (!shown && references) setShown(references);
  }, [shown, references]);
  const leave = () => router.replace('/spend');
  const title = tc('Add an entry');

  if (!references && loaded.state === 'loading') return <Page title={title} onClose={leave}><Waiting label={tc('Loading your wallets')} /></Page>;
  if (!references && loaded.state === 'error') {
    const problem = classifyLoadProblem(loaded.error, tc);
    return (
      <Page title={title} onClose={leave}>
        <Problem message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: loaded.reload } : { label: tc('Home'), onPress: leave }} />
      </Page>
    );
  }
  if (!references || references.wallets.length === 0) {
    return (
      <Page title={title} onClose={leave}>
        <EmptyState art={<Bun pose="hello" size="l" />} title={tc('No wallets yet')} body={tc('Add a wallet on the home screen first.')} action={{ label: tc('Home'), onPress: leave }} />
      </Page>
    );
  }

  let source: CopySource | null = null;
  if (copyOf !== null && !blankInstead) {
    // A draft still on the device is copied from the device; anything else from the server.
    // A deleted record is not offered for copying, even through the URL.
    source = diaryView.pending.find((entry) => entry.id === copyOf) ?? (copied.state === 'ready' && !copied.data?.deleted_at ? copied.data : null);
    if (!source) {
      if (copied.state === 'loading') return <Page title={title} onClose={leave}><Waiting label={tc('Loading the entry to copy')} /></Page>;
      const problem = copied.state === 'error' ? copyProblem(copied.error, tc) : { message: tc("This entry isn't available to copy."), retry: false };
      const blank = { label: tc('Start a new entry'), onPress: () => setBlankInstead(true) };
      return (
        <Page title={title} onClose={leave}>
          <Problem message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: copied.reload } : blank} secondary={problem.retry ? blank : undefined} />
        </Page>
      );
    }
  }

  const balances = loaded.state === 'ready' ? availableBalances(loaded.data.wallets, diaryView.outbox) : null;
  return (
    <Page title={title} onClose={leave}>
      <EntryForm
        key={source ? `copy:${source.id}` : 'new'}
        wallets={references.wallets}
        categories={references.categories}
        balances={balances}
        today={today}
        records={recent.state === 'ready' ? recent.data.items : NO_RECORDS}
        drafts={diaryView.pending}
        source={source}
        onDone={leave}
        onAnother={loaded.refresh}
      />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// The form

type EntryFormProps = {
  wallets: readonly WalletSnapshot[];
  categories: readonly CategoryDto[];
  /** Each wallet's balance less waiting drafts, when the server's list loaded; offline there is none. */
  balances: ReadonlyMap<string, Minor> | null;
  today: string;
  records: readonly TransactionDto[];
  drafts: readonly PendingEntry[];
  source: CopySource | null;
  onDone: () => void;
  /** Add another: the balances are read again in place, so move all is never stale after an online save. */
  onAnother?: () => void;
};

function rank(categories: readonly CategoryDto[], records: readonly TransactionDto[], drafts: readonly PendingEntry[], today: string): Ranking {
  return {
    expense: rankRecentCategories({ type: 'expense', categories, records, drafts, today }),
    income: rankRecentCategories({ type: 'income', categories, records, drafts, today }),
  };
}

const ordered = (ranked: RecentCategories): CategoryDto[] => [...ranked.top, ...ranked.rest];

/** The draft the form opens with: a new one, or a copy whose other modes get the usual defaults. */
function firstDraft(source: CopySource | null, context: { today: string; wallets: readonly WalletSnapshot[]; categories: readonly CategoryDto[]; ranking: Ranking }): QuickAddDraft {
  const { today, wallets, categories, ranking } = context;
  const byRank = [...ordered(ranking.expense), ...ordered(ranking.income)];
  if (!source) return newQuickAddDraft({ ids: { recordId: newId(), commandId: newId() }, today, wallets, categories: byRank });
  const copy = duplicateDraft(source, { newId, today, wallets, categories });
  const blank = newQuickAddDraft({ ids: { recordId: copy.recordId, commandId: copy.commandId }, today, wallets, categories: byRank });
  // The copied fields stay exactly as copied (a closed wallet or category stays unchosen);
  // only the other modes, which the record never had, take the defaults.
  return {
    ...copy,
    walletId: copy.type === 'transfer' ? blank.walletId : copy.walletId,
    fromWalletId: copy.type === 'transfer' ? copy.fromWalletId : blank.fromWalletId,
    toWalletId: copy.type === 'transfer' ? copy.toWalletId : blank.toWalletId,
    categoryByType: {
      expense: copy.type === 'expense' ? copy.categoryByType.expense : blank.categoryByType.expense,
      income: copy.type === 'income' ? copy.categoryByType.income : blank.categoryByType.income,
    },
  };
}

/** Before the first touch a new draft's default categories follow the ranking; a copy keeps its own. */
function withDefaults(draft: QuickAddDraft, ranking: Ranking, source: CopySource | null): QuickAddDraft {
  const top = (type: 'expense' | 'income') => ranking[type].top[0]?.id ?? null;
  return {
    ...draft,
    categoryByType: {
      expense: source?.type === 'expense' ? draft.categoryByType.expense : top('expense'),
      income: source?.type === 'income' ? draft.categoryByType.income : top('income'),
    },
  };
}

/** The latest tracking start of the draft's wallet(s): no date before it can be saved. */
function earliestFor(draft: QuickAddDraft, wallets: readonly WalletSnapshot[]): string | null {
  const ids = draft.type === 'transfer' ? [draft.fromWalletId, draft.toWalletId] : [draft.walletId];
  let latest: string | null = null;
  for (const id of ids) {
    const start = wallets.find((wallet) => wallet.id === id)?.tracking_start;
    if (start && (latest === null || start > latest)) latest = start;
  }
  return latest;
}

/**
 * What each wallet holds as far as this device knows: the server's balance,
 * less what drafts waiting on this device take out of it and plus what they
 * bring in. Drafts being checked may already be in the server's balance, so
 * they are left out, as the budget pace leaves them out. "Move all" offers
 * this, so it never offers money a waiting draft already spent.
 */
function availableBalances(wallets: readonly { id: string; balance_minor: Minor }[], outbox: readonly OutboxCommand[]): Map<string, Minor> {
  const held = new Map(wallets.map((wallet) => [wallet.id, BigInt(wallet.balance_minor)]));
  const move = (id: string, delta: bigint) => {
    const balance = held.get(id);
    if (balance !== undefined) held.set(id, balance + delta);
  };
  for (const command of openDrafts(outbox)) {
    if (!WAITING_STATES.includes(command.state)) continue;
    const entry = command.payload;
    const amount = BigInt(entry.amount_minor);
    if (entry.type === 'transfer') {
      move(entry.source_wallet_id, -amount);
      move(entry.destination_wallet_id, amount);
    } else {
      move(entry.wallet_id, entry.type === 'expense' ? -amount : amount);
    }
  }
  return new Map([...held].map(([id, balance]) => [id, balance.toString()]));
}

/**
 * Wallets for WalletPicker, each with its balance when the server's list gave
 * one. Offline (the device's synced wallets) there is none, and WalletPicker
 * then shows the name only and offers no "move all": a guessed balance would
 * be a wrong number on screen.
 */
function walletChoices(wallets: readonly WalletSnapshot[], balances: ReadonlyMap<string, Minor> | null): WalletChoice[] {
  return wallets.map((wallet) => ({ id: wallet.id, name: wallet.name, archived: wallet.archived, balance_minor: balances?.get(wallet.id) ?? null }));
}

function keypadFor(source: CopySource | null): KeypadState {
  if (!source) return EMPTY_KEYPAD;
  try {
    return keypadFromMinor(source.amount_minor);
  } catch {
    return EMPTY_KEYPAD;
  }
}

function EntryForm({ wallets, categories, balances, today, records, drafts, source, onDone, onAnother }: EntryFormProps) {
  const resources = useSpendV1();
  const tc = useCopy();
  const keys = useCommandKeys();
  const diary = useSpendDiary();
  const diaryView = useDiaryView();
  const { intensity } = useBunIntensity();
  const liveRanking = useMemo(() => rank(categories, records, drafts, today), [categories, records, drafts, today]);
  const [frozenRanking, setFrozenRanking] = useState<Ranking | null>(null);
  const ranking = frozenRanking ?? liveRanking;
  // One record id and one device command id per draft, fixed when it opens.
  const [draft, setDraft] = useState<QuickAddDraft>(() => firstDraft(source, { today, wallets, categories, ranking: liveRanking }));
  const current = frozenRanking ? draft : withDefaults(draft, liveRanking, source);
  const [keypad, setKeypad] = useState<KeypadState>(() => keypadFor(source));
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('editing');
  const [details, setDetails] = useState(() => Boolean(source?.note || source?.merchant));
  const [sheet, setSheet] = useState<'categories' | 'wallet' | null>(null);
  const [saved, setSaved] = useState<SavedMomentData | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const pop = useSpringPop(savedCount);
  // The command whose outcome is unknown: "Try again" resends exactly this.
  const unconfirmed = useRef<{ input: CreateInput; fields: QuickAddDraft } | null>(null);
  // undefined until read; a failed read counts as already cheered today.
  const [cheerDay, setCheerDay] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    readCheerDay().then(
      (day) => { if (active) setCheerDay(day); },
      () => { if (active) setCheerDay(today); },
    );
    return () => { active = false; };
  }, [today]);
  useAnnouncement(message);

  // A refusal while unconfirmed that forbids resending for now (a changed session, an update): frozen, and Try again waits.
  const [resendBlocked, setResendBlocked] = useState(false);
  const words = useAmountWords();
  const locked = status === 'saving' || status === 'unconfirmed' || status === 'conflict';
  const type: EntryType = current.type;

  /** The first touch fixes the category order and the draft's defaults. */
  const touch = () => {
    if (frozenRanking) return;
    setFrozenRanking(liveRanking);
    setDraft(current);
  };
  const edit = (change: (previous: QuickAddDraft) => QuickAddDraft) => {
    if (locked) return;
    touch();
    setDraft(change);
  };
  const onKey = (key: KeypadKey) => {
    if (locked) return;
    touch();
    setKeypad((previous) => applyKey(previous, key));
  };

  function finish(fields: QuickAddDraft, via: 'device' | 'online') {
    const cheer = intensity === 'full' && cheerDay !== undefined && cheerDay !== today;
    if (cheer) {
      setCheerDay(today);
      void writeCheerDay(today);
    }
    unconfirmed.current = null;
    setSaved({ draft: fields, via, cheer });
    setStatus('saved');
    setSavedCount((count) => count + 1);
  }

  async function sendOnline(input: CreateInput, fields: QuickAddDraft) {
    const key = keys.keyFor('create', input);
    setStatus('saving');
    setMessage(null);
    try {
      if ('source_wallet_id' in input) await resources.createTransfer(input, key);
      else await resources.createTransaction(input, key);
      keys.settle('create');
      finish(fields, 'online');
    } catch (error) {
      // The record id is fixed for this draft: if it already exists, an
      // earlier attempt committed. Jotbun's copy is what is shown: the same
      // details are saved; other details are a conflict, never "Saved".
      if (isOwnCreate(error, input.id)) {
        keys.settle('create');
        unconfirmed.current = null;
        setResendBlocked(false);
        if (ownCreateMatches(error, input)) {
          finish(fields, 'online');
          return;
        }
        const held = (error as V1Error).current as { amount_minor?: unknown } | undefined;
        const amount = typeof held?.amount_minor === 'string' ? words(held.amount_minor).shown : '';
        setMessage(tc('This entry is already saved in Jotbun as {amount}. Check it in History.', { amount }));
        setStatus('conflict');
        return;
      }
      const problem = saveProblem(error, tc);
      // Once an attempt is unconfirmed, it stays frozen with its key until that
      // command's outcome is known: a refusal before processing (signed out,
      // terms, an update, a changed session) says nothing about it. Only an
      // answer the server processed settles it.
      const stillUnknown = problem.unconfirmed || (unconfirmed.current !== null && refusedBeforeProcessing(error));
      if (!stillUnknown) keys.settle('create');
      unconfirmed.current = stillUnknown ? { input, fields } : null;
      setResendBlocked(stillUnknown && problem.blocked);
      setServerErrors(problem.fields);
      setMessage(problem.message);
      if (problem.fields.note || problem.fields.merchant) setDetails(true);
      setStatus(stillUnknown ? 'unconfirmed' : problem.blocked ? 'blocked' : 'editing');
    }
  }

  async function save() {
    if (status === 'saving' || status === 'saved' || status === 'blocked' || status === 'conflict' || resendBlocked) return;
    // An online save whose outcome is unknown is resent online as itself, never re-queued on the device.
    const resend = status === 'unconfirmed' ? unconfirmed.current : null;
    if (resend) {
      await sendOnline(resend.input, resend.fields);
      return;
    }
    touch();
    // Save presses = for the user; a sum is shown worked out, a plain amount stays as typed.
    const settled = settleForSave(keypad);
    if (!settled.outcome.ok || keypadHasOperator(keypad)) setKeypad(settled.state);
    const fields: QuickAddDraft = { ...current, amountMinor: settled.outcome.ok ? settled.outcome.minor : '' };
    const built = buildQuickAdd(fields, { today, tc });
    const next: Errors = built.ok ? {} : { ...built.errors };
    // The keypad itself says what is wrong with the amount.
    if (!settled.outcome.ok) delete next.amount_minor;
    const earliest = earliestFor(fields, wallets);
    if (!next.occurred_on && earliest !== null && fields.occurredOn < earliest) next.occurred_on = tc('This date is before the wallet started tracking.');
    setErrors(next);
    setServerErrors({});
    setMessage(null);
    if (!settled.outcome.ok || !built.ok || Object.keys(next).length > 0) {
      if (next.note || next.merchant) setDetails(true);
      return;
    }
    if (diary && diaryView.phase === 'ready' && status !== 'unconfirmed') {
      setStatus('saving');
      try {
        await diary.saveDraft(built.entry, fields.commandId);
        finish(fields, 'device');
      } catch (error) {
        setMessage(localSaveProblem(error, tc));
        setStatus('editing');
      }
      return;
    }
    await sendOnline(built.input, fields);
  }

  function addAnother() {
    if (!saved) return;
    setDraft(anotherDraft(saved.draft, { recordId: newId(), commandId: newId() }));
    setKeypad(EMPTY_KEYPAD);
    setErrors({});
    setServerErrors({});
    setMessage(null);
    setDetails(false);
    setSheet(null);
    setSaved(null);
    setStatus('editing');
    onAnother?.();
  }

  if (status === 'saved' && saved) {
    return <SavedMoment saved={saved} wallets={wallets} categories={categories} pop={pop} onAnother={addAnother} onDone={onDone} />;
  }

  const choices = walletChoices(wallets, balances);
  const earliest = earliestFor(current, wallets);
  const same = current.type === 'transfer' && current.fromWalletId !== null && current.fromWalletId === current.toWalletId;
  const amountError = keypad.problem ? tc(KEYPAD_PROBLEM_TEXT[keypad.problem]) : errors.amount_minor ?? serverErrors.amount_minor ?? null;
  const categoryError = errors.category_id ?? serverErrors.category_id ?? null;
  const walletError = errors.wallet_id ?? serverErrors.wallet_id ?? null;
  const moveError = errors.wallets ?? serverErrors.source_wallet_id ?? serverErrors.destination_wallet_id ?? serverErrors.wallets ?? null;
  const dateError = errors.occurred_on ?? serverErrors.occurred_on ?? null;
  const walletName = wallets.find((wallet) => wallet.id === current.walletId)?.name ?? null;
  const typeCategories = type === 'transfer' ? [] : ordered(ranking[type]);
  const setFrom = (id: string) => edit((previous) => ({ ...previous, fromWalletId: id }));
  const setTo = (id: string) => edit((previous) => ({ ...previous, toWalletId: id }));
  const swap = () => edit((previous) => ({ ...previous, fromWalletId: previous.toWalletId, toWalletId: previous.fromWalletId }));
  const pickCategory = (id: string) => {
    if (type === 'transfer') return;
    edit((previous) => ({ ...previous, categoryByType: { ...previous.categoryByType, [type]: id } }));
  };

  return (
    <View style={{ gap: BUN_SPACE.md }}>
      <TypeSwitch value={type} onChange={(next) => edit((previous) => ({ ...previous, type: next }))} disabled={locked} />
      <AmountLine keypad={keypad} type={type} error={amountError} />
      {type === 'transfer' ? (
        <WalletPicker
          mode="move"
          wallets={choices}
          fromId={current.fromWalletId}
          toId={current.toWalletId}
          onChangeFrom={setFrom}
          onChangeTo={setTo}
          onSwap={swap}
          onMoveAll={(balance) => {
            if (locked) return;
            touch();
            try {
              setKeypad(keypadFromMinor(balance));
            } catch {
              setKeypad((previous) => ({ ...previous, problem: 'too_large' }));
            }
          }}
          // WalletPicker states the same-wallet problem itself; say it once.
          error={same ? null : moveError}
          disabled={locked}
        />
      ) : (
        <View style={{ gap: BUN_SPACE.xs }}>
          <CategoryChips
            ranked={typeCategories}
            selectedId={current.categoryByType[type]}
            onSelect={pickCategory}
            onMore={() => {
              if (locked) return;
              touch();
              setSheet('categories');
            }}
            disabled={locked}
          />
          {categoryError ? <FieldError message={categoryError} /> : null}
        </View>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: BUN_SPACE.xs }}>
        <DateChip value={current.occurredOn} today={today} earliest={earliest ?? undefined} onChange={(date) => edit((previous) => ({ ...previous, occurredOn: date }))} disabled={locked} />
        {type !== 'transfer' ? (
          <ChipButton
            label={walletName ? tc('Wallet: {name}', { name: walletName }) : tc('Choose a wallet')}
            text={walletName ?? tc('Choose a wallet')}
            disabled={locked}
            onPress={() => {
              touch();
              setSheet('wallet');
            }}
          />
        ) : null}
        <ChipButton label={tc('More details')} text={tc('More details')} expanded={details} disabled={locked} onPress={() => setDetails((open) => !open)} />
      </View>
      {dateError ? <FieldError message={dateError} /> : null}
      {type !== 'transfer' && walletError ? <FieldError message={walletError} /> : null}
      {details ? (
        <View style={{ gap: BUN_SPACE.sm }}>
          {/* NoteField states its own length and line rules; only the server's problems are passed in. */}
          <NoteField kind="merchant" value={current.merchant} onChangeText={(text) => edit((previous) => ({ ...previous, merchant: text }))} error={serverErrors.merchant ?? null} editable={!locked} />
          <NoteField kind="note" value={current.note} onChangeText={(text) => edit((previous) => ({ ...previous, note: text }))} error={serverErrors.note ?? null} editable={!locked} />
        </View>
      ) : null}
      <Keypad onKey={onKey} disabled={locked} />
      {message ? <SaveMessage message={message} /> : null}
      {status === 'conflict' ? <PillButton label={tc('Done')} onPress={onDone} /> : null}
      {status === 'unconfirmed' ? <PillButton label={tc('Try again')} disabled={resendBlocked} onPress={() => void save()} /> : null}
      {status !== 'unconfirmed' && status !== 'conflict'
        ? <PillButton label={tc('Save entry')} busy={status === 'saving'} busyLabel={tc('Saving…')} disabled={status === 'blocked'} onPress={() => void save()} />
        : null}
      <Sheet visible={sheet === 'categories'} onClose={() => setSheet(null)} title={tc('Choose a category')}>
        {type !== 'transfer' ? (
          <CategoryGrid
            categories={typeCategories}
            selectedId={current.categoryByType[type]}
            onSelect={(id) => {
              pickCategory(id);
              setSheet(null);
            }}
          />
        ) : null}
      </Sheet>
      <Sheet visible={sheet === 'wallet'} onClose={() => setSheet(null)} title={tc('Wallet')}>
        <WalletPicker
          mode="single"
          wallets={choices}
          selectedId={current.walletId}
          onSelect={(id) => {
            edit((previous) => ({ ...previous, walletId: id }));
            setSheet(null);
          }}
        />
      </Sheet>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pieces

/** The page: background, the title and Close. Quick add has no stack header. */
function Page({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const colors = useBunColors();
  const tc = useCopy();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      testID="quick-add-screen"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + BUN_SPACE.sm, paddingBottom: insets.bottom + BUN_SPACE.lg, paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm }}>
        <BunText variant="title" role="heading" accessibilityRole="header" style={{ flex: 1 }}>{title}</BunText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tc('Close')}
          onPress={onClose}
          style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}
        >
          <View {...DECORATIVE}>
            <BunText variant="heading">×</BunText>
          </View>
        </Pressable>
      </View>
      {children}
    </ScrollView>
  );
}

function Waiting({ label }: { label: string }) {
  const colors = useBunColors();
  return (
    <View style={{ paddingVertical: BUN_SPACE.xl, alignItems: 'center' }}>
      <ActivityIndicator color={colors.ink} accessibilityLabel={label} />
    </View>
  );
}

type Action = { label: string; onPress: () => void };

/** A load problem: what happened in words, and one way forward. No bun: this is not an empty space. */
function Problem({ message, action, secondary }: { message: string; action: Action; secondary?: Action }) {
  return (
    <Card>
      <BunText accessibilityRole="alert">{message}</BunText>
      <PillButton label={action.label} onPress={action.onPress} />
      {secondary ? <PillButton kind="secondary" label={secondary.label} onPress={secondary.onPress} /> : null}
    </Card>
  );
}

/** The amount, extra large and exact, worked out live from the keypad; what was typed shows above it. */
function AmountLine({ keypad, type, error }: { keypad: KeypadState; type: EntryType; error: string | null }) {
  const live = evaluateKeypad(keypad, { allowZero: true });
  const typed = keypadDisplay(keypad);
  const sum = keypadHasOperator(keypad);
  // A sum still being typed that has no value yet (it is below zero, or divides by zero) shows as typed.
  const hero = live.ok
    ? <Amount minor={live.minor} type={live.minor === '0' ? undefined : type} size="xl" />
    : sum ? <BunText variant="hero" style={{ fontVariant: ['tabular-nums'] }}>{typed}</BunText> : <Amount minor="0" size="xl" />;
  return (
    <View style={{ alignItems: 'center', gap: BUN_SPACE.xxs, paddingVertical: BUN_SPACE.xs }}>
      {/* A polite live region: each key's live result is read out (iOS hears the keypad's own key names). */}
      <View testID="quick-add-amount" {...POLITE_LIVE_REGION} style={{ alignItems: 'center', gap: BUN_SPACE.xxs }}>
        {live.ok && (sum || typed.includes('.')) ? <BunText variant="label" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{typed}</BunText> : null}
        {hero}
      </View>
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

/** A save problem for the whole entry, announced as an alert. */
function SaveMessage({ message }: { message: string }) {
  const colors = useBunColors();
  return (
    <View accessibilityRole="alert" style={{ borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.card, padding: BUN_SPACE.md }}>
      <BunText>{message}</BunText>
    </View>
  );
}

/** A small outlined pill on the row under the amount (the wallet, More details). */
function ChipButton({ label, text, onPress, disabled = false, expanded }: { label: string; text: string; onPress: () => void; disabled?: boolean; expanded?: boolean }) {
  const colors = useBunColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-expanded={expanded}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: BUN_TOUCH,
        justifyContent: 'center',
        paddingHorizontal: BUN_SPACE.md,
        paddingVertical: BUN_SPACE.xxs,
        borderRadius: BUN_RADIUS.pill,
        borderWidth: BUN_OUTLINE.control,
        borderColor: colors.ink,
        backgroundColor: colors.card,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <BunText variant="label">{text}</BunText>
    </Pressable>
  );
}

/** What was saved, in words: "Food · Cash", or "Cash → Daily account" for a move. */
function savedDetail(draft: QuickAddDraft, wallets: readonly WalletSnapshot[], categories: readonly CategoryDto[], tc: Translate): string {
  const walletName = (id: string | null) => wallets.find((wallet) => wallet.id === id)?.name ?? '';
  if (draft.type === 'transfer') return `${walletName(draft.fromWalletId)} → ${walletName(draft.toWalletId)}`;
  const category = categories.find((candidate) => candidate.id === draft.categoryByType[draft.type as 'expense' | 'income']);
  return [category ? categoryName(category, tc) : '', walletName(draft.walletId)].filter((part) => part !== '').join(' · ');
}

/** "Saved": a spring pop on the lavender stage, the exact amount, and Add another or Done. Only ink sits on the stage. */
function SavedMoment({ saved, wallets, categories, pop, onAnother, onDone }: {
  saved: SavedMomentData; wallets: readonly WalletSnapshot[]; categories: readonly CategoryDto[]; pop: ReturnType<typeof useSpringPop>; onAnother: () => void; onDone: () => void;
}) {
  const tc = useCopy();
  const colors = useBunColors();
  const words = useAmountWords();
  const { draft, via, cheer } = saved;
  // A device save is committed on this device and still waiting to sync: it never claims more.
  const title = via === 'device' ? tc('Saved on this device') : tc('Saved');
  const detail = savedDetail(draft, wallets, categories, tc);
  useAnnouncement(`${title}. ${words(draft.amountMinor, draft.type).spoken}`);
  return (
    <Animated.View
      testID="quick-add-saved"
      {...POLITE_LIVE_REGION}
      style={[{
        alignItems: 'center',
        gap: BUN_SPACE.sm,
        padding: BUN_SPACE.lg,
        borderRadius: BUN_RADIUS.card,
        borderWidth: BUN_OUTLINE.card,
        borderColor: colors.ink,
        backgroundColor: colors.stage,
      }, pop]}
    >
      {cheer ? <Bun pose="cheer" size="l" /> : null}
      <BunText variant="title" style={{ textAlign: 'center' }}>{title}</BunText>
      <Amount minor={draft.amountMinor} type={draft.type} size="l" on="stage" />
      {detail ? <BunText style={{ textAlign: 'center' }}>{detail}</BunText> : null}
      {via === 'device' ? <BunText variant="caption" style={{ textAlign: 'center' }}>{tc('Waiting to sync')}</BunText> : null}
      <View style={{ alignSelf: 'stretch', gap: BUN_SPACE.sm, marginTop: BUN_SPACE.xs }}>
        <PillButton label={tc('Add another')} onPress={onAnother} />
        <PillButton kind="secondary" label={tc('Done')} onPress={onDone} />
      </View>
    </Animated.View>
  );
}
