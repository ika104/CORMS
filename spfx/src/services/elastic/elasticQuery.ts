import { CorrespondenceDirection, ICorrespondenceStub } from '../../models/ICorrespondence';
import { mapStatus } from '../common/mapCorrespondenceRow';
import { securityLevelToTier } from '../common/clearance';

/** CORMS_AdminConfig keys backing the direct-from-SharePoint Elasticsearch integration (no .NET
 * layer). Endpoint + API key mirror the RecordsHub Configurations values
 * (ElasticSearchEndPoint / ElasticAPIKey); the optional index narrows the search to one index
 * (blank = all indices, POST /_search, matching the doc's Advanced Search preview). */
export const ELASTIC_CONFIG_KEYS = {
  endpoint: 'integration.elasticEndpoint',
  apiKey: 'integration.elasticApiKey',
  index: 'integration.elasticIndex',
  /** Append-only CORMS audit index. Kept separate from `index`, which scopes the content-search
   * catalogue and may point at a per-site RecordsHub index. */
  auditIndex: 'integration.elasticAuditIndex',
  /** Master on/off switch for ALL auditing. Default on; when set to 'false' no audit event is
   * written anywhere (Elasticsearch or SharePoint). Reads of existing history still work. */
  auditEnabled: 'integration.auditingEnabled',
  /** CMS-025 — the RecordsHub "site registry" index (one doc per synced SharePoint site). CORMS
   * looks up its own site here by URL to derive the per-site content index name, so no GUID index
   * has to be pasted by hand. Blank falls back to the default `sharepoint_sites`. */
  sitesIndex: 'integration.elasticSitesIndex',
  /** CMS-025 — a RecordsHub per-site index holds items from MANY SharePoint lists (RH_Links,
   * libraries, …), each carrying parentReference.list.name. This narrows results to the
   * correspondence list only; blank = no list filtering (search the whole index). */
  correspondenceList: 'integration.elasticCorrespondenceList',
  /** CMS-046 — same idea for the Tasks search type: the SharePoint list holding CORMS_Tasks items
   * in the same per-site index. Blank = no list filtering. */
  taskList: 'integration.elasticTaskList',
} as const;

/** How many hits to pull before the client-side clearance/filter pass narrows them. */
export const ELASTIC_SEARCH_SIZE = 100;

/** Default RecordsHub site-registry index (one doc per synced SharePoint site). */
export const DEFAULT_SHAREPOINT_SITES_INDEX = 'sharepoint_sites';

/** One `sharepoint_sites` document: `_id` is the site's per-site CONTENT index name; `_source.id`
 * is the same identity in comma form (`domain,siteGuid,webGuid`); RH_SiteURL is the site URL. */
export interface ISiteRegistryHit {
  _id?: string;
  _source?: {
    id?: string;
    name?: string;
    displayName?: string;
    RH_SiteURL?: string;
    RH_SiteUrl?: string;
  };
}

/** Trailing-slash- and case-insensitive site-URL comparison key. */
export function normalizeSiteUrl(url: string | undefined): string {
  return (url ?? '').trim().toLowerCase().replace(/\/+$/, '');
}

/** The per-site CONTENT index name is the site identity with commas turned into underscores
 * (`ssloman.sharepoint.com,<siteGuid>,<webGuid>` -> `ssloman.sharepoint.com_<siteGuid>_<webGuid>`),
 * which is exactly the `sharepoint_sites` document's `_id`. */
export function siteContentIndexFromId(id: string | undefined): string {
  return String(id ?? '').replace(/,/g, '_');
}

/**
 * CMS-025 — resolves the per-site content index for `siteUrl` from the `sharepoint_sites` registry
 * hits: the matching site's `_id` (preferred) or, failing that, its comma-form `_source.id` turned
 * into the underscore index name. Returns undefined when no site matches, so the caller can fall
 * back to an all-index search rather than throw.
 */
export function resolveSiteContentIndex(hits: ISiteRegistryHit[], siteUrl: string): string | undefined {
  const wanted = normalizeSiteUrl(siteUrl);
  if (!wanted) return undefined;
  for (const hit of hits ?? []) {
    const url = normalizeSiteUrl(hit._source?.RH_SiteURL ?? hit._source?.RH_SiteUrl);
    if (url && url === wanted) {
      return hit._id ?? (hit._source?.id ? siteContentIndexFromId(hit._source.id) : undefined);
    }
  }
  return undefined;
}

