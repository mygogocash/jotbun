import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';

import { parsingRunner } from './fixtures/parsing-runner';
import { bankCsvTh, bankXlsxEn, csv } from './fixtures/synthetic-parse';
import { PARSE_FORMAT_HEADER, PARSE_TODAY_HEADER, startParseServer } from './parse-server';
import type { ParseServiceReply } from './parse-server';
import { HEADER_SEARCH_ROWS, findHeaderRow, headerFingerprint, preambleAccountLabel, twoDigitYearEra } from './parsers/bank';
import { parseDateText } from './parsers/date';
import type { ParseFormat, ParseSuccess, ParsedRow, SourceRow } from './parsers/protocol';

// Thai bank exports (P4-T10, S12): a header below preamble rows, money out
// and money in in two columns, the masked account as every row's wallet,
// two-digit Buddhist years, and a header fingerprint for every table.
// Synthetic statements only (fixtures/synthetic-parse.ts); the owner's own
// export is the phase's proof (Q10).

const TODAY = '2026-10-25';
const runner = parsingRunner();
// Most cases start real parser children, several each; under the full suite's load that can take seconds.
jest.setTimeout(30_000);

async function parsed(format: ParseFormat, bytes: Uint8Array, today = TODAY): Promise<ParseSuccess> {
  const outcome = await runner.run({ format, bytes, today });
  // An assertion, so a file the parser refuses fails the case on its outcome (the code, such as unrecognized_columns, shows in the diff).
  expect(outcome).toMatchObject({ kind: 'result', result: { ok: true } });
  if (outcome.kind !== 'result' || !outcome.result.ok) throw new Error('unreachable: the assertion above failed');
  return outcome.result;
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

const ACCOUNT = 'บัญชีออมทรัพย์ xxx-1234';
const THAI_HEADER = ['วันที่', 'เวลา', 'รายการ', 'ถอนเงิน', 'ฝากเงิน', 'ยอดคงเหลือ', 'ช่องทาง', 'รายละเอียด'];
/** bankCsvTh as the parser must read it on 25 October 2026. */
const BANK_ROWS: ParsedRow[] = [
  row({ source_row_id: 'row:8', occurred_on: '2026-10-01', wallet_label: ACCOUNT, category_label: 'ยอดยกมา', issues: [{ field: 'amount_minor', code: 'missing_amount' }] }),
  row({ source_row_id: 'row:9', occurred_on: '2026-10-03', type: 'expense', amount_minor: '150000', wallet_label: ACCOUNT, category_label: 'POS PURCHASE', merchant: 'ร้านเครื่องเขียน' }),
  row({ source_row_id: 'row:10', occurred_on: '2026-10-15', type: 'income', amount_minor: '2500000', wallet_label: ACCOUNT, category_label: 'รับโอนเงิน', merchant: 'บริษัท สังเคราะห์ จำกัด' }),
  row({ source_row_id: 'row:11', occurred_on: '2026-10-20', type: 'expense', amount_minor: '50000', wallet_label: ACCOUNT, category_label: 'ถอนเงินสด' }),
  row({ source_row_id: 'row:12', occurred_on: '2026-10-24', wallet_label: ACCOUNT, category_label: 'ปรับปรุงรายการ', issues: [{ field: 'type', code: 'type_conflict' }] }),
];

/** One CSV posted to a parse server, its JSON reply read to the end. */
function post(port: number, body: Buffer): Promise<ParseServiceReply> {
  return new Promise((resolve, reject) => {
    const headers = { 'content-type': 'application/octet-stream', [PARSE_FORMAT_HEADER]: 'csv', [PARSE_TODAY_HEADER]: TODAY };
    const req = request({ host: '127.0.0.1', port, method: 'POST', path: '/parse', headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as ParseServiceReply);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

describe('Thai bank exports', () => {
  it('finds the header below preamble rows and labels every row with the masked account', async () => {
    const result = await parsed('csv', bankCsvTh);
    expect(result.layout).toBe('generic');
    expect(result.file_issues).toEqual([]);
    expect(result.rows.map((candidate) => candidate.source_row_id)).toEqual(['row:8', 'row:9', 'row:10', 'row:11', 'row:12']);
    expect(result.rows.map((candidate) => candidate.wallet_label)).toEqual(Array(5).fill(ACCOUNT));
    expect(result.rows).toEqual(BANK_ROWS);
  });

  it('a bank export keeps a wallet or currency column of its own, reads one descriptor, and never reads an amount or type column', async () => {
    const own = await parsed('csv', csv(['บัญชีออมทรัพย์,xxx-x-x1234-x', 'วันที่,ถอนเงิน,ฝากเงิน,กระเป๋าเงิน,สกุลเงิน', '23/10/69,100.00,,เงินสด,THB', '24/10/69,,100.00,เงินสด,USD']));
    expect(own.rows).toEqual([
      row({ source_row_id: 'row:3', occurred_on: '2026-10-23', type: 'expense', amount_minor: '10000', wallet_label: 'เงินสด' }),
      row({ source_row_id: 'row:4', occurred_on: '2026-10-24', type: 'income', wallet_label: 'เงินสด', issues: [{ field: 'amount_minor', code: 'unsupported_currency' }] }),
    ]);
    // Of two descriptor columns, the one named first in the list is read (รายการ before คำอธิบาย), wherever it stands.
    const descriptors = await parsed('csv', csv(['วันที่,คำอธิบาย,รายการ,ถอนเงิน,ฝากเงิน,กระเป๋าเงิน', '24/10/69,โอนไปบัญชีอื่น,TRANSFER OUT,100.00,,เงินสด']));
    expect(descriptors.rows[0]).toMatchObject({ type: 'expense', category_label: 'TRANSFER OUT', note: null });
    // The money columns are the amount and the direction: an amount or type column is reported as unmapped and never read.
    const extra = await parsed('csv', csv(['วันที่,ถอนเงิน,ฝากเงิน,จำนวนเงิน,ประเภท,กระเป๋าเงิน', '24/10/69,100.00,,999.00,รายรับ,เงินสด']));
    expect(extra.file_issues).toEqual(['unmapped_columns']);
    expect(extra.rows).toEqual([row({ source_row_id: 'row:2', occurred_on: '2026-10-24', type: 'expense', amount_minor: '10000', wallet_label: 'เงินสด' })]);
  });

  it("both money columns share the file's one separator convention", async () => {
    const result = await parsed('csv', csv(['วันที่,ถอนเงิน,ฝากเงิน,กระเป๋าเงิน', '23/10/69,"12,50",,เงินสด', '24/10/69,,"1,234.56",เงินสด']));
    expect(result.file_issues).toEqual(['mixed_amount_separators']);
    expect(result.rows.map((candidate) => [candidate.type, candidate.amount_minor, candidate.issues])).toEqual([
      ['expense', null, [{ field: 'amount_minor', code: 'ambiguous_amount' }]],
      ['income', null, [{ field: 'amount_minor', code: 'ambiguous_amount' }]],
    ]);
  });

  it('a withdrawal is an expense and a deposit income; a row with both is type_conflict and one with neither missing_amount', async () => {
    const result = await parsed('csv', bankCsvTh);
    expect(result.rows.map((candidate) => [candidate.type, candidate.amount_minor, candidate.issues])).toEqual([
      [null, null, [{ field: 'amount_minor', code: 'missing_amount' }]],
      // -1,500.00 withdrawn: the column gives the direction and the sign is ignored.
      ['expense', '150000', []],
      ['income', '2500000', []],
      // 0.00 in the deposit column is no amount.
      ['expense', '50000', []],
      [null, null, [{ field: 'type', code: 'type_conflict' }]],
    ]);
  });

  it('descriptors become category labels and details the merchant', async () => {
    const result = await parsed('csv', bankCsvTh);
    expect(result.rows.map((candidate) => [candidate.category_label, candidate.merchant, candidate.note])).toEqual([
      ['ยอดยกมา', null, null],
      ['POS PURCHASE', 'ร้านเครื่องเขียน', null],
      ['รับโอนเงิน', 'บริษัท สังเคราะห์ จำกัด', null],
      // The channel column (ATM) is not the merchant: the details column is, and it is empty here.
      ['ถอนเงินสด', null, null],
      ['ปรับปรุงรายการ', null, null],
    ]);
  });

  it('two-digit years take the era that puts the whole file within ten years before today', async () => {
    const statement = (...dates: string[]) => csv(['วันที่,ถอนเงิน,ฝากเงิน,กระเป๋าเงิน', ...dates.map((date) => `${date},100.00,,เงินสด`)]);
    const read = async (bytes: Buffer, today: string) => (await parsed('csv', bytes, today)).rows.map((candidate) => [candidate.occurred_on, candidate.issues]);
    expect(await read(statement('24/10/69'), '2026-10-25')).toEqual([['2026-10-24', []]]);
    expect(await read(statement('24/10/26'), '2026-10-25')).toEqual([['2026-10-24', []]]);
    expect(await read(statement('24/10/69', '24/10/26'), '2026-10-25')).toEqual([
      [null, [{ field: 'occurred_on', code: 'ambiguous_date' }]],
      [null, [{ field: 'occurred_on', code: 'ambiguous_date' }]],
    ]);
    expect(await read(statement('31/12/68'), '2026-01-01')).toEqual([['2025-12-31', []]]);
  });

  it('an English XLSX export of the same layout parses to the same rows', async () => {
    const thai = await parsed('csv', bankCsvTh);
    const english = await parsed('xlsx', bankXlsxEn);
    expect(english.layout).toBe('generic');
    expect(english.file_issues).toEqual([]);
    // Each file's own preamble names the account.
    expect(english.rows.map((candidate) => candidate.wallet_label)).toEqual(Array(5).fill('Savings Account xxx-1234'));
    const withoutWallet = (rows: ParsedRow[]) => rows.map(({ wallet_label: _wallet, ...rest }) => rest);
    expect(withoutWallet(english.rows)).toEqual(withoutWallet(thai.rows));
  });

  it('the header fingerprint is the same for two files of one layout and differs for another', async () => {
    const thai = await parsed('csv', bankCsvTh);
    // Another account, other rows and a padded header cell: the same layout.
    const sameLayout = await parsed(
      'csv',
      csv([
        'บัญชีกระแสรายวัน,xxx-x-x9876-x',
        ' วันที่ ,เวลา,รายการ,ถอนเงิน,ฝากเงิน,ยอดคงเหลือ,ช่องทาง,รายละเอียด',
        '25/10/69,07:00,ค่าน้ำ,120.00,,880.00,K PLUS,การประปาสังเคราะห์',
      ]),
    );
    const english = await parsed('xlsx', bankXlsxEn);
    expect(thai.header_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(thai.header_fingerprint).toBe(headerFingerprint(THAI_HEADER));
    expect(sameLayout.header_fingerprint).toBe(thai.header_fingerprint);
    expect(english.header_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(english.header_fingerprint).not.toBe(thai.header_fingerprint);
  });

  it('every other file parses exactly as before', async () => {
    // A generic description column is still the note, and a withdrawal column alone is no bank export.
    const generic = await parsed('csv', csv(['date,type,amount,wallet,description,debit', '2026-10-20,expense,60.00,Cash,lunch,60.00']));
    expect(generic.layout).toBe('generic');
    expect(generic.file_issues).toEqual(['unmapped_columns']);
    expect(generic.rows).toEqual([row({ source_row_id: 'row:2', occurred_on: '2026-10-20', type: 'expense', amount_minor: '6000', wallet_label: 'Cash', note: 'lunch' })]);
    expect(generic.header_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(generic.header_fingerprint).toBe(headerFingerprint(['date', 'type', 'amount', 'wallet', 'description', 'debit']));
    // Outside a bank export a two-digit year stays ambiguous, as today.
    const twoDigit = await parsed('csv', csv(['date,type,amount,wallet', '24/10/69,expense,60.00,Cash']));
    expect(twoDigit.rows).toEqual([row({ source_row_id: 'row:2', type: 'expense', amount_minor: '6000', wallet_label: 'Cash', issues: [{ field: 'occurred_on', code: 'ambiguous_date' }] })]);
    // The legacy exports keep their layouts (parser-runner.spec pins every row), now with their header's fingerprint.
    const legacy: [string, string, string[]][] = [
      ['meowjot-export-sample.csv', 'meowjot', ['วันที่', 'เวลา', 'ประเภท', 'หมวดหมู่', 'แท็ก', 'จำนวน', 'โน๊ต', 'ช่องทางจ่าย', 'จ่ายจาก', 'ธนาคารผู้รับ', 'ผู้รับ']],
      ['moneylover-sample.csv', 'moneylover', ['Display Name', 'Category', 'Amount', 'Currency', 'Account', 'Note', 'Date', 'Exclude Report', 'Id']],
      ['spendee-th-sample.csv', 'spendee', ['Date', 'Wallet', 'Type', 'Category', 'Amount', 'Note']],
    ];
    for (const [name, layout, header] of legacy) {
      const result = await parsed('csv', readFileSync(join(__dirname, '..', 'spend', 'fixtures', name)));
      expect([result.layout, result.header_fingerprint]).toEqual([layout, headerFingerprint(header)]);
    }
  });

  it("the parse server's preview carries the header fingerprint", async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const server = await startParseServer({ port: 0, host: '127.0.0.1', runner, startup: async () => ({ parse: { runner }, alert: null }) });
    try {
      const reply = await post(server.port, bankCsvTh);
      expect(reply).toMatchObject({
        kind: 'parsed',
        image: null,
        record: { preview: { status: 'ready', layout: 'generic', issues: [], image: null, header_fingerprint: headerFingerprint(THAI_HEADER) } },
      });
      const { candidates } = (reply as Extract<ParseServiceReply, { kind: 'parsed' }>).record;
      expect(candidates.map((candidate) => [candidate.source_row_id, candidate.wallet_label])).toEqual(BANK_ROWS.map((expected) => [expected.source_row_id, ACCOUNT]));
    } finally {
      await server.close();
      log.mockRestore();
    }
  });

  it('a preamble of long mask runs parses well inside the deadline', async () => {
    // Three preamble rows of 100 cells each: 10,000 `*`, 5,000 `x-` and 5,000 `x ` (the review's probe, 3 MB), then the account.
    const runs = ['*'.repeat(10_000), 'x-'.repeat(5_000), 'x '.repeat(5_000)].map((cell) => Array(100).fill(cell).join(','));
    const bytes = csv([...runs, 'บัญชีออมทรัพย์,xxx-x-x1234-x', THAI_HEADER.join(','), '24/10/69,10:05,POS PURCHASE,100.00,,"1,000.00",EDC,ร้านเครื่องเขียน']);
    const result = await parsed('csv', bytes);
    expect(result.rows).toEqual([
      row({ source_row_id: 'row:6', occurred_on: '2026-10-24', type: 'expense', amount_minor: '10000', wallet_label: ACCOUNT, category_label: 'POS PURCHASE', merchant: 'ร้านเครื่องเขียน' }),
    ]);
    // The CPU time the child measured itself, so a busy runner does not inflate it: a backtracking scan
    // runs these cells past the 30 s deadline (the outcome is then a timeout), one pass takes well under a second.
    expect(result.usage.cpu_ms).toBeLessThan(5_000);
  }, 60_000);
});

describe('the bank helpers', () => {
  const rows = (...lines: string[][]): SourceRow[] => lines.map((cells, index) => ({ n: index + 1, cells }));
  const preamble = (count: number) => Array.from({ length: count }, (_, index) => [`preamble ${index + 1}`]);

  it('looks for the header in the first 30 rows: a date with an amount, or with both money columns', () => {
    expect(HEADER_SEARCH_ROWS).toBe(30);
    expect(findHeaderRow(rows(...preamble(29), ['Date', 'Amount']))).toBe(29);
    expect(findHeaderRow(rows(...preamble(30), ['Date', 'Amount']))).toBe(0);
    // A date alone, an amount alone, both money columns without a date and one money column are not headers.
    expect(findHeaderRow(rows(['วันที่', '24/10/2569'], ['ยอดเงิน', '8,250.00'], ['ถอนเงิน', 'ฝากเงิน'], ['date', 'debit'], ['วันที่', 'ถอนเงิน', 'ฝากเงิน']))).toBe(4);
    expect(findHeaderRow(rows(['title'], ['nothing', 'here']))).toBe(0);
    expect(findHeaderRow([])).toBe(0);
  });

  it('reads the masked account from the first preamble cell holding one', () => {
    expect(preambleAccountLabel(rows(['ธนาคารสังเคราะห์'], ['บัญชีออมทรัพย์', 'xxx-x-x1234-x'], ['บัญชีอื่น', 'xxx-x-x9999-x']))).toBe('บัญชีออมทรัพย์ xxx-1234');
    expect(preambleAccountLabel(rows(['XXX-X-X5678-X', '', ' Savings ']))).toBe('Savings xxx-5678');
    expect(preambleAccountLabel(rows(['**** **** 1234 5678']))).toBe('xxx-5678');
    // One mask character, fewer than four digits, a word ending in x, or a mask right after a digit is no masked number.
    expect(preambleAccountLabel(rows(['x1234'], ['xx-123'], ['Fax 0212345678'], ['Taxx 1234'], ['1234xx5678']))).toBeNull();
    expect(preambleAccountLabel([])).toBeNull();
  });

  it('reads the masked account after long mask runs in one pass', () => {
    const hostile = ['*'.repeat(10_000), 'x-'.repeat(5_000), 'x '.repeat(5_000)].flatMap((cell) => Array<string>(20).fill(cell));
    const before = process.cpuUsage();
    expect(preambleAccountLabel(rows(hostile, ['บัญชีออมทรัพย์', 'xxx-x-x1234-x']))).toBe('บัญชีออมทรัพย์ xxx-1234');
    const used = process.cpuUsage(before);
    // CPU time, not wall time, so a busy runner does not inflate it: a backtracking scan spends seconds on these 60 cells, one pass a few milliseconds.
    expect((used.user + used.system) / 1_000).toBeLessThan(1_000);
  });

  it('a mask run without four digits does not hide a later masked number in the same cell', () => {
    expect(preambleAccountLabel(rows(['ref xx-12, account xxx-x-x4321-x']))).toBe('xxx-4321');
    expect(preambleAccountLabel(rows(['** ** 12 ** 5678']))).toBe('xxx-5678');
  });

  it('decides the era of two-digit years from the ten years ending today', () => {
    expect(twoDigitYearEra(['24/10/69'], TODAY)).toBe('be');
    expect(twoDigitYearEra(['24/10/26'], TODAY)).toBe('ce');
    expect(twoDigitYearEra(['24/10/69', '24/10/26'], TODAY)).toBeNull();
    // The window is today's year and the ten before it.
    expect(twoDigitYearEra(['01/01/16'], TODAY)).toBe('ce');
    expect(twoDigitYearEra(['01/01/15'], TODAY)).toBeNull();
    expect(twoDigitYearEra(['01/01/59'], TODAY)).toBe('be');
    expect(twoDigitYearEra(['01/01/58'], TODAY)).toBeNull();
    expect(twoDigitYearEra(['01/01/70'], TODAY)).toBeNull();
    // Month names count; four-digit years, other text and empty cells do not.
    expect(twoDigitYearEra(['24 ต.ค. 69', '2026-10-01', '24/10/2569', '', 'n/a'], TODAY)).toBe('be');
    expect(twoDigitYearEra(['Oct 24, 26'], TODAY)).toBe('ce');
    expect(twoDigitYearEra(['2026-10-01', '24/10/2569'], TODAY)).toBeNull();
  });

  it('reads a two-digit year only in a known era, in numeric and month-named dates', () => {
    const at = (raw: string, era: 'be' | 'ce' | null) => parseDateText(raw, { order: 'dmy', today: TODAY, era });
    expect(at('24/10/69', 'be')).toEqual({ ok: true, date: '2026-10-24' });
    expect(at('24/10/26', 'ce')).toEqual({ ok: true, date: '2026-10-24' });
    expect(at('24 ต.ค. 69', 'be')).toEqual({ ok: true, date: '2026-10-24' });
    expect(at('Oct 24, 26', 'ce')).toEqual({ ok: true, date: '2026-10-24' });
    expect(at('24/10/69', null)).toEqual({ ok: false, code: 'ambiguous_date' });
    expect(parseDateText('24/10/69', { order: 'dmy', today: TODAY })).toEqual({ ok: false, code: 'ambiguous_date' });
    // A four-digit year ignores the era.
    expect(at('24/10/2569', 'ce')).toEqual({ ok: true, date: '2026-10-24' });
  });

  it('fingerprints the normalized header cells joined by U+001F', () => {
    const expected = createHash('sha256').update('วันที่\u001fถอนเงิน\u001fdeposit', 'utf8').digest('hex');
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
    expect(headerFingerprint(['﻿ วันที่ ', 'ถอนเงิน', 'DEPOSIT'])).toBe(expected);
    expect(headerFingerprint(['วันที่', 'deposit', 'ถอนเงิน'])).not.toBe(expected);
  });
});
