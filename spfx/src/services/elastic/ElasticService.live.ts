import { IElasticSearchResult, IElasticService } from '../interfaces/IElasticService';
import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import { readAdminConfigValues } from '../recordsHubConfig/recordsHubConfig';
import { parseSearchQuery } from '../../modules/search/searchQuery';
import {
  buildAuthHeader,
  buildElasticSearchBody,
  correspondenceMatchesFilters,
  hitMatchesList,
  isContentIndex,
  mapElasticHitToCorrespondence,
  resolveSiteContentIndex,
  DEFAULT_SHAREPOINT_SITES_INDEX,
  ELASTIC_CONFIG_KEYS,
  ELASTIC_SEARCH_SIZE,
  IElasticHit,
  ISiteRegistryHit,
  IElasticSearchResponse,
} from './elasticQuery';
import { mapElasticHitToTask, taskMatchesFilters } from './elasticTaskQuery';

/**
 * Live Elasticsearch transport (ds.search) — calls the Elastic REST API DIRECTLY from the SPFx
 * client, with no .NET layer in between (per the client's decision). Endpoint, API key and the
 * optional target index are read live from CORMS_AdminConfig (integration.elastic*), mirroring the
 * RecordsHub Configurations values; auth is the ES `Authorization: ApiKey <key>` scheme.
 *
 * Uses window.fetch (not spHttpClient): the Elastic host is an arbitrary external server, not
 * SharePoint, and takes its own ApiKey header rather than SharePoint auth. The term is turned into
 * an Elasticsearch query DSL body here (the shared {term, filters} contract with the mock is parsed
 * via parseSearchQuery); the structured filters are applied to the mapped rows client-side, since
 * the index's own filter-field names aren't known — see elasticQuery.ts.
 *
 * NOTE (direct-from-browser): the Elastic server must send CORS headers allowing the SharePoint
 * origin, and the API key is necessarily visible to the client — both are inherent to calling
 * Elastic directly with no server proxy, and were accepted as part of that decision.
 */
export class ElasticServiceLive implements IElasticService {
  /** The resolved per-site content index, cached after the first sharepoint_sites lookup (it does
   * not change within a session). `undefined` = not resolved yet; empty string = resolved to
   * "search all indices" (no site match / not configured). */
  private cachedContentIndex: string | undefined;

  constructor(
    private readonly devSettings: IDevSettingsService,
    /** The CORMS site's absolute URL — used to find this site in the sharepoint_sites registry. */
    private readonly siteUrl?: string
  ) {}

  public async search<T>(index: string, query: string): Promise<IElasticSearchResult<T>> {
    const values = await readAdminConfigValues(this.devSettings);
    const endpoint = (values[ELASTIC_CONFIG_KEYS.endpoint] ?? '').trim().replace(/\/+$/, '');
    const apiKey = values[ELASTIC_CONFIG_KEYS.apiKey] ?? '';
    if (!endpoint) {
      throw new Error(`ElasticServiceLive: ${ELASTIC_CONFIG_KEYS.endpoint} is not set in Admin Config.`);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    const auth = buildAuthHeader(apiKey);
    if (auth) headers.Authorization = auth;

    // Both search types go through Elasticsearch (CMS-025/046). Correspondence and Tasks share the
    // CORMS per-site index; only the list discriminator and the row mapping differ by type.
    const isTasks = index === 'tasks';
    const listName = (values[isTasks ? ELASTIC_CONFIG_KEYS.taskList : ELASTIC_CONFIG_KEYS.correspondenceList] ?? '').trim();

    const { term, filters } = parseSearchQuery(query);
    const contentIndex = await this.resolveContentIndex(endpoint, headers, values);
    // A resolved index scopes the search to CORMS's own content (correct + efficient); a blank
    // resolution falls back to POST /_search across every index (the doc's Advanced Search preview).
    const path = contentIndex ? `/${encodeURIComponent(contentIndex)}/_search` : '/_search';

    const response = await fetch(`${endpoint}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildElasticSearchBody(term, ELASTIC_SEARCH_SIZE, listName)),
      mode: 'cors',
    });
    if (!response.ok) {
      throw new Error(`Elastic search failed: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as IElasticSearchResponse;
    const hits = (body.hits?.hits ?? [])
      // Drop Elasticsearch/connector bookkeeping indices (a blank index searches all of them) so
      // they never surface as "results" — see isContentIndex.
      .filter((hit: IElasticHit) => isContentIndex(hit._index))
      // A RecordsHub per-site index holds items from many lists; keep only the target list
      // (configurable; blank keeps everything) — see hitMatchesList.
      .filter((hit: IElasticHit) => hitMatchesList(hit, listName));

    const items = isTasks
      ? hits.map(mapElasticHitToTask).filter((task) => taskMatchesFilters(task, filters))
      : hits.map(mapElasticHitToCorrespondence).filter((item) => correspondenceMatchesFilters(item, filters));
    return { total: items.length, items: items as unknown as T[] };
  }

  /**
   * Resolves the Elasticsearch index to search:
   *   1. an explicit `integration.elasticIndex` (admin override) wins;
   *   2. otherwise CORMS looks itself up in the `sharepoint_sites` registry by this site's URL and
   *      uses that site's per-site content index (the registry doc's `_id`);
   *   3. otherwise '' — the caller searches all indices (legacy fallback).
   * The result is cached for the instance (it cannot change within a session). A registry lookup
   * failure never throws — search degrades to the all-index fallback instead of erroring.
   */
  private async resolveContentIndex(
    endpoint: string,
    headers: Record<string, string>,
    values: Record<string, string>
  ): Promise<string> {
    const explicit = (values[ELASTIC_CONFIG_KEYS.index] ?? '').trim();
    if (explicit) return explicit;
    if (this.cachedContentIndex !== undefined) return this.cachedContentIndex;
    if (!this.siteUrl) {
      this.cachedContentIndex = '';
      return '';
    }
    const sitesIndex = (values[ELASTIC_CONFIG_KEYS.sitesIndex] ?? '').trim() || DEFAULT_SHAREPOINT_SITES_INDEX;
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(sitesIndex)}/_search`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ size: 1000, query: { match_all: {} } }),
        mode: 'cors',
      });
      if (response.ok) {
        const body = (await response.json()) as { hits?: { hits?: ISiteRegistryHit[] } };
        const resolved = resolveSiteContentIndex(body.hits?.hits ?? [], this.siteUrl);
        this.cachedContentIndex = resolved ?? '';
        return this.cachedContentIndex;
      }
    } catch {
      // fall through to the all-index fallback
    }
    // Do not cache a transient failure — a later search can retry the registry lookup.
    return '';
  }
}
