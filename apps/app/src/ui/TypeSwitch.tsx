// Expense / Income / Move, one segmented control (redesign R2b). A radio
// group: one choice, the chosen one an ink pill with a bold label, so the
// choice never rests on the fill alone. "Move" is a transfer between the
// user's own wallets.
import { Animated, Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { playHaptic } from '@mobile/lib/hapticMoment';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { useSpringPop } from '@mobile/theme/useSpringPop';

import { BunText } from './BunText';
import { useLargeText } from './largeText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from './layout';

export type EntryKind = 'expense' | 'income' | 'transfer';

export type TypeSwitchProps = {
  readonly value: EntryKind;
  readonly onChange: (next: EntryKind) => void;
  readonly disabled?: boolean;
};

const KINDS: readonly EntryKind[] = ['expense', 'income', 'transfer'];

export function TypeSwitch({ value, onChange, disabled = false }: TypeSwitchProps) {
  const colors = useBunColors();
  const tc = useCopy();
  // One spring for the row, handed to whichever segment is chosen; still under reduced motion.
  const pop = useSpringPop(value);
  const labels: Record<EntryKind, string> = { expense: tc('Expense'), income: tc('Income'), transfer: tc('Move') };
  // At the accessibility text sizes the three choices stack, so each word stays whole.
  const large = useLargeText();
  return (
    <View
      role="radiogroup"
      accessibilityLabel={tc('Record type')}
      style={{
        flexDirection: large ? 'column' : 'row',
        borderColor: colors.ink,
        borderWidth: BUN_OUTLINE.control,
        // A stack in a pill would round its ends past the choices, so it takes a card's corners.
        borderRadius: large ? BUN_RADIUS.card : BUN_RADIUS.pill,
        backgroundColor: colors.card,
        padding: BUN_SPACE.xxs,
        gap: BUN_SPACE.xxs,
      }}
    >
      {KINDS.map((kind) => {
        const checked = kind === value;
        return (
          <Animated.View key={kind} style={[large ? null : { flex: 1 }, checked ? pop : null]}>
            <Pressable
              accessibilityRole="radio"
              accessibilityLabel={labels[kind]}
              aria-checked={checked}
              disabled={disabled}
              onPress={() => {
                if (checked) return;
                playHaptic('segmentChange');
                onChange(kind);
              }}
              style={{
                minHeight: BUN_TOUCH,
                borderRadius: BUN_RADIUS.pill,
                backgroundColor: checked ? colors.ink : colors.card,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: BUN_SPACE.sm,
                paddingVertical: BUN_SPACE.xxs,
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <BunText variant="label" tone={checked ? 'onInk' : 'ink'} style={checked ? { textAlign: 'center', fontWeight: '700' } : { textAlign: 'center' }}>{labels[kind]}</BunText>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}
