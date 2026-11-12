// Budget (R4 Planning, plan §6.2), behind the `planning` area (on since E2
// checkpoint 2). It opens from Home, takes the whole height and has its own
// way back.
//
// - The month: the lavender stage with Back, the month switcher (every
//   earlier month, and one month ahead to plan the next) and the month's
//   CONFIRMED spending against the budget. Then the pace ring (`budgetPace`,
//   which adds money waiting on this device and says so), the burn-down
//   (cumulative spending against the even pace, drawn as decoration with the
//   numbers in words), and each category limit with spent of limit, a small
//   bar and its state in words. Going over is said kindly, as plain facts.
// - No budget: an empty state offers to set one. The editor takes one total
//   on the kit keypad (exact satang, never the system keyboard), prefilled
//   from the average monthly spending only when an earlier month was tracked
//   whole and has spending, then optional limits for expense categories.
//   Limits that add up to more than the total are said inline, live, and
//   nothing is sent until they fit.
// - Saving is one immutable command (`setBudget`) under `useCommandKeys`: a
//   create without `existing`, a replace with the version and id read. An
//   unconfirmed save freezes the editor and Try again resends the same
//   command under the same key. A conflict shows Jotbun's budget beside
//   yours and offers Reload; a create refused because the month already has
//   exactly these figures counts as saved. A refusal says where it is.
// - Set up: Wallets and Categories, until the Me tab holds them.
// - Analytics (1D-T7, R61): a save Jotbun acknowledged, or one it already
//   held with exactly these figures, sends one budget_set ('set'), never an
//   amount.
//
// Copy is English through `tc()`, in the catalogs with Thai approved at E2
// checkpoint 2. Nothing animates. The bun appears on the empty state
// (`thinking`) and, at full intensity, on the stage when the month is over
// (`oops-kind`); both are decorative.
import { HISTORY_MAX_LIMIT, isBudgetSnapshot } from '@gogospend/contracts';
import type { BudgetDto, CategoryDto, HistoryFilter, Minor, MonthSummary, SetMonthlyBudgetRequest, TransactionDto } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { trackBudgetSet } from '@mobile/analytics/events';
import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { formatMinor } from '@mobile/spend/v1/money';
import { budgetPace, paceCopy } from '@mobile/spend/v1/redesign/budgetPace';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import {
  averagePrefill, budgetConflictRows, burnDown, canShowNextMonth, categoryLimitRows, checkBudget, checkCopy, dailySpending, editorStart,
  limitCategories, prefillCopy, prefillMonths, sameBudget,
} from '@mobile/spend/v1/redesign/planning/budgetModel';
import type { LimitEntry, Prefill } from '@mobile/spend/v1/redesign/planning/budgetModel';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthOf, monthRange, shiftMonth, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { monthLabel } from '@mobile/ui/dateStep';
import { EmptyState } from '@mobile/ui/EmptyState';
import { FieldError } from '@mobile/ui/FieldError';
import { Keypad } from '@mobile/ui/Keypad';
import { EMPTY_KEYPAD, applyKey, evaluateKeypad, keypadFromMinor, keypadHasOperator, settleForSave } from '@mobile/ui/keypadExpression';
import type { KeypadKey, KeypadProblem, KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_SPACE } from '@mobile/ui/layout';
import { toKitPace } from '@mobile/ui/paceAdapter';
import { PaceRing } from '@mobile/ui/PaceRing';
import { PillButton } from '@mobile/ui/PillButton';
import { StageHeader } from '@mobile/ui/StageHeader';
import { refusedBeforeProcessing, saveProblem, useCommandKeys, useLoad, useMoneyLocale } from '../../v1/parts';
import type { SaveProblem, Translate } from '../../v1/parts';
import { ActionFooter, ActionRow } from '../ActionFooter';
import { LoadingBlock, Notice, useDateLocale, useGoBack } from '../HistoryParts';
import {
  BudgetConflictPanel, BudgetPage, BurnDownCard, CategoryLimitsCard, EditorAmount, LimitChoice, SectionTitle, SetUpSection, useCategoryName,
} from './BudgetParts';

