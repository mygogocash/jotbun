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
// In the `conflict` area (C16, 1D-T9) a record whose refused edit waits on
// this phone says so under its row; a tap opens the record as usual.
//
// Analytics (1D-T7, R61): Delete sends one record_deleted and the undo bar's
// Undo one undo_used, each once Jotbun has acknowledged it, with the record's
// kind and category key only.
//
// Rows open the record screen; long-press and the screen reader's actions
// menu offer Edit (the record screen in edit mode), Copy (quick add with
// `copyOf`) and Delete (with an undo bar). The bun appears only on an empty
// month. "Recently deleted", under the filters, opens the entries deleted in
// the last 30 days (RecentlyDeletedScreen), where each can be restored.
//
// The spend layout draws its screens in a `Slot`, so a record or Recently
// deleted unmounts History, and Back mounts it again. Opening one of them keeps
// the filters, the search and how many entries were loaded (historyKeep); on
// the way back, for the same month, History starts from them and reads that
// many entries again, so a changed or deleted entry shows its new state.
//
// The list is virtualized (a `FlatList`, review m7): it draws its first items
// at once and then only a window around what is on screen, so a long month
// never mounts every row. Each row is memoized on what it shows, and search
// follows typing through a deferred value, so a keystroke redraws only the
// field until the list's answer is ready, and then only rows that changed.
import { HISTORY_MAX_LIMIT } from '@gogospend/contracts';
import type { CategoryDto, HistoryFilter, HistoryPage, Minor, TransactionDto, TransactionType, WalletSnapshot } from '@gogospend/contracts';
import { useFocusEffect, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';

import { trackRecordDeleted, trackUndoUsed } from '@mobile/analytics/events';
import type { RecordKind } from '@mobile/analytics/events';
import { recordEventOf } from '@mobile/analytics/recordProps';
import { V1Error } from '@mobile/api/client';
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { formatMinor } from '@mobile/spend/v1/money';
import { foldForSearch, historyModel, summaryLine } from '@mobile/spend/v1/redesign/historyModel';
import type { HistoryModel, SearchSummary } from '@mobile/spend/v1/redesign/historyModel';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { countDrafts, openDrafts, say } from '@mobile/spend/v1/redesign/shared';
import type { DayGroup, EntryLike, Lookups, RowState } from '@mobile/spend/v1/redesign/shared';
import type { DiaryView } from '@mobile/spend/v1/spendDiary';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { categoryName, monthOf, monthRange, shiftMonth, todayInBangkok } from '@mobile/spend/v1/viewModels';
import type { OutboxCommand, PendingChoice } from '@mobile/storage/types';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { POLITE_LIVE_REGION, useSettledAnnouncement } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import type { CategoryLook } from '@mobile/ui/categoryIcons';
import { monthLabel } from '@mobile/ui/dateStep';
import { DayHeader } from '@mobile/ui/DayHeader';
import { EmptyState } from '@mobile/ui/EmptyState';
import { BUN_OUTLINE, BUN_SPACE } from '@mobile/ui/layout';
import { useFirstItems } from '@mobile/ui/listWindow';
import { PillButton } from '@mobile/ui/PillButton';
import { RecordRow } from '@mobile/ui/RecordRow';
import { StageHeader } from '@mobile/ui/StageHeader';
import { SyncBanner } from '@mobile/ui/SyncBanner';
import type { SyncBannerProps } from '@mobile/ui/SyncBanner';
import { UndoBar } from '@mobile/ui/UndoBar';
import { FilterChips } from '@mobile/ui/FilterChip';
import type { ChipOption } from '@mobile/ui/FilterChip';
import { SearchField } from '@mobile/ui/SearchField';
import { saveProblem, useCommandKeys, useMoneyLocale } from '../v1/parts';
import { useHistoryKeep } from './HistoryKeepProvider';
import type { KeptHistoryView } from './historyKeep';
import { useRefreshOnRevision } from './useRefreshOnRevision';
import { ChoiceWaitingCaption, LoadingBlock, Notice, RECENTLY_DELETED_ROUTE, copyHref, lookOf, recordHref, recordRowState, useDateLocale } from './HistoryParts';

export type HistoryScreenProps = {
  now?: Date;
  /** `YYYY-MM` to open on. The route keeps it in the URL, so Back from a record returns to the same month. */
  initialMonth?: string;
  onMonthChange?: (month: string) => void;
  /** C16's waiting caption: the `conflict` redesign area by default. The catalogue's choice section passes true. */
  conflictArea?: boolean;
};

const PAGE = 50;
const ALL = 'all';
const NO_DRAFTS: readonly OutboxCommand[] = [];
const NO_CHOICES: readonly PendingChoice[] = [];
const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

type Lists = { page: HistoryPage; items: TransactionDto[] };
type References = { wallets: readonly Pick<WalletSnapshot, 'id' | 'name'>[]; categories: readonly CategoryDto[] };
/** The whole confirmed totals of the day a page may have cut, under the filter (as JSON) they were read for. */
type Edge = { day: string; scope: string; outMinor: Minor; inMinor: Minor };

/** Rows a phone shows on one screen and a little more: what the list draws before it has measured itself. */
const FIRST_ITEMS = 24;
/** The list keeps this many screens' worth of rows drawn around the visible one (5 above, 5 below). */
const WINDOW_SCREENS = 11;
/** The search field stays at the top while the list scrolls under it (the stage is the list's header, index 0). */
const STICKY_SEARCH = [1];

/** What a row shows, as plain values, so a row is drawn again only when one of them changes. */
type RowItem = {
  readonly kind: 'row';
  readonly key: string;
  readonly recordId: string;
  readonly title: string;
  readonly detail: string;
  readonly type: TransactionType;
  readonly amountMinor: Minor;
  readonly state: RowState;
  /** The category's icon, when the category is known here; undefined otherwise. */
  readonly builtinKey: CategoryLook['builtinKey'] | undefined;
  readonly color: string | null;
  readonly canEdit: boolean;
  /** A confirmed record, and no other delete is on its way. */
  readonly deletable: boolean;
  /** C16: a refused edit of this record waits for the person's choice. */
  readonly choicePending: boolean;
};
type DayItem = { readonly kind: 'day'; readonly key: string; readonly day: string; readonly outMinor: Minor; readonly inMinor: Minor; readonly pendingLines: readonly string[] };
/** The list: the sticky search, the controls (banner, filters, summary, notices), then each day's header and rows. */
type ListItem = { readonly kind: 'search'; readonly key: 'search' } | { readonly kind: 'controls'; readonly key: 'controls' } | DayItem | RowItem;

/** Row actions by record id. The screen keeps one object for its life, so rows never redraw because of it. */
type RowActions = { open: (id: string) => void; edit: (id: string) => void; copy: (id: string) => void; remove: (id: string) => void };

/** One day's heading and its waiting-money lines, set apart from the day above by a rule. */
const HistoryDay = memo(function HistoryDay({ day, today, outMinor, inMinor, pendingLines }: Omit<DayItem, 'kind' | 'key'> & { today: string }) {
  const colors = useBunColors();
  return (
    <View style={{ marginTop: BUN_SPACE.md, marginHorizontal: BUN_SPACE.md, borderTopWidth: BUN_OUTLINE.rule, borderColor: colors.rule, paddingTop: BUN_SPACE.xs }}>
      <DayHeader date={day} today={today} outMinor={outMinor} inMinor={inMinor} />
      {pendingLines.map((line) => <BunText key={line} variant="caption" tone="muted">{line}</BunText>)}
    </View>
  );
});

/** One record or draft. Memoized: typing a search, a banner or a notice never redraws a row whose words did not change. */
const HistoryRow = memo(function HistoryRow({ recordId, title, detail, type, amountMinor, state, builtinKey, color, canEdit, deletable, choicePending, actions }: Omit<RowItem, 'kind' | 'key'> & { actions: RowActions }) {
  return (
    <View style={{ paddingHorizontal: BUN_SPACE.md }}>
      <RecordRow
        title={title}
        detail={detail}
        type={type}
        amountMinor={amountMinor}
        category={builtinKey === undefined ? null : { builtinKey, name: title, color }}
        // Every draft state has its own words, "Update Jotbun to send" included.
        state={recordRowState(state)}
        onPress={() => actions.open(recordId)}
        onEdit={canEdit ? () => actions.edit(recordId) : undefined}
        onCopy={() => actions.copy(recordId)}
        onDelete={deletable ? () => actions.remove(recordId) : undefined}
      />
      {choicePending ? <ChoiceWaitingCaption /> : null}
    </View>
  );
});

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

export function HistoryScreen({ now, initialMonth, onMonthChange, conflictArea }: HistoryScreenProps) {
  const resources = useSpendV1();
  const router = useRouter();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const dateLocale = useDateLocale();
  const colors = useBunColors();
  const keys = useCommandKeys();
  const diaryView = useDiaryView();
  const today = todayInBangkok(now ?? new Date());
  const thisMonth = monthOf(today);

  const [month, setMonth] = useState(() => (initialMonth && MONTH.test(initialMonth) && initialMonth <= thisMonth ? initialMonth : thisMonth));
  // Back from a record or Recently deleted: the view kept when it opened, for the month it was kept for only (the
  // URL's month stays the month). Nothing outside the spend layout, or on any other way in.
  const keep = useHistoryKeep();
  const [kept] = useState(() => {
    const view = keep?.kept() ?? null;
    return view?.month === month ? view : null;
  });
  const [type, setType] = useState<TransactionType | undefined>(kept?.type);
  const [walletId, setWalletId] = useState<string | undefined>(kept?.walletId);
  const [categoryId, setCategoryId] = useState<string | undefined>(kept?.categoryId);
  const [query, setQuery] = useState(kept?.query ?? '');
  const [lists, setLists] = useState<Lists | null>(null);
  const [refs, setRefs] = useState<References | null>(null);
  const [error, setError] = useState<unknown>(null);
  // The undo bar restores this version; `kind` is its undo_used's (1D-T7).
  const [deleted, setDeleted] = useState<{ id: string; version: number; kind: RecordKind } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TransactionDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);
  const shown = useRef(0);
  const acting = useRef(false);

  // Set when History opens a record or Recently deleted (`openOwn`): unmounting under it keeps the view for the way back.
  const away = useRef(false);
  const viewed = useRef<Omit<KeptHistoryView, 'shown'>>({ month, type, walletId, categoryId, query });
  viewed.current = { month, type, walletId, categoryId, query };
  useEffect(() => () => {
    if (away.current) keep?.keep({ ...viewed.current, shown: shown.current });
  }, [keep]);

  const filter: HistoryFilter = {
    ...monthRange(month),
    ...(type ? { type } : {}),
    ...(walletId ? { wallet_id: walletId } : {}),
    ...(categoryId ? { category_id: categoryId } : {}),
    sort: 'date_desc',
  };
  const filterKey = JSON.stringify(filter);
  /** The entries the kept view had loaded, for its own month and filters only. */
  const keptShown = useRef(kept ? { filterKey, shown: kept.shown } : null);

  // A page can end inside a day. While more pages follow, the oldest loaded
  // day's records may go on in the next page (the model's `pageEdgeDay`,
  // whose group is `partial`), so its header never shows the loaded part as
  // the day's total: with each load, that day's exact confirmed totals are
  // read from the server too (the same filter, that one day, one row), and
  // if they cannot be read the header shows no total at all.
  const [edge, setEdge] = useState<Edge | null>(null);
  const readEdge = useCallback(async (scope: HistoryFilter, items: readonly TransactionDto[], nextCursor: string | null): Promise<Edge | null> => {
    if (nextCursor === null || items.length === 0) return null;
    const day = items[items.length - 1].occurred_on;
    try {
      const totals = (await resources.history({ ...scope, from: day, through: day }, undefined, 1)).summary;
      return { day, scope: JSON.stringify(scope), outMinor: totals.expense_minor, inMinor: totals.income_minor };
    } catch {
      return null;
    }
  }, [resources]);

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
      const pageEdge = await readEdge(scope, page.items, page.next_cursor);
      if (round !== generation.current) return;
      shown.current = page.items.length;
      setRefs({ wallets, categories });
      setEdge(pageEdge);
      setLists({ page, items: page.items });
    } catch (problem) {
      if (round === generation.current) setError(problem);
    }
  }, [resources, filterKey, readEdge]);

  useEffect(() => {
    setLists(null);
    // On the way back, as many entries as were loaded are read again (as Recently deleted does); another filter starts at one page.
    if (keptShown.current?.filterKey !== filterKey) keptShown.current = null;
    shown.current = keptShown.current?.shown ?? 0;
    void load(shown.current > 0);
  }, [load, filterKey]);

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

  // A change another phone made was pulled into the diary: the list reloads in place, keeping what it shows.
  useRefreshOnRevision(diaryView.appliedRevision, () => void loadRef.current(true));

  async function loadMore() {
    if (!lists?.page.next_cursor || loadingMore) return;
    const round = generation.current;
    setLoadingMore(true);
    try {
      const page = await resources.history(filter, lists.page.next_cursor);
      const items = [...lists.items, ...page.items];
      const pageEdge = await readEdge(filter, items, page.next_cursor);
      if (round !== generation.current) return;
      shown.current = items.length;
      setEdge(pageEdge);
      setLists({ page, items });
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
      trackRecordDeleted(recordEventOf(record, refs?.categories ?? diaryView.categories));
      setPendingDelete(null);
      setDeleted({ id: record.id, version: ack.version, kind: record.type });
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
      trackUndoUsed({ kind: deleted.kind });
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
  // C16: records waiting for the person's choice, marked only in the `conflict` area (draft copy until E2).
  const choices = diaryView.phase === 'ready' && (conflictArea ?? isRedesignEnabled('conflict')) ? diaryView.pendingChoices : NO_CHOICES;
  const pendingChoiceIds = useMemo(() => new Set(choices.map((choice) => choice.recordId)), [choices]);
  const offline = Boolean(error) && diaryView.phase === 'ready';
  const chipRefs: References | null = refs ?? (diaryView.phase === 'ready' ? { wallets: diaryView.wallets, categories: diaryView.categories } : null);
  const lookups = useMemo(() => {
    const shownRefs: References | null = error ? (offline ? { wallets: diaryView.wallets, categories: diaryView.categories } : null) : lists ? refs : null;
    return shownRefs ? lookupsOf(shownRefs) : null;
  }, [error, offline, diaryView.wallets, diaryView.categories, lists, refs]);
  // Search follows typing a beat behind: the field answers at once, and the
  // list (the model, then the rows) is worked out again only for the
  // settled text, never for every keystroke while typing runs ahead.
  const searchQuery = useDeferredValue(query);
  const model: HistoryModel | null = useMemo(() => (lookups
    ? historyModel({
      month, today, tc, locale, lookups, filters: { type, walletId, categoryId }, query: searchQuery, drafts, pendingChoiceIds,
      records: error ? [] : lists?.items ?? [],
      complete: error ? true : !lists?.page.next_cursor,
    })
    : null), [lookups, month, today, tc, locale, type, walletId, categoryId, searchQuery, drafts, pendingChoiceIds, error, lists]);
  const searching = foldForSearch(searchQuery) !== '';

  // Filters alone are scoped on the server, so its totals for them are exact.
  let summary: Pick<SearchSummary, 'text' | 'draftText' | 'partial'> | null = model?.summary ?? null;
  if (summary && lists && !error && !searching) {
    const totals = lists.page.summary;
    const out = totals.expense_minor === '0' ? null : formatMinor(totals.expense_minor, locale);
    const income = totals.income_minor === '0' ? null : formatMinor(totals.income_minor, locale);
    summary = { text: say(tc, summaryLine(totals.count, out, income)), draftText: summary.draftText, partial: false };
  }
  const spokenSummary = summary ? [summary.text, summary.draftText].filter(Boolean).join('. ') : null;
  // Said once the summary settles, not once per keystroke (iOS; the web reads the polite live region).
  useSettledAnnouncement(spokenSummary);

  // Entries by record id: what Delete sends, and each row's category.
  const records = useMemo(() => new Map((lists?.items ?? []).map((record) => [record.id, record])), [lists]);
  const entries = useMemo(
    () => new Map<string, EntryLike>([...records.entries(), ...drafts.map((command) => [command.payload.id, command.payload] as const)]),
    [records, drafts],
  );
  /** Opens a record or Recently deleted: Back from it finds History as it was. */
  const openOwn = (href: Href) => {
    away.current = true;
    router.push(href);
  };
  const firstReview = openDrafts(drafts).find((command) => command.state === 'needs_review');
  const banner = bannerFor(diaryView, offline && error instanceof V1Error && error.outcome === 'network', firstReview ? () => openOwn(recordHref(firstReview.payload.id)) : null, tc);
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

  const canDelete = !busy && pendingDelete === null;
  const firstItems = useFirstItems(FIRST_ITEMS);

  // Row actions read the newest router, records, delete and `openOwn` through a
  // ref, so the one actions object lasts as long as the screen and never redraws a row.
  const latest = useRef({ router, records, remove, openOwn });
  latest.current = { router, records, remove, openOwn };
  const rowActions = useMemo<RowActions>(() => ({
    open: (id) => latest.current.openOwn(recordHref(id)),
    edit: (id) => latest.current.openOwn(recordHref(id, true)),
    copy: (id) => latest.current.router.push(copyHref(id)),
    remove: (id) => {
      const record = latest.current.records.get(id);
      if (record) void latest.current.remove(record);
    },
  }), []);

  /**
   * The list's items: the search, the controls, then each day's header and
   * its rows. Worked out again only when what they show changes (the model,
   * the cut day's totals, whether a delete may start), and each row is plain
   * values, so a row is redrawn only when its own words change.
   */
  const items = useMemo<ListItem[]>(() => {
    /** A day's confirmed money out and in; for the day a page may have cut, the server's whole-day totals (see `edge`). */
    const dayTotals = (group: DayGroup): { outMinor: Minor; inMinor: Minor } => {
      // The model marks the days whose records may go on in the next page (`partial`, from `pageEdgeDay`).
      if (!group.partial) return { outMinor: group.totals.confirmed.outMinor, inMinor: group.totals.confirmed.inMinor };
      if (!searching && group.day === model?.pageEdgeDay && edge && edge.day === group.day && edge.scope === filterKey) return { outMinor: edge.outMinor, inMinor: edge.inMinor };
      // Not known yet (or a day before the edge, where only a draft can show): no total rather than a short one.
      return { outMinor: '0', inMinor: '0' };
    };
    const row = (item: DayGroup['rows'][number]): RowItem => {
      const entry = entries.get(item.recordId);
      const category = entry && entry.type !== 'transfer' ? lookups?.categories.get(entry.category_id) : undefined;
      const look = lookOf(category, item.title);
      return {
        kind: 'row',
        key: item.key,
        recordId: item.recordId,
        title: item.title,
        detail: [item.detail, item.merchant, item.note].filter((part): part is string => Boolean(part)).join(' · '),
        type: item.type,
        amountMinor: item.amountMinor,
        state: item.state,
        builtinKey: look ? look.builtinKey : undefined,
        color: look ? look.color : null,
        canEdit: item.canEdit,
        deletable: item.state === 'confirmed' && records.has(item.recordId) && canDelete,
        choicePending: item.choicePending,
      };
    };
    const list: ListItem[] = [{ kind: 'search', key: 'search' }, { kind: 'controls', key: 'controls' }];
    for (const group of model?.groups ?? []) {
      list.push({ kind: 'day', key: `day:${group.day}`, day: group.day, ...dayTotals(group), pendingLines: group.pendingLines });
      for (const item of group.rows) list.push(row(item));
    }
    return list;
  }, [model, searching, edge, filterKey, entries, records, lookups, canDelete]);

  const stage = (
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
  );
  const searchBar = (
    <View style={{ backgroundColor: colors.background, paddingHorizontal: BUN_SPACE.md, paddingVertical: BUN_SPACE.xs }}>
      <SearchField label={tc('Search entries')} placeholder={tc('Category, merchant or note')} value={query} onChangeText={setQuery} />
    </View>
  );
  const controls = (
    <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>
      {banner ? <SyncBanner {...banner} /> : null}
      <View style={{ gap: BUN_SPACE.sm }}>
        <FilterChips label={tc('Type')} bleed={BUN_SPACE.md} options={typeOptions} value={type ?? ALL} onChange={(next) => changeType(next === ALL ? undefined : next)} />
        {walletOptions.length > 1 ? (
          <FilterChips label={tc('Wallet')} bleed={BUN_SPACE.md} options={walletOptions} value={walletId ?? ALL} onChange={(next) => setWalletId(next === ALL ? undefined : next)} />
        ) : null}
        {type !== 'transfer' && categoryOptions.length > 1 ? (
          <FilterChips label={tc('Category')} bleed={BUN_SPACE.md} options={categoryOptions} value={categoryId ?? ALL} onChange={(next) => setCategoryId(next === ALL ? undefined : next)} />
        ) : null}
        {/* Plan §6.1: deleted entries stay restorable for 30 days, under the filters. Every month and filter, loaded or not. */}
        <PillButton kind="secondary" label={tc('Recently deleted')} onPress={() => openOwn(RECENTLY_DELETED_ROUTE)} />
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
    </View>
  );
  const footer = (
    <View style={{ paddingHorizontal: BUN_SPACE.md, paddingTop: BUN_SPACE.md, gap: BUN_SPACE.md }}>
      {emptyMonth ? (
        <EmptyState
          // EmptyState leaves the art (and its space) out when the bun is off.
          art={<Bun pose="thinking" size="l" testID="history-empty-bun" />}
          title={tc('No entries in this month')}
          body={tc('Entries you add for this month show up here.')}
          action={{ label: tc('Add an entry'), onPress: () => router.push('/spend/add') }}
        />
      ) : null}
      {lists?.page.next_cursor && !error ? (
        <PillButton kind="secondary" label={tc('Load more')} busy={loadingMore} busyLabel={tc('Loading entries')} onPress={() => void loadMore()} />
      ) : null}
    </View>
  );
  const renderItem = ({ item }: ListRenderItemInfo<ListItem>) => {
    switch (item.kind) {
      case 'search': return searchBar;
      case 'controls': return controls;
      case 'day': return <HistoryDay day={item.day} today={today} outMinor={item.outMinor} inMinor={item.inMinor} pendingLines={item.pendingLines} />;
      case 'row': {
        const { kind: _kind, key: _key, ...shown } = item;
        return <HistoryRow {...shown} actions={rowActions} />;
      }
    }
  };

  return (
    <View testID="history-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        ListHeaderComponent={stage}
        ListFooterComponent={footer}
        stickyHeaderIndices={STICKY_SEARCH}
        initialNumToRender={firstItems}
        windowSize={WINDOW_SCREENS}
        contentContainerStyle={{ paddingBottom: BUN_SPACE.xl }}
        keyboardShouldPersistTaps="handled"
      />
      {deleted ? (
        <View style={{ paddingHorizontal: BUN_SPACE.md, paddingBottom: BUN_SPACE.md }}>
          <UndoBar message={tc('Entry deleted')} onUndo={() => void undo()} />
        </View>
      ) : null}
    </View>
  );
}
