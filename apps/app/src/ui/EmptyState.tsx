// An empty space (redesign R2a): art, a headline that names the space, one
// line of body and one action. The art (usually the bun's `thinking` or
// `hello` pose) is decorative, because the words already say everything.
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { DECORATIVE } from './a11y';
import { BunText } from './BunText';
import { BUN_SPACE } from './layout';
import { PillButton } from './PillButton';
import type { PillButtonKind } from './PillButton';

export type EmptyStateProps = {
  art?: ReactNode;
  /** Names the space, e.g. "No wallets yet". */
  title: string;
  /** One line on what to do next. */
  body: string;
  /** The one way forward. Primary by default; secondary when the screen already has its primary. */
  action: { label: string; onPress: () => void; kind?: PillButtonKind };
};

export function EmptyState({ art, title, body, action }: EmptyStateProps) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: BUN_SPACE.xl, paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
      {art ? <View {...DECORATIVE} style={{ marginBottom: BUN_SPACE.xs }}>{art}</View> : null}
      <BunText variant="heading" role="heading" accessibilityRole="header" style={{ textAlign: 'center' }}>{title}</BunText>
      <BunText tone="muted" style={{ textAlign: 'center' }}>{body}</BunText>
      <View style={{ marginTop: BUN_SPACE.xs, alignSelf: 'stretch' }}>
        <PillButton kind={action.kind ?? 'primary'} label={action.label} onPress={action.onPress} />
      </View>
    </View>
  );
}
