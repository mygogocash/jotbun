// Text in the redesign's type scale and palette. The script follows the active
// locale: Thai gets Anuphan and taller leading, everything else DM Sans.
import type { TextProps } from 'react-native';

import { useActiveLocale } from '@mobile/i18n/useCopy';
import { Text } from '@mobile/theme/AppText';
import type { BunColors } from '@mobile/theme/bunPalette';
import { BUN_MAX_FONT_SCALE, bunText } from '@mobile/theme/bunType';
import type { BunScript, BunTextRole } from '@mobile/theme/bunType';
import { useBunColors } from '@mobile/theme/ThemeProvider';

export type BunTone = Extract<keyof BunColors, 'ink' | 'muted' | 'accent' | 'under' | 'over' | 'onInk'>;

export function useBunScript(): BunScript {
  return useActiveLocale() === 'th' ? 'thai' : 'latin';
}

export function BunText({ variant = 'body', tone = 'ink', style, ...rest }: TextProps & { variant?: BunTextRole; tone?: BunTone }) {
  const colors = useBunColors();
  const script = useBunScript();
  // Grows with the person's text size, up to its role's ceiling.
  return <Text maxFontSizeMultiplier={BUN_MAX_FONT_SCALE[variant]} {...rest} style={[bunText(variant, script), { color: colors[tone] }, style]} />;
}
