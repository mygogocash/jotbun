// The floating tab bar (redesign R2a): an ink pill of tabs with a cream round
// add button in the centre. The tab set itself is owner decision D7, so the
// items come from the caller. The bar sits in the layout above the bottom
// safe area; where it floats over a scrolling page, the page reserves room
// for it.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBunColors } from '@mobile/theme/ThemeProvider';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { DECORATIVE } from './a11y';
import { BunText } from './BunText';
import { LARGEST_STANDARD_SCALE } from './largeTextScale';
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
      // As Apple's own tab bars: the label stops at the largest standard size,
      // so it stays whole on its line, and a long press shows it large (iOS).
      accessibilityShowsLargeContentViewer
      accessibilityLargeContentTitle={item.label}
      aria-selected={selected}
      onPress={() => {
        if (!selected) playHaptic('tabChange');
        onSelect(item.key);
      }}
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
      <BunText variant="micro" tone={selected ? 'ink' : 'onInk'} maxFontSizeMultiplier={LARGEST_STANDARD_SCALE} style={{ textAlign: 'center', fontWeight: selected ? '700' : '500' }}>{item.label}</BunText>
    </Pressable>
  );
}

export function TabBar({ items, active, onSelect, onAdd, addLabel }: TabBarProps) {
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const middle = Math.ceil(items.length / 2);
  const [space, setSpace] = useState<{ x: number; y: number } | null>(null);
  const tab = (item: TabBarItem) => <Tab key={item.key} item={item} selected={item.key === active} onSelect={onSelect} />;
  // A tablist holds only tabs, so the add button is not inside it: the list
  // keeps an empty, hidden space in its centre, and the button is drawn over
  // that space from outside the list. It looks the same, and screen readers
  // meet the tabs, then Add.
  return (
    <View testID="tab-bar" style={{ paddingHorizontal: BUN_SPACE.md, paddingTop: BUN_SPACE.xs, paddingBottom: insets.bottom + BUN_SPACE.xs }}>
      <View>
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
          <View
            {...DECORATIVE}
            testID="tab-bar-add-space"
            onLayout={(event) => setSpace({ x: event.nativeEvent.layout.x, y: event.nativeEvent.layout.y })}
            style={{ width: ADD_SIZE, height: ADD_SIZE }}
          />
          {items.slice(middle).map(tab)}
        </View>
        {/* Over the space once it is measured (an odd number of tabs puts it off centre); centred until then. */}
        <View
          pointerEvents="box-none"
          style={space
            ? { position: 'absolute', top: space.y, left: space.x }
            : { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={addLabel}
            accessibilityShowsLargeContentViewer
            accessibilityLargeContentTitle={addLabel}
            onPress={() => {
              playHaptic('sheetOpen');
              onAdd();
            }}
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
        </View>
      </View>
    </View>
  );
}
