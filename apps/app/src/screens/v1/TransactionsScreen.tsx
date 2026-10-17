// v1 Transactions: one month's entries (keyset pages, no hidden cap) with a
// type filter and the month's totals. Edits carry the version the user saw;
// a conflict offers reload or an explicit reapply, never a silent overwrite.
// Deleting hides the entry after the acknowledgement and can be undone.
import type { CategoryDto, HistoryFilter, HistoryPage, TransactionDto, TransactionType, WalletDto } from '@gogospend/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { AmountInputError, formatMinor, minorToInputText, parseAmountInput } from '@mobile/spend/v1/money';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { byId, groupByDay, monthOf, monthRange, recordView, shiftMonth, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { Text } from '@mobile/theme/AppText';
import { useTheme } from '@mobile/theme/ThemeProvider';
import { spacing } from '@mobile/theme/tokens';
import { Button, Card, Chip, ChipRow, Field, Frame, Loading, Notice, loadProblem, saveProblem, useCommandKeys, useMoneyLocale } from './parts';

type Lists = { wallets: WalletDto[]; categories: CategoryDto[]; page: HistoryPage; items: TransactionDto[] };
type Editing = { record: TransactionDto; amount: string; note: string; error?: string; conflict?: TransactionDto; message?: string };

function useMonthLabel() {
  const locale = useActiveLocale();
  return useCallback((month: string) => {
    const [year, number] = month.split('-').map(Number);
    return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(year, number - 1, 1));
  }, [locale]);
}

