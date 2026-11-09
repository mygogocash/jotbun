// XLSX reading for the parser child, with the project's own bounded ZIP
// reader and XML tokenizer (no workbook library runs on uploads). Values are
// read as stored text - a number cell's <v> is kept exactly as written, so no
// amount ever passes through floating point - and nothing is ever evaluated.
// Refused as a whole file:
//   - macros: a VBA project, a macro-enabled content type, Excel 4.0 macro or
//     dialog sheets;
//   - formulas: any <f> in any sheet (no cached formula result is trusted);
//   - external_references: external link parts, data connections or query
//     tables, an external relationship in any relationship part (the
//     workbook's, a worksheet's - where Excel writes hyperlinks - or any
//     other), or a defined name that refers to another workbook;
//   - embedded_objects: embedded OLE objects or packages, ActiveX controls;
//   - multiple_worksheets: more than one worksheet holding a value (none is
//     silently skipped); empty_file: none;
//   - too_many_columns / too_many_rows / cell_too_long: a value past column
//     100, more than 5,001 non-empty rows (a header plus 5,000), a string over
//     10,000 characters;
//   - workbook_malformed: missing or inconsistent parts, a DOCTYPE or unknown
//     entity, out-of-order rows or cells, more than 256 sheets, or a sheet
//     named twice (one relationship, or one part, for two sheets): each part
//     is inflated and read once at most.
// Date-formatted numbers become `YYYY-MM-DD` (exact serial arithmetic, 1900 or
// 1904 system); every other value stays the stored text.
import { excelSerialToIso } from './date.ts';
import { LIMITS, ParseRejection } from './protocol.ts';
import type { SourceRow, SourceTable } from './protocol.ts';
import { decodeXml, xmlEvents } from './xml.ts';
import { ZipArchive } from './zip.ts';

const malformed = () => new ParseRejection('workbook_malformed');
const MAX_SHEETS = 256;
const RELATIONSHIP_PART = /(?:^|\/)_rels\/[^/]*\.rels$/i;
const MAX_SHARED_STRINGS = (LIMITS.candidateRows + 1) * LIMITS.columns;
// Built-in number formats that display a date (Excel, including Thai/East Asian locales).
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58, 71, 72, 73, 74, 75, 76]);

function part(zip: ZipArchive, name: string): string | null {
  const bytes = zip.read(name);
  return bytes === null ? null : decodeXml(bytes);
}

function isDateFormat(code: string): boolean {
  const unquoted = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/[_*]./g, '');
  // A bracketed section ends at a "]", so only the text up to the last "]" can hold one.
  // Past it, the strip scanned from every "[" to the end and failed: quadratic in the
  // run's length (fix-parser-regex, R89).
  const end = unquoted.lastIndexOf(']') + 1;
  const visible = (unquoted.slice(0, end).replace(/\[[^\]]*\]/g, '') + unquoted.slice(end)).toLowerCase();
  return /[yd]|[วดป]/.test(visible);
}

function checkPackage(zip: ZipArchive): void {
  for (const name of zip.names()) {
    const lower = name.toLowerCase();
    if (lower.endsWith('vbaproject.bin') || lower.startsWith('xl/macrosheets/') || lower.startsWith('xl/dialogsheets/')) throw new ParseRejection('macros');
  }
  for (const name of zip.names()) {
    const lower = name.toLowerCase();
    if (lower.startsWith('xl/externallinks/') || lower === 'xl/connections.xml' || lower.startsWith('xl/querytables/')) throw new ParseRejection('external_references');
  }
  for (const name of zip.names()) {
    const lower = name.toLowerCase();
    if (lower.startsWith('xl/embeddings/') || lower.startsWith('xl/activex/')) throw new ParseRejection('embedded_objects');
  }
  const types = part(zip, '[Content_Types].xml');
  if (types === null) throw malformed();
  if (/macroenabled|vbaproject|macrosheet|dialogsheet/i.test(types)) throw new ParseRejection('macros');
  if (/oleobject|activex/i.test(types)) throw new ParseRejection('embedded_objects');
  for (const event of xmlEvents(types)) void event;
  // Every relationship part, not only the workbook's: nothing may point outside the package.
  for (const name of zip.names()) {
    if (!RELATIONSHIP_PART.test(name)) continue;
    const text = part(zip, name);
    if (text === null) throw malformed();
    for (const event of xmlEvents(text)) {
      if (event.kind !== 'open' || event.local !== 'Relationship') continue;
      const mode = event.attrs.TargetMode;
      if (mode !== undefined && mode !== 'Internal') throw new ParseRejection('external_references');
      if (/\/(externalLink|connections|queryTable|oleObject|package|control)$/i.test(event.attrs.Type ?? '')) {
        throw new ParseRejection(/\/(oleObject|package|control)$/i.test(event.attrs.Type ?? '') ? 'embedded_objects' : 'external_references');
      }
    }
  }
}

