// The import review (R7, plan §6.5), calm data: the label step (the file's
// wallet and category labels matched to the person's own), the rows with
// their flags, the exact running total of what is chosen, bulk fixes for
// type, category and wallet, and a row's own sheet. Nothing here is chosen,
// fixed or matched for the person: every change is a tap. Built from the kit
// (src/ui), BunText and the useBunColors() tokens only.
import type { CategoryDto } from '@gogospend/contracts';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { rowView } from '@mobile/spend/v1/importReview';
import type { ImportJourney } from '@mobile/spend/v1/importReview';
import { fileNotices, filterRows, isChecked, labelsToMap, rowFlags, selectionTotals } from '@mobile/spend/v1/redesign/import/importModel';
import type { LabelUse, ReviewFilter, RowFlag } from '@mobile/spend/v1/redesign/import/importModel';
import { say } from '@mobile/spend/v1/redesign/shared';
import { categoryName } from '@mobile/spend/v1/viewModels';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, POLITE_LIVE_REGION } from '@mobile/ui/a11y';
import { AmountText, useAmountWords } from '@mobile/ui/Amount';
import { BunText } from '@mobile/ui/BunText';
import { OutlinedCard } from '@mobile/ui/Card';
import { CategoryGrid } from '@mobile/ui/CategoryGrid';
import { DateChip } from '@mobile/ui/DateChip';
import { dayLabel, fullDateLabel } from '@mobile/ui/dateStep';
import { FilterChip, FilterChips } from '@mobile/ui/FilterChip';
import { FlagChip } from '@mobile/ui/FlagChip';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { Sheet } from '@mobile/ui/Sheet';
import { WalletPicker } from '@mobile/ui/WalletPicker';
import type { WalletChoice } from '@mobile/ui/WalletPicker';
import { useDateLocale } from '../HistoryParts';
import { PageHeading, grouped } from './ImportParts';

type Tc = ReturnType<typeof useCopy>;

/** The person's own wallets and categories, to match labels to. */
export type ImportRefs = { readonly wallets: readonly WalletChoice[]; readonly categories: readonly CategoryDto[] };

/** Which label a match sheet is for: a wallet label, or a category label of one type. */
export type MatchTarget = { readonly label: string; readonly kind: 'wallet' | 'expense' | 'income' };

const has = (map: Readonly<Record<string, string>>, key: string) => Object.prototype.hasOwnProperty.call(map, key);

/** The name the person knows a label by: their own wallet's or category's once matched, else the file's text. */
function useNames(refs: ImportRefs) {
  const tc = useCopy();
  return {
    wallet: (journey: ImportJourney, label: string | null): string | null => {
      if (label === null) return null;
      const id = has(journey.mapping.wallets, label) ? journey.mapping.wallets[label] : null;
      return refs.wallets.find((wallet) => wallet.id === id)?.name ?? label;
    },
    category: (journey: ImportJourney, label: string | null, type: string | null): string | null => {
      if (label === null) return null;
      const map = type === 'income' ? journey.mapping.categories.income : type === 'expense' ? journey.mapping.categories.expense : null;
      const id = map && has(map, label) ? map[label] : null;
      const category = refs.categories.find((candidate) => candidate.id === id);
      return category ? categoryName(category, tc) : label;
    },
    byId: (kind: MatchTarget['kind'], id: string | null): string | null => {
      if (id === null) return null;
      if (kind === 'wallet') return refs.wallets.find((wallet) => wallet.id === id)?.name ?? null;
      const category = refs.categories.find((candidate) => candidate.id === id);
      return category ? categoryName(category, tc) : null;
    },
  };
}

const flagWords = (flag: RowFlag, tc: Tc) => say(tc, flag.label);
const spokenFlag = (flag: RowFlag, tc: Tc) => (flag.tone === 'warning' ? tc('Check this: {label}', { label: flagWords(flag, tc) }) : tc('Note: {label}', { label: flagWords(flag, tc) }));

export type RowWords = {
  readonly ordinal: number;
  readonly title: string;
  readonly amount: string;
  readonly detail: string;
  readonly checked: boolean;
  readonly saved: boolean;
  readonly flags: readonly RowFlag[];
  readonly spoken: string;
};

