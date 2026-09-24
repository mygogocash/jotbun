import { readFileSync } from 'node:fs';
import path from 'node:path';

import { SPEND_MAX_UPLOAD_BYTES } from '@gogocash/contracts';

import ExcelJS from 'exceljs';

import { parseEmvQr } from './parse-emv-qr';
import {
  parseSpendFile,
  parseSpendUpload,
  prepareSlipForOcr,
} from './parse-spend-file';

const FIXTURES = path.resolve(__dirname, '../fixtures');

describe('parseSpendFile', () => {
  it('maps the official MeowJot sample (Buddhist dates, signed baht)', () => {
    const buf = readFileSync(path.join(FIXTURES, 'meowjot-export-sample.csv'));
    const result = parseSpendFile(buf, 'Export_sample.csv');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapper).toBe('meowjot');
    expect(result.rows[0]).toMatchObject({
      occurred_on: '2025-12-01',
      type: 'expense',
      amount_minor: 29000,
      category: 'อาหาร',
      merchant: 'บริษัท สบาย สบาย จำกัด',
    });
    expect(result.rows.find((row) => row.type === 'income')?.amount_minor).toBe(
      200000,
    );
    const expensePlusIncome = 29000 + 23000 + 2000 + 100000 + 200000 + 35000;
    expect(result.file_sum_minor).toBe(expensePlusIncome);
    expect(result.parsed_sum_minor).toBe(expensePlusIncome);
  });

  it('maps a Spendee CSV and excludes transfers from the pie sum', () => {
    const buf = readFileSync(path.join(FIXTURES, 'spendee-th-sample.csv'));
    const result = parseSpendFile(buf, 'spendee.csv');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapper).toBe('spendee');
    expect(result.rows).toHaveLength(3);
    expect(result.rows[2].type).toBe('transfer');
    expect(result.file_sum_minor).toBe(12050 + 100000);
    expect(result.parsed_sum_minor).toBe(12050 + 100000);
  });

  it('rejects an unknown header set', () => {
    const buf = Buffer.from('foo,bar\n1,2\n', 'utf8');
    expect(parseSpendFile(buf)).toEqual({
      ok: false,
      error_code: 'UNKNOWN_MAPPER',
    });
  });

  it('rejects a file larger than the Mongo job payload cap', () => {
    const buf = Buffer.alloc(SPEND_MAX_UPLOAD_BYTES + 1, 97);
    expect(parseSpendFile(buf)).toEqual({
      ok: false,
      error_code: 'TOO_LARGE',
    });
  });

  /*
   * A multi-year export is the whole point of migrate-in. One unreadable row
   * in the middle of it must cost the member that row, not the file.
   */
  it('skips an unreadable row and keeps the rest of the file', () => {
    const csv =
      'วันที่,ประเภท,หมวดหมู่,จำนวน\n' +
      '1/12/2568,รายจ่าย,อาหาร,-290\n' +
      '32/13/2568,รายจ่าย,อาหาร,-10\n' +
      '2/12/2568,รายจ่าย,กาแฟ,-60\n';
    const result = parseSpendFile(Buffer.from(csv, 'utf8'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.row_reject).toBe(1);
    expect(result.rows.map((row) => row.amount_minor)).toEqual([29000, 6000]);
  });

  it('skips a row whose amount cannot be read', () => {
    const csv =
      'วันที่,ประเภท,หมวดหมู่,จำนวน\n' +
      '1/12/2568,รายจ่าย,อาหาร,-290\n' +
      '2/12/2568,รายจ่าย,อาหาร,ไม่ทราบ\n';
    const result = parseSpendFile(Buffer.from(csv, 'utf8'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.row_reject).toBe(1);
  });

  it('reports sums that count only the rows it actually imported', () => {
    const csv =
      'วันที่,ประเภท,หมวดหมู่,จำนวน\n' +
      '1/12/2568,รายจ่าย,อาหาร,-290\n' +
      '32/13/2568,รายจ่าย,อาหาร,-10\n';
    const result = parseSpendFile(Buffer.from(csv, 'utf8'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parsed_sum_minor).toBe(29000);
    expect(result.file_sum_minor).toBe(29000);
  });

  it('rejects a Buddhist date that cannot be calendared', () => {
    const csv = 'วันที่,ประเภท,หมวดหมู่,จำนวน\n32/13/2568,รายจ่าย,อาหาร,-10\n';
    expect(parseSpendFile(Buffer.from(csv, 'utf8'))).toEqual({
      ok: false,
      error_code: 'BAD_DATE',
    });
  });

  /*
   * A Thai export can write its Buddhist year in ISO order as well as d/m/y.
   * 2568-12-01 is 2025-12-01, not a row dated 543 years from now.
   */
  it('converts a Buddhist year written in ISO order', () => {
    const csv = 'วันที่,ประเภท,หมวดหมู่,จำนวน\n2568-12-01,รายจ่าย,อาหาร,-290\n';
    const result = parseSpendFile(Buffer.from(csv, 'utf8'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0].occurred_on).toBe('2025-12-01');
  });

  it('maps a Money Lover CSV, skips Exclude Report, and tags travel for Compare', () => {
    const buf = readFileSync(path.join(FIXTURES, 'moneylover-sample.csv'));
    const result = parseSpendFile(buf, 'moneylover.csv');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapper).toBe('moneylover');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      occurred_on: '2026-08-15',
      type: 'expense',
      amount_minor: 12000,
      category: 'Food & Beverage',
      merchant: 'Pad Thai',
    });
    expect(result.rows[1].type).toBe('income');
    expect(result.file_sum_minor).toBe(12000 + 200000);
    const travel = parseSpendFile(
      Buffer.from(
        'Display Name,Category,Amount,Currency,Account,Note,Date,Exclude Report,Id\nAgoda hotel,Travel,-3500,THB,Cash,Bangkok,01/08/2026,False,ml-h\n',
        'utf8',
      ),
    );
    expect(travel.ok).toBe(true);
    if (!travel.ok) return;
    expect(travel.rows[0].tags).toContain('compare');
  });

  it('parses an XLSX Spendee sheet through parseSpendUpload', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Export');
    sheet.addRow(['Date', 'Wallet', 'Type', 'Category', 'Amount', 'Note']);
    sheet.addRow(['2025-01-15', 'Cash', 'expense', 'อาหาร', 120.5, 'Lunch']);
    sheet.addRow([
      '2025-01-16',
      'Cash',
      'income',
      'เงินเดือน',
      1000,
      'January',
    ]);
    const buf = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await parseSpendUpload(buf, 'spendee.xlsx');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapper).toBe('spendee');
    expect(result.rows).toHaveLength(2);
    expect(result.file_sum_minor).toBe(12050 + 100000);
  });

  it('rejects a legacy .xls without pretending to parse it', async () => {
    const buf = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(parseSpendUpload(buf, 'spendee.xls')).resolves.toEqual({
      ok: false,
      error_code: 'XLS_UNREADABLE',
    });
  });

  it('reads amount and merchant from a PromptPay EMV payload', () => {
    expect(parseEmvQr('0002015406120.505908CoffeeCo')).toEqual({
      amount_minor: 12050,
      merchant: 'CoffeeCo',
    });
  });

  it('fails closed when a slip photo has no QR', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    await expect(parseSpendUpload(png, 'slip.png')).resolves.toEqual({
      ok: false,
      error_code: 'SLIP_NO_QR',
    });
  });

  it('prepares a grayscale PNG for Tesseract without throwing', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const prepared = await prepareSlipForOcr(png);
    expect(prepared[0]).toBe(0x89);
    expect(prepared[1]).toBe(0x50);
    expect(prepared[2]).toBe(0x4e);
    expect(prepared[3]).toBe(0x47);
  });
});
