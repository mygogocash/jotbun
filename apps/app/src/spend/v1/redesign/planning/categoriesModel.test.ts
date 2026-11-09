// The Categories view model (R4 Planning, plan §6.2): grouping and order, the
// palette's names, the label rules (the API's normalizeName), a limit within
// the month's overall budget, the budget replace payload, and the commands a
// save sends, with their versions.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CATEGORY_COLORS, NAME_MAX_CHARS } from '@gogospend/contracts';
import type { BudgetDto, CategoryDto } from '@gogospend/contracts';

import { recordingTc, untranslated } from '../testing/catalog.ts';
import { ART, BILLS, BONUS, COFFEE_TH, FOOD, FUN, GIFT, HOUSEHOLD, OLD_HOBBY, PETS, SALARY, SHOPPING, SIDE_JOB, TRAVEL, tc } from '../testing/fixtures.ts';
import {
  LABEL_PROBLEM_TEXT, LIMIT_PROBLEM_TEXT, SAVE_PROBLEM_WORDS, SWATCHES, SWATCH_NAMES, afterCategoryAck, archiveCommand, budgetConflict, budgetReplace, categoryConflict,
  checkLabel, checkLimits, colourWords, commandSlot, draftName, editCategoryDraft, groupCategories, labelLength, limitOf, newCategoryDraft, planSave, readConflict, readLimit, suggestColor, swatchName,
} from './categoriesModel.ts';
import type { CategoryDraft } from './categoriesModel.ts';

const NEW_ID = 'c0000000-0000-4000-8000-0000000000aa';
const MONTH = '2026-09';
const ALL: CategoryDto[] = [PETS, GIFT, FUN, FOOD, COFFEE_TH, SALARY, ART, TRAVEL, OLD_HOBBY, BILLS, HOUSEHOLD, SHOPPING, BONUS, SIDE_JOB];

function budget(overall: string, limits: readonly (readonly [CategoryDto, string])[] = [], version = 3): BudgetDto {
  return {
    id: 'b0000000-0000-4000-8000-000000000001', month: MONTH, overall_limit_minor: overall, version,
    category_limits: limits.map(([category, limit]) => ({ category_id: category.id, limit_minor: limit })).sort((a, b) => a.category_id.localeCompare(b.category_id)),
  };
}
const context = (seen: BudgetDto | null) => ({ budget: seen, tc, locale: 'en' as const });
const coloured = (category: CategoryDto, color: string | null): CategoryDto => ({ ...category, color });

// ---------------------------------------------------------------------------
// The palette

test('every palette colour has its own English name, in the palette order', () => {
  assert.equal(SWATCH_NAMES.length, CATEGORY_COLORS.length);
  assert.equal(new Set(SWATCH_NAMES).size, SWATCH_NAMES.length);
  assert.deepEqual(SWATCHES.map((swatch) => swatch.color), [...CATEGORY_COLORS]);
  assert.deepEqual(SWATCHES.map((swatch) => swatch.name), [...SWATCH_NAMES]);
  assert.equal(swatchName(CATEGORY_COLORS[0]), SWATCH_NAMES[0]);
  assert.equal(swatchName(CATEGORY_COLORS[11]), SWATCH_NAMES[11]);
  assert.equal(swatchName(null), null);
  // A stored colour from outside today's palette has no name.
  assert.equal(swatchName('#000000'), null);
  for (const name of SWATCH_NAMES) assert.match(name, /^[A-Z][a-z]+( [a-z]+)?$/);
});

test('a new category is offered the first colour its type does not use yet', () => {
  const used = [coloured(FOOD, CATEGORY_COLORS[0]), coloured(TRAVEL, CATEGORY_COLORS[1]), coloured(SALARY, CATEGORY_COLORS[2]), coloured(OLD_HOBBY, CATEGORY_COLORS[3])];
  // Income's and archived categories' colours do not count.
  assert.equal(suggestColor(used, 'expense'), CATEGORY_COLORS[2]);
  assert.equal(suggestColor(used, 'income'), CATEGORY_COLORS[0]);
  const everything = CATEGORY_COLORS.map((color, index) => coloured({ ...PETS, id: `c0000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}` }, color));
  assert.equal(suggestColor(everything, 'expense'), CATEGORY_COLORS[0]);
});

// ---------------------------------------------------------------------------
// The grid