/** A row as the person sees and hears it: "Row 2: Noodles, Expense ฿120.50, No date, Cash, Food. Check this: Date unclear". */
export function useRowWords(refs: ImportRefs, today: string) {
  const tc = useCopy();
  const amountWords = useAmountWords();
  const locale = useDateLocale();
  const names = useNames(refs);
  return (journey: ImportJourney, id: string): RowWords | null => {
    const row = rowView(journey, id);
    if (!row) return null;
    const title = row.merchant ?? row.note ?? tc('Row {row}', { row: row.ordinal });
    const typed = row.type === 'expense' || row.type === 'income' || row.type === 'transfer' ? row.type : undefined;
    const amount = row.amount_minor === null ? null : amountWords(row.amount_minor, typed);
    const amountShown = amount ? amount.shown : tc('No amount');
    const amountSpoken = amount ? amount.spoken : tc('No amount');
    const dateShown = row.occurred_on ? dayLabel(row.occurred_on, today, locale).text : tc('No date');
    const dateSpoken = row.occurred_on ? fullDateLabel(row.occurred_on, locale) : tc('No date');
    const wallet = names.wallet(journey, row.wallet_label) ?? tc('No wallet');
    const category = row.type === 'transfer' ? null : (names.category(journey, row.category_label, row.type) ?? tc('No category'));
    const flags = rowFlags(journey, id);
    const checked = isChecked(journey, id);
    const saved = journey.committed.includes(id);
    const parts = [title, amountSpoken, dateSpoken, wallet, ...(category === null ? [] : [category])];
    let spoken = tc('Row {row}: {details}', { row: row.ordinal, details: parts.join(', ') });
    if (checked) spoken = `${spoken}, ${tc('checked')}`;
    if (flags.length > 0) spoken = `${spoken}. ${flags.map((flag) => spokenFlag(flag, tc)).join('. ')}`;
    return { ordinal: row.ordinal, title, amount: amountShown, detail: [dateShown, wallet, ...(category === null ? [] : [category])].join(' · '), checked, saved, flags, spoken };
  };
}

// ---------------------------------------------------------------------------
// The label step

function LabelRow({ use, name, onPress }: { use: LabelUse; name: string | null; onPress: () => void }) {
  const tc = useCopy();
  const colors = useBunColors();
  const values = { label: use.label, rows: grouped(use.rows), name: name ?? '' };
  const spoken = name
    ? use.rows === 1 ? tc('{label}, 1 row, matched to {name}', values) : tc('{label}, {rows} rows, matched to {name}', values)
    : use.rows === 1 ? tc('{label}, 1 row, not matched yet', values) : tc('{label}, {rows} rows, not matched yet', values);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: BUN_TOUCH,
        flexDirection: 'row',
        alignItems: 'center',
        gap: BUN_SPACE.sm,
        paddingVertical: BUN_SPACE.xs,
        borderBottomWidth: BUN_OUTLINE.rule,
        borderBottomColor: colors.rule,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <BunText>{use.label}</BunText>
        <BunText variant="caption" tone="muted">{use.rows === 1 ? tc('1 row') : tc('{count} rows', { count: grouped(use.rows) })}</BunText>
      </View>
      {name ? (
        <BunText variant="label" style={{ flexShrink: 1, textAlign: 'right' }}>{tc('→ {name}', { name })}</BunText>
      ) : (
        <FlagChip label={tc('Not matched yet')} />
      )}
      <View {...DECORATIVE}><BunText variant="heading" tone="muted">›</BunText></View>
    </Pressable>
  );
}

function LabelGroup({ title, uses, kind, journeyName, onOpen }: { title: string; uses: readonly LabelUse[]; kind: MatchTarget['kind']; journeyName: (id: string | null) => string | null; onOpen: (target: MatchTarget) => void }) {
  if (uses.length === 0) return null;
  return (
    <View style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="label" role="heading" accessibilityRole="header" style={{ fontWeight: '700' }}>{title}</BunText>
      {uses.map((use) => (
        <LabelRow key={use.label} use={use} name={journeyName(use.mappedId)} onPress={() => onOpen({ label: use.label, kind })} />
      ))}
    </View>
  );
}

