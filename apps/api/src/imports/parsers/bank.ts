// Thai bank exports (P4-T10), in the parser child: Node built-ins only,
// erasable TypeScript, relative imports with `.ts` extensions (protocol.ts).
// A bank's statement puts its account details above the header and money out
// and money in in two columns. This module finds that header, reads the masked
// account number above it, decides the era of two-digit years, and
// fingerprints a header so the same layout is recognized again (P4-T11).
import { createHash } from 'node:crypto';

import { twoDigitYear } from './date.ts';
import type { SourceRow } from './protocol.ts';

/** The header is looked for in a table's first 30 rows. */
export const HEADER_SEARCH_ROWS = 30;

/** The parser's header normalization (moved from table.ts): no byte-order mark, NFC, trimmed, single spaces, lower case. */
export const normalizeHeader = (value: string): string => value.replace(/^﻿/, '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/** The date and amount columns' names (table.ts's ROLE_NAMES uses these lists). */
export const DATE_NAMES: readonly string[] = ['date', 'วันที่', 'transaction date', 'วันที่ทำรายการ'];
export const AMOUNT_NAMES: readonly string[] = ['amount', 'จำนวน', 'จำนวนเงิน', 'ยอดเงิน'];

/**
 * A bank export's own columns (S12). Withdrawal and deposit hold the amount;
 * the descriptor is the category label and the details the merchant (of
 * several descriptor or details columns, the one whose name comes first here
 * is read and the others are ignored); balances are known and ignored.
 */
export const BANK_NAMES: Readonly<Record<'withdrawal' | 'deposit' | 'descriptor' | 'details' | 'balance', readonly string[]>> = {
  withdrawal: ['withdrawal', 'withdrawals', 'debit', 'ถอน', 'ถอนเงิน', 'เงินออก', 'เดบิต'],
  deposit: ['deposit', 'deposits', 'credit', 'ฝาก', 'ฝากเงิน', 'เงินเข้า', 'เครดิต'],
  descriptor: ['รายการ', 'transaction', 'description', 'คำอธิบาย'],
  details: ['รายละเอียด', 'details', 'channel', 'ช่องทาง', 'memo'],
  balance: ['balance', 'ยอดคงเหลือ', 'คงเหลือ'],
};

const names = (list: readonly string[], headers: readonly string[]) => headers.some((header) => list.includes(header));

/** The bank layout: the normalized header names both a withdrawal and a deposit column. */
export function isBankHeader(headers: readonly string[]): boolean {
  return names(BANK_NAMES.withdrawal, headers) && names(BANK_NAMES.deposit, headers);
}

/** The first row within 30 naming a date column and either an amount column or both a withdrawal and a deposit column; else 0. */
export function findHeaderRow(rows: readonly SourceRow[]): number {
  const limit = Math.min(rows.length, HEADER_SEARCH_ROWS);
  for (let index = 0; index < limit; index += 1) {
    const headers = rows[index].cells.map(normalizeHeader);
    if (names(DATE_NAMES, headers) && (names(AMOUNT_NAMES, headers) || isBankHeader(headers))) return index;
  }
  return 0;
}

// Two or more of x, X or *, then four or more digits, with dashes or spaces between any of them.
const MASKED_NUMBER = /(?<![A-Za-z0-9])[xX*](?:[\s-]*[xX*])+((?:[\s-]*[0-9]){4,})/;

/**
 * The account a bank export's preamble names: the first cell holding a masked
 * number gives `xxx-<last four>`, after the row's first other non-empty cell
 * when there is one (`บัญชีออมทรัพย์,xxx-x-x1234-x` is `บัญชีออมทรัพย์ xxx-1234`).
 */
export function preambleAccountLabel(rows: readonly SourceRow[]): string | null {
  for (const row of rows) {
    for (let index = 0; index < row.cells.length; index += 1) {
      const masked = MASKED_NUMBER.exec(row.cells[index]);
      if (!masked) continue;
      const account = `xxx-${masked[1].replace(/[^0-9]/g, '').slice(-4)}`;
      const other = row.cells.find((cell, at) => at !== index && cell.trim() !== '');
      return other === undefined ? account : `${other.trim()} ${account}`;
    }
  }
  return null;
}

/**
 * The era of a file's two-digit years: 'be' when every one read as 25yy less
 * 543 falls within the ten years ending today (today's year or one of the ten
 * before it) and read as 20yy does not; 'ce' for the reverse; null otherwise
 * (a file with no two-digit year leaves both true, so it is null too).
 */
export function twoDigitYearEra(dateTexts: readonly string[], today: string): 'be' | 'ce' | null {
  const thisYear = Number(today.slice(0, 4));
  const recent = (year: number) => year >= thisYear - 10 && year <= thisYear;
  let buddhist = true;
  let common = true;
  for (const text of dateTexts) {
    const year = twoDigitYear(text);
    if (year === null) continue;
    if (!recent(2500 + year - 543)) buddhist = false;
    if (!recent(2000 + year)) common = false;
  }
  if (buddhist && !common) return 'be';
  if (common && !buddhist) return 'ce';
  return null;
}

/** Lowercase hex SHA-256 of the normalized header cells joined by U+001F: one layout, one fingerprint. */
export function headerFingerprint(cells: readonly string[]): string {
  return createHash('sha256').update(cells.map(normalizeHeader).join('\u001f'), 'utf8').digest('hex');
}
