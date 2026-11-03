export interface ICsvColumn<T> {
  header: string;
  accessor: (row: T) => string;
}

// A lone CR is a record separator for Excel just as CRLF is, so it has to force quoting
// too — otherwise a pasted-in multi-line subject silently splits into extra rows.
function escapeCsvValue(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Excel assumes the OS' legacy codepage for a BOM-less CSV, which turns every Arabic
// subject (and every header under the `ar` locale) into mojibake. The BOM is what makes
// it read the file as UTF-8.
const UTF8_BOM = '\uFEFF';

/** Builds a CSV from the given rows/columns and triggers a client-side download — no server round-trip. */
export function exportRowsToCsv<T>(rows: T[], columns: ICsvColumn<T>[], filename: string): void {
  const lines = [columns.map((c) => c.header), ...rows.map((row) => columns.map((c) => c.accessor(row)))].map(
    (line) => line.map(escapeCsvValue).join(',')
  );
  const blob = new Blob([UTF8_BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
