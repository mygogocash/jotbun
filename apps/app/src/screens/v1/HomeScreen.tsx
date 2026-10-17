// v1 Home: total and per-wallet balances, this month's money in and out, and
// the latest entries, all from the v1 API. An empty account asks for an
// explicit first wallet; nothing is inferred or created by default. With a
// device diary, money waiting on the device is shown apart from confirmed
// money - entries still being checked with the server apart again, since
// they may already be counted - and confirmed money reloads in place when
// entries resolve. Offline, Home still shows the diary's status, waiting
// money and drafts, and Add works from the device.
import type { CategoryDto, Totals } from '@gogospend/contracts';
import { validateTrackingStart } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { AmountInputError, formatMinor, parseAmountInput } from '@mobile/spend/v1/money';
import { deriveDisplayedTotals } from '@mobile/spend/v1/pendingTotals';
import type { DiaryView } from '@mobile/spend/v1/spendDiary';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import type { OutboxCommand, OutboxState } from '@mobile/storage/types';
import { SyncStatus } from '@mobile/sync/SyncStatus';
import { byId, categoryName, monthOf, recordView, todayInBangkok, walletsTotal } from '@mobile/spend/v1/viewModels';
import { Text } from '@mobile/theme/AppText';
import { useTheme } from '@mobile/theme/ThemeProvider';
import { spacing } from '@mobile/theme/tokens';
import { Button, Card, Field, Frame, Loading, Notice, isOwnCreate, loadProblem, newId, saveProblem, useCommandKeys, useLoad, useMoneyLocale } from './parts';
import type { Translate } from './parts';

const RECENT = 5;
const ZERO: Totals = { income_minor: '0', expense_minor: '0', balance_minor: '0', by_wallet: {} };
// Queued on the device and not yet at the server.
const WAITING: readonly OutboxState[] = ['unsent', 'sending', 'paused_upgrade'];
// Possibly committed already: the server is being asked.
const CHECKING: readonly OutboxState[] = ['uncertain'];

/** Reloads confirmed money in place whenever a command it was waiting on resolves. */
function useRefreshOnResolve(outbox: readonly OutboxCommand[], refresh: () => void): void {
  const open = useRef(new Set<string>());
  useEffect(() => {
    const now = new Set(outbox.filter((command) => command.state !== 'acknowledged').map((command) => command.commandId));
    const resolved = [...open.current].some((id) => !now.has(id));
    open.current = now;
    if (resolved) refresh();
  }, [outbox, refresh]);
}

/** "Waiting to sync" and "Checking with Jotbun" money for this month, never mixed into confirmed money. */
function WaitingMoney({ outbox, month }: { outbox: readonly OutboxCommand[]; month: string }) {
  const tc = useCopy();
  const locale = useMoneyLocale();
  const { colors } = useTheme();
  const sum = (states: readonly OutboxState[]) =>
    deriveDisplayedTotals(ZERO, outbox.filter((command) => states.includes(command.state) && monthOf(command.payload.occurred_on) === month).map((command) => command.payload)).pendingAdjustment;
  const waiting = sum(WAITING);
  const checking = sum(CHECKING);
  const lines = [
    waiting.income_minor === '0' ? null : tc('Waiting to sync: money in {amount}', { amount: formatMinor(waiting.income_minor, locale) }),
    waiting.expense_minor === '0' ? null : tc('Waiting to sync: money out {amount}', { amount: formatMinor(waiting.expense_minor, locale) }),
    checking.income_minor === '0' ? null : tc('Checking with Jotbun: money in {amount}', { amount: formatMinor(checking.income_minor, locale) }),
    checking.expense_minor === '0' ? null : tc('Checking with Jotbun: money out {amount}', { amount: formatMinor(checking.expense_minor, locale) }),
  ].filter((line): line is string => line !== null);
  return <>{lines.map((line) => <Text key={line} accessibilityLabel={line} style={{ color: colors.muted }}>{line}</Text>)}</>;
}

function draftTitle(entry: OutboxCommand['payload'], categories: ReadonlyMap<string, CategoryDto>, tc: Translate): string {
  if (entry.type === 'transfer') return tc('Transfer');
  const category = categories.get(entry.category_id);
  return category ? categoryName(category, tc) : tc(entry.type === 'income' ? 'Income' : 'Expense');
}

/**
 * Drafts on this device that the server has not confirmed. An unsent draft
 * can be undone here; one that needs review (the server never committed it)
 * can be discarded; one being checked or sent waits for its outcome.
 */
