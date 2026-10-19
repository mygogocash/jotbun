// R4 Planning: the Wallets screen's pure rules (plan §6.2): the total, the
// order, when a wallet can be archived (and why not, in words), when a
// correction needs its reason, the form's checks, the exact command it
// builds, and how a refusal or a conflict from Jotbun reads.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { WalletDto } from '@gogospend/contracts';

import { V1Error } from '../../../../api/client.ts';
import { formatMinor } from '../../money.ts';
import { recordingTc, untranslated } from '../testing/catalog.ts';
import { tc, marked } from '../testing/fixtures.ts';
import {
  CORRECTION_REASONS,
  FIELD_WORDS,
  archiveAdvice,
  archiveAdviceLine,
  buildCreateWallet,
  buildWalletUpdate,
  canArchive,
  checkWalletForm,
  correctionNeedsReason,
  isCorrection,
  newWalletForm,
  walletConflict,
  walletConflictRows,
  walletFormOf,
  walletPreview,
  walletRefusal,
  walletsOverview,
} from './walletsModel.ts';
import type { WalletForm } from './walletsModel.ts';

const TODAY = '2026-09-29';
const ID = '0000000a-0000-4000-8000-0000000000aa';
const money = (minor: string) => formatMinor(minor, 'en');
const date = (day: string) => `day ${day}`;

let counter = 0;
function wallet(overrides: Partial<WalletDto> = {}): WalletDto {
  counter += 1;
  return {
    id: `0000000a-0000-4000-8000-${String(counter).padStart(12, '0')}`, name: `Wallet ${counter}`, currency: 'THB', opening_minor: '0',
    tracking_start: '2026-09-01', archived: false, version: 1, balance_minor: '0', ...overrides,
  };
}
const form = (overrides: Partial<WalletForm> = {}): WalletForm => ({ ...newWalletForm(TODAY), ...overrides });

// ---------------------------------------------------------------------------
// The list

test('the total adds up the active wallets exactly, and leaves archived ones out', () => {
  const cash = wallet({ name: 'Cash', balance_minor: '235000' });
  const daily = wallet({ name: 'Daily account', balance_minor: '1870000' });
  // Archived at ฿0.00, an entry restored since then can put money back in it: still left out of the total.
  const old = wallet({ name: 'Old card', balance_minor: '5000', archived: true });
  const overview = walletsOverview([cash, old, daily]);
  assert.equal(overview.totalMinor, '2105000');
  assert.deepEqual(overview.active.map((item) => item.name), ['Cash', 'Daily account']);
  assert.deepEqual(overview.archived.map((item) => item.name), ['Old card']);
  assert.equal(overview.firstRun, false);
});

test('the total never passes through a float: balances past 2^53 and below zero stay exact', () => {
  const overview = walletsOverview([wallet({ balance_minor: '9007199254740993' }), wallet({ balance_minor: '1' }), wallet({ balance_minor: '-20050' })]);
  assert.equal(overview.totalMinor, '9007199254720944');
  assert.equal(walletsOverview([wallet({ balance_minor: '-20050' })]).totalMinor, '-20050');
});

test('wallets keep the order Jotbun lists them in (the order they were added), each section on its own', () => {
  const [a, b, c, d] = [wallet({ name: 'Zed' }), wallet({ name: 'Alpha', archived: true }), wallet({ name: 'Mid' }), wallet({ name: 'Beta', archived: true })];
  const overview = walletsOverview([a, b, c, d]);
  assert.deepEqual(overview.active.map((item) => item.name), ['Zed', 'Mid']);
  assert.deepEqual(overview.archived.map((item) => item.name), ['Alpha', 'Beta']);
});

test('first run is no wallet at all; only archived wallets is not first run, and its total is zero', () => {
  assert.deepEqual(walletsOverview([]), { active: [], archived: [], totalMinor: '0', firstRun: true });
  const onlyArchived = walletsOverview([wallet({ archived: true })]);
  assert.equal(onlyArchived.firstRun, false);
  assert.equal(onlyArchived.totalMinor, '0');
  assert.equal(onlyArchived.active.length, 0);
});

// ---------------------------------------------------------------------------
// Archiving

