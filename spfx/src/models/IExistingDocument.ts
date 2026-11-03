/**
 * Types for the "Create correspondence from an existing document" flow: the allowed SharePoint sites
 * (from the RecordsHub registry), their document libraries, and the documents within a library. The Existing
 * Document tab drills sites → libraries → documents and pulls the chosen file in as the main
 * correspondence document.
 */

/** One SharePoint site the user is allowed to browse for existing documents. Sourced from the
 * RecordsHub `RH_RecordsHub` registry; actual access is still enforced by
 * SharePoint per user, so a configured site the user can't read simply returns nothing. */
export interface IExistingDocSite {
  /** RH_RecordsHub SharePoint item identifier when sourced from that list. */
  id?: string;
  siteId?: string;
  /** Absolute site URL, e.g. https://tenant.sharepoint.com/sites/Contracts. */
  url: string;
  /** Friendly label shown in the picker; falls back to the URL's last segment when omitted. */
  title: string;
}

/** A document library within a browsed site. */
export interface IExistingDocLibrary {
  id: string;
  title: string;
  /** Root folder server-relative URL — the anchor documents are listed under. */
  serverRelativeUrl: string;
}

/** A document within a browsed library. */
export interface IExistingDocItem {
  name: string;
  /** Server-relative URL used to fetch the file's bytes. */
  serverRelativeUrl: string;
  /** Canonical absolute source URL persisted as a link. */
  url?: string;
  sizeBytes?: number;
  modified?: string;
}

/** The chosen file pulled into the compose section: its name and in-memory bytes. */
export interface IExistingDocumentFile {
  fileName: string;
  content: Blob;
}

/** The last path segment of a site URL, used as a fallback title. */
function siteTitleFromUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, '');
  const seg = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return seg || trimmed;
}

/**
 * Legacy JSON parser retained for backwards-compatible mock data only. The live picker reads the
 * configured RH_RecordsHub list instead. Accepts either an array of `{ url, title }`
 * objects or a bare array of URL strings, and tolerates a blank/malformed value (→ []). Entries with
 * no usable URL are dropped; a missing title falls back to the URL's last segment. Pure + tested so
 * the config shape is validated in one place regardless of mock/live.
 */
export function parseAllowedSites(json: string | undefined): IExistingDocSite[] {
  if (!json || !json.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const sites: IExistingDocSite[] = [];
  parsed.forEach((entry) => {
    if (typeof entry === 'string') {
      const url = entry.trim();
      if (url) sites.push({ url, title: siteTitleFromUrl(url) });
    } else if (entry && typeof entry === 'object') {
      const rec = entry as { url?: unknown; title?: unknown };
      const url = typeof rec.url === 'string' ? rec.url.trim() : '';
      if (url) {
        const title =
          typeof rec.title === 'string' && rec.title.trim() ? rec.title.trim() : siteTitleFromUrl(url);
        sites.push({ url, title });
      }
    }
  });
  return sites;
}
