// CSV reading for the parser child: RFC 4180 records, comma-separated,
// bounded as it reads. A cell over 10,000 characters, a record with more
// than 100 cells holding a value, or more than 5,001 non-blank records (a
// header plus 5,000 rows) stops the read at once with a whole-file refusal, so
// memory never grows past those bounds. Unbalanced quotes are malformed_csv.
// Text is UTF-8 (a byte-order mark is dropped); bytes that are not UTF-8 are
// read as Windows-874 (Thai), the legacy importers' fallback, and reported.
import { LIMITS, ParseRejection } from './protocol.ts';
import type { SourceRow, SourceTable } from './protocol.ts';

export function decodeCsv(bytes: Uint8Array): { text: string; encoding: 'utf-8' | 'windows-874' } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes), encoding: 'utf-8' };
  } catch {
    // Not UTF-8: Thai single-byte text (TIS-620 / Windows-874).
  }
  try {
    return { text: new TextDecoder('windows-874', { fatal: true }).decode(bytes), encoding: 'windows-874' };
  } catch {
    throw new ParseRejection('unsupported_encoding');
  }
}

export function readCsv(bytes: Uint8Array): SourceTable {
  const { text, encoding } = decodeCsv(bytes);
  const rows: SourceRow[] = [];
  const maxRecords = LIMITS.candidateRows + 1;
  const length = text.length;
  let record = 1;
  let cells: string[] = [];
  let filled = 0;
  let at = 0;

  const pushCell = (cell: string) => {
    if (cell.length > 0) filled += 1;
    // Values in at most 100 columns; empty cells are bounded too (a line of commas).
    if (filled > LIMITS.columns || cells.length >= 10 * LIMITS.columns) throw new ParseRejection('too_many_columns');
    cells.push(cell);
  };
  const endRecord = () => {
    if (cells.some((value) => value.trim().length > 0)) {
      if (rows.length >= maxRecords) throw new ParseRejection('too_many_rows');
      rows.push({ n: record, cells });
    }
    record += 1;
    cells = [];
    filled = 0;
  };

  while (at < length) {
    // One cell, sliced from the text (never built a character at a time).
    if (text.charCodeAt(at) === 0x22) {
      let cell = '';
      let from = at + 1;
      for (;;) {
        const quote = text.indexOf('"', from);
        if (quote === -1) throw new ParseRejection('malformed_csv');
        if (cell.length + (quote - from) > LIMITS.cellChars) throw new ParseRejection('cell_too_long');
        cell += text.slice(from, quote);
        if (text.charCodeAt(quote + 1) === 0x22) {
          if (cell.length + 1 > LIMITS.cellChars) throw new ParseRejection('cell_too_long');
          cell += '"';
          from = quote + 2;
        } else {
          at = quote + 1;
          break;
        }
      }
      pushCell(cell);
    } else {
      let end = at;
      while (end < length) {
        const code = text.charCodeAt(end);
        if (code === 0x2c || code === 0x0a || code === 0x0d) break;
        // A quote may only open a cell.
        if (code === 0x22) throw new ParseRejection('malformed_csv');
        end += 1;
        if (end - at > LIMITS.cellChars) throw new ParseRejection('cell_too_long');
      }
      pushCell(text.slice(at, end));
      at = end;
    }
    // After a cell: a comma (another cell follows), a line break or the end.
    const next = text.charCodeAt(at);
    if (at >= length) {
      endRecord();
    } else if (next === 0x2c) {
      at += 1;
      if (at >= length) {
        pushCell('');
        endRecord();
      }
    } else if (next === 0x0a || next === 0x0d) {
      at += next === 0x0d && text.charCodeAt(at + 1) === 0x0a ? 2 : 1;
      endRecord();
    } else {
      // Only a delimiter or a line break may follow a closing quote.
      throw new ParseRejection('malformed_csv');
    }
  }
  return { rows, encoding };
}
