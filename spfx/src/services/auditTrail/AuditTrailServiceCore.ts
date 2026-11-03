import { IGlobalAuditEntry, AuditCategory, AuditChainStatus } from '../../models/IAuditTrail';
import { AUDIT_CHOICE_TO_CATEGORY, resolveAuditCategory } from '../common/auditCategory';
import { IAuditEntryFilters } from '../interfaces/IAuditTrailService';

const DEFAULT_AUDIT_INDEX = 'sslaudit';
const DEFAULT_RESULT_LIMIT = 2000;
const MAX_RESULT_LIMIT = 10000;
const CORMS_APPLICATION = 'CORMS';

export interface IAuditElasticConfig {
  endpoint: string;
  apiKey?: string;
  index?: string;
  userName?: string;
  userEmail?: string;
  siteUrl?: string;
}

export interface IAuditElasticHit {
  _id?: string;
  _source?: Record<string, unknown>;
}

export interface IAuditElasticSearchFilters extends IAuditEntryFilters {
  /** Trusted site scope supplied by the live wrapper, never by the calling UI. */
  siteUrl?: string;
}

interface IAuditSearchResponse {
  hits?: {
    hits?: IAuditElasticHit[];
  };
}

interface IAuditCreateResponse {
  _id?: string;
}

export type AuditFetch = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

function stringValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const values = value.map(stringValue).filter((item): item is string => item !== undefined);
    return values.length ? values.join('; ') : undefined;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return stringValue(record.Title ?? record.title ?? record.displayName ?? record.name);
  }
  const result = String(value);
  return result.length ? result : undefined;
}

function detailsValue(value: unknown): string | undefined {
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }
  return stringValue(value);
}

function flattenSource(source: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!source) return {};
  const fields = source.fields;
  return typeof fields === 'object' && fields !== null
    ? { ...source, ...(fields as Record<string, unknown>) }
    : { ...source };
}

