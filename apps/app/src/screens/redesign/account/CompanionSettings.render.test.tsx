import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../../dev/catalogue/safeAreaTestStub'));

import { AiCompanionProvider } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';

import { mountScreen } from '../HistoryTestHarness';
import { CompanionSettings } from './CompanionSettings';

afterEach(cleanup);

const mount = (ai: ReturnType<typeof fakeAiResources>) =>
  mountScreen(<AiCompanionProvider resources={ai.resources}><CompanionSettings /></AiCompanionProvider>, { resources: createFakeResources().resources });
const group = (name: string) => screen.getByRole('radiogroup', { name });

test('turning AI help on goes through the consent sheet, and agreeing sends the current notice', async () => {
  const ai = fakeAiResources();
  mount(ai);
  await waitFor(() => expect(ai.resources.preferences).toHaveBeenCalled());
  fireEvent.click(within(group("Bun's AI help")).getByRole('radio', { name: 'On' }));
  expect(await screen.findByText("Turn on Bun's help?")).toBeTruthy();
  expect(ai.resources.setPreferences).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: "Turn on Bun's help" }));
  await waitFor(() => expect(ai.resources.setPreferences).toHaveBeenCalledWith({ companion: true, notice_version: 1 }));
  expect(await screen.findByText('Left today: 30 sentences, 10 slips, 20 questions.')).toBeTruthy();
});

test('turning AI help off is immediate; cashback tips switch on their own', async () => {
  const ai = fakeAiResources({}, { companion: true, notice_version: 1 });
  mount(ai);
  await waitFor(() => expect(within(group("Bun's AI help")).getByRole('radio', { name: 'On' }).getAttribute('aria-checked')).toBe('true'));
  fireEvent.click(within(group("Bun's AI help")).getByRole('radio', { name: 'Off' }));
  await waitFor(() => expect(ai.resources.setPreferences).toHaveBeenCalledWith({ companion: false }));
  fireEvent.click(within(group('Cashback tips')).getByRole('radio', { name: 'On' }));
  await waitFor(() => expect(ai.resources.setPreferences).toHaveBeenCalledWith({ cashback_tips: true }));
});
