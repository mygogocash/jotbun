// The kit's button (redesign R2a): a full pill at least 44 pt tall.
//
// Use AT MOST ONE `primary` per screen. The ink fill is the screen's single
// main action ("Save entry", "Add your first wallet"); everything else is
// `secondary`, an ink outline with no fill. Two ink pills side by side make
// the person choose between equals, which is the opposite of what the fill is
// for. A confirm sheet over a screen counts as its own screen.
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from './a11y';
import { BunText } from './BunText';
import type { BunTone } from './BunText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

export type PillButtonKind = 'primary' | 'secondary';

export type PillButtonProps = {
  label: string;
  onPress: () => void;
  /** At most one primary per screen; see the note at the top of this file. */
  kind?: PillButtonKind;
  /** Working: presses are ignored, the button is marked busy and a spinner shows. */
  busy?: boolean;
  /** What to say while busy, e.g. "Saving…". Defaults to `label`. */
  busyLabel?: string;
  disabled?: boolean;
  /** Why it is disabled, shown under the button and given as the hint. */
  disabledReason?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

export function PillButton({
  label, onPress, kind = 'primary', busy = false, busyLabel, disabled = false, disabledReason, accessibilityLabel, accessibilityHint, testID,
}: PillButtonProps) {
  const colors = useBunColors();
  const inactive = disabled || busy;
  const filled = kind === 'primary' && !disabled;
  const tone: BunTone = disabled ? 'muted' : filled ? 'onInk' : 'ink';
  const shown = busy && busyLabel ? busyLabel : label;
  const reason = disabled && disabledReason ? disabledReason : undefined;
  return (
    <View style={{ gap: BUN_SPACE.xxs }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={busy && busyLabel ? busyLabel : accessibilityLabel}
        accessibilityHint={reason ?? accessibilityHint}
        accessibilityState={{ disabled, busy }}
        aria-disabled={disabled}
        aria-busy={busy}
        disabled={inactive}
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: BUN_TOUCH,
          minWidth: BUN_TOUCH,
          paddingHorizontal: BUN_SPACE.lg,
          paddingVertical: BUN_SPACE.xs,
          borderRadius: BUN_RADIUS.pill,
          borderWidth: BUN_OUTLINE.control,
          borderStyle: 'solid',
          borderColor: disabled ? colors.muted : colors.ink,
          backgroundColor: filled ? colors.ink : 'transparent',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: BUN_SPACE.xs,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {busy ? (
          <View {...DECORATIVE}>
            <ActivityIndicator size="small" color={filled ? colors.onInk : colors.ink} />
          </View>
        ) : null}
        <BunText variant="label" tone={tone} style={{ textAlign: 'center', flexShrink: 1 }}>{shown}</BunText>
      </Pressable>
      {reason ? <BunText variant="caption" tone="muted" style={{ textAlign: 'center' }}>{reason}</BunText> : null}
    </View>
  );
}
