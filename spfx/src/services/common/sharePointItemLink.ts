/**
 * Builds the SharePoint document-library page URL for a stored file — the out-of-the-box
 * view/edit surface (`{library}/Forms/AllItems.aspx?id=<file>&parent=<folder>`). Opening this in a
 * new tab, instead of the raw file server-relative URL, hands the user SharePoint's native document
 * experience: preview, Open in App / Edit in the browser (Office Online), download, and version
 * history — all governed by their own SharePoint permissions. Opening the raw URL instead just
 * streams the bytes into the browser's read-only PDF/image viewer, with no way to edit the source.
 *
 * Only builds a URL for a server-relative file inside the CORMS_Attachments library. Returns
 * undefined for anything else — an absolute URL (e.g. a RecordsHub link on another site) or a path
 * outside that library — so the caller can fall back to opening the raw URL directly.
 */
const ATTACHMENTS_LIBRARY_SEGMENT = '/CORMS_Attachments';

export function buildSharePointItemUrl(origin: string, fileServerRelativeUrl: string): string | undefined {
  if (!origin || !fileServerRelativeUrl || /^https?:\/\//i.test(fileServerRelativeUrl)) return undefined;
  const marker = `${ATTACHMENTS_LIBRARY_SEGMENT}/`;
  const idx = fileServerRelativeUrl.indexOf(marker);
  if (idx === -1) return undefined;
  const libraryRoot = fileServerRelativeUrl.slice(0, idx + ATTACHMENTS_LIBRARY_SEGMENT.length);
  const parentFolder = fileServerRelativeUrl.replace(/\/[^/]*$/, '');
  const formsPage = `${origin.replace(/\/+$/, '')}${libraryRoot}/Forms/AllItems.aspx`;
  return `${formsPage}?id=${encodeURIComponent(fileServerRelativeUrl)}&parent=${encodeURIComponent(parentFolder)}`;
}