export type BudgetScreenProps = {
  /** The clock, for tests and the catalogue; today is its Bangkok date. */
  now?: Date;
};

/** Pages of the month's expenses read for the burn-down (each up to HISTORY_MAX_LIMIT); a busier month shows no chart rather than a short one. */
const EXPENSE_PAGES = 10;

type MonthData = {
  budget: BudgetDto | null;
  summary: MonthSummary;
  categories: CategoryDto[];
  /** Every confirmed expense of the month, or null when they could not all be read (no burn-down then). */
  expenses: TransactionDto[] | null;
  /** The average for a first budget; only read when the month has none. */
  prefill: Prefill | null;
};

/** What the keypad says when it refuses a key or an amount (Quick add's words). */
const KEYPAD_PROBLEM_TEXT: Readonly<Record<KeypadProblem, string>> = {
  empty: 'Enter an amount',
  zero: 'Enter an amount above zero',
  too_precise: 'Use at most two decimal places',
  too_large: 'Amounts go up to ฿999,999,999.99',
  negative: "The sum can't go below zero.",
  divide_by_zero: "You can't divide by zero.",
};

// ---------------------------------------------------------------------------
// Loading

/** Every confirmed expense of the month, page by page, or null when the pages don't add up to the month's count. */
async function readExpenses(resources: SpendV1Resources, month: string): Promise<TransactionDto[] | null> {
  const filter: HistoryFilter = { ...monthRange(month), type: 'expense', sort: 'date_asc' };
  const records: TransactionDto[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < EXPENSE_PAGES; page += 1) {
    const result = await resources.history(filter, cursor, HISTORY_MAX_LIMIT);
    records.push(...result.items);
    if (result.next_cursor === null) return records.length === result.summary.count ? records : null;
    cursor = result.next_cursor;
  }
  return null;
}

/** The average of up to three earlier months tracked whole, from their summaries. */
async function readPrefill(resources: SpendV1Resources, month: string, today: string): Promise<Prefill | null> {
  const wallets = await resources.wallets();
  const trackingStart = wallets.reduce<string | null>((earliest, wallet) => (earliest === null || wallet.tracking_start < earliest ? wallet.tracking_start : earliest), null);
  const months = prefillMonths({ month, today, trackingStart });
  if (months.length === 0) return null;
  return averagePrefill(await Promise.all(months.map((earlier) => resources.summary(earlier))));
}

async function loadMonth(resources: SpendV1Resources, month: string, today: string): Promise<MonthData> {
  const [budget, summary, categories, expenses] = await Promise.all([
    resources.budget(month),
    resources.summary(month),
    resources.categories(),
    // The burn-down is extra: without it the month still shows.
    readExpenses(resources, month).catch(() => null),
  ]);
  // A prefill is a convenience: it never blocks setting a budget.
  const prefill = budget ? null : await readPrefill(resources, month, today).catch(() => null);
  return { budget, summary, categories, expenses, prefill };
}

// ---------------------------------------------------------------------------
// The screen

