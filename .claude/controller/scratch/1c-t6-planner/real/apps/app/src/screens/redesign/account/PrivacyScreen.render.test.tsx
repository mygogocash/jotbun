// R6 Privacy and data (plan §6.4): the promises, the export through
// privacy.ts and account deletion through deletion.ts, on the fakes in the
// catalogue's settings sections. The fresh sign-in is the fake's; the app
// build has none yet for any method, and the screen says so.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('@mobile/dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('@mobile/dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID(), digestStringAsync: async () => '', CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));
vi.mock('@mobile/api/sharedV1', () => ({
  v1ClientVersion: () => null,
  getSharedV1Resources: () => { throw new Error('Privacy never reads the real API in a test.'); },
}));

import { FAKE_CREDENTIALS, FAKE_EXPORT_ID, FAKE_REQUEST_ID, fakePrivacy } from '@mobile/dev/catalogue/account/settingsSections';
import { installStoreBackend } from '@mobile/wallet/store/deviceWalletStore';
import type { StoreBackend } from '@mobile/wallet/store/walletStore';
import type { FakePrivacyOptions } from '@mobile/dev/catalogue/account/settingsSections';
import { router } from '@mobile/dev/catalogue/routerTestStub';
import type { Locale } from '@mobile/i18n/locales';
import { translateCopy } from '@mobile/i18n/messages';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import { bunDark, bunLight } from '@mobile/theme/bunPalette';
import { NOW, leading, mountScreen, rgb } from '../HistoryTestHarness';
import { PrivacyScreen } from './PrivacyScreen';

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  for (const fn of [router.push, router.replace, router.back]) fn.mockReset();
  router.canGoBack.mockReset().mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

type Mount = FakePrivacyOptions & { diary?: ReturnType<typeof createFakeDiary> | null; locale?: Locale; mode?: 'light' | 'dark' };

/** Privacy on the fakes (as `FakePrivacyOptions` say), today pinned to 29 September 2026 in Bangkok. */
function mountPrivacy({ diary = createFakeDiary(), locale = 'en', mode = 'light', ...privacy }: Mount = {}) {
  const fake = fakePrivacy(privacy);
  mountScreen(<PrivacyScreen services={fake.services} now={NOW} />, { resources: createFakeResources().resources, diary: diary?.diary ?? null, locale, mode });
  return fake;
}

const EVERYTHING = { from: '1970-01-01', through: '2026-09-29' };
const FILE = 'jotbun-export-1970-01-01-to-2026-09-29.csv';
const dialog = (name: string) => screen.getByRole('dialog', { name });
const exportCard = () => screen.getByTestId('privacy-export');
const deleteCard = () => screen.getByTestId('privacy-delete');
const press = (name: string, scope: HTMLElement = document.body) => fireEvent.click(within(scope).getByRole('button', { name }));

// ---------------------------------------------------------------------------
// Promises

// "Not even Jotbun can read your diary" was untrue (the server builds the
// export from the records), so the fourth promise is one the app keeps.
test('the promises: no bank connection, never sold, no ads, and export or delete any time', () => {
  mountPrivacy();
  expect(screen.getByRole('heading', { name: 'Privacy and data' })).toBeTruthy();
  const promises = screen.getByTestId('privacy-promises');
  expect(within(promises).getAllByRole('listitem').map((item) => item.textContent?.replace('✓', ''))).toEqual([
    'Jotbun never connects to your bank.',
    'Your data is never sold.',
    'No ads, ever.',
    'Export or delete your diary any time.',
  ]);
  expect(screen.queryByText(/Not even Jotbun/)).toBeNull();
});

// ---------------------------------------------------------------------------
// Export

