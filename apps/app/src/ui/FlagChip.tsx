// An inline "check this" marker (redesign R2a), for import rows and other
// machine guesses: "Date unclear", "Total is rounded". It is information,
// not a control, so it has no touch target. The tone shows twice, as a mark
// and as the spoken prefix, so it never rests on colour alone; neither tone
// uses red, which means only over budget.
import { View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from './a11y';
import { BunText } from './BunText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE } from './layout';

export type FlagChipTone = 'warning' | 'info';
export type FlagChipProps = {
  /** What to check, in a few words. */
  label: string;
  /** `warning` (default): something may be wrong. `info`: worth knowing. */
  tone?: FlagChipTone;
};

const SPOKEN: Readonly<Record<FlagChipTone, string>> = { warning: 'Check this: {label}', info: 'Note: {label}' };
const MARK: Readonly<Record<FlagChipTone, string>> = { warning: '!', info: 'i' };

export function FlagChip({ label, tone = 'warning' }: FlagChipProps) {
  const tc = useCopy();
  const colors = useBunColors();
  const ink = tone === 'warning' ? 'ink' : 'accent';
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={tc(SPOKEN[tone], { label })}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: BUN_SPACE.xxs,
        paddingHorizontal: BUN_SPACE.xs,
        paddingVertical: 2,
        borderRadius: BUN_RADIUS.chip,
        borderWidth: BUN_OUTLINE.control,
        borderStyle: 'solid',
        borderColor: colors[ink],
      }}
    >
      <View {...DECORATIVE}>
        <BunText variant="caption" tone={ink} style={{ fontWeight: '700' }}>{MARK[tone]}</BunText>
      </View>
      <BunText variant="caption" tone={ink} style={{ flexShrink: 1 }}>{label}</BunText>
    </View>
  );
}
