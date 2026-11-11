// The quick chips (bw-tray-amount, ax-large-tray): at most three things this
// person often logs, each its name and its amount. A tap fills the entry
// through the host's `apply` (P2-T16 builds them from today's often-logged
// list) and ticks once (chipPick). By default they are a row of 44 pt pills
// that wraps (§4: the boards draw 36 pt). At the largest text sizes they are a
// list of full-width rows of at least 64 pt, where a long name pushes the
// amount onto the next line. The amount is WalletAmount's, so private mode
// masks it (W10), and each chip says its name and its amount (add.chip), or
// that the amount is hidden.
import type { Minor } from '@gogospend/contracts';
import { Pressable, View } from 'react-native';

import { playHaptic } from '@mobile/lib/hapticMoment';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { useLargeText } from '@mobile/ui/largeText';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletAmount } from '../money/WalletAmount';
import { spokenMoney } from '../money/walletMoney';
import { usePrivateMode } from '../privacy/PrivateModeProvider';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

export type QuickChip = { label: string; amountMinor: Minor; apply(): void };

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** The most chips the step shows. */
const MOST = 3;

export function QuickChips({ chips }: { chips: readonly QuickChip[] }) {
  const colors = useWalletColors();
  const t = useDraftCopy(LINES);
  const large = useLargeText();
  const { hidden } = usePrivateMode();
  const shown = chips.slice(0, MOST);
  if (shown.length === 0) return null;
  return (
    <View
      testID="quick-chips"
      style={large
        ? { flexDirection: 'column', borderWidth: 1, borderColor: colors.hairline, borderRadius: 18, overflow: 'hidden' }
        : { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
    >
      {shown.map((chip, index) => (
        <Pressable
          key={index}
          accessibilityRole="button"
          accessibilityLabel={t('add.chip', { label: chip.label, amount: hidden ? t('common.amountHidden') : spokenMoney(chip.amountMinor, t) })}
          onPress={() => {
            playHaptic('chipPick');
            chip.apply();
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: large ? 'baseline' : 'center',
            columnGap: large ? 14 : 6,
            opacity: pressed ? 0.7 : 1,
            ...(large
              ? { minHeight: 64, alignContent: 'center', paddingVertical: 8, paddingHorizontal: 16, borderTopWidth: index === 0 ? 0 : 1, borderColor: colors.hairline }
              : { minHeight: 44, flexShrink: 1, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.card }),
          })}
        >
          <WalletText role="label">{chip.label}</WalletText>
          <WalletAmount minor={chip.amountMinor} size={16} />
        </Pressable>
      ))}
    </View>
  );
}
