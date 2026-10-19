// The redesigned record detail (R3, /spend/record/[id]): one entry as a
// receipt slip, with Edit, Copy and Delete (with undo).
//
// The record comes from the API, or from this device's diary when the id is a
// draft that has not reached the server yet; a draft can be copied, removed
// while never sent, or discarded once it needs a look, never edited.
//
// Edit keeps the rules of the current list: the amount comes from the exact
// keypad, only the fields you changed are sent, and the edit carries the
// version you saw (`EditDraft.baseVersion`) under its own command key. A
// conflict shows yours and the server's side by side and offers Reload or an
// explicit "Apply my change", which resends the same changes on the server's
// version (a new command). An unconfirmed edit or delete is frozen and "Try
// again" resends the same command. An entry deleted on another device says
// so, and can be restored while it is inside the 30-day window.
import { isTransactionSnapshot } from '@gogospend/contracts';
import type { CategoryDto, Minor, TransactionDto, WalletDto } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { formatMinor } from '@mobile/spend/v1/money';
import { recentlyDeletedModel } from '@mobile/spend/v1/redesign/historyModel';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import type { FieldErrors } from '@mobile/spend/v1/redesign/quickAddModel';
import { buildEditChanges, conflictModel, editDraftFrom, rebaseEdit, recordDetail } from '@mobile/spend/v1/redesign/recordModel';
import type { DetailContext, EditDraft, RecordDetail } from '@mobile/spend/v1/redesign/recordModel';
import { dateTagFor, openDrafts } from '@mobile/spend/v1/redesign/shared';
import type { Lookups, RowState } from '@mobile/spend/v1/redesign/shared';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import type { AmountState } from '@mobile/ui/Amount';
import { BunText } from '@mobile/ui/BunText';
import { DateChip } from '@mobile/ui/DateChip';
import { fullDateLabel } from '@mobile/ui/dateStep';
import { Keypad } from '@mobile/ui/Keypad';
import { applyKey, evaluateKeypad, keypadDisplay, keypadFromMinor, keypadHasOperator, settleForSave } from '@mobile/ui/keypadExpression';
import type { KeypadKey, KeypadProblem, KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE } from '@mobile/ui/layout';
import { NoteField } from '@mobile/ui/NoteField';
import { PillButton } from '@mobile/ui/PillButton';
import { ReceiptRow, ReceiptSlip, ReceiptTotal } from '@mobile/ui/ReceiptSlip';
import { UndoBar } from '@mobile/ui/UndoBar';
import { saveProblem, useCommandKeys, useMoneyLocale } from '../v1/parts';
import { StageHeader } from '@mobile/ui/StageHeader';
import { ActionFooter, ActionRow, EntryPage } from './ActionFooter';
import { LoadingBlock, Notice, copyHref, useDateLocale, useGoBack } from './HistoryParts';

export type RecordScreenProps = {
  id: string;
  /** `edit` opens straight into the edit mode (History's Edit action). */
  mode?: 'view' | 'edit';
  now?: Date;
};

type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; record: TransactionDto; wallets: WalletDto[]; categories: CategoryDto[] }
  | { state: 'error'; error: unknown };

type Editing = {
  draft: EditDraft;
  keypad: KeypadState;
  errors: FieldErrors;
  message: string | null;
  /** The server's current record after a conflict (validated). */
  conflict: TransactionDto | null;
  /** The save may have committed: everything is frozen and only "Try again" resends it. */
  unconfirmed: boolean;
};

const KEYPAD_PROBLEM_TEXT: Readonly<Record<KeypadProblem, string>> = {
  empty: 'Enter an amount',
  zero: 'Enter an amount above zero',
  too_precise: 'Use at most two decimal places',
  too_large: 'Amounts go up to ฿999,999,999.99',
  negative: "The sum can't go below zero.",
  divide_by_zero: "You can't divide by zero.",
};

/** The amount's state word matches the Status row: a draft being checked says "checking", not "saving". */
const AMOUNT_STATE: Readonly<Record<RowState, AmountState>> = {
  confirmed: 'confirmed', saving: 'saving', checking: 'checking', update_to_send: 'saving', needs_look: 'conflict',
};

