import { Stack } from 'expo-router';
import { IntlProvider } from 'react-intl';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, ThemedStatusBar } from '@mobile/theme/ThemeProvider';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { spendRuntimeFonts } from '@mobile/theme/appFonts';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(spendRuntimeFonts);
  useEffect(() => { if (fontError) console.warn('Bundled fonts could not load; using the system fallback.'); }, [fontError]);
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator accessibilityLabel="Loading GoGoSpend" /></View>;
  return <SafeAreaProvider><IntlProvider locale="en"><ThemeProvider><ThemedStatusBar /><Stack screenOptions={{ headerShown: false }} /></ThemeProvider></IntlProvider></SafeAreaProvider>;
}
