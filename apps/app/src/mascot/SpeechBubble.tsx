// The bun saying one fact (redesign R1): a small bun beside a cream bubble with
// an ink outline. Honours the bun intensity: only `full` shows bubbles.
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BunText } from '@mobile/ui/BunText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE } from '@mobile/ui/layout';
import { Bun } from './Bun';
import { showsBubble } from './bunIntensity';
import { useBunIntensity } from './BunIntensityProvider';
import { DEFAULT_BUN_POSE, type BunPoseName } from './poses';

export type SpeechBubbleProps = {
  /** Exactly one fact about the person's own numbers, already translated. */
  readonly fact: string;
  /** A substring of `fact` (usually the amount), drawn in accent. Only its first match is marked. */
  readonly highlight?: string;
  readonly pose?: BunPoseName;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
};

const TAIL = 10;

function splitFact(fact: string, highlight: string | undefined) {
  const at = highlight ? fact.indexOf(highlight) : -1;
  if (!highlight || at < 0) return null;
  return { before: fact.slice(0, at), match: highlight, after: fact.slice(at + highlight.length) };
}

/**
 * One fact, e.g. "Lunch done at ฿60. Food is at 58% with 13 days to go.", with
 * the amount highlighted. The bubble's text is read by screen readers; the bun
 * beside it is decoration.
 *
 * The bubble is never the only place information lives. Every fact it states
 * must also appear elsewhere on the same screen, because a person who sets the
 * bun to Quiet or Off never sees a bubble. Facts only: no advice, no shaming.
 */
export function SpeechBubble({ fact, highlight, pose = DEFAULT_BUN_POSE, style, testID }: SpeechBubbleProps) {
  const colors = useBunColors();
  const { intensity } = useBunIntensity();
  if (!showsBubble(intensity)) return null;

  const parts = splitFact(fact, highlight);
  const bubble: ViewStyle = {
    flexShrink: 1,
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderWidth: BUN_OUTLINE.card,
    borderRadius: BUN_RADIUS.card,
    paddingHorizontal: BUN_SPACE.sm,
    paddingVertical: BUN_SPACE.xs,
  };
  // A small square turned 45° whose two outlined sides point back at the bun.
  const tail: ViewStyle = {
    position: 'absolute',
    left: -TAIL / 2 - BUN_OUTLINE.card / 2,
    bottom: BUN_SPACE.xs,
    width: TAIL,
    height: TAIL,
    backgroundColor: colors.card,
    borderColor: colors.ink,
    borderLeftWidth: BUN_OUTLINE.card,
    borderBottomWidth: BUN_OUTLINE.card,
    transform: [{ rotate: '45deg' }],
  };

  return (
    <View testID={testID} style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: BUN_SPACE.sm }, style]}>
      <Bun pose={pose} size="s" />
      <View style={bubble}>
        <View style={tail} />
        <BunText variant="label">
          {parts ? (
            <>
              {parts.before || null}
              <BunText variant="label" tone="accent" style={{ fontWeight: '700' }}>{parts.match}</BunText>
              {parts.after || null}
            </>
          ) : fact}
        </BunText>
      </View>
    </View>
  );
}
