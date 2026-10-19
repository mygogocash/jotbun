// R4 Planning: the Wallets screen's view model (plan §6.2). Pure TypeScript:
// no React, no React Native. Money stays exact (BigInt over canonical satang
// strings); dates are Bangkok calendar dates (`YYYY-MM-DD`).
//
// - The list: the active wallets' total, the active and archived wallets in
//   the order Jotbun lists them (the order they were added), and first run.
// - Archiving: only at exactly ฿0.00 (the server's own rule), and otherwise
//   why not, in words, with the exact balance and the way forward.
// - The form: create and edit share one shape. The opening balance comes
//   from the keypad ('' is ฿0.00, which is allowed: it is never income). An
//   edit sends only what changed, with the version that was read; a change to
//   the opening balance or tracking start of a wallet with entries is a
//   correction, and needs its reason (`entry_error` or
//   `balance_reconciliation`) before anything is sent. While it is not known
//   whether the wallet has entries, the reason is asked too: Jotbun accepts a
//   reason with any correction, but refuses a correction without one.
// - What Jotbun said: field problems on their own field, an archive refused
//   for its balance, a wallet changed or archived elsewhere, and a conflict's
//   copy of the wallet (only when it is this wallet, in the exact shape).
import { ContractValidationError, MINOR_AMOUNT_MAX, NAME_MAX_CHARS, normalizeName, validateTrackingStart } from '@gogospend/contracts';
import type { CreateWalletRequest, Minor, UpdateWalletRequest, WalletCorrectionReason, WalletDto, WalletSnapshot } from '@gogospend/contracts';

import { V1Error } from '../../../../api/client.ts';
import { isWalletDto } from '../../resources.ts';
import type { CopyLine, Translate } from '../shared.ts';

// ---------------------------------------------------------------------------
// The list

export type WalletsOverview = {
  /** Wallets in use, in the order Jotbun lists them (the order they were added). */
  active: WalletDto[];
  /** Archived wallets, the same way: a collapsed section of their own. */
  archived: WalletDto[];
  /** The active wallets' balances, added up exactly. Archived wallets are left out. */
  totalMinor: Minor;
  /** No wallet at all, in use or archived: the first-run empty state. */
  firstRun: boolean;
};

export function walletsOverview(wallets: readonly WalletDto[]): WalletsOverview {
  const active = wallets.filter((wallet) => !wallet.archived);
  const archived = wallets.filter((wallet) => wallet.archived);
  const total = active.reduce((sum, wallet) => sum + BigInt(wallet.balance_minor), 0n);
  return { active, archived, totalMinor: total.toString(), firstRun: wallets.length === 0 };
}

// ---------------------------------------------------------------------------
// Archiving

export type ArchiveAdvice =
  | { kind: 'can_archive' }
  /** Money is still in the wallet: move it out first. */
  | { kind: 'holds_money'; balanceMinor: Minor }
  /** The wallet is below zero: move money in first. */
  | { kind: 'below_zero'; balanceMinor: Minor }
  | { kind: 'archived' };

/** Jotbun archives a wallet only when its balance is exactly ฿0.00. */
export function archiveAdvice(wallet: Pick<WalletDto, 'balance_minor' | 'archived'>): ArchiveAdvice {
  if (wallet.archived) return { kind: 'archived' };
  const balance = BigInt(wallet.balance_minor);
  if (balance === 0n) return { kind: 'can_archive' };
  return balance > 0n ? { kind: 'holds_money', balanceMinor: wallet.balance_minor } : { kind: 'below_zero', balanceMinor: wallet.balance_minor };
}

export function canArchive(wallet: Pick<WalletDto, 'balance_minor' | 'archived'>): boolean {
  return archiveAdvice(wallet).kind === 'can_archive';
}

/**
 * Why Archive is not offered, in words with the exact balance and what to do
 * (never a disabled button left to explain itself). Null when it can be
 * archived, or already is.
 */
