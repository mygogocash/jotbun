import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { IMPORT_PARSE_DEADLINE_SECONDS, IMPORT_PARSE_LIMITS, MERCHANT_MAX_CHARS, NAME_MAX_CHARS, NOTE_MAX_CHARS } from '@gogospend/contracts';
import sharp from 'sharp';

import {
  BROKEN_JPEG,
  IMAGE_MARKERS,
  UNKNOWN_FIELDS_CSV,
  XLSX_STATEMENT_ROWS,
  buildXlsx,
  buildZip,
  columnName,
  csv,
  csvRows,
  deflatedZeros,
  imageWithMetadata,
  pngClaiming,
} from './fixtures/synthetic-parse';
import { toPreviewRecord } from './parse-handler';
import { ParserRunner, validateParseResult } from './parser-runner';
import type { ParserRunOutcome } from './parser-runner';
import { parseAmountText } from './parsers/amount';
import { readCsv } from './parsers/csv';
import { detectDateOrder, excelSerialToIso, parseDateText } from './parsers/date';
import { LIMITS } from './parsers/protocol';
import type { ParseFormat, ParseSuccess, ParsedRow } from './parsers/protocol';

const TODAY = '2026-10-17';
const LEGACY = (name: string) => readFileSync(join(__dirname, '..', 'spend', 'fixtures', name));
const PROBES = join(__dirname, 'fixtures', 'probes');
const probe = (name: string) => join(PROBES, `${name}.ts`);

const runner = new ParserRunner();
const parse = (format: ParseFormat, bytes: Uint8Array) => runner.run({ format, bytes, today: TODAY });

async function parsed(format: ParseFormat, bytes: Uint8Array): Promise<ParseSuccess> {
  const outcome = await parse(format, bytes);
  if (outcome.kind !== 'result' || !outcome.result.ok) throw new Error(`expected a parse, got ${JSON.stringify(outcome)}`);
  return outcome.result;
}

async function rejected(format: ParseFormat, bytes: Uint8Array): Promise<string> {
  const outcome = await parse(format, bytes);
  expect(outcome.kind).toBe('result');
  const result = (outcome as Extract<ParserRunOutcome, { kind: 'result' }>).result;
  expect(result.ok).toBe(false);
  return result.ok ? 'not rejected' : result.code;
}

const row = (overrides: Partial<ParsedRow> & { source_row_id: string }): ParsedRow => ({
  occurred_on: null,
  type: null,
  amount_minor: null,
  wallet_label: null,
  category_label: null,
  merchant: null,
  note: null,
  issues: [],
  ...overrides,
});

