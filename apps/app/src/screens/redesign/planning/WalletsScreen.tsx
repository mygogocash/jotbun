// R4 Planning: the Wallets screen (plan §6.2, /spend/wallets), behind the
// `planning` area until E2 checkpoint 2. It is opened from Budget, so its
// stage has Back.
//
// - The list: the active wallets' exact total on the stage, a card per
//   wallet with its balance (spoken exactly), a dashed "Add a wallet" tile,
//   and the archived wallets in a collapsed section, each with Unarchive.
// - Create: a name, the opening balance on the kit keypad (exact satang; the
//   system keyboard never opens for money) and the tracking-start chip, with
//   a live card preview. The contract has no wallet colour, so the preview
//   has none. First run (no wallet at all) is Home's: the hello bun names the
//   space and the form follows at once.
// - Edit: rename, and correct the opening balance or tracking start. Once the
//   wallet has entries (or while that is not known), a correction asks why
//   before anything is sent: "A mistake when I set it up" (entry_error) or
//   "Match my real balance" (balance_reconciliation).
// - Archive: offered only at exactly ฿0.00, through the kit's confirm sheet;
//   otherwise the screen says why in words and what to do.
//
// Every write is one immutable command under `useCommandKeys`, with the
// version that was read: a definite refusal settles its key; an unconfirmed
// one freezes the form, and Try again resends the very same command and key
// (also when the retry is refused before processing). A version conflict
// shows Jotbun's copy, sends nothing more, and Reload starts again from it.
// The action and its message are pinned under the scrolling form
// (ActionFooter). Lists and forms stay plain: the bun appears only on the
// first-run empty state and, quiet, in the archive confirm sheet.
import { TRACKING_START_MIN } from '@gogospend/contracts';
import type { CreateWalletRequest, UpdateWalletRequest, WalletCorrectionReason, WalletDto } from '@gogospend/contracts';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { V1Error } from '@mobile/api/client';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { formatMinor } from '@mobile/spend/v1/money';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import {
  archiveAdviceLine,
  buildCreateWallet,
  buildWalletUpdate,
  canArchive,
  correctionNeedsReason,
  newWalletForm,
  walletConflict,
  walletConflictRows,
  walletFormOf,
  walletPreview,
  walletRefusal,
  walletsOverview,
} from '@mobile/spend/v1/redesign/planning/walletsModel';
import type { HasRecords, WalletField, WalletFieldErrors, WalletForm } from '@mobile/spend/v1/redesign/planning/walletsModel';
import { say } from '@mobile/spend/v1/redesign/shared';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { useMoneyLocale } from '@mobile/ui/Amount';
import { BunText } from '@mobile/ui/BunText';
import { DateChip } from '@mobile/ui/DateChip';
import { fullDateLabel } from '@mobile/ui/dateStep';
import { EmptyState } from '@mobile/ui/EmptyState';
import { Keypad } from '@mobile/ui/Keypad';
import { EMPTY_KEYPAD, applyKey, evaluateKeypad, keypadDisplay, keypadFromMinor, keypadHasOperator, settleForSave } from '@mobile/ui/keypadExpression';
import type { KeypadKey, KeypadProblem, KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_OUTLINE, BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { ConfirmSheet } from '@mobile/ui/Sheet';
import { StageHeader } from '@mobile/ui/StageHeader';
import { isOwnCreate, newId, refusedBeforeProcessing, saveProblem, useCommandKeys, useLoad } from '../../v1/parts';
import { ActionFooter, EntryPage } from '../ActionFooter';
import { LoadingBlock, Notice, useGoBack } from '../HistoryParts';
import {
  AddWalletTile,
  ArchivedRow,
  ArchivedToggle,
  ConflictPanel,
  DeviceWallets,
  NameField,
  OpeningBalance,
  PreviewCard,
  ProblemCard,
  ReasonQuestion,
  StartField,
  TotalOnStage,
  WalletCard,
} from './WalletParts';

export type WalletsScreenProps = {
  /** The clock, for tests; today is its Bangkok date. */
  now?: Date;
};

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; id: string };

