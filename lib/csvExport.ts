import { Platform } from 'react-native';

/**
 * CSV rather than a real .xlsx workbook. `xlsx` is already a dependency, but
 * only `scratch/` build-time scripts use it — importing SheetJS here would add
 * a few hundred KB to a bundle that mobile residents download over mobile data,
 * to produce a file Excel and Google Sheets both open from CSV anyway.
 */

/** One row of the sheet. `null`/`undefined` render as an empty cell. */
export type CsvCell = string | number | null | undefined;

/**
 * RFC 4180 quoting. This is not optional decoration: real contributor names in
 * the ledger contain commas ("Madhoo Rani, Ashish"), and an unquoted one
 * silently shifts every column after it by one.
 */
function escapeCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvCell[][]): string {
  // CRLF is what RFC 4180 specifies and what Excel on Windows expects.
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/** Strip anything a filesystem or a Content-Disposition header would object to. */
export function safeFileName(value: string, fallback = 'export') {
  const cleaned = value
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

/**
 * Hand the file to the user. Web gets a real download; native writes to the
 * cache directory and opens the share sheet, which is the only way to get a
 * file out of a sandboxed app.
 *
 * Native path is written against the expo-file-system v19 (SDK 54) `File` API
 * and has NOT been exercised on a device — web is the shipping target. If it
 * needs fixing, it is isolated to this function.
 */
export async function downloadCsv(fileName: string, csv: string): Promise<void> {
  // Excel reads a CSV as the system's legacy codepage unless a UTF-8 BOM says
  // otherwise, which turns every non-ASCII name into mojibake on open.
  const withBom = `\uFEFF${csv}`;

  if (Platform.OS === 'web') {
    const blob = new Blob([withBom], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Revoking synchronously cancels the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return;
  }

  const { File, Paths } = require('expo-file-system');
  const Sharing = require('expo-sharing');

  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(withBom);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export fund ledger',
    UTI: 'public.comma-separated-values-text',
  });
}
