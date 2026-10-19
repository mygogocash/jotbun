// An empty space (redesign R2a): art, a headline that names the space, one
// line of body and, optionally, one action. The art (usually the bun's
// `thinking` or `hello` pose) is decorative, because the words already say
// everything.
//
// The art space collapses when there is no art, and when the bun intensity is
// Off: an Off bun draws nothing, so its wrapper (and the gap it keeps) is not
// drawn either. Quiet keeps the bun, because empty states are where Quiet
// still shows it.
//
// Leave the action out when what to do next sits right under the empty state,
// such as Home's first-wallet form: the view keeps one primary action.
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { showsBun } from '@mobile/mascot/bunIntensity';
import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
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
  /** The one way forward. Primary by default; secondary when the screen already has its primary. Leave out when the way forward is already on screen. */
  action?: { label: string; onPress: () => void; kind?: PillButtonKind };
};

export function EmptyState({ art, title, body, action }: EmptyStateProps) {
  const { intensity } = useBunIntensity();
  const drawArt = Boolean(art) && showsBun(intensity);
  return (
    <View style={{ alignItems: 'center', paddingVertical: BUN_SPACE.xl, paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
      {drawArt ? <View {...DECORATIVE} testID="empty-state-art" style={{ marginBottom: BUN_SPACE.xs }}>{art}</View> : null}
      <BunText variant="heading" role="heading" accessibilityRole="header" style={{ textAlign: 'center' }}>{title}</BunText>
      <BunText tone="muted" style={{ textAlign: 'center' }}>{body}</BunText>
      {action ? (
        <View style={{ marginTop: BUN_SPACE.xs, alignSelf: 'stretch' }}>
          <PillButton kind={action.kind ?? 'primary'} label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}
