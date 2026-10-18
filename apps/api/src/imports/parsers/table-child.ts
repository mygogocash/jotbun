// Parser child for CSV and XLSX files. Started by parser-runner with
// `--permission` and no addon, network, child-process, worker or file-write
// permission; it can read only this directory.
import { runChild } from './child-io.ts';
import { readCsv } from './csv.ts';
import { ParseRejection } from './protocol.ts';
import { buildRows } from './table.ts';
import { readXlsx } from './xlsx.ts';

runChild((format, bytes, today) => {
  if (format === 'csv') return buildRows(readCsv(bytes), today);
  if (format === 'xlsx') return buildRows(readXlsx(bytes), today);
  throw new ParseRejection('parse_failed');
});