test('the grid shows one type: built-ins in their own order, then your categories by name, and the archived apart', () => {
  const seen = budget('1000000', [[TRAVEL, '300000'], [PETS, '50000']]);
  const expense = groupCategories(ALL, 'expense', { tc, budget: seen });
  assert.deepEqual(expense.active.map((item) => item.name), ['Food', 'Travel', 'Household', 'Bills', 'Shopping', 'Fun', 'Art', 'Pets', 'กาแฟ']);
  assert.deepEqual(expense.active.map((item) => item.custom), [false, false, false, false, false, false, true, true, true]);
  assert.deepEqual(expense.archived.map((item) => item.name), ['Old hobby']);
  assert.equal(expense.hasCustom, true);
  // This month's limits, where the budget has one.
  assert.deepEqual(expense.active.filter((item) => item.limitMinor !== null).map((item) => [item.name, item.limitMinor]), [['Travel', '300000'], ['Pets', '50000']]);
  const income = groupCategories(ALL, 'income', { tc, budget: seen });
  assert.deepEqual(income.active.map((item) => item.name), ['Salary', 'Bonus', 'Side job', 'Gift']);
  assert.deepEqual([income.archived, income.hasCustom], [[], false]);
});

test('a renamed built-in shows its label; names go through tc; no budget means no limits', () => {
  const marked = (english: string) => `[${english}]`;
  const renamed = { ...FOOD, label: 'Meals' };
  const groups = groupCategories([BILLS, renamed, PETS], 'expense', { tc: marked, budget: null });
  assert.deepEqual(groups.active.map((item) => item.name), ['Meals', '[Bills]', 'Pets']);
  assert.ok(groups.active.every((item) => item.limitMinor === null));
  assert.equal(groupCategories([FOOD, OLD_HOBBY], 'expense', { tc, budget: null }).hasCustom, false);
});

// ---------------------------------------------------------------------------
// The label (the API's normalizeName: NFC, trimmed, 1-80 code points, one line)

test('a label is trimmed and NFC-normalized, and counted the way the API counts it', () => {
  assert.deepEqual(checkLabel('  Coffee  ', false), { ok: true, label: 'Coffee' });
  assert.deepEqual(checkLabel('Café', false), { ok: true, label: 'Café' });
  assert.deepEqual(checkLabel('กาแฟเย็น', false), { ok: true, label: 'กาแฟเย็น' });
  assert.equal(labelLength('  Café '), 4);
  assert.equal(labelLength('😀 ok'), 4);
  assert.equal(NAME_MAX_CHARS, 80);
  assert.deepEqual(checkLabel('x'.repeat(80), false), { ok: true, label: 'x'.repeat(80) });
  assert.deepEqual(checkLabel('😀'.repeat(80), false), { ok: true, label: '😀'.repeat(80) });
});

test('a custom category needs a visible name of one line and at most 80 characters', () => {
  for (const empty of ['', '   ', '​', 'ㅤ']) assert.deepEqual(checkLabel(empty, false), { ok: false, problem: 'empty' }, JSON.stringify(empty));
  assert.deepEqual(checkLabel('x'.repeat(81), false), { ok: false, problem: 'too_long' });
  assert.deepEqual(checkLabel('Two\nlines', false), { ok: false, problem: 'not_one_line' });
  assert.deepEqual(checkLabel('Tab\there', false), { ok: false, problem: 'not_one_line' });
  assert.deepEqual(checkLabel('evil‮txt', false), { ok: false, problem: 'not_one_line' });
  assert.equal(LABEL_PROBLEM_TEXT.empty, 'Give the category a name.');
  assert.equal(LABEL_PROBLEM_TEXT.too_long, 'Use one line of up to 80 characters.');
  assert.equal(LABEL_PROBLEM_TEXT.not_one_line, 'Use one line of up to 80 characters.');
});

test('a built-in with no label of its own uses its default name (null)', () => {
  assert.deepEqual(checkLabel('', true), { ok: true, label: null });
  assert.deepEqual(checkLabel('  ', true), { ok: true, label: null });
  assert.deepEqual(checkLabel(' Meals ', true), { ok: true, label: 'Meals' });
  assert.deepEqual(checkLabel('x'.repeat(81), true), { ok: false, problem: 'too_long' });
});

// ---------------------------------------------------------------------------
// The limit

