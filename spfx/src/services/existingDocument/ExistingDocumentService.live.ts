import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/files';
import '@pnp/sp/folders';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IExistingDocumentService } from '../interfaces/IExistingDocumentService';
import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import {
  parseSharePointListUrl,
  readAdminConfigValues,
  RECORDS_HUB_CONFIG_KEYS,
} from '../recordsHubConfig/recordsHubConfig';
import {
  IExistingDocItem,
  IExistingDocLibrary,
  IExistingDocSite,
  IExistingDocumentFile,
} from '../../models/IExistingDocument';
import { RecordsHubSiteRow, mapBrowsableRecordsHubSites } from './recordsHubSiteRow';

export const RECORDS_HUB_SITE_URL_KEY = 'recordsHubSiteUrl';

/** SP.List BaseTemplate 101 = Document Library. */
const DOCUMENT_LIBRARY_TEMPLATE = 101;
const MAX_DOCUMENTS = 500;
const MAX_REGISTERED_SITES = 5000;

interface IListRow {
  Id: number;
  Title: string;
  RootFolder?: { ServerRelativeUrl?: string };
}

interface IItemRow {
  FileLeafRef?: string;
  FileRef?: string;
  FSObjType?: number;
  Modified?: string;
}

/** The scheme+host of a site URL (e.g. https://tenant.sharepoint.com), for prefixing a
 * server-relative FileRef into an absolute URL. Falls back to the input for a non-absolute value. */
function siteUrlOrigin(siteUrl: string): string {
  try {
    return new URL(siteUrl).origin;
  } catch {
    return siteUrl.replace(/\/$/, '');
  }
}

/**
 * Live implementation — builds a PnPjs SPFI per requested site (`spfi(siteUrl).using(SPFx(context))`)
 * so it can read libraries/documents from any allowed site, not just CORMS's own. The configured
 * Records Hub web is the browse root. RH_Classifications is the metadata source for classifications,
 * not a register of SharePoint sites. Reads run as the signed-in user; a site or
 * library they lack access to simply throws and is surfaced as empty by the caller.
 */
export class ExistingDocumentServiceLive implements IExistingDocumentService {
  constructor(
    private readonly context: WebPartContext,
    private readonly devSettings: IDevSettingsService
  ) {}

  private sp(siteUrl: string): SPFI {
    return spfi(siteUrl).using(SPFx(this.context));
  }

  public async getAllowedSites(): Promise<IExistingDocSite[]> {
    const values = await readAdminConfigValues(this.devSettings);
    // The source of truth is the configurable RH_RecordsHub registry list — not a JSON list in
    // Admin Settings. Retain the legacy site setting only to derive the conventional list endpoint
    // for tenants that have not yet provisioned the new explicit configuration row.
    const configuredList = parseSharePointListUrl(values[RECORDS_HUB_CONFIG_KEYS.recordsHubRegistryListUrl]);
    const recordsHubUrl = (
      values[RECORDS_HUB_SITE_URL_KEY] ??
      values.RootSiteUrl ??
      ''
    )
      .trim()
      .replace(/\/$/, '');
    const fallbackList = parseSharePointListUrl(
      recordsHubUrl ? `${recordsHubUrl}/Lists/RH_RecordsHub/AllItems.aspx` : undefined
    );
    const endpoint = configuredList ?? fallbackList;
    if (!endpoint) {
      throw new Error(
        'Records Hub registry list is not configured. Set recordsHub.recordsHubRegistryListUrl in Admin Settings.'
      );
    }

    // RH_SiteName and RH_SiteURL are the registry's actual internal column names. Query every
    // registered site (up to SharePoint's standard list-view threshold), then exclude CORMS itself.
    const rows = (await this.sp(endpoint.webUrl)
      .web.getList(endpoint.listServerRelativeUrl)
      .items.select('Id', 'RH_SiteName', 'RH_SiteURL', 'RH_SiteId')
      .top(MAX_REGISTERED_SITES)()) as RecordsHubSiteRow[];
    return mapBrowsableRecordsHubSites(rows, this.context.pageContext.web.absoluteUrl);
  }

  public async getLibraries(siteUrl: string): Promise<IExistingDocLibrary[]> {
    if (!siteUrl) return [];
    const rows = (await this.sp(siteUrl)
      .web.lists.filter(`BaseTemplate eq ${DOCUMENT_LIBRARY_TEMPLATE} and Hidden eq false`)
      .select('Id', 'Title', 'RootFolder/ServerRelativeUrl')
      .expand('RootFolder')
      .orderBy('Title')()) as IListRow[];
    return rows.map((r) => ({
      id: String(r.Id),
      title: r.Title,
      serverRelativeUrl: r.RootFolder?.ServerRelativeUrl ?? '',
    }));
  }

  public async getDocuments(siteUrl: string, libraryTitle: string): Promise<IExistingDocItem[]> {
    if (!siteUrl || !libraryTitle) return [];
    // NOTE: do not $select the file size here. `File_x0020_Size` is a hidden field that is not
    // selectable on library items via REST and 400s the whole query (confirmed against a live
    // library); the picker doesn't display size anyway, so it's simply omitted. FSObjType eq 0
    // keeps files only (drops sub-folders); orderBy FileLeafRef is fine.
    const rows = (await this.sp(siteUrl)
      .web.lists.getByTitle(libraryTitle)
      .items.select('FileLeafRef', 'FileRef', 'FSObjType', 'Modified')
      .filter('FSObjType eq 0')
      .top(MAX_DOCUMENTS)
      .orderBy('FileLeafRef')()) as IItemRow[];
    // FileRef is a server-relative URL that already includes the site path (e.g.
    // /sites/SPEDRMSRecordsHubDev2/<library>/<file>). The absolute URL must therefore be the
    // tenant ORIGIN + FileRef — NOT siteUrl + FileRef, which double-counts the site segment
    // (/sites/X/sites/X/…) and 404s when the document is opened.
    const origin = siteUrlOrigin(siteUrl);
    return rows
      .filter((r) => !!r.FileRef && !!r.FileLeafRef)
      .map((r) => ({
        name: r.FileLeafRef as string,
        serverRelativeUrl: r.FileRef as string,
        url: `${origin}${r.FileRef as string}`,
        modified: r.Modified,
      }));
  }

  public async getDocumentFile(siteUrl: string, serverRelativeUrl: string): Promise<IExistingDocumentFile> {
    const blob = await this.sp(siteUrl).web.getFileByServerRelativePath(serverRelativeUrl).getBlob();
    const fileName = serverRelativeUrl.slice(serverRelativeUrl.lastIndexOf('/') + 1);
    return { fileName, content: blob };
  }
}
