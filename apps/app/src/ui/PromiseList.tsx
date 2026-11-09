// Plain promises, one per row (redesign R2a), for privacy and trust screens:
// "Jotbun never asks for your bank password." Each row is a list item; its
// icon is decorative because the sentence carries the meaning.
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { DECORATIVE } from './a11y';
import { BunText } from './BunText';
import { BUN_SPACE } from './layout';

export type PromiseItem = {
  key: string;
  /** One plain sentence. */
  text: string;
  /** Defaults to a tick. */
  icon?: ReactNode;
};
export type PromiseListProps = { items: readonly PromiseItem[]; title?: string };

export function PromiseList({ items, title }: PromiseListProps) {
  return (
    <View style={{ gap: BUN_SPACE.sm }}>
      {title ? <BunText variant="heading" role="heading" accessibilityRole="header">{title}</BunText> : null}
      <View role="list" accessibilityRole="list" style={{ gap: BUN_SPACE.sm }}>
        {items.map((item) => (
          <View key={item.key} role="listitem" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: BUN_SPACE.sm }}>
            <View {...DECORATIVE} style={{ minWidth: BUN_SPACE.lg, alignItems: 'center' }}>
              {item.icon ?? <BunText variant="body" style={{ fontWeight: '700' }}>✓</BunText>}
            </View>
            <BunText style={{ flex: 1 }}>{item.text}</BunText>
          </View>
        ))}
      </View>
    </View>
  );
}
