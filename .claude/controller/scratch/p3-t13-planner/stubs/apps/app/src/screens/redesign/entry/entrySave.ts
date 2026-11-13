// Quick add's save rules, cut from the form: finish, the online send, save,
// and the cheer-day read. A caller may pass the track of this attempt; a
// resend keeps the first attempt's track. `finish` is the rule that saves, so
// it sends the one record_saved for a save that carries a track (1D-T7, R61):
// after the device commit or the server's acknowledgement, never for a
// conflict, and never the amount, the note or a name. The track's source and
// photo flag are record_saved's (P3-T13). A caller may also name how the entry
// was made (`source`, H9), which the create and the device entry carry; a
// resend sends the first attempt's create, source and all. Quick add names
// none.
import { useEffect, useRef, useState } from 'react';

import type { TransactionSource, WalletSnapshot } from '@gogospend/contracts';
import { trackRecordSaved } from '@mobile/analytics/events';
import type { RecordSource } from '@mobile/analytics/events';
import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { buildQuickAdd } from '@mobile/spend/v1/redesign/quickAddModel';
import type { QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { useAmountWords } from '@mobile/ui/Amount';
import { keypadHasOperator, settleForSave } from '@mobile/ui/keypadExpression';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { isOwnCreate, ownCreateMatches, refusedBeforeProcessing, saveProblem, useCommandKeys } from '../../v1/parts';
import { readCheerDay, writeCheerDay } from '../quickAddCheer';
import { earliestFor, localSaveProblem } from './entryHelpers';
import type { CreateInput } from './entryHelpers';

/** record_saved's track: how the entry was made, its category's key, when it opened, and whether it carries a photo (absent is none). */
export type EntryTrack = { source: RecordSource; categoryKey: string | null; openedAt: number; hasPhoto?: boolean };
export type EntrySaveStatus = 'editing' | 'saving' | 'unconfirmed' | 'blocked' | 'saved' | 'conflict';
export type SavedEntry = { draft: QuickAddDraft; via: 'device' | 'online'; cheer: boolean; track: EntryTrack | null };
export type SaveAttempt = { settledKeypad: KeypadState | null; openDetails: boolean };
export type EntrySave = {
  status: EntrySaveStatus;
  message: string | null;
  errors: Readonly<Record<string, string>>;
  serverErrors: Readonly<Record<string, string>>;
  resendBlocked: boolean;
  saved: SavedEntry | null;
  locked: boolean;
  save(input: { draft: QuickAddDraft; keypad: KeypadState; wallets: readonly WalletSnapshot[]; track?: EntryTrack; source?: TransactionSource }): Promise<SaveAttempt>;
  another(): void;
};

type Errors = Record<string, string>;
type PendingSend = { input: CreateInput; fields: QuickAddDraft; track: EntryTrack | null };

const NOTHING: SaveAttempt = { settledKeypad: null, openDetails: false };

/**
 * What Save leaves on the keypad: a sum worked out, or a refused amount with
 * its problem; a plain amount stays as typed (null). Quick add shows it the
 * moment Save is pressed, before the save is on its way, as it always has.
 */
export function keypadShownOnSave(keypad: KeypadState): KeypadState | null {
  const settled = settleForSave(keypad);
  return !settled.outcome.ok || keypadHasOperator(keypad) ? settled.state : null;
}

export function useEntrySave(options: { today: string; onSaved?: (saved: SavedEntry) => void; savedHaptic?: 'quickAdd' | 'success' }): EntrySave {
  const { today, onSaved, savedHaptic = 'quickAdd' } = options;
  const resources = useSpendV1();
  const tc = useCopy();
  const keys = useCommandKeys();
  const diary = useSpendDiary();
  const diaryView = useDiaryView();
  const { intensity } = useBunIntensity();
  const words = useAmountWords();
  const [errors, setErrors] = useState<Errors>({});
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<EntrySaveStatus>('editing');
  const [saved, setSaved] = useState<SavedEntry | null>(null);
  // The command whose outcome is unknown: "Try again" resends exactly this, with the track of that first attempt.
  const unconfirmed = useRef<PendingSend | null>(null);
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
  // A refusal while unconfirmed that forbids resending for now (a changed session, an update): frozen, and Try again waits.
  const [resendBlocked, setResendBlocked] = useState(false);
  const locked = status === 'saving' || status === 'unconfirmed' || status === 'conflict';

  function finish(fields: QuickAddDraft, via: 'device' | 'online', track: EntryTrack | null) {
    const cheer = intensity === 'full' && cheerDay !== undefined && cheerDay !== today;
    if (cheer) {
      setCheerDay(today);
      void writeCheerDay(today);
    }
    unconfirmed.current = null;
    // Kept on this phone is a light tap: it is safe in the diary but has not
    // reached the server, and "saving" must never feel saved. Confirmed
    // online is success, and the day's first save gets the celebration.
    // `success` plays that landed tap for a phone-kept save too.
    const phoneKept = savedHaptic === 'success' ? 'saveLanded' : 'saveQueued';
    playHaptic(via === 'online' ? (cheer ? 'celebration' : 'saveLanded') : phoneKept);
    const savedEntry: SavedEntry = { draft: fields, via, cheer, track };
    setSaved(savedEntry);
    setStatus('saved');
    onSaved?.(savedEntry);
    if (track) {
      // Offline: kept on this phone while the diary's last sync did not end synced.
      const offline = via === 'device' && diaryView.outcome?.status !== 'synced';
      trackRecordSaved({ kind: fields.type, source: track.source, categoryKey: track.categoryKey, offline, secondsToSave: (Date.now() - track.openedAt) / 1000 });
    }
  }

  async function sendOnline(input: CreateInput, fields: QuickAddDraft, track: EntryTrack | null): Promise<boolean> {
    const key = keys.keyFor('create', input);
    setStatus('saving');
    setMessage(null);
    try {
      if ('source_wallet_id' in input) await resources.createTransfer(input, key);
      else await resources.createTransaction(input, key);
      keys.settle('create');
      finish(fields, 'online', track);
      return false;
    } catch (error) {
      // The record id is fixed for this draft: if it already exists, an
      // earlier attempt committed. Jotbun's copy is what is shown: the same
      // details are saved; other details are a conflict, never "Saved".
      if (isOwnCreate(error, input.id)) {
        keys.settle('create');
        unconfirmed.current = null;
        setResendBlocked(false);
        if (ownCreateMatches(error, input)) {
          finish(fields, 'online', track);
          return false;
        }
        const held = (error as V1Error).current as { amount_minor?: unknown } | undefined;
        const amount = typeof held?.amount_minor === 'string' ? words(held.amount_minor).shown : '';
        setMessage(tc('This entry is already saved in Jotbun as {amount}. Check it in History.', { amount }));
        playHaptic('saveFailed');
        setStatus('conflict');
        return false;
      }
      const problem = saveProblem(error, tc);
      // Once an attempt is unconfirmed, it stays frozen with its key until that
      // command's outcome is known: a refusal before processing (signed out,
      // terms, an update, a changed session) says nothing about it. Only an
      // answer the server processed settles it.
      const stillUnknown = problem.unconfirmed || (unconfirmed.current !== null && refusedBeforeProcessing(error));
      if (!stillUnknown) keys.settle('create');
      unconfirmed.current = stillUnknown ? { input, fields, track } : null;
      setResendBlocked(stillUnknown && problem.blocked);
      setServerErrors(problem.fields);
      setMessage(problem.message);
      const openDetails = Boolean(problem.fields.note || problem.fields.merchant);
      playHaptic('saveFailed');
      setStatus(stillUnknown ? 'unconfirmed' : problem.blocked ? 'blocked' : 'editing');
      return openDetails;
    }
  }

  async function save(input: { draft: QuickAddDraft; keypad: KeypadState; wallets: readonly WalletSnapshot[]; track?: EntryTrack; source?: TransactionSource }): Promise<SaveAttempt> {
    const track = input.track ?? null;
    if (status === 'saving' || status === 'saved' || status === 'blocked' || status === 'conflict' || resendBlocked) return NOTHING;
    // An online save whose outcome is unknown is resent online as itself, never re-queued on the device.
    const resend = status === 'unconfirmed' ? unconfirmed.current : null;
    if (resend) {
      const openDetails = await sendOnline(resend.input, resend.fields, resend.track);
      return { settledKeypad: null, openDetails };
    }
    // Save presses = for the user; a sum is shown worked out, a plain amount stays as typed.
    const settled = settleForSave(input.keypad);
    const settledKeypad = keypadShownOnSave(input.keypad);
    const fields: QuickAddDraft = { ...input.draft, amountMinor: settled.outcome.ok ? settled.outcome.minor : '' };
    // RED stub (P3-T13): the source is not passed on yet.
    const built = buildQuickAdd(fields, { today, tc });
    const next: Errors = built.ok ? {} : { ...built.errors };
    // The keypad itself says what is wrong with the amount.
    if (!settled.outcome.ok) delete next.amount_minor;
    const earliest = earliestFor(fields, input.wallets);
    if (!next.occurred_on && earliest !== null && fields.occurredOn < earliest) next.occurred_on = tc('This date is before the wallet started tracking.');
    setErrors(next);
    setServerErrors({});
    setMessage(null);
    if (!settled.outcome.ok || !built.ok || Object.keys(next).length > 0) {
      playHaptic('saveFailed');
      return { settledKeypad, openDetails: Boolean(next.note || next.merchant) };
    }
    if (diary && diaryView.phase === 'ready' && status !== 'unconfirmed') {
      setStatus('saving');
      try {
        await diary.saveDraft(built.entry, fields.commandId);
        finish(fields, 'device', track);
      } catch (error) {
        setMessage(localSaveProblem(error, tc));
        playHaptic('saveFailed');
        setStatus('editing');
      }
      return { settledKeypad, openDetails: false };
    }
    const openDetails = await sendOnline(built.input, fields, track);
    return { settledKeypad, openDetails };
  }

  function another() {
    if (!saved) return;
    setErrors({});
    setServerErrors({});
    setMessage(null);
    setSaved(null);
    setStatus('editing');
  }

  return { status, message, errors, serverErrors, resendBlocked, saved, locked, save, another };
}
