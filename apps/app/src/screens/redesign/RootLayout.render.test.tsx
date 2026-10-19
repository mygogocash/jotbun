// The root stack (redesign R8, reduced motion): moving between screens slides,
// except when the person has asked for less motion, when it cross-fades
// instead, as Apple's guidance says. The stack keeps its header hidden.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';

import RootLayout from '../../../app/_layout';

vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  return { Stack: ({ screenOptions }: { screenOptions: unknown }) => createElement(Text, { testID: 'stack' }, JSON.stringify(screenOptions)) };
});
vi.mock('expo-font', () => ({ useFonts: () => [true, null] }));
vi.mock('@mobile/theme/appFonts', () => ({ spendRuntimeFonts: {} }));
vi.mock('@mobile/i18n/deviceLocale', () => ({ deviceLocale: () => 'en' }));
vi.mock('@mobile/notifications/useReminderUpkeep', () => ({ useReminderUpkeep: () => undefined }));
vi.mock('react-native-safe-area-context', async () => {
  const { Fragment, createElement } = await import('react');
  return { SafeAreaProvider: ({ children }: { children: unknown }) => createElement(Fragment, null, children as never) };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const options = () => JSON.parse(screen.getByTestId('stack').textContent ?? '{}') as Record<string, unknown>;

test('screens slide in by default, with no header', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  render(<RootLayout />);
  await waitFor(() => expect(options()).toEqual({ headerShown: false, animation: 'default' }));
});

test('under reduced motion, screens cross-fade instead of sliding', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  render(<RootLayout />);
  await waitFor(() => expect(options()).toEqual({ headerShown: false, animation: 'fade' }));
});
