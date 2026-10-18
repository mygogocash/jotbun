// The quick category row on the entry sheet (redesign R2b): the top three
// categories, then More. The list arrives already ranked by recent use
// (ranking lives with the screen's view model). A category picked from the
// full grid stays visible in place of the third chip, so the choice is always
// on screen.
import type { CategoryDto } from '@gogospend/contracts';
import { Animated, Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { categoryName } from '@mobile/spend/v1/viewModels';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { useSpringPop } from '@mobile/theme/useSpringPop';

import { BunText } from './BunText';
import { CategoryIcon, categoryLook } from './categoryIcons';
import { Glyph } from './entryKitPrivate';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

export type CategoryChipsProps = {
  /** Already ranked, most used first. Archived categories are skipped. */
  readonly ranked: readonly CategoryDto[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onMore: () => void;
  readonly disabled?: boolean;
};

const SHOWN = 3;

/** The chips shown: the top three, with the chosen one kept in view. */
export function visibleChips(ranked: readonly CategoryDto[], selectedId: string | null): CategoryDto[] {
  const live = ranked.filter((category) => !category.archived);
  const top = live.slice(0, SHOWN);
  const chosen = selectedId === null ? undefined : live.find((category) => category.id === selectedId);
  if (!chosen || top.includes(chosen)) return top;
  return top.length < SHOWN ? [...top, chosen] : [...top.slice(0, SHOWN - 1), chosen];
}

export function CategoryChips({ ranked, selectedId, onSelect, onMore, disabled = false }: CategoryChipsProps) {
  const colors = useBunColors();
  const tc = useCopy();
  const pop = useSpringPop(selectedId);
  const chips = visibleChips(ranked, selectedId);
  const pill = { minHeight: BUN_TOUCH, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, flexDirection: 'row' as const, alignItems: 'center' as const, gap: BUN_SPACE.xs, paddingVertical: BUN_SPACE.xxs, paddingLeft: BUN_SPACE.xxs, paddingRight: BUN_SPACE.sm, opacity: disabled ? 0.5 : 1 };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs, alignItems: 'center' }}>
      <View role="radiogroup" accessibilityLabel={tc('Category')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: BUN_SPACE.xs }}>
        {chips.map((category) => {
          const name = categoryName(category, tc);
          const checked = category.id === selectedId;
          return (
            <Animated.View key={category.id} style={checked ? pop : null}>
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={name}
                aria-checked={checked}
                disabled={disabled}
                onPress={() => onSelect(category.id)}
                style={{ ...pill, backgroundColor: checked ? colors.ink : colors.card }}
              >
                <CategoryIcon look={categoryLook(category, name)} size={32} />
                <BunText variant="label" tone={checked ? 'onInk' : 'ink'}>{name}</BunText>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tc('More categories')}
        disabled={disabled}
        onPress={onMore}
        style={{ ...pill, paddingLeft: BUN_SPACE.sm, backgroundColor: colors.background }}
      >
        <Glyph name="dots" color={colors.ink} />
        <BunText variant="label">{tc('More')}</BunText>
      </Pressable>
    </View>
  );
}