/** Step 1: the file's labels, each matched to one of the person's wallets or categories. */
export function LabelStep({ journey, refs, onOpen }: { journey: ImportJourney; refs: ImportRefs; onOpen: (target: MatchTarget) => void }) {
  const tc = useCopy();
  const names = useNames(refs);
  const labels = labelsToMap(journey);
  const none = labels.wallets.length + labels.expense.length + labels.income.length === 0;
  return (
    <View testID="import-labels" style={{ gap: BUN_SPACE.md }}>
      <PageHeading>{tc('Match your labels')}</PageHeading>
      <BunText tone="muted">{tc("Match the wallets and categories in your file to your own. A row is saved only once its labels are matched; nothing is matched for you.")}</BunText>
      {none ? <BunText>{tc('This file has no wallet or category labels.')}</BunText> : null}
      <LabelGroup title={tc('Wallets in this file')} uses={labels.wallets} kind="wallet" journeyName={(id) => names.byId('wallet', id)} onOpen={onOpen} />
      <LabelGroup title={tc('Expense categories in this file')} uses={labels.expense} kind="expense" journeyName={(id) => names.byId('expense', id)} onOpen={onOpen} />
      <LabelGroup title={tc('Income categories in this file')} uses={labels.income} kind="income" journeyName={(id) => names.byId('income', id)} onOpen={onOpen} />
    </View>
  );
}

/** Matches one file label to one of the person's wallets or categories. */
export function MatchSheet({ journey, target, refs, onMatch, onClose }: { journey: ImportJourney; target: MatchTarget; refs: ImportRefs; onMatch: (id: string) => void; onClose: () => void }) {
  const tc = useCopy();
  const map = target.kind === 'wallet' ? journey.mapping.wallets : journey.mapping.categories[target.kind];
  const selected = has(map, target.label) ? map[target.label] : null;
  return (
    <Sheet visible onClose={onClose} title={tc('Match "{label}"', { label: target.label })}>
      <BunText tone="muted">
        {target.kind === 'wallet'
          ? tc('Every row with the wallet "{label}" goes to the wallet you choose.', { label: target.label })
          : tc('Every row with the category "{label}" goes to the category you choose.', { label: target.label })}
      </BunText>
      {target.kind === 'wallet'
        ? <WalletPicker mode="single" wallets={refs.wallets} selectedId={selected} onSelect={onMatch} />
        : <CategoryGrid categories={refs.categories.filter((category) => category.type === target.kind)} selectedId={selected} onSelect={onMatch} />}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// The rows step

/** The running total of what is chosen, exact, read as one polite update. */
function TotalCard({ journey }: { journey: ImportJourney }) {
  const tc = useCopy();
  const amountWords = useAmountWords();
  const totals = selectionTotals(journey);
  const out = amountWords(totals.outMinor).shown;
  const income = amountWords(totals.inMinor).shown;
  const notCounted = totals.unknown === 1
    ? tc('1 not counted: no type or amount, or a move.')
    : tc('{count} not counted: no type or amount, or a move.', { count: grouped(totals.unknown) });
  const spoken = [
    tc('{count} chosen.', { count: grouped(totals.count) }),
    tc('Money out {amount}.', { amount: out }),
    tc('Money in {amount}.', { amount: income }),
    ...(totals.unknown > 0 ? [notCounted] : []),
  ].join(' ');
  return (
    <OutlinedCard testID="import-total" accessible accessibilityLabel={spoken} {...POLITE_LIVE_REGION} padding="sm">
      <BunText variant="label" style={{ fontWeight: '700' }}>{tc('{count} chosen', { count: grouped(totals.count) })}</BunText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: BUN_SPACE.md, rowGap: BUN_SPACE.xxs }}>
        <View style={{ flexDirection: 'row', gap: BUN_SPACE.xs }}>
          <BunText variant="label" tone="muted">{tc('Money out')}</BunText>
          <AmountText variant="label">{out}</AmountText>
        </View>
        <View style={{ flexDirection: 'row', gap: BUN_SPACE.xs }}>
          <BunText variant="label" tone="muted">{tc('Money in')}</BunText>
          <AmountText variant="label">{income}</AmountText>
        </View>
      </View>
      {totals.unknown > 0 ? <BunText variant="caption" tone="muted">{notCounted}</BunText> : null}
    </OutlinedCard>
  );
}

