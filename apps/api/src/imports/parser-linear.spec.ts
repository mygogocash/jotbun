import { parsingRunner } from './fixtures/parsing-runner';
import { buildXlsx, csv } from './fixtures/synthetic-parse';
import { detectAmountConvention, parseAmountText } from './parsers/amount';
import type { ParseFormat, ParseSuccess, SourceTable } from './parsers/protocol';
import { buildRows } from './parsers/table';
import { readXlsx } from './parsers/xlsx';

// The parser's text matching stays linear in its input (fix-parser-regex,
// ruling R89). Three regexes took time quadratic in a run's length:
//   - amount.ts's THB suffix, on a long run of spaces inside an amount;
//   - table.ts's explicit-plus check, on "(" and a long run of spaces;
//   - xlsx.ts's bracketed-section strip, on a number format of "[" with no "]".
// And xlsx.ts judged a custom number format again for every cell style using
// it, so one long format code and many styles cost their product.
// A few megabytes of CSV, or a workbook of a few kilobytes, held the shared parser child
// until its 30 s deadline. Each bound is CPU time, not wall time, so a busy
// runner does not inflate it. The rewritten matching must read every value
// exactly as before (the second block).

const TODAY = '2026-10-25';
const runner = parsingRunner();
// Before the fix, the child cases ran to the 30 s deadline.
jest.setTimeout(60_000);

async function parsed(format: ParseFormat, bytes: Uint8Array): Promise<ParseSuccess> {
  const outcome = await runner.run({ format, bytes, today: TODAY });
  expect(outcome).toMatchObject({ kind: 'result', result: { ok: true } });
  if (outcome.kind !== 'result' || !outcome.result.ok) throw new Error('unreachable: the assertion above failed');
  return outcome.result;
}

/** CPU milliseconds `run` takes in this process. */
function cpuMs(run: () => void): number {
  const before = process.cpuUsage();
  run();
  const used = process.cpuUsage(before);
  return (used.user + used.system) / 1_000;
}

/** "(", 9,980 spaces, "5": not an amount (invalid_amount); the THB suffix reads the whole run. */
const SPACED_AMOUNT = `(${' '.repeat(9_980)}5`;
/** "(", 9,980 spaces, "1.00)": the amount 1.00, negative; the explicit-plus check reads the whole run. */
const SPACED_PARENTHESIZED = `(${' '.repeat(9_980)}1.00)`;

const table = (lines: string[][]): SourceTable => ({ rows: lines.map((cells, index) => ({ n: index + 1, cells })), encoding: 'utf-8' });

