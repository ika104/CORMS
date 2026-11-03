/** Builds a downloadable JSON file and triggers a client-side download — no server round-trip.
 * Mirrors exportCsv.ts's Blob/anchor pattern for the Translations "Export" action (CMS-056). */
export function exportJsonToFile(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
