import { EXPORT_CSV_BOM, EXPORT_CSV_COLUMNS } from '@gogospend/contracts';

import type { LeasedExportRow } from '../database/leased-account-read';
import { CsvTooLarge, CsvWriter, csvLiteral, csvNumber, csvText, minorToDecimal, neutralizeFormula, quoteCsvField } from './csv-writer';
import { exportRowCells } from './export-handler';

/** A strict RFC 4180 reader for the assertions below (CRLF records, "" escapes). */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += 1;
    } else {
      field += char;
    }
  }
  if (field !== '' || record.length > 0) throw new Error('the CSV does not end with CRLF');
  return records;
}

const unquote = (cell: string) => parseCsv(`${cell}\r\n`)[0][0];

describe('formula neutralization', () => {
  it('untrusted_csv_text_cannot_start_formula', () => {
    const escapedCell = csvText('=SUM(A1:A2)');
    expect(escapedCell).toBe("'=SUM(A1:A2)");
  });

  it.each([
    ['=1+1'],
    ['+1'],
    ['-1+2'],
    ['@SUM(A1)'],
    ['＝1+1'],
    ['＋1'],
    ['－1'],
    ['＠1'],
    ['\t=1+1'],
    ['\r=1+1'],
    ['\n=1+1'],
    [' =1+1'],
    ['   @cmd'],
    [' =1'],
    ['　+1'],
    ['​=1'],
    ['﻿=1'],
    ['\t'],
    ['\r\n-2'],
  ])('neutralizes %j, keeping the text after the prefix', (text) => {
    const cell = unquote(csvText(text));
    expect(cell).toBe(`'${text}`);
    expect(neutralizeFormula(text)).toBe(`'${text}`);
  });

  it('leaves ordinary text alone', () => {
    for (const text of ['coffee', 'a=b', 'x-1', 'ข้าวมันไก่', "'quoted", '100 baht', '(1)']) expect(csvText(text)).toBe(text);
    expect(csvText(null)).toBe('');
    expect(csvText('')).toBe('');
  });
});