test('a limit is exact satang, typed like any amount; empty means no limit', () => {
  assert.deepEqual(readLimit('', 'en'), { ok: true, minor: null });
  assert.deepEqual(readLimit('   ', 'en'), { ok: true, minor: null });
  assert.deepEqual(readLimit('1,500', 'en'), { ok: true, minor: '150000' });
  assert.deepEqual(readLimit('฿1500.5', 'en'), { ok: true, minor: '150050' });
  assert.deepEqual(readLimit('999999999.99', 'en'), { ok: true, minor: '99999999999' });
  assert.deepEqual(readLimit('๑๐๐', 'th'), { ok: true, minor: '10000' });
  assert.deepEqual(readLimit('0', 'en'), { ok: false, problem: 'zero' });
  assert.deepEqual(readLimit('0.00', 'en'), { ok: false, problem: 'zero' });
  assert.deepEqual(readLimit('1.234', 'en'), { ok: false, problem: 'too_precise' });
  assert.deepEqual(readLimit('1000000000', 'en'), { ok: false, problem: 'too_large' });
  for (const text of ['abc', '1e3', '1,5', '-5', '.5']) assert.deepEqual(readLimit(text, 'en'), { ok: false, problem: 'invalid' }, text);
});

test("the category limits must fit inside the month's overall budget (equal is fine)", () => {
  const seen = budget('1000000', [[TRAVEL, '300000'], [BILLS, '400000']]);
  assert.equal(limitOf(seen, TRAVEL.id), '300000');
  assert.equal(limitOf(seen, FOOD.id), null);
  assert.equal(limitOf(null, FOOD.id), null);
  assert.deepEqual(checkLimits(seen, FOOD.id, '300000'), { ok: true, total: '1000000' });
  assert.deepEqual(checkLimits(seen, FOOD.id, '300001'), { ok: false, problem: 'over_total', total: '1000001', overall: '1000000' });
  // A category's own limit is replaced, never counted twice.
  assert.deepEqual(checkLimits(seen, TRAVEL.id, '600000'), { ok: true, total: '1000000' });
  assert.deepEqual(checkLimits(seen, TRAVEL.id, '600001'), { ok: false, problem: 'over_total', total: '1000001', overall: '1000000' });
  assert.deepEqual(checkLimits(seen, TRAVEL.id, null), { ok: true, total: '400000' });
  // Exact beyond floating point: 2^53 + 1 satang.
  const huge = budget('9007199254740993', [[TRAVEL, '9007199254740992']]);
  assert.deepEqual(checkLimits(huge, FOOD.id, '1'), { ok: true, total: '9007199254740993' });
  assert.deepEqual(checkLimits(huge, FOOD.id, '2'), { ok: false, problem: 'over_total', total: '9007199254740994', overall: '9007199254740993' });
});

test('a budget holds at most 100 category limits; changing one already there is fine', () => {
  const many: [CategoryDto, string][] = Array.from({ length: 100 }, (_, index) => [{ ...PETS, id: `c0000000-0000-4000-8000-0000000002${String(index).padStart(2, '0')}` }, '1']);
  const full = budget('1000000', many);
  assert.deepEqual(checkLimits(full, FOOD.id, '1'), { ok: false, problem: 'too_many' });
  assert.deepEqual(checkLimits(full, many[0][0].id, '5'), { ok: true, total: '104' });
  assert.deepEqual(checkLimits(full, FOOD.id, null), { ok: true, total: '100' });
});

test('setting a limit replaces the whole month budget at its version: the overall limit unchanged, limits sorted by category id', () => {
  const seen = budget('1000000', [[TRAVEL, '300000'], [BILLS, '400000']], 7);
  const added = budgetReplace(seen, FOOD.id, '100000');
  assert.deepEqual(added, {
    slot: 'budget', kind: 'budget', month: MONTH, existing: { id: seen.id, version: 7 },
    input: { overall_limit_minor: '1000000', category_limits: [{ category_id: FOOD.id, limit_minor: '100000' }, { category_id: TRAVEL.id, limit_minor: '300000' }, { category_id: BILLS.id, limit_minor: '400000' }] },
  });
  assert.deepEqual(budgetReplace(seen, TRAVEL.id, '250000')?.input.category_limits, [{ category_id: TRAVEL.id, limit_minor: '250000' }, { category_id: BILLS.id, limit_minor: '400000' }]);
  assert.deepEqual(budgetReplace(seen, TRAVEL.id, null)?.input, { overall_limit_minor: '1000000', category_limits: [{ category_id: BILLS.id, limit_minor: '400000' }] });
  // Nothing changes: nothing is sent.
  assert.equal(budgetReplace(seen, TRAVEL.id, '300000'), null);
  assert.equal(budgetReplace(seen, FOOD.id, null), null);
  // The budget read is never changed in place.
  assert.equal(seen.category_limits.length, 2);
});

