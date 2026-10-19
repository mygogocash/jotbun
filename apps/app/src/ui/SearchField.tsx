// A search field (redesign R3, moved into the kit from History): one line,
// a named `searchbox`, searched as the person types. With text in it, a
// secondary "Clear search" pill empties it. Ink on cream with an ink outline,
// at least 44 pt tall, and Thai keeps its taller leading.
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { TextInput } from '@mobile/theme/AppText';
import { bunText } from '@mobile/theme/bunType';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { useBunScript } from './BunText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';
import { PillButton } from './PillButton';

export type SearchFieldProps = {
  /** Names the field for screen readers, e.g. "Search entries". */
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (next: string) => void;
  /** What can be searched, e.g. "Category, merchant or note". */
  readonly placeholder?: string;
  /** Defaults to "Clear search". */
  readonly clearLabel?: string;
};

export function SearchField({ label, value, onChangeText, placeholder, clearLabel }: SearchFieldProps) {
  const colors = useBunColors();
  const tc = useCopy();
  const script = useBunScript();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xs }}>
      <TextInput
        accessibilityLabel={label}
        role="searchbox"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        autoCorrect={false}
        style={{
          ...bunText('body', script),
          flex: 1,
          color: colors.ink,
          minHeight: BUN_TOUCH,
          paddingHorizontal: BUN_SPACE.sm,
          paddingVertical: BUN_SPACE.xs,
          borderRadius: BUN_RADIUS.pill,
          borderColor: colors.ink,
          borderWidth: BUN_OUTLINE.control,
          backgroundColor: colors.card,
        }}
      />
      {value.length > 0 ? <PillButton kind="secondary" label={clearLabel ?? tc('Clear search')} onPress={() => onChangeText('')} /> : null}
    </View>
  );
}