function DeviceDrafts({ view, categories }: { view: DiaryView; categories: ReadonlyMap<string, CategoryDto> }) {
  const diary = useSpendDiary();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const { colors } = useTheme();
  const drafts = view.outbox.filter((command) => command.state !== 'acknowledged');
  if (!diary || view.phase !== 'ready' || drafts.length === 0) return null;
  const statusText: Record<Exclude<OutboxState, 'acknowledged'>, string> = {
    unsent: tc('Waiting to sync'),
    sending: tc('Checking with Jotbun'),
    uncertain: tc('Checking with Jotbun'),
    needs_review: tc('Needs your review'),
    paused_upgrade: tc('Update Jotbun to send'),
  };
  return (
    <Card>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontWeight: '700' }}>{tc('Saved on this device')}</Text>
      {drafts.map((command) => {
        const entry = `${draftTitle(command.payload, categories, tc)} ${formatMinor(command.payload.amount_minor, locale)}`;
        const undoable = command.state === 'unsent' && command.firstTransmissionAt === null;
        return (
          <View key={command.commandId} style={{ gap: spacing.xs }}>
            <Text style={{ color: colors.ink }}>{entry}</Text>
            <Text style={{ color: colors.muted }}>{statusText[command.state as Exclude<OutboxState, 'acknowledged'>]}</Text>
            {undoable ? <Button kind="secondary" label={tc('Remove')} accessibilityLabel={tc('Remove {entry}', { entry })} onPress={() => void diary.removeDraft(command.commandId).catch(() => undefined)} /> : null}
            {command.state === 'needs_review' ? <Button kind="secondary" label={tc('Discard')} accessibilityLabel={tc('Discard {entry}', { entry })} onPress={() => void diary.discardDraft(command.commandId).catch(() => undefined)} /> : null}
          </View>
        );
      })}
    </Card>
  );
}

export function HomeScreen({ now }: { now?: Date }) {
  const resources = useSpendV1();
  const router = useRouter();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const { colors } = useTheme();
  const today = todayInBangkok(now ?? new Date());
  const month = monthOf(today);
  const diary = useSpendDiary();
  const diaryView = useDiaryView();

  const loaded = useLoad(async () => {
    const [categories, wallets, summary, recent] = await Promise.all([
      resources.ensureBuiltinCategories(),
      resources.wallets(),
      resources.summary(month),
      resources.history({ from: '1970-01-01', through: today, sort: 'date_desc' }, undefined, RECENT),
    ]);
    return { categories, wallets, summary, recent: recent.items };
  }, [resources, month, today]);
  useRefreshOnResolve(diaryView.outbox, loaded.refresh);

  const banner = diary ? <SyncStatus view={diaryView} onRetry={() => void diary.retry()} onDiscard={() => void diary.discardDiary()} /> : null;
  if (loaded.state === 'loading') return <Frame title={tc('Jotbun')}><Loading label={tc('Loading your diary')} /></Frame>;
  if (loaded.state === 'error') {
    const problem = loadProblem(loaded.error, tc);
    const notice = <Notice tone="warning" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: loaded.reload } : undefined} />;
    if (!diary) return <Frame title={tc('Jotbun')}>{notice}</Frame>;
    // Offline: what the device holds is still here, and new entries are saved on it.
    return (
      <Frame title={tc('Jotbun')}>
        {banner}
        {notice}
        <WaitingMoney outbox={diaryView.outbox} month={month} />
        {diaryView.phase === 'ready' && diaryView.wallets.length > 0 ? <Button label={tc('Add an entry')} onPress={() => router.push('/spend/add')} /> : null}
        <DeviceDrafts view={diaryView} categories={byId(diaryView.categories)} />
      </Frame>
    );
  }

  const { wallets, categories, summary, recent } = loaded.data;
  if (wallets.length === 0) {
    return (
      <Frame title={tc('Jotbun')}>
        <FirstWallet
          today={today}
          onCreated={() => {
            loaded.reload();
            // Bring the new wallet (and the built-in categories) to the device, so entries can be saved there.
            void diary?.retry();
          }}
        />
      </Frame>
    );
  }

  const lookups = { wallets: byId(wallets), categories: byId(categories) };
  const total = formatMinor(walletsTotal(wallets), locale);
  const moneyIn = formatMinor(summary.income_minor, locale);
  const moneyOut = formatMinor(summary.expense_minor, locale);
  return (
    <Frame title={tc('Jotbun')}>
      {banner}
      <Card>
        <Text style={{ color: colors.muted }}>{tc('Total balance')}</Text>
        <Text accessibilityLabel={`${tc('Total balance')} ${total}`} style={{ color: colors.ink, fontSize: 34, fontWeight: '700' }}>{total}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Text accessibilityLabel={`${tc('Money in')} ${moneyIn}`} style={{ color: colors.ink }}>{`${tc('Money in')} ${moneyIn}`}</Text>
          <Text accessibilityLabel={`${tc('Money out')} ${moneyOut}`} style={{ color: colors.ink }}>{`${tc('Money out')} ${moneyOut}`}</Text>
        </View>
        <WaitingMoney outbox={diaryView.outbox} month={month} />
      </Card>
      <Card>
        <Text accessibilityRole="header" style={{ color: colors.ink, fontWeight: '700' }}>{tc('Wallets')}</Text>
        {wallets.map((wallet) => {
          const balance = formatMinor(wallet.balance_minor, locale);
          return (
            <View key={wallet.id} accessible accessibilityLabel={`${wallet.name} ${balance}`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: wallet.archived ? colors.muted : colors.ink }}>{wallet.name}</Text>
              <Text style={{ color: colors.ink }}>{balance}</Text>
            </View>
          );
        })}
      </Card>
      <Button label={tc('Add an entry')} onPress={() => router.push('/spend/add')} />
      <DeviceDrafts view={diaryView} categories={lookups.categories} />
      <Card>
        <Text accessibilityRole="header" style={{ color: colors.ink, fontWeight: '700' }}>{tc('Latest entries')}</Text>
        {recent.length === 0 ? <Text style={{ color: colors.muted }}>{tc('No entries yet')}</Text> : null}
        {recent.map((record) => {
          const row = recordView(record, lookups, tc, locale);
          return (
            <View key={row.id} accessible accessibilityLabel={`${row.title}, ${row.amountLabel}`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: colors.ink }}>{row.title}</Text>
                <Text style={{ color: colors.muted }}>{`${row.occurredOn} · ${row.detail}`}</Text>
              </View>
              <Text style={{ color: colors.ink }}>{row.amountText}</Text>
            </View>
          );
        })}
        <Button kind="secondary" label={tc('See all entries')} onPress={() => router.push('/spend/all')} />
      </Card>
    </Frame>
  );
}

