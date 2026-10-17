import type { ThemePreference } from './themePreference';
export type ResolvedTheme = 'light' | 'dark';
export function resolveTheme(preference: ThemePreference, systemScheme: string | null | undefined): ResolvedTheme {
  return preference === 'system' ? systemScheme === 'dark' ? 'dark' : 'light' : preference;
}