/** Auditing is ON unless the admin has explicitly set integration.auditingEnabled to 'false'.
 * A missing/blank value (older tenants that predate the switch) therefore stays enabled. */
export function isAuditingEnabled(values: Record<string, string>): boolean {
  return (values[ELASTIC_CONFIG_KEYS.auditEnabled] ?? '').trim().toLowerCase() !== 'false';
}

export interface IElasticHit {
  _id?: string;
  _index?: string;
  _score?: number;
  _source?: Record<string, unknown>;
  /** CMS-026 AC3 — per-field highlight fragments (`{ fieldName: ['…<em>term</em>…'] }`) returned
   * when the search body carries a `highlight` clause. */
  highlight?: Record<string, string[]>;
}

export interface IElasticSearchResponse {
  hits?: {
    total?: number | { value?: number };
    hits?: IElasticHit[];
  };
}

/**
 * CMS-025/026 — true only for an index that can hold correspondence content. A blank
 * `integration.elasticIndex` makes the live search a POST /_search across EVERY index, which
 * otherwise returns Elasticsearch's own bookkeeping as "results": dot-prefixed system indices
 * (`.elastic-connectors-v1`, `.kibana`, `.security`) and the RecordsHub/connector sync registries
 * (`delta_links`, `sharepoint_sites`, `*_duplicate`). Those are filtered out here so an
 * unconfigured index degrades to "no correspondence found" rather than a page of connector config.
 *
 * The connector's CONTENT index (e.g. `connector-sharepoint-online-…`) and the per-site record
 * indices are deliberately NOT excluded — only bookkeeping is. Prefer setting a specific
 * `integration.elasticIndex`; this is the safety net for when it is left blank.
 */
const INFRASTRUCTURE_INDEX_EXACT = ['delta_links', 'sharepoint_sites', 'connectors'];
const INFRASTRUCTURE_INDEX_SUFFIX = ['_delta_links', '_sharepoint_sites', '_duplicate', 'duplicate'];

export function isContentIndex(index: string | undefined): boolean {
  const name = (index ?? '').toLowerCase();
  if (!name) return true; // a hit with no _index (shouldn't happen) is left for the mapper to handle
  if (name.charAt(0) === '.') return false;
  if (INFRASTRUCTURE_INDEX_EXACT.indexOf(name) !== -1) return false;
  return !INFRASTRUCTURE_INDEX_SUFFIX.some((suffix) => name.length > suffix.length && name.slice(-suffix.length) === suffix);
}

interface IHitParentReference {
  list?: { name?: string; displayName?: string };
}

/** The SharePoint list a per-site RecordsHub document came from — from
 * `_source.parentReference.list.name` (falling back to displayName). Undefined when the hit
 * carries no parentReference (e.g. a flat/projected index rather than the per-site sync). */
export function resolveHitListName(hit: IElasticHit): string | undefined {
  const parent = (hit._source?.parentReference as IHitParentReference | undefined)?.list;
  return parent?.name ?? parent?.displayName ?? undefined;
}

/**
 * CMS-025 — true when a hit should be treated as correspondence. Blank `listName` disables the
 * check (whole index). When set, a hit matches only if its parentReference list name equals it
 * (case-insensitive). A hit with NO resolvable list name is kept (lenient) — so a flat/projected
 * index that doesn't carry parentReference isn't silently emptied by this filter.
 */
export function hitMatchesList(hit: IElasticHit, listName: string | undefined): boolean {
  const wanted = (listName ?? '').trim().toLowerCase();
  if (!wanted) return true;
  const actual = resolveHitListName(hit);
  if (actual === undefined) return true;
  return actual.toLowerCase() === wanted;
}

/**
 * CMS-026 AC3 — the `highlight` clause asking Elasticsearch for a matched-keyword fragment. Kept
 * field-agnostic (`fields: { '*': {} }` + `require_field_match: false`) so it highlights the OCR
 * body/content field RecordsHub indexes without CORMS having to know its exact name, exactly like
 * the query itself. `<em>` delimits the match; the tags are stripped back out client-side (a raw
 * ES fragment is never rendered as HTML — see extractHighlightSnippet).
 */
export const SEARCH_HIGHLIGHT = {
  pre_tags: ['<em>'],
  post_tags: ['</em>'],
  fields: { '*': {} },
  require_field_match: false,
  fragment_size: 160,
  number_of_fragments: 1,
} as const;

