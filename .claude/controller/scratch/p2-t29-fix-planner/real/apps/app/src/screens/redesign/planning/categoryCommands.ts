// The Categories screen's commands (plan P2-T29, W2): today's `sendCommand`
// and `send`, with their keys, refusals and conflicts, moved out of
// CategoriesScreen.tsx unchanged, so the Bun diary's screen and the Bun
// Wallet's trays share one rule.
//
// Saving follows the R3 screens' rules: every change is an immutable command
// with its own key (`useCommandKeys`), sent in order (the category's, then
// the budget's). An unconfirmed command freezes the sender and only Try again
// is offered, which resends the very same commands under the same keys. A
// definite refusal settles the key, so a corrected save is a new command. A
// version conflict shows the category or budget as it now is beside yours.
//
// What the caller drew around a send (its form, the sheet that asked, its
// grid) is the caller's: `send` tells it through `host`, at exactly the points
// where today's screen changed its own state. Every path is told, so no caller
// leaves a sheet open after a failure.
import type { BudgetDto, CategoryDto } from '@gogospend/contracts';
import { useRef, useState } from 'react';

import { V1Error } from '@mobile/api/client';
import type { V1Outcome } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { SAVE_PROBLEM_WORDS, afterCategoryAck, budgetConflict, categoryConflict, commandSlot, readConflict } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { CategoryCommand, CategoryDraft, ConflictView, FormErrors } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { Translate } from '@mobile/spend/v1/redesign/shared';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import type { SaveProblem } from '../../v1/parts';
import { isOwnCreate, ownCreateMatches, refusedBeforeProcessing, saveProblem, useCommandKeys, useMoneyLocale } from '../../v1/parts';

/** What to say once every command is acknowledged, and the draft (if any) the commands came from. */
export type Origin = { success: string; draft: CategoryDraft | null; seen: BudgetDto | null };
/** `idle`: nothing running. `saving`: commands are being sent. `unconfirmed`: one may have committed; frozen until Try again. */
export type Status = 'idle' | 'saving' | 'unconfirmed';
export type Conflict = { view: ConflictView; withYours: boolean };

/** What the caller does at each point of a send, where today's screen changed its own state. */
export type CategoryCommandsHost = {
  /** A later command failed: the open draft, rebased on the commands acknowledged before it. */
  rebase(draft: CategoryDraft): void;
  /** The send stopped short, unconfirmed or refused: the sheet that asked closes. */
  stopped(): void;
  /** Every command was acknowledged. */
  saved(origin: Origin): void;
  /** It changed elsewhere and there is no usable copy of theirs: the draft goes and everything is read again. */
  changedElsewhere(): void;
  /** A refusal of the draft's own fields, said beside them. */
  fieldErrors(errors: FormErrors): void;
};

/** Refusals that keep the shared words; those that speak of an entry are said in a category's (`SAVE_PROBLEM_WORDS`). */
const SHARED_WORDS: readonly V1Outcome[] = ['policy_required', 'signed_out', 'session_changed'];

/** `saveProblem` (unconfirmed, blocked, fields) in a category's words. */
function categoryProblem(error: unknown, tc: Translate): SaveProblem {
  const problem = saveProblem(error, tc);
  const outcome = error instanceof V1Error ? error.outcome : undefined;
  const own = outcome ? SAVE_PROBLEM_WORDS[outcome] : undefined;
  if (own) return { ...problem, message: tc(own) };
  if ((outcome && SHARED_WORDS.includes(outcome)) || (outcome === 'invalid' && Object.keys(problem.fields).length > 0)) return problem;
  return { ...problem, message: tc('Could not save that. Try again.') };
}

/** Sends one command under its key. */
function sendCommand(resources: SpendV1Resources, command: CategoryCommand, key: string) {
  if (command.slot === 'budget') return resources.setBudget(command.month, command.input, key, command.existing);
  switch (command.kind) {
    case 'create': return resources.createCategory(command.input, key);
    case 'update': return resources.updateCategory(command.id, command.version, command.changes, key);
    case 'archive': return resources.archiveCategory(command.id, command.version, key);
    case 'unarchive': return resources.unarchiveCategory(command.id, command.version, key);
  }
}

/** A refusal about the category's state (already archived, archived elsewhere, not archived): it changed elsewhere. */
const stateChanged = (error: unknown) => error instanceof V1Error && (error.outcome === 'not_found' || error.outcome === 'deleted' || 'archived' in (error.fields ?? {}));