// ---------------------------------------------------------------------------
// Drafts and what a save sends

test('the edit draft starts from the category and this month\'s limit as read', () => {
  const seen = budget('1000000', [[TRAVEL, '300050']]);
  const travel = coloured({ ...TRAVEL, version: 4 }, CATEGORY_COLORS[4]);
  const draft = editCategoryDraft(travel, seen);
  assert.deepEqual(draft, {
    mode: 'edit', id: TRAVEL.id, type: 'expense', builtinKey: 'travel', base: travel, label: '', color: CATEGORY_COLORS[4], limitText: '3000.50', baseLimit: '300050',
  });
  assert.equal(draftName(draft, tc), 'Travel');
  assert.equal(draftName({ ...draft, label: '  Trips ' }, tc), 'Trips');
  const pets = editCategoryDraft(PETS, null);
  assert.deepEqual([pets.label, pets.limitText, pets.baseLimit], ['Pets', '', null]);
  const blank = newCategoryDraft({ id: NEW_ID, type: 'income', color: CATEGORY_COLORS[2] });
  assert.deepEqual(blank, { mode: 'create', id: NEW_ID, type: 'income', builtinKey: null, base: null, label: '', color: CATEGORY_COLORS[2], limitText: '', baseLimit: null });
  assert.equal(draftName(blank, tc), 'Your category');
});

test('creating sends one create command with a trimmed label; a limit follows only when the month has a budget', () => {
  const draft: CategoryDraft = { ...newCategoryDraft({ id: NEW_ID, type: 'expense', color: CATEGORY_COLORS[5] }), label: '  Coffee ', limitText: '500' };
  const create = { slot: 'category', kind: 'create', input: { id: NEW_ID, type: 'expense', label: 'Coffee', color: CATEGORY_COLORS[5] } };
  assert.deepEqual(planSave(draft, context(null)), { ok: true, commands: [create] });
  const seen = budget('1000000', [[TRAVEL, '300000']]);
  assert.deepEqual(planSave(draft, context(seen)), { ok: true, commands: [create, budgetReplace(seen, NEW_ID, '50000')] });
  // Income has no limit: the limit text is never read.
  assert.deepEqual(planSave({ ...draft, type: 'income', limitText: 'abc' }, context(seen)), {
    ok: true, commands: [{ slot: 'category', kind: 'create', input: { id: NEW_ID, type: 'income', label: 'Coffee', color: CATEGORY_COLORS[5] } }],
  });
});

test('nothing is sent while the label or the limit is wrong, and each problem is said in words', () => {
  const seen = budget('1000000', [[TRAVEL, '600000']]);
  const draft: CategoryDraft = { ...newCategoryDraft({ id: NEW_ID, type: 'expense', color: CATEGORY_COLORS[0] }), label: '   ', limitText: '4000.01' };
  assert.deepEqual(planSave(draft, context(seen)), {
    ok: false,
    errors: { label: 'Give the category a name.', limit: "Category limits would add up to ฿10,000.01, more than this month's budget of ฿10,000.00." },
  });
  assert.deepEqual(planSave({ ...draft, label: 'Coffee', limitText: '1.234' }, context(seen)), { ok: false, errors: { limit: 'Use at most two decimal places' } });
  assert.deepEqual(planSave({ ...draft, label: 'Coffee', limitText: '0' }, context(seen)), { ok: false, errors: { limit: 'Enter an amount above zero' } });
  assert.deepEqual(planSave({ ...draft, label: 'Coffee', limitText: 'lots' }, context(seen)), { ok: false, errors: { limit: 'Enter an amount like 65 or 65.50' } });
  assert.deepEqual(planSave({ ...draft, label: 'x'.repeat(81), limitText: '' }, context(seen)), { ok: false, errors: { label: 'Use one line of up to 80 characters.' } });
  const many: [CategoryDto, string][] = Array.from({ length: 100 }, (_, index) => [{ ...PETS, id: `c0000000-0000-4000-8000-0000000002${String(index).padStart(2, '0')}` }, '1']);
  assert.deepEqual(planSave({ ...draft, label: 'Coffee', limitText: '1' }, context(budget('1000000', many))), { ok: false, errors: { limit: 'A budget holds up to 100 category limits.' } });
});

