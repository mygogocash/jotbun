// v1 Transactions: one month's entries (keyset pages, no hidden cap) with a
// type filter and the month's totals. Edits carry the version the user saw;
// a conflict shows the other device's values and offers reload or an
// explicit reapply, never a silent overwrite. Deleting hides the entry after
// the acknowledgement and can be undone. Each action keeps its own command
// key, and an unconfirmed action is frozen and resent as the same command.
import { HISTORY_MAX_LIMIT, isTransactionSnapshot } from '@gogospend/contracts';
import type { CategoryDto, HistoryFilter, HistoryPage, TransactionDto, TransactionType, WalletDto } from '@gogospend/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { formatMinor, minorToInputText, parseAmountInput } from '@mobile/spend/v1/money';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { byId, groupByDay, monthOf, monthRange, recordView, shiftMonth, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { Text } from '@mobile/theme/AppText';
import { useTheme } from '@mobile/theme/ThemeProvider';
import { spacing } from '@mobile/theme/tokens';
import { Button, Card, Chip, ChipRow, Field, Frame, Loading, Notice, loadProblem, saveProblem, useCommandKeys, useMoneyLocale } from './parts';

type Lists = { wallets: WalletDto[]; categories: CategoryDto[]; page: HistoryPage; items: TransactionDto[] };
type Editing = {
  record: TransactionDto;
  amount: string;
  note: string;
  error?: string;
  message?: string;
  /** The server's current record after a conflict (validated). */
  conflict?: TransactionDto;
  /** The save may have committed: fields frozen, only "Try again". */
  unconfirmed?: boolean;
};
type Changes = { amount_minor?: string; note?: string | null };

const PAGE = 50;

function useDateLabels() {
  const locale = useActiveLocale();
  const tag = locale === 'th' ? 'th-TH' : 'en-GB';
  const month = useCallback((value: string) => {
    const [year, number] = value.split('-').map(Number);
    return new Intl.DateTimeFormat(tag, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(year, number - 1, 1));
  }, [tag]);
  const day = useCallback((value: string) => {
    const [year, number, date] = value.split('-').map(Number);
    return new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(year, number - 1, date));
  }, [tag]);
  return { month, day };
}

