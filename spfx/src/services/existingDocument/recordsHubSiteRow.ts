import { IExistingDocSite } from '../../models/IExistingDocument';

/**
 * Pure mapper for a row of the Records Hub site registry list (RH_RecordsHub) → an IExistingDocSite
 * the Existing Document picker can browse. Kept free of any @pnp/sp import so it's unit-testable
 * (the live wrapper, which does import @pnp/sp, can't be loaded under Jest).
 */
export type RecordsHubSiteRow = Record<string, unknown>;

function value(row: RecordsHubSiteRow, names: string[]): string {
  for (const name of names) {
    const candidate = row[name];
    if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }
  return '';
}

/** SharePoint internal names vary, so map defensively. The live list uses RH_SiteURL / RH_SiteName /
 * RH_SiteId (note the exact casing — object keys are case-sensitive, so RH_SiteURL must be probed
 * as-is, not RH_SiteUrl); the other candidates are fallbacks for a differently-named tenant list. */
export function mapRecordsHubSiteRow(row: RecordsHubSiteRow): IExistingDocSite | undefined {
  const url = value(row, ['RH_SiteURL', 'RH_SiteUrl', 'Site_x0020_URL', 'SiteURL', 'SiteUrl', 'URL', 'Url']);
  if (!/^https?:\/\//i.test(url)) return undefined;
  const title =
    value(row, ['RH_SiteName', 'Site_x0020_Name', 'SiteName', 'Title']) ||
    url.replace(/\/+$/, '').split('/').pop() ||
    url;
  return {
    id: value(row, ['Id', 'ID']) || undefined,
    siteId: value(row, ['RH_SiteId', 'RH_SiteID', 'Site_x0020_ID', 'SiteID', 'SiteId']) || undefined,
    url: url.replace(/\/$/, ''),
    title,
  };
}

/**
 * Converts RecordsHub registry rows into the picker scope. The CORMS web hosting the picker is
 * deliberately omitted: users attach an existing document from another registered site, not from
 * the correspondence they are already creating. De-duplication is URL-based and preserves the
 * registry's display order.
 */
export function mapBrowsableRecordsHubSites(
  rows: RecordsHubSiteRow[],
  currentSiteUrl: string | undefined
): IExistingDocSite[] {
  const normalizedCurrentSite = normalizeSiteUrl(currentSiteUrl);
  const seen = new Set<string>();
  return rows
    .map(mapRecordsHubSiteRow)
    .filter((site): site is IExistingDocSite => !!site)
    .filter((site) => {
      const normalizedUrl = normalizeSiteUrl(site.url);
      if (!normalizedUrl || normalizedUrl === normalizedCurrentSite || seen.has(normalizedUrl)) return false;
      seen.add(normalizedUrl);
      return true;
    });
}

function normalizeSiteUrl(url: string | undefined): string {
  return (url ?? '').trim().replace(/\/+$/, '').toLowerCase();
}
