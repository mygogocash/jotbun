// The wallet shell's bar (P2-T18; bw-home, dk-home, W13, ax-voiceover,
// ax-large-home rule 8): กระเป๋า (/spend) and สรุป (/spend/insights) are
// tabs, and ฉัน is a link to Settings, which sits outside the shell, so it is
// never selected. Each item says its place (1 จาก 3, 2 จาก 3, 3 จาก 3) and is
// at least 44 pt in its own box. The labels stop at iOS's largest standard
// size, as Apple's own bars do; at the largest text sizes they hide, the icons
// grow to 30 pt and each item keeps its name, which a long press shows large
// (iOS's large content viewer). The bar is a row of the layout under the
// screen (shellRoutes.ts); useWalletTabInset is what a screen keeps clear.
import { usePathname, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE } from '@mobile/ui/a11y';
import { useLargeText } from '@mobile/ui/largeText';
import { LARGEST_STANDARD_SCALE } from '@mobile/ui/largeTextScale';
import { useDraftCopy } from '../copy/useDraftCopy';
import { WalletText } from '../WalletText';
import { COPY } from './copy';
import { WALLET_TAB_ROUTES, walletTab, walletTabInset } from './shellRoutes';
import type { WalletTabKey } from './shellRoutes';

type ItemKey = WalletTabKey | 'me';

/** The bar's items in order: each one's name and its place. */
const ITEMS: readonly { key: ItemKey; name: string; place: number }[] = [
  { key: 'wallets', name: 'home.tabWallets', place: 1 },
  { key: 'insights', name: 'home.tabInsights', place: 2 },
  { key: 'me', name: 'home.tabMe', place: 3 },
];

/** A screen's bottom inset: what keeps its last row clear of the +, or 0 where the bar is hidden. */
export function useWalletTabInset(): number {
  const pathname = usePathname();
  const large = useLargeText();
  return walletTabInset(walletTab(pathname).visible, large);
}

/** bw-home's line drawings, in the colour of the item; decorative, since each item says its name. */
function TabIcon({ item, color, ground, size }: { item: ItemKey; color: string; ground: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {item === 'wallets' ? (
        <>
          <Rect x={3} y={6} width={18} height={13} rx={3} fill={color} />
          <Path d="M3 10h18" stroke={ground} strokeWidth={2} />
        </>
      ) : item === 'insights' ? (
        <Path d="M5 20V11M12 20V5M19 20v-6" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      ) : (
        <>
          <Circle cx={12} cy={8} r={4} fill="none" stroke={color} strokeWidth={2} />
          <Path d="M4 21c1-4 4-6 8-6s7 2 8 6" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
        </>
      )}
    </Svg>
  );
}

export function WalletTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const colors = useWalletColors();
  const insets = useSafeAreaInsets();
  const large = useLargeText();
  const t = useDraftCopy(COPY);
  const { active } = walletTab(pathname);
  const go = (item: ItemKey) => {
    if (item === 'me') router.push('/settings');
    else if (item !== active) router.navigate(WALLET_TAB_ROUTES[item]);
  };
  return (
    <View
      testID="wallet-tab-bar"
      role="tablist"
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingTop: 6,
        paddingBottom: Math.max(insets.bottom, 6),
        borderTopWidth: 1,
        borderTopColor: colors.hairline,
        backgroundColor: colors.ground,
      }}
    >
      {ITEMS.map((item) => {
        const tab = item.key !== 'me';
        const selected = tab && item.key === active;
        const name = t(item.name);
        const color = selected ? colors.ink : colors.quietOnGround;
        return (
          <Pressable
            key={item.key}
            testID={`wallet-tab-${item.key}`}
            role={tab ? 'tab' : 'link'}
            accessibilityRole={tab ? 'tab' : 'link'}
            accessibilityLabel={name}
            aria-valuetext={t('home.tabPlace', { n: item.place })}
            {...(tab ? { accessibilityState: { selected }, 'aria-selected': selected } : {})}
            accessibilityShowsLargeContentViewer
            accessibilityLargeContentTitle={name}
            onPress={() => go(item.key)}
            style={{ minHeight: large ? 52 : 44, minWidth: large ? 64 : 56, alignItems: 'center', justifyContent: 'center', gap: 2 }}
          >
            <View {...DECORATIVE}>
              <TabIcon item={item.key} color={color} ground={colors.ground} size={large ? 30 : 24} />
            </View>
            {large ? null : (
              <WalletText role="caption" tone={selected ? 'ink' : 'quietOnGround'} maxFontSizeMultiplier={LARGEST_STANDARD_SCALE} style={{ fontSize: 11, fontWeight: selected ? '700' : '400' }}>
                {name}
              </WalletText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