/** One row: its box to choose it, and the row itself, which opens its sheet. */
function ImportRowView({ words, chosen, onToggle, onOpen }: { words: RowWords; chosen: boolean; onToggle: () => void; onOpen: () => void }) {
  const tc = useCopy();
  const colors = useBunColors();
  return (
    <View role="listitem" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: BUN_SPACE.xxs, borderBottomWidth: BUN_OUTLINE.rule, borderBottomColor: colors.rule }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={tc('Choose row {row}', { row: words.ordinal })}
        accessibilityState={{ checked: chosen, disabled: words.saved }}
        aria-checked={chosen}
        disabled={words.saved}
        onPress={onToggle}
        style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, alignItems: 'center', justifyContent: 'center' }}
      >
        <View
          {...DECORATIVE}
          style={{
            width: 24,
            height: 24,
            borderRadius: BUN_RADIUS.chip / 2,
            borderWidth: BUN_OUTLINE.control,
            borderColor: words.saved ? colors.muted : colors.ink,
            backgroundColor: chosen ? colors.ink : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {chosen ? <BunText variant="caption" tone="onInk" style={{ fontWeight: '700' }}>✓</BunText> : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={words.spoken}
        onPress={onOpen}
        style={({ pressed }) => ({ flex: 1, minHeight: BUN_TOUCH, gap: BUN_SPACE.xxs, paddingVertical: BUN_SPACE.xs, opacity: pressed ? 0.7 : 1 })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: BUN_SPACE.sm }}>
          <BunText style={{ flex: 1 }}>{words.title}</BunText>
          <AmountText variant="body">{words.amount}</AmountText>
        </View>
        <BunText variant="caption" tone="muted">{words.detail}</BunText>
        {words.flags.length > 0 || words.checked ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: BUN_SPACE.xs }}>
            {words.flags.map((flag) => <FlagChip key={flag.key} label={say(tc, flag.label)} tone={flag.tone} />)}
            {words.checked && !words.saved ? <BunText variant="caption" tone="accent">{tc('Checked')}</BunText> : null}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

export type BulkKind = 'type' | 'category' | 'wallet';

/** Step 2: the rows, chosen and fixed by the person, with flags for what the file left unclear. */
export function RowsStep({
  journey, refs, today, filter, onFilter, shown, onMore, onToggle, onOpenRow, onSelectAll, onClear, onBulk, onMarkChecked, onLeaveOut, unsaveable,
}: {
  journey: ImportJourney;
  refs: ImportRefs;
  today: string;
  filter: ReviewFilter;
  onFilter: (next: ReviewFilter) => void;
  shown: number;
  onMore: () => void;
  onToggle: (id: string) => void;
  onOpenRow: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onBulk: (kind: BulkKind) => void;
  onMarkChecked: () => void;
  onLeaveOut: () => void;
  /** Chosen rows that can't be saved as they are. */
  unsaveable: number;
}) {
  const tc = useCopy();
  const rowWords = useRowWords(refs, today);
  const all = filterRows(journey, 'all');
  const ids = filterRows(journey, filter);
  const chosen = new Set(journey.selected);
  const count = (which: ReviewFilter) => grouped(filterRows(journey, which).length);
  const options: { value: ReviewFilter; label: string }[] = [
    { value: 'all', label: tc('All ({count})', { count: count('all') }) },
    { value: 'needs_look', label: tc('Needs a look ({count})', { count: count('needs_look') }) },
    { value: 'duplicates', label: tc('Probably duplicates ({count})', { count: count('duplicates') }) },
    { value: 'selected', label: tc('Chosen ({count})', { count: count('selected') }) },
  ];
  const notices = fileNotices(journey);
  const selected = journey.selected.length;
  return (
    <View testID="import-rows" style={{ gap: BUN_SPACE.md }}>
      <View style={{ gap: BUN_SPACE.xxs }}>
        <PageHeading>{tc('Check the rows')}</PageHeading>
        <BunText tone="muted">{all.length === 1 ? tc('1 row in this file') : tc('{count} rows in this file', { count: grouped(all.length) })}</BunText>
      </View>
      {notices.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
          {notices.map((notice) => <FlagChip key={notice.key} label={say(tc, notice.label)} tone="info" />)}
        </View>
      ) : null}
      <TotalCard journey={journey} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
        <PillButton kind="secondary" label={tc('Select all')} onPress={onSelectAll} />
        <PillButton kind="secondary" label={tc('Clear')} disabled={selected === 0} onPress={onClear} />
      </View>
      <FilterChips label={tc('Show')} options={options} value={filter} onChange={onFilter} />
      {selected > 0 ? (
        <OutlinedCard padding="sm">
          <BunText variant="label" style={{ fontWeight: '700' }}>
            {selected === 1 ? tc('Fix the chosen row') : tc('Fix the {count} chosen rows', { count: grouped(selected) })}
          </BunText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
            <PillButton kind="secondary" label={tc('Set type')} onPress={() => onBulk('type')} />
            <PillButton kind="secondary" label={tc('Set category')} onPress={() => onBulk('category')} />
            <PillButton kind="secondary" label={tc('Set wallet')} onPress={() => onBulk('wallet')} />
            <PillButton kind="secondary" label={tc('Mark as checked')} onPress={onMarkChecked} />
          </View>
          {unsaveable > 0 ? <PillButton kind="secondary" label={tc("Leave out rows that can't be saved")} onPress={onLeaveOut} /> : null}
        </OutlinedCard>
      ) : null}
      <View role="list" accessibilityLabel={tc('Rows')}>
        {ids.slice(0, shown).map((id) => {
          const words = rowWords(journey, id);
          return words ? <ImportRowView key={id} words={words} chosen={chosen.has(id)} onToggle={() => onToggle(id)} onOpen={() => onOpenRow(id)} /> : null;
        })}
      </View>
      {ids.length === 0 ? <BunText tone="muted">{tc('No rows to show here.')}</BunText> : null}
      {ids.length > shown ? <PillButton kind="secondary" label={tc('Load more')} onPress={onMore} /> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sheets: bulk fixes and a row's own

/** A choice between expense and income, as a named radio group of chips. */
function TypeChoice({ label, value, onChange }: { label: string; value: 'expense' | 'income' | null; onChange: (next: 'expense' | 'income') => void }) {
  const tc = useCopy();
  return (
    <View role="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
      <FilterChip label={tc('Expense')} checked={value === 'expense'} onPress={() => onChange('expense')} />
      <FilterChip label={tc('Income')} checked={value === 'income'} onPress={() => onChange('income')} />
    </View>
  );
}

/** Sets the type, category or wallet of the chosen rows (or one row). */
export function BulkSheet({
  journey, kind, ids, refs, onType, onCategory, onWallet, onClose,
}: {
  journey: ImportJourney;
  kind: BulkKind;
  ids: readonly string[];
  refs: ImportRefs;
  onType: (type: 'expense' | 'income') => void;
  onCategory: (category: CategoryDto) => void;
  onWallet: (wallet: WalletChoice) => void;
  onClose: () => void;
}) {
  const tc = useCopy();
  const count = ids.length;
  const types = ids.map((id) => rowView(journey, id)?.type ?? null);
  const incomes = types.filter((type) => type === 'income').length;
  const expenses = types.filter((type) => type === 'expense').length;
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>(incomes > expenses ? 'income' : 'expense');
  const fits = categoryType === 'income' ? incomes : expenses;
  const title = kind === 'type'
    ? count === 1 ? tc('Set the type of 1 row') : tc('Set the type of {count} rows', { count: grouped(count) })
    : kind === 'category'
      ? count === 1 ? tc('Set the category of 1 row') : tc('Set the category of {count} rows', { count: grouped(count) })
      : count === 1 ? tc('Set the wallet of 1 row') : tc('Set the wallet of {count} rows', { count: grouped(count) });
  return (
    <Sheet visible onClose={onClose} title={title}>
      {kind === 'type' ? <TypeChoice label={tc('Type')} value={null} onChange={onType} /> : null}
      {kind === 'category' ? (
        <View style={{ gap: BUN_SPACE.sm }}>
          <TypeChoice label={tc('Category type')} value={categoryType} onChange={setCategoryType} />
          <BunText tone="muted">
            {fits === count
              ? tc('A category fits rows of its own type.')
              : fits === 1
                ? tc('Applies to the 1 chosen row of this type. Set the type of the others first.')
                : tc('Applies to the {count} chosen rows of this type. Set the type of the others first.', { count: grouped(fits) })}
          </BunText>
          <CategoryGrid categories={refs.categories.filter((category) => category.type === categoryType)} selectedId={null} onSelect={(id) => {
            const category = refs.categories.find((candidate) => candidate.id === id);
            if (category) onCategory(category);
          }} />
        </View>
      ) : null}
      {kind === 'wallet' ? <WalletPicker mode="single" wallets={refs.wallets} selectedId={null} onSelect={(id) => {
        const wallet = refs.wallets.find((candidate) => candidate.id === id);
        if (wallet) onWallet(wallet);
      }} /> : null}
    </Sheet>
  );
}

/** One row's own sheet: its flags, its date (when the file's was unclear), type, category, wallet, and Looks right. */
export function RowSheet({
  journey, id, refs, today, onDate, onType, onCategory, onWallet, onToggle, onChecked, onClose,
}: {
  journey: ImportJourney;
  id: string;
  refs: ImportRefs;
  today: string;
  onDate: (date: string) => void;
  onType: (type: 'expense' | 'income') => void;
  onCategory: () => void;
  onWallet: () => void;
  onToggle: () => void;
  onChecked: () => void;
  onClose: () => void;
}) {
  const tc = useCopy();
  const rowWords = useRowWords(refs, today);
  const names = useNames(refs);
  const row = rowView(journey, id);
  const words = rowWords(journey, id);
  const [day, setDay] = useState(today);
  if (!row || !words) return null;
  const chosen = journey.selected.includes(id);
  const category = row.type === 'transfer' ? null : names.category(journey, row.category_label, row.type) ?? tc('No category');
  const wallet = names.wallet(journey, row.wallet_label) ?? tc('No wallet');
  return (
    <Sheet visible onClose={onClose} title={tc('Row {row}', { row: row.ordinal })}>
      <View style={{ gap: BUN_SPACE.xxs }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: BUN_SPACE.sm }}>
          <BunText style={{ flex: 1 }}>{words.title}</BunText>
          <AmountText variant="body">{words.amount}</AmountText>
        </View>
        {words.flags.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
            {words.flags.map((flag) => <FlagChip key={flag.key} label={say(tc, flag.label)} tone={flag.tone} />)}
          </View>
        ) : null}
      </View>
      {words.saved ? <BunText tone="muted">{tc('This row is already saved.')}</BunText> : (
        <View style={{ gap: BUN_SPACE.md }}>
          <View style={{ gap: BUN_SPACE.xs }}>
            <BunText variant="label" style={{ fontWeight: '700' }}>{tc('Date')}</BunText>
            {row.occurred_on ? (
              <DateChip value={row.occurred_on} today={today} onChange={onDate} />
            ) : (
              <View style={{ gap: BUN_SPACE.xs }}>
                <BunText tone="muted">{tc("The file's date was unclear. Choose the day:")}</BunText>
                <DateChip value={day} today={today} onChange={setDay} />
                <PillButton kind="secondary" label={tc('Use this day')} onPress={() => onDate(day)} />
              </View>
            )}
          </View>
          <View style={{ gap: BUN_SPACE.xs }}>
            <BunText variant="label" style={{ fontWeight: '700' }}>{tc('Type')}</BunText>
            <TypeChoice label={tc('Type')} value={row.type === 'expense' || row.type === 'income' ? row.type : null} onChange={onType} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
            {category === null ? null : <PillButton kind="secondary" label={tc('Category: {name}', { name: category })} onPress={onCategory} />}
            <PillButton kind="secondary" label={tc('Wallet: {name}', { name: wallet })} onPress={onWallet} />
            <PillButton kind="secondary" label={chosen ? tc('Leave this row out') : tc('Choose this row')} onPress={onToggle} />
          </View>
          <PillButton label={tc('Looks right')} accessibilityHint={tc('Its date, type, category and wallet are right.')} onPress={onChecked} />
        </View>
      )}
    </Sheet>
  );
}
