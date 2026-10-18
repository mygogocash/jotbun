export type ThemePreference = 'system' | 'light' | 'dark';
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';
export function parseThemePreference(value: unknown): ThemePreference | null {
  return value === 'system' || value === 'light' || value === 'dark' ? value : null;
}
export function colorSchemeMetaContent(preference: ThemePreference): 'light' | 'dark' | 'light dark' {
  return preference === 'system' ? 'light dark' : preference;
}