export function TransactionsScreen({ now }: { now?: Date }) {
  const resources = useSpendV1();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const monthLabel = useMonthLabel();
  const { colors } = useTheme();
  const keys = useCommandKeys();
  const [month, setMonth] = useState(() => monthOf(todayInBangkok(now ?? new Date())));
  const [type, setType] = useState<TransactionType | undefined>(undefined);
  const [lists, setLists] = useState<Lists | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleted, setDeleted] = useState<{ id: string; version: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  const filter: HistoryFilter = { ...monthRange(month), ...(type ? { type } : {}), sort: 'date_desc' };
  const filterKey = JSON.stringify(filter);

  const load = useCallback(async () => {
    const round = ++generation.current;
    setError(null);
    try {
      const [wallets, categories, page] = await Promise.all([resources.wallets(), resources.ensureBuiltinCategories(), resources.history(JSON.parse(filterKey) as HistoryFilter)]);
      if (round === generation.current) setLists({ wallets, categories, page, items: page.items });
    } catch (problem) {
      if (round === generation.current) setError(problem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources, filterKey]);

  useEffect(() => {
    setLists(null);
    setEditing(null);
    void load();
  }, [load]);

  async function loadMore() {
    if (!lists?.page.next_cursor) return;
    const round = generation.current;
    try {
      const page = await resources.history(filter, lists.page.next_cursor);
      if (round === generation.current) setLists({ ...lists, page, items: [...lists.items, ...page.items] });
    } catch (problem) {
      setNotice(loadProblem(problem, tc).message);
    }
  }

  async function submitEdit(base: TransactionDto) {
    if (!editing) return;
    const changes: { amount_minor?: string; note?: string | null } = {};
    try {
      const amount = parseAmountInput(editing.amount, locale);
      if (amount === '0') throw new AmountInputError('invalid');
      if (amount !== editing.record.amount_minor) changes.amount_minor = amount;
    } catch {
      setEditing({ ...editing, error: tc('Enter an amount like 65 or 65.50') });
      return;
    }
    const note = editing.note.trim() === '' ? null : editing.note.trim();
    if (note !== editing.record.note) changes.note = note;
    if (Object.keys(changes).length === 0) {
      setEditing(null);
      return;
    }
    const payload = { id: base.id, version: base.version, changes };
    setBusy(true);
    try {
      await resources.updateTransaction(base.id, base.version, changes, keys.keyFor(payload));
      keys.settle();
      setEditing(null);
      await resources.transaction(base.id);
      await load();
    } catch (problem) {
      const unconfirmed = saveProblem(problem, tc).unconfirmed;
      if (!unconfirmed) keys.settle();
      if (problem instanceof V1Error && problem.outcome === 'conflict') {
        setEditing({ ...editing, conflict: problem.current as TransactionDto, message: tc('This entry changed on another device.') });
      } else if (problem instanceof V1Error && problem.outcome === 'deleted') {
        setEditing(null);
        setNotice(tc('This entry was deleted on another device.'));
        await load();
      } else {
        setEditing({ ...editing, message: saveProblem(problem, tc).message });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(record: TransactionDto) {
    setBusy(true);
    try {
      const ack = await resources.deleteTransaction(record.id, record.version, keys.keyFor({ id: record.id, version: record.version, delete: true }));
      keys.settle();
      setDeleted({ id: record.id, version: ack.version });
      setNotice(null);
      await load();
    } catch (problem) {
      if (!saveProblem(problem, tc).unconfirmed) keys.settle();
      setNotice(problem instanceof V1Error && problem.outcome === 'conflict' ? tc('This entry changed on another device.') : saveProblem(problem, tc).message);
      if (problem instanceof V1Error && problem.outcome === 'conflict') await load();
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!deleted) return;
    setBusy(true);
    try {
      await resources.restoreTransaction(deleted.id, deleted.version, keys.keyFor({ ...deleted, restore: true }));
      keys.settle();
      await resources.transaction(deleted.id);
      setDeleted(null);
      await load();
    } catch (problem) {
      if (!saveProblem(problem, tc).unconfirmed) keys.settle();
      setNotice(saveProblem(problem, tc).message);
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <Button kind="secondary" label="‹" accessibilityLabel={tc('Previous month')} onPress={() => setMonth(shiftMonth(month, -1))} />
        <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 20, fontWeight: '700' }}>{monthLabel(month)}</Text>
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
    return <Frame title={tc('All entries')}>{header}<Notice tone="warning" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: () => void load() } : undefined} /></Frame>;
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
      {notice ? <Notice tone="warning" message={notice} /> : null}
      {deleted ? <Notice message={tc('Entry deleted')} action={{ label: tc('Undo'), onPress: () => void undo() }} /> : null}
      {lists.page.refresh_suggested ? <Notice message={tc('Entries changed since you opened this list.')} action={{ label: tc('Refresh'), onPress: () => void load() }} /> : null}
      {rows.length === 0 ? <Text style={{ color: colors.muted }}>{tc('No entries in this month')}</Text> : null}
      {groupByDay(rows.map((row) => ({ ...row, occurredOn: row.view.occurredOn }))).map((group) => (
        <Card key={group.day}>
          <Text accessibilityRole="header" style={{ color: colors.muted }}>{group.day}</Text>
          {group.rows.map(({ record, view }) => {
            const label = `${view.title}, ${view.amountLabel}`;
            const editingThis = editing?.record.id === record.id;
            return (
              <View key={record.id} style={{ gap: spacing.xs }}>
                <View accessibilityLabel={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: colors.ink }}>{view.title}</Text>
                    <Text style={{ color: colors.muted }}>{view.note ? `${view.detail} · ${view.note}` : view.detail}</Text>
                  </View>
                  <Text style={{ color: colors.ink }}>{view.amountText}</Text>
                </View>
                {editingThis && editing ? (
                  <View style={{ gap: spacing.xs }}>
                    <Field label={tc('Edit amount')} value={editing.amount} onChangeText={(amount) => setEditing({ ...editing, amount, error: undefined })} error={editing.error} keyboardType="decimal-pad" />
                    <Field label={tc('Edit note')} value={editing.note} onChangeText={(text) => setEditing({ ...editing, note: text })} multiline />
                    {editing.message ? <Notice tone="warning" message={editing.message} /> : null}
                    {editing.conflict ? (
                      <ChipRow>
                        <Button kind="secondary" label={tc('Reload')} onPress={() => { setEditing(null); void load(); }} />
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
                    <Button kind="secondary" label={tc('Edit')} accessibilityLabel={`${tc('Edit')} ${label}`} disabled={busy}
                      onPress={() => setEditing({ record, amount: minorToInputText(record.amount_minor), note: record.note ?? '' })} />
                    <Button kind="secondary" label={tc('Delete')} accessibilityLabel={`${tc('Delete')} ${label}`} disabled={busy} onPress={() => void remove(record)} />
                  </ChipRow>
                )}
              </View>
            );
          })}
        </Card>
      ))}
      {lists.page.next_cursor ? <Button kind="secondary" label={tc('Load more')} onPress={() => void loadMore()} /> : null}
    </Frame>
  );
}
