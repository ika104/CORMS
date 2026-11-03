import { SPHttpClient } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IMetadataService } from '../interfaces/IMetadataService';
import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import {
  IChannelOption,
  IContentType,
  ICorrespondenceTypeOption,
  IDestinationDepartment,
  IOriginatingFunction,
  IRecipient,
  IRecordClassification,
  IRecordHubDocument,
  ISecurityLevel,
} from '../../models/ICorrespondenceMetadata';
import {
  IListEndpoint,
  listItemsApiUrl,
  parseSharePointListUrl,
  parseChannelsJson,
  parseContentTypesJson,
  parseCorrespondenceTypesJson,
  parseCouriersJson,
  parseOriginatingFunctionsJson,
  readAdminConfigValues,
  RECORDS_HUB_CONFIG_KEYS,
} from '../recordsHubConfig/recordsHubConfig';
import { ICourierConfig } from '../../models/ICourierConfig';
import { normalizeSecurityLevelTiers } from './securityLevelRank';
import { CONTENT_TYPES_LIST, IContentTypeRow, parseLibraryContentTypes } from './contentTypes';

interface IMetadataListItem {
  Id: number;
  Title: string;
  SecondaryValue?: string;
  Active?: boolean;
}

type RawItem = Record<string, unknown>;
const RECORDS_HUB_SITE_URL_KEY = 'recordsHubSiteUrl';
const CLASSIFICATIONS_LIST_VIEW_PATH = '/Lists/RH_Classifications/AllItems.aspx';

/**
 * Resolves the RH_Classifications list endpoint the record-classification picker reads from.
 *
 * The explicit `recordsHub.classificationsListUrl` (the list's AllItems.aspx URL, configured in
 * Admin Config exactly like RH_SecurityLevels and RH_OrgSecurity) is the source of truth and wins:
 * this is how the customer's tenant is configured and it lets the RecordsHub registry move without
 * a matching `recordsHubSiteUrl`. Only when that explicit value is absent do we fall back to the
 * conventional path beneath `recordsHubSiteUrl`, so a tenant that set just the site URL still works.
 * Previously this derived solely from `recordsHubSiteUrl`, so a tenant that left it blank (but did
 * configure the explicit list URL) got an empty/failed picker — the record classifications never
 * loaded from RecordsHub.
 */
export function resolveClassificationsEndpoint(values: Record<string, string>): IListEndpoint | undefined {
  const configured = parseSharePointListUrl(values[RECORDS_HUB_CONFIG_KEYS.classificationsListUrl]);
  if (configured) return configured;
  const base = (values[RECORDS_HUB_SITE_URL_KEY] ?? '').trim().replace(/\/+$/, '');
  return base ? parseSharePointListUrl(`${base}${CLASSIFICATIONS_LIST_VIEW_PATH}`) : undefined;
}

function firstDefined(item: RawItem, keys: string[]): unknown {
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null && item[key] !== '') return item[key];
  }
  return undefined;
}

function asString(value: unknown): string {
  if (value && typeof value === 'object') {
    const lookup = value as { Title?: unknown; Value?: unknown; Label?: unknown; Name?: unknown };
    return asString(lookup.Title ?? lookup.Value ?? lookup.Label ?? lookup.Name);
  }
  return value === undefined || value === null ? '' : String(value);
}

/** A positive integer tier, or undefined when the source column is absent/blank/non-numeric — so
 * an unmapped clearance level reads as "unknown" (allowed) rather than 0. */
