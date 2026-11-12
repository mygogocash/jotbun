// The correction tray (P2-T21): before a correction to a wallet with entries
// is sent (a changed opening balance, which correctionNeedsReason flags), it
// asks why, with today's two reasons in their order (CORRECTION_REASONS,
// through `tc`), and says why it asks. A reason sends the correction with it;
// closing the tray sends nothing. It hosts P2-T13's Tray and opens nothing
// after it, so it passes no onClosed; its host keeps it mounted.
import type { WalletCorrectionReason } from '@gogospend/contracts';
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import { CORRECTION_REASONS } from '@mobile/spend/v1/redesign/planning/walletsModel';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { Tray } from '../tray/Tray';
import { WalletText } from '../WalletText';

export function CorrectionTray({ visible, onClose, onReason }: { visible: boolean; onClose(): void; onReason(reason: WalletCorrectionReason): void }) {
  const colors = useWalletColors();
  const tc = useCopy();
  return (
    <Tray visible={visible} onClose={onClose} title={tc('Why are you changing this?')} testID="correction-tray">
      <View style={{ gap: 10 }}>
        <WalletText role="label" tone="quiet">{tc('This wallet already has entries, so Jotbun keeps a note of why.')}</WalletText>
        {CORRECTION_REASONS.map((reason) => (
          <Pressable
            key={reason.value}
            testID={`correction-${reason.value}`}
            accessibilityRole="button"
            accessibilityLabel={tc(reason.label)}
            onPress={() => onReason(reason.value)}
            style={({ pressed }) => ({
              minHeight: 56,
              justifyContent: 'center',
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 16,
              backgroundColor: colors.raised,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <WalletText role="body">{tc(reason.label)}</WalletText>
          </Pressable>
        ))}
      </View>
    </Tray>
  );
}