const lookupsOf = (wallets: readonly { id: string; name: string }[], categories: readonly CategoryDto[]): Lookups => ({
  wallets: new Map(wallets.map((wallet) => [wallet.id, wallet])),
  categories: new Map(categories.map((category) => [category.id, category])),
});

const startEdit = (record: TransactionDto): Editing => ({
  draft: editDraftFrom(record), keypad: keypadFromMinor(record.amount_minor), errors: {}, message: null, conflict: null, unconfirmed: false,
});

/** The latest tracking start of the wallets an entry touches: its date cannot go before it. */
function earliestDate(record: TransactionDto, wallets: readonly WalletDto[]): string | undefined {
  const ids = record.type === 'transfer' ? [record.source_wallet_id, record.destination_wallet_id] : [record.wallet_id];
  const starts = ids.map((id) => wallets.find((wallet) => wallet.id === id)?.tracking_start).filter((start): start is string => Boolean(start));
  return starts.sort().at(-1);
}

/** A problem said in words, in ink and bold: red is kept for over budget. */
function FieldProblem({ message }: { message: string }) {
  return <BunText accessibilityRole="alert" variant="caption" style={{ fontWeight: '700' }}>{message}</BunText>;
}

function Receipt({ detail, minor, date }: { detail: RecordDetail; minor: Minor; date: string }) {
  const dateLocale = useDateLocale();
  const amount = detail.rows.find((row) => row.key === 'amount');
  return (
    <ReceiptSlip title={detail.title}>
      {detail.rows.filter((row) => row.key !== 'amount').map((row) => (
        // The kit's date words read in all three languages (Thai Buddhist-era years, Vietnamese words).
        <ReceiptRow key={row.key} label={row.label} value={row.key === 'date' ? fullDateLabel(date, dateLocale) : row.value} />
      ))}
      {amount ? <ReceiptTotal label={amount.label} minor={minor} type={detail.type} state={AMOUNT_STATE[detail.state]} /> : null}
    </ReceiptSlip>
  );
}