function toTier(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function matchesQuery(name: string, query?: string): boolean {
  return !query || name.toLowerCase().indexOf(query.toLowerCase()) !== -1;
}

// Live SP REST implementation of ds.metadata (D-02). Each Create Correspondence field now reads
// from its own configurable source (Part 2 of the RecordsHub-integration task): security levels,
// record classifications and destination departments come from RecordsHub RH_* lists whose
// AllItems URLs live in CORMS_AdminConfig (so retargeting a tenant is an Admin Config edit, never a
// code change), while content types are managed as CORMS_AdminConfig JSON. The remaining fields
// (originating functions, recipients, RecordHub document search) still read the CORMS_Metadata
// list on CORMS's own site — out of scope for this task, left as-is.
export class MetadataServiceLive implements IMetadataService {
  constructor(
    private readonly context: WebPartContext,
    private readonly devSettings: IDevSettingsService,
    private readonly siteUrl: string,
    private readonly listName: string = 'CORMS_Metadata'
  ) {}

  // Content Types come from the CORMS document library's own content types (the same set the
  // library's "New" menu offers — e.g. Document / Announcement / Letter), not an Admin Config JSON
  // list, so adding a content type in SharePoint is all that's needed. Read from CORMS_Attachments
  // on the CURRENT web (pageContext), NOT this.siteUrl — that's the RecordsHub site, whereas the
  // attachments library lives on CORMS's own site where the web part runs. Falls back to the Admin
  // Config JSON only if the library read fails, so the field never hard-breaks.
  public async getContentTypes(query?: string): Promise<IContentType[]> {
    let all: IContentType[];
    try {
      all = await this.fetchLibraryContentTypes();
    } catch {
      const values = await readAdminConfigValues(this.devSettings);
      all = parseContentTypesJson(values[RECORDS_HUB_CONFIG_KEYS.contentTypesJson]);
    }
    if (!query) return all;
    const q = query.toLowerCase();
    return all.filter((ct) => ct.name.toLowerCase().indexOf(q) !== -1);
  }

  private async fetchLibraryContentTypes(): Promise<IContentType[]> {
    const webUrl = this.context.pageContext.web.absoluteUrl;
    const url =
      `${webUrl}/_api/web/lists/getbytitle('${CONTENT_TYPES_LIST}')/ContentTypes` +
      `?$select=Name,StringId,Hidden,Id&$top=200`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(`Failed to read content types: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { value: IContentTypeRow[] };
    return parseLibraryContentTypes(body.value);
  }

  public async getCorrespondenceTypes(): Promise<ICorrespondenceTypeOption[]> {
    const values = await readAdminConfigValues(this.devSettings);
    return parseCorrespondenceTypesJson(values[RECORDS_HUB_CONFIG_KEYS.correspondenceTypesJson]);
  }

  public async getChannels(): Promise<IChannelOption[]> {
    const values = await readAdminConfigValues(this.devSettings);
    return parseChannelsJson(values[RECORDS_HUB_CONFIG_KEYS.channelsJson]);
  }

  public async getOriginatingFunctions(): Promise<IOriginatingFunction[]> {
    const values = await readAdminConfigValues(this.devSettings);
    return parseOriginatingFunctionsJson(values[RECORDS_HUB_CONFIG_KEYS.originatingFunctionsJson]);
  }

  public async getCouriers(): Promise<ICourierConfig[]> {
    const values = await readAdminConfigValues(this.devSettings);
    return parseCouriersJson(values[RECORDS_HUB_CONFIG_KEYS.couriersJson]);
  }

  public async getRecipients(query?: string): Promise<IRecipient[]> {
    const items = await this.queryMetadataList('Recipient', query);
    // CMS-006 AC5 — clearanceTier is left undefined here: the Recipient metadata list carries no
    // clearance column yet. The builder's eligibility check treats unknown clearance as allowed so
    // live picking isn't blocked. TODO(confirm): source per-user clearance (CORMS_UserRoles /
    // directory) once that data exists, then map it here.
    return items.map((item) => ({ id: String(item.Id), name: item.Title, department: item.SecondaryValue }));
  }

  public async getSecurityLevels(): Promise<ISecurityLevel[]> {
    const items = await this.queryRecordsHubList(RECORDS_HUB_CONFIG_KEYS.securityLevelsListUrl);
    // RH_SecurityLevels holds the display name in its own `RH_SecurityLevels` column and the rank
    // in `RH_SecurityNumber` — NOT in Title (Title is the row id here). Probe those first, keeping
    // the generic fallbacks for other tenants' schemas. The list also carries duplicate rows per
    // level, so dedupe by name to avoid repeated pills.
    const mapped = items
      .map((item, index) => ({
        id: asString(firstDefined(item, ['Id'])),
        name: asString(firstDefined(item, ['RH_SecurityLevels', 'SecurityLevelName', 'Name', 'Title'])),
        tier:
          Number(
            firstDefined(item, ['RH_SecurityNumber', 'Tier', 'Level', 'Order', 'SortOrder', 'SecurityLevel'])
          ) || index + 1,
      }))
      .filter((level) => !!level.name);
    // Ordered by SharePoint item id ascending (the list's natural order), then limited to the
    // top 5 — the list carries a duplicate second set of levels (ids 6-10) we don't render.
    const top = mapped.sort((a, b) => Number(a.id) - Number(b.id)).slice(0, 5);
    // Re-tier onto CORMS's canonical ascending sensitivity scale (1=Unclassified..5=Top Secret) so
    // the clearance ceiling and the persisted SecurityLevel don't depend on RH_SecurityNumber's
    // (tenant-defined, possibly reversed) numeric direction — see securityLevelRank.ts.
    return normalizeSecurityLevelTiers(top);
  }

  public async getRecordClassifications(query?: string): Promise<IRecordClassification[]> {
    const endpoint = resolveClassificationsEndpoint(await readAdminConfigValues(this.devSettings));
    if (!endpoint)
      throw new Error(
        'Record classifications source is not configured. Set recordsHub.classificationsListUrl ' +
          '(the RH_Classifications AllItems.aspx URL) or recordsHubSiteUrl in Admin Settings.'
      );
    // Record Classification is sourced from the RH_Aggregations list (its AllItems.aspx URL is the
    // configured recordsHub.classificationsListUrl). Customer requirement: the picker shows
    // "RH_Number - <English Title>" (or "RH_Number - RH_ArabicName" in Arabic), so we project the
    // aggregation number, the item's Title/LinkTitle (English name) and its RH_ArabicName. A single
    // broad fetch (no $expand) keeps this resilient to the exact column set; the per-language label
    // itself is assembled by the picker from recordNumber + name/nameAr.
    const items = await this.queryRecordsHubListEndpoint(endpoint);
    return items
      .map((item) => ({
        id: asString(firstDefined(item, ['Id'])),
        // Aggregation number, e.g. "2110/1-2026" — the "RH_Number" part of the label.
        recordNumber: asString(
          firstDefined(item, ['RH_Number', 'RH_ClassificationCode', 'Classification_x0020_Code', 'Code', 'Number'])
        ),
        // English name — the LinkTitle/Title of the aggregation. Deliberately does NOT fall back to
        // RH_ArabicName (that is carried separately as nameAr) so the English label stays English.
        name: asString(firstDefined(item, ['Title', 'LinkTitle', 'RH_Name', 'RH_EnglishName', 'EnglishName', 'Name'])),
        nameAr: asString(firstDefined(item, ['RH_ArabicName', 'Arabic_x0020_Name'])) || undefined,
        // Active unless an active flag explicitly says otherwise (RH_Aggregations may not carry one).
        active: firstDefined(item, ['RH_IsActive', 'Active', 'IsActive']) !== false,
        // CMS-034 AC2 — minimum clearance tier when RH carries one; undefined = selectable.
        clearanceTier: toTier(
          firstDefined(item, ['RH_SecurityNumber', 'SecurityLevel', 'SecurityTier', 'ClearanceTier', 'MinimumClearance', 'Level'])
        ),
      }))
      .filter(
        (c) =>
          !!c.name &&
          c.active &&
          (matchesQuery(c.recordNumber, query) || matchesQuery(c.name, query) || matchesQuery(c.nameAr ?? '', query))
      );
  }

  public async getDestinationDepartments(query?: string): Promise<IDestinationDepartment[]> {
    const items = await this.queryRecordsHubList(RECORDS_HUB_CONFIG_KEYS.orgSecurityListUrl);
    return items
      .map((item) => ({
        id: asString(firstDefined(item, ['Id'])),
        name: asString(
          firstDefined(item, ['RH_DepartmentName', 'DepartmentName', 'Department', 'Name', 'Title'])
        ),
        nameAr: asString(firstDefined(item, ['RH_DepartmentNameAR', 'DepartmentNameAR'])) || undefined,
      }))
      .filter((d) => !!d.name && (matchesQuery(d.name, query) || matchesQuery(d.nameAr ?? '', query)));
  }

  public async searchRecordHubDocuments(query?: string): Promise<IRecordHubDocument[]> {
    const items = await this.queryMetadataList('RecordHubDocument', query);
    return items.map((item) => ({
      id: String(item.Id),
      name: item.Title,
      recordNumber: item.SecondaryValue ?? '',
    }));
  }

  /** Reads a configurable RecordsHub list (endpoint URL stored in CORMS_AdminConfig). Fetches all
   * fields — the RH_* list schemas aren't fixed in CORMS, so mapping is done defensively per field
   * rather than via a $select that would 400 on an unexpected column. Filtering by the type-ahead
   * query is done client-side (in each caller) rather than server-side: the display label lives in
   * a different column per list (e.g. "English Name", not Title), so a server $filter would either
   * miss it or 400 on a guessed column name. */
  private async queryRecordsHubList(configKey: string): Promise<RawItem[]> {
    const endpoint = await this.resolveEndpoint(configKey);
    return this.queryRecordsHubListEndpoint(endpoint);
  }

  private async queryRecordsHubListEndpoint(
    endpoint: IListEndpoint,
    select?: string,
    expand?: string
  ): Promise<RawItem[]> {
    const url = `${listItemsApiUrl(endpoint)}?${select ? `$select=${select}&` : ''}${expand ? `$expand=${expand}&` : ''}$top=2000`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to read ${endpoint.listServerRelativeUrl}: ${response.status} ${response.statusText}`
      );
    }
    const body = (await response.json()) as { value: RawItem[] };
    return body.value;
  }

  private async resolveEndpoint(configKey: string): Promise<IListEndpoint> {
    const values = await readAdminConfigValues(this.devSettings);
    const endpoint = parseSharePointListUrl(values[configKey]);
    if (!endpoint) {
      throw new Error(
        `RecordsHub list URL '${configKey}' is not configured in Admin Config — set it to the list's AllItems.aspx URL.`
      );
    }
    return endpoint;
  }

  private async queryMetadataList(category: string, search?: string): Promise<IMetadataListItem[]> {
    const filters = [`Category eq '${category}'`];
    if (search) {
      filters.push(`substringof('${search.replace(/'/g, "''")}', Title)`);
    }
    const url =
      `${this.siteUrl}/_api/web/lists/getbytitle('${this.listName}')/items` +
      `?$select=Id,Title,SecondaryValue,Active&$filter=${encodeURIComponent(filters.join(' and '))}`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to read ${this.listName} (${category}): ${response.status} ${response.statusText}`
      );
    }
    const body = (await response.json()) as { value: IMetadataListItem[] };
    return body.value;
  }
}
