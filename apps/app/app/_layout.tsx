import { installAppAuth } from '@mobile/auth/appAuth';
import { Stack } from 'expo-router';

installAppAuth();
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, ThemedStatusBar } from '@mobile/theme/ThemeProvider';
import { useFonts } from 'expo-font';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { spendRuntimeFonts } from '@mobile/theme/appFonts';
import { deviceLocale } from '@mobile/i18n/deviceLocale';
import { LanguageProvider, useLanguage } from '@mobile/i18n/LanguageProvider';
import { useActiveLocale } from '@mobile/i18n/useCopy';
import { syncUiFontFamily } from '@mobile/theme/uiFontFamily';
import { useReminderUpkeep } from '@mobile/notifications/useReminderUpkeep';
import { BunIntensityProvider } from '@mobile/mascot/BunIntensityProvider';
import { HapticsProvider } from '@mobile/lib/HapticsProvider';
import { useReducedMotion } from '@mobile/hooks/useReducedMotion';

// The app's language: the person's choice in Settings, else the device's
// (Thai, English or Vietnamese). A new choice applies at once, through the
// IntlProvider LanguageProvider holds.
export default function RootLayout() {
  const device = useMemo(deviceLocale, []);
  return <LanguageProvider device={device}><RootStack /></LanguageProvider>;
}

function RootStack() {
  const [fontsLoaded, fontError] = useFonts(spendRuntimeFonts);
  // On native the saved language is read first (waiting 1.5 s at most), so no screen (or reminder) starts in the wrong one.
  const { ready } = useLanguage();
  // Screens slide in; for a person who asked for less motion they cross-fade instead.
  const reducedMotion = useReducedMotion();
  useEffect(() => { if (fontError) console.warn('Bundled fonts could not load; using the system fallback.'); }, [fontError]);
  if ((!fontsLoaded && !fontError) || !ready) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator accessibilityLabel="Loading Jotbun" /></View>;
  return <HapticsProvider><BunIntensityProvider><SafeAreaProvider><ThemeProvider><LocaleUpkeep /><ThemedStatusBar /><Stack screenOptions={{ headerShown: false, animation: reducedMotion ? 'fade' : 'default' }} /></ThemeProvider></SafeAreaProvider></BunIntensityProvider></HapticsProvider>;
}

/** What follows the language beyond the words: the UI font for its script, and the local reminders written in it. */
function LocaleUpkeep() {
  const locale = useActiveLocale();
  useEffect(() => { syncUiFontFamily(locale); }, [locale]);
  useReminderUpkeep(locale);
  return null;
}