export function RecordScreen({ id, mode = 'view', now }: RecordScreenProps) {
  const resources = useSpendV1();
  const router = useRouter();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const dateLocale = useDateLocale();
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const keys = useCommandKeys();
  const diary = useSpendDiary();
  const diaryView = useDiaryView();
  const goBack = useGoBack();
  const today = todayInBangkok(now ?? new Date());

  const draftCommand = diaryView.phase === 'ready' ? openDrafts(diaryView.outbox).find((command) => command.payload.id === id) : undefined;
  const fromDevice = draftCommand !== undefined;

  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [editing, setEditing] = useState<Editing | null>(null);
  /** Deleted here: the undo bar restores this version. */
  const [deleted, setDeleted] = useState<{ id: string; version: number } | null>(null);
  /** An action whose outcome is unknown: frozen until "Try again" resends it. */
  const [pending, setPending] = useState<'delete' | 'restore' | null>(null);
  /** An edit learned the entry was deleted on another device. */
  const [gone, setGone] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const acting = useRef(false);
  const leaving = useRef(false);
  const autoEdit = useRef(mode === 'edit');

  /** Reads the entry; what is on screen stays while it reloads. */
  const load = useCallback(async () => {
    const turn = ++generation.current;
    setLoaded((previous) => (previous.state === 'ready' ? previous : { state: 'loading' }));
    try {
      const [record, wallets, categories] = await Promise.all([resources.transaction(id), resources.wallets(), resources.ensureBuiltinCategories()]);
      if (turn !== generation.current) return;
      setLoaded({ state: 'ready', record, wallets, categories });
      if (autoEdit.current && !record.deleted_at) {
        autoEdit.current = false;
        setEditing(startEdit(record));
      }
    } catch (error) {
      if (turn === generation.current) setLoaded({ state: 'error', error });
    }
  }, [resources, id]);

  useEffect(() => {
    if (!fromDevice && !leaving.current) void load();
  }, [load, fromDevice]);

  async function submitEdit(current: Editing) {
    if (loaded.state !== 'ready' || acting.current) return;
    const settled = settleForSave(current.keypad);
    if (!settled.outcome.ok) {
      setEditing({ ...current, keypad: settled.state });
      return;
    }
    const draft: EditDraft = { ...current.draft, amountMinor: settled.outcome.minor };
    const keypad = settled.state;
    const result = buildEditChanges(draft, { today, tc });
    if (!result.ok) {
      setEditing({ ...current, draft, keypad, errors: result.errors });
      return;
    }
    if (result.unchanged) {
      setEditing(null);
      return;
    }
    const slot = `edit:${result.id}`;
    const key = keys.keyFor(slot, { version: result.version, changes: result.changes });
    acting.current = true;
    setBusy(true);
    try {
      await resources.updateTransaction(result.id, result.version, result.changes, key);
      keys.settle(slot);
      setEditing(null);
      setNotice(null);
    } catch (problem) {
      const outcome = problem instanceof V1Error ? problem.outcome : undefined;
      const saved = saveProblem(problem, tc);
      if (!saved.unconfirmed) keys.settle(slot);
      const server = problem instanceof V1Error ? problem.current : undefined;
      const snapshot = isTransactionSnapshot(server) && server.id === result.id ? server : null;
      if (outcome === 'deleted' || outcome === 'not_found' || (outcome === 'conflict' && snapshot?.deleted_at)) {
        setEditing(null);
        setGone(true);
        void load();
      } else if (outcome === 'conflict' && snapshot) {
        setEditing({ ...current, draft, keypad, errors: {}, message: null, conflict: snapshot, unconfirmed: false });
      } else if (outcome === 'conflict') {
        // No usable current record: reload rather than loop on a stale version.
        setEditing(null);
        setNotice(tc('This entry changed on another device.'));
        void load();
      } else {
        setEditing({ ...current, draft, keypad, unconfirmed: saved.unconfirmed, message: saved.message, errors: saved.fields as FieldErrors });
      }
      return;
    } finally {
      acting.current = false;
      setBusy(false);
    }
    // Reading the result is a separate load: its failure is a load problem, never an unconfirmed save.
    void load();
  }

  async function remove(record: TransactionDto) {
    if (acting.current) return;
    acting.current = true;
    const slot = `delete:${record.id}`;
    const key = keys.keyFor(slot, { version: record.version });
    setBusy(true);
    try {
      const ack = await resources.deleteTransaction(record.id, record.version, key);
      keys.settle(slot);
      setPending(null);
      setDeleted({ id: record.id, version: ack.version });
      setNotice(null);
    } catch (problem) {
      const outcome = problem instanceof V1Error ? problem.outcome : undefined;
      const result = saveProblem(problem, tc);
      if (!result.unconfirmed) keys.settle(slot);
      setPending(result.unconfirmed ? 'delete' : null);
      if (outcome === 'deleted' || outcome === 'not_found') setNotice(tc('This entry was already deleted.'));
      else if (outcome === 'conflict') setNotice(tc('This entry changed on another device.'));
      else setNotice(result.message);
      if (!result.unconfirmed) void load();
    } finally {
      acting.current = false;
      setBusy(false);
    }
  }

  /** Undo (the version the delete returned) or Restore (a deleted entry's current version), each under its own key. */
  async function restore(target: { id: string; version: number }) {
    if (acting.current) return;
    acting.current = true;
    const slot = `restore:${target.id}`;
    const key = keys.keyFor(slot, target);
    setBusy(true);
    try {
      await resources.restoreTransaction(target.id, target.version, key);
      keys.settle(slot);
      setDeleted(null);
      setGone(false);
      setPending(null);
      setNotice(null);
    } catch (problem) {
      const result = saveProblem(problem, tc);
      if (!result.unconfirmed) {
        keys.settle(slot);
        setDeleted(null);
      }
      setPending(result.unconfirmed ? 'restore' : null);
      setNotice(result.message);
      // A definite refusal: read the entry again, so a deleted one never looks live.
      if (!result.unconfirmed) void load();
      return;
    } finally {
      acting.current = false;
      setBusy(false);
    }
    void load();
  }

  async function settleDraft(commandId: string, how: 'remove' | 'discard') {
    if (!diary) return;
    leaving.current = true;
    try {
      if (how === 'remove') await diary.removeDraft(commandId);
      else await diary.discardDraft(commandId);
      goBack();
    } catch {
      leaving.current = false;
      setNotice(tc("Couldn't change this device's copy. Try again."));
    }
  }

  const pressKey = (key: KeypadKey) => {
    setEditing((current) => (current && !current.unconfirmed ? { ...current, keypad: applyKey(current.keypad, key), errors: { ...current.errors, amount_minor: undefined } } : current));
  };

  const context = (lookups: Lookups): DetailContext => ({ lookups, tc, locale, dateTag: dateTagFor(locale) });
  const editHeading = editing && !editing.conflict;
  const showBack = !editing;

  let body: ReactNode;
  // While editing: the message and the actions, pinned under the scrolling form (ActionFooter.tsx).
  let footer: ReactNode = null;
  if (draftCommand) {
    const detail = recordDetail({ kind: 'draft', command: draftCommand }, context(lookupsOf(diaryView.wallets, diaryView.categories)));
    body = (
      <>
        <Receipt detail={detail} minor={draftCommand.payload.amount_minor} date={draftCommand.payload.occurred_on} />
        {notice ? <Notice tone="alert" message={notice} /> : null}
        <View style={{ gap: BUN_SPACE.sm }}>
          <PillButton kind="secondary" label={tc('Copy')} onPress={() => router.push(copyHref(detail.recordId))} />
          {detail.actions.undo ? <PillButton kind="secondary" label={tc('Remove')} onPress={() => void settleDraft(draftCommand.commandId, 'remove')} /> : null}
          {detail.actions.discard ? <PillButton kind="secondary" label={tc('Discard')} onPress={() => void settleDraft(draftCommand.commandId, 'discard')} /> : null}
        </View>
      </>
    );
  } else if (loaded.state === 'loading') {
    body = <LoadingBlock label={tc('Loading your diary')} />;
  } else if (loaded.state === 'error') {
    const missing = loaded.error instanceof V1Error && (loaded.error.outcome === 'not_found' || loaded.error.outcome === 'deleted');
    const problem = classifyLoadProblem(loaded.error, tc);
    body = missing
      ? <Notice tone="alert" message={gone ? tc('This entry was deleted on another device.') : tc("This entry isn't in your diary.")} />
      : <Notice tone="alert" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: () => void load() } : undefined} />;
  } else {
    const { record, wallets, categories } = loaded;
    const lookups = lookupsOf(wallets, categories);
    const detail = recordDetail({ kind: 'confirmed', record }, context(lookups));
    const frozen = pending !== null;
    if (deleted) {
      // Deleted here: the receipt stays for reference and the undo bar restores it.
      body = (
        <>
          <Receipt detail={detail} minor={record.amount_minor} date={record.occurred_on} />
          {notice ? <Notice tone="alert" message={notice} /> : null}
        </>
      );
    } else if (record.deleted_at || gone) {
      const restorable = record.deleted_at
        ? recentlyDeletedModel({ records: [record], now: now ?? new Date(), lookups, tc, locale }).rows[0]
        : undefined;
      body = (
        <>
          <Notice tone="alert" message={gone ? tc('This entry was deleted on another device.') : tc('This entry was already deleted.')} />
          {notice ? <Notice tone="alert" message={notice} /> : null}
          {restorable ? (
            <View style={{ gap: BUN_SPACE.xs }}>
              <BunText tone="muted">{restorable.daysLeftText}</BunText>
              <PillButton label={pending === 'restore' ? tc('Try again') : tc('Restore')} busy={busy} onPress={() => void restore({ id: record.id, version: restorable.version })} />
            </View>
          ) : null}
        </>
      );
    } else if (editing?.conflict) {
      body = <ConflictPanel editing={editing} server={editing.conflict} context={context(lookups)} busy={busy}
        onApply={() => void submitEdit({ ...editing, draft: rebaseEdit(editing.draft, editing.conflict as TransactionDto), conflict: null })}
        onReload={() => {
          setEditing(null);
          setNotice(null);
          void load();
        }} />;
    } else if (editing) {
      const keypadProblem = editing.keypad.problem ? tc(KEYPAD_PROBLEM_TEXT[editing.keypad.problem]) : null;
      const amountProblem = keypadProblem ?? editing.errors.amount_minor ?? null;
      const locked = editing.unconfirmed;
      const setDraft = (patch: Partial<EditDraft>) => setEditing((current) => (current && !current.unconfirmed ? { ...current, draft: { ...current.draft, ...patch }, errors: {} } : current));
      body = (
        <View style={{ gap: BUN_SPACE.md }}>
          <AmountLine keypad={editing.keypad} />
          {amountProblem ? <FieldProblem message={amountProblem} /> : null}
          <View style={{ gap: BUN_SPACE.xxs }}>
            <BunText variant="caption" tone="muted">{tc('Date')}</BunText>
            <DateChip value={editing.draft.occurredOn} today={today} earliest={earliestDate(record, wallets)} disabled={locked} onChange={(occurredOn) => setDraft({ occurredOn })} />
            {editing.errors.occurred_on ? <FieldProblem message={editing.errors.occurred_on} /> : null}
          </View>
          <NoteField kind="note" value={editing.draft.note} editable={!locked} error={editing.errors.note} onChangeText={(note) => setDraft({ note })} />
          <NoteField kind="merchant" value={editing.draft.merchant} editable={!locked} error={editing.errors.merchant} onChangeText={(merchant) => setDraft({ merchant })} />
          <Keypad onKey={pressKey} disabled={locked || busy} />
        </View>
      );
      footer = (
        <ActionFooter testID="record-edit-footer">
          {editing.message ? <Notice tone="alert" message={editing.message} /> : null}
          {locked ? (
            <PillButton label={tc('Try again')} busy={busy} onPress={() => void submitEdit(editing)} />
          ) : (
            <ActionRow
              secondary={<PillButton kind="secondary" label={tc('Cancel')} disabled={busy} onPress={() => setEditing(null)} />}
              primary={<PillButton label={tc('Save changes')} busy={busy} onPress={() => void submitEdit(editing)} />}
            />
          )}
        </ActionFooter>
      );
    } else {
      body = (
        <>
          <Receipt detail={detail} minor={record.amount_minor} date={record.occurred_on} />
          {notice ? (
            <Notice tone="alert" message={notice} action={pending === 'delete' ? { label: tc('Try again'), busy, onPress: () => void remove(record) } : undefined} />
          ) : null}
          {frozen ? null : (
            <View style={{ gap: BUN_SPACE.sm }}>
              <PillButton label={tc('Edit')} disabled={busy} onPress={() => {
                setNotice(null);
                setEditing(startEdit(record));
              }} />
              <PillButton kind="secondary" label={tc('Copy')} onPress={() => router.push(copyHref(record.id))} />
              <PillButton kind="secondary" label={tc('Delete')} busy={busy} onPress={() => void remove(record)} />
            </View>
          )}
        </>
      );
    }
  }

  return (
    <EntryPage testID="record-screen">
      <ScrollView testID="record-scroll" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: footer ? BUN_SPACE.sm : BUN_SPACE.xl, gap: BUN_SPACE.md }} keyboardShouldPersistTaps="handled">
        {/* The stage names the screen; Back is its own 44 pt button there, left out while editing (Cancel leaves the edit). */}
        <StageHeader title={editHeading ? tc('Edit entry') : tc('Entry')} back={showBack ? { onPress: goBack } : undefined} />
        <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>{body}</View>
      </ScrollView>
      {deleted ? (
        <View style={{ paddingHorizontal: BUN_SPACE.md, paddingBottom: insets.bottom + BUN_SPACE.md }}>
          <UndoBar message={tc('Entry deleted')} onUndo={() => void restore(deleted)} />
        </View>
      ) : null}
      {footer}
    </EntryPage>
  );
}

