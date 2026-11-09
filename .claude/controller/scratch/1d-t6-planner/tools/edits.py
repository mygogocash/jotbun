#!/usr/bin/env python3
"""1D-T6's edits to existing files, each Find applied only when it occurs exactly once.

Usage: python3 -I edits.py <repo-root> <phase>
  phase 'red'   the test edits and the one seam the tests import (AccountChangedError, not yet thrown)
  phase 'green' the code edits
  phase 'check' prints, for every edit of both phases, how often its Find occurs (applies nothing)
An edit with Find None appends its text to the end of the file.
An edit whose Replace is already in the file is reported as applied and skipped, so a rerun changes nothing.
Exits 1, changing no file at all, when any other Find does not occur exactly once.
"""
import sys
from pathlib import Path

ROOT = Path(sys.argv[1])
PHASE = sys.argv[2]
APP = 'apps/app/'

EDITS = []


def edit(edit_id, phase, path, find, replace):
    EDITS.append((edit_id, phase, APP + path, find, replace))


# ---------------------------------------------------------------- RED: tests
# T1: client.test.ts echoes the analytics header and gains the header test.
edit('T1a', 'red', 'src/api/client.test.ts',
     "body, session: req.headers['x-gogospend-session'] ?? null }));\n",
     "body, session: req.headers['x-gogospend-session'] ?? null, analytics: req.headers['x-gogospend-analytics'] ?? null }));\n")
edit('T1b', 'red', 'src/api/client.test.ts', None, """
test("requests carry X-GoGoSpend-Analytics: off unless this phone's answer is yes", async () => {
  const send = async (analyticsOff?: () => boolean) => {
    const transport = createV1Transport({
      baseUrl,
      client: { platform: 'ios', version: '1.2.3' },
      credentials: { getAccessToken: async () => 'token-1', getSessionSnapshot: () => ({ binding: 'b'.repeat(43), epoch: 1 }) },
      analyticsOff,
    });
    const result = await transport.request('GET', '/v1/wallets', {
      validate: (value): value is { analytics: string | null } => typeof value === 'object' && value !== null && 'analytics' in value,
    });
    return result.analytics;
  };
  assert.equal(await send(() => true), 'off');
  assert.equal(await send(() => false), null);
  assert.equal(await send(), null);
  // Read at each request: an answer that changes applies to the next one.
  let off = true;
  const transport = createV1Transport({
    baseUrl,
    client: { platform: 'ios', version: '1.2.3' },
    credentials: { getAccessToken: async () => 'token-1', getSessionSnapshot: () => ({ binding: 'b'.repeat(43), epoch: 1 }) },
    analyticsOff: () => off,
  });
  const read = () => transport.request('GET', '/v1/wallets', {
    validate: (value): value is { analytics: string | null } => typeof value === 'object' && value !== null && 'analytics' in value,
  });
  assert.equal((await read()).analytics, 'off');
  off = false;
  assert.equal((await read()).analytics, null);
});
""")

# T2: controller.test.ts: the named refusal, a held no write, and three tests.
edit('T2a', 'red', 'src/analytics/controller.test.ts',
     "import { HELD_LIMIT, createAnalytics } from './controller.ts';\n",
     "import { AccountChangedError, HELD_LIMIT, createAnalytics } from './controller.ts';\n")
