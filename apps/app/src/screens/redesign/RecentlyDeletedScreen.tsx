// "Recently deleted" (redesign plan §6.1, /spend/deleted, opened from
// History): the entries deleted in the last 30 days, most recently deleted
// first, each with a Restore. It says the retention policy in words first:
// a deleted entry can be restored for 30 days, and after that it is gone for
// good (the server purges it).
//
// The list is GET /v1/history/deleted (`SpendV1Resources.recentlyDeleted`),
// keyset pages with "Load more" and "refresh suggested" as in History. Rows
// go through `recentlyDeletedModel`, which applies the restore rule again on
// this device's clock. Restore is the existing restore command with the
// entry's own version under its own key: a restore whose answer is lost is
// frozen and "Try again" resends the same command; a refusal is said in plain
// words and the list is read again. The load problems are History's.
import { HISTORY_MAX_LIMIT, RESTORE_WINDOW_DAYS } from '@gogospend/contracts';
import type { CategoryDto, DeletedHistoryPage, DeletedTransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { recentlyDeletedModel, restoreRefusalText, restoredText } from '@mobile/spend/v1/redesign/historyModel';
import type { DeletedRow } from '@mobile/spend/v1/redesign/historyModel';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import type { Lookups } from '@mobile/spend/v1/redesign/shared';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { EmptyState } from '@mobile/ui/EmptyState';
import { BUN_OUTLINE, BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { RecordRow } from '@mobile/ui/RecordRow';
import { StageHeader } from '@mobile/ui/StageHeader';
import { SyncBanner } from '@mobile/ui/SyncBanner';
import type { SyncBannerProps } from '@mobile/ui/SyncBanner';
import { saveProblem, useCommandKeys, useMoneyLocale } from '../v1/parts';
import { LoadingBlock, Notice, lookOf, useGoBack } from './HistoryParts';

export type RecentlyDeletedScreenProps = { now?: Date };

const PAGE = 50;

type Lists = { page: DeletedHistoryPage; items: DeletedTransactionDto[] };
type References = { wallets: readonly Pick<WalletSnapshot, 'id' | 'name'>[]; categories: readonly CategoryDto[] };
type Target = { id: string; version: number };

/** Each entry's restore keeps its own command key. */
const restoreSlot = (id: string) => `restore:${id}`;

const lookupsOf = (refs: References): Lookups => ({
  wallets: new Map(refs.wallets.map((wallet) => [wallet.id, wallet])),
  categories: new Map(refs.categories.map((category) => [category.id, category])),
});

/** One deleted entry: the row as History draws it (without its actions), the days left, and Restore. */
function DeletedEntry({ row, lookups, restoring, frozen, disabled, onRestore }: {
  row: DeletedRow; lookups: Lookups; restoring: boolean; frozen: boolean; disabled: boolean; onRestore: () => void;
}) {
  const tc = useCopy();
  const colors = useBunColors();
  const look = lookOf(row.categoryId ? lookups.categories.get(row.categoryId) : undefined, row.title);
  const detail = [row.detail, row.merchant, row.note].filter((part): part is string => Boolean(part)).join(' · ');
  return (
    <View style={{ gap: BUN_SPACE.xs, paddingTop: BUN_SPACE.xs, borderTopWidth: BUN_OUTLINE.rule, borderColor: colors.rule }}>
      <RecordRow title={row.title} detail={detail} type={row.type} amountMinor={row.amountMinor} category={look} />
      <BunText variant="caption" tone="muted">{row.daysLeftText}</BunText>
      {frozen ? (
        // Its answer was lost: only the same command again.
        <PillButton kind="secondary" label={tc('Try again')} busy={restoring} onPress={onRestore} />
      ) : (
        <PillButton
          kind="secondary"
          label={tc('Restore')}
          // Several rows each have a Restore: the spoken name says which entry.
          accessibilityLabel={tc('Restore {entry}', { entry: `${row.title}, ${row.amountLabel}` })}
          busy={restoring}
          disabled={disabled}
          onPress={onRestore}
        />
      )}
    </View>
  );
}

export function RecentlyDeletedScreen({ now }: RecentlyDeletedScreenProps) {
  const resources = useSpendV1();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const colors = useBunColors();
  const keys = useCommandKeys();
  const diaryView = useDiaryView();
  const goBack = useGoBack();

  const [lists, setLists] = useState<Lists | null>(null);
  const [refs, setRefs] = useState<References | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  /** The entry whose restore is on its way. */
  const [restoring, setRestoring] = useState<string | null>(null);
  /** A restore whose answer is unknown: frozen until "Try again" resends the same command. */
  const [pending, setPending] = useState<Target | null>(null);
  // `about`: the entry an unconfirmed restore's notice is about, so the notice can go once that entry is.
  const [notice, setNotice] = useState<{ tone: 'alert' | 'status'; message: string; about?: string } | null>(null);
  const generation = useRef(0);
  const shown = useRef(0);
  const acting = useRef(false);

  /** Loads the first page again; in place, as many entries as were on screen (up to the page cap). */
  const load = useCallback(async (keepShown = false) => {
    const round = ++generation.current;
    setError(null);
    const limit = keepShown ? Math.min(HISTORY_MAX_LIMIT, Math.max(PAGE, shown.current)) : undefined;
    try {
      const [wallets, categories, page] = await Promise.all([
        resources.wallets(),
        resources.ensureBuiltinCategories(),
        limit === undefined ? resources.recentlyDeleted() : resources.recentlyDeleted(undefined, limit),
      ]);
      if (round !== generation.current) return;
      shown.current = page.items.length;
      setRefs({ wallets, categories });
      setLists({ page, items: page.items });
    } catch (problem) {
      if (round === generation.current) setError(problem);
    }
  }, [resources]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!lists?.page.next_cursor || loadingMore) return;
    const round = generation.current;
    setLoadingMore(true);
    try {
      const page = await resources.recentlyDeleted(lists.page.next_cursor);
      if (round !== generation.current) return;
      const items = [...lists.items, ...page.items];
      shown.current = items.length;
      setLists({ page, items });
    } catch (problem) {
      if (round === generation.current) setNotice({ tone: 'alert', message: classifyLoadProblem(problem, tc).message });
    } finally {
      setLoadingMore(false);
    }
  }

  async function restore(row: DeletedRow) {
    if (acting.current) return;
    acting.current = true;
    const target: Target = { id: row.recordId, version: row.version };
    const slot = restoreSlot(row.recordId);
    const key = keys.keyFor(slot, target);
    setRestoring(row.recordId);
    try {
      await resources.restoreTransaction(row.recordId, row.version, key);
      keys.settle(slot);
      setPending(null);
      // Off this list at once; the list is read again in place below.
      setLists((current) => (current ? { ...current, items: current.items.filter((item) => item.id !== row.recordId) } : current));
      setNotice({ tone: 'status', message: restoredText(row, locale, tc) });
    } catch (problem) {
      const v1 = problem instanceof V1Error ? problem : undefined;
      const saved = saveProblem(problem, tc);
      if (!saved.unconfirmed) keys.settle(slot);
      setPending(saved.unconfirmed ? target : null);
      setNotice({ tone: 'alert', message: restoreRefusalText(v1?.outcome, v1?.fields ?? {}, tc) ?? saved.message, ...(saved.unconfirmed ? { about: target.id } : {}) });
      // A definite refusal: read the list again, so it shows what can still be restored.
      if (!saved.unconfirmed) void load(true);
      return;
    } finally {
      acting.current = false;
      setRestoring(null);
    }
    void load(true);
  }

  const lookups = useMemo(() => (refs ? lookupsOf(refs) : null), [refs]);
  const model = useMemo(
    () => (lists && lookups ? recentlyDeletedModel({ records: lists.items, now: now ?? new Date(), lookups, tc, locale }) : null),
    [lists, lookups, now, tc, locale],
  );
  // A restore whose answer is unknown holds the other Restores only while its own row (and Try again) is listed. A
  // read that no longer lists it (Refresh, or Try again after a failed read) shows it was restored after all, or can
  // no longer be: its command is done.
  const held = pending && model?.rows.some((row) => row.recordId === pending.id) ? pending : null;
  useEffect(() => {
    if (!pending || !model || held) return;
    keys.settle(restoreSlot(pending.id));
    setPending(null);
    setNotice((current) => (current?.about === pending.id ? null : current));
  }, [pending, model, held, keys.settle]);
  // Its "try again" notice shows only while its row does: once a read no longer lists it, there is nothing left to
  // try again. Decided here too, so it goes in the same frame as the row.
  const shownNotice = notice?.about !== undefined && held?.id !== notice.about ? null : notice;
  // History's banners: the diary locked, or offline where this phone keeps a diary.
  const offline = error instanceof V1Error && error.outcome === 'network' && diaryView.phase === 'ready';
  const banner: SyncBannerProps | null = diaryView.phase === 'locked' ? { state: 'locked' } : offline ? { state: 'offline' } : null;
  const problem = error ? classifyLoadProblem(error, tc) : null;
  const busy = restoring !== null;

  return (
    <View testID="recently-deleted-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BUN_SPACE.xl, gap: BUN_SPACE.md }}>
        <StageHeader title={tc('Recently deleted')} back={{ onPress: goBack }} />
        <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          {banner ? <SyncBanner {...banner} /> : null}
          {/* The retention policy, in words, wherever this list is shown. */}
          <BunText testID="recently-deleted-retention">
            {tc('Deleted entries can be restored for {days} days. After that, they are gone for good.', { days: RESTORE_WINDOW_DAYS })}
          </BunText>
          {shownNotice ? <Notice tone={shownNotice.tone} message={shownNotice.message} /> : null}
          {lists?.page.refresh_suggested && !error ? (
            <Notice message={tc('Entries changed since you opened this list.')} action={{ label: tc('Refresh'), onPress: () => void load(true) }} />
          ) : null}
          {problem ? <Notice tone="alert" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: () => void load(true) } : undefined} /> : null}
          {!error && !lists ? <LoadingBlock label={tc('Loading entries')} /> : null}
          {model && lookups && !error ? (
            model.rows.length === 0 ? (
              <EmptyState
                // EmptyState leaves the art (and its space) out when the bun is off.
                art={<Bun pose="sleepy" size="l" testID="recently-deleted-empty-bun" />}
                title={model.emptyText ?? tc('Nothing deleted in the last 30 days')}
                body={tc('Entries you delete show up here.')}
              />
            ) : (
              model.rows.map((row) => (
                <DeletedEntry
                  key={row.recordId}
                  row={row}
                  lookups={lookups}
                  restoring={restoring === row.recordId}
                  frozen={held?.id === row.recordId}
                  // One restore at a time; none other while one's answer is unknown.
                  disabled={(busy && restoring !== row.recordId) || (held !== null && held.id !== row.recordId)}
                  onRestore={() => void restore(row)}
                />
              ))
            )
          ) : null}
          {lists?.page.next_cursor && !error ? (
            <PillButton kind="secondary" label={tc('Load more')} busy={loadingMore} busyLabel={tc('Loading entries')} onPress={() => void loadMore()} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
