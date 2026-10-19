// The Categories screen's view model (R4 Planning, plan §6.2). Pure
// TypeScript: no React, no React Native. Money stays exact (BigInt over
// canonical satang strings).
//
// - The grid: one type at a time, built-ins in their own order, then the
//   person's own categories by name; archived ones apart.
// - The palette: CATEGORY_COLORS, each with a name in words (a swatch is a
//   radio named for its colour).
// - The label: the API's own rule (`normalizeName`: NFC, trimmed, 1–80 code
//   points, one line, nothing invisible). A built-in left empty goes back to
//   its default name (label null); a custom category always needs one.
// - The limit (expense only): part of this month's budget. Setting it
//   replaces the whole month budget at the version read, with the overall
//   limit unchanged; the limits must still fit inside the overall limit.
// - A save is a list of immutable commands, sent in order: the category's
//   (create or update, only what changed), then the budget's. Once the first
//   is acknowledged the draft is rebased on it, so saving again sends only
//   what is left, exactly as before.
import {
  BUILTIN_CATEGORIES, CATEGORY_COLORS, MAX_BUDGET_CATEGORY_LIMITS, NAME_MAX_CHARS, isBudgetSnapshot, isCategorySnapshot, normalizeName,
} from '@gogospend/contracts';
import type {
  BudgetCategoryLimit, BudgetDto, BuiltinCategoryKey, CategoryDto, CategoryType, CreateCategoryRequest, Minor, SetMonthlyBudgetRequest, UpdateCategoryRequest,
} from '@gogospend/contracts';

import { AmountInputError, formatMinor, minorToInputText, parseAmountInput } from '../../money.ts';
import type { MoneyLocale } from '../../money.ts';
import { BUILTIN_LABELS, categoryName } from '../../viewModels.ts';
import type { Translate } from '../shared.ts';

// ---------------------------------------------------------------------------
// The palette

/** English names for CATEGORY_COLORS, in its order; the screens translate them. */
export const SWATCH_NAMES: readonly string[] = ['Orange', 'Coral', 'Pink', 'Yellow', 'Blue', 'Lavender', 'Sky blue', 'Ocean blue', 'Lilac', 'Purple', 'Lime', 'Green'];

export type Swatch = { readonly color: string; readonly name: string };
export const SWATCHES: readonly Swatch[] = CATEGORY_COLORS.map((color, index) => ({ color, name: SWATCH_NAMES[index] }));

/** A palette colour's English name; null for no colour or one outside today's palette. */
export function swatchName(color: string | null): string | null {
  return SWATCHES.find((swatch) => swatch.color === color)?.name ?? null;
}

/** The first palette colour no active category of this type uses yet (else the first). */
export function suggestColor(categories: readonly CategoryDto[], type: CategoryType): string {
  const used = new Set(categories.filter((category) => category.type === type && !category.archived).map((category) => category.color));
  return CATEGORY_COLORS.find((color) => !used.has(color)) ?? CATEGORY_COLORS[0];
}

/** A colour said in words: its name, "No colour", or "Custom colour" for one outside the palette. */
export function colourWords(color: string | null, tc: Translate): string {
  if (color === null) return tc('No colour');
  const name = swatchName(color);
  return name ? tc(name) : tc('Custom colour');
}

// ---------------------------------------------------------------------------
// The grid

export type CategoryItem = { readonly category: CategoryDto; readonly name: string; readonly custom: boolean; readonly limitMinor: Minor | null };
export type CategoryGroups = { readonly active: CategoryItem[]; readonly archived: CategoryItem[]; readonly hasCustom: boolean };

const BUILTIN_ORDER: readonly string[] = BUILTIN_CATEGORIES.map((builtin) => builtin.key);

function compareItems(a: CategoryItem, b: CategoryItem): number {
  const rank = (item: CategoryItem) => (item.category.builtin_key === null ? BUILTIN_ORDER.length : BUILTIN_ORDER.indexOf(item.category.builtin_key));
  return rank(a) - rank(b) || a.name.localeCompare(b.name) || a.category.id.localeCompare(b.category.id);
}

/** One type's categories as the grid shows them, each with this month's limit when the budget has one. */
export function groupCategories(categories: readonly CategoryDto[], type: CategoryType, context: { tc: Translate; budget: BudgetDto | null }): CategoryGroups {
  const items = categories
    .filter((category) => category.type === type)
    .map((category): CategoryItem => ({
      category,
      name: categoryName(category, context.tc),
      custom: category.builtin_key === null,
      limitMinor: limitOf(context.budget, category.id),
    }))
    .sort(compareItems);
  const active = items.filter((item) => !item.category.archived);
  return { active, archived: items.filter((item) => item.category.archived), hasCustom: active.some((item) => item.custom) };
}

