// The entry keypad (redesign R2b): digits, 000, a decimal point, delete and
// clear, and + − × ÷ =. Presentational: it reports keys and the screen keeps
// the sum with `applyKey` from keypadExpression. It is made of buttons only, so
// it never opens the system keyboard. Every key is at least 56 pt and gives a
// light tick through the app's haptics (expo-haptics; silent on web).
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { haptics } from '@mobile/lib/haptics';
import type { BunColors } from '@mobile/theme/bunPalette';
import { useBunColors } from '@mobile/theme/ThemeProvider';

import { BunText } from './BunText';
import { Glyph } from './entryKitPrivate';
import type { KeypadKey } from './keypadExpression';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE } from './layout';

/** The smallest keypad key, in points: larger than the 44 pt floor, for one thumb. */
export const KEYPAD_KEY_MIN = 56;

export type KeypadProps = {
  readonly onKey: (key: KeypadKey) => void;
  readonly disabled?: boolean;
  /** Feedback on each press; defaults to the app's selection haptic. */
  readonly haptic?: () => void;
};

type KeyLook = 'digit' | 'action' | 'equals';
type KeySpec = { readonly key: KeypadKey; readonly face: string; readonly label: string; readonly look: KeyLook; readonly span?: number };

function rows(tc: (english: string) => string): readonly (readonly KeySpec[])[] {
  const digit = (key: KeypadKey): KeySpec => ({ key, face: key, label: key, look: 'digit' });
  const op = (key: KeypadKey, face: string, label: string): KeySpec => ({ key, face, label: tc(label), look: 'action' });
  return [
    [op('clear', 'C', 'Clear'), { ...op('backspace', '', 'Delete'), span: 2 }, op('divide', '÷', 'Divided by')],
    [digit('7'), digit('8'), digit('9'), op('multiply', '×', 'Times')],
    [digit('4'), digit('5'), digit('6'), op('subtract', '−', 'Minus')],
    [digit('1'), digit('2'), digit('3'), op('add', '+', 'Plus')],
    [{ key: '000', face: '000', label: tc('Triple zero'), look: 'digit' }, digit('0'), { key: '.', face: '.', label: tc('Decimal point'), look: 'digit' }, { key: 'equals', face: '=', label: tc('Equals'), look: 'equals' }],
  ];
}

function keyColors(look: KeyLook, colors: BunColors): { ground: string; text: 'ink' | 'onInk' } {
  if (look === 'equals') return { ground: colors.ink, text: 'onInk' };
  if (look === 'action') return { ground: colors.background, text: 'ink' };
  return { ground: colors.card, text: 'ink' };
}

export function Keypad({ onKey, disabled = false, haptic }: KeypadProps) {
  const colors = useBunColors();
  const tc = useCopy();
  const press = (key: KeypadKey) => {
    if (haptic) haptic();
    else void haptics.selection();
    onKey(key);
  };
  return (
    <View role="group" accessibilityLabel={tc('Keypad')} style={{ gap: BUN_SPACE.xs }}>
      {rows(tc).map((row, index) => (
        <View key={index} style={{ flexDirection: 'row', gap: BUN_SPACE.xs }}>
          {row.map((spec) => {
            const look = keyColors(spec.look, colors);
            return (
              <Pressable
                key={spec.key}
                accessibilityRole="button"
                accessibilityLabel={spec.label}
                disabled={disabled}
                onPress={() => press(spec.key)}
                style={({ pressed }) => ({
                  flex: spec.span ?? 1,
                  minHeight: KEYPAD_KEY_MIN,
                  minWidth: KEYPAD_KEY_MIN,
                  borderRadius: BUN_RADIUS.chip,
                  borderWidth: BUN_OUTLINE.control,
                  borderColor: colors.ink,
                  backgroundColor: look.ground,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: BUN_SPACE.xxs,
                  opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
                })}
              >
                {spec.key === 'backspace' ? (
                  <Glyph name="backspace" size={26} color={colors.ink} />
                ) : (
                  <BunText variant="heading" tone={look.text} style={{ fontVariant: ['tabular-nums'] }}>{spec.face}</BunText>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
