// Stands in for react-native-safe-area-context in the catalogue's render
// tests. The real package loads React Native itself, which vitest cannot run.
// This keeps the parts the catalogue and the kit use: the insets context, its
// hook and a provider, with an iPhone 17 Pro's insets. Test use only.
import { createContext, type PropsWithChildren, useContext } from 'react';

export type EdgeInsets = { top: number; right: number; bottom: number; left: number };

export const PHONE_INSETS: EdgeInsets = { top: 62, right: 0, bottom: 34, left: 0 };

export const SafeAreaInsetsContext = createContext<EdgeInsets | null>(null);

export function useSafeAreaInsets(): EdgeInsets {
  return useContext(SafeAreaInsetsContext) ?? PHONE_INSETS;
}

export function SafeAreaProvider({ children }: PropsWithChildren<{ initialMetrics?: unknown }>) {
  return <SafeAreaInsetsContext.Provider value={PHONE_INSETS}>{children}</SafeAreaInsetsContext.Provider>;
}