/** An explicit first wallet: name, opening balance (zero is fine, never income) and tracking start. */
function FirstWallet({ today, onCreated }: { today: string; onCreated: () => void }) {
  const resources = useSpendV1();
  const tc = useCopy();
  const { colors } = useTheme();
  const keys = useCommandKeys();
  const locale = useMoneyLocale();
  const [walletId] = useState(newId);
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('0');
  const [start, setStart] = useState(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [frozen, setFrozen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create() {
    const next: Record<string, string> = {};
    const trimmed = name.trim();
    if (!trimmed) next.name = tc('Enter a wallet name');
    let openingMinor = '0';
    try {
      openingMinor = parseAmountInput(opening, locale);
    } catch (error) {
      next.opening = error instanceof AmountInputError && error.problem === 'too_precise' ? tc('Use at most two decimal places') : tc('Enter an amount like 65 or 65.50');
    }
    try {
      validateTrackingStart(start, today);
    } catch {
      next.start = tc('Enter a real date as YYYY-MM-DD');
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    const input = { id: walletId, name: trimmed, opening_minor: openingMinor, tracking_start: start };
    setBusy(true);
    try {
      await resources.createWallet(input, keys.keyFor('create', input));
      keys.settle('create');
      onCreated();
    } catch (error) {
      if (isOwnCreate(error, walletId)) {
        keys.settle('create');
        onCreated();
        return;
      }
      const problem = saveProblem(error, tc);
      if (!problem.unconfirmed) keys.settle('create');
      setFrozen(problem.unconfirmed);
      setMessage(problem.message);
      setErrors({ ...(problem.fields.name ? { name: problem.fields.name } : {}), ...(problem.fields.tracking_start ? { start: problem.fields.tracking_start } : {}) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontSize: 22, fontWeight: '700' }}>{tc('Add your first wallet')}</Text>
      <Text style={{ color: colors.muted }}>{tc('A wallet is where money sits, like cash or a bank account. Its opening balance is not income.')}</Text>
      <Field label={tc('Wallet name')} value={name} onChangeText={setName} error={errors.name} editable={!frozen} />
      <Field label={tc('Opening balance')} value={opening} onChangeText={setOpening} error={errors.opening} editable={!frozen} keyboardType="decimal-pad" />
      <Field label={tc('Tracking starts')} value={start} onChangeText={setStart} error={errors.start} editable={!frozen} />
      {message ? <Notice tone="warning" message={message} /> : null}
      <Button label={frozen ? tc('Try again') : tc('Create wallet')} onPress={create} disabled={busy} />
    </Card>
  );
}