/** What the keypad line says when it refuses a key (the same words as Quick add's). */
const KEYPAD_PROBLEM_TEXT: Readonly<Record<KeypadProblem, string>> = {
  empty: 'Enter an amount',
  zero: 'Enter an amount above zero',
  too_precise: 'Use at most two decimal places',
  too_large: 'Amounts go up to ฿999,999,999.99',
  negative: "The sum can't go below zero.",
  divide_by_zero: "You can't divide by zero.",
};

const keypadIsEmpty = (keypad: KeypadState) => keypad.operators.length === 0 && keypad.operands.length === 1 && keypad.operands[0] === '';

function keypadFor(wallet: WalletDto | undefined): KeypadState {
  if (!wallet) return EMPTY_KEYPAD;
  try {
    return keypadFromMinor(wallet.opening_minor);
  } catch {
    return EMPTY_KEYPAD;
  }
}

/** The page: the stage, the scrolling content and, for a form, its pinned footer. */
function Page({ header, footer, children }: { header: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <EntryPage testID="wallets-screen">
      <ScrollView
        testID="wallets-scroll"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: footer ? BUN_SPACE.sm : insets.bottom + BUN_SPACE.xl, gap: BUN_SPACE.md }}
        keyboardShouldPersistTaps="handled"
      >
        {header}
        <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>{children}</View>
      </ScrollView>
      {footer}
    </EntryPage>
  );
}

export function WalletsScreen({ now }: WalletsScreenProps) {
  const resources = useSpendV1();
  const tc = useCopy();
  const goBack = useGoBack('/spend');
  const diaryView = useDiaryView();
  const today = todayInBangkok(now ?? new Date());
  const loaded = useLoad(() => resources.wallets(), [resources]);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  // Bumped by Reload, so every page starts again from what Jotbun holds.
  const [round, setRound] = useState(0);

  const editable = loaded.state === 'ready' && mode.kind === 'edit' ? loaded.data.find((wallet) => wallet.id === mode.id && !wallet.archived) : undefined;
  // A wallet archived (or gone) meanwhile cannot be changed: back to the list.
  useEffect(() => {
    if (mode.kind === 'edit' && loaded.state === 'ready' && !editable) setMode({ kind: 'list' });
  }, [mode, loaded.state, editable]);

  const toList = () => setMode({ kind: 'list' });
  const done = () => {
    setMode({ kind: 'list' });
    loaded.refresh();
  };
  const reload = () => {
    loaded.reload();
    setRound((value) => value + 1);
  };
  const listHeader = (children?: ReactNode) => <StageHeader title={tc('Wallets')} back={{ onPress: goBack }}>{children}</StageHeader>;

  if (loaded.state === 'loading') {
    return <Page header={listHeader()}><LoadingBlock label={tc('Loading your wallets')} /></Page>;
  }
  if (loaded.state === 'error') {
    const problem = classifyLoadProblem(loaded.error, tc);
    const offline = loaded.error instanceof V1Error && loaded.error.outcome === 'network' && diaryView.phase === 'ready' && diaryView.wallets.length > 0;
    return (
      <Page header={listHeader()}>
        <ProblemCard problem={problem} onRetry={loaded.reload} />
        {offline ? <DeviceWallets names={diaryView.wallets.map((wallet) => wallet.name)} /> : null}
      </Page>
    );
  }

  const overview = walletsOverview(loaded.data);
  const form = { today, onDone: done, onRefresh: loaded.refresh, onReload: reload };
  if (overview.firstRun) {
    // Home's first run: the hello bun names the space, the form follows at once, and Back leaves the screen.
    const lead = (
      <EmptyState
        art={<Bun pose="hello" size="l" />}
        title={tc('Add your first wallet')}
        body={tc('A wallet is where money sits, like cash or a bank account. Its opening balance is not income.')}
      />
    );
    // Saved: read again with the loading state, so a failed read is a load problem, never a form stuck saving.
    return <WalletFormPage key={`first:${round}`} title={tc('Wallets')} lead={lead} onBack={goBack} {...form} onDone={loaded.reload} />;
  }
  if (mode.kind === 'create') return <WalletFormPage key={`create:${round}`} title={tc('Add a wallet')} onBack={toList} {...form} />;
  if (editable) return <WalletFormPage key={`edit:${editable.id}:${round}`} title={tc('Edit wallet')} wallet={editable} onBack={toList} {...form} />;
  return (
    <ListPage
      key={`list:${round}`}
      header={listHeader(<TotalOnStage totalMinor={overview.totalMinor} />)}
      active={overview.active}
      archived={overview.archived}
      onAdd={() => setMode({ kind: 'create' })}
      onOpen={(id) => setMode({ kind: 'edit', id })}
      onChanged={loaded.refresh}
      onReload={reload}
    />
  );
}

