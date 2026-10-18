// Surfaces for the "Bun diary" kit (redesign R2a). Edges are a 2 pt ink
// outline instead of a shadow. Neither card fixes its height, so Thai marks and
// the largest Dynamic Type sizes grow the card instead of being clipped.
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ViewProps } from 'react-native';

import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE } from './layout';

export type CardProps = ViewProps & {
  children?: ReactNode;
  /** Inner padding from the spacing scale. Defaults to `md` (16). */
  padding?: keyof typeof BUN_SPACE;
};

function Surface({ children, padding = 'md', fill, style, ...rest }: CardProps & { fill: boolean }) {
  const colors = useBunColors();
  return (
    <View
      {...rest}
      style={[{
        backgroundColor: fill ? colors.card : 'transparent',
        borderWidth: BUN_OUTLINE.card,
        borderStyle: 'solid',
        borderColor: colors.ink,
        borderRadius: BUN_RADIUS.card,
        padding: BUN_SPACE[padding],
        gap: BUN_SPACE.sm,
      }, style]}
    >
      {children}
    </View>
  );
}

/** The cream card: the kit's default surface. Text on it uses the `card` pairs. */
export function Card(props: CardProps) {
  return <Surface {...props} fill />;
}

/**
 * The same outline with no fill, so it takes the ground beneath it (usually
 * the page). For grouping on the calm, dense screens where a cream block
 * would be too loud.
 */
export function OutlinedCard(props: CardProps) {
  return <Surface {...props} fill={false} />;
}