test('editing sends only what changed, at the version read, and a limit change replaces the budget', () => {
  const seen = budget('1000000', [[TRAVEL, '300000']], 5);
  const travel = coloured({ ...TRAVEL, version: 4 }, CATEGORY_COLORS[4]);
  const draft = editCategoryDraft(travel, seen);
  assert.deepEqual(planSave(draft, context(seen)), { ok: true, commands: [] });
  assert.deepEqual(planSave({ ...draft, label: ' Trips ' }, context(seen)), { ok: true, commands: [{ slot: 'category', kind: 'update', id: TRAVEL.id, version: 4, changes: { label: 'Trips' } }] });
  assert.deepEqual(planSave({ ...draft, color: CATEGORY_COLORS[7] }, context(seen)), { ok: true, commands: [{ slot: 'category', kind: 'update', id: TRAVEL.id, version: 4, changes: { color: CATEGORY_COLORS[7] } }] });
  assert.deepEqual(planSave({ ...draft, limitText: '3,500' }, context(seen)), { ok: true, commands: [budgetReplace(seen, TRAVEL.id, '350000')] });
  assert.deepEqual(planSave({ ...draft, limitText: '' }, context(seen)), { ok: true, commands: [budgetReplace(seen, TRAVEL.id, null)] });
  assert.deepEqual(planSave({ ...draft, limitText: '3000.00' }, context(seen)), { ok: true, commands: [] });
});

test('a built-in goes back to its default name with label null; a custom category cannot lose its name', () => {
  const renamed = { ...FOOD, label: 'Meals', version: 2 };
  const draft = editCategoryDraft(renamed, null);
  assert.equal(draft.label, 'Meals');
  assert.deepEqual(planSave({ ...draft, label: '' }, context(null)), { ok: true, commands: [{ slot: 'category', kind: 'update', id: FOOD.id, version: 2, changes: { label: null } }] });
  // Already the default name: nothing to send.
  assert.deepEqual(planSave({ ...editCategoryDraft(FOOD, null), label: '  ' }, context(null)), { ok: true, commands: [] });
  assert.deepEqual(planSave({ ...editCategoryDraft(PETS, null), label: '' }, context(null)), { ok: false, errors: { label: 'Give the category a name.' } });
});

test('after the category command is acknowledged, saving again sends only the budget command, exactly as before', () => {
  const seen = budget('1000000', [], 2);
  const draft: CategoryDraft = { ...newCategoryDraft({ id: NEW_ID, type: 'expense', color: CATEGORY_COLORS[3] }), label: 'Coffee', limitText: '50' };
  const first = planSave(draft, context(seen));
  assert.ok(first.ok);
  const created = afterCategoryAck(draft, first.commands[0], 1);
  assert.equal(created.mode, 'edit');
  assert.deepEqual(created.base, { id: NEW_ID, type: 'expense', builtin_key: null, label: 'Coffee', color: CATEGORY_COLORS[3], archived: false, version: 1 });
  assert.deepEqual(planSave(created, context(seen)), { ok: true, commands: [first.commands[1]] });

  const travel = editCategoryDraft({ ...TRAVEL, version: 4 }, seen);
  const edited = { ...travel, label: 'Trips', color: CATEGORY_COLORS[1], limitText: '10' };
  const plan = planSave(edited, context(seen));
  assert.ok(plan.ok && plan.commands.length === 2);
  const after = afterCategoryAck(edited, plan.commands[0], 5);
  assert.deepEqual(after.base, { ...TRAVEL, label: 'Trips', color: CATEGORY_COLORS[1], version: 5 });
  assert.deepEqual(planSave(after, context(seen)), { ok: true, commands: [plan.commands[1]] });
});

test('archive and unarchive carry the version read; each command has its own key slot', () => {
  const pets = { ...PETS, version: 6 };
  assert.deepEqual(archiveCommand(pets, 'archive'), { slot: 'category', kind: 'archive', id: PETS.id, version: 6 });
  assert.deepEqual(archiveCommand(OLD_HOBBY, 'unarchive'), { slot: 'category', kind: 'unarchive', id: OLD_HOBBY.id, version: 2 });
  assert.equal(commandSlot(archiveCommand(pets, 'archive')), `category:${PETS.id}`);
  const replace = budgetReplace(budget('100', []), FOOD.id, '1');
  assert.ok(replace);
  assert.equal(commandSlot(replace), `budget:${MONTH}`);
});

// ---------------------------------------------------------------------------
// Conflicts: the server's copy, checked, beside yours

