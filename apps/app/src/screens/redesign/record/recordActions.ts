// The record screen's rules (R3). RecordScreen only renders what this hook returns.
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
//
// In the `conflict` redesign area (C16, 1D-T9) a refused edit is kept on this
// phone as a pending choice instead, and `choicePanel` gives 1D's ChoicePanel
// its props: "Use yours" (the same changes on the server's current version,
// under the `choice:<id>` key), "Use the server's" (drop it, send nothing) and
// "Decide later" (leave, still kept). Opening a record that has a choice reads
// the record first: a choice the server already holds clears itself.
// `editing.conflict` stays the signal that a conflict is up, so
// cancelEditing's notice rule holds for the choice too.
import { isTransactionSnapshot } from '@gogospend/contracts';
import type { CategoryDto, TransactionDto, WalletDto } from '@gogospend/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { trackConflictShown } from '@mobile/analytics/events';
import { V1Error } from '@mobile/api/client';
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { bangkokClock } from '@mobile/spend/v1/redesign/account/privacyModel';
import { choiceAgainst, choiceSettled, draftFromChoice, resendForChoice } from '@mobile/spend/v1/redesign/pendingChoice';
import type { FieldErrors } from '@mobile/spend/v1/redesign/quickAddModel';
import { buildEditChanges, conflictModel, editDraftFrom, rebaseEdit } from '@mobile/spend/v1/redesign/recordModel';
import type { ConflictModel, EditDraft } from '@mobile/spend/v1/redesign/recordModel';
import { dateTagFor, openDrafts } from '@mobile/spend/v1/redesign/shared';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import type { OutboxCommand, PendingChoice } from '@mobile/storage/types';
import { fullDateLabel } from '@mobile/ui/dateStep';
import type { DateLocale } from '@mobile/ui/dateStep';
import { applyKey, keypadFromMinor, settleForSave } from '@mobile/ui/keypadExpression';
import type { KeypadKey, KeypadProblem, KeypadState } from '@mobile/ui/keypadExpression';
import { saveProblem, useCommandKeys, useMoneyLocale } from '../../v1/parts';
import type { ChoicePanelProps } from '../conflict/ChoicePanel';
import { useConflictCopy } from '../conflict/conflictCopy.draft';
import { useDateLocale, useGoBack } from '../HistoryParts';

export type RecordLoaded =
  | { state: 'loading' }
  | { state: 'ready'; record: TransactionDto; wallets: WalletDto[]; categories: CategoryDto[] }
  | { state: 'error'; error: unknown };

export type RecordEditing = {
  draft: EditDraft;
  keypad: KeypadState;
  errors: FieldErrors;
  message: string | null;
  /** The server's current record after a conflict (validated). */
  conflict: TransactionDto | null;
  /** The save may have committed: everything is frozen and only "Try again" resends it. */
  unconfirmed: boolean;
};

export type RecordActionsState = {
  today: string;
  /** The record is still a draft on this phone. */
  draftCommand: OutboxCommand | undefined;
  loaded: RecordLoaded;
  editing: RecordEditing | null;
  /** The undo bar restores this version. */
  deleted: { id: string; version: number } | null;
  /** An outcome unknown: frozen until Try again. */
  pending: 'delete' | 'restore' | null;
  /** An edit learned it was deleted elsewhere. */
  gone: boolean;
  notice: string | null;
  busy: boolean;
  load(): Promise<void>;
  startEditing(): void;
  cancelEditing(): void;
  changeEditing(change: (current: RecordEditing) => RecordEditing): void;
  pressKey(key: KeypadKey): void;
  submitEdit(): Promise<void>;
  remove(record: TransactionDto): Promise<void>;
  restore(target: { id: string; version: number }): Promise<void>;
  settleDraft(commandId: string, how: 'remove' | 'discard'): Promise<void>;
  /** C16 (the `conflict` area): the open choice's panel props, or null. P2-T27 reads it by this name. */
  choicePanel: ChoicePanelProps | null;
  /** C16: "Discard my change" while a choice is open; the screen offers it where the record is deleted or gone. */
  discardChoice: (() => Promise<void>) | null;
};

export const KEYPAD_PROBLEM_TEXT: Readonly<Record<KeypadProblem, string>> = {
  empty: 'Enter an amount',
  zero: 'Enter an amount above zero',
  too_precise: 'Use at most two decimal places',
  too_large: 'Amounts go up to ฿999,999,999.99',
  negative: "The sum can't go below zero.",
  divide_by_zero: "You can't divide by zero.",
};

