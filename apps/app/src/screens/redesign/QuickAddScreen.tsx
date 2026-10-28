// Quick add (redesign R3, plan §6.1): amount first, one-handed. Expense,
// income or a move between the user's own wallets, typed on the kit keypad
// (exact satang, never the system keyboard), the top three categories by
// recent use with "More" for the rest, a date chip, the wallet, More details
// (merchant and note) and Save.
//
// Saving is the current AddTransactionScreen's, rule for rule:
// - With a ready device diary the entry is saved on the device first, and is
//   shown as saved only once that local commit succeeds; the outbox sends it.
// - Otherwise it is sent online as one immutable command (`keys.keyFor`), and
//   shown as saved only after the server's acknowledgement.
// - An unconfirmed online save freezes the whole entry; only "Try again" is
//   offered, and it resends the very same command online, never re-queued on
//   the device, even if the diary opens meanwhile.
// - One record id per draft and one device command id per draft (the
//   quickAddModel id rules). "Add another" and Copy always take new ids.
// - A create refused because this draft's record id already exists means an
//   earlier attempt committed (`isOwnCreate`): it counts as saved.
// - The wallets and categories the form first showed stay for its whole life.
// The category order is fixed at the first touch: until then it may still
// follow the recent-use load (so a slow network never blocks the form), after
// it no chip moves under the thumb.
//
// The bun appears only in the empty state and, at full intensity, as the
// `cheer` pose in the saved moment at most once a day (quickAddCheer.ts).
//
// The form opens on the type switch with Close beside it, as plan §6.1 lays it
// out (no title row; the title stays a heading for screen readers), and Save,
// with any save problem above it, is pinned under the scrolling form
// (ActionFooter.tsx), so on a 402 × 874 pt phone the keypad and Save both show.
import type { AiDraft, CategoryDto, Minor, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { useActiveLocale, useCopy } from '@mobile/i18n/useCopy';
import { Bun } from '@mobile/mascot/Bun';
import { oftenLogged } from '@mobile/spend/v1/ai/oftenLogged';
import { applyDraft } from '@mobile/spend/v1/ai/tellBun';
import { anotherDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import type { EntryType, QuickAddDraft } from '@mobile/spend/v1/redesign/quickAddModel';
import type { Translate } from '@mobile/spend/v1/redesign/shared';
import { categoryName } from '@mobile/spend/v1/viewModels';
import type { PendingEntry } from '@mobile/storage/types';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { useSpringPop } from '@mobile/theme/useSpringPop';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { Amount, useAmountWords } from '@mobile/ui/Amount';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { CategoryChips } from '@mobile/ui/CategoryChips';
import { CategoryGrid } from '@mobile/ui/CategoryGrid';
import { DateChip } from '@mobile/ui/DateChip';
import { EmptyState } from '@mobile/ui/EmptyState';
import { FieldError } from '@mobile/ui/FieldError';
import { Keypad } from '@mobile/ui/Keypad';
import { EMPTY_KEYPAD, applyKey, evaluateKeypad, keypadDisplay, keypadFromMinor, keypadHasOperator } from '@mobile/ui/keypadExpression';
import type { KeypadKey, KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { NoteField } from '@mobile/ui/NoteField';
import { PillButton } from '@mobile/ui/PillButton';
import { Sheet } from '@mobile/ui/Sheet';
import { TypeSwitch } from '@mobile/ui/TypeSwitch';
import { WalletPicker } from '@mobile/ui/WalletPicker';
import { newId } from '../v1/parts';
import { ActionFooter, EntryPage } from './ActionFooter';
import { TellBunSheet } from './ai/TellBunSheet';
import { earliestFor, firstDraft, keypadFor, KEYPAD_PROBLEM_TEXT, ordered, rank, walletChoices, withDefaults } from './entry/entryHelpers';
import type { CopySource, Ranking } from './entry/entryHelpers';
import { useEntryReferences } from './entry/entryReferences';
import { keypadShownOnSave, useEntrySave } from './entry/entrySave';
import type { SavedEntry } from './entry/entrySave';
import { Notice } from './HistoryParts';

export type QuickAddScreenProps = {
  /** The clock, for tests; today is its Bangkok date. */
  now?: Date;
};

export function QuickAddScreen({ now }: QuickAddScreenProps) {
  const tc = useCopy();
  const router = useRouter();
  const params = useLocalSearchParams();
  const copyOf = typeof params.copyOf === 'string' && params.copyOf !== '' ? params.copyOf : null;
  const references = useEntryReferences({ copyOf, now });
  const leave = () => router.replace('/spend');
  const title = tc('Add an entry');

  if (references.state === 'loading') return <Page title={title} onClose={leave}><Waiting label={references.label} /></Page>;
  if (references.state === 'problem') {
    const blank = references.startBlank ? { label: tc('Start a new entry'), onPress: references.startBlank } : null;
    const retry = references.retry ? { label: tc('Try again'), onPress: references.retry } : null;
    const action = retry ?? blank ?? { label: tc('Home'), onPress: leave };
    const secondary = retry && blank ? blank : undefined;
    return (
      <Page title={title} onClose={leave}>
        <Problem message={references.message} action={action} secondary={secondary} />
      </Page>
    );
  }
  if (references.state === 'no_wallet') {
    return (
      <Page title={title} onClose={leave}>
        <EmptyState art={<Bun pose="hello" size="l" />} title={tc('No wallets yet')} body={tc('Add a wallet on the home screen first.')} action={{ label: tc('Home'), onPress: leave }} />
      </Page>
    );
  }

  return (
    <EntryForm
      key={references.source ? `copy:${references.source.id}` : 'new'}
      wallets={references.wallets}
      categories={references.categories}
      balances={references.balances}
      today={references.today}
      records={references.records}
      drafts={references.drafts}
      source={references.source}
      title={title}
      onDone={leave}
      onAnother={references.refreshBalances}
    />
  );
}

// ---------------------------------------------------------------------------
// The form

type EntryFormProps = {
  wallets: readonly WalletSnapshot[];
  categories: readonly CategoryDto[];
  /** Each wallet's balance less waiting drafts, when the server's list loaded; offline there is none. */
  balances: ReadonlyMap<string, Minor> | null;
  today: string;
  records: readonly TransactionDto[];
  drafts: readonly PendingEntry[];
  source: CopySource | null;
  /** The page's title, said as its heading. */
  title: string;
  onDone: () => void;
  /** Add another: the balances are read again in place, so move all is never stale after an online save. */
  onAnother?: () => void;
};

function EntryForm({ wallets, categories, balances, today, records, drafts, source, title, onDone, onAnother }: EntryFormProps) {
  const tc = useCopy();
  const activeLocale = useActiveLocale();
  const companion = isRedesignEnabled('companion');
  const liveRanking = useMemo(() => rank(categories, records, drafts, today), [categories, records, drafts, today]);
  // Tell Bun's "Often logged" chips, from the same recent records (worked out here; nothing is sent).
  const often = useMemo(() => oftenLogged({ records, today, wallets, categories }), [records, today, wallets, categories]);
  const [frozenRanking, setFrozenRanking] = useState<Ranking | null>(null);
  const ranking = frozenRanking ?? liveRanking;
  // One record id and one device command id per draft, fixed when it opens.
  const [draft, setDraft] = useState<QuickAddDraft>(() => firstDraft(source, { today, wallets, categories, ranking: liveRanking }));
  const current = frozenRanking ? draft : withDefaults(draft, liveRanking, source);
  const [keypad, setKeypad] = useState<KeypadState>(() => keypadFor(source));
  const [details, setDetails] = useState(() => Boolean(source?.note || source?.merchant));
  const [sheet, setSheet] = useState<'categories' | 'wallet' | 'tellBun' | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const entrySave = useEntrySave({ today, onSaved: () => setSavedCount((count) => count + 1) });
  const { status, message, errors, serverErrors, resendBlocked, saved, locked } = entrySave;
  const pop = useSpringPop(savedCount);
  const type: EntryType = current.type;

  /** The first touch fixes the category order and the draft's defaults. */
  const touch = () => {
    if (frozenRanking) return;
    setFrozenRanking(liveRanking);
    setDraft(current);
  };
  const edit = (change: (previous: QuickAddDraft) => QuickAddDraft) => {
    if (locked) return;
    touch();
    setDraft(change);
  };
  const onKey = (key: KeypadKey) => {
    if (locked) return;
    touch();
    setKeypad((previous) => applyKey(previous, key));
  };

  async function save() {
    if (status === 'saving' || status === 'saved' || status === 'blocked' || status === 'conflict' || resendBlocked) return;
    // An online save whose outcome is unknown is resent as itself: no first touch, and the amount stays as shown.
    if (status !== 'unconfirmed') {
      touch();
      // Save presses = for the user at once, before the save is on its way.
      const shown = keypadShownOnSave(keypad);
      if (shown) setKeypad(shown);
    }
    const attempt = await entrySave.save({ draft: current, keypad, wallets });
    if (attempt.openDetails) setDetails(true);
  }

  function addAnother() {
    if (!saved) return;
    setDraft(anotherDraft(saved.draft, { recordId: newId(), commandId: newId() }));
    setKeypad(EMPTY_KEYPAD);
    setDetails(false);
    setSheet(null);
    entrySave.another();
    onAnother?.();
  }

  if (status === 'saved' && saved) {
    return (
      <Page title={title} onClose={onDone}>
        <SavedMoment saved={saved} wallets={wallets} categories={categories} pop={pop} onAnother={addAnother} onDone={onDone} />
      </Page>
    );
  }

  const choices = walletChoices(wallets, balances);
  const earliest = earliestFor(current, wallets);
  const same = current.type === 'transfer' && current.fromWalletId !== null && current.fromWalletId === current.toWalletId;
  const amountError = keypad.problem ? tc(KEYPAD_PROBLEM_TEXT[keypad.problem]) : errors.amount_minor ?? serverErrors.amount_minor ?? null;
  const categoryError = errors.category_id ?? serverErrors.category_id ?? null;
  const walletError = errors.wallet_id ?? serverErrors.wallet_id ?? null;
  const moveError = errors.wallets ?? serverErrors.source_wallet_id ?? serverErrors.destination_wallet_id ?? serverErrors.wallets ?? null;
  const dateError = errors.occurred_on ?? serverErrors.occurred_on ?? null;
  const walletName = wallets.find((wallet) => wallet.id === current.walletId)?.name ?? null;
  const typeCategories = type === 'transfer' ? [] : ordered(ranking[type]);
  const setFrom = (id: string) => edit((previous) => ({ ...previous, fromWalletId: id }));
  const setTo = (id: string) => edit((previous) => ({ ...previous, toWalletId: id }));
  const swap = () => edit((previous) => ({ ...previous, fromWalletId: previous.toWalletId, toWalletId: previous.fromWalletId }));
  const pickCategory = (id: string) => {
    if (type === 'transfer') return;
    edit((previous) => ({ ...previous, categoryByType: { ...previous.categoryByType, [type]: id } }));
  };
  // Tell Bun (premium plan A3): a draft fills the sheet as if typed; Save stays the person's.
  const useBunDraft = (bunDraft: AiDraft) => {
    if (locked) return;
    edit((previous) => ({ ...previous, ...applyDraft(previous, bunDraft).fields }));
    if (bunDraft.amount_minor) setKeypad(keypadFromMinor(bunDraft.amount_minor));
  };

  const footer = (
    <ActionFooter testID="quick-add-footer">
      {message ? <Notice tone="alert" message={message} /> : null}
      {status === 'conflict' ? <PillButton label={tc('Done')} onPress={onDone} /> : null}
      {status === 'unconfirmed' ? <PillButton label={tc('Try again')} disabled={resendBlocked} onPress={() => void save()} /> : null}
      {status !== 'unconfirmed' && status !== 'conflict'
        ? <PillButton label={tc('Save entry')} busy={status === 'saving'} busyLabel={tc('Saving…')} disabled={status === 'blocked'} onPress={() => void save()} />
        : null}
    </ActionFooter>
  );

  return (
    <Page title={title} onClose={onDone} footer={footer}>
      <View style={{ gap: BUN_SPACE.sm }}>
        <View testID="quick-add-top" style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm }}>
          <View style={{ flex: 1 }}>
            <TypeSwitch value={type} onChange={(next) => edit((previous) => ({ ...previous, type: next }))} disabled={locked} />
          </View>
          <CloseButton onPress={onDone} />
        </View>
        <AmountLine keypad={keypad} type={type} error={amountError} />
        {companion && type !== 'transfer' ? (
          <PillButton
            kind="secondary"
            label={tc('Tell Bun')}
            accessibilityHint={tc('Type it like a chat message, or scan a bank slip. Bun fills in the entry for you to check.')}
            disabled={locked}
            onPress={() => setSheet('tellBun')}
            testID="quick-add-tell-bun"
          />
        ) : null}
        {type === 'transfer' ? (
          <WalletPicker
            mode="move"
            wallets={choices}
            fromId={current.fromWalletId}
            toId={current.toWalletId}
            onChangeFrom={setFrom}
            onChangeTo={setTo}
            onSwap={swap}
            onMoveAll={(balance) => {
              if (locked) return;
              touch();
              try {
                setKeypad(keypadFromMinor(balance));
              } catch {
                setKeypad((previous) => ({ ...previous, problem: 'too_large' }));
              }
            }}
            // WalletPicker states the same-wallet problem itself; say it once.
            error={same ? null : moveError}
            disabled={locked}
          />
        ) : (
          <View style={{ gap: BUN_SPACE.xs }}>
            <CategoryChips
              ranked={typeCategories}
              selectedId={current.categoryByType[type]}
              onSelect={pickCategory}
              onMore={() => {
                if (locked) return;
                touch();
                setSheet('categories');
              }}
              disabled={locked}
            />
            {categoryError ? <FieldError message={categoryError} /> : null}
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: BUN_SPACE.xs }}>
          <DateChip value={current.occurredOn} today={today} earliest={earliest ?? undefined} onChange={(date) => edit((previous) => ({ ...previous, occurredOn: date }))} disabled={locked} />
          {type !== 'transfer' ? (
            <ChipButton
              label={walletName ? tc('Wallet: {name}', { name: walletName }) : tc('Choose a wallet')}
              text={walletName ?? tc('Choose a wallet')}
              disabled={locked}
              onPress={() => {
                touch();
                setSheet('wallet');
              }}
            />
          ) : null}
          <ChipButton label={tc('More details')} text={tc('More details')} expanded={details} disabled={locked} onPress={() => setDetails((open) => !open)} />
        </View>
        {dateError ? <FieldError message={dateError} /> : null}
        {type !== 'transfer' && walletError ? <FieldError message={walletError} /> : null}
        {details ? (
          <View style={{ gap: BUN_SPACE.sm }}>
            {/* NoteField states its own length and line rules; only the server's problems are passed in. */}
            <NoteField kind="merchant" value={current.merchant} onChangeText={(text) => edit((previous) => ({ ...previous, merchant: text }))} error={serverErrors.merchant ?? null} editable={!locked} />
            <NoteField kind="note" value={current.note} onChangeText={(text) => edit((previous) => ({ ...previous, note: text }))} error={serverErrors.note ?? null} editable={!locked} />
          </View>
        ) : null}
        <Keypad onKey={onKey} disabled={locked} />
        {companion ? (
          <TellBunSheet
            visible={sheet === 'tellBun'}
            onClose={() => setSheet(null)}
            context={{ today, wallets, categories }}
            locale={activeLocale}
            onUse={useBunDraft}
            often={often}
          />
        ) : null}
        <Sheet visible={sheet === 'categories'} onClose={() => setSheet(null)} title={tc('Choose a category')}>
          {type !== 'transfer' ? (
            <CategoryGrid
              categories={typeCategories}
              selectedId={current.categoryByType[type]}
              onSelect={(id) => {
                pickCategory(id);
                setSheet(null);
              }}
            />
          ) : null}
        </Sheet>
        <Sheet visible={sheet === 'wallet'} onClose={() => setSheet(null)} title={tc('Wallet')}>
          <WalletPicker
            mode="single"
            wallets={choices}
            selectedId={current.walletId}
            onSelect={(id) => {
              edit((previous) => ({ ...previous, walletId: id }));
              setSheet(null);
            }}
          />
        </Sheet>
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Pieces

/**
 * The page: background, the title and Close (Quick add has no stack header),
 * and the form's pinned footer when it has one. A form with a footer draws
 * Close itself, beside the type switch, and its title is a heading for
 * screen readers only.
 */
function Page({ title, onClose, footer, children }: { title: string; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <EntryPage testID="quick-add-screen">
      <ScrollView
        testID="quick-add-scroll"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + BUN_SPACE.sm, paddingBottom: footer ? BUN_SPACE.sm : insets.bottom + BUN_SPACE.lg, paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}
        keyboardShouldPersistTaps="handled"
      >
        {footer ? (
          <View accessible accessibilityRole="header" role="heading" accessibilityLabel={title} style={SCREEN_READER_ONLY} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm }}>
            <BunText variant="title" role="heading" accessibilityRole="header" style={{ flex: 1 }}>{title}</BunText>
            <CloseButton onPress={onClose} />
          </View>
        )}
        {children}
      </ScrollView>
      {footer}
    </EntryPage>
  );
}

