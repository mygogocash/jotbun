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
import { isTransactionSnapshot } from '@gogospend/contracts';
import type { CategoryDto, TransactionDto, WalletDto } from '@gogospend/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import type { FieldErrors } from '@mobile/spend/v1/redesign/quickAddModel';
import { buildEditChanges, editDraftFrom, rebaseEdit } from '@mobile/spend/v1/redesign/recordModel';
import type { EditDraft } from '@mobile/spend/v1/redesign/recordModel';
import { openDrafts } from '@mobile/spend/v1/redesign/shared';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import type { OutboxCommand } from '@mobile/storage/types';
import { applyKey, keypadFromMinor, settleForSave } from '@mobile/ui/keypadExpression';
import type { KeypadKey, KeypadProblem, KeypadState } from '@mobile/ui/keypadExpression';
import { saveProblem, useCommandKeys } from '../../v1/parts';
import { useGoBack } from '../HistoryParts';

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

export function useRecordActions(input: { id: string; mode: 'view' | 'edit'; now?: Date }): RecordActionsState {
  const { id, mode, now } = input;
  const resources = useSpendV1();
  const tc = useCopy();
  const keys = useCommandKeys();
  const diary = useSpendDiary();
  const diaryView = useDiaryView();
  const goBack = useGoBack();
  const today = todayInBangkok(now ?? new Date());

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
  }, [resources, id, setEditing]);

  useEffect(() => {
    if (!fromDevice && !leaving.current) void load();
  }, [load, fromDevice]);

  async function submitEdit() {
    const seen = editingRef.current;
    if (loaded.state !== 'ready' || !seen || acting.current) return;
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

  /** Cancel drops the edit. Reload also clears a notice, and Cancel never has one. */
  const cancelEditing = () => {
    setEditing(null);
    setNotice(null);
  };

  const changeEditing = (change: (current: RecordEditing) => RecordEditing) => {
    setEditing((current) => (current ? change(current) : current));
  };

  return {
    today, draftCommand, loaded, editing, deleted, pending, gone, notice, busy,
    load, startEditing, cancelEditing, changeEditing, pressKey, submitEdit, remove, restore, settleDraft,
  };
}
