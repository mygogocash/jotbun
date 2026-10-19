// Filter chips (redesign R3, moved into the kit from History): one
// single-choice filter as a row of chips in a named radio group. The chosen
// chip is an ink pill with bold words, so the choice never rests on colour
// alone. The row scrolls sideways when the chips do not fit. Every chip is at
// least 44 pt tall.
import { Pressable, ScrollView, View } from 'react-native';

import { useBunColors } from '@mobile/theme/ThemeProvider';

import { BunText } from './BunText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

export type ChipOption<T extends string> = { value: T; label: string };

export type FilterChipProps = {
  /** The chip's words, already translated; also its name. */
  readonly label: string;
  readonly checked: boolean;
  readonly onPress: () => void;
};

/** One chip of a filter: a radio that reads its label and whether it is chosen. */
export function FilterChip({ label, checked, onPress }: FilterChipProps) {
  const colors = useBunColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      aria-checked={checked}
      onPress={onPress}
      style={{
        minHeight: BUN_TOUCH,
        justifyContent: 'center',
        paddingHorizontal: BUN_SPACE.md,
        borderRadius: BUN_RADIUS.pill,
        borderWidth: BUN_OUTLINE.control,
        borderColor: colors.ink,
        backgroundColor: checked ? colors.ink : colors.card,
      }}
    >
      <BunText variant="label" tone={checked ? 'onInk' : 'ink'} style={checked ? { fontWeight: '700' } : undefined}>{label}</BunText>
    </Pressable>
  );
}

export type FilterChipsProps<T extends string> = {
  /** Names the group, and is drawn above it (hidden from screen readers, which hear the group's name). */
  readonly label: string;
  readonly options: readonly ChipOption<T>[];
  readonly value: T;
  /** Called with a newly chosen value; choosing the chip already chosen changes nothing. */
  readonly onChange: (next: T) => void;
};

/** One single-choice filter as a named radio group of chips. */
export function FilterChips<T extends string>({ label, options, value, onChange }: FilterChipsProps<T>) {
  return (
    <View role="radiogroup" accessibilityLabel={label} style={{ gap: BUN_SPACE.xxs }}>
      <BunText variant="caption" tone="muted" aria-hidden>{label}</BunText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: BUN_SPACE.xs }}>
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <FilterChip
              key={option.value}
              label={option.label}
              checked={checked}
              onPress={() => {
                if (!checked) onChange(option.value);
              }}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
