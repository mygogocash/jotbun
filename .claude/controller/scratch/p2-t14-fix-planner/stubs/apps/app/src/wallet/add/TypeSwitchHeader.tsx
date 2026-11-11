// The add tray's header (W14; rh-income, rh-transfer): one segmented control
// for spending, income and moving money. It takes the title's place in the
// tray's header row, where the title still names the dialog and is what a
// screen reader meets first (P2-T13). A radio group named ประเภทรายการ, as the
// boards name it and as today's TypeSwitch is a radio group: the chosen type
// is a `card` segment with bold ink words (lifted by a soft shadow by day),
// the others quiet on the `raised` track, so the choice never rests on the
// fill alone. Each segment is at least 44 pt (§4); at the largest text sizes
// the three stack, so each word stays whole. A new choice ticks once
// (segmentChange); the chosen one does nothing.
import { Pressable, View } from 'react-native';

import { playHaptic } from '@mobile/lib/hapticMoment';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { useLargeText } from '@mobile/ui/largeText';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletText } from '../WalletText';
import type { AddType } from './addFlow';
import { COPY } from './copy';

// RED stub (the fix round): the switch stays in the header at every size, and a disabled switch still changes the type.

const TYPES: readonly AddType[] = ['expense', 'income', 'transfer'];
const LABELS = { expense: 'add.typeExpense', income: 'add.typeIncome', transfer: 'add.typeTransfer' } as const;

/** A segment's height (rh-income), and the chosen one's lift by day. */
const SEGMENT = 44;
const LIFT = '0px 1px 4px rgba(17, 16, 20, 0.14)';

export function useSwitchInHeader(): boolean {
  return true;
}

export function TypeSwitchHeader({ type, onType }: { type: AddType; onType(type: AddType): void; disabled?: boolean }) {
  const colors = useWalletColors();
  const t = useDraftCopy(COPY);
  const large = useLargeText();
  return (
    <View
      testID="type-switch"
      role="radiogroup"
      accessibilityLabel={t('add.typeGroup')}
      style={{ flexDirection: large ? 'column' : 'row', gap: 2, padding: 4, borderRadius: 17, backgroundColor: colors.raised }}
    >
      {TYPES.map((each) => {
        const checked = each === type;
        return (
          <Pressable
            key={each}
            accessibilityRole="radio"
            accessibilityLabel={t(LABELS[each])}
            accessibilityState={{ checked }}
            aria-checked={checked}
            onPress={() => {
              if (checked) return;
              playHaptic('segmentChange');
              onType(each);
            }}
            style={{
              flex: large ? undefined : 1,
              minHeight: SEGMENT,
              borderRadius: 13,
              paddingHorizontal: 8,
              paddingVertical: 4,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: checked ? colors.card : 'transparent',
              boxShadow: checked && !colors.isDark ? LIFT : undefined,
            }}
          >
            <WalletText role="label" tone={checked ? 'ink' : 'quiet'} style={{ fontWeight: checked ? '700' : '500', textAlign: 'center' }}>
              {t(LABELS[each])}
            </WalletText>
          </Pressable>
        );
      })}
    </View>
  );
}
