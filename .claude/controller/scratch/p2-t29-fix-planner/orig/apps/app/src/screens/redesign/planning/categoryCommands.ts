// Category command sender and state (plan P2-T29, moved out of CategoriesScreen.tsx).
// Sends category commands (create, update, archive, unarchive, setBudget) under
// their command keys, rebases drafts on acknowledgement, handles unconfirmed
// states, and formats conflicts and refusals.
import type { BudgetDto, CategoryDto } from '@gogospend/contracts';
import { useRef, useState } from 'react';

import { V1Error } from '@mobile/api/client';
import type { V1Outcome } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import {
  SAVE_PROBLEM_WORDS, afterCategoryAck, budgetConflict, categoryConflict, commandSlot, readConflict,
} from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { CategoryCommand, CategoryDraft, ConflictView, FormErrors } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { Translate } from '@mobile/spend/v1/redesign/shared';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import type { SaveProblem } from '../../v1/parts';
import { isOwnCreate, ownCreateMatches, refusedBeforeProcessing, saveProblem, useCommandKeys, useMoneyLocale } from '../../v1/parts';

export type Origin = { success: string; draft: CategoryDraft | null; seen: BudgetDto | null };
export type CategoryCommandsStatus = 'idle' | 'saving' | 'unconfirmed';
export type CategoryConflict = { view: ConflictView; withYours: boolean };

/** Refusals that keep the shared words; those that speak of an entry are said in a category's (`SAVE_PROBLEM_WORDS`). */
const SHARED_WORDS: readonly V1Outcome[] = ['policy_required', 'signed_out', 'session_changed'];

/** `saveProblem` (unconfirmed, blocked, fields) in a category's words. */
export function categoryProblem(error: unknown, tc: Translate): SaveProblem {
  const problem = saveProblem(error, tc);
  const outcome = error instanceof V1Error ? error.outcome : undefined;
  const own = outcome ? SAVE_PROBLEM_WORDS[outcome] : undefined;
  if (own) return { ...problem, message: tc(own) };
  if ((outcome && SHARED_WORDS.includes(outcome)) || (outcome === 'invalid' && Object.keys(problem.fields).length > 0)) return problem;
  return { ...problem, message: tc('Could not save that. Try again.') };
}

/** Sends one command under its key. */
export function sendCommand(resources: SpendV1Resources, command: CategoryCommand, key: string) {
  if (command.slot === 'budget') return resources.setBudget(command.month, command.input, key, command.existing);
  switch (command.kind) {
    case 'create': return resources.createCategory(command.input, key);
    case 'update': return resources.updateCategory(command.id, command.version, command.changes, key);
    case 'archive': return resources.archiveCategory(command.id, command.version, key);
    case 'unarchive': return resources.unarchiveCategory(command.id, command.version, key);
  }
}

/** A refusal about the category's state (already archived, archived elsewhere, not archived): it changed elsewhere. */
export const stateChanged = (error: unknown) =>
  error instanceof V1Error && (error.outcome === 'not_found' || error.outcome === 'deleted' || 'archived' in (error.fields ?? {}));

export type CategoryCommandsOptions = {
  readonly onRebase?: (draft: CategoryDraft) => void;
  readonly onRefused?: (errors: FormErrors) => void;
  readonly onConflict?: (conflict: CategoryConflict) => void;
  readonly onStateChanged?: (message: string) => void;
  readonly onSuccess?: (origin: Origin) => void;
  readonly onRefresh?: () => void;
  readonly onReload?: () => void;
};

export function useCategoryCommands(options: CategoryCommandsOptions = {}) {
  const resources = useSpendV1();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const keys = useCommandKeys();

  const [status, setStatus] = useState<CategoryCommandsStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [resendBlocked, setResendBlocked] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [conflict, setConflict] = useState<CategoryConflict | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [unarchiving, setUnarchiving] = useState<string | null>(null);
  const pending = useRef<{ commands: readonly CategoryCommand[]; origin: Origin } | null>(null);
  const running = useRef(false);

  const locked = status !== 'idle';

  /**
   * Sends the commands in order. Each acknowledged category command rebases
   * the open draft, so if a later one is refused, saving again sends only
   * what is left. The first unconfirmed one freezes the screen with the
   * commands from it on, under their keys.
   */
  async function send(commands: readonly CategoryCommand[], origin: Origin): Promise<boolean> {
    if (running.current) return false;
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
          if (rebased && options.onRebase) options.onRebase(rebased);
          if (stillUnknown) {
            pending.current = { commands: commands.slice(index), origin: { ...origin, draft } };
            setResendBlocked(problem.blocked);
            setMessage(problem.message);
            setStatus('unconfirmed');
            return false;
          }
          pending.current = null;
          setResendBlocked(false);
          setBlocked(problem.blocked);
          setStatus('idle');
          refused(error, command, problem, { ...origin, draft });
          return false;
        }
      }
      pending.current = null;
      setResendBlocked(false);
      setStatus('idle');
      setDone(origin.success);
      if (options.onSuccess) options.onSuccess(origin);
      if (options.onRefresh) options.onRefresh();
      return true;
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
        const conf: CategoryConflict = { view: categoryConflict(origin.draft, copy.server, tc), withYours: origin.draft !== null };
        setConflict(conf);
        if (options.onConflict) options.onConflict(conf);
        return;
      }
      if (copy?.kind === 'budget' && origin.draft && origin.seen) {
        const conf: CategoryConflict = { view: budgetConflict(origin.draft, origin.seen, copy.server, { tc, locale }), withYours: true };
        setConflict(conf);
        if (options.onConflict) options.onConflict(conf);
        return;
      }
    }
    if (outcome === 'conflict' || stateChanged(error)) {
      // No usable copy of theirs: read everything again rather than loop on a stale version.
      const msg = tc('This category changed on another device.');
      setMessage(msg);
      if (options.onStateChanged) options.onStateChanged(msg);
      if (options.onReload) options.onReload();
      return;
    }
    setMessage(problem.message);
    const fields = problem.fields;
    const errors: FormErrors = { label: fields.label, limit: fields.category_limits ?? fields.overall_limit_minor };
    if (options.onRefused) options.onRefused(errors);
  }

  function tryAgain() {
    const stored = pending.current;
    if (stored && !resendBlocked) void send(stored.commands, stored.origin);
  }

  function reload() {
    setConflict(null);
    setMessage(null);
    if (options.onReload) options.onReload();
  }

  function reset() {
    pending.current = null;
    setResendBlocked(false);
    setBlocked(false);
    setStatus('idle');
    setMessage(null);
    setConflict(null);
    setDone(null);
    setUnarchiving(null);
  }

  return {
    status,
    message,
    resendBlocked,
    blocked,
    conflict,
    done,
    unarchiving,
    locked,
    send,
    tryAgain,
    reload,
    reset,
    setMessage,
    setDone,
    setConflict,
    setUnarchiving,
  };
}
