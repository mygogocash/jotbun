// The R6 routes: `/` and `/login` show the redesigned first run and sign-in
// under the `account` area and today's screens without it; `/settings` and
// `/settings/privacy` exist only under the area, and need a session.
import { cleanup, render as renderRaw, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ThemeProvider } from '@mobile/theme/ThemeProvider';

import Welcome from '../../../../app/index';
import Login from '../../../../app/login';
import SettingsLayout from '../../../../app/settings/_layout';
import SettingsRoute from '../../../../app/settings/index';
import PrivacyRoute from '../../../../app/settings/privacy';

const auth = vi.hoisted(() => ({ isAuthed: true, ready: true }));
vi.mock('@mobile/auth/useAuthGuardSession', () => ({ useAuthGuardSession: () => auth }));
vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const { Text } = await import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => createElement(Text, null, `redirect to ${href}`),
    Slot: () => createElement(Text, null, 'settings screens'),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  };
});
vi.mock('@mobile/api/sharedV1', () => ({ getSharedV1Resources: () => ({ marker: 'shared resources' }) }));
vi.mock('@mobile/spend/v1/DeviceDiaryProvider', async () => {
  const { createElement, Fragment } = await import('react');
  return { DeviceDiaryProvider: ({ children }: { children: unknown }) => createElement(Fragment, null, children as never) };
});
function stub(name: string, text: string) {
  return async () => {
    const { createElement } = await import('react');
    const { Text } = await import('react-native');
    return { [name]: () => createElement(Text, null, text) };
  };
}
vi.mock('@mobile/spend/SpendIntroScreen', stub('SpendIntro', 'current welcome'));
// Today's login frame pulls in native-only modules; this test only needs to know it is the one shown.
vi.mock('@mobile/components/ProfileSubPageFrame', stub('ProfileSubPageFrame', 'current login'));
vi.mock('@mobile/screens/redesign/account/OnboardingScreen', stub('OnboardingScreen', 'redesigned onboarding'));
vi.mock('@mobile/screens/redesign/account/SignInScreen', stub('SignInScreen', 'redesigned sign-in'));
vi.mock('@mobile/screens/redesign/account/SettingsScreen', stub('SettingsScreen', 'settings'));
vi.mock('@mobile/screens/redesign/account/PrivacyScreen', stub('PrivacyScreen', 'privacy and data'));
// The app's own export and deletion wiring loads the real transport; the route only hands it to the screen.
vi.mock('@mobile/screens/redesign/account/privacyServices', () => ({ appPrivacyServices: () => ({ marker: 'app privacy services' }) }));
// Likewise the app's global sign-out wiring.
vi.mock('@mobile/screens/redesign/account/accountServices', () => ({ appAccountServices: () => ({ marker: 'app account services' }) }));

const render = (ui: ReactElement) => renderRaw(<IntlProvider locale="en"><ThemeProvider>{ui}</ThemeProvider></IntlProvider>);

const ENV = process.env.EXPO_PUBLIC_REDESIGN;
const flag = (value?: string) => {
  if (value === undefined) delete process.env.EXPO_PUBLIC_REDESIGN;
  else process.env.EXPO_PUBLIC_REDESIGN = value;
};
beforeEach(() => {
  flag(undefined);
  auth.isAuthed = true;
  auth.ready = true;
});
afterEach(() => {
  cleanup();
  flag(ENV);
});

test('the first run and sign-in: redesigned under the account area (on since E2 checkpoint 4), today\'s screens with it off', () => {
  flag('-account');
  render(<Welcome />);
  expect(screen.getByText('current welcome')).toBeTruthy();
  cleanup();
  render(<Login />);
  expect(screen.getByText('current login')).toBeTruthy();
  expect(screen.queryByText('redesigned sign-in')).toBeNull();
  cleanup();
  flag(undefined);
  render(<Welcome />);
  expect(screen.getByText('redesigned onboarding')).toBeTruthy();
  cleanup();
  render(<Login />);
  expect(screen.getByText('redesigned sign-in')).toBeTruthy();
});

test('settings and privacy: only under the account area (on by default), and only signed in', () => {
  flag('-account');
  render(<SettingsRoute />);
  expect(screen.getByText('redirect to /spend')).toBeTruthy();
  cleanup();
  render(<PrivacyRoute />);
  expect(screen.getByText('redirect to /spend')).toBeTruthy();
  cleanup();
  flag(undefined);
  render(<SettingsRoute />);
  expect(screen.getByText('settings')).toBeTruthy();
  cleanup();
  render(<PrivacyRoute />);
  expect(screen.getByText('privacy and data')).toBeTruthy();
  cleanup();
  render(<SettingsLayout />);
  expect(screen.getByText('settings screens')).toBeTruthy();
  cleanup();
  auth.isAuthed = false;
  render(<SettingsLayout />);
  expect(screen.getByText('redirect to /login')).toBeTruthy();
});