function pickField(
  source: Record<string, unknown>,
  candidates: string[],
  converter: (value: unknown) => string | undefined = stringValue
): string | undefined {
  for (const candidate of candidates) {
    const exact = converter(source[candidate]);
    if (exact !== undefined) return exact;
  }

  const sourceKeys = Object.keys(source);
  for (const candidate of candidates) {
    const actualKey = sourceKeys.find((key) => key.toLowerCase() === candidate.toLowerCase());
    if (actualKey) {
      const value = converter(source[actualKey]);
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function mapCategory(raw: string | undefined, action: string): AuditCategory {
  if (raw === 'correspondence' || raw === 'system' || raw === 'access') return raw;
  return AUDIT_CHOICE_TO_CATEGORY[raw ?? ''] ?? resolveAuditCategory(action);
}

function mapChainStatus(raw: string | undefined): AuditChainStatus {
  return (raw ?? '').toLowerCase() === 'broken' ? 'broken' : 'valid';
}

/**
 * Maps both the current CORMS/RecordsHub document and historical projected/SharePoint-shaped
 * documents. Elasticsearch `_id` is the row identity. `seq` is retained only as a display value:
 * an explicit legacy source sequence wins, otherwise the caller supplies the result-page rank.
 */
export function mapAuditHit(hit: IAuditElasticHit, presentationRank: number): IGlobalAuditEntry {
  const source = flattenSource(hit._source);
  const action = pickField(source, ['action', 'Action']) ?? '';
  const sourceSeq = Number(pickField(source, ['seq', 'Seq', 'Id', 'ID']));
  return {
    id: hit._id ?? '',
    seq: Number.isFinite(sourceSeq) && sourceSeq > 0 ? sourceSeq : presentationRank,
    // `objectId` / `entity_id_record` carry the CORMS id as a string (any shape). The shared
    // sslaudit index also types `entity_id` as a numeric `long`, so it only ever holds a numeric
    // id — read it last, purely as a fallback for legacy numeric-only rows.
    objectId: pickField(source, ['objectId', 'entity_id_record', 'entityId', 'ObjectId', 'entity_id']) ?? '',
    actor: pickField(source, ['userName', 'username', 'actor', 'Actor', 'user']) ?? '',
    action,
    details: pickField(source, ['Details', 'details'], detailsValue) ?? '',
    timestamp: pickField(source, ['timestamp', 'Created', 'created', 'createdAt']) ?? '',
    category: mapCategory(pickField(source, ['category', 'Category']), action),
    chainStatus: mapChainStatus(pickField(source, ['chainStatus', 'ChainStatus'])),
  };
}

function exactTerm(field: string, value: string): Record<string, unknown> {
  return {
    bool: {
      should: [{ term: { [field]: value } }, { term: { [`${field}.keyword`]: value } }],
      minimum_should_match: 1,
    },
  };
}

function exactTermAcross(fields: string[], value: string): Record<string, unknown> {
  return {
    bool: {
      should: fields.map((field) => exactTerm(field, value)),
      minimum_should_match: 1,
    },
  };
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_RESULT_LIMIT;
  return Math.min(MAX_RESULT_LIMIT, Math.max(0, Math.floor(value)));
}

/** Whole-integer test — the sslaudit `entity_id` field is a numeric `long`, so a term on it is
 * only added (read) or the field only written when the CORMS id is actually an integer. Passing a
 * non-numeric string to a `long` field makes Elasticsearch reject the whole request with a 400. */
function numericId(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/** Match a CORMS object id across the string identity fields we write (`objectId`,
 * `entity_id_record`) and, only when the id is numeric, the shared index's `long` `entity_id`. */
function objectIdClause(value: string): Record<string, unknown> {
  const should: Record<string, unknown>[] = [exactTerm('objectId', value), exactTerm('entity_id_record', value)];
  const numeric = numericId(value);
  if (numeric !== undefined) should.push({ term: { entity_id: numeric } });
  return { bool: { should, minimum_should_match: 1 } };
}

/** Build the exact, CORMS-scoped query used by every audit read. */
export function buildAuditSearchBody(filters: IAuditElasticSearchFilters = {}): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [
    // Every CORMS document is tagged application:'CORMS'. This is the sole scope discriminator: the
    // shared sslaudit index holds RecordsHub file/record events that carry no such tag.
    exactTerm('application', CORMS_APPLICATION),
  ];
  if (filters.siteUrl) clauses.push(exactTermAcross(['SiteUrl', 'siteUrl'], filters.siteUrl));
  if (filters.objectId) clauses.push(objectIdClause(filters.objectId));
  if (filters.action) clauses.push(exactTermAcross(['action', 'Action'], filters.action));

  return {
    size: normalizeLimit(filters.limit),
    query: { bool: { filter: clauses } },
    sort: [{ timestamp: { order: 'desc', missing: '_last', unmapped_type: 'date' } }],
  };
}

function buildAuthHeader(apiKey: string | undefined): string | undefined {
  const key = (apiKey ?? '').trim();
  if (!key) return undefined;
  return /^apikey\s/i.test(key) ? key : `ApiKey ${key}`;
}

function describeResponse(response: Response): string {
  return `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;
}

/** Pure, fetch-based Elasticsearch audit transport with no SharePoint dependency. */
export class AuditTrailServiceCore {
  private readonly endpoint: string;
  private readonly index: string;

  constructor(
    private readonly config: IAuditElasticConfig,
    private readonly fetchImpl?: AuditFetch,
    private readonly now: () => Date = () => new Date()
  ) {
    this.endpoint = (config.endpoint ?? '').trim().replace(/\/+$/, '');
    this.index = (config.index ?? '').trim() || DEFAULT_AUDIT_INDEX;
  }

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    const authorization = buildAuthHeader(this.config.apiKey);
    if (!authorization) {
      throw new Error('AuditTrailServiceCore: integration.elasticApiKey is not configured.');
    }
    headers.Authorization = authorization;
    return headers;
  }

  private get indexUrl(): string {
    if (!this.endpoint)
      throw new Error('AuditTrailServiceCore: integration.elasticEndpoint is not configured.');
    return `${this.endpoint}/${encodeURIComponent(this.index)}`;
  }

  private get request(): AuditFetch {
    if (this.fetchImpl) return this.fetchImpl;
    const globalFetch = globalThis.fetch as AuditFetch | undefined;
    if (!globalFetch)
      throw new Error('AuditTrailServiceCore: Fetch API is not available in this environment.');
    // The browser's native fetch must run with `this` === the global object. Calling it via
    // `this.request(...)` would otherwise bind `this` to this service instance and throw
    // "Failed to execute 'fetch' on 'Window': Illegal invocation". Binding here makes the
    // returned function immune to how the call site invokes it.
    return globalFetch.bind(globalThis) as AuditFetch;
  }

  public async getEntries(filters: IAuditEntryFilters = {}): Promise<IGlobalAuditEntry[]> {
    const response = await this.request(`${this.indexUrl}/_search`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(buildAuditSearchBody({ ...filters, siteUrl: this.config.siteUrl })),
      mode: 'cors',
    });
    if (!response.ok) throw new Error(`Elasticsearch audit search failed: ${describeResponse(response)}`);

    const body = (await response.json()) as IAuditSearchResponse;
    const hits = body.hits?.hits ?? [];
    return hits.map((hit, index) => mapAuditHit(hit, hits.length - index));
  }

  public async logEvent(entry: {
    objectId: string;
    actor: string;
    action: string;
    details: string;
    timestamp: string;
  }): Promise<IGlobalAuditEntry> {
    const timestamp = this.now().toISOString();
    const category = resolveAuditCategory(entry.action);
    const userName = (this.config.userName ?? '').trim() || entry.actor;
    const objectId = String(entry.objectId);
    const numeric = numericId(objectId);
    const document = {
      timestamp,
      action: entry.action,
      // application is the CORMS scope tag every read filters on. objectId / entity_id_record hold
      // the CORMS id as a string of ANY shape; entity_id (a numeric `long` on the shared sslaudit
      // index) is written only when the id is a whole number, since a string would 400 the write.
      application: CORMS_APPLICATION,
      objectId,
      entity_id_record: objectId,
      ...(numeric !== undefined ? { entity_id: numeric } : {}),
      Details: entry.details,
      userName,
      userEmail: this.config.userEmail ?? '',
      SiteUrl: this.config.siteUrl ?? '',
      category,
      chainStatus: 'valid' as AuditChainStatus,
    };
    const response = await this.request(`${this.indexUrl}/_doc`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(document),
      mode: 'cors',
    });
    if (!response.ok) throw new Error(`Elasticsearch audit write failed: ${describeResponse(response)}`);

    const created = (await response.json()) as IAuditCreateResponse;
    if (!created._id)
      throw new Error('Elasticsearch audit write succeeded without returning a document _id.');
    return {
      id: created._id,
      // A just-created ES document has no global sequence. The read side assigns presentation rank;
      // zero explicitly represents "not ranked in a result page yet" rather than inventing one.
      seq: 0,
      objectId: String(entry.objectId),
      actor: userName,
      action: entry.action,
      details: entry.details,
      timestamp,
      category,
      chainStatus: 'valid',
    };
  }

  public async getReassignmentsInvolving(userId: string): Promise<IGlobalAuditEntry[]> {
    const entries = await this.getEntries({
      action: 'Correspondence Reassigned',
      limit: DEFAULT_RESULT_LIMIT,
    });
    return entries.filter((entry) => {
      try {
        return String((JSON.parse(entry.details) as { fromUserId?: unknown }).fromUserId ?? '') === userId;
      } catch {
        return false;
      }
    });
  }
}