test('a wallet can be archived only at exactly ฿0.00, and never twice', () => {
  assert.deepEqual(archiveAdvice(wallet({ balance_minor: '0' })), { kind: 'can_archive' });
  assert.equal(canArchive(wallet({ balance_minor: '0' })), true);
  assert.deepEqual(archiveAdvice(wallet({ balance_minor: '1' })), { kind: 'holds_money', balanceMinor: '1' });
  assert.deepEqual(archiveAdvice(wallet({ balance_minor: '-1' })), { kind: 'below_zero', balanceMinor: '-1' });
  assert.deepEqual(archiveAdvice(wallet({ balance_minor: '0', archived: true })), { kind: 'archived' });
  for (const balance of ['1', '-1', '100', '9007199254740993']) assert.equal(canArchive(wallet({ balance_minor: balance })), false, balance);
  assert.equal(canArchive(wallet({ archived: true })), false);
});

test('why a wallet cannot be archived yet is said in words, with the exact balance and the way forward', () => {
  const cash = wallet({ name: 'Cash', balance_minor: '235000' });
  assert.deepEqual(archiveAdviceLine(cash, money), {
    text: 'To archive {name}, its balance must be {zero}. It holds {amount} now: move that money to another wallet first.',
    values: { name: 'Cash', zero: '฿0.00', amount: '฿2,350.00' },
  });
  const card = wallet({ name: 'Card', balance_minor: '-20050' });
  assert.deepEqual(archiveAdviceLine(card, money), {
    text: 'To archive {name}, its balance must be {zero}. It is at {amount} now: move money in from another wallet first.',
    values: { name: 'Card', zero: '฿0.00', amount: '-฿200.50' },
  });
  assert.equal(archiveAdviceLine(wallet({ balance_minor: '0' }), money), null);
  assert.equal(archiveAdviceLine(wallet({ archived: true }), money), null);
});

// ---------------------------------------------------------------------------
// Corrections

test('a correction is a changed opening balance or tracking start; a new name is not', () => {
  const cash = wallet({ opening_minor: '403200', tracking_start: '2026-09-01' });
  const same = walletFormOf(cash);
  assert.equal(isCorrection(cash, same), false);
  assert.equal(isCorrection(cash, { ...same, name: 'Pocket' }), false);
  assert.equal(isCorrection(cash, { ...same, openingMinor: '500000' }), true);
  assert.equal(isCorrection(cash, { ...same, trackingStart: '2026-08-31' }), true);
  // An empty keypad is ฿0.00, which is a change from ฿4,032.00.
  assert.equal(isCorrection(cash, { ...same, openingMinor: '' }), true);
  assert.equal(isCorrection(wallet({ opening_minor: '0' }), { ...walletFormOf(wallet({ opening_minor: '0' })), openingMinor: '' }), false);
});

test('a correction needs its reason once the wallet has entries, and also while that is not known yet', () => {
  const cash = wallet({ opening_minor: '403200' });
  const corrected = { ...walletFormOf(cash), openingMinor: '500000' };
  assert.equal(correctionNeedsReason(cash, corrected, true), true);
  assert.equal(correctionNeedsReason(cash, corrected, null), true);
  assert.equal(correctionNeedsReason(cash, corrected, false), false);
  assert.equal(correctionNeedsReason(cash, { ...walletFormOf(cash), name: 'Pocket' }, true), false);
});

// ---------------------------------------------------------------------------
// The form

test('a new wallet starts empty: no name, ฿0.00 opening and tracking from today', () => {
  assert.deepEqual(newWalletForm(TODAY), { name: '', openingMinor: '', trackingStart: TODAY, reason: null });
});

test('the live preview follows what is typed: the trimmed name (or none yet), the exact opening and the start', () => {
  assert.deepEqual(walletPreview(form()), { name: null, openingMinor: '0', balanceMinor: '0', trackingStart: TODAY });
  assert.deepEqual(
    walletPreview(form({ name: '  Piggy bank ', openingMinor: '123456', trackingStart: '2026-09-01' })),
    { name: 'Piggy bank', openingMinor: '123456', balanceMinor: '123456', trackingStart: '2026-09-01' },
  );
  // Something nobody could see is no name yet; a name too long to save still shows as typed (the field says why).
  assert.equal(walletPreview(form({ name: '\u200B \u3164' })).name, null);
  assert.equal(walletPreview(form({ name: ` ${'x'.repeat(81)} ` })).name, 'x'.repeat(81));
  // A direction override never reaches the preview: it could read differently from what it says.
  assert.equal(walletPreview(form({ name: 'Cash\u202Eevil' })).name, null);
});

