import ExcelJS from 'exceljs';

export async function xlsxToCsvBuffer(buf: Buffer): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(buf) as never);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('empty workbook');
  }
  const lines: string[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    const count = Math.max(row.cellCount, 1);
    for (let i = 1; i <= count; i += 1) {
      cells.push(csvEscape(cellToString(row.getCell(i))));
    }
    lines.push(cells.join(','));
  });
  if (lines.length < 2) {
    throw new Error('empty sheet');
  }
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

function cellToString(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (value && typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') {
      return value.text;
    }
    if ('result' in value) {
      const result = (value as { result?: unknown }).result;
      if (result instanceof Date) return result.toISOString().slice(0, 10);
      if (result != null) return String(result);
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
  }
  if (cell.text) return cell.text;
  if (value == null) return '';
  return String(value);
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