edit('T2b', 'red', 'src/analytics/controller.test.ts',
     """  let holdYes = false;
  const heldSets: Array<() => void> = [];
""",
     """  let holdYes = false;
  let holdNo = false;
  let heldNo: (() => void) | null = null;
  const heldSets: Array<() => void> = [];
""")
edit('T2c', 'red', 'src/analytics/controller.test.ts',
     """        if (holdYes && value.answer === 'yes') await new Promise<void>((resolve) => { heldWrites.push(resolve); });
        if (failWrite) throw new Error('store unavailable');
""",
     """        if (holdYes && value.answer === 'yes') await new Promise<void>((resolve) => { heldWrites.push(resolve); });
        if (holdNo && value.answer === 'no') {
          holdNo = false;
          await new Promise<void>((resolve) => { heldNo = resolve; });
        }
        if (failWrite) throw new Error('store unavailable');
""")
edit('T2d', 'red', 'src/analytics/controller.test.ts',
     """    holdYesWrites(value: boolean) { holdYes = value; },
""",
     """    holdYesWrites(value: boolean) { holdYes = value; },
    /** Holds the next write of a no until releaseNoWrite(). */
    holdNextNoWrite() { holdNo = true; },
    releaseNoWrite() {
      heldNo?.();
      heldNo = null;
    },
""")
edit('T2e', 'red', 'src/analytics/controller.test.ts',
     """  const refreshing = s.analytics.refresh().catch(() => undefined);
  await settle();
  const saidYes = s.analytics.answer('yes').then(() => 'resolved', () => 'rejected');
""",
     """  const refreshing = s.analytics.refresh().catch(() => undefined);
  await settle();
  const saidYes = s.analytics.answer('yes').then(() => 'resolved', (error: unknown) => (error instanceof AccountChangedError ? 'refused' : 'rejected'));
""")
edit('T2f', 'red', 'src/analytics/controller.test.ts',
     """  assert.deepEqual(s.serverLog, []);
  assert.equal(await saidYes, 'rejected');
""",
     """  assert.deepEqual(s.serverLog, []);
  assert.equal(await saidYes, 'refused');
""")
edit('T2g', 'red', 'src/analytics/controller.test.ts', None, """
test('a no given while a refresh is on its way is stored at once', async () => {
  const s = sessions({ [ACCOUNT_A]: 'yes' });
  s.signIn(ACCOUNT_A);
  await s.analytics.setAccount(ACCOUNT_A);
  assert.equal(s.analytics.status(), 'yes');
  s.holdReads();
  const refreshing = s.analytics.refresh();
  await settle();
  const saidNo = s.analytics.answer('no');
  await settle();
  // The refresh's read is still on its way: the app could be closed now and keep the no.
  assert.equal(s.analytics.status(), 'no');
  assert.deepEqual(s.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: true });
  assert.deepEqual(s.serverLog, []);
  await s.releaseReads();
  await refreshing;
  await saidNo;
  assert.deepEqual(s.serverLog, ['A:no']);
  assert.deepEqual(s.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: false });
  assert.equal(s.analytics.status(), 'no');
});

test('the no stored at the call lands before the queue writes and sends it', async () => {
  const h = harness({ consent: 'yes', weeks: 1 });
  await h.analytics.setAccount(ACCOUNT_A);
  assert.equal(h.analytics.status(), 'yes');
  h.holdNextNoWrite();
  const saidNo = h.analytics.answer('no');
  await settle();
  assert.equal(h.analytics.status(), 'no');
  // Nothing is sent or written behind a no that is still being stored.
  assert.deepEqual(h.consentCalls, []);
  h.releaseNoWrite();
  await saidNo;
  assert.deepEqual(h.consentCalls, [false]);
  assert.deepEqual(h.stored(), { accountId: ACCOUNT_A, answer: 'no', pendingServer: false });
});

test('a yes waiting while the same account signs out and in again is still sent for it', async () => {
  const s = sessions({ [ACCOUNT_A]: 'unasked' });
  s.signIn(ACCOUNT_A);
  await s.analytics.setAccount(ACCOUNT_A);
  assert.equal(s.analytics.status(), 'unanswered');
  s.holdReads();
  const refreshing = s.analytics.refresh().catch(() => undefined);
  await settle();
  const saidYes = s.analytics.answer('yes');
  s.signIn(null);
  await s.analytics.setAccount(null);
  s.signIn(ACCOUNT_A);
  const signedInAgain = s.analytics.setAccount(ACCOUNT_A);
  await s.releaseReads();
  await refreshing;
  await saidYes;
  await signedInAgain;
  // It is that account's own answer: sent once, then read back by the new sign-in.
  assert.deepEqual(s.serverLog, ['A:yes']);
  assert.equal(s.analytics.status(), 'yes');
  assert.deepEqual(s.stored(), { accountId: ACCOUNT_A, answer: 'yes', pendingServer: false });
});
""")

# T3: the sign-out erase also forgets this phone's analytics answer.
edit('T3a', 'red', 'src/mascot/bunSettingsErase.render.test.tsx',
     "import { THEME_PREFERENCE_STORAGE_KEY } from '@mobile/theme/themePreferenceStorage';\n",
     "import { THEME_PREFERENCE_STORAGE_KEY } from '@mobile/theme/themePreferenceStorage';\nimport { ANALYTICS_CONSENT_KEY } from '@mobile/analytics/consentStorage';\n")