// ---------------------------------------------------------------------------
// The list

/** An unarchive whose outcome is not settled, or that Jotbun refused. */
type ListAction =
  | { walletId: string; phase: 'saving' }
  | { walletId: string; phase: 'unconfirmed'; message: string; blocked: boolean }
  | { walletId: string; phase: 'refused'; message: string }
  | { walletId: string; phase: 'conflict'; current: WalletDto | null };

type Unarchive = { slot: string; id: string; version: number };

function ListPage({ header, active, archived, onAdd, onOpen, onChanged, onReload }: {
  header: ReactNode; active: readonly WalletDto[]; archived: readonly WalletDto[];
  onAdd: () => void; onOpen: (id: string) => void; onChanged: () => void; onReload: () => void;
}) {
  const resources = useSpendV1();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const dateLocale = useActiveLocale();
  const keys = useCommandKeys();
  const [expanded, setExpanded] = useState(false);
  const [action, setAction] = useState<ListAction | null>(null);
  // The unarchive whose outcome is unknown: Try again resends exactly this.
  const pending = useRef<Unarchive | null>(null);
  const sending = useRef(false);

  async function send(command: Unarchive) {
    if (sending.current) return;
    sending.current = true;
    const key = keys.keyFor(command.slot, { version: command.version });
    setAction({ walletId: command.id, phase: 'saving' });
    try {
      await resources.unarchiveWallet(command.id, command.version, key);
      keys.settle(command.slot);
      pending.current = null;
      setAction(null);
      onChanged();
    } catch (error) {
      const problem = saveProblem(error, tc);
      // Once unconfirmed, a refusal before processing says nothing about the earlier attempt: stay frozen with the key.
      const stillUnknown = problem.unconfirmed || (pending.current !== null && refusedBeforeProcessing(error));
      if (stillUnknown) {
        pending.current = command;
        setAction({ walletId: command.id, phase: 'unconfirmed', message: problem.message, blocked: problem.blocked });
        return;
      }
      keys.settle(command.slot);
      pending.current = null;
      const conflict = walletConflict(error, command.id);
      const gone = error instanceof V1Error && error.outcome === 'not_found';
      if (conflict || gone || walletRefusal(error, tc).changedElsewhere) {
        setAction({ walletId: command.id, phase: 'conflict', current: conflict?.current ?? null });
        return;
      }
      setAction({ walletId: command.id, phase: 'refused', message: problem.message });
    } finally {
      sending.current = false;
    }
  }

  const busy = action?.phase === 'saving' || action?.phase === 'unconfirmed';
  const money = (minor: string) => formatMinor(minor, locale);
  const date = (day: string) => fullDateLabel(day, dateLocale);
  return (
    <Page header={header}>
      {active.map((wallet) => <WalletCard key={wallet.id} wallet={wallet} onPress={() => onOpen(wallet.id)} />)}
      <AddWalletTile onPress={onAdd} />
      {archived.length > 0 ? (
        <View style={{ gap: BUN_SPACE.xs }}>
          <ArchivedToggle count={archived.length} expanded={expanded} onPress={() => setExpanded((open) => !open)} />
          {expanded ? (
            <View testID="wallets-archived" style={{ gap: BUN_SPACE.sm }}>
              {action?.phase === 'unconfirmed' ? (
                <Notice
                  tone="alert"
                  message={action.message}
                  action={action.blocked ? undefined : { label: tc('Try again'), onPress: () => { if (pending.current) void send(pending.current); } }}
                />
              ) : null}
              {action?.phase === 'refused' ? <Notice tone="alert" message={action.message} /> : null}
              {action?.phase === 'conflict' ? (
                <ConflictPanel rows={action.current ? walletConflictRows(action.current, null, { tc, money, date }) : []} onReload={onReload} />
              ) : null}
              {archived.map((wallet) => {
                const mine = action?.walletId === wallet.id;
                const unconfirmed = mine && action?.phase === 'unconfirmed';
                return (
                  <ArchivedRow
                    key={wallet.id}
                    wallet={wallet}
                    action={unconfirmed ? null : (
                      <PillButton
                        kind="secondary"
                        label={tc('Unarchive')}
                        accessibilityLabel={tc('Unarchive {name}', { name: wallet.name })}
                        busy={mine && action?.phase === 'saving'}
                        disabled={busy && !mine}
                        onPress={() => void send({ slot: `unarchive:${wallet.id}`, id: wallet.id, version: wallet.version })}
                      />
                    )}
                  />
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}
    </Page>
  );
}

// ---------------------------------------------------------------------------
// The form: create (and first run) or edit

type Command =
  | { kind: 'create'; slot: 'create'; input: CreateWalletRequest }
  | { kind: 'update'; slot: string; id: string; version: number; changes: UpdateWalletRequest }
  | { kind: 'archive'; slot: string; id: string; version: number };

/**
 * `unconfirmed`: an attempt may have committed; the form is frozen with its
 * key and only Try again resends the same command. `blocked`: saving waits on
 * something elsewhere (an update, a changed session). `conflict`: changed on
 * another device; Reload is the way on.
 */
type Phase = 'editing' | 'saving' | 'unconfirmed' | 'blocked' | 'conflict';

type FormPageProps = {
  title: string;
  /** Edit this wallet; create a new one when left out. */
  wallet?: WalletDto;
  /** Above the form: the first-run empty state. */
  lead?: ReactNode;
  today: string;
  /** The stage's Back. */
  onBack: () => void;
  /** Saved: back to the list, which is read again. */
  onDone: () => void;
  /** Read the wallets again in place (an archive refused for its balance). */
  onRefresh: () => void;
  /** Read the wallets again and start over from them (after a conflict). */
  onReload: () => void;
};

const payloadOf = (command: Command): unknown =>
  command.kind === 'create' ? command.input : command.kind === 'update' ? { version: command.version, changes: command.changes } : { version: command.version };

function WalletFormPage({ title, wallet, lead, today, onBack, onDone, onRefresh, onReload }: FormPageProps) {
  const resources = useSpendV1();
  const tc = useCopy();
  const colors = useBunColors();
  const locale = useMoneyLocale();
  const dateLocale = useActiveLocale();
  const keys = useCommandKeys();
  // One wallet id per new wallet, fixed while the form lives: a resend always names the same wallet.
  const [walletId] = useState(newId);
  const [form, setForm] = useState<WalletForm>(() => (wallet ? walletFormOf(wallet) : newWalletForm(today)));
  const [keypad, setKeypad] = useState<KeypadState>(() => keypadFor(wallet));
  const [errors, setErrors] = useState<WalletFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('editing');
  // Frozen, and resending must wait (a changed session, an update): Try again is disabled.
  const [resendBlocked, setResendBlocked] = useState(false);
  const [conflict, setConflict] = useState<{ current: WalletDto | null; yours: WalletForm | null } | null>(null);
  // Jotbun asked for the correction's reason.
  const [askReason, setAskReason] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [archiveRefused, setArchiveRefused] = useState(false);
  const pending = useRef<Command | null>(null);
  const sending = useRef(false);

  // Whether the wallet has entries, which decides whether a correction needs its reason.
  const records = useLoad(async () => {
    if (!wallet) return false;
    const page = await resources.history({ from: TRACKING_START_MIN, through: today, wallet_id: wallet.id, sort: 'date_desc' }, undefined, 1);
    return page.summary.count > 0 || page.items.length > 0;
  }, [resources, wallet?.id, today]);
  const hasRecords: HasRecords = wallet ? (records.state === 'ready' ? records.data : null) : false;

  const locked = phase === 'saving' || phase === 'unconfirmed' || phase === 'conflict';
  const live = evaluateKeypad(keypad, { allowZero: true });
  const empty = keypadIsEmpty(keypad);
  // The form as it stands, the opening balance from the keypad (anything not yet an amount counts as a change).
  const current: WalletForm = { ...form, openingMinor: empty ? '' : live.ok ? live.minor : keypadDisplay(keypad) };

  const clear = (field: WalletField) => setErrors((previous) => {
    if (previous[field] === undefined) return previous;
    const next = { ...previous };
    delete next[field];
    return next;
  });
  const edit = (field: WalletField, patch: Partial<WalletForm>) => {
    if (locked) return;
    setForm((previous) => ({ ...previous, ...patch }));
    clear(field);
  };
  const onKey = (key: KeypadKey) => {
    if (locked) return;
    setKeypad((previous) => applyKey(previous, key));
    clear('opening_minor');
  };

  async function send(command: Command) {
    if (sending.current) return;
    sending.current = true;
    const key = keys.keyFor(command.slot, payloadOf(command));
    setPhase('saving');
    setMessage(null);
    try {
      if (command.kind === 'create') await resources.createWallet(command.input, key);
      else if (command.kind === 'update') await resources.updateWallet(command.id, command.version, command.changes, key);
      else await resources.archiveWallet(command.id, command.version, key);
      keys.settle(command.slot);
      pending.current = null;
      setConfirming(false);
      onDone();
    } catch (error) {
      setConfirming(false);
      // This wallet's id already exists: an earlier attempt of this create committed.
      if (command.kind === 'create' && isOwnCreate(error, command.input.id)) {
        keys.settle(command.slot);
        pending.current = null;
        onDone();
        return;
      }
      const problem = saveProblem(error, tc);
      // Once unconfirmed, it stays frozen with its key until that command's outcome is known: a refusal before
      // processing (signed out, terms, an update, a changed session) says nothing about it.
      const stillUnknown = problem.unconfirmed || (pending.current !== null && refusedBeforeProcessing(error));
      if (stillUnknown) {
        pending.current = command;
        setResendBlocked(problem.blocked);
        setMessage(problem.message);
        setPhase('unconfirmed');
        return;
      }
      keys.settle(command.slot);
      pending.current = null;
      setResendBlocked(false);
      const refusal = walletRefusal(error, tc);
      const found = command.kind === 'create' ? null : walletConflict(error, command.id);
      const gone = error instanceof V1Error && error.outcome === 'not_found';
      if (found || gone || refusal.changedElsewhere) {
        setConflict({ current: found?.current ?? null, yours: command.kind === 'update' ? current : null });
        setPhase('conflict');
        return;
      }
      if (refusal.archiveRefused) {
        // The balance moved since it was read: say so, and read it again.
        setArchiveRefused(true);
        setPhase('editing');
        onRefresh();
        return;
      }
      if (refusal.needsReason) setAskReason(true);
      setErrors(refusal.fields);
      setMessage(Object.keys(refusal.fields).length > 0 ? tc('Check the highlighted fields.') : problem.message);
      setPhase(problem.blocked ? 'blocked' : 'editing');
    } finally {
      sending.current = false;
    }
  }

  async function save() {
    if (phase === 'saving' || phase === 'blocked' || phase === 'conflict') return;
    if (phase === 'unconfirmed') {
      // Try again: exactly the command whose outcome is unknown, under its key.
      if (pending.current && !resendBlocked) await send(pending.current);
      return;
    }
    // Save presses = for the user: a sum is shown worked out, a plain amount stays as typed.
    let opening = '';
    if (!empty) {
      const settled = settleForSave(keypad, { allowZero: true });
      if (!settled.outcome.ok || keypadHasOperator(keypad)) setKeypad(settled.state);
      // The keypad says what is wrong with the amount itself.
      if (!settled.outcome.ok) return;
      opening = settled.outcome.minor;
    }
    const fields: WalletForm = { ...form, openingMinor: opening };
    setMessage(null);
    if (!wallet) {
      const built = buildCreateWallet(fields, { id: walletId, today, tc });
      if (!built.ok) {
        setErrors(built.errors);
        return;
      }
      setErrors({});
      await send({ kind: 'create', slot: 'create', input: built.input });
      return;
    }
    const built = buildWalletUpdate(wallet, fields, { today, tc, hasRecords });
    if (!built.ok) {
      setErrors(built.errors);
      if (built.errors.correction_reason) setAskReason(true);
      return;
    }
    if (built.unchanged) {
      onBack();
      return;
    }
    setErrors({});
    await send({ kind: 'update', slot: `edit:${built.id}`, id: built.id, version: built.version, changes: built.changes });
  }

  const archive = () => {
    if (!wallet || locked) return;
    void send({ kind: 'archive', slot: `archive:${wallet.id}`, id: wallet.id, version: wallet.version });
  };

  const money = (minor: string) => formatMinor(minor, locale);
  const date = (day: string) => fullDateLabel(day, dateLocale);
  const preview = walletPreview({ ...current, openingMinor: live.ok || empty ? current.openingMinor : '' }, wallet);
  const previewText = live.ok || empty ? null : keypadDisplay(keypad);
  const keypadProblem = keypad.problem ? tc(KEYPAD_PROBLEM_TEXT[keypad.problem]) : null;
  const openingProblems = [keypadProblem, errors.opening_minor].filter((problem): problem is string => Boolean(problem));
  const showReason = wallet !== undefined && (askReason || correctionNeedsReason(wallet, current, hasRecords));
  const advice = wallet ? archiveAdviceLine(wallet, money) : null;
  const primary = wallet ? tc('Save changes') : tc('Create wallet');

  const footer = (
    <ActionFooter testID="wallets-footer">
      {message ? <Notice tone="alert" message={message} /> : null}
      {phase === 'conflict' ? <PillButton label={tc('Reload')} onPress={onReload} /> : null}
      {phase === 'unconfirmed' ? <PillButton label={tc('Try again')} disabled={resendBlocked} onPress={() => void save()} /> : null}
      {phase !== 'conflict' && phase !== 'unconfirmed'
        ? <PillButton label={primary} busy={phase === 'saving'} busyLabel={tc('Saving…')} disabled={phase === 'blocked'} onPress={() => void save()} />
        : null}
    </ActionFooter>
  );

  return (
    <Page header={<StageHeader title={title} back={{ onPress: onBack }} />} footer={footer}>
      {lead}
      {conflict ? (
        <ConflictPanel rows={conflict.current ? walletConflictRows(conflict.current, conflict.yours, { tc, money, date }) : []} />
      ) : (
        <>
          <PreviewCard preview={preview} amountText={previewText} />
          <NameField value={form.name} onChangeText={(name) => edit('name', { name })} error={errors.name} editable={!locked} />
          <OpeningBalance keypad={keypad} problems={openingProblems} />
          <Keypad onKey={onKey} disabled={locked} />
          <StartField error={errors.tracking_start}>
            <DateChip value={form.trackingStart} today={today} onChange={(trackingStart) => edit('tracking_start', { trackingStart })} disabled={locked} />
          </StartField>
          {showReason ? (
            <ReasonQuestion
              value={form.reason}
              onChange={(reason: WalletCorrectionReason) => edit('correction_reason', { reason })}
              error={errors.correction_reason}
              disabled={locked}
            />
          ) : null}
          {wallet ? (
            <View testID="wallet-archive" style={{ gap: BUN_SPACE.sm, paddingTop: BUN_SPACE.sm, borderTopWidth: BUN_OUTLINE.rule, borderTopColor: colors.rule }}>
              {archiveRefused ? <Notice tone="alert" message={tc("{name} wasn't archived: its balance is no longer {zero}.", { name: wallet.name, zero: money('0') })} /> : null}
              {canArchive(wallet) ? (
                <PillButton kind="secondary" label={tc('Archive wallet')} disabled={locked} onPress={() => setConfirming(true)} />
              ) : advice ? (
                <BunText>{say(tc, advice)}</BunText>
              ) : null}
            </View>
          ) : null}
        </>
      )}
      {wallet ? (
        <ConfirmSheet
          visible={confirming}
          title={tc('Archive {name}?', { name: wallet.name })}
          consequence={tc('{name} leaves your wallet list and Quick add. Its entries stay in History, and you can unarchive it any time.', { name: wallet.name })}
          confirmLabel={tc('Archive {name}', { name: wallet.name })}
          cancelLabel={tc('Keep it')}
          busy={phase === 'saving'}
          art={<Bun pose="quiet" size="m" />}
          onConfirm={archive}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </Page>
  );
}
