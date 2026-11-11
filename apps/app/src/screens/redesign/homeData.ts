// Home's data (P2-T23, W2): the redesigned Home's load, moved out of
// HomeScreen.tsx unchanged so that the Bun Wallet Home (P2-T24) reads the same
// thing: the built-in categories, the wallets, the month's summary and budget,
// every record of today (page by page) and one page of earlier records cut
// back to whole days. It reads again in place when a draft it was waiting on
// resolves, and when a change another phone made is pulled into the diary
// (1D-T5's useRefreshOnRevision, which moved here with the load under the
// carry rule). The budget threshold haptic moved with it, module state and
// all, so both Homes share one app session's reading.
import type { HistoryFilter } from '@gogospend/contracts';
import { HISTORY_MAX_LIMIT, TRACKING_START_MIN } from '@gogospend/contracts';
import { useEffect, useRef } from 'react';

import { playHaptic } from '@mobile/lib/hapticMoment';
import { earlierWholeDays, readWholeDay } from '@mobile/spend/v1/redesign/homeModel';
import type { HomeData, HomeLoad } from '@mobile/spend/v1/redesign/homeModel';
import { budgetLevel, crossedLevel } from '@mobile/spend/v1/redesign/milestones';
import type { LevelSeen } from '@mobile/spend/v1/redesign/milestones';
import { addDays } from '@mobile/spend/v1/redesign/shared';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { monthOf } from '@mobile/spend/v1/viewModels';
import type { OutboxCommand } from '@mobile/storage/types';
import { useLoad } from '../v1/parts';
import { useRefreshOnRevision } from './useRefreshOnRevision';

/** Earlier records read for those days (one page, cut back to whole days). */
const EARLIER_RECORDS = 50;
/** Pages of today's records read (each up to HISTORY_MAX_LIMIT); a busier day is shown as partial, never as an error. */
const TODAY_PAGES = 20;

/** Every record of today, page by page (`readWholeDay`): the receipt's day total is never a partial sum without saying so. */
export function readToday(resources: SpendV1Resources, day: string) {
  const filter: HistoryFilter = { from: day, through: day, sort: 'date_desc' };
  return readWholeDay((cursor) => resources.history(filter, cursor, HISTORY_MAX_LIMIT), TODAY_PAGES);
}

/** Reloads confirmed money in place whenever a draft it was waiting on resolves (as the current Home does). */
function useRefreshOnResolve(outbox: readonly OutboxCommand[], refresh: () => void): void {
  const open = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set(outbox.filter((command) => command.state !== 'acknowledged').map((command) => command.commandId));
    const resolved = [...open.current].some((id) => !now.has(id));
    open.current = now;
    if (resolved) refresh();
  }, [outbox, refresh]);
}

/** Home's load for `today` (a Bangkok date), as `useLoad` gives it: `reload` reads again from loading, `refresh` in place. */
export function useHomeData(today: string): HomeLoad & { reload(): void; refresh(): void } {
  const resources = useSpendV1();
  const diaryView = useDiaryView();
  const month = monthOf(today);
  const loaded = useLoad<HomeData>(async () => {
    const [categories, wallets, summary, budget, todays, earlier] = await Promise.all([
      resources.ensureBuiltinCategories(),
      resources.wallets(),
      resources.summary(month),
      resources.budget(month),
      readToday(resources, today),
      resources.history({ from: TRACKING_START_MIN, through: addDays(today, -1), sort: 'date_desc' }, undefined, EARLIER_RECORDS),
    ]);
    // Earlier records cut back to whole days; the model keeps drafts on a cut day out too.
    const whole = earlierWholeDays(earlier);
    return {
      categories, wallets, summary, budget,
      records: [...todays.records, ...whole.records],
      oldestWholeDay: whole.oldestWholeDay,
      todayComplete: todays.complete,
    };
  }, [resources, month, today]);
  useRefreshOnResolve(diaryView.outbox, loaded.refresh);
  // A change another phone made was pulled into the diary: reload the money in place.
  useRefreshOnRevision(diaryView.appliedRevision, loaded.refresh);
  return loaded;
}

// The month's budget level last seen in this app session. Module state, not a
// ref: Home unmounts while Quick add is open, and the crossing happens there.
let lastBudgetLevel: LevelSeen | null = null;

/** Plays `thresholdCrossed` once when spending moves past 80% or 100% of the limit (milestones.ts). */
export function useBudgetThresholdHaptic(month: string, spentMinor: string | null, limitMinor: string | null): void {
  useEffect(() => {
    if (spentMinor === null) return;
    const next: LevelSeen = { month, level: budgetLevel(spentMinor, limitMinor) };
    if (crossedLevel(lastBudgetLevel, next) !== null) playHaptic('thresholdCrossed');
    lastBudgetLevel = next;
  }, [month, spentMinor, limitMinor]);
}