// ---------------------------------------------------------------------------
// The label

export type LabelProblem = 'empty' | 'too_long' | 'not_one_line';
export const LABEL_PROBLEM_TEXT: Readonly<Record<LabelProblem, string>> = {
  empty: 'Give the category a name.',
  too_long: 'Use one line of up to 80 characters.',
  not_one_line: 'Use one line of up to 80 characters.',
};

/** Characters as the API counts them: code points of the NFC, trimmed text. */
export function labelLength(text: string): number {
  return [...text.normalize('NFC').trim()].length;
}

export type LabelCheck = { ok: true; label: string | null } | { ok: false; problem: LabelProblem };

const INVISIBLE = /^[\p{White_Space}\p{Cf}ᅟᅠㅤﾠ]*$/u;

/** The label to send: the API's normalized name, or null for a built-in's default name. */
export function checkLabel(text: string, builtin: boolean): LabelCheck {
  const trimmed = text.normalize('NFC').trim();
  if (INVISIBLE.test(trimmed)) return builtin ? { ok: true, label: null } : { ok: false, problem: 'empty' };
  try {
    return { ok: true, label: normalizeName(text, 'label') };
  } catch {
    return { ok: false, problem: labelLength(text) > NAME_MAX_CHARS ? 'too_long' : 'not_one_line' };
  }
}

// ---------------------------------------------------------------------------
// The limit

/** This category's limit in the month's budget, or null. */
export function limitOf(budget: BudgetDto | null, categoryId: string): Minor | null {
  return budget?.category_limits.find((limit) => limit.category_id === categoryId)?.limit_minor ?? null;
}

export type LimitProblem = 'invalid' | 'too_precise' | 'zero' | 'too_large';
export type LimitRead = { ok: true; minor: Minor | null } | { ok: false; problem: LimitProblem };

export const LIMIT_PROBLEM_TEXT: Readonly<Record<LimitProblem | 'too_many', string>> = {
  invalid: 'Enter an amount like 65 or 65.50',
  too_precise: 'Use at most two decimal places',
  zero: 'Enter an amount above zero',
  too_large: 'Amounts go up to ฿999,999,999.99',
  too_many: 'A budget holds up to 100 category limits.',
};

/** The limit as typed, in exact satang; empty means no limit. */
export function readLimit(text: string, locale: MoneyLocale): LimitRead {
  if (text.trim() === '') return { ok: true, minor: null };
  try {
    const minor = parseAmountInput(text, locale);
    return minor === '0' ? { ok: false, problem: 'zero' } : { ok: true, minor };
  } catch (error) {
    const problem = error instanceof AmountInputError ? error.problem : 'invalid';
    return { ok: false, problem: problem === 'too_precise' || problem === 'too_large' ? problem : 'invalid' };
  }
}

export type LimitsCheck = { ok: true; total: Minor } | { ok: false; problem: 'over_total'; total: Minor; overall: Minor } | { ok: false; problem: 'too_many' };

/** The month's category limits with this one set (or removed), sorted by category id as the API keeps them. */
function limitsWith(budget: BudgetDto, categoryId: string, limit: Minor | null): BudgetCategoryLimit[] {
  const others = budget.category_limits.filter((item) => item.category_id !== categoryId).map((item) => ({ ...item }));
  const next = limit === null ? others : [...others, { category_id: categoryId, limit_minor: limit }];
  return next.sort((a, b) => a.category_id.localeCompare(b.category_id));
}

/** Whether the limits, with this one set, still fit inside the month's overall budget (equal fits). */
export function checkLimits(budget: BudgetDto, categoryId: string, limit: Minor | null): LimitsCheck {
  const next = limitsWith(budget, categoryId, limit);
  if (next.length > MAX_BUDGET_CATEGORY_LIMITS) return { ok: false, problem: 'too_many' };
  const total = next.reduce((sum, item) => sum + BigInt(item.limit_minor), 0n);
  if (total > BigInt(budget.overall_limit_minor)) return { ok: false, problem: 'over_total', total: total.toString(), overall: budget.overall_limit_minor };
  return { ok: true, total: total.toString() };
}

/** The over-the-total problem in words, with both exact amounts. */
export function overTotalText(total: Minor, overall: Minor, context: { tc: Translate; locale: MoneyLocale }): string {
  return context.tc("Category limits would add up to {total}, more than this month's budget of {overall}.", {
    total: formatMinor(total, context.locale), overall: formatMinor(overall, context.locale),
  });
}