export function useCategoryCommands(host: CategoryCommandsHost) {
  const resources = useSpendV1();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const keys = useCommandKeys();
  const [status, setStatus] = useState<Status>('idle');
  /** A problem with the last send, said in the footer. */
  const [message, setMessage] = useState<string | null>(null);
  /** Frozen, and resending must wait (an update, a changed session): Try again is disabled. */
  const [resendBlocked, setResendBlocked] = useState(false);
  /** Saving cannot work until the person acts elsewhere (an update, a changed session): the draft stays, saving waits. */
  const [blocked, setBlocked] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  /** What the last finished change did, said politely on the grid. */
  const [done, setDone] = useState<string | null>(null);
  /** The unarchive being sent, for its busy button. */
  const [unarchiving, setUnarchiving] = useState<string | null>(null);
  /** The commands whose outcome is unknown: Try again resends exactly these. */
  const pending = useRef<{ commands: CategoryCommand[]; origin: Origin } | null>(null);
  const running = useRef(false);

  /**
   * Sends the commands in order. Each acknowledged category command rebases
   * the open draft, so if a later one is refused, saving again sends only
   * what is left. The first unconfirmed one freezes the sender with the
   * commands from it on, under their keys.
   */
  async function send(commands: readonly CategoryCommand[], origin: Origin) {
    if (running.current) return;
    running.current = true;
    const resend = pending.current !== null;
    let draft = origin.draft;
    setStatus('saving');
    setMessage(null);
    setDone(null);
    try {
      for (const [index, command] of commands.entries()) {
        const slot = commandSlot(command);
        const key = keys.keyFor(slot, command);
        try {
          const ack = await sendCommand(resources, command, key);
          keys.settle(slot);
          draft = draft ? afterCategoryAck(draft, command, ack.version) : null;
          continue;
        } catch (error) {
          // The category's id is fixed for this draft: if it already exists, an earlier attempt committed.
          if (command.slot === 'category' && command.kind === 'create' && isOwnCreate(error, command.input.id) && ownCreateMatches(error, command.input)) {
            keys.settle(slot);
            const held = (error as V1Error).current as CategoryDto;
            draft = draft ? afterCategoryAck(draft, command, held.version) : null;
            continue;
          }
          const problem = categoryProblem(error, tc);
          // Once unconfirmed, a refusal before processing says nothing about that attempt: it stays frozen with its key.
          const stillUnknown = problem.unconfirmed || (resend && index === 0 && refusedBeforeProcessing(error));
          if (!stillUnknown) keys.settle(slot);
          const rebased = draft;
          if (rebased) host.rebase(rebased);
          host.stopped();
          if (stillUnknown) {
            pending.current = { commands: commands.slice(index), origin: { ...origin, draft } };
            setResendBlocked(problem.blocked);
            setMessage(problem.message);
            setStatus('unconfirmed');
            return;
          }
          pending.current = null;
          setResendBlocked(false);
          setBlocked(problem.blocked);
          setStatus('idle');
          refused(error, command, problem, { ...origin, draft });
          return;
        }
      }
      pending.current = null;
      setResendBlocked(false);
      setStatus('idle');
      setDone(origin.success);
      host.saved(origin);
    } finally {
      running.current = false;
      setUnarchiving(null);
    }
  }

  /** A definite refusal: a conflict to show, a change made elsewhere, or a problem to fix here. */
  function refused(error: unknown, command: CategoryCommand, problem: SaveProblem, origin: Origin) {
    const outcome = error instanceof V1Error ? error.outcome : undefined;
    if (outcome === 'conflict') {
      const copy = readConflict(command, (error as V1Error).current);
      if (copy?.kind === 'category') {
        setConflict({ view: categoryConflict(origin.draft, copy.server, tc), withYours: origin.draft !== null });
        return;
      }
      if (copy?.kind === 'budget' && origin.draft && origin.seen) {
        setConflict({ view: budgetConflict(origin.draft, origin.seen, copy.server, { tc, locale }), withYours: true });
        return;
      }
    }
    if (outcome === 'conflict' || stateChanged(error)) {
      // No usable copy of theirs: read everything again rather than loop on a stale version.
      host.changedElsewhere();
      setMessage(tc('This category changed on another device.'));
      return;
    }
    setMessage(problem.message);
    const fields = problem.fields;
    host.fieldErrors({ label: fields.label, limit: fields.category_limits ?? fields.overall_limit_minor });
  }

  function tryAgain() {
    const stored = pending.current;
    if (stored && !resendBlocked) void send(stored.commands, stored.origin);
  }

  return { status, message, setMessage, resendBlocked, blocked, conflict, setConflict, done, setDone, unarchiving, setUnarchiving, send, tryAgain };
}