export function archiveAdviceLine(wallet: Pick<WalletDto, 'name' | 'balance_minor' | 'archived'>, money: (minor: Minor) => string): CopyLine | null {
  const advice = archiveAdvice(wallet);
  const values = { name: wallet.name, zero: money('0') };
  if (advice.kind === 'holds_money') {
    return { text: 'To archive {name}, its balance must be {zero}. It holds {amount} now: move that money to another wallet first.', values: { ...values, amount: money(advice.balanceMinor) } };
  }
  if (advice.kind === 'below_zero') {
    return { text: 'To archive {name}, its balance must be {zero}. It is at {amount} now: move money in from another wallet first.', values: { ...values, amount: money(advice.balanceMinor) } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The form

/** What the form holds. `openingMinor` is the keypad's exact satang ('' while nothing is typed, which is ฿0.00). */
export type WalletForm = { name: string; openingMinor: string; trackingStart: string; reason: WalletCorrectionReason | null };

export type WalletField = 'name' | 'opening_minor' | 'tracking_start' | 'correction_reason';
export type WalletFieldErrors = Partial<Record<WalletField, string>>;

/** Whether the wallet has entries: null while that is not known (still checking, or the check failed). */
export type HasRecords = boolean | null;

export function newWalletForm(today: string): WalletForm {
  return { name: '', openingMinor: '', trackingStart: today, reason: null };
}

export function walletFormOf(wallet: WalletSnapshot): WalletForm {
  return { name: wallet.name, openingMinor: wallet.opening_minor, trackingStart: wallet.tracking_start, reason: null };
}

const CANONICAL_MINOR = /^(?:0|[1-9][0-9]*)$/;
const openingOf = (form: Pick<WalletForm, 'openingMinor'>): string => (form.openingMinor === '' ? '0' : form.openingMinor);
// Text with nothing a person could see (as the contracts' `isInvisible`): spaces, format characters, Hangul fillers.
const INVISIBLE = /^[\p{White_Space}\p{Cf}\u115F\u1160\u3164\uFFA0]*$/u;

/** The name as Jotbun stores it (NFC, trimmed), or null while it is not a name yet. */
function nameOf(text: string): string | null {
  try {
    return normalizeName(text, 'name');
  } catch {
    return null;
  }
}

export type WalletPreview = { name: string | null; openingMinor: Minor; balanceMinor: Minor; trackingStart: string };

/**
 * The card as it will read, live: the name (null until there is one), the
 * opening balance, and the balance. A new wallet's balance is its opening
 * balance; an edit moves the balance by exactly the change to the opening
 * balance (records stay as they are).
 */
export function walletPreview(form: WalletForm, wallet?: Pick<WalletDto, 'opening_minor' | 'balance_minor'>): WalletPreview {
  const opening = CANONICAL_MINOR.test(openingOf(form)) ? openingOf(form) : '0';
  const balance = wallet ? (BigInt(wallet.balance_minor) + BigInt(opening) - BigInt(wallet.opening_minor)).toString() : opening;
  // A name too long to save still shows as typed (the field says why); text with control or direction-override
  // characters does not, since it could read differently from what it says.
  const typed = form.name.normalize('NFC').trim();
  const name = nameOf(form.name) ?? (nameOf([...typed].slice(0, NAME_MAX_CHARS).join('')) === null ? null : typed);
  return { name, openingMinor: opening, balanceMinor: balance, trackingStart: form.trackingStart };
}

/** A changed opening balance or tracking start (a new name is not a correction). */
export function isCorrection(wallet: Pick<WalletSnapshot, 'opening_minor' | 'tracking_start'>, form: WalletForm): boolean {
  return openingOf(form) !== wallet.opening_minor || form.trackingStart !== wallet.tracking_start;
}

/** A correction needs its reason once the wallet has entries, and while that is not known yet. */
export function correctionNeedsReason(wallet: Pick<WalletSnapshot, 'opening_minor' | 'tracking_start'>, form: WalletForm, hasRecords: HasRecords): boolean {
  return isCorrection(wallet, form) && hasRecords !== false;
}

export type CleanWallet = { name: string; opening_minor: Minor; tracking_start: string };

/** Every check before sending, with the screen's words (through `tc`). */
export function checkWalletForm(form: WalletForm, context: { today: string; tc: Translate }): { errors: WalletFieldErrors; clean: CleanWallet | null } {
  const { tc } = context;
  const errors: WalletFieldErrors = {};
  const typed = form.name.normalize('NFC').trim();
  const name = nameOf(form.name);
  if (typed === '' || INVISIBLE.test(typed)) errors.name = tc('Enter a wallet name');
  else if ([...typed].length > NAME_MAX_CHARS) errors.name = tc('Wallet names are up to 80 characters.');
  else if (name === null) errors.name = tc('Check this and try again.');
  const opening = openingOf(form);
  if (!CANONICAL_MINOR.test(opening)) errors.opening_minor = tc('Enter an amount like 65 or 65.50');
  else if (BigInt(opening) > MINOR_AMOUNT_MAX) errors.opening_minor = tc('Amounts go up to ฿999,999,999.99');
  try {
    validateTrackingStart(form.trackingStart, context.today);
  } catch (error) {
    errors.tracking_start = error instanceof ContractValidationError && error.code === 'DATE_IN_FUTURE' ? tc('This date is in the future.') : tc('Enter a real date as YYYY-MM-DD');
  }
  if (Object.keys(errors).length > 0 || name === null) return { errors, clean: null };
  return { errors, clean: { name, opening_minor: opening, tracking_start: form.trackingStart } };
}

export type CreateResult = { ok: true; input: CreateWalletRequest } | { ok: false; errors: WalletFieldErrors };

/** The create command's input, its keys in the contract's order so the same wallet is the same JSON. */
export function buildCreateWallet(form: WalletForm, context: { id: string; today: string; tc: Translate }): CreateResult {
  const { errors, clean } = checkWalletForm(form, context);
  if (!clean) return { ok: false, errors };
  return { ok: true, input: { id: context.id, name: clean.name, opening_minor: clean.opening_minor, tracking_start: clean.tracking_start } };
}

export type UpdateResult =
  | { ok: true; unchanged: true }
  | { ok: true; unchanged: false; id: string; version: number; changes: UpdateWalletRequest }
  | { ok: false; errors: WalletFieldErrors };

/**
 * The edit: only the fields that changed, with the version that was read. A
 * correction to a wallet with entries (or not yet known to have none) needs
 * its reason first; the reason is sent only with a correction, since Jotbun
 * refuses one without.
 */
export function buildWalletUpdate(wallet: WalletSnapshot, form: WalletForm, context: { today: string; tc: Translate; hasRecords: HasRecords }): UpdateResult {
  const { errors, clean } = checkWalletForm(form, context);
  if (!clean) return { ok: false, errors };
  const changes: UpdateWalletRequest = {};
  if (clean.name !== wallet.name) changes.name = clean.name;
  if (clean.opening_minor !== wallet.opening_minor) changes.opening_minor = clean.opening_minor;
  if (clean.tracking_start !== wallet.tracking_start) changes.tracking_start = clean.tracking_start;
  if (Object.keys(changes).length === 0) return { ok: true, unchanged: true };
  const corrected = changes.opening_minor !== undefined || changes.tracking_start !== undefined;
  if (corrected && context.hasRecords !== false && form.reason === null) {
    return { ok: false, errors: { correction_reason: context.tc("Choose why you're changing this.") } };
  }
  if (corrected && form.reason !== null) changes.correction_reason = form.reason;
  return { ok: true, unchanged: false, id: wallet.id, version: wallet.version, changes };
}

// ---------------------------------------------------------------------------
// What Jotbun said

/** Jotbun's words for a field (its message key or error code) in the screen's English. */
const FIELD_WORDS: Readonly<Record<string, string>> = {
  'errors.records_before_tracking_start': 'This wallet has entries before this date.',
  'errors.correction_reason_required': "Choose why you're changing this.",
  DATE_IN_FUTURE: 'This date is in the future.',
  INVALID_DATE: 'Enter a real date as YYYY-MM-DD',
  MINOR_OUT_OF_RANGE: 'Amounts go up to ฿999,999,999.99',
  INVALID_MINOR: 'Enter an amount like 65 or 65.50',
};
const FORM_FIELDS: readonly WalletField[] = ['name', 'opening_minor', 'tracking_start', 'correction_reason'];

export type WalletRefusal = {
  /** Problems on the form's own fields. */
  fields: WalletFieldErrors;
  /** Archive refused: the balance is not ฿0.00 any more (`balance_minor`). */
  archiveRefused: boolean;
  /** The wallet was archived or unarchived elsewhere (`archived`): read it again. */
  changedElsewhere: boolean;
  /** Jotbun wants the correction's reason: ask for it. */
  needsReason: boolean;
};

export function walletRefusal(error: unknown, tc: Translate): WalletRefusal {
  const result: WalletRefusal = { fields: {}, archiveRefused: false, changedElsewhere: false, needsReason: false };
  if (!(error instanceof V1Error)) return result;
  for (const [field, key] of Object.entries(error.fields ?? {})) {
    if (field === 'balance_minor') result.archiveRefused = true;
    else if (field === 'archived') result.changedElsewhere = true;
    else if ((FORM_FIELDS as readonly string[]).includes(field)) result.fields[field as WalletField] = tc(FIELD_WORDS[key] ?? 'Check this and try again.');
  }
  result.needsReason = result.fields.correction_reason !== undefined;
  return result;
}

export type WalletConflict = { current: WalletDto | null };

/** A version conflict, with Jotbun's copy of this wallet when it came in the exact shape; null for anything else. */
export function walletConflict(error: unknown, id: string): WalletConflict | null {
  if (!(error instanceof V1Error) || error.outcome !== 'conflict') return null;
  const current = error.current;
  return { current: isWalletDto(current) && current.id === id ? current : null };
}

export type ConflictRow = { key: 'name' | 'opening' | 'tracking' | 'balance' | 'status'; label: string; yours: string | null; theirs: string; differs: boolean };
export type ConflictWords = { tc: Translate; money: (minor: Minor) => string; date: (day: string) => string };

/**
 * Theirs field by field, beside yours when there is a form (an edit). An
 * archive or unarchive has none: theirs only. An archived wallet says so.
 */
export function walletConflictRows(current: WalletDto, yours: WalletForm | null, words: ConflictWords): ConflictRow[] {
  const { tc, money, date } = words;
  const yourName = yours ? (nameOf(yours.name) ?? yours.name.trim()) : null;
  const yourOpening = yours ? (CANONICAL_MINOR.test(openingOf(yours)) ? openingOf(yours) : null) : null;
  const row = (key: ConflictRow['key'], label: string, theirs: string, mine: string | null): ConflictRow => ({ key, label, yours: mine, theirs, differs: mine !== null && mine !== theirs });
  const rows = [
    row('name', tc('Name'), current.name, yourName),
    row('opening', tc('Opening balance'), money(current.opening_minor), yourOpening === null ? null : money(yourOpening)),
    row('tracking', tc('Tracking starts'), date(current.tracking_start), yours ? date(yours.trackingStart) : null),
    row('balance', tc('Balance'), money(current.balance_minor), null),
  ];
  return current.archived ? [...rows, row('status', tc('Status'), tc('Archived'), null)] : rows;
}