export function BudgetScreen({ now }: BudgetScreenProps) {
  const resources = useSpendV1();
  const tc = useCopy();
  const router = useRouter();
  const goBack = useGoBack('/spend');
  const locale = useMoneyLocale();
  const dateLocale = useDateLocale();
  const diaryView = useDiaryView();
  const { intensity } = useBunIntensity();
  const today = todayInBangkok(now ?? new Date());
  const [month, setMonth] = useState(() => monthOf(today));
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const loaded = useLoad<MonthData>(() => loadMonth(resources, month, today), [resources, month, today]);

  const changeMonth = (next: string) => {
    setNotice(null);
    setMonth(next);
  };
  const leaveEditor = (message: string | null) => {
    setEditing(false);
    setNotice(message);
    loaded.reload();
  };

  if (editing && loaded.state === 'ready') {
    return (
      <BudgetEditor
        key={month}
        month={month}
        existing={loaded.data.budget}
        categories={loaded.data.categories}
        prefill={loaded.data.prefill}
        onCancel={() => setEditing(false)}
        onSaved={() => leaveEditor(tc('Budget saved'))}
        onReload={leaveEditor}
      />
    );
  }

  const data = loaded.state === 'ready' ? loaded.data : null;
  const confirmedIds = new Set((data?.expenses ?? []).map((record) => record.id));
  const pace = data?.budget ? budgetPace({ budget: data.budget, summary: data.summary, today, outbox: diaryView.outbox, confirmedIds }) : null;
  // The stage shows confirmed money only, as Home's does; the ring below says what it adds.
  const total = data?.budget ? tc('{spent} of {limit}', { spent: formatMinor(data.summary.expense_minor, locale), limit: formatMinor(data.budget.overall_limit_minor, locale) }) : null;
  const stageBun = pace?.state === 'over' && intensity === 'full' ? <Bun pose="oops-kind" size="m" testID="budget-bun-oops-kind" /> : undefined;
  const stage = (
    <StageHeader
      back={{ onPress: goBack }}
      title={tc('Budget')}
      month={{
        label: monthLabel(month, dateLocale),
        onPrevious: () => changeMonth(shiftMonth(month, -1)),
        onNext: canShowNextMonth(month, today) ? () => changeMonth(shiftMonth(month, 1)) : undefined,
      }}
      bun={stageBun}
    >
      {total ? <BunText testID="budget-total" variant="heading" tone="ink" style={{ fontVariant: ['tabular-nums'] }}>{total}</BunText> : null}
    </StageHeader>
  );
  const setUp = <SetUpSection onWallets={() => router.push('/spend/wallets')} onCategories={() => router.push('/spend/categories')} />;
  const saved = notice ? <Notice message={notice} /> : null;

  if (loaded.state === 'loading') {
    return <BudgetPage stage={stage}><LoadingBlock label={tc('Loading your budget')} />{setUp}</BudgetPage>;
  }
  if (loaded.state === 'error') {
    const problem = classifyLoadProblem(loaded.error, tc);
    return (
      <BudgetPage stage={stage}>
        <Notice tone="alert" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: loaded.reload } : undefined} />
        {setUp}
      </BudgetPage>
    );
  }
  const ready = loaded.data;
  if (!ready.budget || !pace) {
    return (
      <BudgetPage stage={stage}>
        {saved}
        <EmptyState
          // EmptyState leaves the art (and its space) out when the bun is off.
          art={<Bun pose="thinking" size="l" testID="budget-empty-bun" />}
          title={tc('No budget this month')}
          body={tc("Set a monthly budget to see what's left each day")}
          action={{ label: tc('Set a budget'), onPress: () => { setNotice(null); setEditing(true); } }}
        />
        {setUp}
      </BudgetPage>
    );
  }

  const budget = ready.budget;
  const copy = paceCopy(pace, locale);
  const notes = [copy.pendingNote, copy.checkingNote].flatMap((line) => (line ? [tc(line.text, line.values)] : []));
  const burn = ready.expenses
    ? burnDown({ month, today, limitMinor: budget.overall_limit_minor, spentByDay: dailySpending({ month, records: ready.expenses, outbox: diaryView.outbox }) })
    : null;
  const rows = categoryLimitRows({ budget, usage: ready.summary.budget, pace, categories: ready.categories });
  return (
    <BudgetPage stage={stage}>
      {saved}
      <Card>
        <SectionTitle>{tc('Left to spend')}</SectionTitle>
        <PaceRing {...toKitPace(pace)} />
        {notes.map((note) => <BunText key={note} variant="caption" tone="muted">{note}</BunText>)}
      </Card>
      {burn ? <BurnDownCard burn={burn} /> : null}
      <CategoryLimitsCard rows={rows} />
      <PillButton kind="secondary" label={tc('Edit budget')} onPress={() => { setNotice(null); setEditing(true); }} />
      {setUp}
    </BudgetPage>
  );
}

// ---------------------------------------------------------------------------
// The editor