test("an edit's preview moves the balance by exactly the change to the opening balance", () => {
  const cash = wallet({ name: 'Cash', opening_minor: '403200', balance_minor: '235000' });
  assert.deepEqual(walletPreview(walletFormOf(cash), cash), { name: 'Cash', openingMinor: '403200', balanceMinor: '235000', trackingStart: '2026-09-01' });
  assert.equal(walletPreview({ ...walletFormOf(cash), openingMinor: '500000' }, cash).balanceMinor, '331800');
  // Down to nothing typed (฿0.00): the balance can go below zero, and stays exact.
  assert.equal(walletPreview({ ...walletFormOf(cash), openingMinor: '' }, cash).balanceMinor, '-168200');
  const huge = wallet({ opening_minor: '99999999999', balance_minor: '9007199254740993' });
  assert.equal(walletPreview({ ...walletFormOf(huge), openingMinor: '1' }, huge).balanceMinor, '9007099254740995');
});

test('the form refuses a missing, invisible or over-long name, an amount past the cap and a future start, in its own words', () => {
  const checked = (overrides: Partial<WalletForm>) => checkWalletForm(form(overrides), { today: TODAY, tc }).errors;
  assert.deepEqual(checked({}), { name: 'Enter a wallet name' });
  assert.deepEqual(checked({ name: '   ' }), { name: 'Enter a wallet name' });
  assert.deepEqual(checked({ name: '\u200B' }), { name: 'Enter a wallet name' });
  assert.deepEqual(checked({ name: 'x'.repeat(81) }), { name: 'Wallet names are up to 80 characters.' });
  assert.deepEqual(checked({ name: 'x'.repeat(80) }), {});
  assert.deepEqual(checked({ name: 'Cash\u202Eevil' }), { name: 'Check this and try again.' });
  assert.deepEqual(checked({ name: 'Cash', openingMinor: '100000000000' }), { opening_minor: 'Amounts go up to ฿999,999,999.99' });
  assert.deepEqual(checked({ name: 'Cash', openingMinor: '1.5' }), { opening_minor: 'Enter an amount like 65 or 65.50' });
  assert.deepEqual(checked({ name: 'Cash', trackingStart: '2026-09-30' }), { tracking_start: 'This date is in the future.' });
  assert.deepEqual(checked({ name: 'Cash', trackingStart: '1969-12-31' }), { tracking_start: 'Enter a real date as YYYY-MM-DD' });
  // Every message goes through tc.
  assert.deepEqual(checkWalletForm(form(), { today: TODAY, tc: marked }).errors, { name: '[Enter a wallet name]' });
});

test('create builds one exact command: the id, the trimmed NFC name, the exact satang and the start', () => {
  const built = buildCreateWallet(form({ name: '  Cafe\u0301 ', openingMinor: '99999999999', trackingStart: '2026-09-28' }), { id: ID, today: TODAY, tc });
  assert.deepEqual(built, { ok: true, input: { id: ID, name: 'Café', opening_minor: '99999999999', tracking_start: '2026-09-28' } });
  assert.deepEqual(Object.keys(built.ok ? built.input : {}), ['id', 'name', 'opening_minor', 'tracking_start']);
  // Nothing typed on the keypad is a ฿0.00 opening balance, which is allowed: it is never income.
  assert.deepEqual(buildCreateWallet(form({ name: 'Cash' }), { id: ID, today: TODAY, tc }), { ok: true, input: { id: ID, name: 'Cash', opening_minor: '0', tracking_start: TODAY } });
  assert.deepEqual(buildCreateWallet(form(), { id: ID, today: TODAY, tc }), { ok: false, errors: { name: 'Enter a wallet name' } });
});

test('an edit sends only what changed, with the version that was read; nothing changed sends nothing', () => {
  const cash = wallet({ name: 'Cash', opening_minor: '403200', tracking_start: '2026-09-01', version: 3 });
  const context = { today: TODAY, tc, hasRecords: false };
  assert.deepEqual(buildWalletUpdate(cash, walletFormOf(cash), context), { ok: true, unchanged: true });
  // A name typed with spaces around it, or the same name, is no change.
  assert.deepEqual(buildWalletUpdate(cash, { ...walletFormOf(cash), name: ' Cash ' }, context), { ok: true, unchanged: true });
  assert.deepEqual(buildWalletUpdate(cash, { ...walletFormOf(cash), name: ' Pocket ' }, context), { ok: true, unchanged: false, id: cash.id, version: 3, changes: { name: 'Pocket' } });
  const all = buildWalletUpdate(cash, { name: 'Pocket', openingMinor: '500000', trackingStart: '2026-08-31', reason: null }, context);
  assert.deepEqual(all, { ok: true, unchanged: false, id: cash.id, version: 3, changes: { name: 'Pocket', opening_minor: '500000', tracking_start: '2026-08-31' } });
  assert.deepEqual(Object.keys(all.ok && !all.unchanged ? all.changes : {}), ['name', 'opening_minor', 'tracking_start']);
});

