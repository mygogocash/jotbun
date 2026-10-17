// v1 Add: an expense, income or transfer between the user's own wallets.
// With a device diary (S2/S3) the entry is saved on the device first - only
// once that local commit succeeds is it shown as saved - and the outbox sends
// it; the form then lists the wallets and categories synced to the device, so
// it works offline. Without one (web, or before the diary opens) it is saved
// online as one immutable command, shown as saved only after the server's
// acknowledgement; an unconfirmed online save keeps the entry frozen and
// resends the same command online, even if the diary opens meanwhile.
import { ContractValidationError, normalizeMerchant, normalizeNote, validateOccurredOn } from '@gogospend/contracts';
import type { CategoryDto, WalletSnapshot } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { AmountInputError, parseAmountInput } from '@mobile/spend/v1/money';
import type { CreateEntryInput, CreateTransferInput } from '@mobile/spend/v1/resources';
import { useDiaryView, useSpendDiary } from '@mobile/spend/v1/SpendDiaryContext';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { DiaryLocked, DraftReferenceUnavailable } from '@mobile/storage/types';
import { categoryName, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { Text } from '@mobile/theme/AppText';
import { useTheme } from '@mobile/theme/ThemeProvider';
import { Button, Card, Chip, ChipRow, Field, Frame, Loading, Notice, isOwnCreate, loadProblem, newId, saveProblem, useCommandKeys, useLoad, useMoneyLocale } from './parts';
import type { Translate } from './parts';

type EntryType = 'expense' | 'income' | 'transfer';
type Status = 'editing' | 'saving' | 'unconfirmed' | 'blocked';
type References = { wallets: WalletSnapshot[]; categories: CategoryDto[] };

function localSaveProblem(error: unknown, tc: Translate): string {
  if (error instanceof DiaryLocked) return tc("This device's diary is locked. Nothing was saved.");
  if (error instanceof DraftReferenceUnavailable) return tc("This wallet or category isn't on this device yet. Connect and try again. Nothing was saved.");
  return tc("Couldn't save this entry on the device. Nothing was saved.");
}

function amountProblem(error: unknown, tc: Translate): string {
  const problem = error instanceof AmountInputError ? error.problem : 'invalid';
  if (problem === 'empty') return tc('Enter an amount');
  if (problem === 'too_precise') return tc('Use at most two decimal places');
  if (problem === 'too_large') return tc('Amounts go up to ฿999,999,999.99');
  return tc('Enter an amount like 65 or 65.50');
}

export function AddTransactionScreen({ now }: { now?: Date }) {
  const resources = useSpendV1();
  const tc = useCopy();
  const diaryView = useDiaryView();
  const loaded = useLoad(async (): Promise<References> => {
    const [wallets, categories] = await Promise.all([resources.wallets(), resources.ensureBuiltinCategories()]);
    return { wallets: wallets.filter((wallet) => !wallet.archived), categories: categories.filter((category) => !category.archived) };
  }, [resources]);
  // Synced to the device: usable offline, and exactly what a device save accepts.
  const onDevice = diaryView.phase === 'ready' && diaryView.wallets.length > 0 && diaryView.categories.length > 0 ? { wallets: diaryView.wallets, categories: diaryView.categories } : null;
  // The form keeps the lists it first showed for its whole life.
  const [shown, setShown] = useState<References | null>(null);
  const references = shown ?? onDevice ?? (loaded.state === 'ready' ? loaded.data : null);
  useEffect(() => {
    if (!shown && references) setShown(references);
  }, [shown, references]);

  if (!references && loaded.state === 'loading') return <Frame title={tc('Add an entry')}><Loading label={tc('Loading your wallets')} /></Frame>;
  if (!references && loaded.state === 'error') {
    const problem = loadProblem(loaded.error, tc);
    return <Frame title={tc('Add an entry')}><Notice tone="warning" message={problem.message} action={problem.retry ? { label: tc('Try again'), onPress: loaded.reload } : undefined} /></Frame>;
  }
  if (!references || references.wallets.length === 0) return <Frame title={tc('Add an entry')}><Notice message={tc('Add a wallet on the home screen first.')} /></Frame>;
  return <EntryForm wallets={references.wallets} categories={references.categories} today={todayInBangkok(now ?? new Date())} />;
}

function EntryForm({ wallets, categories, today }: { wallets: WalletSnapshot[]; categories: CategoryDto[]; today: string }) {
  const resources = useSpendV1();
  const router = useRouter();
  const tc = useCopy();
  const locale = useMoneyLocale();
  const { colors } = useTheme();
  const keys = useCommandKeys();
  const diary = useSpendDiary();
  const diaryView = useDiaryView();
  // One record id per draft, so a resent command always names the same record;
  // one device command id per form, so a repeated device save is one draft.
  const [recordId] = useState(newId);
  const [commandId] = useState(newId);
  const [type, setType] = useState<EntryType>('expense');
  const [amount, setAmount] = useState('');
  const [walletId, setWalletId] = useState(wallets[0].id);
  const [categoryByType, setCategoryByType] = useState<Record<'expense' | 'income', string | undefined>>({
    expense: categories.find((category) => category.type === 'expense')?.id,
    income: categories.find((category) => category.type === 'income')?.id,
  });
  const [fromId, setFromId] = useState(wallets[0].id);
  const [toId, setToId] = useState((wallets[1] ?? wallets[0]).id);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [merchant, setMerchant] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('editing');
  const locked = status === 'unconfirmed' || status === 'saving';

  function build(): CreateEntryInput | CreateTransferInput | null {
    const next: Record<string, string> = {};
    let amountMinor = '';
    try {
      amountMinor = parseAmountInput(amount, locale);
      if (amountMinor === '0') next.amount_minor = tc('Enter an amount above zero');
    } catch (error) {
      next.amount_minor = amountProblem(error, tc);
    }
    try {
      validateOccurredOn(date, '1970-01-01', today);
    } catch (error) {
      next.occurred_on = error instanceof ContractValidationError && error.code === 'DATE_IN_FUTURE' ? tc('This date is in the future.') : tc('Enter a real date as YYYY-MM-DD');
    }
    let cleanNote: string | null = null;
    let cleanMerchant: string | null = null;
    try {
      cleanNote = normalizeNote(note);
    } catch {
      next.note = tc('Notes are up to 500 characters.');
    }
    try {
      cleanMerchant = normalizeMerchant(merchant);
    } catch {
      next.merchant = tc('Use one line of up to 120 characters.');
    }
    const categoryId = type === 'transfer' ? undefined : categoryByType[type];
    if (type === 'transfer' && fromId === toId) next.wallets = tc('Choose two different wallets');
    if (type !== 'transfer' && !categoryId) next.category_id = tc('Choose a category');
    setErrors(next);
    if (Object.keys(next).length > 0) return null;
    const common = { id: recordId, amount_minor: amountMinor, occurred_on: date, note: cleanNote, merchant: cleanMerchant };
    return type === 'transfer'
      ? { ...common, source_wallet_id: fromId, destination_wallet_id: toId }
      : { ...common, type, wallet_id: walletId, category_id: categoryId as string };
  }

  async function save() {
    const input = build();
    if (!input) return;
    // An online save whose outcome is unknown is resent online as itself, never re-queued on the device.
    if (diary && diaryView.phase === 'ready' && status !== 'unconfirmed') {
      setStatus('saving');
      setMessage(null);
      try {
        await diary.saveDraft('source_wallet_id' in input ? { ...input, type: 'transfer' } : input, commandId);
        router.replace('/spend');
      } catch (error) {
        setMessage(localSaveProblem(error, tc));
        setStatus('editing');
      }
      return;
    }
    const key = keys.keyFor('create', input);
    setStatus('saving');
    setMessage(null);
    try {
      if ('source_wallet_id' in input) await resources.createTransfer(input, key);
      else await resources.createTransaction(input, key);
      keys.settle('create');
      router.replace('/spend');
    } catch (error) {
      // The record id is fixed for this draft: if it already exists, an
      // earlier attempt committed, so this entry is saved.
      if (isOwnCreate(error, recordId)) {
        keys.settle('create');
        router.replace('/spend');
        return;
      }
      const problem = saveProblem(error, tc);
      // A definite refusal frees the key; an unknown outcome keeps it.
      if (!problem.unconfirmed) keys.settle('create');
      setErrors(problem.fields);
      setMessage(problem.message);
      setStatus(problem.unconfirmed ? 'unconfirmed' : problem.blocked ? 'blocked' : 'editing');
    }
  }

  const typeLabels: Record<EntryType, string> = { expense: tc('Expense'), income: tc('Income'), transfer: tc('Transfer') };
  const typeCategories = type === 'transfer' ? [] : categories.filter((category) => category.type === type);
  return (
    <Frame title={tc('Add an entry')}>
      <Card>
        <ChipRow>
          {(['expense', 'income', 'transfer'] as const).map((value) => (
            <Chip key={value} label={typeLabels[value]} selected={type === value} disabled={locked} onPress={() => setType(value)} />
          ))}
        </ChipRow>
        <Field label={tc('Amount')} value={amount} onChangeText={setAmount} error={errors.amount_minor} editable={!locked} keyboardType="decimal-pad" />
        {type === 'transfer' ? (
          <>
            <Text style={{ color: colors.muted }}>{tc('From')}</Text>
            <ChipRow>
              {wallets.map((wallet) => <Chip key={wallet.id} label={wallet.name} accessibilityLabel={`${tc('From')} ${wallet.name}`} selected={fromId === wallet.id} disabled={locked} onPress={() => setFromId(wallet.id)} />)}
            </ChipRow>
            <Text style={{ color: colors.muted }}>{tc('To')}</Text>
            <ChipRow>
              {wallets.map((wallet) => <Chip key={wallet.id} label={wallet.name} accessibilityLabel={`${tc('To')} ${wallet.name}`} selected={toId === wallet.id} disabled={locked} onPress={() => setToId(wallet.id)} />)}
            </ChipRow>
            {errors.wallets || errors.source_wallet_id || errors.destination_wallet_id ? (
              <Text accessibilityRole="alert" style={{ color: colors.danger }}>{errors.wallets ?? errors.source_wallet_id ?? errors.destination_wallet_id}</Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={{ color: colors.muted }}>{tc('Wallet')}</Text>
            <ChipRow>
              {wallets.map((wallet) => <Chip key={wallet.id} label={wallet.name} selected={walletId === wallet.id} disabled={locked} onPress={() => setWalletId(wallet.id)} />)}
            </ChipRow>
            <Text style={{ color: colors.muted }}>{tc('Category')}</Text>
            <ChipRow>
              {typeCategories.map((category) => (
                <Chip key={category.id} label={categoryName(category, tc)} selected={categoryByType[type as 'expense' | 'income'] === category.id} disabled={locked}
                  onPress={() => setCategoryByType((current) => ({ ...current, [type]: category.id }))} />
              ))}
            </ChipRow>
            {errors.category_id || errors.wallet_id ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{errors.category_id ?? errors.wallet_id}</Text> : null}
          </>
        )}
        <Field label={tc('Date')} value={date} onChangeText={setDate} error={errors.occurred_on} editable={!locked} />
        <Field label={tc('Note')} value={note} onChangeText={setNote} error={errors.note} editable={!locked} multiline />
        <Field label={tc('Merchant')} value={merchant} onChangeText={setMerchant} error={errors.merchant} editable={!locked} />
      </Card>
      {message ? <Notice tone="warning" message={message} /> : null}
      <View>
        {status === 'unconfirmed'
          ? <Button label={tc('Try again')} onPress={save} />
          : <Button label={tc('Save entry')} onPress={save} disabled={status === 'saving' || status === 'blocked'} />}
      </View>
    </Frame>
  );
}