test('export, idle: what it gives and that it asks for a fresh sign-in; nothing is requested yet', () => {
  const fake = mountPrivacy();
  expect(within(exportCard()).getByRole('heading', { name: 'Export your data' })).toBeTruthy();
  expect(within(exportCard()).getByText('Get every entry in your diary as a spreadsheet file (CSV).')).toBeTruthy();
  expect(within(exportCard()).getByText("You'll sign in again to confirm it's you.")).toBeTruthy();
  expect(within(exportCard()).getByRole('button', { name: 'Request export' })).toBeTruthy();
  expect(fake.calls.fresh).toBe(0);
  expect(fake.calls.exportRequests).toEqual([]);
});

test('export, ready: a fresh sign-in for export, everything up to today, then ready until a set time; Download hands the verified file over', async () => {
  const fake = mountPrivacy({ statuses: ['ready'] });
  press('Request export', exportCard());
  expect(await within(exportCard()).findByText('Your file is ready')).toBeTruthy();
  expect(fake.calls.fresh).toBe(1);
  expect(fake.calls.exportRequests.map((request) => request.filter)).toEqual([EVERYTHING]);
  // On the fresh session's own credentials, with a command id and a proof id of its own.
  const [sent] = fake.calls.exportRequests;
  expect(sent.credentials).toEqual(FAKE_CREDENTIALS);
  expect(sent.proofId).not.toBe(sent.commandId);
  expect(within(exportCard()).getByText('Ready until Wed 30 Sep, 10:00')).toBeTruthy();
  expect(within(exportCard()).getByText('4 entries')).toBeTruthy();
  press('Download', exportCard());
  expect(await within(exportCard()).findByText(`Downloaded ${FILE}.`)).toBeTruthy();
  expect(fake.calls.grants).toBe(1);
  expect(fake.calls.saved.map((file) => file.fileName)).toEqual([FILE]);
  expect(fake.calls.saved[0].csv.startsWith('﻿record_id,')).toBe(true);
});

test('export, ready but not saved: closing the share sheet is not a download', async () => {
  const fake = mountPrivacy({ statuses: ['ready'], save: false });
  press('Request export', exportCard());
  press('Download', await within(exportCard()).findByTestId('privacy-export-ready'));
  await waitFor(() => expect(fake.calls.saved.length).toBe(1));
  expect(within(exportCard()).queryByText(/^Downloaded/)).toBeNull();
  expect(within(exportCard()).getByRole('button', { name: 'Download' })).toBeTruthy();
});

test('export, preparing: the stages, then Check again asks about the same export', async () => {
  const fake = mountPrivacy({ statuses: ['pending', 'pending', 'pending', 'ready'] });
  press('Request export', exportCard());
  const check = await within(exportCard()).findByRole('button', { name: 'Check again' });
  const stages = within(exportCard()).getAllByRole('listitem').map((item) => item.getAttribute('aria-label'));
  expect(stages).toEqual(['Request sent, Done', 'Preparing your file, In progress', 'Ready to download, Waiting']);
  expect(within(exportCard()).getByText('This can take a few minutes.')).toBeTruthy();
  fireEvent.click(check);
  expect(await within(exportCard()).findByText('Your file is ready')).toBeTruthy();
  expect(new Set(fake.calls.statusChecks)).toEqual(new Set([FAKE_EXPORT_ID]));
  expect(fake.calls.exportRequests.length).toBe(1);
});

test('export, expired: says how long files are kept, and a new export needs a new sign-in', async () => {
  const fake = mountPrivacy({ statuses: ['expired', 'ready'] });
  press('Request export', exportCard());
  expect(await within(exportCard()).findByText("This file has expired. Files are kept for 24 hours after they're ready.")).toBeTruthy();
  press('Request a new export', exportCard());
  expect(await within(exportCard()).findByText('Your file is ready')).toBeTruthy();
  expect(fake.calls.fresh).toBe(2);
  expect(fake.calls.exportRequests[1].commandId).not.toBe(fake.calls.exportRequests[0].commandId);
});

