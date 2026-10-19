// Pieces of the Categories screen (R4 Planning, plan §6.2): the two-way type
// switch, a category tile, the name field, the colour swatches, the live chip
// preview, this month's limit (or why there is none), the archived section and
// the conflict panel. Built from the kit (src/ui), BunText and the
// useBunColors() tokens only; a category's colour comes from its data (one of
// CATEGORY_COLORS), drawn the way categoryIcons.tsx draws it.
import { NAME_MAX_CHARS } from '@gogospend/contracts';
import type { BuiltinCategoryKey, CategoryType } from '@gogospend/contracts';
import { Animated, Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import type { CategoryItem, ConflictView } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import { SWATCHES, labelLength } from '@mobile/spend/v1/redesign/planning/categoriesModel';
import { TextInput } from '@mobile/theme/AppText';
import { bunText } from '@mobile/theme/bunType';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { useSpringPop } from '@mobile/theme/useSpringPop';
import { DECORATIVE, POLITE_LIVE_REGION, useAnnouncement } from '@mobile/ui/a11y';
import { BunText, useBunScript } from '@mobile/ui/BunText';
import { CategoryIcon } from '@mobile/ui/categoryIcons';
import { FieldError } from '@mobile/ui/FieldError';
import { Glyph } from '@mobile/ui/Glyph';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';

// ---------------------------------------------------------------------------
// Expense / Income

/**
 * A category is an expense or an income one: a two-way segmented control in
 * the kit's TypeSwitch style (whose third segment, Move, has no category). A
 * radio group; the chosen one is an ink pill with a bold label.
 */
export function TypeToggle({ value, onChange, disabled = false }: { value: CategoryType; onChange: (next: CategoryType) => void; disabled?: boolean }) {
  const colors = useBunColors();
  const tc = useCopy();
  const pop = useSpringPop(value);
  const labels: Record<CategoryType, string> = { expense: tc('Expense'), income: tc('Income') };
  return (
    <View
      role="radiogroup"
      accessibilityLabel={tc('Category type')}
      style={{ flexDirection: 'row', borderColor: colors.ink, borderWidth: BUN_OUTLINE.control, borderRadius: BUN_RADIUS.pill, backgroundColor: colors.card, padding: BUN_SPACE.xxs, gap: BUN_SPACE.xxs }}
    >
      {(['expense', 'income'] as const).map((kind) => {
        const checked = kind === value;
        return (
          <Animated.View key={kind} style={[{ flex: 1 }, checked ? pop : null]}>
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={labels[kind]}
              aria-checked={checked}
              disabled={disabled}
              onPress={() => {
                if (!checked) onChange(kind);
              }}
              style={{
                minHeight: BUN_TOUCH,
                borderRadius: BUN_RADIUS.pill,
                backgroundColor: checked ? colors.ink : colors.card,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: BUN_SPACE.sm,
                paddingVertical: BUN_SPACE.xxs,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <BunText variant="label" tone={checked ? 'onInk' : 'ink'} style={checked ? { textAlign: 'center', fontWeight: '700' } : { textAlign: 'center' }}>{labels[kind]}</BunText>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The grid

/** One category in the grid: its icon (a built-in's drawing, or the initial) in its colour, its name and this month's limit. */
export function CategoryTile({ item, limit, onPress, disabled = false }: { item: CategoryItem; limit: string | null; onPress: () => void; disabled?: boolean }) {
  const tc = useCopy();
  const label = limit ? tc('{label}, {value}', { label: item.name, value: limit }) : item.name;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: '33.333%',
        minHeight: BUN_TOUCH,
        alignItems: 'center',
        gap: BUN_SPACE.xxs,
        paddingHorizontal: BUN_SPACE.xxs,
        paddingVertical: BUN_SPACE.xxs,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <CategoryIcon look={{ builtinKey: item.category.builtin_key, name: item.name, color: item.category.color }} size={48} />
      <BunText variant="caption" style={{ textAlign: 'center' }}>{item.name}</BunText>
      {limit ? <BunText variant="caption" tone="muted" style={{ textAlign: 'center', fontVariant: ['tabular-nums'] }}>{limit}</BunText> : null}
    </Pressable>
  );
}

/**
 * The archived categories of one type, collapsed under one disclosure. Each
 * says its name and offers Unarchive; none opens the form, because an
 * archived category cannot be changed.
 */
export function ArchivedSection({ items, expanded, onToggle, onUnarchive, busyId, disabled = false }: {
  items: readonly CategoryItem[]; expanded: boolean; onToggle: () => void; onUnarchive: (item: CategoryItem) => void; busyId: string | null; disabled?: boolean;
}) {
  const tc = useCopy();
  const colors = useBunColors();
  const title = tc('Archived');
  const count = String(items.length);
  return (
    <View style={{ gap: BUN_SPACE.xs }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tc('{label}, {value}', { label: title, value: count })}
        aria-expanded={expanded}
        onPress={onToggle}
        style={{ minHeight: BUN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xs, paddingVertical: BUN_SPACE.xxs }}
      >
        <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}>
          <Glyph name="chevron-right" color={colors.ink} />
        </View>
        <BunText variant="label" style={{ fontWeight: '700' }}>{title}</BunText>
        <View {...DECORATIVE} style={{ borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, paddingHorizontal: BUN_SPACE.xs }}>
          <BunText variant="caption">{count}</BunText>
        </View>
      </Pressable>
      {expanded ? (
        <View testID="categories-archived" style={{ gap: BUN_SPACE.xs }}>
          {items.map((item) => (
            <View key={item.category.id} style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm, paddingTop: BUN_SPACE.xs, borderTopWidth: BUN_OUTLINE.rule, borderColor: colors.rule }}>
              <CategoryIcon look={{ builtinKey: item.category.builtin_key, name: item.name, color: item.category.color }} size={32} />
              <BunText style={{ flex: 1 }}>{item.name}</BunText>
              <PillButton
                kind="secondary"
                label={tc('Unarchive')}
                accessibilityLabel={tc('Unarchive {name}', { name: item.name })}
                busy={busyId === item.category.id}
                disabled={disabled && busyId !== item.category.id}
                onPress={() => onUnarchive(item)}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// The form

/** The name: one line, counted the way the API counts it, never truncated. */
export function LabelField({ value, onChangeText, error, editable, placeholder }: {
  value: string; onChangeText: (next: string) => void; error: string | null; editable: boolean; placeholder?: string;
}) {
  const colors = useBunColors();
  const tc = useCopy();
  const script = useBunScript();
  const count = labelLength(value);
  const name = tc('Name');
  return (
    <View style={{ gap: BUN_SPACE.xxs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: BUN_SPACE.xs }}>
        <BunText variant="caption" tone="muted" style={{ flexShrink: 1 }}>{name}</BunText>
        <BunText variant="caption" tone="muted" accessibilityLabel={tc('{count} of {max} characters', { count, max: NAME_MAX_CHARS })} style={{ fontVariant: ['tabular-nums'] }}>
          {`${count} / ${NAME_MAX_CHARS}`}
        </BunText>
      </View>
      <TextInput
        accessibilityLabel={name}
        aria-invalid={error !== null}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        readOnly={!editable}
        multiline={false}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="done"
        style={{
          ...bunText('body', script),
          color: colors.ink,
          minHeight: BUN_TOUCH,
          paddingHorizontal: BUN_SPACE.sm,
          paddingVertical: BUN_SPACE.xs,
          borderRadius: BUN_RADIUS.chip,
          borderColor: colors.ink,
          borderWidth: error ? BUN_OUTLINE.card : BUN_OUTLINE.control,
          // Locked text stays fully readable: ink on the page colour, not faded.
          backgroundColor: editable ? colors.card : colors.background,
        }}
      />
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

/**
 * The palette as radios, each named for its colour in words. The chosen one
 * gets an ink ring and an ink dot, so the choice never rests on colour alone.
 */
export function SwatchPicker({ value, onChange, disabled = false }: { value: string | null; onChange: (color: string) => void; disabled?: boolean }) {
  const colors = useBunColors();
  const tc = useCopy();
  const label = tc('Colour');
  return (
    <View style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted">{label}</BunText>
      <View role="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xxs }}>
        {SWATCHES.map((swatch) => {
          const checked = swatch.color === value;
          return (
            <Pressable
              key={swatch.color}
              accessibilityRole="radio"
              accessibilityLabel={tc(swatch.name)}
              aria-checked={checked}
              disabled={disabled}
              onPress={() => onChange(swatch.color)}
              style={{
                minWidth: BUN_TOUCH,
                minHeight: BUN_TOUCH,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: BUN_RADIUS.pill,
                borderWidth: checked ? BUN_OUTLINE.card : 0,
                borderColor: colors.ink,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: BUN_RADIUS.pill,
                  borderWidth: BUN_OUTLINE.control,
                  borderColor: colors.ink,
                  backgroundColor: swatch.color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {checked ? <View {...DECORATIVE} style={{ width: 10, height: 10, borderRadius: BUN_RADIUS.pill, backgroundColor: colors.ink }} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The category as a chip will show it in Quick add, live as it is named and
 * coloured. Decorative: the fields above already say everything in words.
 */
export function ChipPreview({ name, iconName, builtinKey, color }: { name: string; iconName: string; builtinKey: BuiltinCategoryKey | null; color: string | null }) {
  const colors = useBunColors();
  const pop = useSpringPop(color);
  return (
    <View {...DECORATIVE} testID="category-preview" style={{ alignItems: 'center', paddingVertical: BUN_SPACE.xs }}>
      <Animated.View
        style={[{
          minHeight: BUN_TOUCH,
          flexDirection: 'row',
          alignItems: 'center',
          gap: BUN_SPACE.xs,
          paddingVertical: BUN_SPACE.xxs,
          paddingLeft: BUN_SPACE.xxs,
          paddingRight: BUN_SPACE.sm,
          borderRadius: BUN_RADIUS.pill,
          borderWidth: BUN_OUTLINE.control,
          borderColor: colors.ink,
          backgroundColor: colors.card,
          maxWidth: '100%',
        }, pop]}
      >
        <CategoryIcon look={{ builtinKey, name: iconName, color }} size={32} />
        <BunText variant="label" style={{ flexShrink: 1 }}>{name}</BunText>
      </Animated.View>
    </View>
  );
}

/** This month's limit for an expense category: part of the month's budget, in exact baht. */
export function LimitField({ value, onChangeText, error, editable, overall, preview }: {
  value: string; onChangeText: (next: string) => void; error: string | null; editable: boolean; overall: string; preview: string | null;
}) {
  const colors = useBunColors();
  const tc = useCopy();
  const script = useBunScript();
  const name = tc("This month's limit");
  return (
    <View style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted">{name}</BunText>
      <TextInput
        accessibilityLabel={name}
        aria-invalid={error !== null}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        readOnly={!editable}
        keyboardType="decimal-pad"
        returnKeyType="done"
        style={{
          ...bunText('body', script),
          color: colors.ink,
          minHeight: BUN_TOUCH,
          paddingHorizontal: BUN_SPACE.sm,
          paddingVertical: BUN_SPACE.xs,
          borderRadius: BUN_RADIUS.chip,
          borderColor: colors.ink,
          borderWidth: error ? BUN_OUTLINE.card : BUN_OUTLINE.control,
          backgroundColor: editable ? colors.card : colors.background,
          fontVariant: ['tabular-nums'],
        }}
      />
      {preview ? <BunText variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>{preview}</BunText> : null}
      <BunText variant="caption" tone="muted">{tc("Part of this month's budget of {amount}. Leave it empty for no limit.", { amount: overall })}</BunText>
      {error ? <FieldError message={error} /> : null}
    </View>
  );
}

/** No budget this month: a limit is part of one, so the budget comes first. This never creates one. */
export function NoBudgetNote({ onOpenBudget }: { onOpenBudget: () => void }) {
  const colors = useBunColors();
  const tc = useCopy();
  return (
    <View style={{ gap: BUN_SPACE.xs, padding: BUN_SPACE.sm, borderRadius: BUN_RADIUS.chip, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink }}>
      <BunText variant="label" style={{ fontWeight: '700' }}>{tc('No budget this month')}</BunText>
      <BunText>{tc("Category limits are part of a monthly budget. Set this month's budget first.")}</BunText>
      <PillButton kind="secondary" label={tc('Set a monthly budget')} onPress={onOpenBudget} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// A conflict

/** The category or the month's budget as it now is, beside yours, row by row, and Reload. */
export function ConflictPanel({ view, withYours, onReload }: { view: ConflictView; withYours: boolean; onReload: () => void }) {
  const tc = useCopy();
  const colors = useBunColors();
  useAnnouncement(view.message);
  const yoursLabel = tc('Yours');
  const serverLabel = tc('On the server');
  return (
    <View
      testID="categories-conflict"
      {...POLITE_LIVE_REGION}
      style={{ gap: BUN_SPACE.sm, padding: BUN_SPACE.md, borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.card }}
    >
      <BunText variant="heading" role="heading" accessibilityRole="header">{view.message}</BunText>
      {withYours ? (
        <View {...DECORATIVE} style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
          <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{yoursLabel}</BunText>
          <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{serverLabel}</BunText>
        </View>
      ) : null}
      {view.rows.map((row) => {
        const spoken = withYours
          ? tc('{label}. {yoursLabel}: {yours}. {serverLabel}: {server}.', { label: row.label, yoursLabel, yours: row.yours, serverLabel, server: row.server })
          : tc('{label}, {value}', { label: row.label, value: row.server });
        return (
          <View key={row.key} accessible accessibilityLabel={spoken} style={{ gap: BUN_SPACE.xxs, paddingTop: BUN_SPACE.xs, borderTopWidth: BUN_OUTLINE.rule, borderColor: colors.rule }}>
            <BunText variant="caption" tone="muted">{row.label}</BunText>
            <View style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
              {withYours ? <BunText style={{ flex: 1, fontWeight: row.differs ? '700' : '400' }}>{row.yours}</BunText> : null}
              <BunText style={{ flex: 1 }}>{row.server}</BunText>
            </View>
          </View>
        );
      })}
      <PillButton label={tc('Reload')} onPress={onReload} />
    </View>
  );
}