type Workbook = { date1904: boolean; sheets: { relId: string }[] };

function readWorkbook(zip: ZipArchive): Workbook {
  const text = part(zip, 'xl/workbook.xml');
  if (text === null) throw malformed();
  let date1904 = false;
  const sheets: { relId: string }[] = [];
  let inDefinedName = false;
  for (const event of xmlEvents(text)) {
    if (event.kind === 'open') {
      if (event.local === 'workbookPr') date1904 = event.attrs.date1904 === '1' || event.attrs.date1904 === 'true';
      if (event.local === 'externalReference' || event.local === 'externalReferences') throw new ParseRejection('external_references');
      if (event.local === 'sheet') {
        const relKey = Object.keys(event.attrs).find((key) => key.endsWith(':id'));
        if (!relKey) throw malformed();
        sheets.push({ relId: event.attrs[relKey] });
      }
      if (event.local === 'definedName') inDefinedName = !event.selfClosing;
    } else if (event.kind === 'close') {
      if (event.local === 'definedName') inDefinedName = false;
    } else if (inDefinedName && event.text.includes('[')) {
      // [1]Sheet1!A1: a reference into another workbook.
      throw new ParseRejection('external_references');
    }
  }
  return { date1904, sheets };
}

function readRelationships(zip: ZipArchive): Map<string, { type: string; target: string }> {
  const text = part(zip, 'xl/_rels/workbook.xml.rels');
  if (text === null) throw malformed();
  const rels = new Map<string, { type: string; target: string }>();
  for (const event of xmlEvents(text)) {
    if (event.kind !== 'open' || event.local !== 'Relationship') continue;
    const { Id: id, Type: type, Target: target, TargetMode: mode } = event.attrs;
    if (mode !== undefined && mode !== 'Internal') throw new ParseRejection('external_references');
    if (!id || !type || !target) throw malformed();
    if (/\/(externalLink|connections|queryTable)$/i.test(type)) throw new ParseRejection('external_references');
    rels.set(id, { type, target });
  }
  return rels;
}

function resolveTarget(target: string): string {
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  if (path.split('/').some((segment) => segment === '..' || segment === '.' || segment === '')) throw malformed();
  return path;
}

function readSharedStrings(zip: ZipArchive): string[] {
  const text = part(zip, 'xl/sharedStrings.xml');
  if (text === null) return [];
  const strings: string[] = [];
  let current: string | null = null;
  let phonetic = 0;
  let inText = false;
  for (const event of xmlEvents(text)) {
    if (event.kind === 'open') {
      if (event.local === 'si') {
        current = '';
      } else if (event.local === 'rPh') {
        if (!event.selfClosing) phonetic += 1;
      } else if (event.local === 't') {
        inText = !event.selfClosing;
      }
    } else if (event.kind === 'close') {
      if (event.local === 'si') {
        if (current === null) throw malformed();
        strings.push(current);
        if (strings.length > MAX_SHARED_STRINGS) throw new ParseRejection('too_many_rows');
        current = null;
      } else if (event.local === 'rPh') {
        phonetic -= 1;
      } else if (event.local === 't') {
        inText = false;
      }
    } else if (inText && phonetic === 0 && current !== null) {
      current += event.text;
      if (current.length > LIMITS.cellChars) throw new ParseRejection('cell_too_long');
    }
  }
  return strings;
}