edit('T3b', 'red', 'src/mascot/bunSettingsErase.render.test.tsx',
     ".toEqual([BUN_INTENSITY_STORAGE_KEY, HAPTIC_PREFERENCE_STORAGE_KEY, QUICK_ADD_CHEER_KEY, CELEBRATION_WEEK_KEY, CASHBACK_DECLINED_KEY]);\n",
     ".toEqual([BUN_INTENSITY_STORAGE_KEY, HAPTIC_PREFERENCE_STORAGE_KEY, QUICK_ADD_CHEER_KEY, CELEBRATION_WEEK_KEY, CASHBACK_DECLINED_KEY, ANALYTICS_CONSENT_KEY]);\n")

# T4: the root layout's render test: useSegments in its router mock, and the web build's install.
edit('T4a', 'red', 'src/screens/redesign/RootLayout.render.test.tsx',
     """  return {
    Stack: ({ screenOptions }: { screenOptions: unknown }) =>""",
     """  return {
    // AnalyticsUpkeep sends the route pattern (1D-T6).
    useSegments: () => [],
    Stack: ({ screenOptions }: { screenOptions: unknown }) =>""")
edit('T4b', 'red', 'src/screens/redesign/RootLayout.render.test.tsx',
     "import { getCredentialProvider } from '@mobile/auth/session';\n",
     "import { getCredentialProvider } from '@mobile/auth/session';\nimport { getAnalytics, setAnalytics } from '@mobile/analytics/bus';\n")
edit('T4c', 'red', 'src/screens/redesign/RootLayout.render.test.tsx', None, """
// PostHog is loaded only on iOS and Android with a project key (1D-T6). The shared
// transport is not loaded here, as in the other render tests; no session is signed in.
vi.mock('@mobile/api/sharedV1', () => ({
  fetchAccountId: async () => { throw new Error('no account in this test'); },
  getSharedAnalyticsServer: () => ({
    read: async () => { throw new Error('no server in this test'); },
    setConsent: async () => { throw new Error('no server in this test'); },
  }),
  v1ClientVersion: () => null,
}));
const posthog = vi.hoisted(() => ({ created: 0 }));
vi.mock('@mobile/analytics/posthogClient', () => ({
  createPostHogClient: () => {
    posthog.created += 1;
    throw new Error('PostHog must not start on the web');
  },
}));

test('the web build installs analytics with no PostHog client, even with a project key', async () => {
  setAnalytics(null);
  process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test';
  try {
    render(<RootLayout />);
    await waitFor(() => expect(getAnalytics()).not.toBeNull());
    expect(posthog.created).toBe(0);
    expect(getAnalytics()?.allowsAnalytics()).toBe(false);
  } finally {
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    setAnalytics(null);
  }
});
""")

# S1: the seam the RED tests import; GREEN throws it.
edit('S1', 'red', 'src/analytics/controller.ts',
     """export const HELD_LIMIT = 50;
""",
     """export const HELD_LIMIT = 50;

/** answer('yes') reached the queue after the account that gave it stopped being signed in: nothing was sent. */
export class AccountChangedError extends Error {
  constructor() {
    super('The account changed before the yes was sent');
    this.name = 'AccountChangedError';
  }
}
""")

# ---------------------------------------------------------------- GREEN: code
# G1: client.ts, the analyticsOff option.
edit('G1a', 'green', 'src/api/client.ts',
     """  allowLanHttp?: boolean;
}): V1Transport {
""",
     """  allowLanHttp?: boolean;
  /** true adds `X-GoGoSpend-Analytics: off`, which stops server events for that request (plan 1D, L4). Read at each request. */
  analyticsOff?: () => boolean;
}): V1Transport {
""")
edit('G1b', 'green', 'src/api/client.ts',
     """        'X-GoGoSpend-Client': `${options.client.platform}/${options.client.version}`,
      };
""",
     """        'X-GoGoSpend-Client': `${options.client.platform}/${options.client.version}`,
      };
      if (options.analyticsOff?.() === true) headers['X-GoGoSpend-Analytics'] = 'off';
""")

