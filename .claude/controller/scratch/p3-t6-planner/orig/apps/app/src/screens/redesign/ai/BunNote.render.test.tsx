import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { AiCompanionProvider } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { fakeAiResources } from '@mobile/spend/v1/ai/testing/fakeAiResources';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';

import { mountScreen } from '../HistoryTestHarness';
import { BunNote, forgetBunNotes } from './BunNote';

afterEach(cleanup);
beforeEach(forgetBunNotes);

const note = (text: string) => vi.fn(async (date: string) => ({ date, facts: [{ kind: 'spent_today' as const, amount_minor: '6000', count: 1 }], text, source: 'facts' as const }));

test('shows the day’s note from the person’s own numbers', async () => {
  const ai = fakeAiResources({ note: note('1 logged today, ฿60 in all.') });
  mountScreen(<AiCompanionProvider resources={ai.resources}><BunNote today="2026-10-24" locale="en" /></AiCompanionProvider>, { resources: createFakeResources().resources });
  expect(await screen.findByText(/1 logged today/)).toBeTruthy();
  expect(ai.resources.note).toHaveBeenCalledWith('2026-10-24', 'en');
});

test('a visit back the same day reuses the note and spends no new use', async () => {
  const ai = fakeAiResources({ note: note('1 logged today, ฿60 in all.') });
  const mount = () => mountScreen(<AiCompanionProvider resources={ai.resources}><BunNote today="2026-10-24" locale="en" /></AiCompanionProvider>, { resources: createFakeResources().resources });
  mount();
  await screen.findByText(/1 logged today/);
  cleanup();
  mount();
  expect(await screen.findByText(/1 logged today/)).toBeTruthy();
  await waitFor(() => expect(ai.resources.note).toHaveBeenCalledTimes(1));
});

test('offline there is simply no note', async () => {
  const ai = fakeAiResources({ note: vi.fn(async () => { throw new TypeError('Network request failed'); }) });
  mountScreen(<AiCompanionProvider resources={ai.resources}><BunNote today="2026-10-24" locale="th" /></AiCompanionProvider>, { resources: createFakeResources().resources });
  await waitFor(() => expect(ai.resources.note).toHaveBeenCalled());
  expect(screen.queryByTestId('home-bun-note')).toBeNull();
});
