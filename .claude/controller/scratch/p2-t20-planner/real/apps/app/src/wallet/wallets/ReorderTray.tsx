// The reorder tray (P2-T20, W28): the wallets in use, front first, each on a
// row with move-up and move-down buttons that name the wallet, so it works at
// every text size and with VoiceOver; no drag. A press moves one wallet one
// place and keeps the new order at once with setOrder (P2-T11's kept looks,
// W7): once per press, a fresh array each time. The tray draws what its
// presses made at once, ahead of the kept order (whose store write is
// queued), and the next press reads it before React draws again, so two quick
// presses move a wallet two places. Each opening starts from the kept order.
//
// It hosts P2-T13's Tray and opens nothing after it, so it passes no onClosed
// and nothing waits for one. Its host keeps it mounted; onClose closes it.
import type { WalletDto } from '@gogospend/contracts';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { useLargeText } from '@mobile/ui/largeText';
import { COMMON_COPY } from '../common/copy';
import { useDraftCopy } from '../copy/useDraftCopy';
import { IconButton } from '../controls/IconButton';
import { MaterialFill } from '../looks/MaterialFill';
import { useWalletLooks } from '../looks/WalletLooksProvider';
import { Tray } from '../tray/Tray';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import { frontFirst, moveWallet } from './walletsList';

const LINES = { ...COMMON_COPY, ...COPY } as const;

/** The boards' chevrons (wc-wallets, bw-tray-amount), on a 24 pt grid. */
const CHEVRONS = { up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', right: 'M9 5l7 7-7 7' } as const;

/** A chevron. Decorative: the control that holds it says what it does. */
export function Chevron({ direction, size, color }: { direction: keyof typeof CHEVRONS; size: number; color: string }) {
  return (
    <View {...DECORATIVE}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={CHEVRONS[direction]} fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

export function ReorderTray({ visible, onClose, wallets }: { visible: boolean; onClose(): void; wallets: readonly WalletDto[] }) {
  const colors = useWalletColors();
  const large = useLargeText();
  const t = useDraftCopy(LINES);
  const { lookOf, order, setOrder } = useWalletLooks();
  // What this opening's presses made: drawn at once, and read by the next press before React draws again.
  const [moved, setMoved] = useState<readonly string[] | null>(null);
  const made = useRef<readonly string[] | null>(null);
  const shown = frontFirst(wallets, moved ?? order);

  const move = (walletId: string, by: -1 | 1) => {
    const next = moveWallet(made.current ?? shown.map((wallet) => wallet.id), walletId, by);
    made.current = next;
    setMoved(next);
    // Kept at once, with a fresh array per press. It resolves whether or not the order was stored.
    void setOrder(next);
  };
  // The next opening starts from the kept order again.
  const close = () => {
    made.current = null;
    setMoved(null);
    onClose();
  };

  return (
    <Tray visible={visible} onClose={close} title={t('wallets.reorder')} testID="reorder-tray">
      <View style={{ gap: 8 }}>
        {shown.map((wallet, index) => (
          <View
            key={wallet.id}
            testID={`reorder-row-${wallet.id}`}
            style={{
              minHeight: 56,
              flexDirection: large ? 'column' : 'row',
              alignItems: large ? 'stretch' : 'center',
              gap: 10,
              paddingVertical: 6,
              paddingLeft: 12,
              paddingRight: 6,
              borderRadius: 16,
              backgroundColor: colors.raised,
            }}
          >
            <View style={{ flex: large ? undefined : 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View {...DECORATIVE} style={{ width: 34, height: 22 }}>
                <MaterialFill material={lookOf(wallet.id).material} radius={5} />
              </View>
              <WalletText role="body" style={{ flexShrink: 1 }}>{wallet.name}</WalletText>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignSelf: large ? 'flex-end' : 'center' }}>
              <IconButton label={t('wallets.moveUp', { name: wallet.name })} disabled={index === 0} onPress={() => move(wallet.id, -1)}>
                <Chevron direction="up" size={20} color={colors.ink} />
              </IconButton>
              <IconButton label={t('wallets.moveDown', { name: wallet.name })} disabled={index === shown.length - 1} onPress={() => move(wallet.id, 1)}>
                <Chevron direction="down" size={20} color={colors.ink} />
              </IconButton>
            </View>
          </View>
        ))}
      </View>
    </Tray>
  );
}