/**
 * Builds the Elasticsearch query DSL body from the free-text term. `simple_query_string` is used
 * (not query_string) because it never 400s on unbalanced quotes/operators a user might type — it
 * searches every field by default (metadata AND the OCR-extracted content RecordsHub indexes,
 * CMS-026 AC2), so it works regardless of the index's field names. An empty term matches everything
 * (the structured filters then narrow the results client-side). The highlight clause returns the
 * matched-keyword snippet (AC3).
 */
export function buildElasticSearchBody(term: string, size: number, listName?: string): Record<string, unknown> {
  const trimmed = (term ?? '').trim();
  const base: Record<string, unknown> = trimmed
    ? { simple_query_string: { query: trimmed, default_operator: 'and', lenient: true } }
    : { match_all: {} };
  const wantedList = (listName ?? '').trim();
  // When the list is known, scope to it server-side so the `size`-capped result window is filled
  // with that list's items instead of an arbitrary slice of the whole per-site index (which mixes
  // Timeline/AdminConfig/Attachments rows and could push correspondence out of the window). The
  // base+.keyword OR keeps it working whether parentReference.list.name is analysed text or keyword;
  // the client-side hitMatchesList stays as a defensive fallback.
  const query = wantedList
    ? {
        bool: {
          must: [base],
          filter: [
            {
              bool: {
                should: [
                  { term: { 'parentReference.list.name': wantedList } },
                  { term: { 'parentReference.list.name.keyword': wantedList } },
                ],
                minimum_should_match: 1,
              },
            },
          ],
        },
      }
    : base;
  return { size, query, highlight: SEARCH_HIGHLIGHT };
}

/** Removes the `<em>`/`</em>` highlight delimiters so an Elasticsearch fragment is only ever
 * handled as plain text — the term is re-highlighted safely in the grid via highlightMatch. */
export function stripHighlightTags(fragment: string): string {
  return fragment.replace(/<\/?em>/gi, '');
}

/** Highlight fields that are RecordsHub/connector bookkeeping, not searchable content — skipped
 * when choosing a snippet. `parentReference.*` in particular carries the list name we filter on
 * (`parentReference.list.name` = "CORMS_Correspondence"); with `require_field_match: false` ES
 * highlights that filter term too, and on a blank browse it would otherwise be the only fragment
 * and show as a bogus "CORMS_Correspondence" subtitle on every row. */
const SNIPPET_SKIP_FIELD_PREFIXES = ['parentreference', 'contenttype', '_'];

/** CMS-026 AC3 — the first MEANINGFUL highlight fragment (skipping bookkeeping fields), as plain
 * text, or undefined when the hit carries no content highlight (e.g. a match_all listing). */
export function extractHighlightSnippet(hit: IElasticHit): string | undefined {
  const highlight = hit.highlight;
  if (!highlight) return undefined;
  for (const field of Object.keys(highlight)) {
    const lower = field.toLowerCase();
    if (SNIPPET_SKIP_FIELD_PREFIXES.some((prefix) => lower.indexOf(prefix) === 0)) continue;
    const fragments = highlight[field];
    if (Array.isArray(fragments) && fragments.length && fragments[0]) return stripHighlightTags(fragments[0]);
  }
  return undefined;
}

/**
 * CMS-026 AC3 (mock/fallback) — a windowed excerpt of `text` centred on the first case-insensitive
 * occurrence of `term`, with ellipses where it was cut. Used in mock mode (no real OCR body to
 * highlight) so the snippet interaction is reviewable (CMS-025 AC7); returns undefined when the
 * term is blank or not present.
 */
