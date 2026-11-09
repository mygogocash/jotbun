// 1C-T8: the terms gate and the terms step (K24, sa-terms in today's kit):
// pending versions take the screens' place; an unknown answer never blocks;
// Continue accepts exactly the pending versions once each, then the screens
// come back and the diary retries once; a later policy_required answer opens
// the terms again; a failed acceptance keeps the terms; each policy opens its
// published text in the active language; Settings stays open.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { Text } from 'react-native';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));

import type { PolicyVersionDto } from '@gogospend/contracts';

import { mountInApp, settle } from '@mobile/dev/catalogue/catalogueTestHarness';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import type { PendingPolicy, PolicyClient } from '@mobile/spend/v1/policies';
import { SpendDiaryProvider } from '@mobile/spend/v1/SpendDiaryContext';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { TermsGate } from './TermsGate';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => { router.push.mockClear(); });
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const TERMS: PendingPolicy = { kind: 'terms', version: 2 };
const PUBLISHED: PolicyVersionDto[] = [
  { kind: 'privacy', version: 4, required: true, published_at: '2026-10-01T00:00:00.000Z', text: { th: 'นโยบายฉบับที่ 4', en: 'Privacy policy, version 4' } },
  { kind: 'terms', version: 2, required: true, published_at: '2026-10-01T00:00:00.000Z', text: { th: 'ข้อกำหนดฉบับที่ 2', en: 'Terms of Service, version 2' } },
];
const COPY = {
  title: 'Our promises',
  box: 'I accept the Jotbun Terms of Service and Privacy Policy',
  reason: 'Tick the box to agree to the terms first.',
  failed: "Couldn't save your answer. Check your connection and try again.",
  safe: 'Your records are still on this phone.',
} as const;

/** A policy client whose reads answer in turn (the last answer repeats), with every acceptance recorded. */
function policyClient(reads: readonly (readonly PendingPolicy[] | Error | Promise<PendingPolicy[]>)[], accept: 'ok' | Error = 'ok') {
  const answers = [...reads];
  const accepted: PendingPolicy[] = [];
  const client = {
    pending: vi.fn(async (): Promise<PendingPolicy[]> => {
      const next = answers.length > 1 ? answers.shift() : answers[0];
      if (next instanceof Error) throw next;
      return [...(await next ?? [])];
    }),
    published: vi.fn(async (): Promise<PolicyVersionDto[]> => PUBLISHED),
    accept: vi.fn(async (policy: PendingPolicy) => {
      if (accept instanceof Error) throw accept;
      accepted.push(policy);
    }),
  } satisfies PolicyClient;
  return { client, accepted };
}

/** A `policy_required` channel the test fires. */
function channel() {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    fire: () => act(async () => {
      for (const listener of [...listeners]) listener();
      await Promise.resolve();
    }),
  };
}