# G2: sharedV1.ts, the header from this phone's answer and the shared analytics server.
edit('G2a', 'green', 'src/api/sharedV1.ts',
     """import { v1SessionCredentials } from '@mobile/auth/session';
""",
     """import { getAnalytics } from '@mobile/analytics/bus';
import { createAnalyticsServer } from '@mobile/analytics/analyticsServer';
import type { AnalyticsDeps } from '@mobile/analytics/controller';
import { v1SessionCredentials } from '@mobile/auth/session';
""")
edit('G2b', 'green', 'src/api/sharedV1.ts',
     """let ai: AiResources | null = null;
""",
     """let ai: AiResources | null = null;
let analyticsServer: AnalyticsDeps['server'] | null = null;
""")
edit('G2c', 'green', 'src/api/sharedV1.ts',
     """    allowLanHttp: __DEV__,
  });
""",
     """    allowLanHttp: __DEV__,
    // Server events stay off unless this phone's answer is yes (plan 1D, L4).
    analyticsOff: () => getAnalytics()?.allowsAnalytics() !== true,
  });
""")
edit('G2d', 'green', 'src/api/sharedV1.ts', None, """
/** The analytics answer and identity (1D-T11's GET /v1/me/analytics) and the consent call, over the same transport. */
export function getSharedAnalyticsServer(): AnalyticsDeps['server'] {
  analyticsServer ??= createAnalyticsServer(sharedTransport());
  return analyticsServer;
}
""")

# G3: env.ts, PostHog's key and host and the crash switch.
edit('G3', 'green', 'src/config/env.ts',
     """    authUrl: process.env.EXPO_PUBLIC_AUTH_URL?.trim() || v1ApiUrl,
  };
""",
     """    authUrl: process.env.EXPO_PUBLIC_AUTH_URL?.trim() || v1ApiUrl,
    /** PostHog's project key: empty until the PostHog project exists (plan 1D, Q5), and then nothing is sent. */
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim() ?? '',
    /** PostHog's host: the Worker's /ingest proxy (1D-T2) unless set. */
    posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || `${v1ApiUrl.replace(/\\/+$/, '')}/ingest`,
    /** Scrubbed crash reports without consent (spec section 7, Q4): on unless '0' makes them consent-only. */
    crashReportsWithoutConsent: process.env.EXPO_PUBLIC_CRASH_REPORTS_WITHOUT_CONSENT?.trim() !== '0',
  };
""")

# G4: AiCompanionProvider.tsx, `ai_enabled` in every event.
edit('G4a', 'green', 'src/spend/v1/ai/AiCompanionProvider.tsx',
     """import type { AiPreferencesDto, AiPreferencesUpdate } from '@gogospend/contracts';

""",
     """import type { AiPreferencesDto, AiPreferencesUpdate } from '@gogospend/contracts';

import { getAnalytics } from '@mobile/analytics/bus';
""")
edit('G4b', 'green', 'src/spend/v1/ai/AiCompanionProvider.tsx',
     """  }), [resources, preferences, refresh, update]);
""",
     """  }), [resources, preferences, refresh, update]);
  // Every event says whether Bun's AI help is on (spec section 7, common properties).
  useEffect(() => {
    getAnalytics()?.setCommon({ ai_enabled: value.enabled });
  }, [value.enabled]);
""")

# G5: DeviceDiaryProvider.tsx, the sign-out erase forgets this phone's analytics answer.
edit('G5a', 'green', 'src/spend/v1/DeviceDiaryProvider.tsx',
     """import { fetchAccountId } from '@mobile/api/sharedV1';
""",
     """import { eraseStoredConsent } from '@mobile/analytics/consentStorage';
import { fetchAccountId } from '@mobile/api/sharedV1';
""")
edit('G5b', 'green', 'src/spend/v1/DeviceDiaryProvider.tsx',
     """eraseCheerDay(), eraseCelebratedWeek(), eraseCashbackDeclined()]);
""",
     """eraseCheerDay(), eraseCelebratedWeek(), eraseCashbackDeclined(), eraseStoredConsent().catch(() => undefined)]);
""")
edit('G5c', 'green', 'src/spend/v1/DeviceDiaryProvider.tsx',
     """ * wallet's device settings, so the next person starts from the defaults. An
""",
     """ * wallet's device settings, and this phone's analytics answer (1D-T6), so the
 * next person starts from the defaults. An
""")

