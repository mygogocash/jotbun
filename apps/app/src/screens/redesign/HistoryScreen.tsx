// The redesigned History (R3, "calm data"): one month in day groups under the
// lavender stage, with a sticky search, type / wallet / category chips and a
// summary of what matched. It keeps every rule of the current Transactions
// list: keyset pages with no hidden cap and "Load more", the month's totals
// from the server, each action under its own command key, an unconfirmed
// delete frozen and resent with the same key, Undo through restore with the
// version the delete returned, "refresh suggested", and the load problems.
//
// Drafts saved on this device join their days with their state and never
// count in a day's confirmed total. Search runs on this device over the pages
// loaded so far (historyModel) and says so while more pages exist. Type,
// wallet and category also scope the server's query, so the month's totals
// and the summary for a filter are exact.
//
// Rows open the record screen; long-press and the screen reader's actions
// menu offer Edit (the record screen in edit mode), Copy (quick add with
// `copyOf`) and Delete (with an undo bar). The bun appears only on an empty
// month.
import { HISTORY_MAX_LIMIT } from '@gogospend/contracts';
import type { CategoryDto, HistoryFilter, HistoryPage, TransactionDto, TransactionType, WalletSnapshot } from '@gogospend/contracts';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import { useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { showsBun } from '@mobile/mascot/bunIntensity';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { formatMinor } from '@mobile/spend/v1/money';
import { foldForSearch, historyModel, summaryLine } from '@mobile/spend/v1/redesign/historyModel';
import type { HistoryModel, SearchSummary } from '@mobile/spend/v1/redesign/historyModel';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { countDrafts, openDrafts, say } from '@mobile/spend/v1/redesign/shared';
import type { DayGroup, EntryLike, Lookups } from '@mobile/spend/v1/redesign/shared';
import type { DiaryView } from '@mobile/spend/v1/spendDiary';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { categoryName, monthOf, monthRange, shiftMonth, todayInBangkok } from '@mobile/spend/v1/viewModels';
import type { OutboxCommand } from '@mobile/storage/types';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { monthLabel } from '@mobile/ui/dateStep';
import { DayHeader } from '@mobile/ui/DayHeader';
import { EmptyState } from '@mobile/ui/EmptyState';
import { BUN_OUTLINE, BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { RecordRow } from '@mobile/ui/RecordRow';
import { StageHeader } from '@mobile/ui/StageHeader';
import { SyncBanner } from '@mobile/ui/SyncBanner';
import type { SyncBannerProps } from '@mobile/ui/SyncBanner';
import { UndoBar } from '@mobile/ui/UndoBar';
import { saveProblem, useCommandKeys, useMoneyLocale } from '../v1/parts';
import { FilterChips, LoadingBlock, Notice, SearchField, copyRoute, lookOf, recordRoute, recordRowState, useDateLocale } from './HistoryParts';
import type { ChipOption } from './HistoryParts';

export type HistoryScreenProps = {
  now?: Date;
  /** `YYYY-MM` to open on. The route keeps it in the URL, so Back from a record returns to the same month. */
  initialMonth?: string;
  onMonthChange?: (month: string) => void;
};

const PAGE = 50;
const ALL = 'all';
const NO_DRAFTS: readonly OutboxCommand[] = [];
const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

type Lists = { page: HistoryPage; items: TransactionDto[] };
type References = { wallets: readonly Pick<WalletSnapshot, 'id' | 'name'>[]; categories: readonly CategoryDto[] };

const lookupsOf = (refs: References): Lookups => ({
  wallets: new Map(refs.wallets.map((wallet) => [wallet.id, wallet])),
  categories: new Map(refs.categories.map((category) => [category.id, category])),
});

/** One banner at a time, the most pressing first. Offline is said only where drafts are kept on this phone. */
function bannerFor(view: DiaryView, offline: boolean, review: (() => void) | null, tc: (english: string) => string): SyncBannerProps | null {
  if (view.phase === 'locked') return { state: 'locked' };
  if (view.phase !== 'ready') return null;
  if (offline) return { state: 'offline' };
  const counts = countDrafts(view.outbox);
  if (counts.update_to_send > 0) return { state: 'paused_upgrade' };
  if (counts.needs_look > 0 && review) return { state: 'needs_review', count: counts.needs_look, action: { label: tc('Review'), onPress: review } };
  if (counts.checking > 0) return { state: 'checking', count: counts.checking };
  if (counts.saving > 0) return { state: 'saving', count: counts.saving };
  return null;
}

export function HistoryScreen({ now, initialMonth, onMonthChange }: HistoryScreenProps) {
  const resources = useSpendV1();
  const router = useRouter();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const dateLocale = useDateLocale();
  const colors = useBunColors();
  const keys = useCommandKeys();
  const diaryView = useDiaryView();
  const { intensity } = useBunIntensity();
  const today = todayInBangkok(now ?? new Date());
  const thisMonth = monthOf(today);

  const [month, setMonth] = useState(() => (initialMonth && MONTH.test(initialMonth) && initialMonth <= thisMonth ? initialMonth : thisMonth));
  const [type, setType] = useState<TransactionType | undefined>(undefined);
  const [walletId, setWalletId] = useState<string | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [lists, setLists] = useState<Lists | null>(null);
  const [refs, setRefs] = useState<References | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [deleted, setDeleted] = useState<{ id: string; version: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TransactionDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);
  const shown = useRef(0);
  const acting = useRef(false);

  const filter: HistoryFilter = {
    ...monthRange(month),
    ...(type ? { type } : {}),
    ...(walletId ? { wallet_id: walletId } : {}),
    ...(categoryId ? { category_id: categoryId } : {}),
    sort: 'date_desc',
  };
  const filterKey = JSON.stringify(filter);

  /** Loads the first page again; in place, as many entries as were on screen (up to the page cap). */
  const load = useCallback(async (keepShown = false) => {
    const round = ++generation.current;
    setError(null);
    const scope = JSON.parse(filterKey) as HistoryFilter;
    const limit = keepShown ? Math.min(HISTORY_MAX_LIMIT, Math.max(PAGE, shown.current)) : undefined;
    try {
      const [wallets, categories, page] = await Promise.all([
        resources.wallets(),
        resources.ensureBuiltinCategories(),
        limit === undefined ? resources.history(scope) : resources.history(scope, undefined, limit),
      ]);
      if (round !== generation.current) return;
      shown.current = page.items.length;
      setRefs({ wallets, categories });
      setLists({ page, items: page.items });
    } catch (problem) {
      if (round === generation.current) setError(problem);
    }
  }, [resources, filterKey]);

  useEffect(() => {
    setLists(null);
    shown.current = 0;
    void load();
  }, [load]);

  // Coming back from a record (or anywhere else) refreshes the list in place.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  const focusedBefore = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focusedBefore.current) void loadRef.current(true);
    focusedBefore.current = true;
  }, []));

  // A draft that resolves (sent, discarded or undone) refreshes the list in place,
  // so its confirmed record takes its place without a loading flash.
  const openIds = useRef(new Set<string>());
  useEffect(() => {
    const open = new Set(openDrafts(diaryView.outbox).map((command) => command.commandId));
    const resolved = [...openIds.current].some((id) => !open.has(id));
    openIds.current = open;
    if (resolved) void loadRef.current(true);
  }, [diaryView.outbox]);

  async function loadMore() {
    if (!lists?.page.next_cursor || loadingMore) return;
    const round = generation.current;
    setLoadingMore(true);
    try {
      const page = await resources.history(filter, lists.page.next_cursor);
      if (round !== generation.current) return;
      shown.current = lists.items.length + page.items.length;
      setLists({ page, items: [...lists.items, ...page.items] });
      setNotice(null);
    } catch (problem) {
      if (round === generation.current) setNotice(classifyLoadProblem(problem, tc).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function remove(record: TransactionDto) {
    if (acting.current) return;
    acting.current = true;
    const slot = `delete:${record.id}`;
    const key = keys.keyFor(slot, { version: record.version });
    setBusy(true);
    try {
      const ack = await resources.deleteTransaction(record.id, record.version, key);
      keys.settle(slot);
      setPendingDelete(null);
      setDeleted({ id: record.id, version: ack.version });
      setNotice(null);
    } catch (problem) {
      const outcome = problem instanceof V1Error ? problem.outcome : undefined;
      const result = saveProblem(problem, tc);
      if (!result.unconfirmed) keys.settle(slot);
      setPendingDelete(result.unconfirmed ? record : null);
      if (outcome === 'deleted' || outcome === 'not_found') setNotice(tc('This entry was already deleted.'));
      else if (outcome === 'conflict') setNotice(tc('This entry changed on another device.'));
      else setNotice(result.message);
      if (!result.unconfirmed) void load(true);
      return;
    } finally {
      acting.current = false;
      setBusy(false);
    }
    void load(true);
  }

  async function undo() {
    if (!deleted || acting.current) return;
    acting.current = true;
    const slot = `restore:${deleted.id}`;
    const key = keys.keyFor(slot, deleted);
    setBusy(true);
    try {
      await resources.restoreTransaction(deleted.id, deleted.version, key);
      keys.settle(slot);
      setDeleted(null);
      setNotice(null);
    } catch (problem) {
      const result = saveProblem(problem, tc);
      if (!result.unconfirmed) {
        keys.settle(slot);
        setDeleted(null);
      }
      setNotice(result.message);
      return;
    } finally {
      acting.current = false;
      setBusy(false);
    }
    void load(true);
  }

  const changeMonth = (next: string) => {
    setMonth(next);
    onMonthChange?.(next);
  };
  const changeType = (next: TransactionType | undefined) => {
    setType(next);
    const chosen = categoryId ? refs?.categories.find((category) => category.id === categoryId) : undefined;
    if (next === 'transfer' || (next && chosen && chosen.type !== next)) setCategoryId(undefined);
  };
  const clearAll = () => {
    setType(undefined);
    setWalletId(undefined);
    setCategoryId(undefined);
    setQuery('');
  };

  // What the device holds, and the references to read it with: the server's
  // when the month loaded, the diary's when it could not (offline).
  const drafts = diaryView.phase === 'ready' ? diaryView.outbox : NO_DRAFTS;
  const offline = Boolean(error) && diaryView.phase === 'ready';
  const chipRefs: References | null = refs ?? (diaryView.phase === 'ready' ? { wallets: diaryView.wallets, categories: diaryView.categories } : null);
  const shownRefs: References | null = error ? (offline ? { wallets: diaryView.wallets, categories: diaryView.categories } : null) : lists ? refs : null;
  const lookups = shownRefs ? lookupsOf(shownRefs) : null;
  const filters = { type, walletId, categoryId };
  const model: HistoryModel | null = lookups
    ? historyModel({
      month, today, tc, locale, lookups, filters, query, drafts,
      records: error ? [] : lists?.items ?? [],
      complete: error ? true : !lists?.page.next_cursor,
    })
    : null;

  // Filters alone are scoped on the server, so its totals for them are exact.
  let summary: Pick<SearchSummary, 'text' | 'draftText' | 'partial'> | null = model?.summary ?? null;
  if (summary && lists && !error && foldForSearch(query) === '') {
    const totals = lists.page.summary;
    const out = totals.expense_minor === '0' ? null : formatMinor(totals.expense_minor, locale);
    const income = totals.income_minor === '0' ? null : formatMinor(totals.income_minor, locale);
    summary = { text: say(tc, summaryLine(totals.count, out, income)), draftText: summary.draftText, partial: false };
  }
  const spokenSummary = summary ? [summary.text, summary.draftText].filter(Boolean).join('. ') : null;
  useAnnouncement(spokenSummary);

  // Entries by record id: what Delete sends, and each row's category.
  const records = new Map((lists?.items ?? []).map((record) => [record.id, record]));
  const entries = new Map<string, EntryLike>([...records.entries(), ...drafts.map((command) => [command.payload.id, command.payload] as const)]);
  const firstReview = openDrafts(drafts).find((command) => command.state === 'needs_review');
  const banner = bannerFor(diaryView, offline && error instanceof V1Error && error.outcome === 'network', firstReview ? () => router.push(recordRoute(firstReview.payload.id)) : null, tc);
  const problem = error ? classifyLoadProblem(error, tc) : null;

  const typeOptions: ChipOption<TransactionType | typeof ALL>[] = [
    { value: ALL, label: tc('All') }, { value: 'expense', label: tc('Expense') }, { value: 'income', label: tc('Income') }, { value: 'transfer', label: tc('Transfer') },
  ];
  const walletOptions: ChipOption<string>[] = chipRefs ? [{ value: ALL, label: tc('All wallets') }, ...chipRefs.wallets.map((wallet) => ({ value: wallet.id, label: wallet.name }))] : [];
  const categoryOptions: ChipOption<string>[] = chipRefs
    ? [
      { value: ALL, label: tc('All categories') },
      ...chipRefs.categories
        .filter((category) => (category.id === categoryId || !category.archived) && (!type || category.type === type))
        .map((category) => ({ value: category.id, label: categoryName(category, tc) })),
    ]
    : [];

  const moneyIn = lists && !error ? formatMinor(lists.page.summary.income_minor, locale) : null;
  const moneyOut = lists && !error ? formatMinor(lists.page.summary.expense_minor, locale) : null;
  const emptyMonth = model !== null && model.empty && !model.filtered && !error;
  const bunArt = showsBun(intensity) ? <Bun pose="thinking" size="l" testID="history-empty-bun" /> : undefined;

  const row = (group: DayGroup) => group.rows.map((item) => {
    const entry = entries.get(item.recordId);
    const category = entry && entry.type !== 'transfer' ? lookups?.categories.get(entry.category_id) : undefined;
    const record = item.state === 'confirmed' ? records.get(item.recordId) : undefined;
    return (
      <View key={item.key}>
        <RecordRow
          title={item.title}
          detail={[item.detail, item.merchant, item.note].filter((part): part is string => Boolean(part)).join(' · ')}
          type={item.type}
          amountMinor={item.amountMinor}
          category={lookOf(category, item.title)}
          state={recordRowState(item.state)}
          onPress={() => router.push(recordRoute(item.recordId))}
          onEdit={item.canEdit ? () => router.push(recordRoute(item.recordId, true)) : undefined}
          onCopy={() => router.push(copyRoute(item.recordId))}
          onDelete={record && !busy && pendingDelete === null ? () => void remove(record) : undefined}
        />
        {/* RecordRow has no "update to send" state: it reads "saving…", and this line says why it waits. */}
        {item.state === 'update_to_send' && item.stateText ? <BunText variant="caption" tone="ink" style={{ fontWeight: '700' }}>{item.stateText}</BunText> : null}
      </View>
    );
  });

  return (
    <View testID="history-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={{ paddingBottom: BUN_SPACE.xl }} keyboardShouldPersistTaps="handled">
        <StageHeader
          title={tc('History')}
          month={{
            label: monthLabel(month, dateLocale),
            onPrevious: () => changeMonth(shiftMonth(month, -1)),
            // Entries are never in the future, so there is nothing after this month.
            onNext: month < thisMonth ? () => changeMonth(shiftMonth(month, 1)) : undefined,
          }}
        >
          {moneyIn !== null && moneyOut !== null ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: BUN_SPACE.md }}>
              <BunText variant="label" tone="ink" accessibilityLabel={`${tc('Money in')} ${moneyIn}`} style={{ fontVariant: ['tabular-nums'] }}>{`${tc('Money in')} ${moneyIn}`}</BunText>
              <BunText variant="label" tone="ink" accessibilityLabel={`${tc('Money out')} ${moneyOut}`} style={{ fontVariant: ['tabular-nums'] }}>{`${tc('Money out')} ${moneyOut}`}</BunText>
            </View>
          ) : null}
        </StageHeader>
        <View style={{ backgroundColor: colors.background, paddingHorizontal: BUN_SPACE.md, paddingVertical: BUN_SPACE.xs }}>
          <SearchField value={query} onChangeText={setQuery} />
        </View>
        <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>
          {banner ? <SyncBanner {...banner} /> : null}
          <View style={{ gap: BUN_SPACE.sm }}>
            <FilterChips label={tc('Type')} options={typeOptions} value={type ?? ALL} onChange={(next) => changeType(next === ALL ? undefined : next)} />
            {walletOptions.length > 1 ? (
              <FilterChips label={tc('Wallet')} options={walletOptions} value={walletId ?? ALL} onChange={(next) => setWalletId(next === ALL ? undefined : next)} />
            ) : null}
            {type !== 'transfer' && categoryOptions.length > 1 ? (
              <FilterChips label={tc('Category')} options={categoryOptions} value={categoryId ?? ALL} onChange={(next) => setCategoryId(next === ALL ? undefined : next)} />
            ) : null}
          </View>
          {summary ? (
            <View testID="history-summary" {...POLITE_LIVE_REGION} style={{ gap: BUN_SPACE.xs, paddingVertical: BUN_SPACE.xs, borderTopWidth: BUN_OUTLINE.rule, borderBottomWidth: BUN_OUTLINE.rule, borderColor: colors.rule }}>
              <BunText variant="label" style={{ fontWeight: '700' }}>{summary.text}</BunText>
              {summary.draftText ? <BunText variant="caption" tone="muted">{summary.draftText}</BunText> : null}
              {summary.partial ? <BunText variant="caption" tone="muted">{tc('Only loaded entries are searched. Load more to search the rest.')}</BunText> : null}
              <PillButton kind="secondary" label={tc('Clear filters')} onPress={clearAll} />
            </View>
          ) : null}
          {notice ? (
            <Notice tone="alert" message={notice} action={pendingDelete ? { label: tc('Try again'), busy, onPress: () => void remove(pendingDelete) } : undefined} />
          ) : null}
          {lists?.page.refresh_suggested && !error ? (
            <Notice message={tc('Entries changed since you opened this list.')} action={{ label: tc('Refresh'), onPress: () => void load(true) }} />
          ) : null}
          {problem ? <Notice tone="alert" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: () => void load(true) } : undefined} /> : null}
          {!error && !lists ? <LoadingBlock label={tc('Loading entries')} /> : null}
          {model?.groups.map((group) => (
            <View key={group.day} style={{ borderTopWidth: BUN_OUTLINE.rule, borderColor: colors.rule, paddingTop: BUN_SPACE.xs }}>
              <DayHeader date={group.day} today={today} outMinor={group.totals.confirmed.outMinor} inMinor={group.totals.confirmed.inMinor} />
              {group.pendingLines.map((line) => <BunText key={line} variant="caption" tone="muted">{line}</BunText>)}
              {row(group)}
            </View>
          ))}
          {emptyMonth ? (
            <EmptyState
              art={bunArt}
              title={tc('No entries in this month')}
              body={tc('Entries you add for this month show up here.')}
              action={{ label: tc('Add an entry'), onPress: () => router.push('/spend/add') }}
            />
          ) : null}
          {lists?.page.next_cursor && !error ? (
            <PillButton kind="secondary" label={tc('Load more')} busy={loadingMore} busyLabel={tc('Loading entries')} onPress={() => void loadMore()} />
          ) : null}
        </View>
      </ScrollView>
      {deleted ? (
        <View style={{ paddingHorizontal: BUN_SPACE.md, paddingBottom: BUN_SPACE.md }}>
          <UndoBar message={tc('Entry deleted')} onUndo={() => void undo()} />
        </View>
      ) : null}
    </View>
  );
}
