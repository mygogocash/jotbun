// A field's problem said in words, with a mark beside it (redesign R2b), under
// a note field or a wallet choice. It is an alert, read politely as it
// appears. Ink, not red: red only ever means over budget, and the words and
// the mark carry the meaning, so colour is never the only signal.
import { View } from 'react-native';

import { useBunColors } from '@mobile/theme/ThemeProvider';

import { BunText } from './BunText';
import { Glyph } from './Glyph';
import { BUN_SPACE } from './layout';

export type FieldErrorProps = {
  /** The problem, already translated: "Notes are up to 500 characters." */
  readonly message: string;
};

export function FieldError({ message }: FieldErrorProps) {
  const colors = useBunColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: BUN_SPACE.xs }}>
      <Glyph name="alert" size={18} color={colors.ink} />
      <BunText accessibilityRole="alert" aria-live="polite" variant="caption" tone="ink" style={{ flex: 1, fontWeight: '700' }}>{message}</BunText>
    </View>
  );
}
