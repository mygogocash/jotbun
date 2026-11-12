// Stands in for expo-router (and its `build/Route` params context) in the
// catalogue's render tests. The real router needs a navigation container that
// vitest cannot run. This keeps what the catalogue's screen sections use: a
// router whose calls are recorded, the route params context the catalogue
// overrides for Quick add's `copyOf`, `useLocalSearchParams` reading it, and a
// focus effect that runs once on mount. `dismissTo` is recorded too (P2-T21's
// flows leave with it). Test use only.
import { createContext, use, useEffect } from 'react';
import { vi } from 'vitest';

export const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), navigate: vi.fn(), setParams: vi.fn(), dismissTo: vi.fn(), canGoBack: vi.fn(() => true) };

export const LocalRouteParamsContext = createContext<object | undefined>({});

export function useRouter() {
  return router;
}

export function useLocalSearchParams(): Record<string, string | string[]> {
  return (use(LocalRouteParamsContext) ?? {}) as Record<string, string | string[]>;
}

export function useFocusEffect(effect: () => void | (() => void)): void {
  useEffect(() => effect(), [effect]);
}