test('with entries in the wallet, a correction is refused until its reason is chosen, and then carries it', () => {
  const cash = wallet({ opening_minor: '403200', version: 2 });
  const corrected = { ...walletFormOf(cash), openingMinor: '500000' };
  assert.deepEqual(buildWalletUpdate(cash, corrected, { today: TODAY, tc, hasRecords: true }), { ok: false, errors: { correction_reason: "Choose why you're changing this." } });
  assert.deepEqual(buildWalletUpdate(cash, corrected, { today: TODAY, tc, hasRecords: null }), { ok: false, errors: { correction_reason: "Choose why you're changing this." } });
  assert.deepEqual(
    buildWalletUpdate(cash, { ...corrected, reason: 'balance_reconciliation' }, { today: TODAY, tc, hasRecords: true }),
    { ok: true, unchanged: false, id: cash.id, version: 2, changes: { opening_minor: '500000', correction_reason: 'balance_reconciliation' } },
  );
  assert.deepEqual(
    buildWalletUpdate(cash, { ...walletFormOf(cash), trackingStart: '2026-08-15', reason: 'entry_error' }, { today: TODAY, tc, hasRecords: true }),
    { ok: true, unchanged: false, id: cash.id, version: 2, changes: { tracking_start: '2026-08-15', correction_reason: 'entry_error' } },
  );
});

test('a reason never travels without a correction (Jotbun refuses that), and an empty wallet needs none', () => {
  const cash = wallet({ name: 'Cash', opening_minor: '403200', version: 2 });
  assert.deepEqual(
    buildWalletUpdate(cash, { ...walletFormOf(cash), name: 'Pocket', reason: 'entry_error' }, { today: TODAY, tc, hasRecords: true }),
    { ok: true, unchanged: false, id: cash.id, version: 2, changes: { name: 'Pocket' } },
  );
  assert.deepEqual(
    buildWalletUpdate(cash, { ...walletFormOf(cash), openingMinor: '0' }, { today: TODAY, tc, hasRecords: false }),
    { ok: true, unchanged: false, id: cash.id, version: 2, changes: { opening_minor: '0' } },
  );
});

test('an edit is checked like a new wallet before anything is sent', () => {
  const cash = wallet({ version: 2 });
  assert.deepEqual(buildWalletUpdate(cash, { ...walletFormOf(cash), name: '' }, { today: TODAY, tc, hasRecords: false }), { ok: false, errors: { name: 'Enter a wallet name' } });
  assert.deepEqual(
    buildWalletUpdate(cash, { ...walletFormOf(cash), trackingStart: '2026-10-01' }, { today: TODAY, tc, hasRecords: false }),
    { ok: false, errors: { tracking_start: 'This date is in the future.' } },
  );
});

// ---------------------------------------------------------------------------
// What Jotbun said

const refused = (fields: Record<string, string>, code = 'VALIDATION_FAILED') => new V1Error('invalid', 422, code, { fields });

test("Jotbun's field problems land on their own field, in the screen's words", () => {
  assert.deepEqual(walletRefusal(refused({ tracking_start: 'errors.records_before_tracking_start' }), tc), {
    fields: { tracking_start: 'This wallet has entries before this date.' }, archiveRefused: false, changedElsewhere: false, needsReason: false,
  });
  assert.deepEqual(walletRefusal(refused({ opening_minor: 'MINOR_OUT_OF_RANGE' }, 'MINOR_OUT_OF_RANGE'), tc).fields, { opening_minor: 'Amounts go up to ฿999,999,999.99' });
  assert.deepEqual(walletRefusal(refused({ tracking_start: 'DATE_IN_FUTURE' }, 'DATE_IN_FUTURE'), tc).fields, { tracking_start: 'This date is in the future.' });
  assert.deepEqual(walletRefusal(refused({ name: 'VALIDATION_FAILED' }), tc).fields, { name: 'Check this and try again.' });
  assert.deepEqual(walletRefusal(refused({ name: 'VALIDATION_FAILED' }), marked).fields, { name: '[Check this and try again.]' });
});

test('a correction Jotbun refuses for want of a reason asks for the reason', () => {
  const refusal = walletRefusal(refused({ correction_reason: 'errors.correction_reason_required' }), tc);
  assert.equal(refusal.needsReason, true);
  assert.deepEqual(refusal.fields, { correction_reason: "Choose why you're changing this." });
});

