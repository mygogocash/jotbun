// Pieces of the Budget screen (R4 Planning): the page, the burn-down chart
// and its words, the category limit rows, the editor's amount line and limit
// rows, the conflict panel and the Set up links. Built from the kit
// (src/ui), BunText and the useBunColors() tokens only. Nothing here moves,
// so reduced motion has nothing to take away; the chart and the bars are
// decoration, and every number they draw is said in words beside them.
import type { CategoryDto, Minor } from '@gogospend/contracts';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Polyline } from 'react-native-svg';

import { useCopy } from '@mobile/i18n/useCopy';
import { formatMinor } from '@mobile/spend/v1/money';
import { burnChart, burnDownCopy, categoryRowCopy } from '@mobile/spend/v1/redesign/planning/budgetModel';
import type { BudgetConflictRow, BurnDown, CategoryLimitRow } from '@mobile/spend/v1/redesign/planning/budgetModel';
import type { CopyLine } from '@mobile/spend/v1/redesign/shared';
import { categoryName } from '@mobile/spend/v1/viewModels';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { CategoryIcon, categoryLook } from '@mobile/ui/categoryIcons';
import { evaluateKeypad, keypadDisplay, keypadHasOperator } from '@mobile/ui/keypadExpression';
import type { KeypadState } from '@mobile/ui/keypadExpression';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { useMoneyLocale } from '../../v1/parts';

const TABULAR = { fontVariant: ['tabular-nums' as const] };

/** A category's shown name; one that is not loaded here is just "Category". */
export function useCategoryName(): (category: CategoryDto | null) => string {
  const tc = useCopy();
  return (category) => (category ? categoryName(category, tc) : tc('Category'));
}