export const lookupsOf = (wallets: readonly { id: string; name: string }[], categories: readonly CategoryDto[]): Lookups => ({
  wallets: new Map(wallets.map((wallet) => [wallet.id, wallet])),
  categories: new Map(categories.map((category) => [category.id, category])),
});

export const startEdit = (record: TransactionDto): RecordEditing => ({
  draft: editDraftFrom(record), keypad: keypadFromMinor(record.amount_minor), errors: {}, message: null, conflict: null, unconfirmed: false,
});

/** The latest tracking start of the wallets an entry touches: its date cannot go before it. */
export function earliestDate(record: TransactionDto, wallets: readonly WalletDto[]): string | undefined {
  const ids = record.type === 'transfer' ? [record.source_wallet_id, record.destination_wallet_id] : [record.wallet_id];
  const starts = ids.map((id) => wallets.find((wallet) => wallet.id === id)?.tracking_start).filter((start): start is string => Boolean(start));
  return starts.sort().at(-1);
}

/** The route pattern conflict_shown names, never the record's id. */
const RECORD_SCREEN = '/spend/record/[id]';

/** C16: a choice open on this screen, and whether this phone's diary keeps it. */
type OpenChoice = { choice: PendingChoice; kept: boolean };

/** The edit the choice panel compares: the person's change over the record they opened, against `server`. */
export function editingFromChoice(choice: PendingChoice, server: TransactionDto): RecordEditing {
  const draft = draftFromChoice(choice);
  return { draft, keypad: keypadFromMinor(draft.amountMinor), errors: {}, message: null, conflict: server, unconfirmed: false };
}

/** The date row in the kit's words for the active locale, as today's ConflictPanel shows it. */
function withFullDates(model: Extract<ConflictModel, { kind: 'changed' }>, draft: EditDraft, server: TransactionDto, locale: DateLocale): Extract<ConflictModel, { kind: 'changed' }> {
  const full = (date: string) => fullDateLabel(date, locale);
  const rows = model.rows.map((row) => (row.key === 'date' ? { ...row, yours: full(row.youChanged ? draft.occurredOn : server.occurred_on), server: full(server.occurred_on) } : row));
  return { ...model, rows };
}

/** The read could not reach the server: the choice compares with the record it stored. */
const unreachable = (error: unknown) => error instanceof V1Error && (error.outcome === 'network' || error.outcome === 'unavailable');

