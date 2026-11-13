// Fake AI and bridge resources for render tests: every call is recorded, and
// each method answers with the test's scripted value (or the defaults).
import { AI_DAILY_LIMITS, BUILTIN_CASHBACK_BRANDS, GOGOCASH_HOME } from '@gogospend/contracts';
import type { AiPreferencesDto } from '@gogospend/contracts';
import { vi } from 'vitest';

import type { AiResources } from '../aiResources';

export function aiPreferences(overrides: Partial<AiPreferencesDto> = {}): AiPreferencesDto {
  return { companion: false, cashback_tips: false, notice_version: null, current_notice_version: 1, remaining: { ...AI_DAILY_LIMITS }, available: true, ...overrides };
}

export function fakeAiResources(overrides: Partial<AiResources> = {}, preferences: Partial<AiPreferencesDto> = {}) {
  let current = aiPreferences(preferences);
  const resources: AiResources = {
    preferences: vi.fn(async () => current),
    setPreferences: vi.fn(async (update) => {
      current = { ...current, ...update, companion: update.companion ?? current.companion };
      return current;
    }),
    parse: vi.fn(async () => ({ drafts: [], source: 'ai' as const, model: 'claude-haiku-5-5' as const, escalated: false })),
    slip: vi.fn(async () => ({ drafts: [], bank: null, source: 'ai' as const, model: 'claude-opus-5-5' as const, escalated: true, kind: 'unreadable' as const, declined: false, tokens: { input: 0, output: 0 } })),
    note: vi.fn(async (date) => ({ date, facts: [{ kind: 'no_records_today' as const }], text: 'Nothing logged yet today. Add your first one?', source: 'facts' as const, model: 'rules' as const, escalated: false })),
    ask: vi.fn(async () => ({ answer: '', figures: [], source: 'ai' as const, model: 'claude-haiku-5-5' as const, escalated: false })),
    cashbackCatalogue: vi.fn(async () => ({ source: 'builtin' as const, updated_at: null, home_href: GOGOCASH_HOME, brands: [...BUILTIN_CASHBACK_BRANDS] })),
    ...overrides,
  };
  return { resources, preferences: () => current };
}