/** The page: the stage, then the content, scrolling; a pinned footer when the editor has one. */
export function BudgetPage({ stage, footer, children }: { stage: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  return (
    <View testID="budget-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        testID="budget-scroll"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: footer ? BUN_SPACE.sm : insets.bottom + BUN_SPACE.xl, gap: BUN_SPACE.md }}
        keyboardShouldPersistTaps="handled"
      >
        {stage}
        <View style={{ paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}>{children}</View>
      </ScrollView>
      {footer}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <BunText variant="label" role="heading" accessibilityRole="header" style={{ fontWeight: '700' }}>{children}</BunText>;
}

// ---------------------------------------------------------------------------
// The month

/** The default chart width before the first layout (and in tests, which have none). */
const CHART_WIDTH = 280;
const CHART_HEIGHT = 96;
const PLOT_INSET = 2;

/**
 * Cumulative spending against the even pace, drawn for the eye: the limit as
 * a dotted line, the even pace as a dashed line from nothing to the limit,
 * and the spending so far as a solid ink line (in the over colour once it
 * has passed the limit). Hidden from screen readers: the words under it say
 * the same numbers.
 */
function BurnDownChart({ burn }: { burn: BurnDown }) {
  const colors = useBunColors();
  const [width, setWidth] = useState(CHART_WIDTH);
  const chart = burnChart(burn);
  const plotWidth = width - PLOT_INSET * 2;
  const plotHeight = CHART_HEIGHT - PLOT_INSET * 2;
  const px = (x: number) => PLOT_INSET + (x * plotWidth) / 1000;
  const py = (y: number) => PLOT_INSET + plotHeight - (y * plotHeight) / 1000;
  const over = BigInt(burn.spentMinor) > BigInt(burn.limitMinor);
  const spent = chart.spent.map(([x, y]) => `${px(x)},${py(y)}`).join(' ');
  return (
    <View
      testID="budget-burn-down"
      {...DECORATIVE}
      onLayout={(event) => {
        const next = event.nativeEvent.layout.width;
        if (next > 0 && next !== width) setWidth(next);
      }}
      style={{ height: CHART_HEIGHT, borderBottomWidth: BUN_OUTLINE.control, borderLeftWidth: BUN_OUTLINE.control, borderColor: colors.ink }}
    >
      <Svg width={width} height={CHART_HEIGHT} viewBox={`0 0 ${width} ${CHART_HEIGHT}`}>
        <Line x1={px(0)} y1={py(chart.limitY)} x2={px(1000)} y2={py(chart.limitY)} stroke={colors.rule} strokeWidth={2} strokeDasharray="2 4" />
        <Line x1={px(chart.even[0][0])} y1={py(chart.even[0][1])} x2={px(chart.even[1][0])} y2={py(chart.even[1][1])} stroke={colors.muted} strokeWidth={1.5} strokeDasharray="6 4" />
        {chart.spent.length > 1 ? (
          <Polyline points={spent} fill="none" stroke={over ? colors.over : colors.ink} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
      </Svg>
    </View>
  );
}

/** The burn-down card: the chart, then its numbers in words. */
export function BurnDownCard({ burn }: { burn: BurnDown }) {
  const tc = useCopy();
  const locale = useMoneyLocale();
  const lines = burnDownCopy(burn, locale).map((line) => tc(line.text, line.values));
  return (
    <Card>
      <SectionTitle>{tc('Spending so far')}</SectionTitle>
      {burn.phase === 'before' ? null : <BurnDownChart burn={burn} />}
      <View style={{ gap: BUN_SPACE.xxs }}>
        {lines.map((line, index) => <BunText key={line} variant={index === 0 ? 'body' : 'caption'} tone={index === 0 ? 'ink' : 'muted'} style={TABULAR}>{line}</BunText>)}
      </View>
    </Card>
  );
}

/** One limit: the category, spent of limit, a small bar (decoration) and the state in words. Over is said kindly. */
function LimitUse({ row }: { row: CategoryLimitRow }) {
  const tc = useCopy();
  const colors = useBunColors();
  const locale = useMoneyLocale();
  const nameOf = useCategoryName();
  const name = nameOf(row.category);
  const copy = categoryRowCopy(row, locale);
  const say = (line: CopyLine) => tc(line.text, line.values);
  const amounts = say(copy.amounts);
  const status = say(copy.status);
  const tight = row.state === 'tight' ? tc('Tight') : null;
  const reassurance = copy.reassurance ? say(copy.reassurance) : null;
  const over = row.state === 'over';
  const label = [name, amounts, status, tight, reassurance].filter((part): part is string => part !== null).join(', ');
  return (
    <View testID={`budget-category-${row.categoryId}`} accessible accessibilityLabel={label} style={{ gap: BUN_SPACE.xxs, paddingTop: BUN_SPACE.xs, borderTopWidth: BUN_OUTLINE.rule, borderColor: colors.rule }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xs }}>
        {row.category ? <CategoryIcon look={categoryLook(row.category, name)} size={32} /> : null}
        <View style={{ flex: 1, gap: BUN_SPACE.xxs }}>
          <BunText variant="label" style={{ fontWeight: '700' }}>{name}</BunText>
          <BunText variant="caption" style={TABULAR}>{amounts}</BunText>
        </View>
      </View>
      <View
        testID={`budget-bar-${row.categoryId}`}
        {...DECORATIVE}
        style={{ height: 10, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, backgroundColor: colors.background, overflow: 'hidden' }}
      >
        <View style={{ width: `${row.spentPermille / 10}%`, height: '100%', backgroundColor: over ? colors.over : colors.under }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: BUN_SPACE.xs }}>
        {/* Over is the one place the over colour shows, and it is said in words as well. */}
        <BunText variant="caption" tone={over ? 'over' : 'muted'} style={[TABULAR, over ? { fontWeight: '700' } : null]}>{status}</BunText>
        {tight ? <BunText variant="caption" tone="ink" style={{ fontWeight: '700' }}>{tight}</BunText> : null}
        {reassurance ? <BunText variant="caption" tone="ink">{reassurance}</BunText> : null}
      </View>
    </View>
  );
}

export function CategoryLimitsCard({ rows }: { rows: readonly CategoryLimitRow[] }) {
  const tc = useCopy();
  return (
    <Card>
      <SectionTitle>{tc('Category limits')}</SectionTitle>
      {rows.length === 0 ? <BunText tone="muted">{tc('No category limits this month.')}</BunText> : rows.map((row) => <LimitUse key={row.categoryId} row={row} />)}
    </Card>
  );
}

/** Wallets and Categories, until the Me tab holds them. */
export function SetUpSection({ onWallets, onCategories }: { onWallets: () => void; onCategories: () => void }) {
  const tc = useCopy();
  return (
    <View style={{ gap: BUN_SPACE.sm }}>
      <SectionTitle>{tc('Set up')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
        <PillButton kind="secondary" label={tc('Wallets')} onPress={onWallets} />
        <PillButton kind="secondary" label={tc('Categories')} onPress={onCategories} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The editor

/**
 * The amount being typed, exact, as Record's edit shows it: what was typed
 * above a sum or a decimal, and the worked-out amount, spoken as
 * "{label}, {amount}" (or the sum and its result). A polite live region.
 */
export function EditorAmount({ label, keypad }: { label: string; keypad: KeypadState }) {
  const tc = useCopy();
  const locale = useMoneyLocale();
  const display = keypadDisplay(keypad);
  const sum = keypadHasOperator(keypad);
  const outcome = evaluateKeypad(keypad, { allowZero: true });
  const result = outcome.ok ? formatMinor(outcome.minor, locale) : null;
  const value = sum ? (result ? `${display} = ${result}` : display) : (result ?? formatMinor('0', locale));
  return (
    <View testID="budget-amount" {...POLITE_LIVE_REGION} accessible accessibilityLabel={tc('{label}, {value}', { label, value })} style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted">{label}</BunText>
      {sum || display.includes('.') ? <BunText variant="label" tone="muted" style={TABULAR}>{display}</BunText> : null}
      <BunText variant="hero" style={TABULAR}>{result ?? (sum ? display : formatMinor('0', locale))}</BunText>
    </View>
  );
}

/** A category in the limits list: a radio whose name is the category and its limit ("Food, No limit"). */
export function LimitChoice({ category, value, checked, disabled, onPress }: { category: CategoryDto; value: string; checked: boolean; disabled: boolean; onPress: () => void }) {
  const tc = useCopy();
  const colors = useBunColors();
  const nameOf = useCategoryName();
  const name = nameOf(category);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={tc('{label}, {value}', { label: name, value })}
      aria-checked={checked}
      accessibilityState={{ checked, disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: BUN_TOUCH,
        flexDirection: 'row',
        alignItems: 'center',
        gap: BUN_SPACE.xs,
        paddingVertical: BUN_SPACE.xxs,
        paddingHorizontal: BUN_SPACE.xs,
        borderRadius: BUN_RADIUS.chip,
        borderWidth: checked ? BUN_OUTLINE.card : BUN_OUTLINE.control,
        borderColor: colors.ink,
        backgroundColor: colors.card,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <CategoryIcon look={categoryLook(category, name)} size={32} selected={checked} />
      <View style={{ flex: 1 }}>
        {/* Bold as well as outlined, so the choice never rests on the outline alone. */}
        <BunText variant="label" style={checked ? { fontWeight: '700' } : undefined}>{name}</BunText>
        {category.archived ? <BunText variant="caption" tone="muted">{tc('Archived')}</BunText> : null}
      </View>
      <BunText variant="label" style={[TABULAR, checked ? { fontWeight: '700' } : null]}>{value}</BunText>
    </Pressable>
  );
}

/** "Yours" against "On the server", figure by figure. Reload is the footer's. */
export function BudgetConflictPanel({ rows, nameOf }: { rows: readonly BudgetConflictRow[]; nameOf: (categoryId: string) => string }) {
  const tc = useCopy();
  const colors = useBunColors();
  const locale = useMoneyLocale();
  const heading = tc('This budget changed on another device.');
  useAnnouncement(heading);
  const shown = (minor: Minor | null) => (minor === null ? tc('No limit') : formatMinor(minor, locale));
  const yoursLabel = tc('Yours');
  const serverLabel = tc('On the server');
  return (
    <View
      testID="budget-conflict"
      {...POLITE_LIVE_REGION}
      style={{ gap: BUN_SPACE.sm, padding: BUN_SPACE.md, borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.card }}
    >
      <BunText variant="heading" role="heading" accessibilityRole="header">{heading}</BunText>
      <BunText tone="muted">{tc("Reload to see it. Your changes here won't be saved.")}</BunText>
      <View aria-hidden style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
        <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{yoursLabel}</BunText>
        <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{serverLabel}</BunText>
      </View>
      {rows.map((row) => {
        const label = row.categoryId === null ? tc('Monthly total') : nameOf(row.categoryId);
        const yours = shown(row.yoursMinor);
        const server = shown(row.serverMinor);
        return (
          <View
            key={row.key}
            accessible
            accessibilityLabel={tc('{label}. {yoursLabel}: {yours}. {serverLabel}: {server}.', { label, yoursLabel, yours, serverLabel, server })}
            style={{ gap: BUN_SPACE.xxs, paddingTop: BUN_SPACE.xs, borderTopWidth: BUN_OUTLINE.rule, borderColor: colors.rule }}
          >
            <BunText variant="caption" tone="muted">{label}</BunText>
            <View style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
              {/* A figure that differs is bold, so the difference never rests on colour. */}
              <BunText style={[{ flex: 1, fontWeight: row.differs ? '700' : '400' }, TABULAR]}>{yours}</BunText>
              <BunText style={[{ flex: 1, fontWeight: row.differs ? '700' : '400' }, TABULAR]}>{server}</BunText>
            </View>
          </View>
        );
      })}
    </View>
  );
}