// ---------------------------------------------------------------------------
// Commands

export type BudgetCommand = { readonly slot: 'budget'; readonly kind: 'budget'; readonly month: string; readonly input: SetMonthlyBudgetRequest; readonly existing: { id: string; version: number } };
export type CategoryCommand =
  | { readonly slot: 'category'; readonly kind: 'create'; readonly input: CreateCategoryRequest }
  | { readonly slot: 'category'; readonly kind: 'update'; readonly id: string; readonly version: number; readonly changes: UpdateCategoryRequest }
  | { readonly slot: 'category'; readonly kind: 'archive' | 'unarchive'; readonly id: string; readonly version: number }
  | BudgetCommand;

/**
 * The month's whole budget with this category's limit set, removed or
 * changed, at the version read; null when the limit is what it was.
 */
export function budgetReplace(budget: BudgetDto, categoryId: string, limit: Minor | null): BudgetCommand | null {
  if (limitOf(budget, categoryId) === limit) return null;
  return {
    slot: 'budget',
    kind: 'budget',
    month: budget.month,
    input: { overall_limit_minor: budget.overall_limit_minor, category_limits: limitsWith(budget, categoryId, limit) },
    existing: { id: budget.id, version: budget.version },
  };
}

export function archiveCommand(category: CategoryDto, kind: 'archive' | 'unarchive'): CategoryCommand {
  return { slot: 'category', kind, id: category.id, version: category.version };
}

/** The command key's slot: one per category, one per month's budget. */
export function commandSlot(command: CategoryCommand): string {
  if (command.slot === 'budget') return `budget:${command.month}`;
  return `category:${command.kind === 'create' ? command.input.id : command.id}`;
}

// ---------------------------------------------------------------------------
// The form

export type CategoryDraft = {
  readonly mode: 'create' | 'edit';
  readonly id: string;
  readonly type: CategoryType;
  readonly builtinKey: BuiltinCategoryKey | null;
  /** The category as read; null while creating. */
  readonly base: CategoryDto | null;
  /** The label as typed; empty on a built-in means its default name. */
  readonly label: string;
  readonly color: string | null;
  /** The limit as typed; empty for none. */
  readonly limitText: string;
  /** This month's limit as read. */
  readonly baseLimit: Minor | null;
};

export function newCategoryDraft(input: { id: string; type: CategoryType; color: string | null }): CategoryDraft {
  return { mode: 'create', id: input.id, type: input.type, builtinKey: null, base: null, label: '', color: input.color, limitText: '', baseLimit: null };
}

export function editCategoryDraft(category: CategoryDto, budget: BudgetDto | null): CategoryDraft {
  const limit = limitOf(budget, category.id);
  return {
    mode: 'edit', id: category.id, type: category.type, builtinKey: category.builtin_key, base: category,
    label: category.label ?? '', color: category.color, limitText: limit === null ? '' : minorToInputText(limit), baseLimit: limit,
  };
}

/** The name the draft would show: what is typed, else a built-in's default name, else "Your category". */
export function draftName(draft: CategoryDraft, tc: Translate): string {
  const typed = draft.label.normalize('NFC').trim();
  if (typed !== '') return typed;
  return draft.builtinKey ? tc(BUILTIN_LABELS[draft.builtinKey]) : tc('Your category');
}

export type FormErrors = { readonly label?: string; readonly limit?: string };
export type SavePlan = { ok: true; commands: CategoryCommand[] } | { ok: false; errors: FormErrors };

/** Whether the limit field applies: expense categories, in a month that has a budget. */
export function hasLimitField(draft: CategoryDraft, budget: BudgetDto | null): budget is BudgetDto {
  return draft.type === 'expense' && budget !== null;
}

/** The limit's problem in words, or null; a limit over the total is said as soon as it is typed. */
export function limitProblem(draft: CategoryDraft, context: { budget: BudgetDto | null; tc: Translate; locale: MoneyLocale }): { message: string; minor: Minor | null } | null {
  const { budget, tc } = context;
  if (!hasLimitField(draft, budget)) return null;
  const read = readLimit(draft.limitText, context.locale);
  if (!read.ok) return { message: tc(LIMIT_PROBLEM_TEXT[read.problem]), minor: null };
  const fits = checkLimits(budget, draft.id, read.minor);
  if (fits.ok) return null;
  return { message: fits.problem === 'too_many' ? tc(LIMIT_PROBLEM_TEXT.too_many) : overTotalText(fits.total, fits.overall, context), minor: read.minor };
}