describe('quoting', () => {
  it('quotes commas, quotes and line breaks so each value is one field', () => {
    expect(quoteCsvField('a,b')).toBe('"a,b"');
    expect(quoteCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(quoteCsvField('line 1\nline 2')).toBe('"line 1\nline 2"');
    expect(quoteCsvField('line 1\r\nline 2')).toBe('"line 1\r\nline 2"');
    expect(quoteCsvField('plain')).toBe('plain');
  });

  it('neutralizes first and then quotes, so the round trip keeps every character', () => {
    const values = ['=1,2', 'a "b", c', 'two\nlines', '-"x"', 'ok'];
    const row = values.map(csvText).join(',');
    expect(parseCsv(`${row}\r\n`)).toEqual([["'=1,2", 'a "b", c', 'two\nlines', `'-"x"`, 'ok']]);
  });
});

describe('numeric and literal columns', () => {
  it('keeps exact minor units and baht amounts unquoted and unprefixed', () => {
    expect(csvNumber('99999999999')).toBe('99999999999');
    expect(csvNumber('6500')).toBe('6500');
    expect(csvNumber('-168200')).toBe('-168200');
    expect(csvNumber('999999999.99')).toBe('999999999.99');
    expect(minorToDecimal('6500')).toBe('65.00');
    expect(minorToDecimal('5')).toBe('0.05');
    expect(minorToDecimal('0')).toBe('0.00');
    expect(minorToDecimal('100')).toBe('1.00');
    expect(minorToDecimal('99999999999')).toBe('999999999.99');
    expect(minorToDecimal('-168200')).toBe('-1682.00');
  });

  it('refuses anything that is not a canonical number', () => {
    for (const value of ['=1', '1e3', '0x10', ' 1', '01', '1.', '+1', '', 'NaN']) expect(() => csvNumber(value)).toThrow();
    for (const value of ['01', '1.5', '', 'abc']) expect(() => minorToDecimal(value)).toThrow();
  });

  it('writes only safe literals (ids, dates, enums) raw', () => {
    expect(csvLiteral('0b8a4d1e-6f0a-4c51-9a8e-2f5f6d1f9c11')).toBe('0b8a4d1e-6f0a-4c51-9a8e-2f5f6d1f9c11');
    expect(csvLiteral('2026-03-01')).toBe('2026-03-01');
    expect(csvLiteral('side_job')).toBe('side_job');
    expect(csvLiteral(null)).toBe('');
    for (const value of ['=x', '-x', 'a b', 'a,b', '@x', '"x"']) expect(() => csvLiteral(value)).toThrow();
  });
});

describe('CsvWriter', () => {
  it('starts with a byte order mark and the header, and ends every record with CRLF', () => {
    const writer = new CsvWriter(['a', 'b']);
    writer.row(['1', csvText('x,y')]);
    writer.row(['2', csvText('=z')]);
    const body = writer.finish();
    const text = Buffer.concat(body.parts).toString('utf8');
    expect(text.startsWith(`${EXPORT_CSV_BOM}a,b\r\n`)).toBe(true);
    expect(parseCsv(text.slice(1))).toEqual([['a', 'b'], ['1', 'x,y'], ['2', "'=z"]]);
    expect(body.rows).toBe(2);
    expect(body.bytes).toBe(Buffer.byteLength(text));
  });

  it('refuses a row of the wrong width', () => {
    const writer = new CsvWriter(['a', 'b']);
    expect(() => writer.row(['only one'])).toThrow();
  });

  it('is bounded: it stops at its byte limit and keeps output in bounded blocks', () => {
    const writer = new CsvWriter(['note'], { maxBytes: 4096, blockBytes: 1024 });
    expect(() => {
      for (let i = 0; i < 1000; i += 1) writer.row([csvText(`note ${i} ${'x'.repeat(40)}`)]);
    }).toThrow(CsvTooLarge);
    const small = new CsvWriter(['note'], { maxBytes: 1 << 20, blockBytes: 1024 });
    for (let i = 0; i < 200; i += 1) small.row([csvText(`entry ${i} ${'y'.repeat(30)}`)]);
    const body = small.finish();
    expect(body.parts.length).toBeGreaterThan(1);
    expect(body.parts.every((part) => part.byteLength <= 1024 + 200)).toBe(true);
    expect(body.bytes).toBe(body.parts.reduce((sum, part) => sum + part.byteLength, 0));
  });
});

describe('export rows', () => {
  const WALLET = '0b8a4d1e-6f0a-4c51-9a8e-2f5f6d1f9c11';
  const OTHER = '1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a';
  const CATEGORY = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
  const base: LeasedExportRow = {
    id: '5f2c9d64-3b1e-4f7a-8c2d-9e0a1b2c3d4e',
    type: 'expense',
    occurredOn: '2026-03-01',
    amountMinor: '6500',
    walletId: WALLET,
    walletName: 'Cash',
    categoryId: CATEGORY,
    categoryBuiltinKey: 'food',
    categoryLabel: null,
    sourceWalletId: null,
    sourceWalletName: null,
    destinationWalletId: null,
    destinationWalletName: null,
    merchant: 'Cafe, "Amazon"',
    note: '=HYPERLINK("http://evil")\nline 2',
    version: 3,
  };
  const asRecord = (cells: string[]) => Object.fromEntries(parseCsv(`${cells.join(',')}\r\n`)[0].map((value, i) => [EXPORT_CSV_COLUMNS[i], value]));

  it('maps every entry field in header order, neutralizing untrusted text', () => {
    const cells = exportRowCells(base);
    expect(cells).toHaveLength(EXPORT_CSV_COLUMNS.length);
    expect(asRecord(cells)).toEqual({
      record_id: base.id,
      date: '2026-03-01',
      type: 'expense',
      amount: '65.00',
      amount_minor: '6500',
      currency: 'THB',
      wallet_id: WALLET,
      wallet_name: 'Cash',
      category_id: CATEGORY,
      category_name: 'food',
      category_builtin_key: 'food',
      source_wallet_id: '',
      source_wallet_name: '',
      destination_wallet_id: '',
      destination_wallet_name: '',
      merchant: 'Cafe, "Amazon"',
      note: `'=HYPERLINK("http://evil")\nline 2`,
      version: '3',
    });
  });

  it('maps a transfer to its source and destination wallets, with no category', () => {
    const transfer: LeasedExportRow = { ...base, type: 'transfer', walletId: null, walletName: null, categoryId: null, categoryBuiltinKey: null, sourceWalletId: WALLET, sourceWalletName: '+Savings', destinationWalletId: OTHER, destinationWalletName: 'Daily', merchant: null, note: null, amountMinor: '99999999999' };
    const record = asRecord(exportRowCells(transfer));
    expect(record).toMatchObject({ type: 'transfer', amount: '999999999.99', amount_minor: '99999999999', wallet_id: '', category_id: '', category_name: '', source_wallet_id: WALLET, source_wallet_name: "'+Savings", destination_wallet_id: OTHER, destination_wallet_name: 'Daily', merchant: '', note: '' });
  });

  it('names a custom or relabelled category by its label', () => {
    expect(asRecord(exportRowCells({ ...base, categoryLabel: '@Lunch' })).category_name).toBe("'@Lunch");
    expect(asRecord(exportRowCells({ ...base, categoryLabel: 'Lunch', categoryBuiltinKey: null })).category_builtin_key).toBe('');
  });
});

describe('P4 review fixes', () => {
  it('neutralizes formula look-alikes and invisible prefixes', () => {
    for (const text of ['﹦1+1', '﹢cmd', '﹣1', '﹫SUM(A1)', '­=1+1', '͏=1', '᠎=1', 'ㅤ=1', '​­=1']) {
      expect([text, neutralizeFormula(text)]).toEqual([text, `'${text}`]);
    }
    expect(neutralizeFormula('\rtext')).toBe("'\rtext");
    expect(neutralizeFormula('ข้าวมันไก่')).toBe('ข้าวมันไก่');
  });

  it('quotes a lone carriage return', () => {
    expect(quoteCsvField('a\rb')).toBe('"a\rb"');
  });
});