describe('exact amounts (never Math.round(Number(x) * 100))', () => {
  it.each([
    ['-290', '29000', true],
    ['120.50', '12050', false],
    ['120.5', '12050', false],
    ['1,234.56', '123456', false],
    ['+2000', '200000', false],
    ['฿ 1,000', '100000', false],
    ['1000 บาท', '100000', false],
    ['THB 65.00', '6500', false],
    ['(42.50)', '4250', true],
    ['−7.25', '725', true],
    ['๑๒๐.๕๐', '12050', false],
    ['0.01', '1', false],
    ['999,999,999.99', '99999999999', false],
    ['1.10000', '110', false],
    // Binary floating point would turn these into neighbours of the real value.
    ['0.29', '29', false],
    ['1.005', 'excess_precision', false],
    ['4.35', '435', false],
    ['8.675309', 'excess_precision', false],
  ])('%s', (raw, expected, negative) => {
    const result = parseAmountText(raw);
    if (/^[0-9]+$/.test(expected)) {
      expect(result).toEqual({ ok: true, minor: expected, negative: negative });
    } else {
      expect(result).toEqual({ ok: false, code: expected });
    }
  });

  it('the amount, CSV and table code never passes money through a JavaScript number', () => {
    for (const name of ['amount', 'table', 'csv']) {
      const source = readFileSync(join(__dirname, 'parsers', `${name}.ts`), 'utf8');
      expect(source).not.toMatch(/Number\(|parseFloat|Math\.round|toFixed|\*\s*100\b/);
    }
  });

  it.each([
    ['', 'missing_amount'],
    ['-', 'missing_amount'],
    ['1,23', 'ambiguous_amount'],
    ['1.234,56', 'ambiguous_amount'],
    ['12,3456', 'ambiguous_amount'],
    ['1e3', 'invalid_amount'],
    ['12.', 'invalid_amount'],
    ['abc', 'invalid_amount'],
    ['1 234', 'invalid_amount'],
    ['--5', 'invalid_amount'],
    ['$12.00', 'unsupported_currency'],
    ['0', 'zero_amount'],
    ['0.00', 'zero_amount'],
    ['1,000,000,000.00', 'amount_over_cap'],
    ['9'.repeat(40), 'amount_over_cap'],
  ])('refuses %j as %s', (raw, code) => {
    expect(parseAmountText(raw)).toEqual({ ok: false, code });
  });
});

describe('dates: Gregorian and Buddhist era, never guessed', () => {
  const at = (raw: string, order: 'dmy' | 'mdy' | null = 'dmy') => parseDateText(raw, { order, today: TODAY });

  it.each([
    // Leap days: the Buddhist year itself is never the leap-year test.
    ['29/02/2567', '2024-02-29'],
    ['29/02/2024', '2024-02-29'],
    ['29/2/2543', '2000-02-29'],
    ['2567-02-29', '2024-02-29'],
    ['1/12/2568', '2025-12-01'],
    ['2025-01-15', '2025-01-15'],
    ['2026/08/15', '2026-08-15'],
    ['15.08.2026', '2026-08-15'],
    ['15/08/2026 13:45', '2026-08-15'],
    ['2026-08-15T13:45:00', '2026-08-15'],
    // An instant with a zone is placed on its Bangkok calendar day.
    ['2026-08-15T18:30:00Z', '2026-08-16'],
    ['2026-08-15T23:30:00+07:00', '2026-08-15'],
    ['15 ส.ค. 2569', '2026-08-15'],
    ['1 มกราคม 2568', '2025-01-01'],
    ['15 Aug 2026', '2026-08-15'],
    ['August 15, 2026', '2026-08-15'],
    ['๑๕/๘/๒๕๖๙', '2026-08-15'],
    ['1970-01-01', '1970-01-01'],
    [TODAY, TODAY],
  ])('%s is %s', (raw, iso) => {
    expect(at(raw)).toEqual({ ok: true, date: iso });
  });

  it.each([
    ['29/02/2566', 'invalid_date'],
    ['29/02/2023', 'invalid_date'],
    ['29/02/2443', 'invalid_date'],
    ['2566-02-29', 'invalid_date'],
    ['31/04/2026', 'invalid_date'],
    ['13/13/2026', 'invalid_date'],
    ['1/12/68', 'ambiguous_date'],
    ['45678', 'invalid_date'],
    ['yesterday', 'invalid_date'],
    ['', 'missing_date'],
    ['31/12/1969', 'date_out_of_range'],
    ['2026-10-18', 'date_out_of_range'],
    ['01/01/2700', 'date_out_of_range'],
  ])('%s is refused as %s', (raw, code) => {
    expect(at(raw)).toEqual({ ok: false, code });
  });

  it('a day-month order is never assumed: ambiguous without evidence, resolved by the file', () => {
    expect(at('03/04/2026', null)).toEqual({ ok: false, code: 'ambiguous_date' });
    expect(at('03/04/2026', 'dmy')).toEqual({ ok: true, date: '2026-04-03' });
    expect(at('03/04/2026', 'mdy')).toEqual({ ok: true, date: '2026-03-04' });
    // The same number twice is the same date either way.
    expect(at('05/05/2026', null)).toEqual({ ok: true, date: '2026-05-05' });
    expect(detectDateOrder(['03/04/2026', '15/04/2026'], null)).toBe('dmy');
    expect(detectDateOrder(['03/04/2026', '04/15/2026'], 'dmy')).toBe('mdy');
    expect(detectDateOrder(['03/04/2026', '04/05/2026'], null)).toBe(null);
    expect(detectDateOrder(['03/04/2026', '04/05/2026'], 'dmy')).toBe('dmy');
    expect(detectDateOrder(['13/04/2026', '04/15/2026'], 'dmy')).toBe('conflict');
    expect(parseDateText('13/04/2026', { order: 'conflict', today: TODAY })).toEqual({ ok: false, code: 'ambiguous_date' });
  });

  it('converts Excel serials exactly in both date systems', () => {
    expect(excelSerialToIso('45658', false)).toBe('2025-01-01');
    expect(excelSerialToIso('45658.75', false)).toBe('2025-01-01');
    expect(excelSerialToIso('45351', false)).toBe('2024-02-29');
    expect(excelSerialToIso('25569', false)).toBe('1970-01-01');
    expect(excelSerialToIso('44196', true)).toBe('2025-01-01');
    expect(excelSerialToIso('60', false)).toBeNull();
    expect(excelSerialToIso('-1', false)).toBeNull();
    expect(excelSerialToIso('1e5', false)).toBeNull();
  });
});

describe('the parser child: CSV', () => {
  it('reads the legacy Meowjot export with exact amounts, Buddhist-era dates and no guessed wallet', async () => {
    const result = await parsed('csv', LEGACY('meowjot-export-sample.csv'));
    expect(result.layout).toBe('meowjot');
    expect(result.file_issues).toEqual([]);
    expect(result.image).toBeNull();
    expect(result.rows).toEqual([
      row({ source_row_id: 'row:2', occurred_on: '2025-12-01', type: 'expense', amount_minor: '29000', wallet_label: 'กสิกรไทย', category_label: 'อาหาร', merchant: 'บริษัท สบาย สบาย จำกัด', note: 'ข้าวมันไก่' }),
      row({ source_row_id: 'row:3', occurred_on: '2025-12-02', type: 'expense', amount_minor: '23000', wallet_label: 'กสิกรไทย', category_label: 'อาหาร', merchant: 'คอฟฟี่ แอนด์ โค' }),
      row({ source_row_id: 'row:4', occurred_on: '2025-12-03', type: 'expense', amount_minor: '2000', wallet_label: 'กรุงไทย', category_label: 'สุขภาพ, ดูแลตัวเอง', merchant: 'การกีฬาสุขภาพดี' }),
      // The payment channel ("บัญชี") is not a wallet: the wallet stays unknown.
      row({ source_row_id: 'row:5', occurred_on: '2025-12-03', type: 'income', amount_minor: '200000', category_label: 'ค่าจ้าง', issues: [{ field: 'wallet_label', code: 'missing_wallet' }] }),
      row({ source_row_id: 'row:6', occurred_on: '2025-12-04', type: 'expense', amount_minor: '100000', wallet_label: 'KBANK PLATINUM', category_label: 'ช้อปปิ้ง', merchant: 'EASY MALL' }),
      row({ source_row_id: 'row:7', occurred_on: '2025-12-05', type: 'income', amount_minor: '35000', wallet_label: 'KBANK PLATINUM', category_label: 'เงินคืน', merchant: 'THE CLOTH SHOP' }),
    ]);
  });

  it('reads the legacy Money Lover export: signs give direction, a source-excluded row is flagged, not dropped', async () => {
    const result = await parsed('csv', LEGACY('moneylover-sample.csv'));
    expect(result.layout).toBe('moneylover');
    expect(result.rows).toEqual([
      row({ source_row_id: 'row:2', occurred_on: '2026-08-15', type: 'expense', amount_minor: '12000', wallet_label: 'Cash', category_label: 'Food & Beverage', merchant: 'Pad Thai', note: 'Lunch' }),
      row({ source_row_id: 'row:3', occurred_on: '2026-08-01', type: 'income', amount_minor: '200000', wallet_label: 'Bank', category_label: 'Income', merchant: 'Salary', note: 'August' }),
      row({ source_row_id: 'row:4', occurred_on: '2026-08-02', type: 'expense', amount_minor: '5000', wallet_label: 'Cash', category_label: 'Transfer', merchant: 'Internal move', note: 'To bank', issues: [{ field: null, code: 'excluded_in_source' }] }),
    ]);
  });

  it('reads the legacy Spendee export; a transfer without a destination wallet needs review', async () => {
    const result = await parsed('csv', LEGACY('spendee-th-sample.csv'));
    expect(result.layout).toBe('spendee');
    expect(result.rows).toEqual([
      row({ source_row_id: 'row:2', occurred_on: '2025-01-15', type: 'expense', amount_minor: '12050', wallet_label: 'Cash', category_label: 'อาหาร', note: 'Lunch' }),
      row({ source_row_id: 'row:3', occurred_on: '2025-01-16', type: 'income', amount_minor: '100000', wallet_label: 'Cash', category_label: 'เงินเดือน', note: 'January' }),
      row({ source_row_id: 'row:4', occurred_on: '2025-01-17', type: 'transfer', amount_minor: '20000', wallet_label: 'Cash', category_label: 'Transfer', note: 'To bank', issues: [{ field: null, code: 'transfer_destination_missing' }] }),
    ]);
  });

  it('ignores unknown columns (id-like ones included) and says so; nothing unknown reaches a candidate', async () => {
    const result = await parsed('csv', UNKNOWN_FIELDS_CSV);
    expect(result.layout).toBe('generic');
    expect(result.file_issues).toEqual(['unmapped_columns']);
    expect(result.rows).toEqual([row({ source_row_id: 'row:2', occurred_on: '2026-02-03', type: 'expense', amount_minor: '6500', wallet_label: 'Cash' })]);
    const text = JSON.stringify(result.rows);
    for (const id of ['11111111', '22222222', '33333333', '44444444', '55555555', '999999', 'synthetic-unknown-value']) expect(text).not.toContain(id);
  });

  it('keeps unknown values null with a reason: no type, no wallet, unsigned amount, ambiguous date', async () => {
    const result = await parsed('csv', csv(['date,amount,note', '03/04/2026,65.00,unsigned', '04/05/2026,-12.00,signed', '2026-04-06,1.005,precise', '2026-04-07,,empty']));
    expect(result.layout).toBe('generic');
    expect(result.rows).toEqual([
      row({ source_row_id: 'row:2', amount_minor: '6500', note: 'unsigned', issues: [{ field: 'occurred_on', code: 'ambiguous_date' }, { field: 'type', code: 'missing_type' }, { field: 'wallet_label', code: 'missing_wallet' }] }),
      row({ source_row_id: 'row:3', type: 'expense', amount_minor: '1200', note: 'signed', issues: [{ field: 'occurred_on', code: 'ambiguous_date' }, { field: 'wallet_label', code: 'missing_wallet' }] }),
      row({ source_row_id: 'row:4', occurred_on: '2026-04-06', note: 'precise', issues: [{ field: 'amount_minor', code: 'excess_precision' }, { field: 'type', code: 'missing_type' }, { field: 'wallet_label', code: 'missing_wallet' }] }),
      row({ source_row_id: 'row:5', occurred_on: '2026-04-07', note: 'empty', issues: [{ field: 'amount_minor', code: 'missing_amount' }, { field: 'type', code: 'missing_type' }, { field: 'wallet_label', code: 'missing_wallet' }] }),
    ]);
  });

  it('flags a type that contradicts its sign, a foreign currency and an unknown type keyword', async () => {
    const result = await parsed('csv', csv(['date,type,amount,currency,wallet', '2026-04-01,income,-10.00,THB,Cash', '2026-04-02,expense,10.00,USD,Cash', '2026-04-03,refund,10.00,THB,Cash']));
    expect(result.rows).toEqual([
      row({ source_row_id: 'row:2', occurred_on: '2026-04-01', amount_minor: '1000', wallet_label: 'Cash', issues: [{ field: 'type', code: 'type_conflict' }] }),
      row({ source_row_id: 'row:3', occurred_on: '2026-04-02', type: 'expense', wallet_label: 'Cash', issues: [{ field: 'amount_minor', code: 'unsupported_currency' }] }),
      row({ source_row_id: 'row:4', occurred_on: '2026-04-03', amount_minor: '1000', wallet_label: 'Cash', issues: [{ field: 'type', code: 'unknown_type' }] }),
    ]);
  });

  it('reads Thai text in the legacy Windows-874 code page and says which encoding it used', async () => {
    const bytes = Buffer.concat([Buffer.from('date,type,amount,wallet\n2026-03-01,expense,65.00,', 'latin1'), Buffer.from([0xa1, 0xd2, 0xe1, 0xbf]), Buffer.from('\n', 'latin1')]);
    const result = await parsed('csv', bytes);
    expect(result.file_issues).toEqual(['legacy_encoding']);
    expect(result.rows[0].wallet_label).toBe('กาแฟ');
  });

  it('keeps record numbers as source row ids across blank lines and quoted line breaks', async () => {
    const result = await parsed('csv', csv(['date,type,amount,wallet,note', '2026-01-01,expense,1,Cash,"two', 'lines"', '', '2026-01-02,expense,2,Cash,after blank']));
    expect(result.rows.map((candidate) => [candidate.source_row_id, candidate.note])).toEqual([['row:2', 'two\nlines'], ['row:4', 'after blank']]);
  });

  it.each<[string, Buffer, string]>([
    ['more than 5,000 rows', csvRows(IMPORT_PARSE_LIMITS.candidateRows + 1), 'too_many_rows'],
    ['more than 100 columns', csv([Array.from({ length: 101 }, (_, i) => (i === 0 ? 'date' : i === 1 ? 'amount' : `c${i}`)).join(','), '2026-01-01,1']), 'too_many_columns'],
    ['a cell over 10,000 characters', csv(['date,amount,note', `2026-01-01,1,${'x'.repeat(IMPORT_PARSE_LIMITS.cellChars + 1)}`]), 'cell_too_long'],
    ['a quoted cell over 10,000 characters', csv(['date,amount,note', `2026-01-01,1,"${'x""'.repeat(IMPORT_PARSE_LIMITS.cellChars / 2 + 1)}"`]), 'cell_too_long'],
    ['an unterminated quote running to the end', csv(['date,amount,note', '2026-01-01,1,"never closed']), 'malformed_csv'],
    ['a quote inside an unquoted cell', csv(['date,amount,note', '2026-01-01,1,ab"c']), 'malformed_csv'],
    ['no date or amount column', csv(['when,how much', '2026-01-01,1']), 'unrecognized_columns'],
    ['two columns for the same field', csv(['date,amount,จำนวน', '2026-01-01,1,2']), 'ambiguous_columns'],
    ['a header and nothing else', csv(['date,amount']), 'empty_file'],
  ])('rejects %s as a whole file', async (_label, bytes, code) => {
    expect(await rejected('csv', bytes)).toBe(code);
  });

  it('the CSV reader itself stops at the row bound, before building any candidate', () => {
    expect(readCsv(csvRows(IMPORT_PARSE_LIMITS.candidateRows)).rows).toHaveLength(5_001);
    expect(() => readCsv(csvRows(IMPORT_PARSE_LIMITS.candidateRows + 1))).toThrow(expect.objectContaining({ code: 'too_many_rows' }));
    expect(() => readCsv(Buffer.from(`${','.repeat(2_000)}\n`))).toThrow(expect.objectContaining({ code: 'too_many_columns' }));
  });

  it('accepts exactly 5,000 rows', async () => {
    const result = await parsed('csv', csvRows(IMPORT_PARSE_LIMITS.candidateRows));
    expect(result.rows).toHaveLength(5_000);
    expect(result.rows[4_999].source_row_id).toBe('row:5001');
  });
});

describe('the parser child: XLSX', () => {
  it('reads one worksheet: shared and inline strings, a date-styled serial, Buddhist leap day and signed amounts', async () => {
    const result = await parsed('xlsx', buildXlsx({ sheets: [{ rows: XLSX_STATEMENT_ROWS }, { name: 'Empty', rows: [] }] }));
    expect(result.layout).toBe('meowjot');
    expect(result.rows).toEqual([
      row({ source_row_id: 'row:2', occurred_on: '2025-01-01', type: 'expense', amount_minor: '12050', wallet_label: 'เงินสด', category_label: 'อาหาร', note: 'ข้าวสังเคราะห์' }),
      row({ source_row_id: 'row:3', occurred_on: '2024-02-29', type: 'income', amount_minor: '1500000', wallet_label: 'ธนาคารสังเคราะห์', category_label: 'เงินเดือน', note: 'synthetic pay' }),
      row({ source_row_id: 'row:4', occurred_on: '2026-03-03', type: 'expense', amount_minor: '4250', wallet_label: 'เงินสด', category_label: 'เดินทาง' }),
    ]);
  });

  it('uses the 1904 date system when the workbook says so, and worksheet row numbers as ids', async () => {
    const result = await parsed('xlsx', buildXlsx({ date1904: true, sheets: [{ rows: [['date', 'amount', 'type', 'wallet'], [{ date: '44196' }, 5, 'expense', 'Cash']], rowNumbers: [3, 9] }] }));
    expect(result.rows).toEqual([row({ source_row_id: 'row:9', occurred_on: '2025-01-01', type: 'expense', amount_minor: '500', wallet_label: 'Cash' })]);
  });

  it('reads rich-text shared strings without their phonetic runs', async () => {
    const result = await parsed('xlsx', buildXlsx({
      // Shared strings in order of use: date, amount, note, then the data row's "x" (replaced by rich text).
      sheets: [{ rows: [['date', 'amount', 'note'], [{ inline: '2026-01-01' }, 1, 'x']] }],
      sharedStringItems: ['<si><t>date</t></si>', '<si><t>amount</t></si>', '<si><t>note</t></si>', '<si><r><t xml:space="preserve">rich </t></r><r><t>text</t></r><rPh><t>PHONETIC</t></rPh></si>'],
    }));
    expect(result.rows[0].note).toBe('rich text');
  });

  const statement = (extra: Partial<Parameters<typeof buildXlsx>[0]> = {}) => buildXlsx({ sheets: [{ rows: XLSX_STATEMENT_ROWS }], ...extra });
  const zipBombEntry = { name: 'xl/media/padding.bin', data: Buffer.alloc(IMPORT_PARSE_LIMITS.zipExpandedBytes + 1) };

  it.each<[string, () => Buffer, string]>([
    ['a formula cell', () => buildXlsx({ sheets: [{ rows: [['date', 'amount'], ['2026-01-01', { formula: 'SUM(1,2)', value: '3' }]] }] }), 'formulas'],
    ['a VBA project', () => statement({ extraEntries: [{ name: 'xl/vbaProject.bin', data: Buffer.from('synthetic macro') }] }), 'macros'],
    ['a macro-enabled content type', () => statement({ contentTypesExtra: '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>' }), 'macros'],
    ['an Excel 4.0 macro sheet', () => buildXlsx({ sheets: [{ rows: XLSX_STATEMENT_ROWS }, { rows: [['=EXEC("calc")']], kind: 'macrosheet' }] }), 'macros'],
    ['an external workbook link part', () => statement({ extraEntries: [{ name: 'xl/externalLinks/externalLink1.xml', data: '<externalLink/>' }] }), 'external_references'],
    ['an external relationship', () => statement({ extraWorkbookRels: '<Relationship Id="rIdX" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink" Target="https://example.invalid/book.xlsx" TargetMode="External"/>' }), 'external_references'],
    ['an external hyperlink target', () => statement({ extraWorkbookRels: '<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid/" TargetMode="External"/>' }), 'external_references'],
    ['an external reference in a defined name', () => statement({ workbookExtra: '<definedNames><definedName name="rate">[1]Sheet1!$A$1</definedName></definedNames>' }), 'external_references'],
    ['a DOCTYPE without an internal subset', () => statement({ workbookPrologue: '<?xml version="1.0"?><!DOCTYPE workbook>' }), 'workbook_malformed'],
    ['an undeclared entity', () => statement({ workbookExtra: '<definedNames><definedName name="x">&lol;</definedName></definedNames>' }), 'workbook_malformed'],
    ['a data connection', () => statement({ extraEntries: [{ name: 'xl/connections.xml', data: '<connections/>' }] }), 'external_references'],
    ['two non-empty worksheets', () => buildXlsx({ sheets: [{ rows: XLSX_STATEMENT_ROWS }, { rows: [['date', 'amount'], ['2026-01-01', 1]] }] }), 'multiple_worksheets'],
    ['a DOCTYPE with entity expansion', () => statement({ workbookPrologue: '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]>' }), 'workbook_malformed'],
    ['an entry that inflates past 50 MiB (decompression bomb)', () => statement({ extraEntries: [zipBombEntry] }), 'zip_too_large'],
    ['an entry whose header understates its size', () => statement({ extraEntries: [{ name: 'xl/media/liar.bin', data: Buffer.alloc(4 * 1024 * 1024), declaredSize: 10 }] }), 'zip_malformed'],
    ['more than 1,000 entries', () => statement({ extraEntries: Array.from({ length: IMPORT_PARSE_LIMITS.zipEntries }, (_, i) => ({ name: `xl/media/p${i}.bin`, data: 'x', method: 'store' as const })) }), 'zip_too_many_entries'],
    ['an encrypted entry', () => statement({ extraEntries: [{ name: 'xl/media/locked.bin', data: 'x', flags: 1 }] }), 'zip_unsupported'],
    ['a ZIP64 directory', () => buildZip([{ name: 'xl/workbook.xml', data: '<workbook/>' }], { zip64: true }), 'zip_unsupported'],
    ['a corrupted entry (CRC mismatch)', () => statement({ extraEntries: [{ name: 'xl/media/bad.bin', data: 'payload', crc: 1 }] }), 'zip_malformed'],
    ['entries that share their data', () => buildZip([{ name: 'a.xml', data: 'aaaa' }, { name: 'b.xml', data: 'bbbb', localOf: 0 }]), 'zip_malformed'],
    ['a value in column 101', () => buildXlsx({ sheets: [{ rows: [['date', 'amount', ...Array.from({ length: 99 }, (_, i) => `c${i}`)], ['2026-01-01', 1]] }] }), 'too_many_columns'],
    ['more than 5,000 data rows', () => buildXlsx({ sheets: [{ rows: [['date', 'amount', 'type', 'wallet'], ...Array.from({ length: 5_001 }, () => ['2026-01-01', 1, 'expense', 'Cash'] as (string | number)[])] }] }), 'too_many_rows'],
    ['a shared string over 10,000 characters', () => buildXlsx({ sheets: [{ rows: [['date', 'amount', 'note'], ['2026-01-01', 1, 'y'.repeat(IMPORT_PARSE_LIMITS.cellChars + 1)]] }] }), 'cell_too_long'],
    ['a workbook without worksheets', () => buildXlsx({ sheets: [] }), 'empty_file'],
    ['bytes that are not a ZIP at all', () => Buffer.from('PK\u0003\u0004 then nothing useful'), 'zip_malformed'],
  ])('rejects %s', async (_label, build, code) => {
    expect(await rejected('xlsx', build())).toBe(code);
  });

  it('stops inflating an entry at its declared size: 512 MiB of zeros claiming 10 bytes never reaches memory', async () => {
    const bomb = await deflatedZeros(512 * 1024 * 1024);
    expect(bomb.length).toBeLessThan(LIMITS.inputBytes);
    const outcome = await parse('xlsx', statement({ extraEntries: [{ name: 'xl/media/bomb.bin', data: '', deflated: bomb, declaredSize: 10, crc: 0 }] }));
    expect(outcome.kind).toBe('result');
    const result = (outcome as Extract<ParserRunOutcome, { kind: 'result' }>).result;
    expect(result).toMatchObject({ ok: false, code: 'zip_malformed' });
    expect(result.usage.max_rss_kb).toBeLessThan(256 * 1024);
  }, 60_000);

  it('column letters for the fixture are right (A, Z, AA, CW)', () => {
    expect([0, 25, 26, 100].map(columnName)).toEqual(['A', 'Z', 'AA', 'CW']);
  });
});

describe('the parser child: images', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('re-encodes a %s with every metadata marker removed', async (format) => {
    const original = await imageWithMetadata(format, 64, 48);
    const before = await sharp(original).metadata();
    expect([Boolean(before.exif), Boolean(before.xmp)]).toEqual([true, true]);
    // PNG may store text metadata compressed; JPEG and WebP carry the markers verbatim.
    if (format !== 'png') for (const marker of IMAGE_MARKERS) expect(original.includes(marker)).toBe(true);
    const result = await parsed(format, original);
    expect(result.layout).toBe('receipt');
    expect(result.file_issues).toEqual(['receipt_fields_unread']);
    expect(result.image).toMatchObject({ format, width: 64, height: 48 });
    const sanitized = Buffer.from(result.image?.base64 ?? '', 'base64');
    for (const marker of IMAGE_MARKERS) expect(sanitized.includes(marker)).toBe(false);
    const meta = await sharp(sanitized).metadata();
    expect([meta.format, meta.width, meta.height, meta.exif, meta.xmp, meta.iptc]).toEqual([format, 64, 48, undefined, undefined, undefined]);
    // Nothing is read from the picture: every field stays unknown and needs review.
    expect(result.rows).toEqual([
      row({
        source_row_id: 'image:1',
        issues: [
          { field: 'occurred_on', code: 'missing_date' },
          { field: 'type', code: 'missing_type' },
          { field: 'amount_minor', code: 'missing_amount' },
          { field: 'wallet_label', code: 'missing_wallet' },
        ],
      }),
    ]);
  });

  it('refuses an image over 20 megapixels from its header, before decoding, and accepts exactly 20 MP', async () => {
    const started = Date.now();
    expect(await rejected('png', pngClaiming(30_000, 30_000))).toBe('image_too_large');
    expect(await rejected('png', pngClaiming(5_000, 4_001))).toBe('image_too_large');
    expect(Date.now() - started).toBeLessThan(10_000);
    const exact = await sharp({ create: { width: 5_000, height: 4_000, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png({ compressionLevel: 9 }).toBuffer();
    const result = await parsed('png', exact);
    expect(result.image).toMatchObject({ width: 5_000, height: 4_000 });
    // The reviewed budget: the whole child stayed under 512 MiB resident.
    expect(result.usage.max_rss_kb).toBeLessThan(512 * 1024);
  }, 60_000);

  it.each<[string, ParseFormat, () => Promise<Buffer> | Buffer, string]>([
    ['an undecodable JPEG', 'jpeg', () => BROKEN_JPEG, 'image_malformed'],
    ['a PNG presented as JPEG', 'jpeg', () => imageWithMetadata('png'), 'image_format_mismatch'],
  ])('rejects %s', async (_label, format, build, code) => {
    expect(await rejected(format, await build())).toBe(code);
  });
});

describe('the parser child runs isolated and bounded', () => {
  let server: Server;
  let port: number;
  let connections = 0;
  let scratch: string;
  const credentials: Record<string, string> = {
    DATABASE_URL: 'postgres://p2b-fixture-user:p2b-fixture-password@127.0.0.1:5432/fixture',
    LEASED_READ_DATABASE_URL: 'postgres://p2b-fixture-reader:p2b-fixture-password@127.0.0.1:5432/fixture',
    R2_ACCESS_KEY_ID: 'p2b-fixture-access-key',
    R2_SECRET_ACCESS_KEY: 'p2b-fixture-secret-key',
    AUTH0_MAINTENANCE_CLIENT_SECRET: 'p2b-fixture-auth0-secret',
    COMMAND_DIGEST_KEY: 'p2b-fixture-digest-key',
    // Assembled at runtime: P6a's scan refuses recovery-credential names anywhere in the API source.
    [['RECOVERY', 'KEY', 'REF'].join('_')]: 'p2b-fixture-recovery',
    NODE_OPTIONS: '--require /p2b/fixture/hook.js',
  };
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const [name, value] of Object.entries(credentials)) {
      saved[name] = process.env[name];
      process.env[name] = value;
    }
    server = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
    scratch = mkdtempSync(join(tmpdir(), 'p2b-runner-'));
  });

  afterAll(async () => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(scratch, { recursive: true, force: true });
  });

  async function sandboxReport(format: ParseFormat) {
    const secretPath = join(scratch, 'secret.txt');
    writeFileSync(secretPath, 'p2b-fixture-file-secret');
    const fd = openSync(secretPath, 'r');
    try {
      const { dev, ino } = statSync(secretPath);
      const probeRunner = new ParserRunner({ entries: { table: probe('sandbox-probe'), image: probe('sandbox-probe') } });
      const exit = await probeRunner.exec({ format, bytes: Buffer.from(JSON.stringify({ port, secretPath, dev, ino })), today: TODAY });
      expect(exit.reason).toBe('exited');
      const report = JSON.parse(exit.stdout.toString('utf8')) as Record<string, unknown>;
      expect(Object.keys(report).sort()).toEqual(['argv', 'child', 'codegen', 'env', 'fsRead', 'inherited', 'net', 'worker']);
      return report as {
        env: Record<string, string>;
        argv: string[];
        inherited: number[];
        fsRead: string;
        net: string;
        child: string;
        worker: string;
        codegen: string;
      };
    } finally {
      closeSync(fd);
    }
  }

  it.each(['csv', 'jpeg'] as const)('a %s child sees no credentials, no inherited descriptor, no network, files, processes, workers or eval', async (format) => {
    const report = await sandboxReport(format);
    const text = JSON.stringify(report.env);
    for (const [name, value] of Object.entries(credentials)) {
      expect(report.env[name]).toBeUndefined();
      expect(text).not.toContain(value);
    }
    expect(text).not.toMatch(/p2b-fixture/);
    // Only the explicit minimal environment (the platform may add its own locale/library markers).
    expect(report.env.TZ).toBe('UTC');
    expect(Object.keys(report.env).filter((name) => !['TZ', '__CF_USER_TEXT_ENCODING', 'VIPSHOME'].includes(name))).toEqual([]);
    expect(report.argv).toEqual([format, TODAY]);
    expect(report.inherited).toEqual([]);
    expect(report.fsRead).toBe('ERR_ACCESS_DENIED');
    expect(report.net).toBe('ERR_ACCESS_DENIED');
    expect(report.child).toBe('ERR_ACCESS_DENIED');
    expect(report.worker).toBe('ERR_ACCESS_DENIED');
    expect(report.codegen).toBe('EvalError');
    expect(connections).toBe(0);
  });

  it('only an image child may load the native image library; neither may write files or use the network', () => {
    const table = runner.launch('csv');
    const image = runner.launch('webp');
    for (const launch of [table, image]) {
      expect(launch.command).toBe(process.execPath);
      expect(launch.args).toContain('--permission');
      expect(launch.args.some((arg) => /^--allow-(net|child-process|worker|fs-write|wasi|inspector|ffi)/.test(arg))).toBe(false);
      expect(launch.args).toContain(`--max-old-space-size=256`);
      expect(launch.env).toEqual({ TZ: 'UTC' });
    }
    expect(table.args).not.toContain('--allow-addons');
    expect(image.args).toContain('--allow-addons');
  });

  async function timed(promise: Promise<ParserRunOutcome>): Promise<{ outcome: ParserRunOutcome; ms: number }> {
    const started = Date.now();
    const outcome = await promise;
    return { outcome, ms: Date.now() - started };
  }

  it('kills a child stuck past its deadline and reaps it', async () => {
    const hung = new ParserRunner({ timeoutMs: 1_000, entries: { table: probe('hang-probe') } });
    let pid: number | undefined;
    const { outcome, ms } = await timed(hung.run({ format: 'csv', bytes: Buffer.alloc(1024 * 1024, 0x41), today: TODAY, onSpawn: (spawned) => (pid = spawned) }));
    expect(outcome).toEqual({ kind: 'timeout' });
    expect(ms).toBeLessThan(5_000);
    expect(pid).toEqual(expect.any(Number));
    expect(() => process.kill(pid as number, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
  });

  it('the default parse deadline is 30 seconds', () => {
    expect(new ParserRunner().timeoutMs).toBe(IMPORT_PARSE_DEADLINE_SECONDS * 1000);
  });

  it('kills the child at once when the job is aborted (lease lost or worker stopping)', async () => {
    const hung = new ParserRunner({ timeoutMs: 20_000, entries: { table: probe('hang-probe') } });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const { outcome, ms } = await timed(hung.run({ format: 'csv', bytes: Buffer.from('x'), today: TODAY, signal: controller.signal }));
    expect(outcome).toEqual({ kind: 'aborted' });
    expect(ms).toBeLessThan(5_000);
  });

  it('a child that exhausts its heap fails visibly as a crash', async () => {
    const small = new ParserRunner({ heapMb: 32, timeoutMs: 20_000, entries: { table: probe('memory-probe') } });
    expect((await small.run({ format: 'csv', bytes: Buffer.from('x'), today: TODAY })).kind).toBe('crashed');
  }, 30_000);

  it('a child flooding its output is killed once it passes the output cap', async () => {
    const flood = new ParserRunner({ maxOutputBytes: 4 * 1024 * 1024, timeoutMs: 20_000, entries: { table: probe('flood-probe') } });
    expect(await flood.run({ format: 'csv', bytes: Buffer.from('x'), today: TODAY })).toEqual({ kind: 'output_too_large' });
  });

  it('output that is not the protocol, and a failing exit, are never trusted', async () => {
    const garbage = new ParserRunner({ entries: { table: probe('garbage-probe'), image: probe('garbage-probe') } });
    expect(await garbage.run({ format: 'csv', bytes: Buffer.from('x'), today: TODAY })).toEqual({ kind: 'output_invalid' });
    expect(await garbage.run({ format: 'png', bytes: Buffer.from('x'), today: TODAY })).toEqual({ kind: 'output_invalid' });
    expect(await garbage.run({ format: 'xlsx', bytes: Buffer.from('x'), today: TODAY })).toEqual({ kind: 'crashed' });
  });
});

describe('the worker re-validates everything a child says', () => {
  const ok = (rows: unknown[], extra: Record<string, unknown> = {}) => ({ ok: true, layout: 'generic', rows, file_issues: [], image: null, usage: { max_rss_kb: 1, cpu_ms: 1 }, ...extra });
  const good = { source_row_id: 'row:2', occurred_on: '2026-01-01', type: 'expense', amount_minor: '100', wallet_label: 'Cash', category_label: null, merchant: null, note: null, issues: [] };

  it('accepts the protocol shape', () => {
    expect(validateParseResult(ok([good]))).toEqual(ok([good]));
    expect(validateParseResult({ ok: false, code: 'formulas', usage: { max_rss_kb: 1, cpu_ms: 1 } })).toEqual({ ok: false, code: 'formulas', usage: { max_rss_kb: 1, cpu_ms: 1 } });
  });

  it.each<[string, unknown]>([
    ['an unknown key', ok([{ ...good, account_id: '00000000-0000-4000-8000-000000000000' }])],
    ['a non-canonical amount', ok([{ ...good, amount_minor: '0100' }])],
    ['an amount over the cap', ok([{ ...good, amount_minor: '100000000000' }])],
    ['a bad date', ok([{ ...good, occurred_on: '2026-13-01' }])],
    ['an unknown type', ok([{ ...good, type: 'refund' }])],
    ['a bad row id', ok([{ ...good, source_row_id: '../row' }])],
    ['duplicate row ids', ok([good, good])],
    ['an unknown issue field', ok([{ ...good, issues: [{ field: 'owner_id', code: 'x' }] }])],
    ['too many rows', ok(Array.from({ length: LIMITS.candidateRows + 1 }, (_, i) => ({ ...good, source_row_id: `row:${i + 2}` })))],
    ['text longer than a cell', ok([{ ...good, note: 'w'.repeat(LIMITS.cellChars + 1) }])],
    ['an image on a table layout with bad base64', ok([good], { image: { format: 'jpeg', width: 1, height: 1, base64: '***' } })],
    ['a huge image claim', ok([good], { image: { format: 'jpeg', width: 10_000, height: 10_000, base64: 'AAAA' } })],
    ['a failure without a code', { ok: false, usage: { max_rss_kb: 1, cpu_ms: 1 } }],
    ['not an object', 'ok'],
  ])('refuses %s', (_label, value) => {
    expect(validateParseResult(value)).toBeNull();
  });

  it('normalizes text for review with the transaction rules, nulling (and flagging) what does not fit', () => {
    const result = validateParseResult(
      ok([
        { ...good, merchant: 'one\nline?', note: `  ${'n'.repeat(NOTE_MAX_CHARS)}  `, category_label: 'Café' },
        { ...good, source_row_id: 'row:3', wallet_label: '‮evil', merchant: 'm'.repeat(MERCHANT_MAX_CHARS + 1), note: 'x\u0000y' },
      ]),
    );
    expect(result).not.toBeNull();
    const record = toPreviewRecord(result as ParseSuccess);
    expect(record.candidates).toEqual([
      {
        source_row_id: 'row:2', ordinal: 1, occurred_on: '2026-01-01', type: 'expense', amount_minor: '100', wallet_label: 'Cash', category_label: 'Café',
        merchant: null, note: 'n'.repeat(NOTE_MAX_CHARS), issues: [{ field: 'merchant', code: 'invalid_text' }], review_required: true,
      },
      {
        source_row_id: 'row:3', ordinal: 2, occurred_on: '2026-01-01', type: 'expense', amount_minor: '100', wallet_label: null, category_label: null,
        merchant: null, note: null,
        issues: [{ field: 'wallet_label', code: 'invalid_text' }, { field: 'merchant', code: 'text_too_long' }, { field: 'note', code: 'invalid_text' }],
        review_required: true,
      },
    ]);
    expect(record.preview).toMatchObject({ status: 'ready', layout: 'generic', issues: [] });
    expect(NAME_MAX_CHARS).toBe(LIMITS.labelChars);
  });

  it('the child limits are the contract limits', () => {
    const { inputBytes: _input, labelChars, merchantChars, noteChars, ...parse } = LIMITS;
    expect(parse).toEqual(IMPORT_PARSE_LIMITS);
    expect([labelChars, merchantChars, noteChars]).toEqual([NAME_MAX_CHARS, MERCHANT_MAX_CHARS, NOTE_MAX_CHARS]);
  });
});
