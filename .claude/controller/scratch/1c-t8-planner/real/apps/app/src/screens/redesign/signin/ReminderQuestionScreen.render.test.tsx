// 1C-T8: today's reminder question, moved to right after sign-in (R55): Turn
// on asks the reminder service once for 20:00 and then goes on; Not now asks
// nothing and goes on. Its words are today's approved ones.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

import { mountInApp, settle } from '@mobile/dev/catalogue/catalogueTestHarness';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { PermissionOutcome, ReminderPreferenceInput } from '@mobile/notifications/reminders';
import { ReminderQuestionScreen } from './ReminderQuestionScreen';

beforeAll(() => { installBrowserStorage(); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function reminders(answer: PermissionOutcome = 'scheduled') {
  return { setPreference: vi.fn(async (_preference: ReminderPreferenceInput): Promise<PermissionOutcome> => answer) };
}

async function open(service = reminders()) {
  const onDone = vi.fn();
  mountInApp(<ReminderQuestionScreen reminders={service} onDone={onDone} />);
  await settle();
  expect(screen.getByRole('heading', { name: 'Daily reminder' })).toBeTruthy();
  expect(screen.getByText('One reminder each evening at 20:00, to log what you spent.')).toBeTruthy();
  return { service, onDone };
}

test('Turn on asks the reminder service once for 20:00, then goes on', async () => {
  const { service, onDone } = await open();
  const turnOn = screen.getByRole('button', { name: 'Turn on' });
  act(() => {
    fireEvent.click(turnOn);
    fireEvent.click(turnOn);
  });
  expect(await screen.findByText('Reminder on: every day at 20:00.')).toBeTruthy();
  expect(service.setPreference).toHaveBeenCalledTimes(1);
  expect(service.setPreference).toHaveBeenCalledWith({ enabled: true, localTime: '20:00' });
  expect(onDone).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('Not now asks nothing and goes on', async () => {
  const { service, onDone } = await open();
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(service.setPreference).not.toHaveBeenCalled();
});
