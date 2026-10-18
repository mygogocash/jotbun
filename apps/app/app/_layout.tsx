import { Stack } from 'expo-router';
import { IntlProvider } from 'react-intl';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, ThemedStatusBar } from '@mobile/theme/ThemeProvider';
import { useFonts } from 'expo-font';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { spendRuntimeFonts } from '@mobile/theme/appFonts';
import { deviceLocale } from '@mobile/i18n/deviceLocale';
import { syncUiFontFamily } from '@mobile/theme/uiFontFamily';
import { useReminderUpkeep } from '@mobile/notifications/useReminderUpkeep';
import { BunIntensityProvider } from '@mobile/mascot/BunIntensityProvider';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(spendRuntimeFonts);
  // Follow the device language (Thai, English or Vietnamese) and its fonts.
  const locale = useMemo(deviceLocale, []);
  useEffect(() => { syncUiFontFamily(locale); }, [locale]);
  useReminderUpkeep(locale);
  useEffect(() => { if (fontError) console.warn('Bundled fonts could not load; using the system fallback.'); }, [fontError]);
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator accessibilityLabel="Loading Jotbun" /></View>;
  return <BunIntensityProvider><SafeAreaProvider><IntlProvider locale={locale}><ThemeProvider><ThemedStatusBar /><Stack screenOptions={{ headerShown: false }} /></ThemeProvider></IntlProvider></SafeAreaProvider></BunIntensityProvider>;
}
