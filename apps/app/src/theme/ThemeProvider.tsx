import { StatusBar } from "expo-status-bar";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, useColorScheme } from "react-native";

import {
  getColorsForTheme,
  type ThemeColors,
} from "@mobile/theme/colorPalettes";
import { getBunColors, type BunColors } from "@mobile/theme/bunPalette";
import { resolveTheme, type ResolvedTheme } from "@mobile/theme/resolveTheme";
import {
  colorSchemeMetaContent,
  DEFAULT_THEME_PREFERENCE,
  type ThemePreference,
} from "@mobile/theme/themePreference";
import {
  readStoredThemePreference,
  readStoredThemePreferenceSync,
  writeStoredThemePreference,
} from "@mobile/theme/themePreferenceStorage";

type ThemeContextValue = {
  readonly preference: ThemePreference;
  readonly resolved: ResolvedTheme;
  readonly colors: ThemeColors;
  /** The redesign's "Bun diary" palette for the same resolved theme. */
  readonly bun: BunColors;
  readonly ready: boolean;
  readonly setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveInitialPreference(): ThemePreference | null {
  if (Platform.OS === "web") {
    return readStoredThemePreferenceSync() ?? DEFAULT_THEME_PREFERENCE;
  }
  return null;
}

function applyWebColorScheme(
  resolved: ResolvedTheme,
  preference: ThemePreference,
) {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return;
  }
  document.documentElement.style.colorScheme = resolved;
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.setAttribute("content", colorSchemeMetaContent(preference));
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const preferenceVersionRef = useRef(0);
  const [preference, setPreferenceState] = useState<ThemePreference>(
    () => resolveInitialPreference() ?? DEFAULT_THEME_PREFERENCE,
  );

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }
    let active = true;
    const hydrationVersion = preferenceVersionRef.current;
    void (async () => {
      const stored = await readStoredThemePreference();
      if (
        active &&
        stored !== null &&
        preferenceVersionRef.current === hydrationVersion
      ) {
        setPreferenceState(stored);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const resolved = useMemo(
    () => resolveTheme(preference, systemScheme),
    [preference, systemScheme],
  );
  const colors = useMemo(() => getColorsForTheme(resolved), [resolved]);
  const bun = useMemo(() => getBunColors(resolved), [resolved]);

  useEffect(() => {
    applyWebColorScheme(resolved, preference);
  }, [resolved, preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    preferenceVersionRef.current += 1;
    setPreferenceState(next);
    void writeStoredThemePreference(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      colors,
      bun,
      ready: true,
      setPreference,
    }),
    [preference, resolved, colors, bun, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within <ThemeProvider>");
  }
  return ctx;
}

export function useThemeColors(): ThemeColors {
  return useTheme().colors;
}

export function useBunColors(): BunColors {
  return useTheme().bun;
}

type ThemePreferenceOverrideProps = PropsWithChildren<{
  preference: ThemePreference;
}>;

/** Force a subtree to resolve as light/dark/system without changing the stored preference. */
export function ThemePreferenceOverride({
  preference,
  children,
}: ThemePreferenceOverrideProps) {
  const parent = useTheme();
  const systemScheme = useColorScheme();
  const resolved = useMemo(
    () => resolveTheme(preference, systemScheme),
    [preference, systemScheme],
  );
  const overrideColors = useMemo(() => getColorsForTheme(resolved), [resolved]);
  const overrideBun = useMemo(() => getBunColors(resolved), [resolved]);
  const value = useMemo<ThemeContextValue>(
    () => ({
      ...parent,
      preference,
      resolved,
      colors: overrideColors,
      bun: overrideBun,
    }),
    [parent, preference, resolved, overrideColors, overrideBun],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function ThemedStatusBar() {
  const { resolved } = useTheme();
  return <StatusBar style={resolved === "dark" ? "light" : "dark"} />;
}
