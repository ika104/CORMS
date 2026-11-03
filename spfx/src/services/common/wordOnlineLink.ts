/**
 * CMS-040 Preview tab — "Open for editing in Word". The task brief assumed a Word-Online deep-link
 * helper already existed somewhere behind the item "…" menu to reuse; a repo-wide search found
 * none (no `officeapps.live.com`, `WopiFrame`, or similar anywhere). DECISION: built fresh here as
 * a small, reusable, pure-URL-construction helper rather than a bespoke inline one-off, so a future
 * "…" menu item can call the same function instead of duplicating it.
 *
 * Uses SharePoint's own standard WOPI edit-in-browser pattern (`_layouts/15/WopiFrame.aspx`),
 * which needs no external SDK and works for any Office document already stored in a SharePoint
 * document library — exactly what CORMS_Attachments already is.
 */
export function buildWordEditUrl(origin: string, serverRelativeUrl: string): string | undefined {
  if (!serverRelativeUrl || !origin) return undefined;
  return `${origin}/_layouts/15/WopiFrame.aspx?sourcedoc=${encodeURIComponent(serverRelativeUrl)}&action=edit`;
}

/** Word Online only makes sense for Word-family documents — matches the same extension the
 * existing RENDERABLE_EXT gate in PreviewTab.tsx already recognizes as a Word document. */
export function isWordDocument(fileName: string): boolean {
  return /\.docx?$/i.test(fileName);
}