/** Takes no room and draws nothing, but a screen reader still finds it. */
const SCREEN_READER_ONLY = { position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden' } as const;

function CloseButton({ onPress }: { onPress: () => void }) {
  const colors = useBunColors();
  const tc = useCopy();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tc('Close')}
      onPress={onPress}
      style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}
    >
      <View {...DECORATIVE}>
        <BunText variant="heading">×</BunText>
      </View>
    </Pressable>
  );
}

function Waiting({ label }: { label: string }) {
  const colors = useBunColors();
  return (
    <View style={{ paddingVertical: BUN_SPACE.xl, alignItems: 'center' }}>
      <ActivityIndicator color={colors.ink} accessibilityLabel={label} />
    </View>
  );
}

type Action = { label: string; onPress: () => void };

/** A load problem: what happened in words, and one way forward. No bun: this is not an empty space. */
function Problem({ message, action, secondary }: { message: string; action: Action; secondary?: Action }) {
  return (
    <Card>
      <BunText accessibilityRole="alert">{message}</BunText>
      <PillButton label={action.label} onPress={action.onPress} />
      {secondary ? <PillButton kind="secondary" label={secondary.label} onPress={secondary.onPress} /> : null}
    </Card>
  );
}

/** The amount, extra large and exact, worked out live from the keypad; what was typed shows above it. */
function AmountLine({ keypad, type, error }: { keypad: KeypadState; type: EntryType; error: string | null }) {
  const live = evaluateKeypad(keypad, { allowZero: true });
  const typed = keypadDisplay(keypad);
  const sum = keypadHasOperator(keypad);
  // A sum still being typed that has no value yet (it is below zero, or divides by zero) shows as typed.
  const hero = live.ok
    ? <Amount minor={live.minor} type={type} size="xl" />
    : sum ? <BunText variant="hero" style={{ fontVariant: ['tabular-nums'] }}>{typed}</BunText> : <Amount minor="0" type={type} size="xl" />;
  return (
    <View style={{ alignItems: 'center', gap: BUN_SPACE.xxs, paddingVertical: BUN_SPACE.xs }}>
      {/* A polite live region: each key's live result is read out (iOS hears the keypad's own key names). */}
      <View testID="quick-add-amount" {...POLITE_LIVE_REGION} style={{ alignItems: 'center', gap: BUN_SPACE.xxs }}>
        {live.ok && (sum || typed.includes('.')) ? <BunText variant="label" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{typed}</BunText> : null}
        {hero}
      </View>
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

/** A small outlined pill on the row under the amount (the wallet, More details). */
function ChipButton({ label, text, onPress, disabled = false, expanded }: { label: string; text: string; onPress: () => void; disabled?: boolean; expanded?: boolean }) {
  const colors = useBunColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-expanded={expanded}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: BUN_TOUCH,
        justifyContent: 'center',
        paddingHorizontal: BUN_SPACE.md,
        paddingVertical: BUN_SPACE.xxs,
        borderRadius: BUN_RADIUS.pill,
        borderWidth: BUN_OUTLINE.control,
        borderColor: colors.ink,
        backgroundColor: colors.card,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <BunText variant="label">{text}</BunText>
    </Pressable>
  );
}

/** What was saved, in words: "Food · Cash", or "Cash → Daily account" for a move. */
function savedDetail(draft: QuickAddDraft, wallets: readonly WalletSnapshot[], categories: readonly CategoryDto[], tc: Translate): string {
  const walletName = (id: string | null) => wallets.find((wallet) => wallet.id === id)?.name ?? '';
  if (draft.type === 'transfer') return `${walletName(draft.fromWalletId)} → ${walletName(draft.toWalletId)}`;
  const category = categories.find((candidate) => candidate.id === draft.categoryByType[draft.type as 'expense' | 'income']);
  return [category ? categoryName(category, tc) : '', walletName(draft.walletId)].filter((part) => part !== '').join(' · ');
}

/** "Saved": a spring pop on the lavender stage, the exact amount, and Add another or Done. Only ink sits on the stage. */
function SavedMoment({ saved, wallets, categories, pop, onAnother, onDone }: {
  saved: SavedEntry; wallets: readonly WalletSnapshot[]; categories: readonly CategoryDto[]; pop: ReturnType<typeof useSpringPop>; onAnother: () => void; onDone: () => void;
}) {
  const tc = useCopy();
  const colors = useBunColors();
  const words = useAmountWords();
  const { draft, via, cheer } = saved;
  // A device save is committed on this device and still waiting to sync: it never claims more.
  const title = via === 'device' ? tc('Saved on this device') : tc('Saved');
  const detail = savedDetail(draft, wallets, categories, tc);
  useAnnouncement(`${title}. ${words(draft.amountMinor, draft.type).spoken}`);
  return (
    <Animated.View
      testID="quick-add-saved"
      {...POLITE_LIVE_REGION}
      style={[{
        alignItems: 'center',
        gap: BUN_SPACE.sm,
        padding: BUN_SPACE.lg,
        borderRadius: BUN_RADIUS.card,
        borderWidth: BUN_OUTLINE.card,
        borderColor: colors.ink,
        backgroundColor: colors.stage,
      }, pop]}
    >
      {cheer ? <Bun pose="cheer" size="l" /> : null}
      <BunText variant="title" style={{ textAlign: 'center' }}>{title}</BunText>
      <Amount minor={draft.amountMinor} type={draft.type} size="l" on="stage" />
      {detail ? <BunText style={{ textAlign: 'center' }}>{detail}</BunText> : null}
      {via === 'device' ? <BunText variant="caption" style={{ textAlign: 'center' }}>{tc('Waiting to sync')}</BunText> : null}
      <View style={{ alignSelf: 'stretch', gap: BUN_SPACE.sm, marginTop: BUN_SPACE.xs }}>
        <PillButton label={tc('Add another')} onPress={onAnother} />
        <PillButton kind="secondary" label={tc('Done')} onPress={onDone} />
      </View>
    </Animated.View>
  );
}
