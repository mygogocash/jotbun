// A development build (vitest.render.config.ts defines __DEV__), which is why
// this file is in the render suite though it draws nothing, as
// src/api/sharedV1.render.test.tsx is. Here each review also counts in the
// draft tally, which useDraftReview loads with import() and which keeps its
// counts in AsyncStorage: a map in this file.
import { afterEach, expect, test, vi } from 'vitest';

const stored = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => stored.get(key) ?? null,
    setItem: async (key: string, value: string) => { stored.set(key, value); },
    removeItem: async (key: string) => { stored.delete(key); },
  },
}));

import { setConsentedTelemetrySink } from '@mobile/analytics/bus';
import type { CleanProps } from '@mobile/analytics/catalog';
import { useDraftReview } from './useDraftReview';

afterEach(() => {
  setConsentedTelemetrySink(null);
  stored.clear();
});

test('in a development build each review is sent once and counted in the draft tally with its model', async () => {
  const seen: Array<[string, CleanProps]> = [];
  setConsentedTelemetrySink((name, properties) => { seen.push([name, properties]); });
  const review = useDraftReview();
  review({ outcome: 'kept', fieldsEdited: 0, model: 'claude-haiku-5-5', escalated: false });
  review({ outcome: 'kept', fieldsEdited: 0, model: 'claude-haiku-5-5', escalated: false });
  review({ outcome: 'edited', fieldsEdited: 2, model: 'claude-opus-5-5', escalated: true });
  review({ outcome: 'dropped', fieldsEdited: 0, model: 'rules', escalated: false });
  expect(seen).toEqual([
    ['ai_draft_reviewed', { outcome: 'kept', fields_edited: 0, model: 'claude-haiku-5-5', escalated: false }],
    ['ai_draft_reviewed', { outcome: 'kept', fields_edited: 0, model: 'claude-haiku-5-5', escalated: false }],
    ['ai_draft_reviewed', { outcome: 'edited', fields_edited: 2, model: 'claude-opus-5-5', escalated: true }],
    ['ai_draft_reviewed', { outcome: 'dropped', fields_edited: 0, model: 'rules', escalated: false }],
  ]);
  // Four reviews made at once, as P3-T18 makes them: each counts, under P3-T22's key.
  // The suite's 4 s wait (src/testing/renderSetup.ts), so a missing count fails here, inside the 5 s test.
  await vi.waitFor(() => {
    expect(JSON.parse(stored.get('jotbun.dev.draft-tally') ?? 'null')).toEqual({
      'claude-haiku-5-5': { kept: 2, edited: 0, dropped: 0 },
      'claude-opus-5-5': { kept: 0, edited: 1, dropped: 0 },
      rules: { kept: 0, edited: 0, dropped: 1 },
    });
  }, { timeout: 4000 });
});
