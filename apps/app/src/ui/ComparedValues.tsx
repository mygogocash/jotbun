// "Yours" beside "On the server", for a field that changed on another device
// (redesign R8). Side by side under one pair of column heads; at the
// accessibility text sizes the two stack, each named, so an amount stays whole.
// The heads are hidden from screen readers: each row speaks both names itself.
import type { StyleProp, TextStyle } from 'react-native';
import { View } from 'react-native';

import { DECORATIVE } from './a11y';
import { BunText } from './BunText';
import { useLargeText } from './largeText';
import { BUN_SPACE } from './layout';

/** The column heads, drawn once above the rows; at large text there are none, since each value is named. */
export function ComparedHeads({ yoursLabel, serverLabel, showYours = true }: { yoursLabel: string; serverLabel: string; showYours?: boolean }) {
  const large = useLargeText();
  if (large) return null;
  return (
    <View {...DECORATIVE} style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
      {showYours ? <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{yoursLabel}</BunText> : null}
      <BunText variant="label" style={{ flex: 1, fontWeight: '700' }}>{serverLabel}</BunText>
    </View>
  );
}

export type ComparedValuesProps = {
  readonly yoursLabel: string;
  readonly serverLabel: string;
  /** This device's value; null when there is none to show. */
  readonly yours: string | null;
  readonly server: string;
  /** Whether the Yours column is drawn at all (side by side, an empty cell keeps the columns lined up). */
  readonly showYours?: boolean;
  readonly yoursStyle?: StyleProp<TextStyle>;
  readonly serverStyle?: StyleProp<TextStyle>;
};

/** One field's two values: side by side, or at large text one under the other, each under its name. */
export function ComparedValues({ yoursLabel, serverLabel, yours, server, showYours = true, yoursStyle, serverStyle }: ComparedValuesProps) {
  const large = useLargeText();
  if (large) {
    return (
      <View style={{ gap: BUN_SPACE.xxs }}>
        {showYours && yours ? (
          <>
            <BunText variant="label" style={{ fontWeight: '700' }}>{yoursLabel}</BunText>
            <BunText style={yoursStyle}>{yours}</BunText>
          </>
        ) : null}
        <BunText variant="label" style={{ fontWeight: '700' }}>{serverLabel}</BunText>
        <BunText style={serverStyle}>{server}</BunText>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', gap: BUN_SPACE.sm }}>
      {showYours ? <BunText style={[{ flex: 1 }, yoursStyle]}>{yours ?? ''}</BunText> : null}
      <BunText style={[{ flex: 1 }, serverStyle]}>{server}</BunText>
    </View>
  );
}
