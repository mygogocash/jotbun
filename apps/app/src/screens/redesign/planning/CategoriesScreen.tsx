// R4 Planning: the Categories screen (plan §6.2, /spend/categories), behind
// the `planning` area until E2 checkpoint 2. It is opened from Budget, so the
// stage has Back.
//
// - The grid: Expense or Income, built-in and custom categories together,
//   each with its icon (a built-in's drawing, a custom one's initial) in its
//   colour and this month's limit; archived ones in a collapsed section, each
//   with Unarchive.
// - New category: a one-line name (the API's rule), a palette colour, an
//   optional limit for an expense category, and a live chip preview; the
//   action is pinned in the ActionFooter.
// - Edit: the name and colour (a built-in can go back to its default name,
//   label null), the limit, and Archive, which asks first in a sheet.
// - The limit is part of this month's budget: setting it replaces the whole
//   budget at the version read, with the overall limit unchanged, and is
//   refused before sending when the limits would add up to more than the
//   budget. With no budget this month it says a budget comes first and links
//   to Budget; it never creates one.
//
// Saving follows the R3 screens' rules: every change is an immutable command
// with its own key (`useCommandKeys`), sent in order (the category's, then
// the budget's). An unconfirmed command freezes the screen and only Try again
// is offered, which resends the very same commands under the same keys. A
// definite refusal settles the key, so a corrected save is a new command. A
// version conflict shows the category or budget as it now is beside yours,
// with Reload.
import type { BudgetDto, CategoryDto, CategoryType } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import type { V1Outcome } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { formatMinor } from '@mobile/spend/v1/money';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import {
  LABEL_PROBLEM_TEXT, afterCategoryAck, archiveCommand, budgetConflict, categoryConflict, checkLabel, commandSlot, draftName, editCategoryDraft,
  groupCategories, hasLimitField, limitProblem, newCategoryDraft, planSave, readConflict, readLimit, suggestColor,
} from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { CategoryCommand, CategoryDraft, CategoryItem, ConflictView, FormErrors } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { Translate } from '@mobile/spend/v1/redesign/shared';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthOf, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { EmptyState } from '@mobile/ui/EmptyState';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { ConfirmSheet } from '@mobile/ui/Sheet';
import { StageHeader } from '@mobile/ui/StageHeader';
import type { SaveProblem } from '../../v1/parts';
import { isOwnCreate, newId, ownCreateMatches, refusedBeforeProcessing, saveProblem, useCommandKeys, useLoad, useMoneyLocale } from '../../v1/parts';
import { ActionFooter, ActionRow, EntryPage } from '../ActionFooter';
import { LoadingBlock, Notice, useGoBack } from '../HistoryParts';
import { ArchivedSection, CategoryTile, ChipPreview, ConflictPanel, LabelField, LimitField, NoBudgetNote, SwatchPicker, TypeToggle } from './CategoryParts';

export type CategoriesScreenProps = {
  /** The clock, for tests; this month is its Bangkok month. */
  now?: Date;
};

type Loaded = { categories: CategoryDto[]; budget: BudgetDto | null };
type Form = { draft: CategoryDraft; errors: FormErrors };
/** What to say once every command is acknowledged, and the draft (if any) the commands came from. */
type Origin = { success: string; draft: CategoryDraft | null; seen: BudgetDto | null };
/** `idle`: nothing running. `saving`: commands are being sent. `unconfirmed`: one may have committed; frozen until Try again. */
type Status = 'idle' | 'saving' | 'unconfirmed';
type Conflict = { view: ConflictView; withYours: boolean };

/** The words for refusals whose shared wording speaks of an entry; the rest keep the shared words. */
const OWN_WORDS: Partial<Readonly<Record<V1Outcome, string>>> = {
  network: 'Not confirmed yet. Your changes are kept; try again.',
  unavailable: 'Not confirmed yet. Your changes are kept; try again.',
  invalid_response: 'Not confirmed yet. Your changes are kept; try again.',
  rate_limited: 'Too many changes at once. Your changes are kept; try again in a moment.',
  upgrade_required: 'Update Jotbun to keep saving. Your changes are kept.',
};
const SHARED_WORDS: readonly V1Outcome[] = ['policy_required', 'signed_out', 'session_changed'];

