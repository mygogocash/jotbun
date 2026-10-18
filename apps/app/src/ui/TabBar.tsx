// The floating tab bar (redesign R2a): an ink pill of tabs with a cream round
// add button in the centre. The tab set itself is owner decision D7, so the
// items come from the caller. The bar sits in the layout above the bottom
// safe area; where it floats over a scrolling page, the page reserves room
// for it.
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from './a11y';
import { BunText } from './BunText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

/** An icon, or a function that draws one in the colour of its ground. */
export type TabBarIcon = ReactNode | ((state: { selected: boolean; color: string }) => ReactNode);
export type TabBarItem = { key: string; label: string; icon: TabBarIcon };

export type TabBarProps = {
  items: readonly TabBarItem[];
  /** The key of the current tab. */
  active: string;
  onSelect: (key: string) => void;
  onAdd: () => void;
  /** What the add button does, e.g. "Add a record". */
  addLabel: string;
};

/** The add button's diameter; above the 44 pt floor so it reads as the centre. */
const ADD_SIZE = 56;

function Tab({ item, selected, onSelect }: { item: TabBarItem; selected: boolean; onSelect: (key: string) => void }) {
  const colors = useBunColors();
  const color = selected ? colors.ink : colors.onInk;
  const icon = typeof item.icon === 'function' ? item.icon({ selected, color }) : item.icon;
  return (
    <Pressable
      role="tab"
      accessibilityRole="tab"
      accessibilityLabel={item.label}
      accessibilityState={{ selected }}
      aria-selected={selected}
      onPress={() => onSelect(item.key)}
      style={{
        flex: 1,
        minHeight: BUN_TOUCH,
        minWidth: BUN_TOUCH,
        paddingVertical: BUN_SPACE.xxs,
        paddingHorizontal: BUN_SPACE.xxs,
        borderRadius: BUN_RADIUS.pill,
        backgroundColor: selected ? colors.card : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      {icon ? <View {...DECORATIVE}>{icon}</View> : null}
      <BunText variant="micro" tone={selected ? 'ink' : 'onInk'} style={{ textAlign: 'center', fontWeight: selected ? '700' : '500' }}>{item.label}</BunText>
    </Pressable>
  );
}

export function TabBar({ items, active, onSelect, onAdd, addLabel }: TabBarProps) {
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const middle = Math.ceil(items.length / 2);
  const tab = (item: TabBarItem) => <Tab key={item.key} item={item} selected={item.key === active} onSelect={onSelect} />;
  return (
    <View testID="tab-bar" style={{ paddingHorizontal: BUN_SPACE.md, paddingTop: BUN_SPACE.xs, paddingBottom: insets.bottom + BUN_SPACE.xs }}>
      <View
        role="tablist"
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: BUN_SPACE.xxs,
          padding: BUN_SPACE.xs,
          borderRadius: BUN_RADIUS.pill,
          backgroundColor: colors.ink,
        }}
      >
        {items.slice(0, middle).map(tab)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={addLabel}
          onPress={onAdd}
          style={{
            minHeight: ADD_SIZE,
            minWidth: ADD_SIZE,
            borderRadius: BUN_RADIUS.pill,
            backgroundColor: colors.card,
            borderWidth: BUN_OUTLINE.card,
            borderColor: colors.ink,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View {...DECORATIVE}>
            <BunText variant="title" tone="ink">+</BunText>
          </View>
        </Pressable>
        {items.slice(middle).map(tab)}
      </View>
    </View>
  );
}
