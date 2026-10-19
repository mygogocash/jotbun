// Every category as a grid of icons and names (redesign R2b), ready to sit in
// a sheet behind "More". One choice: the chosen cell gets a heavier outline
// and its name, in bold, on an ink pill. Names wrap rather than truncate, so
// long Thai and Vietnamese names and large text sizes stay whole.
import type { CategoryDto } from '@gogospend/contracts';
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { categoryName } from '@mobile/spend/v1/viewModels';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { BunText } from './BunText';
import { useLargeText } from './largeText';
import { CategoryIcon, categoryLook } from './categoryIcons';
import { BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

export type CategoryGridProps = {
  /** The categories to offer (usually one type's). Archived ones are skipped. */
  readonly categories: readonly CategoryDto[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
};

export function CategoryGrid({ categories, selectedId, onSelect }: CategoryGridProps) {
  const colors = useBunColors();
  const tc = useCopy();
  // Two columns at the accessibility text sizes, so each name stays whole.
  const large = useLargeText();
  return (
    <View role="radiogroup" accessibilityLabel={tc('Categories')} style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: BUN_SPACE.sm }}>
      {categories.filter((category) => !category.archived).map((category) => {
        const name = categoryName(category, tc);
        const checked = category.id === selectedId;
        return (
          <Pressable
            key={category.id}
            accessibilityRole="radio"
            accessibilityLabel={name}
            aria-checked={checked}
            onPress={() => onSelect(category.id)}
            style={({ pressed }) => ({
              width: large ? '50%' : '25%',
              minHeight: BUN_TOUCH,
              alignItems: 'center',
              gap: BUN_SPACE.xxs,
              paddingHorizontal: BUN_SPACE.xxs,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <CategoryIcon look={categoryLook(category, name)} size={48} selected={checked} />
            <View style={{ borderRadius: BUN_RADIUS.pill, backgroundColor: checked ? colors.ink : 'transparent', paddingHorizontal: BUN_SPACE.xs }}>
              <BunText variant="caption" tone={checked ? 'onInk' : 'ink'} style={checked ? { textAlign: 'center', fontWeight: '700' } : { textAlign: 'center' }}>{name}</BunText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