test('export, failed: a plain failure, and too large offers this year instead', async () => {
  mountPrivacy({ statuses: ['failed'] });
  press('Request export', exportCard());
  expect(await within(exportCard()).findByText("Jotbun couldn't make your file. Your diary is unchanged.")).toBeTruthy();
  expect(within(exportCard()).getByRole('button', { name: 'Try again' })).toBeTruthy();
  cleanup();
  const fake = mountPrivacy({ statuses: ['too_large', 'ready'] });
  press('Request export', exportCard());
  expect(await within(exportCard()).findByText('Your diary is too large for one file.')).toBeTruthy();
  press('Export this year instead', exportCard());
  expect(await within(exportCard()).findByText('Your file is ready')).toBeTruthy();
  expect(fake.calls.exportRequests.map((request) => request.filter)).toEqual([EVERYTHING, { from: '2026-01-01', through: '2026-09-29' }]);
});

test('export, the answer was lost: Try again resends the very same request, with no new sign-in', async () => {
  const fake = mountPrivacy({ exportRequests: ['lost', 'ack'], statuses: ['ready'] });
  press('Request export', exportCard());
  expect(await within(exportCard()).findByText("We couldn't tell if Jotbun got your request. Try again to send the same request.")).toBeTruthy();
  press('Try again', exportCard());
  expect(await within(exportCard()).findByText('Your file is ready')).toBeTruthy();
  expect(fake.calls.fresh).toBe(1);
  expect(fake.calls.exportRequests).toHaveLength(2);
  expect(fake.calls.exportRequests[1]).toEqual(fake.calls.exportRequests[0]);
});

test('export, a rate limit after the request: the very same request is kept, and Try again resends it', async () => {
  const fake = mountPrivacy({ exportRequests: ['refused', 'ack'], statuses: ['ready'] });
  press('Request export', exportCard());
  expect(await within(exportCard()).findByText("We couldn't tell if Jotbun got your request. Try again to send the same request.")).toBeTruthy();
  press('Try again', exportCard());
  expect(await within(exportCard()).findByText('Your file is ready')).toBeTruthy();
  expect(fake.calls.fresh).toBe(1);
  expect(fake.calls.exportRequests).toHaveLength(2);
  expect(fake.calls.exportRequests[1]).toEqual(fake.calls.exportRequests[0]);
});

test('export, a sign-in too old for the server or a cancelled sign-in: nothing was requested, and saying so', async () => {
  mountPrivacy({ exportRequests: ['reauth'] });
  press('Request export', exportCard());
  expect(await within(exportCard()).findByText('Your sign-in check expired. Nothing was requested.')).toBeTruthy();
  expect(within(exportCard()).getByRole('button', { name: 'Request export' })).toBeTruthy();
  cleanup();
  const fake = mountPrivacy({ fresh: 'cancelled' });
  press('Request export', exportCard());
  expect(await within(exportCard()).findByText('Nothing was requested.')).toBeTruthy();
  expect(fake.calls.exportRequests).toEqual([]);
});

test('export, a fresh sign-in that does not go through, or cannot be reached: nothing was requested, and saying so', async () => {
  const fake = mountPrivacy({ fresh: 'wrong_code' });
  press('Request export', exportCard());
  expect(await within(exportCard()).findByText('Your sign-in check expired. Nothing was requested.')).toBeTruthy();
  expect(fake.calls.exportRequests).toEqual([]);
  cleanup();
  const unreachable = mountPrivacy({ fresh: 'unreachable' });
  press('Request export', exportCard());
  expect(await within(exportCard()).findByText("Couldn't reach the sign-in service. Nothing was requested. Try again.")).toBeTruthy();
  expect(unreachable.calls.exportRequests).toEqual([]);
});

test('offline: a status check that cannot reach Jotbun says so, and Check again asks once more', async () => {
  const fake = mountPrivacy({ statuses: ['pending', 'offline', 'ready'] });
  press('Request export', exportCard());
  expect(await within(exportCard()).findByText("Couldn't reach Jotbun. Your file is still being prepared.")).toBeTruthy();
  press('Check again', exportCard());
  expect(await within(exportCard()).findByText('Your file is ready')).toBeTruthy();
  expect(fake.calls.exportRequests).toHaveLength(1);
});