function readDateStyles(zip: ZipArchive): boolean[] {
  const text = part(zip, 'xl/styles.xml');
  if (text === null) return [];
  // Each custom number format is judged once, when it is read; a cell style only looks
  // its verdict up. Judged again for every style that used it, one long format code and
  // many styles cost their product (fix-parser-regex, R89).
  const custom = new Map<number, boolean>();
  const styles: boolean[] = [];
  let inCellXfs = false;
  let depth = 0;
  for (const event of xmlEvents(text)) {
    if (event.kind === 'open') {
      if (event.local === 'numFmt') custom.set(Number(event.attrs.numFmtId), isDateFormat(event.attrs.formatCode ?? ''));
      if (event.local === 'cellXfs' && !event.selfClosing) {
        inCellXfs = true;
        depth = 0;
      } else if (inCellXfs) {
        if (depth === 0 && event.local === 'xf') {
          const id = Number(event.attrs.numFmtId ?? 0);
          styles.push(custom.get(id) ?? BUILTIN_DATE_FORMATS.has(id));
        }
        if (!event.selfClosing) depth += 1;
      }
    } else if (event.kind === 'close' && inCellXfs) {
      if (event.local === 'cellXfs' && depth === 0) inCellXfs = false;
      else depth -= 1;
    }
  }
  return styles;
}

function columnIndex(letters: string): number {
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index;
}

type Sheet = { rows: SourceRow[] };

function readSheet(text: string, strings: readonly string[], dateStyles: readonly boolean[], date1904: boolean): Sheet {
  const rows: SourceRow[] = [];
  let inSheetData = false;
  let rowNumber = 0;
  let cells: string[] | null = null;
  let column = 0;
  let cell: { type: string; style: number; value: string | null; inline: string | null } | null = null;
  let inValue = false;
  let inInline = 0;
  let inInlineText = false;
  let phonetic = 0;

  const finishCell = () => {
    if (!cell || !cells) return;
    let value: string | null;
    switch (cell.type) {
      case 's': {
        const index = cell.value === null ? NaN : Number(cell.value);
        if (!Number.isInteger(index) || index < 0 || index >= strings.length) throw malformed();
        value = strings[index];
        break;
      }
      case 'inlineStr':
        value = cell.inline;
        break;
      case 'b':
        value = cell.value === null ? null : cell.value.trim() === '1' ? 'TRUE' : 'FALSE';
        break;
      case 'n':
        value = cell.value === null ? null : dateStyles[cell.style] ? (excelSerialToIso(cell.value, date1904) ?? cell.value) : cell.value.trim();
        break;
      default:
        // str, e (error text), d (ISO date text)
        value = cell.value;
    }
    if (value !== null && value !== '') {
      if (value.length > LIMITS.cellChars) throw new ParseRejection('cell_too_long');
      if (column > LIMITS.columns) throw new ParseRejection('too_many_columns');
      while (cells.length < column - 1) cells.push('');
      cells[column - 1] = value;
    }
    cell = null;
  };

  for (const event of xmlEvents(text)) {
    if (event.kind === 'open') {
      if (event.local === 'f') throw new ParseRejection('formulas');
      if (event.local === 'sheetData') {
        inSheetData = !event.selfClosing;
        continue;
      }
      if (!inSheetData) continue;
      if (event.local === 'row') {
        const declared = event.attrs.r === undefined ? rowNumber + 1 : Number(event.attrs.r);
        if (!Number.isInteger(declared) || declared <= rowNumber || declared > 1_048_576) throw malformed();
        rowNumber = declared;
        cells = [];
        column = 0;
        if (event.selfClosing) cells = null;
      } else if (event.local === 'c') {
        if (!cells) throw malformed();
        const ref = event.attrs.r;
        let next = column + 1;
        if (ref !== undefined) {
          const match = /^([A-Z]{1,3})([0-9]{1,7})$/.exec(ref);
          if (!match || Number(match[2]) !== rowNumber) throw malformed();
          next = columnIndex(match[1]);
        }
        if (next <= column) throw malformed();
        column = next;
        cell = { type: event.attrs.t ?? 'n', style: Number(event.attrs.s ?? 0), value: null, inline: null };
        if (!['s', 'n', 'b', 'e', 'str', 'inlineStr', 'd'].includes(cell.type) || !Number.isInteger(cell.style) || cell.style < 0) throw malformed();
        if (event.selfClosing) finishCell();
      } else if (cell && event.local === 'v') {
        inValue = !event.selfClosing;
        if (!inValue && cell.value === null) cell.value = '';
      } else if (cell && event.local === 'is') {
        if (!event.selfClosing) inInline += 1;
        cell.inline = cell.inline ?? '';
      } else if (cell && inInline > 0 && event.local === 'rPh') {
        if (!event.selfClosing) phonetic += 1;
      } else if (cell && inInline > 0 && event.local === 't') {
        inInlineText = !event.selfClosing;
      }
    } else if (event.kind === 'close') {
      if (event.local === 'sheetData') {
        inSheetData = false;
      } else if (!inSheetData) {
        continue;
      } else if (event.local === 'row') {
        if (cells && cells.some((value) => value !== '')) {
          if (rows.length >= LIMITS.candidateRows + 1) throw new ParseRejection('too_many_rows');
          rows.push({ n: rowNumber, cells });
        }
        cells = null;
      } else if (event.local === 'c') {
        finishCell();
      } else if (event.local === 'v') {
        inValue = false;
      } else if (event.local === 'is') {
        inInline -= 1;
      } else if (event.local === 'rPh') {
        phonetic -= 1;
      } else if (event.local === 't') {
        inInlineText = false;
      }
    } else if (cell) {
      if (inValue) {
        cell.value = (cell.value ?? '') + event.text;
        if (cell.value.length > LIMITS.cellChars) throw new ParseRejection('cell_too_long');
      } else if (inInlineText && phonetic === 0) {
        cell.inline = (cell.inline ?? '') + event.text;
        if (cell.inline.length > LIMITS.cellChars) throw new ParseRejection('cell_too_long');
      }
    }
  }
  return { rows };
}