export function TransactionsScreen({ now }: { now?: Date }) {
  const resources = useSpendV1();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const labels = useDateLabels();
  const { colors } = useTheme();
  const keys = useCommandKeys();
  const [month, setMonth] = useState(() => monthOf(todayInBangkok(now ?? new Date())));
  const [type, setType] = useState<TransactionType | undefined>(undefined);
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleted, setDeleted] = useState<{ id: string; version: number } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TransactionDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);
  const shown = useRef(0);

  const filter: HistoryFilter = { ...monthRange(month), ...(type ? { type } : {}), sort: 'date_desc' };
  const filterKey = JSON.stringify(filter);

  /** Loads the first page again, as many entries as were on screen (up to the page cap). */
  const load = useCallback(async (keepShown = false) => {
    const round = ++generation.current;
    setError(null);
    const limit = keepShown ? Math.min(HISTORY_MAX_LIMIT, Math.max(PAGE, shown.current)) : undefined;
    try {
      const [wallets, categories, page] = await Promise.all([
        resources.wallets(),
        resources.ensureBuiltinCategories(),
        limit === undefined ? resources.history(JSON.parse(filterKey) as HistoryFilter) : resources.history(JSON.parse(filterKey) as HistoryFilter, undefined, limit),
      ]);
      if (round !== generation.current) return;
      shown.current = page.items.length;
      setLists({ wallets, categories, page, items: page.items });
    } catch (problem) {
      if (round === generation.current) setError(problem);
    }
  }, [resources, filterKey]);

  useEffect(() => {
    setLists(null);
    setEditing(null);
    shown.current = 0;
    void load();
  }, [load]);

  async function loadMore() {
    if (!lists?.page.next_cursor || loadingMore) return;
    const round = generation.current;
    setLoadingMore(true);
    try {
      const page = await resources.history(filter, lists.page.next_cursor);
      if (round !== generation.current) return;
      shown.current = lists.items.length + page.items.length;
      setLists({ ...lists, page, items: [...lists.items, ...page.items] });
      setNotice(null);
    } catch (problem) {
      if (round === generation.current) setNotice(loadProblem(problem, tc).message);
    } finally {
      setLoadingMore(false);
    }
  }

  function changesFrom(current: Editing): Changes | null {
    const changes: Changes = {};
    let amount: string;
    try {
      amount = parseAmountInput(current.amount, locale);
    } catch {
      setEditing({ ...current, error: tc('Enter an amount like 65 or 65.50') });
      return null;
    }
    if (amount === '0') {
      setEditing({ ...current, error: tc('Enter an amount above zero') });
      return null;
    }
    if (amount !== current.record.amount_minor) changes.amount_minor = amount;
    const note = current.note.trim() === '' ? null : current.note.trim();
    if (note !== current.record.note) changes.note = note;
    return changes;
  }

  async function submitEdit(base: TransactionDto) {
    if (!editing) return;
    const changes = changesFrom(editing);
    if (!changes) return;
    if (Object.keys(changes).length === 0) {
      setEditing(null);
      return;
    }
    const slot = `edit:${base.id}`;
    const key = keys.keyFor(slot, { version: base.version, changes });
    setBusy(true);
    try {
      await resources.updateTransaction(base.id, base.version, changes, key);
      keys.settle(slot);
      setEditing(null);
    } catch (problem) {
      const outcome = problem instanceof V1Error ? problem.outcome : undefined;
      const result = saveProblem(problem, tc);
      if (!result.unconfirmed) keys.settle(slot);
      if (outcome === 'conflict') {
        const current = problem instanceof V1Error ? problem.current : undefined;
        if (isTransactionSnapshot(current) && current.id === base.id && !current.deleted_at) {
          const amount = formatMinor(current.amount_minor, locale);
          setEditing({
            ...editing, conflict: current, unconfirmed: false,
            message: current.note
              ? tc('This entry changed on another device. It now reads {amount} ({note}).', { amount, note: current.note })
              : tc('This entry changed on another device. It now reads {amount}.', { amount }),
          });
        } else {
          setEditing(null);
          setNotice(tc('This entry changed on another device.'));
          void load(true);
        }
      } else if (outcome === 'deleted' || outcome === 'not_found') {
        setEditing(null);
        setNotice(tc('This entry was deleted on another device.'));
        void load(true);
      } else {
        setEditing({ ...editing, unconfirmed: result.unconfirmed, message: result.message, error: result.fields.amount_minor });
      }
      return;
    } finally {
      setBusy(false);
    }
    // Reading the result is a separate load: its failure is a load problem,
    // never an unconfirmed save.
    void load(true);
  }

  async function remove(record: TransactionDto) {
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
      setBusy(false);
    }
    void load(true);
  }

  async function undo() {
    if (!deleted) return;
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
      setBusy(false);
    }
    void load(true);
  }

  const header = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Button kind="secondary" label="‹" accessibilityLabel={tc('Previous month')} onPress={() => setMonth(shiftMonth(month, -1))} />
        <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 20, fontWeight: '700' }}>{labels.month(month)}</Text>
        <Button kind="secondary" label="›" accessibilityLabel={tc('Next month')} onPress={() => setMonth(shiftMonth(month, 1))} />
      </View>
      <ChipRow>
        <Chip label={tc('All')} selected={type === undefined} onPress={() => setType(undefined)} />
        <Chip label={tc('Expense')} selected={type === 'expense'} onPress={() => setType('expense')} />
        <Chip label={tc('Income')} selected={type === 'income'} onPress={() => setType('income')} />
        <Chip label={tc('Transfer')} selected={type === 'transfer'} onPress={() => setType('transfer')} />
      </ChipRow>
    </>
  );

  if (error) {
    const problem = loadProblem(error, tc);
    return <Frame title={tc('All entries')}>{header}<Notice tone="warning" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: () => void load(true) } : undefined} /></Frame>;
  }
  if (!lists) return <Frame title={tc('All entries')}>{header}<Loading label={tc('Loading entries')} /></Frame>;

  const lookups = { wallets: byId(lists.wallets), categories: byId(lists.categories) };
  const rows = lists.items.map((record) => ({ record, view: recordView(record, lookups, tc, locale) }));
  const moneyIn = formatMinor(lists.page.summary.income_minor, locale);
  const moneyOut = formatMinor(lists.page.summary.expense_minor, locale);
  return (
    <Frame title={tc('All entries')}>
      {header}
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Text accessibilityLabel={`${tc('Money in')} ${moneyIn}`} style={{ color: colors.ink }}>{`${tc('Money in')} ${moneyIn}`}</Text>
        <Text accessibilityLabel={`${tc('Money out')} ${moneyOut}`} style={{ color: colors.ink }}>{`${tc('Money out')} ${moneyOut}`}</Text>
      </View>
      {notice ? (
        <Notice tone="warning" message={notice} action={pendingDelete ? { label: tc('Try again'), onPress: () => void remove(pendingDelete) } : undefined} />
      ) : null}
      {deleted ? <Notice message={tc('Entry deleted')} action={{ label: tc('Undo'), onPress: () => void undo() }} /> : null}
      {lists.page.refresh_suggested ? <Notice message={tc('Entries changed since you opened this list.')} action={{ label: tc('Refresh'), onPress: () => void load(true) }} /> : null}
      {rows.length === 0 ? <Text style={{ color: colors.muted }}>{tc('No entries in this month')}</Text> : null}
      {groupByDay(rows.map((row) => ({ ...row, occurredOn: row.view.occurredOn }))).map((group) => (
        <Card key={group.day}>
          <Text accessibilityRole="header" style={{ color: colors.muted }}>{labels.day(group.day)}</Text>
          {group.rows.map(({ record, view }) => {
            const label = `${view.title}, ${view.amountLabel}`;
            const editingThis = editing?.record.id === record.id;
            return (
              <View key={record.id} style={{ gap: spacing.xs }}>
                <View accessible accessibilityLabel={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: colors.ink }}>{view.title}</Text>
                    <Text style={{ color: colors.muted }}>{view.note ? `${view.detail} · ${view.note}` : view.detail}</Text>
                  </View>
                  <Text style={{ color: colors.ink }}>{view.amountText}</Text>
                </View>
                {editingThis && editing ? (
                  <View style={{ gap: spacing.xs }}>
                    <Field label={tc('Edit amount')} value={editing.amount} editable={!editing.unconfirmed}
                      onChangeText={(amount) => setEditing({ ...editing, amount, error: undefined })} error={editing.error} keyboardType="decimal-pad" />
                    <Field label={tc('Edit note')} value={editing.note} editable={!editing.unconfirmed} onChangeText={(text) => setEditing({ ...editing, note: text })} multiline />
                    {editing.message ? <Notice tone="warning" message={editing.message} /> : null}
                    {editing.unconfirmed ? (
                      <Button label={tc('Try again')} disabled={busy} onPress={() => void submitEdit(editing.conflict ?? record)} />
                    ) : editing.conflict ? (
                      <ChipRow>
                        <Button kind="secondary" label={tc('Reload')} onPress={() => { setEditing(null); void load(true); }} />
                        <Button label={tc('Apply my change')} disabled={busy} onPress={() => void submitEdit(editing.conflict as TransactionDto)} />
                      </ChipRow>
                    ) : (
                      <ChipRow>
                        <Button kind="secondary" label={tc('Cancel')} onPress={() => setEditing(null)} />
                        <Button label={tc('Save changes')} disabled={busy} onPress={() => void submitEdit(record)} />
                      </ChipRow>
                    )}
                  </View>
                ) : (
                  <ChipRow>
                    <Button kind="secondary" label={tc('Edit')} accessibilityLabel={`${tc('Edit')} ${label}`} disabled={busy || editing?.unconfirmed === true}
                      onPress={() => setEditing({ record, amount: minorToInputText(record.amount_minor), note: record.note ?? '' })} />
                    <Button kind="secondary" label={tc('Delete')} accessibilityLabel={`${tc('Delete')} ${label}`} disabled={busy || pendingDelete !== null} onPress={() => void remove(record)} />
                  </ChipRow>
                )}
              </View>
            );
          })}
        </Card>
      ))}
      {lists.page.next_cursor ? <Button kind="secondary" label={loadingMore ? tc('Loading entries') : tc('Load more')} disabled={loadingMore} onPress={() => void loadMore()} /> : null}
    </Frame>
  );
}