async function open(client: PolicyClient, options: { locale?: Locale; events?: ReturnType<typeof channel> } = {}) {
  const diary = createFakeDiary();
  const events = options.events ?? channel();
  mountInApp(
    <SpendDiaryProvider diary={diary.diary}>
      <TermsGate client={client} subscribe={events.subscribe}>
        <Text testID="the-screens">The screens</Text>
      </TermsGate>
    </SpendDiaryProvider>,
    options.locale ?? 'en',
  );
  await settle();
  return { diary, events };
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const screens = () => screen.queryByTestId('the-screens');
const continueButton = () => screen.getByRole('button', { name: 'Continue' });
const tick = () => fireEvent.click(screen.getByRole('checkbox', { name: COPY.box }));

test('pending policies show the terms in place of the screens; none shows the screens', async () => {
  await open(policyClient([[TERMS]]).client);
  expect(await screen.findByRole('heading', { name: COPY.title })).toBeTruthy();
  expect(screens()).toBeNull();
  expect(screen.getByText('Three things Jotbun always does for you')).toBeTruthy();
  expect(screen.getAllByRole('listitem').map((item) => item.textContent?.replace('✓', ''))).toEqual([
    'No bank connection\nJotbun never connects to your bank. You write down every record yourself.',
    'We never sell your data\nYour records are never sold to anyone, whether a bank, a shop or one of our sister apps.',
    'No ads\nNo ads at all. The screen shows only your numbers.',
  ]);
  cleanup();
  const none = policyClient([[]]);
  await open(none.client);
  await flush();
  expect(none.client.pending).toHaveBeenCalledTimes(1);
  expect(screens()).toBeTruthy();
  expect(screen.queryByRole('heading', { name: COPY.title })).toBeNull();
});

test('an unknown answer never blocks: the screens show while /v1/me is read and after it fails', async () => {
  let fail: (error: Error) => void = () => undefined;
  const held = new Promise<PendingPolicy[]>((_resolve, reject) => { fail = reject; });
  const { client } = policyClient([held]);
  await open(client);
  expect(client.pending).toHaveBeenCalledTimes(1);
  expect(screens()).toBeTruthy();
  await act(async () => {
    fail(new Error('offline'));
    await Promise.resolve();
  });
  await flush();
  expect(screens()).toBeTruthy();
  expect(screen.queryByRole('heading', { name: COPY.title })).toBeNull();
});

test('Continue stays disabled until the box is ticked, then accepts exactly the pending versions once each, shows the screens and retries the diary once', async () => {
  const pending: PendingPolicy[] = [{ kind: 'privacy', version: 4 }, { kind: 'terms', version: 2 }];
  const { client, accepted } = policyClient([pending]);
  const { diary } = await open(client);
  await screen.findByRole('heading', { name: COPY.title });
  expect(continueButton().getAttribute('aria-disabled')).toBe('true');
  expect(screen.getByText(COPY.reason)).toBeTruthy();
  fireEvent.click(continueButton());
  await flush();
  expect(client.accept).not.toHaveBeenCalled();
  tick();
  expect(screen.getByRole('checkbox', { name: COPY.box }).getAttribute('aria-checked')).toBe('true');
  const go = continueButton();
  act(() => {
    fireEvent.click(go);
    fireEvent.click(go);
  });
  await flush();
  expect(accepted).toEqual(pending);
  expect(client.accept).toHaveBeenCalledTimes(2);
  expect(screens()).toBeTruthy();
  expect(diary.calls.retry).toBe(1);
});

test('a later policy_required answer reads /v1/me again and opens the terms; accepting resumes the diary', async () => {
  const { client, accepted } = policyClient([[], [TERMS], []]);
  const { diary, events } = await open(client);
  await flush();
  expect(screens()).toBeTruthy();
  await events.fire();
  await flush();
  expect(client.pending).toHaveBeenCalledTimes(2);
  expect(await screen.findByRole('heading', { name: COPY.title })).toBeTruthy();
  expect(screens()).toBeNull();
  tick();
  fireEvent.click(continueButton());
  await flush();
  expect(accepted).toEqual([TERMS]);
  expect(screens()).toBeTruthy();
  expect(diary.calls.retry).toBe(1);
});

test('a read begun before the acceptance never brings the terms back', async () => {
  let release: (value: PendingPolicy[]) => void = () => undefined;
  const late = new Promise<PendingPolicy[]>((resolve) => { release = resolve; });
  const { client, accepted } = policyClient([[TERMS], late, []]);
  const { diary, events } = await open(client);
  await screen.findByRole('heading', { name: COPY.title });
  // A policy_required answer while the terms show: a second read starts, and waits.
  await events.fire();
  expect(client.pending).toHaveBeenCalledTimes(2);
  tick();
  fireEvent.click(continueButton());
  await flush();
  expect(accepted).toEqual([TERMS]);
  expect(screens()).toBeTruthy();
  // That read answers late, with the terms just accepted.
  await act(async () => {
    release([TERMS]);
    await Promise.resolve();
  });
  await flush();
  expect(screens()).toBeTruthy();
  expect(screen.queryByRole('heading', { name: COPY.title })).toBeNull();
  expect(diary.calls.retry).toBe(1);
});

test('a failed acceptance keeps the terms with a calm line and retries nothing', async () => {
  const { client } = policyClient([[TERMS]], new Error('offline'));
  const { diary } = await open(client);
  await screen.findByRole('heading', { name: COPY.title });
  tick();
  fireEvent.click(continueButton());
  await flush();
  expect(await screen.findByText(COPY.failed)).toBeTruthy();
  expect(screen.getByText(COPY.safe)).toBeTruthy();
  expect(screen.getByRole('heading', { name: COPY.title })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: COPY.box }).getAttribute('aria-checked')).toBe('true');
  expect(screens()).toBeNull();
  expect(diary.calls.retry).toBe(0);
  // Continue works again for another try.
  expect(continueButton().getAttribute('aria-disabled')).not.toBe('true');
});

test('each policy name opens its published text in the active language', async () => {
  for (const [locale, terms, privacy, termsText, privacyText] of [
    ['en', 'Terms of Service', 'Privacy Policy', 'Terms of Service, version 2', 'Privacy policy, version 4'],
    ['th', 'ข้อกำหนดการให้บริการ', 'นโยบายความเป็นส่วนตัว', 'ข้อกำหนดฉบับที่ 2', 'นโยบายฉบับที่ 4'],
    ['vi', 'Terms of Service', 'Privacy Policy', 'Terms of Service, version 2', 'Privacy policy, version 4'],
  ] as const) {
    await open(policyClient([[TERMS]]).client, { locale });
    await screen.findAllByRole('checkbox');
    fireEvent.click(screen.getByRole('button', { name: terms }));
    const termsSheet = await screen.findByRole('dialog', { name: terms });
    expect(await within(termsSheet).findByText(termsText)).toBeTruthy();
    fireEvent.click(within(termsSheet).getByRole('button', { name: translateCopy('Close', locale) }));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: privacy }));
    const privacySheet = await screen.findByRole('dialog', { name: privacy });
    expect(await within(privacySheet).findByText(privacyText)).toBeTruthy();
    cleanup();
  }
});

test('Settings opens /settings', async () => {
  const { client } = policyClient([[TERMS]]);
  await open(client);
  await screen.findByRole('heading', { name: COPY.title });
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(router.push).toHaveBeenCalledWith('/settings');
  expect(client.accept).not.toHaveBeenCalled();
});