# G6: controller.ts, the named refusal and the no stored at the call.
edit('G6a', 'green', 'src/analytics/controller.ts',
     """export interface Analytics {
  setAccount(accountId: string | null): Promise<void>;
  answer(answer: ConsentAnswer): Promise<void>;
""",
     """export interface Analytics {
  /** Rejects when the store or the server fails while loading the answer: callers catch it. */
  setAccount(accountId: string | null): Promise<void>;
  /**
   * A no is in force at once and stored at once, and reaches the server after any
   * call still on its way. Rejects when the queue's store write of a no fails (the
   * no stays in force), when the server refuses a yes, and with AccountChangedError
   * when the account that gave a yes is no longer signed in once the queue reaches
   * it. A yes reached while that same account is signed in again is still sent: it
   * is that account's own answer. Callers catch every rejection.
   */
  answer(answer: ConsentAnswer): Promise<void>;
""")
edit('G6b', 'green', 'src/analytics/controller.ts',
     """      if (choice === 'no') {
        // In force at once; the store and the server hear it after any call still on its way.
        applyNo();
        await serialize(async () => {
          await deps.store.write({ accountId: account, answer: 'no', pendingServer: true });
""",
     """      if (choice === 'no') {
        // In force at once, and stored at once, so a no given while another call is on its
        // way outlives the app being closed before that call ends. The server hears it after
        // that call.
        applyNo();
        const storedAtCall = deps.store.write({ accountId: account, answer: 'no', pendingServer: true }).catch(() => undefined);
        await serialize(async () => {
          // The queue's own writes come last: after that write, and after any the earlier call made.
          await storedAtCall;
          await deps.store.write({ accountId: account, answer: 'no', pendingServer: true });
""")
edit('G6c', 'green', 'src/analytics/controller.ts',
     """        if (accountId !== account) throw new Error('The account changed before the yes was sent');
""",
     """        if (accountId !== account) throw new AccountChangedError();
""")

# G7: the root layout renders AnalyticsUpkeep beside LocaleUpkeep.
edit('G7a', 'green', 'app/_layout.tsx',
     """import { installAppAuth } from '@mobile/auth/appAuth';
""",
     """import { installAppAuth } from '@mobile/auth/appAuth';
import { AnalyticsUpkeep } from '@mobile/analytics/AnalyticsUpkeep';
""")
# On one line (as at d0f8a62) the element follows LocaleUpkeep on that line; when P2-T2 has put
# each child on its own line, it gets its own line with the same indent. Either way LocaleUpkeep occurs once.
def g7b(text):
    lines = [line for line in text.split('\n') if line.strip() == '<LocaleUpkeep />']
    if len(lines) == 1:
        indent = lines[0][:len(lines[0]) - len(lines[0].lstrip())]
        return f'{indent}<LocaleUpkeep />\n', f'{indent}<LocaleUpkeep />\n{indent}<AnalyticsUpkeep />\n'
    return '<LocaleUpkeep />', '<LocaleUpkeep /><AnalyticsUpkeep />'


edit('G7b', 'green', 'app/_layout.tsx', g7b, None)


def main():
    phases = {'red': ['red'], 'green': ['green'], 'check': ['red', 'green']}[PHASE]
    problems = []
    planned = {}
    for edit_id, phase, path, find, replace in EDITS:
        if phase not in phases:
            continue
        text = planned.get(path)
        if text is None:
            text = (ROOT / path).read_text()
        if callable(find):
            find, replace = find(text)
        if replace in text:
            print(f'edit {edit_id}: already applied in {path}')
            planned[path] = text
            continue
        if find is None:
            print(f'edit {edit_id}: appends to {path}')
            planned[path] = text + replace
            continue
        count = text.count(find)
        print(f'edit {edit_id}: Find occurs {count} times in {path}')
        if count != 1:
            problems.append(edit_id)
            planned[path] = text
            continue
        planned[path] = text.replace(find, replace, 1)
    if problems:
        print('NOT APPLIED: ' + ', '.join(problems) + ' (no file was changed)')
        sys.exit(1)
    if PHASE == 'check':
        return
    for path, text in planned.items():
        if (ROOT / path).read_text() != text:
            (ROOT / path).write_text(text)
            print(f'edited {path}')


main()