type EditorProps = {
  month: string;
  /** The budget being changed (replaced with its version), or null for a first one (created). */
  existing: BudgetDto | null;
  categories: readonly CategoryDto[];
  prefill: Prefill | null;
  onCancel: () => void;
  /** Saved: back to the month, read again. */
  onSaved: () => void;
  /** Leave the edit and read the month again, with a notice to show (or none). */
  onReload: (notice: string | null) => void;
};

/**
 * `unconfirmed`: an attempt may have committed; the editor is frozen with
 * its key and only Try again resends the same command. `conflict`: the
 * month's budget changed elsewhere; theirs shows and only Reload is offered.
 * `blocked`: saving must wait for the person to act elsewhere (an update).
 */
type Status = 'editing' | 'saving' | 'unconfirmed' | 'blocked' | 'conflict';
type BudgetCommand = { input: SetMonthlyBudgetRequest; existing?: { version: number; id: string } };

const keypadOf = (minor: Minor | null): KeypadState => {
  if (minor === null) return EMPTY_KEYPAD;
  try {
    return keypadFromMinor(minor);
  } catch {
    return EMPTY_KEYPAD;
  }
};

/** `saveProblem`'s words, said about a budget where the entry's words would not fit. */
function budgetProblem(error: unknown, tc: Translate): SaveProblem {
  const problem = saveProblem(error, tc);
  const outcome = error instanceof V1Error ? error.outcome : undefined;
  if (outcome === 'network' || outcome === 'unavailable' || outcome === 'invalid_response') return { ...problem, message: tc('Not confirmed yet. Your budget is kept; try again.') };
  if (problem.message === tc('This entry could not be saved.')) return { ...problem, message: tc('This budget could not be saved.') };
  return problem;
}

