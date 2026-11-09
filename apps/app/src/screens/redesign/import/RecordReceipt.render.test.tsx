// R7: a record's receipt photo (plan §6.5) on the in-memory fakes. The panel
// draws nothing with the import area off; under it, every state: none;
// attaching (the consent sheet before anything is sent, sending, getting the
// photo ready, saving); attached (a thumbnail of the checked bytes); full
// screen; an expired grant asked for again; unconfirmed (frozen, Try again
// resends the same command and key); changed elsewhere; removed (behind a
// sheet that says it can't be undone); uploads switched off on the server;
// offline; replace; refusals on the phone and from the server. Then Thai
// leading, dark mode, targets and labels, decorative art, reduced motion,
// palette tokens, and the catalogue's receipt sections.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useState } from 'react';
import { Animated } from 'react-native';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('expo-router', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('expo-router/build/Route', () => import('../../../dev/catalogue/routerTestStub'));
vi.mock('react-native-safe-area-context', () => import('../../../dev/catalogue/safeAreaTestStub'));
vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('@mobile/hooks/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }));

import type { TransactionDto } from '@gogospend/contracts';
import { mountInApp } from '@mobile/dev/catalogue/catalogueTestHarness';
import { RECEIPT_SECTIONS } from '@mobile/dev/catalogue/import/receiptSections';
import { translateCopy } from '@mobile/i18n/messages';
import { installBrowserStorage } from '@mobile/mascot/mascotTestHarness';
import { dataUriOf } from '@mobile/spend/v1/redesign/import/receiptModel';
import { SAMPLE_RECEIPT_PNG, createFakeAttachments } from '@mobile/spend/v1/testing/fakeAttachments';
import type { FakeAttachments } from '@mobile/spend/v1/testing/fakeAttachments';
import { createFakeResources, goldenSeed } from '@mobile/spend/v1/testing/fakeResources';
import { BUN_TEXT_PAIRS, bunDark, bunLight } from '@mobile/theme/bunPalette';
import type { BunColors } from '@mobile/theme/bunPalette';
import { contrastRatio } from '@mobile/theme/contrast';
import { RecordScreen } from '../RecordScreen';
import { FOOD_ID, NOW, hiddenFromScreenReaders, leading, mountScreen, rgb } from '../HistoryTestHarness';
import { ReceiptPortsProvider } from './ReceiptParts';
import type { ReceiptPorts } from './ReceiptParts';
import { RecordReceipt } from './RecordReceipt';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIVE_MINUTES = 5 * 60_000;
const PHOTO_URI = dataUriOf('image/png', SAMPLE_RECEIPT_PNG);
const ENV = process.env.EXPO_PUBLIC_REDESIGN;

beforeAll(() => { installBrowserStorage(); });
beforeEach(() => {
  process.env.EXPO_PUBLIC_REDESIGN = 'import';
  motion.reduced = false;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (ENV === undefined) delete process.env.EXPO_PUBLIC_REDESIGN;
  else process.env.EXPO_PUBLIC_REDESIGN = ENV;
});

type Fake = ReturnType<typeof createFakeResources>;
type Setup = { fake: Fake; files: FakeAttachments; ports: Partial<ReceiptPorts>; receipt: string | null };
type Options = { withReceipt?: boolean; locale?: 'en' | 'th' | 'vi'; mode?: 'light' | 'dark'; maxPolls?: number; prepare?: (setup: Omit<Setup, 'ports'>) => void };

let keys = 0;
function setup(options: Options = {}): Setup {
  const fake = createFakeResources(goldenSeed());
  const files = createFakeAttachments({ records: fake.records });
  const receipt = options.withReceipt ? files.seedReceipt(FOOD_ID) : null;
  options.prepare?.({ fake, files, receipt });
  const ports: Partial<ReceiptPorts> = {
    attachments: files.attachments,
    uploads: files.uploads,
    picker: files.picker,
    now: files.now,
    sleep: async () => {},
    pollMs: 0,
    maxPolls: options.maxPolls ?? 5,
    newId: () => {
      keys += 1;
      return globalThis.crypto.randomUUID();
    },
  };
  return { fake, files, ports, receipt };
}
const record = (fake: Fake): TransactionDto => fake.records.get(FOOD_ID) as TransactionDto;

/** The panel on its own with the record's id and version only, so it reads the record itself. */
function mount(options: Options = {}): Setup {
  const made = setup(options);
  mountScreen(
    <ReceiptPortsProvider ports={made.ports}>
      <RecordReceipt recordId={FOOD_ID} version={record(made.fake).version} />
    </ReceiptPortsProvider>,
    { resources: made.fake.resources, locale: options.locale, mode: options.mode },
  );
  return made;
}

const say = (english: string, locale: 'en' | 'th' | 'vi' = 'en', values?: Record<string, string | number>) => translateCopy(english, locale, values);
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const click = (name: string | RegExp) => fireEvent.click(button(name));
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const panel = () => screen.getByTestId('record-receipt');
const imageSrc = (testId: string) => screen.getByTestId(testId).querySelector('img')?.getAttribute('src') ?? null;
const callArgs = (files: FakeAttachments, method: Parameters<FakeAttachments['callsOf']>[0]) => files.callsOf(method).map((call) => call.args);

async function noReceiptYet() {
  return screen.findByRole('button', { name: 'Attach a receipt photo' });
}
async function thumbnail() {
  return screen.findByRole('button', { name: 'Open the receipt photo' });
}
/** Attach, pick the sample photo and reach the consent sheet. */
async function toConsent(): Promise<HTMLElement> {
  fireEvent.click(await noReceiptYet());
  return screen.findByRole('dialog', { name: 'Keep this receipt photo?' });
}

// ---------------------------------------------------------------------------
// The area, and Record

test('with the import area off nothing is drawn or read; under it (the default since E2 checkpoint 5) the panel sits under Record\'s slip', async () => {
  process.env.EXPO_PUBLIC_REDESIGN = '-import';
  const off = setup({ withReceipt: true });
  mountScreen(<ReceiptPortsProvider ports={off.ports}><RecordScreen id={FOOD_ID} now={NOW} /></ReceiptPortsProvider>, { resources: off.fake.resources });
  expect(await screen.findByTestId('receipt-slip')).toBeTruthy();
  await settle();
  expect(screen.queryByTestId('record-receipt')).toBeNull();
  expect(off.files.calls).toEqual([]);
  cleanup();

  delete process.env.EXPO_PUBLIC_REDESIGN;
  const on = setup({ withReceipt: true });
  mountScreen(<ReceiptPortsProvider ports={on.ports}><RecordScreen id={FOOD_ID} now={NOW} /></ReceiptPortsProvider>, { resources: on.fake.resources });
  await thumbnail();
  const slip = screen.getByTestId('receipt-slip');
  expect(slip.compareDocumentPosition(panel()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(panel()).getByRole('heading', { name: 'Receipt photo' })).toBeTruthy();
});

test('opening a record with a receipt reads it once: Record hands the panel the receipt it read', async () => {
  delete process.env.EXPO_PUBLIC_REDESIGN;
  const made = setup({ withReceipt: true });
  mountScreen(<ReceiptPortsProvider ports={made.ports}><RecordScreen id={FOOD_ID} now={NOW} /></ReceiptPortsProvider>, { resources: made.fake.resources });
  await thumbnail();
  expect(imageSrc('receipt-thumbnail-image')).toBe(PHOTO_URI);
  await settle();
  expect(made.fake.callsOf('transaction')).toHaveLength(1);
  expect(made.files.callsOf('grant')).toHaveLength(1);
});

test('a receipt kept on Record costs one more read, Record\'s own, which the panel takes', async () => {
  delete process.env.EXPO_PUBLIC_REDESIGN;
  const made = setup();
  mountScreen(<ReceiptPortsProvider ports={made.ports}><RecordScreen id={FOOD_ID} now={NOW} /></ReceiptPortsProvider>, { resources: made.fake.resources });
  fireEvent.click(within(await toConsent()).getByRole('button', { name: 'Keep this photo' }));
  await thumbnail();
  await settle();
  expect(made.fake.callsOf('transaction')).toHaveLength(2);
  expect(imageSrc('receipt-thumbnail-image')).toBe(PHOTO_URI);
});

// ---------------------------------------------------------------------------
// None, and attaching

test('none: the record holds no receipt, says so and offers Attach; no grant is asked for', async () => {
  const { files } = mount();
  expect(await noReceiptYet()).toBeTruthy();
  expect(within(panel()).getByText('No receipt photo on this entry.')).toBeTruthy();
  expect(files.callsOf('grant')).toEqual([]);
  expect(files.callsOf('pick')).toEqual([]);
});

test('attach: the consent sheet comes before anything is sent and says what is kept and for how long; Cancel sends nothing', async () => {
  const { files } = mount();
  const sheet = await toConsent();
  expect(files.callsOf('pick')).toHaveLength(1);
  // The server's facts: a cleaned copy, kept with the entry until removed, deleted for good (30 days) or the account goes; only the account opens it.
  for (const fact of [
    'Jotbun keeps a cleaned copy of this photo with this entry, without its location or camera details.',
    'It stays until you remove it, delete the entry for good (30 days after deleting it) or delete your account.',
    'In the app, only your signed-in account can open it.',
    'Nothing from the photo is added to your diary.',
  ]) expect(within(sheet).getByText(fact)).toBeTruthy();
  expect(files.callsOf('upload')).toEqual([]);
  fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await settle();
  expect(files.callsOf('upload')).toEqual([]);
  expect(files.callsOf('retain')).toEqual([]);
  expect(await noReceiptYet()).toBeTruthy();
});

test('attach: once kept, the photo is uploaded under a plain name, its preview gives the id, and the record keeps it at its version', async () => {
  const { fake, files } = mount();
  const before = record(fake).version;
  fireEvent.click(within(await toConsent()).getByRole('button', { name: 'Keep this photo' }));
  await thumbnail();
  const [[file, uploadKey]] = callArgs(files, 'upload') as [[{ name: string; contentType: string; bytes: number }, string]];
  expect(file).toEqual({ name: 'receipt.png', contentType: 'image/png', bytes: SAMPLE_RECEIPT_PNG.byteLength });
  expect(uploadKey).toMatch(UUID);
  expect(files.callsOf('preview').length).toBeGreaterThanOrEqual(2);
  const [[recordId, version, input, retainKey]] = callArgs(files, 'retain') as [[string, number, { attachment_id: string }, string]];
  expect(recordId).toBe(FOOD_ID);
  expect(version).toBe(before);
  expect(input.attachment_id).toMatch(UUID);
  expect(retainKey).toMatch(UUID);
  expect(retainKey).not.toBe(uploadKey);
  expect(record(fake)).toMatchObject({ attachment_id: input.attachment_id, version: before + 1 });
  expect(files.statusOf(input.attachment_id)).toBe('retained');
  expect(imageSrc('receipt-thumbnail-image')).toBe(PHOTO_URI);
});

test('attaching: sending the photo, getting it ready and saving each say so while they run', async () => {
  const { files } = mount();
  const sheet = await toConsent();
  const upload = files.hold('upload');
  fireEvent.click(within(sheet).getByRole('button', { name: 'Keep this photo' }));
  expect(await screen.findByText('Sending the photo…')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Attach a receipt photo' })).toBeNull();
  const preview = files.hold('preview');
  upload();
  expect(await screen.findByText('Getting the photo ready…')).toBeTruthy();
  const retain = files.hold('retain');
  preview();
  expect(await screen.findByText('Saving…')).toBeTruthy();
  retain();
  expect(await thumbnail()).toBeTruthy();
  expect(screen.queryByText('Saving…')).toBeNull();
});

test('a photo the server is slow to prepare offers Check again, which waits on the same upload', async () => {
  const { files } = mount({ maxPolls: 2, prepare: ({ files: f }) => f.setPreviewSteps(['queued', 'parsing', 'parsing']) });
  fireEvent.click(within(await toConsent()).getByRole('button', { name: 'Keep this photo' }));
  expect(await screen.findByText('Still getting the photo ready.')).toBeTruthy();
  click('Check again');
  await thumbnail();
  expect(files.callsOf('upload')).toHaveLength(1);
  const jobs = new Set(callArgs(files, 'preview').map(([job]) => job));
  expect(jobs.size).toBe(1);
});

// ---------------------------------------------------------------------------
// Attached and full screen

test('attached: a thumbnail of the bytes the grant gave, with Replace and Remove', async () => {
  const { files, receipt } = mount({ withReceipt: true });
  await thumbnail();
  expect(imageSrc('receipt-thumbnail-image')).toBe(PHOTO_URI);
  expect(callArgs(files, 'grant')).toEqual([[receipt]]);
  expect(files.callsOf('file')).toHaveLength(1);
  expect(button('Replace photo')).toBeTruthy();
  expect(button('Remove photo')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Attach a receipt photo' })).toBeNull();
});

test('full screen: the photo opens through the grant it already has while that grant has time left', async () => {
  const { files } = mount({ withReceipt: true });
  const timing = vi.spyOn(Animated, 'timing');
  fireEvent.click(await thumbnail());
  const viewer = await screen.findByRole('dialog', { name: 'Receipt photo' });
  // It fades in (reduced motion is the test below).
  expect(timing).toHaveBeenCalled();
  // react-native-web also writes a hidden <img> with the same name for the browser's own menu.
  expect(within(viewer).getAllByRole('img', { name: 'Receipt photo' })[0]).toBe(screen.getByTestId('receipt-full-image'));
  expect(imageSrc('receipt-full-image')).toBe(PHOTO_URI);
  expect(files.callsOf('grant')).toHaveLength(1);
  fireEvent.click(within(viewer).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('an expired grant is asked for again before full screen: the stale one is never used and no broken image shows', async () => {
  const { files } = mount({ withReceipt: true });
  await thumbnail();
  const [first] = callArgs(files, 'file') as [[{ url: string }]];
  files.advance(FIVE_MINUTES);
  const grant = files.hold('grant');
  fireEvent.click(button('Open the receipt photo'));
  const viewer = await screen.findByRole('dialog', { name: 'Receipt photo' });
  expect(within(viewer).getByText('Loading the receipt photo…')).toBeTruthy();
  expect(screen.queryByTestId('receipt-full-image')).toBeNull();
  grant();
  await waitFor(() => expect(imageSrc('receipt-full-image')).toBe(PHOTO_URI));
  const files_ = callArgs(files, 'file') as [{ url: string }][];
  expect(files.callsOf('grant')).toHaveLength(2);
  expect(files_).toHaveLength(2);
  expect(files_[1][0].url).not.toBe(first[0].url);
});

test('a fresh grant that cannot be had says so in words with Try again, never a broken image', async () => {
  const { files } = mount({ withReceipt: true });
  await thumbnail();
  files.advance(FIVE_MINUTES);
  files.fail('grant', 'network');
  fireEvent.click(button('Open the receipt photo'));
  const viewer = await screen.findByRole('dialog', { name: 'Receipt photo' });
  expect(await within(viewer).findByText("You're offline. The receipt photo shows when you're back online.")).toBeTruthy();
  expect(screen.queryByTestId('receipt-full-image')).toBeNull();
  fireEvent.click(within(viewer).getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(imageSrc('receipt-full-image')).toBe(PHOTO_URI));
});

test('a grant that lapses between asking and downloading is replaced once, then the photo shows', async () => {
  const { files } = mount({ withReceipt: true, prepare: ({ files: f }) => f.fail('file', 'not_found', { status: 404, code: 'NOT_FOUND' }) });
  await thumbnail();
  expect(files.callsOf('grant')).toHaveLength(2);
  expect(imageSrc('receipt-thumbnail-image')).toBe(PHOTO_URI);
});

// ---------------------------------------------------------------------------
// Unconfirmed, conflict, removed

test('unconfirmed: a lost answer freezes the panel; Try again resends the same command, key, version and photo', async () => {
  const { fake, files } = mount({ prepare: ({ files: f }) => f.loseResponse('retain') });
  fireEvent.click(within(await toConsent()).getByRole('button', { name: 'Keep this photo' }));
  expect(await screen.findByText('Not confirmed yet. Try again.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Attach a receipt photo' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Replace photo' })).toBeNull();
  click('Try again');
  await thumbnail();
  const retains = callArgs(files, 'retain');
  expect(retains).toHaveLength(2);
  expect(retains[1]).toEqual(retains[0]);
  expect(files.callsOf('upload')).toHaveLength(1);
  // It had committed: the resend replayed it, once.
  expect(record(fake).version).toBe(2);
});

test('unconfirmed upload: Try again sends the same photo under the same key', async () => {
  const { files } = mount({ prepare: ({ files: f }) => f.fail('upload', 'network') });
  fireEvent.click(within(await toConsent()).getByRole('button', { name: 'Keep this photo' }));
  expect(await screen.findByText('Not confirmed yet. Try again.')).toBeTruthy();
  click('Try again');
  await thumbnail();
  const uploads = callArgs(files, 'upload');
  expect(uploads).toHaveLength(2);
  expect(uploads[1]).toEqual(uploads[0]);
});

test('a paused server freezes the command too, with words that say so', async () => {
  const { files } = mount({ withReceipt: true, prepare: ({ files: f }) => f.fail('remove', 'unavailable', { status: 503, code: 'WRITES_PAUSED', retryAfterSeconds: 300 }) });
  await thumbnail();
  click('Remove photo');
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove the photo' }));
  expect(await screen.findByText('Jotbun has paused this for a moment. Try again later.')).toBeTruthy();
  click('Try again');
  expect(await screen.findByText('Receipt photo removed.')).toBeTruthy();
  const removes = callArgs(files, 'remove');
  expect(removes[1]).toEqual(removes[0]);
});

test('conflict: the entry changed on another device before the receipt was kept; Reload reads it again', async () => {
  const { fake, files } = mount();
  const sheet = await toConsent();
  // Another device edits the entry meanwhile.
  fake.records.set(FOOD_ID, { ...record(fake), note: 'Lunch', version: 2 });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Keep this photo' }));
  expect(await screen.findByText('This entry changed on another device.')).toBeTruthy();
  expect(callArgs(files, 'retain')[0][1]).toBe(1);
  expect(record(fake).attachment_id).toBeUndefined();
  click('Reload');
  expect(await noReceiptYet()).toBeTruthy();
  // The next attach goes on the version read now.
  fireEvent.click(within(await toConsent()).getByRole('button', { name: 'Keep this photo' }));
  await thumbnail();
  expect(callArgs(files, 'retain')[1][1]).toBe(2);
});

test('removed: the confirm sheet says it can\'t be undone; Keep it sends nothing; Remove the photo removes it for good', async () => {
  const { fake, files, receipt } = mount({ withReceipt: true });
  await thumbnail();
  click('Remove photo');
  const sheet = await screen.findByRole('dialog', { name: 'Remove the receipt photo?' });
  expect(within(sheet).getByText("The photo is deleted for good. This can't be undone, and restoring the entry won't bring it back.")).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Keep it' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(files.callsOf('remove')).toEqual([]);
  click('Remove photo');
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove the photo' }));
  expect(await screen.findByText('Receipt photo removed.')).toBeTruthy();
  const [[recordId, version, key]] = callArgs(files, 'remove') as [[string, number, string]];
  expect([recordId, version]).toEqual([FOOD_ID, 1]);
  expect(key).toMatch(UUID);
  expect(record(fake).attachment_id).toBeUndefined();
  expect(files.statusOf(receipt as string)).toBe('released');
  expect(screen.queryByTestId('receipt-thumbnail')).toBeNull();
  expect(await noReceiptYet()).toBeTruthy();
});

test('replace: the sheet also says the current photo goes for good; the record then holds the new photo', async () => {
  const { fake, files, receipt } = mount({ withReceipt: true });
  await thumbnail();
  click('Replace photo');
  const sheet = await screen.findByRole('dialog', { name: 'Replace the receipt photo?' });
  expect(within(sheet).getByText("The current photo is deleted for good. This can't be undone.")).toBeTruthy();
  expect(files.callsOf('upload')).toEqual([]);
  fireEvent.click(within(sheet).getByRole('button', { name: 'Keep the new photo' }));
  await waitFor(() => expect(files.callsOf('replace')).toHaveLength(1));
  await thumbnail();
  const [[, version, input]] = callArgs(files, 'replace') as [[string, number, { attachment_id: string }]];
  expect(version).toBe(1);
  expect(input.attachment_id).not.toBe(receipt);
  expect(record(fake)).toMatchObject({ attachment_id: input.attachment_id, version: 2 });
  expect(files.statusOf(receipt as string)).toBe('released');
  await waitFor(() => expect(callArgs(files, 'grant').at(-1)).toEqual([input.attachment_id]));
});

// ---------------------------------------------------------------------------
// Uploads off, offline, refusals

test('uploads off on the server: said plainly, and Attach is not offered again', async () => {
  const { files } = mount({ prepare: ({ files: f }) => f.setUploadsEnabled(false) });
  fireEvent.click(within(await toConsent()).getByRole('button', { name: 'Keep this photo' }));
  expect(await screen.findByText("Adding receipt photos isn't switched on yet.")).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Attach a receipt photo' })).toBeNull();
  expect(files.callsOf('upload')).toHaveLength(1);
  expect(files.callsOf('retain')).toEqual([]);
});

test('offline: a photo that cannot be fetched says so, with Try again; the record still shows', async () => {
  const { files } = mount({ withReceipt: true, prepare: ({ files: f }) => f.fail('grant', 'network') });
  expect(await screen.findByText("You're offline. The receipt photo shows when you're back online.")).toBeTruthy();
  expect(screen.queryByTestId('receipt-thumbnail')).toBeNull();
  click('Try again');
  expect(await thumbnail()).toBeTruthy();
  expect(files.callsOf('grant')).toHaveLength(2);
});

test('offline: the record itself cannot be read; Try again reads it', async () => {
  const made = setup({ withReceipt: true });
  made.fake.fail('transaction', 'network');
  mountScreen(<ReceiptPortsProvider ports={made.ports}><RecordReceipt recordId={FOOD_ID} version={1} /></ReceiptPortsProvider>, { resources: made.fake.resources });
  expect(await screen.findByText("You're offline. The receipt photo shows when you're back online.")).toBeTruthy();
  click('Try again');
  expect(await thumbnail()).toBeTruthy();
});

test('refused on the phone: a photo of another type, or none at all, asks nothing and sends nothing', async () => {
  const { files } = mount({ prepare: ({ files: f }) => f.queuePick({ kind: 'picked', photo: { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/heic' } }, { kind: 'cancelled' }, { kind: 'denied' }) });
  fireEvent.click(await noReceiptYet());
  expect(await screen.findByText('Choose a JPEG, PNG or WebP photo.')).toBeTruthy();
  click('Attach a receipt photo');
  await settle();
  expect(screen.queryByText('Choose a JPEG, PNG or WebP photo.')).toBeNull();
  click('Attach a receipt photo');
  expect(await screen.findByText('Allow Jotbun to use your photos to attach one.')).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(files.callsOf('upload')).toEqual([]);
});

test('refused by the server: a photo past its window starts over with a plain reason', async () => {
  const { fake } = mount({ prepare: ({ files: f }) => f.fail('retain', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { attachment_id: 'errors.attachment_expired' } }) });
  fireEvent.click(within(await toConsent()).getByRole('button', { name: 'Keep this photo' }));
  expect(await screen.findByText("That photo can't be attached any more. Choose it again.")).toBeTruthy();
  expect(await noReceiptYet()).toBeTruthy();
  expect(record(fake).attachment_id).toBeUndefined();
});

test('a new version from Record (after its own edit) reads the receipt again', async () => {
  const made = setup({ withReceipt: true });
  const versions = { set: (_version: number) => {} };
  function Versioned() {
    const [version, setVersion] = useState(1);
    versions.set = setVersion;
    return <RecordReceipt recordId={FOOD_ID} version={version} />;
  }
  mountScreen(<ReceiptPortsProvider ports={made.ports}><Versioned /></ReceiptPortsProvider>, { resources: made.fake.resources });
  await thumbnail();
  // Another device removed it; Record reloads after an edit and passes the new version.
  const { attachment_id: _gone, ...rest } = record(made.fake);
  made.fake.records.set(FOOD_ID, { ...rest, version: 3 } as TransactionDto);
  act(() => versions.set(3));
  expect(await noReceiptYet()).toBeTruthy();
  expect(made.fake.callsOf('transaction')).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// Thai, dark, targets, labels, motion, tokens

test('Thai leading: the heading, the words and the buttons keep Thai line heights', async () => {
  mount({ withReceipt: true, locale: 'th' });
  await screen.findByTestId('receipt-thumbnail');
  const heading = within(panel()).getByRole('heading', { name: say('Receipt photo', 'th') });
  expect(heading.style.lineHeight).toBe(leading('heading', 'th'));
  expect(within(button(say('Remove photo', 'th'))).getByText(say('Remove photo', 'th')).style.lineHeight).toBe(leading('label', 'th'));
  cleanup();
  mount({ locale: 'th' });
  const none = await screen.findByText(say('No receipt photo on this entry.', 'th'));
  expect(none.style.lineHeight).toBe(leading('body', 'th'));
});

test.each([['light', bunLight], ['dark', bunDark]] as const)('%s: the panel, sheet and viewer draw palette pairs that clear 4.5:1', async (mode, colors) => {
  mount({ withReceipt: true, mode });
  await thumbnail();
  expect(panel().style.backgroundColor).toEqual(rgb(colors.card));
  expect(within(panel()).getByRole('heading', { name: 'Receipt photo' }).style.color).toEqual(rgb(colors.ink));
  expectApprovedTextPairs(panel(), colors);
  click('Remove photo');
  const sheet = await screen.findByRole('dialog');
  expectApprovedTextPairs(sheet, colors);
  fireEvent.click(within(sheet).getByRole('button', { name: 'Keep it' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  click('Open the receipt photo');
  const viewer = await screen.findByRole('dialog', { name: 'Receipt photo' });
  expect(screen.getByTestId('receipt-viewer').style.backgroundColor).toEqual(rgb(colors.background));
  expectApprovedTextPairs(viewer, colors);
  cleanup();
  mount({ mode });
  await noReceiptYet();
  expectApprovedTextPairs(panel(), colors);
});

test('every control is at least 44 points with a role and a name; art is hidden from screen readers', async () => {
  mount({ withReceipt: true });
  await thumbnail();
  for (const control of within(panel()).getAllByRole('button')) {
    expect(control.getAttribute('aria-label') ?? control.textContent, control.outerHTML.slice(0, 80)).toBeTruthy();
    expect(Number.parseFloat(control.style.minHeight)).toBeGreaterThanOrEqual(44);
  }
  // The thumbnail's image is inside its labelled button and hidden on its own.
  expect(hiddenFromScreenReaders(screen.getByTestId('receipt-thumbnail-image'))).toBe(true);
  click('Open the receipt photo');
  const viewer = await screen.findByRole('dialog', { name: 'Receipt photo' });
  const close = within(viewer).getByRole('button', { name: 'Close' });
  expect(Number.parseFloat(close.style.minHeight)).toBeGreaterThanOrEqual(44);
  expect(hiddenFromScreenReaders(within(close).getByText('×'))).toBe(true);
});

test('reduced motion: the consent sheet appears without a spring and the viewer without a fade', async () => {
  motion.reduced = true;
  const spring = vi.spyOn(Animated, 'spring');
  mount({ withReceipt: true });
  await thumbnail();
  click('Replace photo');
  const sheet = await screen.findByRole('dialog');
  expect(spring).not.toHaveBeenCalled();
  expect(within(sheet.ownerDocument.body).getByTestId('sheet-panel').style.transform).toBe('translateY(0px)');
  fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const timing = vi.spyOn(Animated, 'timing');
  click('Open the receipt photo');
  await screen.findByRole('dialog', { name: 'Receipt photo' });
  expect(spring).not.toHaveBeenCalled();
  expect(timing).not.toHaveBeenCalled();
  expect(screen.getByTestId('receipt-viewer').style.opacity).toBe('1');
});

test('the panel draws with palette tokens only', () => {
  const read = (file: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), file), 'utf8');
  for (const file of ['RecordReceipt.tsx', 'ReceiptParts.tsx']) {
    expect(read(file), file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(read(file), file).not.toMatch(/rgba?\(/);
  }
  // The panel's own surface is the kit's Card; its parts colour themselves from the palette.
  expect(read('RecordReceipt.tsx')).toMatch(/<Card /);
  expect(read('ReceiptParts.tsx')).toMatch(/useBunColors\(\)/);
});

// ---------------------------------------------------------------------------
// The catalogue's receipt sections

const SECTION_SHOWS: Record<string, (root: HTMLElement) => void> = {
  'receipt-none': (root) => expect(within(root).getByRole('button', { name: 'Attach a receipt photo' })).toBeTruthy(),
  'receipt-consent': (root) => expect(within(root.ownerDocument.body).getByRole('dialog', { name: 'Keep this receipt photo?' })).toBeTruthy(),
  'receipt-uploading': (root) => expect(within(root).getByText('Sending the photo…')).toBeTruthy(),
  'receipt-preparing': (root) => expect(within(root).getByText('Getting the photo ready…')).toBeTruthy(),
  'receipt-saving': (root) => expect(within(root).getByText('Saving…')).toBeTruthy(),
  'receipt-attached': (root) => expect(within(root).getByRole('button', { name: 'Open the receipt photo' })).toBeTruthy(),
  'receipt-full-screen': (root) => expect(within(root.ownerDocument.body).getByTestId('receipt-full-image').getAttribute('aria-label')).toBe('Receipt photo'),
  'receipt-grant-renewed': (root) => {
    const viewer = within(root.ownerDocument.body).getByRole('dialog', { name: 'Receipt photo' });
    expect(within(viewer).getByText('Loading the receipt photo…')).toBeTruthy();
    expect(within(viewer).queryByTestId('receipt-full-image')).toBeNull();
  },
  'receipt-replace-consent': (root) => expect(within(root.ownerDocument.body).getByRole('dialog', { name: 'Replace the receipt photo?' })).toBeTruthy(),
  'receipt-remove-confirm': (root) => expect(within(root.ownerDocument.body).getByRole('dialog', { name: 'Remove the receipt photo?' })).toBeTruthy(),
  'receipt-removed': (root) => expect(within(root).getByText('Receipt photo removed.')).toBeTruthy(),
  'receipt-unconfirmed': (root) => expect(within(root).getByText('Not confirmed yet. Try again.')).toBeTruthy(),
  'receipt-conflict': (root) => expect(within(root).getByText('This entry changed on another device.')).toBeTruthy(),
  'receipt-uploads-off': (root) => expect(within(root).getByText("Adding receipt photos isn't switched on yet.")).toBeTruthy(),
  'receipt-offline': (root) => expect(within(root).getByText("You're offline. The receipt photo shows when you're back online.")).toBeTruthy(),
};

test('the receipt sections: one per state, receipt-… ids, "Receipt: …" titles, screens', () => {
  expect(RECEIPT_SECTIONS.map((section) => section.id)).toEqual(Object.keys(SECTION_SHOWS));
  for (const section of RECEIPT_SECTIONS) {
    expect(section.id).toMatch(/^receipt-[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(section.title).toMatch(/^Receipt: \S/);
    expect(section.group).toBe('Screens');
    expect(section.layout).toBe('screen');
  }
  expect(new Set(RECEIPT_SECTIONS.map((section) => section.title)).size).toBe(RECEIPT_SECTIONS.length);
});

test.each(RECEIPT_SECTIONS.map((section) => [section.id, section] as const))('catalogue section %s reaches its state on fakes alone', async (id, section) => {
  const network = vi.spyOn(globalThis, 'fetch');
  const errors = vi.spyOn(console, 'error');
  mountInApp(<>{section.render()}</>);
  await waitFor(() => expect(screen.queryByTestId('catalogue-screen-running')).toBeNull(), { timeout: 15_000 });
  expect(screen.queryByTestId('catalogue-screen-stopped'), screen.queryByTestId('catalogue-screen-stopped')?.textContent ?? '').toBeNull();
  SECTION_SHOWS[id](screen.getByTestId('catalogue-screen-ready'));
  expect(network).not.toHaveBeenCalled();
  expect(errors).not.toHaveBeenCalled();
}, 30_000);

// ---------------------------------------------------------------------------
// Text pairs (as the Wallets render test checks them)

/** `#RRGGBB` for a CSS colour react-native-web wrote; null when transparent. */
function hexOf(css: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(css)) return css.toUpperCase();
  const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(css);
  if (!match || (match[4] !== undefined && Number(match[4]) === 0)) return null;
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Every piece of text is drawn in a pair BUN_TEXT_PAIRS approves, clearing 4.5:1 on the nearest ground behind it. */
function expectApprovedTextPairs(root: ParentNode, colors: BunColors) {
  const tokens = (hex: string) => Object.entries(colors).filter(([, value]) => typeof value === 'string' && value.toUpperCase() === hex).map(([name]) => name);
  let checked = 0;
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    const ownText = [...element.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '');
    if (!ownText || !element.style.color || hiddenFromScreenReaders(element)) continue;
    const fg = hexOf(element.style.color);
    let ground: string | null = null;
    for (let node: HTMLElement | null = element; node && !ground; node = node.parentElement) ground = node.style?.backgroundColor ? hexOf(node.style.backgroundColor) : null;
    expect(fg, element.textContent ?? '').not.toBeNull();
    expect(ground, element.textContent ?? '').not.toBeNull();
    const pairOk = BUN_TEXT_PAIRS.some(([text, on]) => tokens(fg as string).includes(text) && tokens(ground as string).includes(on));
    expect(pairOk, `${element.textContent}: ${fg} on ${ground}`).toBe(true);
    expect(contrastRatio(fg as string, ground as string), element.textContent ?? '').toBeGreaterThanOrEqual(4.5);
    checked += 1;
  }
  expect(checked).toBeGreaterThan(0);
}

// Record holds the record's version for its own Edit and Delete: a receipt
// change moves the record on, so the panel tells Record, which reads it again.
test('each receipt change tells Record the record moved on, with its new version', async () => {
  const made = setup();
  const onChanged = vi.fn();
  mountScreen(
    <ReceiptPortsProvider ports={made.ports}>
      <RecordReceipt recordId={FOOD_ID} version={record(made.fake).version} onChanged={onChanged} />
    </ReceiptPortsProvider>,
    { resources: made.fake.resources },
  );
  fireEvent.click(within(await toConsent()).getByRole('button', { name: 'Keep this photo' }));
  await thumbnail();
  expect(onChanged).toHaveBeenCalledTimes(1);
  expect(onChanged).toHaveBeenLastCalledWith(record(made.fake).version);
  click('Remove photo');
  fireEvent.click(within(await screen.findByRole('dialog', { name: 'Remove the receipt photo?' })).getByRole('button', { name: 'Remove the photo' }));
  await screen.findByText('Receipt photo removed.');
  expect(onChanged).toHaveBeenCalledTimes(2);
  expect(onChanged).toHaveBeenLastCalledWith(record(made.fake).version);
});
