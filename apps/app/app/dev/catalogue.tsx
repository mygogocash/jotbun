// The redesign's screen catalogue (R2c), for the E2 visual-approval
// screenshots. No sign-in needed: every section draws sample data.
//
//   gogospend://dev/catalogue?section=receipt&theme=dark&locale=th
//
// It opens only in a development build with the `catalogue` redesign area on
// (EXPO_PUBLIC_REDESIGN=catalogue, or `all`). Anywhere else the route says
// "Not available".
//
// The catalogue is loaded with `if (__DEV__) require(...)`, never imported:
// in a release build Metro replaces `__DEV__` with `false` and drops the dead
// branch before it collects dependencies, so the catalogue, its samples and
// the test fakes they read never reach a release bundle.
import { useLocalSearchParams } from 'expo-router';
import type { ComponentType } from 'react';
import { View } from 'react-native';

import { isRedesignEnabled } from '@mobile/config/featureFlags';
import type { CatalogueScreenProps } from '@mobile/dev/catalogue/CatalogueScreen';
import { useCopy } from '@mobile/i18n/useCopy';
import { Text } from '@mobile/theme/AppText';
import { useBunColors } from '@mobile/theme/ThemeProvider';

function loadCatalogue(): ComponentType<CatalogueScreenProps> | null {
  if (__DEV__) {
    const catalogue: typeof import('@mobile/dev/catalogue/CatalogueScreen') = require('@mobile/dev/catalogue/CatalogueScreen');
    return catalogue.CatalogueScreen;
  }
  return null;
}

function NotAvailable() {
  const tc = useCopy();
  const colors = useBunColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, backgroundColor: colors.background }}>
      <Text role="heading" accessibilityRole="header" style={{ color: colors.ink, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>{tc('Not available')}</Text>
      {__DEV__ ? (
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>The screen catalogue opens in development builds with EXPO_PUBLIC_REDESIGN=catalogue (or all).</Text>
      ) : null}
    </View>
  );
}

export default function DevCatalogueRoute() {
  const params = useLocalSearchParams();
  const Catalogue = isRedesignEnabled('catalogue') ? loadCatalogue() : null;
  return Catalogue ? <Catalogue params={params} /> : <NotAvailable />;
}
