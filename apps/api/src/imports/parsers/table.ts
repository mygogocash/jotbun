// From a read table (CSV or worksheet) to review candidates, in the parser
// child. The first non-blank row is the header. Columns are recognized by
// known Thai/English names; every other column is ignored and reported once
// as unmapped_columns - an unknown column never reaches a candidate, so a
// file cannot supply ids, owners or any other field.
//
// A layout is a legacy export only when the header is exactly that export's
// header set (Meowjot, Money Lover, Spendee; any order). Only those layouts
// get their conventions - a day-first date when the file proves no order,
// and (Meowjot, Money Lover) the amount's sign as its direction. Any other
// header, even one sharing their column names, is generic: no assumed
// day/month order and no direction from a sign.
//
// Every non-blank data row becomes one candidate with a stable id (row:<n>).
// A value is the file's own text or NULL with a reason - never a guess:
//   - the type comes from a type column's keyword, or, without one, from the
//     amount's sign in the signed legacy layouts; a keyword the sign
//     contradicts (income written negative, expense with an explicit "+") is
//     type_conflict;
//   - the wallet is only ever a wallet column (a payment channel is not one);
//   - amounts are exact (amount.ts) under the file's separator convention,
//     dates exact with the file's proven day/month order (date.ts); a
//     currency other than THB nulls the amount;
//   - a row the source marked excluded is kept and flagged; a transfer has no
//     destination wallet in any supported layout, so it needs review;
//   - text longer than the transaction limits (labels 80, merchant 120,
//     note 500) is left out and flagged text_too_long;
//   - text read through the legacy Windows-874 fallback (a guess at the code
//     page) is kept but flagged legacy_encoding_text, so its row is reviewed.
import { detectAmountConvention, parseAmountText } from './amount.ts';
import { detectDateOrder, parseDateText } from './date.ts';
import type { DateOrder } from './date.ts';
import { LIMITS, ParseRejection } from './protocol.ts';
import type { ChildBody, Direction, Field, Layout, ParsedRow, RowIssue, SourceTable } from './protocol.ts';

type Role = 'date' | 'time' | 'type' | 'amount' | 'category' | 'wallet' | 'merchant' | 'note' | 'currency' | 'exclude' | 'known';

const ROLE_NAMES: Readonly<Record<Exclude<Role, 'known'>, readonly string[]>> = {
  date: ['date', 'วันที่', 'transaction date', 'วันที่ทำรายการ'],
  time: ['time', 'เวลา'],
  type: ['type', 'ประเภท', 'transaction type'],
  amount: ['amount', 'จำนวน', 'จำนวนเงิน', 'ยอดเงิน'],
  category: ['category', 'หมวดหมู่', 'หมวด'],
  wallet: ['wallet', 'account', 'จ่ายจาก', 'กระเป๋าเงิน'],
  merchant: ['merchant', 'payee', 'ผู้รับ', 'display name', 'ร้านค้า'],
  note: ['note', 'notes', 'โน๊ต', 'โน้ต', 'บันทึก', 'memo', 'description'],
  currency: ['currency', 'สกุลเงิน'],
  exclude: ['exclude report'],
};
/** Columns the legacy exports carry that are deliberately not imported (no tags, channels or source ids in v1). */
const KNOWN_IGNORED = ['tags', 'tag', 'แท็ก', 'ช่องทางจ่าย', 'ธนาคารผู้รับ', 'id'];

const TEXT_LIMITS: Readonly<Record<'wallet_label' | 'category_label' | 'merchant' | 'note', number>> = {
  wallet_label: LIMITS.labelChars,
  category_label: LIMITS.labelChars,
  merchant: LIMITS.merchantChars,
  note: LIMITS.noteChars,
};