export function buildSnippet(text: string, term: string, radius = 60): string | undefined {
  const body = (text ?? '').trim();
  const needle = (term ?? '').trim().toLowerCase();
  if (!body || !needle) return undefined;
  const idx = body.toLowerCase().indexOf(needle);
  if (idx === -1) return undefined;
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + needle.length + radius);
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`;
}

/** Adds the `ApiKey ` scheme prefix unless the configured value already carries a scheme. */
export function buildAuthHeader(apiKey: string): string | undefined {
  const key = (apiKey ?? '').trim();
  if (!key) return undefined;
  return /^apikey\s/i.test(key) ? key : `ApiKey ${key}`;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map((v) => String(v)).join('; ');
  const s = String(value);
  return s.length ? s : undefined;
}

/** Record docs put their metadata under `fields.*` (see the doc's Indices table); flat docs put it
 * at the root. Merge both so a single candidate-key lookup finds either shape. Exported so the
 * task mapper (elasticTaskQuery.ts) reads per-site hits the same way. */
export function flattenSource(source: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!source) return {};
  const nested = source.fields;
  return typeof nested === 'object' && nested !== null ? { ...source, ...(nested as Record<string, unknown>) } : { ...source };
}

/** First candidate key that resolves to a non-empty string. Exported for reuse by the task mapper. */
export function pickField(src: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const found = asString(src[key]);
    if (found !== undefined) return found;
  }
  return undefined;
}

function mapDirection(raw: string | undefined): CorrespondenceDirection {
  if (raw === 'Outgoing') return 'Outgoing';
  if (raw === 'External') return 'External';
  return 'Incoming';
}

/**
 * Maps one Elasticsearch hit to the correspondence row shape the Search grid renders. Field names
 * are probed defensively (SharePoint column name first, then a camelCase form) so the mapping keeps
 * working whether the index stores raw CORMS_Correspondence columns or a normalized projection —
 * adjust the candidate lists here if the live index uses different names.
 */
export function mapElasticHitToCorrespondence(hit: IElasticHit): ICorrespondenceStub {
  const src = flattenSource(hit._source);
  const security = pickField(src, ['SecurityLevel', 'securityLevel', 'RH_SecurityLevel', 'securityTier']);
  const securityTier = security ? Number(security) || securityLevelToTier(security) : 1;
  const created = pickField(src, ['DateCreated', 'createdAt', 'Created', 'created', 'createdDateTime']);
  return {
    id: pickField(src, ['ItemId', 'ItemID', 'CorrespondenceId', 'Id', 'id']) ?? hit._id ?? '',
    referenceNumber: pickField(src, ['ReferenceNo', 'referenceNumber', 'RH_ReferenceNo']) ?? '',
    subject: pickField(src, ['Title', 'Subject', 'subject']) ?? '',
    type: pickField(src, ['CorrespondenceType', 'ContentTypeName', 'type']) ?? '',
    direction: mapDirection(pickField(src, ['Direction', 'direction'])),
    status: mapStatus(pickField(src, ['Status', 'status'])),
    priority: pickField(src, ['Priority', 'priority']) === 'High' ? 'High' : 'Normal',
    securityTier,
    department: pickField(src, ['DestinationDepartments', 'Department', 'department']) ?? '',
    createdAt: created ? created.slice(0, 10) : '',
    senderName: pickField(src, ['Sender', 'senderName', 'SenderName']),
    recipientName: pickField(src, ['Recipient', 'recipientName', 'RecipientName']),
    dueDate: pickField(src, ['DueDate', 'dueDate']),
    // CMS-026 AC3 — the matched-keyword snippet from the ES highlight (undefined for match_all).
    searchSnippet: extractHighlightSnippet(hit),
  };
}

/**
 * The Search screen's structured filters (status / security level / team / date range), applied
 * client-side. Shared by the mock and the live transport so both honour exactly the same rules —
 * live applies them after mapping because the index's own filter-field names aren't known.
 */
export function correspondenceMatchesFilters(item: ICorrespondenceStub, filters: Record<string, string>): boolean {
  if (filters.status && item.status !== filters.status) return false;
  if (filters.securityLevel && String(item.securityTier) !== filters.securityLevel) return false;
  if (filters.team && item.department !== filters.team) return false;
  if (filters.dateFrom && item.createdAt < filters.dateFrom) return false;
  if (filters.dateTo && item.createdAt > filters.dateTo) return false;
  // CMS-025 AC1 — the metadata filter set. Free-text fields (Reference No., Subject, Sender,
  // Recipient) match as case-insensitive substrings; Type and Priority match exactly.
  if (!includesText(item.referenceNumber, filters.referenceNo)) return false;
  if (!includesText(item.subject, filters.subject)) return false;
  if (!includesText(item.senderName, filters.sender)) return false;
  if (!includesText(item.recipientName, filters.recipient)) return false;
  if (filters.type && item.type !== filters.type) return false;
  if (filters.priority && item.priority !== filters.priority) return false;
  return true;
}

/** True when `filter` is blank, or `value` contains it case-insensitively. */
function includesText(value: string | undefined, filter: string | undefined): boolean {
  if (!filter) return true;
  return (value ?? '').toLowerCase().indexOf(filter.toLowerCase()) !== -1;
}