/** What a save sends, in order, or the problems that stop it before anything is sent. */
export function planSave(draft: CategoryDraft, context: { budget: BudgetDto | null; tc: Translate; locale: MoneyLocale }): SavePlan {
  const { budget, tc } = context;
  const errors: { label?: string; limit?: string } = {};
  const label = checkLabel(draft.label, draft.builtinKey !== null);
  if (!label.ok) errors.label = tc(LABEL_PROBLEM_TEXT[label.problem]);
  let limit: Minor | null = null;
  if (hasLimitField(draft, budget)) {
    const problem = limitProblem(draft, context);
    if (problem) errors.limit = problem.message;
    const read = readLimit(draft.limitText, context.locale);
    if (read.ok) limit = read.minor;
  }
  if (!label.ok || errors.limit) return { ok: false, errors };

  const commands: CategoryCommand[] = [];
  if (draft.mode === 'create' || !draft.base) {
    commands.push({ slot: 'category', kind: 'create', input: { id: draft.id, type: draft.type, label: label.label ?? '', color: draft.color } });
  } else {
    const changes: UpdateCategoryRequest = {};
    if (label.label !== draft.base.label) changes.label = label.label;
    if (draft.color !== draft.base.color) changes.color = draft.color;
    if (Object.keys(changes).length > 0) commands.push({ slot: 'category', kind: 'update', id: draft.base.id, version: draft.base.version, changes });
  }
  if (hasLimitField(draft, budget)) {
    const replace = budgetReplace(budget, draft.id, limit);
    if (replace) commands.push(replace);
  }
  return { ok: true, commands };
}

/** The draft once its category command is acknowledged: based on what was saved, at the new version. */
export function afterCategoryAck(draft: CategoryDraft, command: CategoryCommand, version: number): CategoryDraft {
  if (command.slot !== 'category') return draft;
  if (command.kind === 'create') {
    const { input } = command;
    return { ...draft, mode: 'edit', base: { id: input.id, type: input.type, builtin_key: null, label: input.label, color: input.color ?? null, archived: false, version } };
  }
  if (command.kind === 'update' && draft.base) return { ...draft, base: { ...draft.base, ...command.changes, version } };
  return draft;
}

// ---------------------------------------------------------------------------
// Conflicts

export type ConflictRow = { readonly key: string; readonly label: string; readonly yours: string; readonly server: string; readonly differs: boolean };
export type ConflictView = { readonly message: string; readonly rows: ConflictRow[] };
export type ServerCopy = { kind: 'category'; server: CategoryDto } | { kind: 'budget'; server: BudgetDto };

/** The server's copy from a version conflict, only when it is valid and about this command's category or month. */
export function readConflict(command: CategoryCommand, current: unknown): ServerCopy | null {
  if (command.slot === 'budget') return isBudgetSnapshot(current) && current.month === command.month ? { kind: 'budget', server: current } : null;
  const id = command.kind === 'create' ? command.input.id : command.id;
  return isCategorySnapshot(current) && current.id === id ? { kind: 'category', server: current } : null;
}

const row = (key: string, label: string, yours: string, server: string): ConflictRow => ({ key, label, yours, server, differs: yours !== server });

/** Yours (the draft, if there is one) beside the category as it now is. */
export function categoryConflict(draft: CategoryDraft | null, server: CategoryDto, tc: Translate): ConflictView {
  return {
    message: server.archived ? tc('This category was archived on another device.') : tc('This category changed on another device.'),
    rows: [
      row('name', tc('Name'), draft ? draftName(draft, tc) : '', categoryName(server, tc)),
      row('colour', tc('Colour'), draft ? colourWords(draft.color, tc) : '', colourWords(server.color, tc)),
    ],
  };
}

/** Yours beside this month's budget as it now is: this category's limit and the overall budget. */
export function budgetConflict(draft: CategoryDraft, seen: BudgetDto, server: BudgetDto, context: { tc: Translate; locale: MoneyLocale }): ConflictView {
  const { tc, locale } = context;
  const words = (minor: Minor | null) => (minor === null ? tc('No limit') : formatMinor(minor, locale));
  const typed = readLimit(draft.limitText, locale);
  return {
    message: tc("This month's budget changed on another device."),
    rows: [
      row('limit', tc("This month's limit"), typed.ok ? words(typed.minor) : draft.limitText, words(limitOf(server, draft.id))),
      row('overall', tc("This month's budget"), formatMinor(seen.overall_limit_minor, locale), formatMinor(server.overall_limit_minor, locale)),
    ],
  };
}