function BudgetEditor({ month, existing, categories, prefill, onCancel, onSaved, onReload }: EditorProps) {
  const resources = useSpendV1();
  const tc = useCopy();
  const colors = useBunColors();
  const locale = useMoneyLocale();
  const dateLocale = useDateLocale();
  const keys = useCommandKeys();
  const nameOf = useCategoryName();
  const [start] = useState(() => editorStart({ existing, prefill }));
  const choices = useMemo(() => limitCategories(categories, existing), [categories, existing]);
  const [step, setStep] = useState<'total' | 'limits'>('total');
  const [total, setTotal] = useState<KeypadState>(() => keypadOf(start.totalMinor));
  const [limits, setLimits] = useState<ReadonlyMap<string, KeypadState>>(() => new Map([...start.limits].map(([id, minor]) => [id, keypadOf(minor)])));
  const [selected, setSelected] = useState<string | null>(choices[0]?.id ?? null);
  const [status, setStatus] = useState<Status>('editing');
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<{ server: BudgetDto; mine: SetMonthlyBudgetRequest } | null>(null);
  // A refusal while unconfirmed that forbids resending for now (a changed session, an update): frozen, and Try again waits.
  const [resendBlocked, setResendBlocked] = useState(false);
  // The command whose outcome is unknown: Try again resends exactly this.
  const unconfirmed = useRef<BudgetCommand | null>(null);
  const locked = status === 'saving' || status === 'unconfirmed' || status === 'conflict';
  const slot = `budget:${month}`;

  const totalOutcome = evaluateKeypad(total);
  const totalMinor = totalOutcome.ok ? totalOutcome.minor : null;
  const limitOf = (id: string): { minor: Minor | null; problem: KeypadProblem | null } => {
    const state = limits.get(id);
    if (!state) return { minor: null, problem: null };
    const outcome = evaluateKeypad(state, { allowZero: true });
    if (outcome.ok) return { minor: outcome.minor === '0' ? null : outcome.minor, problem: null };
    return { minor: null, problem: outcome.problem === 'empty' ? null : outcome.problem };
  };
  // Every category with a limit (shown or not), so a limit on a category not loaded here is kept as it was.
  const limitIds = [...new Set([...choices.map((category) => category.id), ...limits.keys()])];
  const entries: LimitEntry[] = limitIds.map((categoryId) => ({ categoryId, limitMinor: limitOf(categoryId).minor }));
  const check = checkBudget(totalMinor, entries);
  const checkLine = checkCopy(check, totalMinor, locale);

  const onKey = (key: KeypadKey) => {
    if (locked) return;
    setFields({});
    if (step === 'total') {
      setTotal((previous) => applyKey(previous, key));
      return;
    }
    if (selected === null) return;
    setLimits((previous) => new Map(previous).set(selected, applyKey(previous.get(selected) ?? EMPTY_KEYPAD, key)));
  };

  /** Next presses = for the person: a sum shows worked out; a plain amount stays as typed. */
  const next = () => {
    if (locked) return;
    const settled = settleForSave(total);
    if (!settled.outcome.ok || keypadHasOperator(total)) setTotal(settled.state);
    if (settled.outcome.ok) setStep('limits');
  };

  async function send(command: BudgetCommand) {
    const key = keys.keyFor(slot, command);
    setStatus('saving');
    setMessage(null);
    setFields({});
    try {
      await resources.setBudget(month, command.input, key, command.existing);
      keys.settle(slot);
      unconfirmed.current = null;
      trackBudgetSet({ set: true });
      onSaved();
    } catch (error) {
      if (error instanceof V1Error && error.outcome === 'conflict') {
        // Jotbun answered: this command is settled. Its budget is shown, never overwritten.
        keys.settle(slot);
        unconfirmed.current = null;
        setResendBlocked(false);
        const current = error.current;
        if (isBudgetSnapshot(current) && current.month === month) {
          if (sameBudget(current, command.input)) {
            trackBudgetSet({ set: true });
            onSaved();
            return;
          }
          setConflict({ server: current, mine: command.input });
          setStatus('conflict');
          return;
        }
        // No usable budget in the answer: read the month again rather than guess.
        onReload(tc('This budget changed on another device.'));
        return;
      }
      const problem = budgetProblem(error, tc);
      // Once unconfirmed, it stays frozen with its key until that command's outcome is known:
      // a refusal before processing (signed out, terms, an update) says nothing about it.
      const stillUnknown = problem.unconfirmed || (unconfirmed.current !== null && refusedBeforeProcessing(error));
      if (!stillUnknown) keys.settle(slot);
      unconfirmed.current = stillUnknown ? command : null;
      setResendBlocked(stillUnknown && problem.blocked);
      setFields(problem.fields);
      setMessage(problem.message);
      setStatus(stillUnknown ? 'unconfirmed' : problem.blocked ? 'blocked' : 'editing');
    }
  }

  async function save() {
    if (status === 'saving' || status === 'conflict' || status === 'blocked' || resendBlocked) return;
    // An unconfirmed save is resent as itself: the same input, the same key.
    if (status === 'unconfirmed' && unconfirmed.current) {
      await send(unconfirmed.current);
      return;
    }
    // The limits say their own problems; nothing is sent until they are fixed.
    if (limitIds.some((id) => limitOf(id).problem !== null) || !check.ok) return;
    await send({ input: check.request, ...(existing ? { existing: { version: existing.version, id: existing.id } } : {}) });
  }

  const resending = status === 'saving' && unconfirmed.current !== null;
  const stage = <StageHeader title={existing ? tc('Edit budget') : tc('Set a budget')} subtitle={monthLabel(month, dateLocale)} />;
  const footer = (
    <ActionFooter testID="budget-footer">
      {message ? <Notice tone="alert" message={message} /> : null}
      {status === 'conflict' ? (
        <PillButton label={tc('Reload')} onPress={() => onReload(null)} />
      ) : status === 'unconfirmed' || resending ? (
        <PillButton label={tc('Try again')} busy={resending} disabled={resendBlocked} onPress={() => void save()} />
      ) : (
        <ActionRow
          secondary={<PillButton kind="secondary" label={tc('Cancel')} disabled={status === 'saving'} onPress={onCancel} />}
          primary={step === 'total'
            ? <PillButton label={tc('Next')} onPress={next} />
            : <PillButton label={tc('Save budget')} busy={status === 'saving'} busyLabel={tc('Saving…')} disabled={status === 'blocked'} onPress={() => void save()} />}
        />
      )}
    </ActionFooter>
  );

  if (status === 'conflict' && conflict) {
    const order = [...categories.map((category) => category.id)];
    const name = (id: string) => nameOf(categories.find((category) => category.id === id) ?? null);
    return (
      <BudgetPage stage={stage} footer={footer}>
        <BudgetConflictPanel rows={budgetConflictRows(conflict.mine, conflict.server, order)} nameOf={name} />
      </BudgetPage>
    );
  }

  const totalLabel = tc('Monthly total');
  const totalProblem = total.problem ? tc(KEYPAD_PROBLEM_TEXT[total.problem]) : fields.overall_limit_minor ?? null;
  const chosen = choices.find((category) => category.id === selected) ?? null;
  const chosenProblem = chosen ? limitOf(chosen.id).problem ?? limits.get(chosen.id)?.problem ?? null : null;
  return (
    <BudgetPage stage={stage} footer={footer}>
      {step === 'total' ? (
        <View style={{ gap: BUN_SPACE.sm }}>
          <EditorAmount label={totalLabel} keypad={total} />
          {totalProblem ? <FieldError message={totalProblem} /> : null}
          {start.prefilled && prefill ? (
            <BunText testID="budget-prefill" variant="caption" tone="muted">
              {(() => {
                const line = prefillCopy(prefill, (earlier) => monthLabel(earlier, dateLocale), locale);
                return tc(line.text, line.values);
              })()}
            </BunText>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: BUN_SPACE.sm }}>
          <View
            accessible
            accessibilityLabel={tc('{label}, {value}', { label: totalLabel, value: formatMinor(totalMinor ?? '0', locale) })}
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: BUN_SPACE.sm }}
          >
            <BunText tone="muted">{totalLabel}</BunText>
            <BunText variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{formatMinor(totalMinor ?? '0', locale)}</BunText>
          </View>
          {fields.overall_limit_minor ? <FieldError message={fields.overall_limit_minor} /> : null}
          <PillButton kind="secondary" label={tc('Change total')} disabled={locked} onPress={() => setStep('total')} />
          <SectionTitle>{tc('Category limits')}</SectionTitle>
          <BunText variant="caption" tone="muted">{tc('Limits are optional. Pick a category to give it one.')}</BunText>
          <View role="radiogroup" accessibilityLabel={tc('Category limits')} style={{ gap: BUN_SPACE.xs }}>
            {choices.map((category) => {
              const limit = limitOf(category.id).minor;
              return (
                <LimitChoice
                  key={category.id}
                  category={category}
                  value={limit === null ? tc('No limit') : formatMinor(limit, locale)}
                  checked={category.id === selected}
                  disabled={locked}
                  onPress={() => setSelected(category.id)}
                />
              );
            })}
          </View>
          {fields.category_limits ? <FieldError message={fields.category_limits} /> : null}
          {checkLine && check.ok ? <BunText testID="budget-limits-check" variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{tc(checkLine.text, checkLine.values)}</BunText> : null}
          {checkLine && !check.ok ? <FieldError message={tc(checkLine.text, checkLine.values)} /> : null}
          {chosen ? (
            <View style={{ gap: BUN_SPACE.xs, paddingTop: BUN_SPACE.xs, borderTopWidth: 1, borderColor: colors.rule }}>
              <EditorAmount label={tc('Limit for {name}', { name: nameOf(chosen) })} keypad={limits.get(chosen.id) ?? EMPTY_KEYPAD} />
              {chosenProblem ? <FieldError message={tc(KEYPAD_PROBLEM_TEXT[chosenProblem])} /> : null}
            </View>
          ) : null}
        </View>
      )}
      {step === 'total' || chosen ? <Keypad onKey={onKey} disabled={locked} /> : null}
    </BudgetPage>
  );
}
