import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../../dev/catalogue/safeAreaTestStub'));

import { V1Error } from '@mobile/api/client';
import { AiCompanionProvider } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';

import { router } from '../../../dev/catalogue/routerTestStub';
import { mountScreen } from '../HistoryTestHarness';
import { AskBunScreen } from './AskBunScreen';

afterEach(cleanup);

const NOW = new Date('2026-10-24T03:00:00Z');
const mount = (ai: ReturnType<typeof fakeAiResources>) =>
  mountScreen(<AiCompanionProvider resources={ai.resources}><AskBunScreen now={NOW} /></AiCompanionProvider>, { resources: createFakeResources().resources });

test('with AI help off, Ask Bun explains itself and offers to turn it on', async () => {
  const ai = fakeAiResources();
  mount(ai);
  expect(await screen.findByText('Ask about your spending')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: "Turn on Bun's help" }));
  expect(await screen.findByText("Turn on Bun's help?")).toBeTruthy();
  expect(ai.resources.ask).not.toHaveBeenCalled();
});

test('a suggested question is answered, with the figures the answer used', async () => {
  const ai = fakeAiResources({
    ask: vi.fn(async () => ({ answer: 'You spent ฿105 on food this month.', figures: [{ label: 'expense 2026-10-01…2026-10-24 (food)', amount_minor: '10500' }], source: 'ai' as const })),
  }, { companion: true, notice_version: 1 });
  mount(ai);
  fireEvent.click(await screen.findByRole('button', { name: 'How much did I spend on food this month?' }));
  expect(await screen.findByText('You spent ฿105 on food this month.')).toBeTruthy();
  expect(screen.getByText('From your diary')).toBeTruthy();
  expect(screen.getByText('฿105.00')).toBeTruthy();
  expect(ai.resources.ask).toHaveBeenCalledWith({ question: 'How much did I spend on food this month?', today: '2026-10-24', locale: 'en' });
});

test('out of questions, Bun says so kindly and keeps the question on screen', async () => {
  const ai = fakeAiResources({ ask: vi.fn(async () => { throw new V1Error('rate_limited', 429, 'AI_LIMIT_REACHED'); }) }, { companion: true, notice_version: 1 });
  mount(ai);
  await screen.findByRole('button', { name: 'How much of my budget is left?' });
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'งบเหลือเท่าไหร่' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(await screen.findByText("You've asked all of today's questions. Bun can answer more tomorrow.")).toBeTruthy();
  expect(screen.getByText('งบเหลือเท่าไหร่')).toBeTruthy();
});

test('the day’s questions left are shown under the question field', async () => {
  const ai = fakeAiResources({}, { companion: true, notice_version: 1, remaining: { parse: 30, slip: 10, note: 3, ask: 1 } });
  mount(ai);
  expect(await screen.findByText('1 question left today')).toBeTruthy();
  await waitFor(() => expect(ai.resources.preferences).toHaveBeenCalled());
});

test('after an answer, two questions not asked yet are one tap away', async () => {
  const ai = fakeAiResources({
    ask: vi.fn(async () => ({ answer: 'You spent ฿105 on food this month.', figures: [], source: 'ai' as const })),
  }, { companion: true, notice_version: 1 });
  mount(ai);
  fireEvent.click(await screen.findByRole('button', { name: 'How much did I spend on food this month?' }));
  expect(await screen.findByText('Ask another:')).toBeTruthy();
  const next = ['Where did I spend the most this month?', 'How much of my budget is left?'];
  for (const question of next) expect(screen.getByRole('button', { name: question })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'How much did I spend on food this month?' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: next[0] }));
  await waitFor(() => expect(ai.resources.ask).toHaveBeenLastCalledWith({ question: next[0], today: '2026-10-24', locale: 'en' }));
});

test('says plainly that Bun can be wrong, with its settings one tap away', async () => {
  const ai = fakeAiResources({}, { companion: true, notice_version: 1 });
  mount(ai);
  expect(await screen.findByText('Bun can get things wrong. Each answer shows the figures from your diary that it used.')).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: "Bun's AI help settings" }));
  expect(router.push).toHaveBeenCalledWith('/settings');
});