/** A workbook whose date-styled cell (the serial of 2025-01-01) uses the custom number format `code`, as do `styles` cell styles. */
function workbookWithFormat(code: string, styles = 1): Buffer {
  const attribute = code.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return buildXlsx({
    sheets: [{ rows: [['date', 'amount'], [{ date: '45658' }, 5]] }],
    stylesXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="${attribute}"/></numFmts><cellXfs count="${styles + 1}"><xf numFmtId="0"/>${'<xf numFmtId="164" applyNumberFormat="1"/>'.repeat(styles)}</cellXfs></styleSheet>`,
  });
}

describe('the parser reads long runs in linear time', () => {
  it('an amount with a long run of spaces inside', () => {
    const cells = Array<string>(40).fill(SPACED_AMOUNT);
    let codes: string[] = [];
    let convention: string | null = 'unset';
    const used = cpuMs(() => {
      codes = cells.map((cell) => {
        const parsedAmount = parseAmountText(cell);
        return parsedAmount.ok ? 'ok' : parsedAmount.code;
      });
      convention = detectAmountConvention(cells);
    });
    expect(new Set(codes)).toEqual(new Set(['invalid_amount']));
    expect(convention).toBeNull();
    // 80 reads of 10,000 characters: the backtracking suffix took seconds, one pass takes milliseconds.
    expect(used).toBeLessThan(1_000);
  });

  it('a parenthesized amount with a long run of spaces, checked for an explicit plus', () => {
    const rows = Array.from({ length: 100 }, () => ['24/10/2026', SPACED_PARENTHESIZED, 'expense']);
    let body: ReturnType<typeof buildRows> | null = null;
    const used = cpuMs(() => {
      body = buildRows(table([['Date', 'Amount', 'Type'], ...rows]), TODAY);
    });
    expect(body!.rows).toHaveLength(100);
    expect(body!.rows[0]).toMatchObject({ type: 'expense', amount_minor: '100' });
    expect(used).toBeLessThan(1_000);
  });

  it('a custom number format of a long run of "["', () => {
    const workbook = workbookWithFormat('['.repeat(150_000));
    let first: string[] = [];
    const used = cpuMs(() => {
      first = readXlsx(workbook).rows[1].cells;
    });
    // No y or d shows, so the cell is no date: its serial stays as written.
    expect(first[0]).toBe('45658');
    expect(used).toBeLessThan(1_000);
  });

  it('a long number format shared by many cell styles is judged once', () => {
    const workbook = workbookWithFormat('a'.repeat(1_000_000), 3_500);
    let first: string[] = [];
    const used = cpuMs(() => {
      first = readXlsx(workbook).rows[1].cells;
    });
    expect(first[0]).toBe('45658');
    // Judged again for each of 3,500 styles, the 1,000,000-character code took seconds.
    expect(used).toBeLessThan(1_000);
  });

  it('a CSV of such amounts parses in the child well inside the deadline', async () => {
    const lines = ['Date,Amount,Type'];
    for (let index = 0; index < 300; index += 1) lines.push(`24/10/2026,${SPACED_AMOUNT},expense`, `24/10/2026,${SPACED_PARENTHESIZED},expense`);
    const result = await parsed('csv', csv(lines));
    expect(result.rows).toHaveLength(600);
    expect(result.rows[0].issues).toContainEqual({ field: 'amount_minor', code: 'invalid_amount' });
    expect(result.rows[1]).toMatchObject({ type: 'expense', amount_minor: '100' });
    // The CPU time the child measured itself: the backtracking regexes ran this 6 MB file past the deadline.
    expect(result.usage.cpu_ms).toBeLessThan(5_000);
  });

  it('a workbook with such a number format parses in the child well inside the deadline', async () => {
    const result = await parsed('xlsx', workbookWithFormat('['.repeat(400_000)));
    expect(result.rows).toEqual([expect.objectContaining({ source_row_id: 'row:2', amount_minor: '500' })]);
    expect(result.rows[0].issues).toContainEqual({ field: 'occurred_on', code: 'invalid_date' });
    // A workbook under 3 KB: the backtracking strip ran it past the deadline.
    expect(result.usage.cpu_ms).toBeLessThan(5_000);
  });

  it('a workbook whose cell styles share one long number format parses in the child well inside the deadline', async () => {
    const result = await parsed('xlsx', workbookWithFormat('a'.repeat(1_000_000), 25_000));
    expect(result.rows).toEqual([expect.objectContaining({ source_row_id: 'row:2', amount_minor: '500' })]);
    // A workbook under 7 KB: judging the code once per style ran it past the deadline.
    expect(result.usage.cpu_ms).toBeLessThan(5_000);
  });
});

describe('the rewritten matching reads exactly as before', () => {
  it('a currency marker after the number, and only at the end', () => {
    const read = (text: string) => {
      const result = parseAmountText(text);
      return result.ok ? `${result.negative ? '-' : ''}${result.minor}` : result.code;
    };
    expect(read('120 thb')).toBe('12000');
    expect(read('120THB')).toBe('12000');
    expect(read('1000 บาท')).toBe('100000');
    expect(read('1000 \tบาท')).toBe('100000');
    expect(read('(5 ฿)')).toBe('-500');
    expect(read('-120 บาท')).toBe('-12000');
    expect(read('฿ 12 ฿')).toBe('1200');
    // A marker inside the number is no marker.
    expect(read('1 thb 2')).toBe('invalid_amount');
    expect(read('12บาท3')).toBe('invalid_amount');
    expect(read('thb')).toBe('invalid_amount');
  });

  it('an explicit plus, with or without a currency marker before it, contradicts an expense', () => {
    const body = buildRows(
      table([['date', 'type', 'amount'], ['2026-10-24', 'expense', '+5'], ['2026-10-24', 'expense', 'thb +5'], ['2026-10-24', 'expense', '฿ + 5'], ['2026-10-24', 'expense', '5 +'], ['2026-10-24', 'expense', '5'], ['2026-10-24', 'expense', '(5)']]),
      TODAY,
    );
    // (No wallet column, so every row also has missing_wallet.)
    expect(body.rows.map((row) => [row.type, row.amount_minor, row.issues.map((issue) => issue.code).join(',')])).toEqual([
      [null, '500', 'type_conflict,missing_wallet'],
      [null, '500', 'type_conflict,missing_wallet'],
      [null, '500', 'type_conflict,missing_wallet'],
      ['expense', null, 'invalid_amount,missing_wallet'],
      ['expense', '500', 'missing_wallet'],
      ['expense', '500', 'missing_wallet'],
    ]);
  });

  it('a custom number format is a date only when y or d shows outside quotes and brackets', () => {
    const cell = (code: string) => readXlsx(workbookWithFormat(code)).rows[1].cells[0];
    // Dates: the serial reads as 2025-01-01.
    expect(cell('d/m/yyyy')).toBe('2025-01-01');
    expect(cell('[$-th-TH]d mmm yyyy')).toBe('2025-01-01');
    expect(cell('[Red]0;[Blue]dd')).toBe('2025-01-01');
    // An unclosed "[" hides nothing after it.
    expect(cell('[d')).toBe('2025-01-01');
    expect(cell('[h]:mm[d')).toBe('2025-01-01');
    // Not dates: the serial stays as written.
    expect(cell('[Red]#,##0.00')).toBe('45658');
    expect(cell('[Red][Blue]0.00')).toBe('45658');
    expect(cell('"day "0')).toBe('45658');
    expect(cell('[[d]0')).toBe('45658');
    expect(cell('0.00')).toBe('45658');
  });
});