const normalizeHeader = (value: string) => value.replace(/^﻿/, '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

function roleOf(header: string): Role | null {
  for (const [role, names] of Object.entries(ROLE_NAMES) as [Exclude<Role, 'known'>, readonly string[]][]) {
    if (names.includes(header)) return role;
  }
  return KNOWN_IGNORED.includes(header) ? 'known' : null;
}

/** The legacy exports' exact header sets (normalized). */
const LEGACY_HEADERS: ReadonlyArray<readonly [Layout, readonly string[]]> = [
  ['meowjot', ['วันที่', 'เวลา', 'ประเภท', 'หมวดหมู่', 'แท็ก', 'จำนวน', 'โน๊ต', 'ช่องทางจ่าย', 'จ่ายจาก', 'ธนาคารผู้รับ', 'ผู้รับ']],
  ['moneylover', ['display name', 'category', 'amount', 'currency', 'account', 'note', 'date', 'exclude report', 'id']],
  ['spendee', ['date', 'wallet', 'type', 'category', 'amount', 'note']],
];

function layoutOf(headers: readonly string[]): Layout {
  const named = headers.filter((name) => name !== '');
  const set = new Set(named);
  for (const [layout, names] of LEGACY_HEADERS) {
    if (named.length === names.length && set.size === names.length && names.every((name) => set.has(name))) return layout;
  }
  return 'generic';
}

/** Layouts whose amounts carry their direction as a sign (expenses negative, income positive). */
const SIGNED: ReadonlySet<Layout> = new Set<Layout>(['meowjot', 'moneylover']);
/** Legacy layouts known to write day-first numeric dates, used only when the file proves no order. */
const DAY_FIRST: ReadonlySet<Layout> = new Set<Layout>(['meowjot', 'moneylover', 'spendee']);

function typeKeyword(raw: string): Direction | 'unknown' | null {
  const text = raw.normalize('NFC').trim().toLowerCase();
  if (text === '' || text === '-') return null;
  if (text.includes('transfer') || text.includes('โอน')) return 'transfer';
  if (text.includes('income') || text.includes('รายรับ')) return 'income';
  if (text.includes('expense') || text.includes('รายจ่าย')) return 'expense';
  return 'unknown';
}

const EXCLUDED = /^(true|yes|1|y)$/i;
const NON_ASCII = /[^\u0000-\u007f]/;
const THB = /^(thb|฿|บาท)$/i;

export function buildRows(table: SourceTable, today: string): ChildBody {
  const [header, ...data] = table.rows;
  if (!header || data.length === 0) throw new ParseRejection('empty_file');
  if (data.length > LIMITS.candidateRows) throw new ParseRejection('too_many_rows');

  const headers = header.cells.map(normalizeHeader);
  const columns = new Map<Role, number>();
  let unmapped = false;
  headers.forEach((name, index) => {
    if (name === '') return;
    const role = roleOf(name);
    if (role === null) {
      unmapped = true;
      return;
    }
    if (role === 'known') return;
    if (columns.has(role)) throw new ParseRejection('ambiguous_columns');
    columns.set(role, index);
  });
  if (!columns.has('date') || !columns.has('amount')) throw new ParseRejection('unrecognized_columns');

  const layout = layoutOf(headers);
  const cell = (cells: readonly string[], role: Role): string => {
    const index = columns.get(role);
    return index === undefined ? '' : (cells[index] ?? '').trim();
  };
  // A lone "-" is the legacy exports' "nothing here".
  const text = (cells: readonly string[], role: Role): string | null => {
    const value = cell(cells, role);
    return value === '' || value === '-' ? null : value;
  };
  const order: DateOrder | 'conflict' = detectDateOrder(
    data.map((row) => cell(row.cells, 'date')),
    DAY_FIRST.has(layout) ? 'dmy' : null,
  );
  const convention = detectAmountConvention(data.map((row) => cell(row.cells, 'amount')));

  const rows: ParsedRow[] = data.map((row) => {
    const issues: RowIssue[] = [];
    const flag = (field: Field | null, code: string) => issues.push({ field, code });

    const date = parseDateText(cell(row.cells, 'date'), { order, today });
    if (!date.ok) flag('occurred_on', date.code);

    let amount: string | null = null;
    let negative: boolean | null = null;
    let explicitPlus = false;
    const amountText = cell(row.cells, 'amount');
    const parsedAmount = parseAmountText(amountText, convention);
    const currency = cell(row.cells, 'currency');
    if (currency !== '' && currency !== '-' && !THB.test(currency)) {
      flag('amount_minor', 'unsupported_currency');
    } else if (parsedAmount.ok) {
      amount = parsedAmount.minor;
      negative = parsedAmount.negative;
      explicitPlus = /^\s*\(?\s*(?:฿|thb)?\s*\+/i.test(amountText);
    } else {
      flag('amount_minor', parsedAmount.code);
    }

    let type: Direction | null = null;
    const keyword = typeKeyword(cell(row.cells, 'type'));
    if (keyword === 'unknown') {
      flag('type', 'unknown_type');
    } else if (keyword !== null) {
      if ((keyword === 'income' && negative === true) || (keyword === 'expense' && explicitPlus)) flag('type', 'type_conflict');
      else type = keyword;
    } else if (SIGNED.has(layout) && negative !== null) {
      type = negative ? 'expense' : 'income';
    } else {
      flag('type', 'missing_type');
    }

    const values: Record<'wallet_label' | 'category_label' | 'merchant' | 'note', string | null> = {
      wallet_label: text(row.cells, 'wallet'),
      category_label: text(row.cells, 'category'),
      merchant: text(row.cells, 'merchant'),
      note: text(row.cells, 'note'),
    };
    for (const field of ['wallet_label', 'category_label', 'merchant', 'note'] as const) {
      const value = values[field];
      if (value !== null && [...value].length > TEXT_LIMITS[field]) {
        values[field] = null;
        flag(field, 'text_too_long');
      }
    }
    if (table.encoding === 'windows-874') {
      for (const field of ['wallet_label', 'category_label', 'merchant', 'note'] as const) {
        if (values[field] !== null && NON_ASCII.test(values[field] as string)) flag(field, 'legacy_encoding_text');
      }
    }
    if (values.wallet_label === null && !issues.some((issue) => issue.field === 'wallet_label')) flag('wallet_label', 'missing_wallet');
    if (EXCLUDED.test(cell(row.cells, 'exclude'))) flag(null, 'excluded_in_source');
    if (type === 'transfer') flag(null, 'transfer_destination_missing');

    return {
      source_row_id: `row:${row.n}`,
      occurred_on: date.ok ? date.date : null,
      type,
      amount_minor: amount,
      ...values,
      issues,
    };
  });

  const file_issues: string[] = [];
  if (table.encoding === 'windows-874') file_issues.push('legacy_encoding');
  if (unmapped) file_issues.push('unmapped_columns');
  if (convention === 'mixed') file_issues.push('mixed_amount_separators');
  return { layout, rows, file_issues, image: null };
}