/**
 * The keypad's amount as it is typed, spoken as the exact amount whenever it
 * is one. A sum shows what was typed and, as Quick add does, its exact
 * result live ("100 ÷ 3" then "฿33.33"), so what Save sends is never a
 * surprise. It is a polite live region.
 */
function AmountLine({ keypad }: { keypad: KeypadState }) {
  const tc = useCopy();
  const locale = useMoneyLocale();
  const display = keypadDisplay(keypad);
  const sum = keypadHasOperator(keypad);
  const outcome = evaluateKeypad(keypad, { allowZero: sum });
  const result = outcome.ok ? formatMinor(outcome.minor, locale) : null;
  const value = sum ? (result ? `${display} = ${result}` : display) : (result ?? display);
  return (
    <View testID="edit-amount" {...POLITE_LIVE_REGION} accessible accessibilityLabel={tc('{label}, {value}', { label: tc('Amount'), value })} style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted">{tc('Amount')}</BunText>
      {sum || display.includes('.') ? <BunText variant="label" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{display}</BunText> : null}
      <BunText variant="hero" style={{ fontVariant: ['tabular-nums'] }}>{result ?? (sum ? display : `฿${display}`)}</BunText>
    </View>
  );
}

/** "Yours" against "On the server", field by field, with Reload or an explicit "Apply my change". */
function ConflictPanel({ editing, server, context, busy, onApply, onReload }: {
  editing: Editing; server: TransactionDto; context: DetailContext; busy: boolean; onApply: () => void; onReload: () => void;
}) {
  const tc = useCopy();
  const colors = useBunColors();
  const dateLocale = useDateLocale();
  const model = conflictModel(editing.draft, server, context);
  useAnnouncement(model.message);
  if (model.kind === 'deleted') return <Notice tone="alert" message={model.message} />;
  const full = (date: string) => fullDateLabel(date, dateLocale);
  const rows = model.rows.map((row) => (row.key === 'date' ? { ...row, yours: full(row.youChanged ? editing.draft.occurredOn : server.occurred_on), server: full(server.occurred_on) } : row));
  const replaces = tc('Applying your change replaces this.');
  return (
    <View
      testID="conflict"
      {...POLITE_LIVE_REGION}
      style={{ gap: BUN_SPACE.sm, padding: BUN_SPACE.md, borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.card }}
    >
      <BunText variant="heading" role="heading" accessibilityRole="header">{model.message}</BunText>
      <View aria-hidden style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
        <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{model.yoursLabel}</BunText>
        <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{model.serverLabel}</BunText>
      </View>
      {rows.map((row) => {
        const spoken = tc('{label}. {yoursLabel}: {yours}. {serverLabel}: {server}.', { label: row.label, yoursLabel: model.yoursLabel, yours: row.yours, serverLabel: model.serverLabel, server: row.server });
        return (
          <View key={row.key} accessible accessibilityLabel={row.differs ? `${spoken} ${replaces}` : spoken} style={{ gap: BUN_SPACE.xxs, paddingTop: BUN_SPACE.xs, borderTopWidth: BUN_OUTLINE.rule, borderColor: colors.rule }}>
            <BunText variant="caption" tone="muted">{row.label}</BunText>
            <View style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
              <BunText style={{ flex: 1, fontWeight: row.differs ? '700' : '400' }}>{row.yours}</BunText>
              <BunText style={{ flex: 1 }}>{row.server}</BunText>
            </View>
            {row.differs ? <BunText variant="caption">{replaces}</BunText> : null}
          </View>
        );
      })}
      <View style={{ gap: BUN_SPACE.sm }}>
        <PillButton label={model.keepMine} busy={busy} onPress={onApply} />
        <PillButton kind="secondary" label={tc('Reload')} disabled={busy} onPress={onReload} />
      </View>
    </View>
  );
}
