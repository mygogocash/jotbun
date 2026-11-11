// The add tray's type switch (W14; rh-income, rh-transfer): one segmented
// control for spending, income and moving money. At the standard text sizes it
// takes the title's place in the tray's header row, where the title still
// names the dialog and is what a screen reader meets first (P2-T13). At the
// largest ones (ax-large-tray) the pinned header is the tray's one-line title,
// and the host gives the switch to the step, which draws it under the amount
// in the scrolling middle, so the pinned parts leave the middle room
// (useSwitchInHeader, R106). A radio group named ประเภทรายการ, as the boards
// name it and as today's TypeSwitch is a radio group: the chosen type is a
// `card` segment with bold ink words (lifted by a soft shadow by day), the
// others quiet on the `raised` track, so the choice never rests on the fill
// alone. Each segment is at least 44 pt (§4); at the largest text sizes the
// three stack, so each word stays whole. A new choice ticks once
// (segmentChange); the chosen one does nothing. Disabled while the tray is
// locked for a save (P2-T16), as today's TypeSwitch is: dimmed, no tick, no
// change, and said to be unavailable (Pressable derives that from `disabled`
// on a phone and on the web).
import { Pressable, View } from 'react-native';

import { playHaptic } from '@mobile/lib/hapticMoment';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { useLargeText } from '@mobile/ui/largeText';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletText } from '../WalletText';
import type { AddType } from './addFlow';
import { COPY } from './copy';

const TYPES: readonly AddType[] = ['expense', 'income', 'transfer'];
const LABELS = { expense: 'add.typeExpense', income: 'add.typeIncome', transfer: 'add.typeTransfer' } as const;

/** A segment's height (rh-income), and the chosen one's lift by day. */
const SEGMENT = 44;
const LIFT = '0px 1px 4px rgba(17, 16, 20, 0.14)';

/**
 * Where the switch goes (R106): the tray's header at the standard text sizes;
 * at the largest ones the host leaves the header to the tray's title and
 * passes the switch to the step (AmountStep's `typeSwitch`).
 */
export function useSwitchInHeader(): boolean {
  return !useLargeText();
}

export function TypeSwitchHeader({ type, onType, disabled = false }: { type: AddType; onType(type: AddType): void; disabled?: boolean }) {
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
            disabled={disabled}
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
              opacity: disabled ? 0.4 : 1,
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