/** `saveProblem` (unconfirmed, blocked, fields) in a category's words. */
function categoryProblem(error: unknown, tc: Translate): SaveProblem {
  const problem = saveProblem(error, tc);
  const outcome = error instanceof V1Error ? error.outcome : undefined;
  const own = outcome ? OWN_WORDS[outcome] : undefined;
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

export function CategoriesScreen({ now }: CategoriesScreenProps = {}) {
  const resources = useSpendV1();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const router = useRouter();
  const goBack = useGoBack('/spend/budget');
  const keys = useCommandKeys();
  const month = monthOf(todayInBangkok(now ?? new Date()));
  const loaded = useLoad(async (): Promise<Loaded> => {
    const [categories, budget] = await Promise.all([resources.ensureBuiltinCategories(), resources.budget(month)]);
    return { categories, budget };
  }, [resources, month]);

  const [type, setType] = useState<CategoryType>('expense');
  const [form, setForm] = useState<Form | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
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

  const locked = status !== 'idle';
  const data = loaded.state === 'ready' ? loaded.data : null;

  /**
   * Sends the commands in order. Each acknowledged category command rebases
   * the open draft, so if a later one is refused, saving again sends only
   * what is left. The first unconfirmed one freezes the screen with the
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
          if (rebased) setForm((current) => (current ? { ...current, draft: rebased } : current));
          setConfirming(false);
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
      setConfirming(false);
      setForm(null);
      setStatus('idle');
      setDone(origin.success);
      // The grid shows the type just saved, so a new income category is in view.
      if (origin.draft) setType(origin.draft.type);
      // Reading the result is a separate load: its failure is a load problem, never an unconfirmed save.
      loaded.refresh();
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
      setForm(null);
      setMessage(tc('This category changed on another device.'));
      loaded.reload();
      return;
    }
    setMessage(problem.message);
    const fields = problem.fields;
    const errors: FormErrors = { label: fields.label, limit: fields.category_limits ?? fields.overall_limit_minor };
    setForm((current) => (current ? { ...current, errors } : current));
  }

  function tryAgain() {
    const stored = pending.current;
    if (stored && !resendBlocked) void send(stored.commands, stored.origin);
  }

  function reload() {
    setConflict(null);
    setForm(null);
    setMessage(null);
    loaded.reload();
  }

  function openForm(draft: CategoryDraft) {
    if (locked) return;
    setDone(null);
    setMessage(null);
    setForm({ draft, errors: {} });
  }

  function submit(current: Form, seen: BudgetDto | null) {
    if (locked || blocked) return;
    const plan = planSave(current.draft, { budget: seen, tc, locale });
    if (!plan.ok) {
      setForm({ ...current, errors: plan.errors });
      return;
    }
    if (plan.commands.length === 0) {
      setForm(null);
      return;
    }
    void send(plan.commands, { success: tc('Saved.'), draft: current.draft, seen });
  }

  /** Changes the draft, unless it is frozen; a field's old problem goes as it is edited. */
  function edit(patch: Partial<CategoryDraft>) {
    if (locked) return;
    setForm((current) => (current ? {
      draft: { ...current.draft, ...patch },
      errors: { label: 'label' in patch ? undefined : current.errors.label, limit: 'limitText' in patch || 'type' in patch ? undefined : current.errors.limit },
    } : current));
  }

  // -------------------------------------------------------------------------
  // What shows

  let title = tc('Categories');
  let body: ReactNode;
  let footer: ReactNode = null;
  let sheet: ReactNode = null;
  const footerMessage = message ? <Notice tone="alert" message={message} /> : null;
  const retry = <PillButton label={tc('Try again')} disabled={resendBlocked} onPress={tryAgain} />;

  if (loaded.state === 'loading') {
    body = <LoadingBlock label={tc('Loading your diary')} />;
  } else if (loaded.state === 'error') {
    const problem = classifyLoadProblem(loaded.error, tc);
    body = <Notice tone="alert" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: loaded.reload } : undefined} />;
  } else if (conflict) {
    title = form?.draft.mode === 'create' ? tc('New category') : form ? tc('Edit category') : tc('Categories');
    body = <ConflictPanel view={conflict.view} withYours={conflict.withYours} onReload={reload} />;
  } else if (form && data) {
    const { draft } = form;
    const seen = data.budget;
    const builtin = draft.builtinKey !== null;
    title = draft.mode === 'create' ? tc('New category') : tc('Edit category');
    // A name too long or not one line is said as it is typed; an empty one when saving.
    const live = checkLabel(draft.label, builtin);
    const labelError = form.errors.label ?? (!live.ok && live.problem !== 'empty' ? tc(LABEL_PROBLEM_TEXT[live.problem]) : null);
    // A limit over the total is said as it is typed; a mistyped amount when saving.
    const over = limitProblem(draft, { budget: seen, tc, locale });
    const limitError = form.errors.limit ?? (over && over.minor !== null ? over.message : null);
    const typedLimit = readLimit(draft.limitText, locale);
    const name = draftName(draft, tc);
    body = (
      <View style={{ gap: BUN_SPACE.md }}>
        {draft.mode === 'create' ? <TypeToggle value={draft.type} onChange={(next) => edit({ type: next })} disabled={locked} /> : null}
        <ChipPreview name={name} iconName={builtin ? name : draft.label.trim()} builtinKey={draft.builtinKey} color={draft.color} />
        <LabelField
          value={draft.label}
          onChangeText={(label) => edit({ label })}
          error={labelError}
          editable={!locked}
          placeholder={builtin ? draftName({ ...draft, label: '' }, tc) : undefined}
        />
        {builtin && draft.label.trim() !== '' ? (
          <PillButton kind="secondary" label={tc('Use the default name')} disabled={locked} onPress={() => edit({ label: '' })} />
        ) : null}
        <SwatchPicker value={draft.color} onChange={(color) => edit({ color })} disabled={locked} />
        {hasLimitField(draft, seen) ? (
          <LimitField
            value={draft.limitText}
            onChangeText={(limitText) => edit({ limitText })}
            error={limitError}
            editable={!locked}
            overall={formatMinor(seen.overall_limit_minor, locale)}
            preview={typedLimit.ok && typedLimit.minor !== null ? formatMinor(typedLimit.minor, locale) : null}
          />
        ) : draft.type === 'expense' ? (
          <NoBudgetNote onOpenBudget={() => router.push('/spend/budget')} />
        ) : null}
        {draft.mode === 'edit' && draft.base ? (
          <PillButton kind="secondary" label={tc('Archive category')} disabled={locked} onPress={() => setConfirming(true)} />
        ) : null}
      </View>
    );
    footer = (
      <ActionFooter testID="categories-footer">
        {footerMessage}
        {status === 'unconfirmed' ? retry : (
          <ActionRow
            secondary={<PillButton kind="secondary" label={tc('Cancel')} disabled={locked} onPress={() => {
              setMessage(null);
              setForm(null);
            }} />}
            primary={<PillButton
              label={draft.mode === 'create' ? tc('Add this category') : tc('Save changes')}
              busy={status === 'saving'}
              busyLabel={tc('Saving…')}
              disabled={blocked}
              onPress={() => submit(form, seen)}
            />}
          />
        )}
      </ActionFooter>
    );
    const base = draft.base;
    if (base) {
      sheet = (
        <ConfirmSheet
          visible={confirming}
          title={tc('Archive {name}?', { name })}
          consequence={tc("{name} won't show in Quick add any more. Past entries keep it, and you can unarchive it here any time.", { name })}
          confirmLabel={tc('Archive')}
          busy={status === 'saving'}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void send([archiveCommand(base, 'archive')], { success: tc('{name} is archived.', { name }), draft, seen })}
        />
      );
    }
  } else if (data) {
    const groups = groupCategories(data.categories, type, { tc, budget: data.budget });
    const limitWords = (item: CategoryItem) => (item.limitMinor === null ? null : tc('{amount} a month', { amount: formatMinor(item.limitMinor, locale) }));
    const unarchive = (item: CategoryItem) => {
      if (locked || blocked) return;
      setUnarchiving(item.category.id);
      void send([archiveCommand(item.category, 'unarchive')], { success: tc('{name} is back in Quick add.', { name: item.name }), draft: null, seen: data.budget });
    };
    body = (
      <View style={{ gap: BUN_SPACE.md }}>
        <TypeToggle value={type} onChange={setType} disabled={locked} />
        {done ? <Notice message={done} /> : null}
        <View testID="categories-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: BUN_SPACE.sm }}>
          {groups.active.map((item) => (
            <CategoryTile key={item.category.id} item={item} limit={limitWords(item)} disabled={locked} onPress={() => openForm(editCategoryDraft(item.category, data.budget))} />
          ))}
        </View>
        {groups.hasCustom ? null : (
          <EmptyState art={<Bun pose="thinking" size="m" />} title={tc('No categories of your own yet')} body={tc("Add one for anything the built-in categories don't cover.")} />
        )}
        {groups.archived.length > 0 ? (
          <ArchivedSection
            items={groups.archived}
            expanded={archivedOpen}
            onToggle={() => setArchivedOpen((open) => !open)}
            onUnarchive={unarchive}
            busyId={status === 'saving' ? unarchiving : null}
            disabled={locked || blocked}
          />
        ) : null}
      </View>
    );
    footer = (
      <ActionFooter testID="categories-footer">
        {footerMessage}
        {status === 'unconfirmed' ? retry : (
          <PillButton
            label={tc('New category')}
            disabled={locked || blocked}
            onPress={() => openForm(newCategoryDraft({ id: newId(), type, color: suggestColor(data.categories, type) }))}
          />
        )}
      </ActionFooter>
    );
  }

  // Back leaves the grid; the form leaves by Cancel (or Reload after a conflict).
  const showBack = !form && !conflict;
  return (
    <EntryPage testID="categories-screen">
      <ScrollView testID="categories-scroll" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: footer ? BUN_SPACE.sm : BUN_SPACE.xl, gap: BUN_SPACE.md }} keyboardShouldPersistTaps="handled">
        <StageHeader title={title} back={showBack ? { onPress: goBack } : undefined} />
        <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>{body}</View>
      </ScrollView>
      {footer}
      {sheet}
    </EntryPage>
  );
}
