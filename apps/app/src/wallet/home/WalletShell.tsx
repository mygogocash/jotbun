// The Bun Wallet shell (P2-T18; R58, W13, W31, C5, ax-voiceover). The spend
// layout mounts it once, inside the device diary and Bun's AI help, around
// History's keep and the screen (app/spend/_layout.tsx), so what it holds
// lasts as long as the spend area stays mounted:
//
// - The v1 resources (the shared singleton every route wraps), the looks kept
//   on the phone (one provider: a change that could not be stored shows until
//   the spend area unmounts), the card frames (where the saved chip lands), the
//   saved toast's host and the one add tray host, in that order. The toast's
//   host lays its box over the whole window, under WalletRoot's private mode,
//   so the toast and the chip mask amounts and land where measureInWindow
//   says.
// - A save from the tray shows its notice once, in the app's words.
// - Saving is blocked (C5) while a draft waits for an update or the last sync
//   was refused for an update (Home's syncPlan): the + is disabled, and the
//   host opens nothing, whoever asks.
// - The root holds the screen, the + and the bar where the bar shows
//   (shellRoutes.ts); Magic Tap (a two-finger double tap) opens the add tray
//   on any tab (ax-voiceover). react-native-web drops onMagicTap, so the tests
//   read it here.
import { usePathname } from 'expo-router';
import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { getSharedV1Resources } from '@mobile/api/sharedV1';
import { useCopy } from '@mobile/i18n/useCopy';
import type { SavedEntry } from '@mobile/screens/redesign/entry/entrySave';
import { syncPlan } from '@mobile/screens/redesign/HomeScreen';
import { useDiaryView } from '@mobile/spend/v1/SpendDiaryContext';
import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { AddTrayHost, useAddTray } from '../add/AddTrayHost';
import type { SavedContext } from '../add/AddTrayHost';
import { CardFramesProvider } from '../card/cardFrames';
import { WalletLooksProvider } from '../looks/WalletLooksProvider';
import { noticeOf } from '../saved/savedMoment';
import { SavedToastHost, useSavedToast } from '../saved/SavedToastHost';
import { AddButton } from './AddButton';
import { walletTab } from './shellRoutes';
import { WalletTabBar } from './WalletTabBar';

export function WalletShell({ children }: { children: ReactNode }) {
  return (
    <SpendV1Provider resources={getSharedV1Resources()}>
      <WalletLooksProvider>
        <CardFramesProvider>
          <SavedToastHost>
            <ShellTray>{children}</ShellTray>
          </SavedToastHost>
        </CardFramesProvider>
      </WalletLooksProvider>
    </SpendV1Provider>
  );
}

/** Below the toast's host: the add tray host, whose saves show the toast, blocked while an update is needed (C5). */
function ShellTray({ children }: { children: ReactNode }) {
  const toast = useSavedToast();
  const tc = useCopy();
  const blocked = syncPlan(useDiaryView(), false, tc).upgrade;
  const onSaved = useCallback((saved: SavedEntry, context: SavedContext) => toast.show(noticeOf(saved, context.lookups, context.offline, tc)), [toast, tc]);
  return (
    <AddTrayHost onSaved={onSaved} blocked={blocked}>
      <ShellFrame blocked={blocked}>{children}</ShellFrame>
    </AddTrayHost>
  );
}

/** The root: the screen, with the + and the bar where the bar shows, and Magic Tap on every screen. */
function ShellFrame({ blocked, children }: { blocked: boolean; children: ReactNode }) {
  const tray = useAddTray();
  const colors = useWalletColors();
  const { visible } = walletTab(usePathname());
  const openAdd = () => tray.open();
  return (
    <View testID="wallet-shell" onMagicTap={openAdd} style={{ flex: 1, backgroundColor: colors.ground }}>
      <View style={{ flex: 1 }}>
        {children}
        {visible ? <AddButton onPress={openAdd} disabled={blocked} /> : null}
      </View>
      {visible ? <WalletTabBar /> : null}
    </View>
  );
}