test("a conflict's server copy is used only when it is this category, or this month's budget", () => {
  const update = { slot: 'category', kind: 'update', id: TRAVEL.id, version: 1, changes: { label: 'Trips' } } as const;
  const theirs = { ...TRAVEL, label: 'Journeys', version: 2 };
  assert.deepEqual(readConflict(update, theirs), { kind: 'category', server: theirs });
  assert.equal(readConflict(update, { ...theirs, id: FOOD.id }), null);
  assert.equal(readConflict(update, { ...theirs, extra: 1 }), null);
  assert.equal(readConflict(update, undefined), null);
  const seen = budget('1000000', []);
  const replace = budgetReplace(seen, FOOD.id, '100');
  assert.ok(replace);
  const server = { ...seen, version: 4 };
  assert.deepEqual(readConflict(replace, server), { kind: 'budget', server });
  assert.equal(readConflict(replace, { ...server, month: '2026-10' }), null);
  assert.equal(readConflict(replace, theirs), null);
});

test('a changed category shows yours and the server\'s name and colour; an archived one says so', () => {
  const draft = { ...editCategoryDraft(coloured(TRAVEL, CATEGORY_COLORS[0]), null), label: 'Trips' };
  const server = { ...coloured(TRAVEL, CATEGORY_COLORS[1]), label: 'Journeys', version: 2 };
  const view = categoryConflict(draft, server, tc);
  assert.equal(view.message, 'This category changed on another device.');
  assert.deepEqual(view.rows, [
    { key: 'name', label: 'Name', yours: 'Trips', server: 'Journeys', differs: true },
    { key: 'colour', label: 'Colour', yours: SWATCH_NAMES[0], server: SWATCH_NAMES[1], differs: true },
  ]);
  const same = categoryConflict({ ...draft, label: '' }, { ...coloured(TRAVEL, null), archived: true, version: 3 }, tc);
  assert.equal(same.message, 'This category was archived on another device.');
  assert.deepEqual(same.rows.map((row) => [row.yours, row.server, row.differs]), [['Travel', 'Travel', false], [SWATCH_NAMES[0], 'No colour', true]]);
  // Without a draft (an archive or unarchive), the server's copy alone.
  assert.deepEqual(categoryConflict(null, server, tc).rows.map((row) => [row.yours, row.server]), [['', 'Journeys'], ['', SWATCH_NAMES[1]]]);
  assert.equal(categoryConflict(draft, coloured(server, '#000000'), tc).rows[1].server, 'Custom colour');
});

test("a changed budget shows yours and the server's limit for this category and the month's total", () => {
  const seen = budget('1000000', [[TRAVEL, '300000']], 2);
  const server = budget('800000', [[TRAVEL, '200000']], 3);
  const draft = { ...editCategoryDraft(TRAVEL, seen), limitText: '350' };
  const view = budgetConflict(draft, seen, server, { tc, locale: 'en' });
  assert.equal(view.message, "This month's budget changed on another device.");
  assert.deepEqual(view.rows, [
    { key: 'limit', label: "This month's limit", yours: '฿350.00', server: '฿2,000.00', differs: true },
    { key: 'overall', label: "This month's budget", yours: '฿10,000.00', server: '฿8,000.00', differs: true },
  ]);
  const removed = budgetConflict({ ...draft, limitText: '' }, seen, budget('1000000', [], 3), { tc, locale: 'en' });
  assert.deepEqual(removed.rows.map((row) => [row.yours, row.server, row.differs]), [['No limit', 'No limit', false], ['฿10,000.00', '฿10,000.00', false]]);
});

// ---------------------------------------------------------------------------
// The catalogs

// Copy is looked up by its English text: words this model looks up in a table
// that are missing from the catalogs show English in every locale (found
// translating R4, E2 checkpoint 2). The literal guard sees only `tc('…')`.
test('every colour name and every problem word is copy in en.json, with Thai', () => {
  const { tc: recording, asked } = recordingTc();
  for (const color of [...CATEGORY_COLORS, null, '#000000']) colourWords(color, recording);
  assert.deepEqual([...asked].sort(), [...SWATCH_NAMES, 'No colour', 'Custom colour'].sort());
  assert.deepEqual(Object.keys(SAVE_PROBLEM_WORDS).sort(), ['invalid_response', 'network', 'rate_limited', 'unavailable', 'upgrade_required']);
  const words = [...asked, ...Object.values(LABEL_PROBLEM_TEXT), ...Object.values(LIMIT_PROBLEM_TEXT), ...Object.values(SAVE_PROBLEM_WORDS)];
  assert.deepEqual(untranslated(words), []);
});
