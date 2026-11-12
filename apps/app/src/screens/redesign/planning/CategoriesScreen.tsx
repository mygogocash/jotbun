// R4 Planning: the Categories screen (plan §6.2, /spend/categories), behind
// the `planning` area (on since E2 checkpoint 2). It is opened from Budget, so the
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
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { PACK_BEFORE_C3, missingPackItems, packCommands } from '@mobile/spend/v1/redesign/planning/thaiPack';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { formatMinor } from '@mobile/spend/v1/money';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import {
  LABEL_PROBLEM_TEXT, archiveCommand, checkLabel, draftName, editCategoryDraft,
  groupCategories, hasLimitField, limitProblem, newCategoryDraft, planSave, readLimit, suggestColor,
} from '@mobile/spend/v1/redesign/planning/categoriesModel';
import type { CategoryDraft, CategoryItem, FormErrors } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthOf, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { EmptyState } from '@mobile/ui/EmptyState';
import { BUN_SPACE } from '@mobile/ui/layout';
import { Card } from '@mobile/ui/Card';
import { BunText } from '@mobile/ui/BunText';
import { PillButton } from '@mobile/ui/PillButton';
import { ConfirmSheet } from '@mobile/ui/Sheet';
import { StageHeader } from '@mobile/ui/StageHeader';
import { newId, useLoad, useMoneyLocale } from '../../v1/parts';
import { ActionFooter, ActionRow, EntryPage } from '../ActionFooter';
import { LoadingBlock, Notice, useGoBack } from '../HistoryParts';
import { ArchivedSection, CategoryTile, ChipPreview, ConflictPanel, LabelField, LimitField, NoBudgetNote, SwatchPicker, TypeToggle } from './CategoryParts';
import { useCategoryCommands } from './categoryCommands';
import type { CategoryCommandsStatus, CategoryConflict, Origin } from './categoryCommands';

export type CategoriesScreenProps = {
  /** The clock, for tests; this month is its Bangkok month. */
  now?: Date;
};

type Loaded = { categories: CategoryDto[]; budget: BudgetDto | null };
type Form = { draft: CategoryDraft; errors: FormErrors };
type Status = CategoryCommandsStatus;
type Conflict = CategoryConflict;

export function CategoriesScreen({ now }: CategoriesScreenProps = {}) {
  const resources = useSpendV1();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const activeLocale = useActiveLocale();
  const companion = isRedesignEnabled('companion');
  const router = useRouter();
  const goBack = useGoBack('/spend/budget');
  const month = monthOf(todayInBangkok(now ?? new Date()));
  const loaded = useLoad(async (): Promise<Loaded> => {
    const [categories, budget] = await Promise.all([resources.ensureBuiltinCategories(), resources.budget(month)]);
    return { categories, budget };
  }, [resources, month]);

  const [type, setType] = useState<CategoryType>('expense');
  const [form, setForm] = useState<Form | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const commands = useCategoryCommands({
    onRebase: (draft) => setForm((current) => (current ? { ...current, draft } : current)),
    onRefused: (errors) => setForm((current) => (current ? { ...current, errors } : current)),
    onConflict: () => setConfirming(false),
    onStateChanged: () => {
      setForm(null);
      setConfirming(false);
    },
    onSuccess: (origin) => {
      setConfirming(false);
      setForm(null);
      if (origin.draft) setType(origin.draft.type);
    },
    onRefresh: () => loaded.refresh(),
    onReload: () => loaded.reload(),
  });

  const {
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
    setMessage,
    setDone,
    setUnarchiving,
  } = commands;

  const data = loaded.state === 'ready' ? loaded.data : null;

  function reload() {
    commands.reload();
    setForm(null);
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
    // Thai everyday categories (premium plan A2): today's seven until the screen switches to C3.
    const pack = companion ? missingPackItems(data.categories, PACK_BEFORE_C3) : [];
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
        {pack.length > 0 ? (
          <Card padding="sm" testID="thai-everyday-pack">
            <View style={{ gap: BUN_SPACE.xs }}>
              <BunText variant="heading">{tc('Thai everyday')}</BunText>
              <BunText tone="muted">{pack.map((item) => (activeLocale === 'th' ? item.th : item.en)).join(' · ')}</BunText>
              <PillButton
                kind="secondary"
                label={pack.length === 1 ? tc('Add 1 category') : tc('Add {count} categories', { count: pack.length })}
                disabled={locked || blocked}
                onPress={() => void send(packCommands(data.categories, activeLocale, newId, { pack: PACK_BEFORE_C3 }), { success: tc('Added. They are in Quick add now.'), draft: null, seen: data.budget })}
              />
            </View>
          </Card>
        ) : null}
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