test('an archive refused for its balance, and a wallet archived elsewhere, are told apart from field problems', () => {
  const balance = walletRefusal(refused({ balance_minor: 'errors.wallet_balance_not_zero' }), tc);
  assert.equal(balance.archiveRefused, true);
  assert.deepEqual(balance.fields, {});
  for (const key of ['errors.wallet_archived', 'errors.already_archived', 'errors.not_archived']) {
    const elsewhere = walletRefusal(refused({ archived: key }), tc);
    assert.equal(elsewhere.changedElsewhere, true, key);
    assert.equal(elsewhere.archiveRefused, false, key);
  }
  assert.deepEqual(walletRefusal(new V1Error('network', 0, 'NETWORK_ERROR'), tc), { fields: {}, archiveRefused: false, changedElsewhere: false, needsReason: false });
  assert.deepEqual(walletRefusal(new Error('boom'), tc), { fields: {}, archiveRefused: false, changedElsewhere: false, needsReason: false });
});

test("a conflict carries Jotbun's copy only when it is this wallet in the exact shape", () => {
  const theirs = wallet({ name: 'Pocket', version: 4, balance_minor: '100' });
  assert.deepEqual(walletConflict(new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: theirs }), theirs.id), { current: theirs });
  assert.deepEqual(walletConflict(new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: theirs }), ID), { current: null });
  assert.deepEqual(walletConflict(new V1Error('conflict', 409, 'VERSION_CONFLICT', { current: { ...theirs, balance_minor: 100 } }), theirs.id), { current: null });
  assert.deepEqual(walletConflict(new V1Error('conflict', 409, 'VERSION_CONFLICT'), theirs.id), { current: null });
  assert.equal(walletConflict(new V1Error('network', 0, 'NETWORK_ERROR'), theirs.id), null);
  assert.equal(walletConflict(refused({ name: 'VALIDATION_FAILED' }), theirs.id), null);
});

test("the conflict shows theirs beside yours, field by field, and marks what differs", () => {
  const theirs = wallet({ name: 'Pocket', opening_minor: '403200', tracking_start: '2026-09-01', balance_minor: '235000', version: 4 });
  const yours: WalletForm = { name: 'Wallet', openingMinor: '500000', trackingStart: '2026-09-01', reason: 'entry_error' };
  assert.deepEqual(walletConflictRows(theirs, yours, { tc, money, date }), [
    { key: 'name', label: 'Name', yours: 'Wallet', theirs: 'Pocket', differs: true },
    { key: 'opening', label: 'Opening balance', yours: '฿5,000.00', theirs: '฿4,032.00', differs: true },
    { key: 'tracking', label: 'Tracking starts', yours: 'day 2026-09-01', theirs: 'day 2026-09-01', differs: false },
    { key: 'balance', label: 'Balance', yours: null, theirs: '฿2,350.00', differs: false },
  ]);
  // An archive or unarchive has no form: theirs only, and an archived wallet says so in words.
  const archived = walletConflictRows({ ...theirs, archived: true }, null, { tc, money, date });
  assert.deepEqual(archived.map((row) => [row.key, row.yours, row.theirs]), [
    ['name', null, 'Pocket'], ['opening', null, '฿4,032.00'], ['tracking', null, 'day 2026-09-01'], ['balance', null, '฿2,350.00'], ['status', null, 'Archived'],
  ]);
});

// ---------------------------------------------------------------------------
// The catalogs

// Copy is looked up by its English text: words this model builds or looks up
// that are missing from the catalogs show English in every locale (found
// translating R4, E2 checkpoint 2). The literal guard sees only `tc('…')`.
test("every line the Wallets screen is given, and each of Jotbun's field words, is copy in en.json, with Thai", () => {
  const advice = [wallet({ balance_minor: '235000' }), wallet({ balance_minor: '-20050' })].map((each) => archiveAdviceLine(each, money)?.text ?? '');
  const { tc: recording, asked } = recordingTc();
  for (const [field, key] of [...Object.keys(FIELD_WORDS).map((key) => ['tracking_start', key]), ['name', 'SOMETHING_NEW']]) walletRefusal(refused({ [field]: key }, key), recording);
  assert.deepEqual([...asked].sort(), [...new Set([...Object.values(FIELD_WORDS), 'Check this and try again.'])].sort(), 'every field word is asked through tc');
  const reasons = CORRECTION_REASONS.map((reason) => reason.label);
  assert.deepEqual(CORRECTION_REASONS.map((reason) => reason.value), ['entry_error', 'balance_reconciliation']);
  assert.deepEqual(untranslated([...advice, ...asked, ...reasons]), []);
});