export function readXlsx(bytes: Uint8Array): SourceTable {
  const zip = new ZipArchive(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  checkPackage(zip);
  const workbook = readWorkbook(zip);
  const rels = readRelationships(zip);
  const strings = readSharedStrings(zip);
  const dateStyles = readDateStyles(zip);
  // Each sheet names its own relationship and part, so no part is read twice.
  if (workbook.sheets.length > MAX_SHEETS) throw malformed();
  const relIds = new Set<string>();
  const targets = new Set<string>();
  for (const sheet of workbook.sheets) {
    const rel = rels.get(sheet.relId);
    if (!rel || relIds.has(sheet.relId)) throw malformed();
    const target = resolveTarget(rel.target);
    if (targets.has(target)) throw malformed();
    relIds.add(sheet.relId);
    targets.add(target);
  }
  const filled: Sheet[] = [];
  for (const sheet of workbook.sheets) {
    const rel = rels.get(sheet.relId);
    if (!rel) throw malformed();
    if (/\/(xlMacrosheet|xlIntlMacrosheet|dialogsheet)$/i.test(rel.type)) throw new ParseRejection('macros');
    if (/\/chartsheet$/i.test(rel.type)) continue;
    if (!/\/worksheet$/i.test(rel.type)) throw new ParseRejection('unsupported_sheet');
    const text = part(zip, resolveTarget(rel.target));
    if (text === null) throw malformed();
    const read = readSheet(text, strings, dateStyles, workbook.date1904);
    if (read.rows.length > 0) filled.push(read);
  }
  if (filled.length > 1) throw new ParseRejection('multiple_worksheets');
  if (filled.length === 0) throw new ParseRejection('empty_file');
  return { rows: filled[0].rows, encoding: null };
}