export function useRecordActions(input: { id: string; mode: 'view' | 'edit'; now?: Date; conflictArea?: boolean }): RecordActionsState {
  const { id, mode, now } = input;
  const resources = useSpendV1();
  const tc = useCopy();
  const copy = useConflictCopy();
  const locale = useMoneyLocale();
  const dateLocale = useDateLocale();
  const keys = useCommandKeys();
  const diary = useSpendDiary();
  const diaryView = useDiaryView();
  const goBack = useGoBack();
  const today = todayInBangkok(now ?? new Date());
  const clock = () => (now ?? new Date()).toISOString();
  /** C16's choice flow: the `conflict` area, or the caller's word (the catalogue's choice sections pass true). */
  const choicesOn = input.conflictArea ?? isRedesignEnabled('conflict');

  const draftCommand = diaryView.phase === 'ready' ? openDrafts(diaryView.outbox).find((command) => command.payload.id === id) : undefined;
  const fromDevice = draftCommand !== undefined;

  const [loaded, setLoaded] = useState<RecordLoaded>({ state: 'loading' });
  const [editing, setEditingState] = useState<RecordEditing | null>(null);
  // Actions read the edit synchronously. Apply used to hand submitEdit a rebased
  // draft in the same turn; the ref keeps that, and the state is what renders.
  const editingRef = useRef<RecordEditing | null>(null);
  editingRef.current = editing;
  const setEditing = useCallback((action: RecordEditing | null | ((current: RecordEditing | null) => RecordEditing | null)) => {
    const next = typeof action === 'function' ? action(editingRef.current) : action;
    editingRef.current = next;
    setEditingState(next);
  }, []);
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
  /** C16: the choice open on this screen. The screen's own truth; the diary keeps the copy that outlives it. */
  const [open, setOpenState] = useState<OpenChoice | null>(null);
  const openRef = useRef<OpenChoice | null>(null);
  const setOpen = useCallback((next: OpenChoice | null) => {
    openRef.current = next;
    setOpenState(next);
  }, []);
  /** C16: the last read could not reach the server, so the panel compares with the stored record and cannot send yours. */
  const [offline, setOffline] = useState(false);

  /** The record's stored choice, read from the diary now (never a render behind). */
  const storedChoice = useCallback((): PendingChoice | null => {
    const view = diary?.getView();
    return view?.phase === 'ready' ? view.pendingChoices.find((choice) => choice.recordId === id) ?? null : null;
  }, [diary, id]);

  /** Keeps a choice in the diary while one is open; otherwise (web, locked, a failed write) on this screen only. */
  const keepOpen = useCallback(async (choice: PendingChoice) => {
    let kept = false;
    if (diary && diary.getView().phase === 'ready') {
      try {
        await diary.keepChoice(choice);
        kept = true;
      } catch {
        kept = false;
      }
    }
    setOpen({ choice, kept });
  }, [diary, setOpen]);

  /** Drops the open choice. A diary that refuses keeps its copy: the next open finds it settled, or offers it again. */
  const dropOpen = useCallback(async () => {
    const current = openRef.current;
    setOpen(null);
    if (current?.kept && diary) await diary.dropChoice(current.choice.recordId).catch(() => undefined);
  }, [diary, setOpen]);

  /** Reads the entry; what is on screen stays while it reloads. */
  const load = useCallback(async () => {
    const turn = ++generation.current;
    setLoaded((previous) => (previous.state === 'ready' ? previous : { state: 'loading' }));
    // C16: the record's choice, open on this screen or kept in the diary.
    const choice = choicesOn ? openRef.current?.choice ?? storedChoice() : null;
    if (choice && !openRef.current) setOpen({ choice, kept: true });
    try {
      const [record, wallets, categories] = await Promise.all([resources.transaction(id), resources.wallets(), resources.ensureBuiltinCategories()]);
      if (turn !== generation.current) return;
      setLoaded({ state: 'ready', record, wallets, categories });
      setOffline(false);
      if (choice && !record.deleted_at) {
        // Opening a record that has a choice reads the record first.
        autoEdit.current = false;
        if (choiceSettled(choice, record)) {
          // The server already holds the change: the choice clears itself and the record shows as usual.
          setEditing(null);
          await dropOpen();
          return;
        }
        // Otherwise the panel compares with the fresh record, which is also kept as the choice's server. It shows
        // in the same render as the record, so the receipt never flashes up first with Edit and Delete.
        const fresh: PendingChoice = { ...choice, server: choiceAgainst(choice, record) };
        setEditing(editingFromChoice(fresh, record));
        await keepOpen(fresh);
        return;
      }
      if (autoEdit.current && !record.deleted_at) {
        autoEdit.current = false;
        setEditing(startEdit(record));
      }
    } catch (error) {
      if (turn !== generation.current) return;
      setLoaded({ state: 'error', error });
      if (choice && unreachable(error)) {
        // Offline: the panel compares with the stored record, and yours waits for the network.
        autoEdit.current = false;
        setOffline(true);
        setEditing(editingFromChoice(choice, choice.server));
      }
    }
  }, [resources, id, setEditing, choicesOn, storedChoice, setOpen, keepOpen, dropOpen]);

  useEffect(() => {
    if (!fromDevice && !leaving.current) void load();
  }, [load, fromDevice]);

  async function submitEdit() {
    const seen = editingRef.current;
    if (!seen || acting.current) return;
    // C16: while a choice is up, Save is "Use yours", and Try again resends it under the same key.
    const choice = openRef.current?.choice;
    if (choicesOn && choice && seen.conflict) return sendYours(seen, seen.conflict, choice);
    if (loaded.state !== 'ready') return;
    const editedAt = clock();
    // Apply my change calls this while the conflict is still the editing state.
    // The send uses the server's version, and the panel stays up until the answer.
    const current = seen.conflict ? { ...seen, draft: rebaseEdit(seen.draft, seen.conflict), conflict: null } : seen;
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
        if (choicesOn) {
          // C16: the refused edit is kept on this phone until the person chooses, and said once, from this rule.
          await keepOpen({ recordId: result.id, original: draft.original, changes: result.changes, server: snapshot, editedAt, refusedAt: clock() });
          trackConflictShown({ screen: RECORD_SCREEN });
        }
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

  /** C16, "Use yours": the same changes on the server's current version, under the choice's own key. */
  async function sendYours(seen: RecordEditing, server: TransactionDto, choice: PendingChoice) {
    if (offline) return;
    const sent = resendForChoice(choice, server);
    const slot = `choice:${sent.id}`;
    const key = keys.keyFor(slot, { version: sent.version, changes: sent.changes });
    acting.current = true;
    setBusy(true);
    try {
      await resources.updateTransaction(sent.id, sent.version, sent.changes, key);
      keys.settle(slot);
      await dropOpen();
      setEditing(null);
      setNotice(null);
    } catch (problem) {
      const outcome = problem instanceof V1Error ? problem.outcome : undefined;
      const saved = saveProblem(problem, tc);
      if (!saved.unconfirmed) keys.settle(slot);
      const current = problem instanceof V1Error ? problem.current : undefined;
      const snapshot = isTransactionSnapshot(current) && current.id === sent.id ? current : null;
      if (outcome === 'deleted' || outcome === 'not_found' || (outcome === 'conflict' && snapshot?.deleted_at)) {
        // Gone: the deleted notice offers Restore and Discard my change; the choice stays until one is used.
        setEditing(null);
        setGone(true);
        void load();
      } else if (outcome === 'conflict' && snapshot) {
        // Changed again: keep the choice with the newer record and show it again.
        await keepOpen({ ...choice, server: snapshot, refusedAt: clock() });
        trackConflictShown({ screen: RECORD_SCREEN });
        setEditing({ ...seen, conflict: snapshot, message: null, unconfirmed: false });
      } else if (outcome === 'conflict') {
        setEditing(null);
        setNotice(tc('This entry changed on another device.'));
        void load();
      } else {
        // Unknown: frozen with only Try again (the same key) until it is confirmed; the choice stays kept.
        setEditing({ ...seen, unconfirmed: saved.unconfirmed, message: saved.message });
      }
      return;
    } finally {
      acting.current = false;
      setBusy(false);
    }
    void load();
  }

  /** C16, "Use the server's": drop the choice, send nothing, and read the record as it is. */
  async function useServer() {
    if (acting.current || editingRef.current?.unconfirmed) return;
    await dropOpen();
    cancelEditing();
    void load();
  }

  /** C16, "Decide later": leave the screen; the choice stays kept. */
  const decideLater = () => {
    leaving.current = true;
    goBack();
  };

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
      playHaptic('deleteDone');
    } catch (problem) {
      playHaptic('saveFailed');
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
      playHaptic('saveFailed');
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

  /** Today's Edit: clear the notice, then open the edit on the record you see. */
  const startEditing = () => {
    if (loaded.state !== 'ready') return;
    setNotice(null);
    setEditing(startEdit(loaded.record));
  };

  /** Leaves the edit. Reload on a conflict also clears the notice, as the screen did; Cancel on the form leaves it. */
  const cancelEditing = () => {
    if (editingRef.current?.conflict) setNotice(null);
    setEditing(null);
  };

  /** A field change. Nothing changes while an unconfirmed save waits for Try again, as with the keypad. */
  const changeEditing = (change: (current: RecordEditing) => RecordEditing) => {
    setEditing((current) => (current && !current.unconfirmed ? change(current) : current));
  };

  // C16: the panel's props while a choice is up and not frozen.
  let choicePanel: ChoicePanelProps | null = null;
  if (choicesOn && open && editing?.conflict && !editing.unconfirmed) {
    const references = loaded.state === 'ready' ? loaded : diaryView;
    const context = { lookups: lookupsOf(references.wallets, references.categories), tc, locale, dateTag: dateTagFor(locale) };
    const model = conflictModel(editing.draft, editing.conflict, context);
    if (model.kind === 'changed') {
      choicePanel = {
        model: withFullDates(model, editing.draft, editing.conflict, dateLocale),
        yoursAt: bangkokClock(open.choice.editedAt).time,
        busy,
        canSendYours: !offline,
        note: open.kept ? null : copy('cannotKeep'),
        onUseYours: () => void submitEdit(),
        onUseServer: () => void useServer(),
        onDecideLater: open.kept ? decideLater : undefined,
      };
    }
  }

  return {
    today, draftCommand, loaded, editing, deleted, pending, gone, notice, busy,
    load, startEditing, cancelEditing, changeEditing, pressKey, submitEdit, remove, restore, settleDraft,
    choicePanel, discardChoice: open ? dropOpen : null,
  };
}
