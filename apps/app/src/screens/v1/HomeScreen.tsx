// v1 Home: total and per-wallet balances, this month's money in and out, and
// the latest entries, all from the v1 API. An empty account asks for an
// explicit first wallet; nothing is inferred or created by default.
import { validateTrackingStart } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { AmountInputError, formatMinor, parseAmountInput } from '@mobile/spend/v1/money';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { byId, monthOf, recordView, todayInBangkok, walletsTotal } from '@mobile/spend/v1/viewModels';
import { Text } from '@mobile/theme/AppText';
import { useTheme } from '@mobile/theme/ThemeProvider';
import { spacing } from '@mobile/theme/tokens';
import { Button, Card, Field, Frame, Loading, Notice, loadProblem, newId, saveProblem, useCommandKeys, useLoad, useMoneyLocale } from './parts';

const RECENT = 5;

export function HomeScreen({ now }: { now?: Date }) {
  const resources = useSpendV1();
  const router = useRouter();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const { colors } = useTheme();
  const today = todayInBangkok(now ?? new Date());
  const month = monthOf(today);

  const loaded = useLoad(async () => {
    const [categories, wallets, summary, recent] = await Promise.all([
      resources.ensureBuiltinCategories(),
      resources.wallets(),
      resources.summary(month),
      resources.history({ from: '1970-01-01', through: today, sort: 'date_desc' }, undefined, RECENT),
    ]);
    return { categories, wallets, summary, recent: recent.items };
  }, [resources, month, today]);

  if (loaded.state === 'loading') return <Frame title={tc('GoGoSpend')}><Loading label={tc('Loading your diary')} /></Frame>;
  if (loaded.state === 'error') {
    const problem = loadProblem(loaded.error, tc);
    return <Frame title={tc('GoGoSpend')}><Notice tone="warning" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: loaded.reload } : undefined} /></Frame>;
  }

  const { wallets, categories, summary, recent } = loaded.data;
  if (wallets.length === 0) return <Frame title={tc('GoGoSpend')}><FirstWallet today={today} onCreated={loaded.reload} /></Frame>;

  const lookups = { wallets: byId(wallets), categories: byId(categories) };
  const total = formatMinor(walletsTotal(wallets), locale);
  const moneyIn = formatMinor(summary.income_minor, locale);
  const moneyOut = formatMinor(summary.expense_minor, locale);
  return (
    <Frame title={tc('GoGoSpend')}>
      <Card>
        <Text style={{ color: colors.muted }}>{tc('Total balance')}</Text>
        <Text accessibilityLabel={`${tc('Total balance')} ${total}`} style={{ color: colors.ink, fontSize: 34, fontWeight: '700' }}>{total}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Text accessibilityLabel={`${tc('Money in')} ${moneyIn}`} style={{ color: colors.ink }}>{`${tc('Money in')} ${moneyIn}`}</Text>
          <Text accessibilityLabel={`${tc('Money out')} ${moneyOut}`} style={{ color: colors.ink }}>{`${tc('Money out')} ${moneyOut}`}</Text>
        </View>
      </Card>
      <Card>
        <Text accessibilityRole="header" style={{ color: colors.ink, fontWeight: '700' }}>{tc('Wallets')}</Text>
        {wallets.map((wallet) => {
          const balance = formatMinor(wallet.balance_minor, locale);
          return (
            <View key={wallet.id} accessibilityLabel={`${wallet.name} ${balance}`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: wallet.archived ? colors.muted : colors.ink }}>{wallet.name}</Text>
              <Text style={{ color: colors.ink }}>{balance}</Text>
            </View>
          );
        })}
      </Card>
      <Button label={tc('Add an entry')} onPress={() => router.push('/spend/add')} />
      <Card>
        <Text accessibilityRole="header" style={{ color: colors.ink, fontWeight: '700' }}>{tc('Latest entries')}</Text>
        {recent.length === 0 ? <Text style={{ color: colors.muted }}>{tc('No entries yet')}</Text> : null}
        {recent.map((record) => {
          const row = recordView(record, lookups, tc, locale);
          return (
            <View key={row.id} accessibilityLabel={`${row.title}, ${row.amountLabel}`} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
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
      openingMinor = parseAmountInput(opening, 'en');
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
      await resources.createWallet(input, keys.keyFor(input));
      keys.settle();
      onCreated();
    } catch (error) {
      const problem = saveProblem(error, tc);
      if (!problem.unconfirmed) keys.settle();
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