// ---------------------------------------------------------------------------
// Deleting the account

test('delete, the warning: calm, plain, "download your data first", and the button is not the main action', () => {
  mountPrivacy();
  expect(within(deleteCard()).getByRole('heading', { name: 'Delete your account' })).toBeTruthy();
  expect(within(deleteCard()).getByText("Deleting your account erases your diary, wallets, budgets and settings from Jotbun. It can't be undone.")).toBeTruthy();
  expect(within(deleteCard()).getByText('Download your data first if you want to keep a copy.')).toBeTruthy();
  const button = within(deleteCard()).getByRole('button', { name: 'Delete my account' });
  expect(button.style.backgroundColor).not.toEqual(rgb(bunLight.ink));
});

test('delete without a fresh sign-in in this build: it says so plainly; nothing is asked or deleted', () => {
  const fake = mountPrivacy({ fresh: 'none' });
  expect(within(deleteCard()).getByText("Deleting your account needs a fresh sign-in, which this build can't do yet.")).toBeTruthy();
  expect(within(exportCard()).getByText("Exporting needs a fresh sign-in, which this build can't do yet.")).toBeTruthy();
  const button = within(deleteCard()).getByRole('button', { name: 'Delete my account' });
  expect(button.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(button);
  fireEvent.click(within(exportCard()).getByRole('button', { name: 'Request export' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(fake.calls.fresh).toBe(0);
  expect(fake.calls.deletions).toEqual([]);
});

test('delete asks first, with the consequence; Keep my account is the safe default and changes nothing', () => {
  const fake = mountPrivacy();
  press('Delete my account', deleteCard());
  const sheet = dialog('Delete your account?');
  expect(within(sheet).getByText("You'll sign in again to confirm it's you. Then Jotbun erases your account and this phone's copy of your diary. This can't be undone.")).toBeTruthy();
  const [keep, remove] = within(sheet).getAllByRole('button').filter((button) => button.getAttribute('aria-label') !== 'Close');
  expect(keep.textContent).toBe('Keep my account');
  expect(remove.textContent).toBe('Delete my account');
  expect(keep.style.backgroundColor).toEqual(rgb(bunLight.ink));
  fireEvent.click(keep);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(fake.calls.fresh).toBe(0);
});

test("delete, accepted: a fresh sign-in for deletion, the receipt, and this phone's copy erased; Done signs out", async () => {
  const diary = createFakeDiary();
  const fake = mountPrivacy({ diary });
  press('Delete my account', deleteCard());
  press('Delete my account', dialog('Delete your account?'));
  expect(await within(deleteCard()).findByText('Your account is being deleted')).toBeTruthy();
  expect(fake.calls.fresh).toBe(1);
  expect(within(deleteCard()).getByText(`Request number: ${FAKE_REQUEST_ID}`)).toBeTruthy();
  expect(within(deleteCard()).getByText("Jotbun finishes erasing your data within 24 hours. You don't need to do anything else.")).toBeTruthy();
  expect(within(deleteCard()).getByText("This phone's copy of your diary has been erased.")).toBeTruthy();
  expect(diary.calls.eraseForSignOut).toBe(1);
  expect(fake.calls.signOut).toBe(0);
  press('Done', deleteCard());
  await waitFor(() => expect(fake.calls.signOut).toBe(1));
});

test('delete, refused: nothing was deleted, and this phone keeps its entries, locked', async () => {
  const diary = createFakeDiary();
  let locked = 0;
  diary.diary.close = async () => { locked += 1; };
  mountPrivacy({ diary, deletions: ['refused'], receipt: 'none' });
  press('Delete my account', deleteCard());
  press('Delete my account', dialog('Delete your account?'));
  expect(await within(deleteCard()).findByText("Jotbun didn't accept the request, so nothing was deleted.")).toBeTruthy();
  expect(within(deleteCard()).getByText('Your diary is locked on this phone. Entries saved here are kept.')).toBeTruthy();
  expect(diary.calls.eraseForSignOut).toBe(0);
  expect(locked).toBe(1);
});

test('delete, the answer was lost: nothing on this phone is erased, and Try again sends the same request', async () => {
  const diary = createFakeDiary();
  const fake = mountPrivacy({ diary, deletions: ['lost', 'accepted'], receipt: 'none' });
  press('Delete my account', deleteCard());
  press('Delete my account', dialog('Delete your account?'));
  expect(await within(deleteCard()).findByText("We couldn't confirm your request. Nothing on this phone was erased. Try again to send the same request.")).toBeTruthy();
  expect(diary.calls.eraseForSignOut).toBe(0);
  press('Try again', deleteCard());
  expect(await within(deleteCard()).findByText('Your account is being deleted')).toBeTruthy();
  expect(fake.calls.fresh).toBe(1);
  expect(fake.calls.deletions).toHaveLength(2);
  expect(fake.calls.deletions[1]).toEqual(fake.calls.deletions[0]);
  expect(diary.calls.eraseForSignOut).toBe(1);
});

test("delete, the request: on the fresh session's own credentials, in the app's language (Thai in Thai, English otherwise)", async () => {
  const english = mountPrivacy();
  press('Delete my account', deleteCard());
  press('Delete my account', dialog('Delete your account?'));
  expect(await within(deleteCard()).findByText('Your account is being deleted')).toBeTruthy();
  const [sent] = english.calls.deletions;
  expect(sent.language).toBe('en');
  expect(sent.credentials).toEqual(FAKE_CREDENTIALS);
  expect(sent.proofId).not.toBe(sent.commandId);
  cleanup();
  const thai = mountPrivacy({ locale: 'th' });
  const remove = translateCopy('Delete my account', 'th');
  press(remove, deleteCard());
  press(remove, dialog(translateCopy('Delete your account?', 'th')));
  await waitFor(() => expect(thai.calls.deletions).toHaveLength(1));
  expect(thai.calls.deletions[0].language).toBe('th');
});

test("delete, a fresh sign-in that does not go through: nothing was deleted, and this phone's copy is neither erased nor locked", async () => {
  const diary = createFakeDiary();
  let locked = 0;
  diary.diary.close = async () => { locked += 1; };
  const fake = mountPrivacy({ diary, fresh: 'other_account' });
  press('Delete my account', deleteCard());
  press('Delete my account', dialog('Delete your account?'));
  expect(await within(deleteCard()).findByText('Your sign-in check expired. Nothing was deleted.')).toBeTruthy();
  expect(fake.calls.deletions).toEqual([]);
  expect(diary.calls.eraseForSignOut).toBe(0);
  expect(locked).toBe(0);
  expect(within(deleteCard()).getByRole('button', { name: 'Delete my account' })).toBeTruthy();
});

test("delete, a sign-in that cannot be reached sends nothing; a failure after the request that is not Jotbun's answer keeps that request for Try again", async () => {
  const unreachable = mountPrivacy({ fresh: 'unreachable' });
  press('Delete my account', deleteCard());
  press('Delete my account', dialog('Delete your account?'));
  expect(await within(deleteCard()).findByText("Couldn't reach the sign-in service. Nothing was deleted. Try again.")).toBeTruthy();
  expect(unreachable.calls.deletions).toEqual([]);
  cleanup();
  const diary = createFakeDiary();
  const fake = mountPrivacy({ diary, deletions: ['broken', 'accepted'] });
  press('Delete my account', deleteCard());
  press('Delete my account', dialog('Delete your account?'));
  expect(await within(deleteCard()).findByText("We couldn't confirm your request. Nothing on this phone was erased. Try again to send the same request.")).toBeTruthy();
  expect(diary.calls.eraseForSignOut).toBe(0);
  press('Try again', deleteCard());
  expect(await within(deleteCard()).findByText('Your account is being deleted')).toBeTruthy();
  expect(fake.calls.fresh).toBe(1);
  expect(fake.calls.deletions[1]).toEqual(fake.calls.deletions[0]);
});

function memoryBackend(): { rows: Map<string, string>; backend: StoreBackend } {
  const rows = new Map<string, string>();
  const backend: StoreBackend = {
    getItem: async (key) => rows.get(key) ?? null,
    setItem: async (key, value) => void rows.set(key, value),
    removeItem: async (key) => void rows.delete(key),
    getAllKeys: async () => [...rows.keys()],
    multiRemove: async (keys) => {
      for (const key of keys) rows.delete(key);
    },
  };
  return { rows, backend };
}

test("a confirmed deletion erases this account's kept looks; a refused one keeps them", async () => {
  const { rows, backend } = memoryBackend();
  installStoreBackend(backend);
  try {
    const accepted = createFakeDiary();
    const accountId = accepted.diary.getView().accountId;
    expect(accountId).toBe('00000000-0000-4000-8000-0000000000aa');
    const looks = `jotbun.account.${accountId}.looks`;
    rows.set(looks, 'warm');
    rows.set('jotbun.wallet.private-mode', 'on');
    mountPrivacy({ diary: accepted });
    press('Delete my account', deleteCard());
    press('Delete my account', dialog('Delete your account?'));
    expect(await within(deleteCard()).findByText('Your account is being deleted')).toBeTruthy();
    expect(rows.has(looks)).toBe(false);
    expect(rows.get('jotbun.wallet.private-mode')).toBe('on');

    cleanup();
    rows.set(looks, 'warm');
    const refused = createFakeDiary();
    refused.diary.close = async () => undefined;
    mountPrivacy({ diary: refused, deletions: ['refused'], receipt: 'none' });
    press('Delete my account', deleteCard());
    press('Delete my account', dialog('Delete your account?'));
    expect(await within(deleteCard()).findByText("Jotbun didn't accept the request, so nothing was deleted.")).toBeTruthy();
    expect(rows.get(looks)).toBe('warm');
    expect(rows.get('jotbun.wallet.private-mode')).toBe('on');
  } finally {
    installStoreBackend(null);
  }
});

test('delete, completed by the time the receipt is read: the account has been deleted', async () => {
  mountPrivacy({ deletions: ['lost'], receipt: 'completed' });
  press('Delete my account', deleteCard());
  press('Delete my account', dialog('Delete your account?'));
  expect(await within(deleteCard()).findByText('Your account has been deleted')).toBeTruthy();
});

// ---------------------------------------------------------------------------
// Back, Thai, dark, touch targets

test('Back returns to the screen below, or Settings when there is none', () => {
  mountPrivacy();
  press('Back');
  expect(router.back).toHaveBeenCalledTimes(1);
  router.canGoBack.mockReturnValue(false);
  press('Back');
  expect(router.replace).toHaveBeenCalledWith('/settings');
});

test('Thai: the screen reads in Thai with Thai leading', () => {
  mountPrivacy({ locale: 'th' });
  const title = screen.getByRole('heading', { name: translateCopy('Privacy and data', 'th') });
  expect(title.style.lineHeight).toBe(leading('title', 'th'));
  expect(screen.getByText(translateCopy('Your data is never sold.', 'th')).style.lineHeight).toBe(leading('body', 'th'));
});

test('dark mode: the night ground', () => {
  mountPrivacy({ mode: 'dark' });
  expect(screen.getByTestId('privacy-screen').style.backgroundColor).toEqual(rgb(bunDark.background));
});

test('every control is at least 44 pt tall', async () => {
  mountPrivacy({ statuses: ['ready'] });
  press('Request export', exportCard());
  await within(exportCard()).findByText('Your file is ready');
  const controls = screen.getAllByRole('button');
  expect(controls.length).toBeGreaterThanOrEqual(3);
  for (const control of controls) expect(Number.parseFloat(control.style.minHeight)).toBeGreaterThanOrEqual(44);
});
