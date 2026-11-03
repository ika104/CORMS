import { SPHttpClient } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { INumberingService } from '../interfaces/INumberingService';
import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import { INumberingRequest, INumberingResult } from '../../models/ICorrespondenceMetadata';
import {
  computeNumberingUpdate,
  findListIdByServerRelativeUrl,
  IListEndpoint,
  parseSharePointListUrl,
  readAdminConfigValues,
  resolveNumberingRecordId,
  shouldResetNumberingForYear,
  RECORDS_HUB_CONFIG_KEYS,
} from '../recordsHubConfig/recordsHubConfig';
import { toContentTypeCode, toFunctionCode } from './referenceCodes';

interface ISeriesListItem {
  Id: number;
  Title: string;
  LastSerial: number;
}

type RawItem = Record<string, unknown>;

function pad3(n: number): string {
  const s = String(n);
  return s.length >= 3 ? s : '0'.repeat(3 - s.length) + s;
}

// Live SP REST implementation of ds.numbering (D-03). Preferred path (Part 2 of the
// RecordsHub-integration task): read the single RH_RMNumberings record configured in
// CORMS_AdminConfig (list URL + record id), expand its Pattern with the incremented counter, then
// write the counter back to that same record so the next number is correct. The RecordsHub list is
// a different site collection, so writes carry that web's own form digest. Falls back to the
// original per-series CORMS_Numbering counter only when the numbering record isn't configured yet,
// so existing environments keep working.
export class NumberingServiceLive implements INumberingService {
  constructor(
    private readonly context: WebPartContext,
    private readonly devSettings: IDevSettingsService,
    private readonly siteUrl: string,
    private readonly listName: string = 'CORMS_Numbering'
  ) {}

  public async issueReferenceNumber(request: INumberingRequest): Promise<INumberingResult> {
    if (request.threadReferenceNumber) {
      const revisionMatch = /-R(\d+)$/.exec(request.threadReferenceNumber);
      const nextRevision = revisionMatch ? Number(revisionMatch[1]) + 1 : 1;
      const base = request.threadReferenceNumber.replace(/-R\d+$/, '');
      return { referenceNumber: `${base}-R${nextRevision}` };
    }

    const values = await readAdminConfigValues(this.devSettings);
    const endpoint = parseSharePointListUrl(values[RECORDS_HUB_CONFIG_KEYS.numberingListUrl]);
    const recordId = resolveNumberingRecordId(values, request.direction);
    if (endpoint && recordId) {
      return { referenceNumber: await this.generateFromRecord(endpoint, recordId, request) };
    }
    return { referenceNumber: await this.generateFromLegacySeries(request) };
  }

  /** Fetches the configured RH_RMNumberings record (by Title, or numeric Id), renders its Pattern
   * with (LastCounter + Increment) plus the correspondence's function/content codes, then persists
   * that incremented counter back to the same record. The list is reached by GUID (case-insensitive
   * and rename-proof) rather than getList(url), which is case-sensitive and 404s when the cross-site
   * proxy lowercases the URL. */
  private async generateFromRecord(endpoint: IListEndpoint, recordId: string, request: INumberingRequest): Promise<string> {
    const listGuid = await this.resolveListGuid(endpoint);
    const record = await this.fetchNumberingRecord(endpoint.webUrl, listGuid, recordId);

    // CMS AC9 — the serial restarts each calendar year. CORMS owns the per-series "last issued year"
    // marker (CORMS_NumberingState, this site) because RH_RMNumberings carries no year column.
    const currentYear = new Date().getFullYear();
    const seriesKey = this.numberingSeriesKey(recordId, request.direction);
    const marker = await this.getYearMarker(seriesKey);
    // Reset ONLY when a stored marker positively shows a different year. A MISSING marker (row not
    // created yet, or CORMS_NumberingState not provisioned) must NOT reset — otherwise every number
    // restarts at the first serial. In that case numbering just increments via the RH counter, and
    // per-year reset activates once the state list exists.
    const resetToYearStart = shouldResetNumberingForYear(marker?.year, currentYear);

    const { referenceNumber, counterKey, nextCounter } = computeNumberingUpdate(
      record,
      {
        functionCode: toFunctionCode(request.originatingFunction),
        contentCode: toContentTypeCode(request.contentType),
      },
      undefined,
      { resetToYearStart }
    );
    await this.updateNumberingCounter(endpoint.webUrl, listGuid, Number(record.Id), counterKey, nextCounter);
    // Keep the marker at the current year so a future rollover is detected — creating the row on
    // first use. Written only after the counter write succeeds; best-effort, so a missing state list
    // simply leaves per-year reset inactive (numbering keeps incrementing) rather than failing.
    await this.setYearMarker(seriesKey, currentYear, marker?.id).catch(() => undefined);
    return referenceNumber;
  }

  /** One marker per numbering series (per record + direction) so each resets independently. */
  private numberingSeriesKey(recordId: string, direction: INumberingRequest['direction']): string {
    return `${recordId}::${direction}`;
  }

  private async resolveListGuid(endpoint: IListEndpoint): Promise<string> {
    const url = `${endpoint.webUrl}/_api/web/lists?$select=Id,RootFolder/ServerRelativeUrl&$expand=RootFolder&$top=2000`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(`Failed to enumerate lists on ${endpoint.webUrl}: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { value: Array<{ Id?: string; RootFolder?: { ServerRelativeUrl?: string } }> };
    const listId = findListIdByServerRelativeUrl(body.value, endpoint.listServerRelativeUrl);
    if (!listId) {
      throw new Error(`Numbering list ${endpoint.listServerRelativeUrl} was not found on ${endpoint.webUrl}.`);
    }
    return listId;
  }

  private async fetchNumberingRecord(webUrl: string, listGuid: string, recordId: string): Promise<RawItem> {
    const filter = /^\d+$/.test(recordId)
      ? `Id eq ${recordId}`
      : `Title eq '${recordId.replace(/'/g, "''")}'`;
    const url = `${webUrl}/_api/web/lists(guid'${listGuid}')/items?$top=1&$filter=${encodeURIComponent(filter)}`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(`Failed to read numbering record '${recordId}': ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { value?: RawItem[] };
    const record = body.value?.[0];
    if (!record || record.Id === undefined) {
      throw new Error(`Numbering record '${recordId}' was not found in the configured list.`);
    }
    return record;
  }

  private async updateNumberingCounter(
    webUrl: string,
    listGuid: string,
    itemId: number,
    counterKey: string,
    nextCounter: number
  ): Promise<void> {
    // RecordsHub is a separate site collection, so use that web's own request digest for the write.
    const digest = await this.getRequestDigest(webUrl);
    const response = await this.context.spHttpClient.post(
      `${webUrl}/_api/web/lists(guid'${listGuid}')/items(${itemId})`,
      SPHttpClient.configurations.v1,
      {
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
          'IF-MATCH': '*',
          'X-HTTP-Method': 'MERGE',
          'X-RequestDigest': digest,
        },
        body: JSON.stringify({ [counterKey]: nextCounter }),
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to increment numbering record ${itemId}: ${response.status} ${response.statusText}`);
    }
  }

  private async getRequestDigest(webUrl: string): Promise<string> {
    const response = await this.context.spHttpClient.post(`${webUrl}/_api/contextinfo`, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(`Failed to get request digest for ${webUrl}: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { FormDigestValue?: string };
    if (!body.FormDigestValue) {
      throw new Error(`No FormDigestValue returned for ${webUrl}.`);
    }
    return body.FormDigestValue;
  }

  // ---- Per-series year marker (CORMS_NumberingState on CORMS's own site, AC9) ----

  private numberingStateUrl(suffix = ''): string {
    return `${this.siteUrl}/_api/web/lists/getbytitle('CORMS_NumberingState')/items${suffix}`;
  }

  private async getYearMarker(seriesKey: string): Promise<{ id: number; year: number } | undefined> {
    const url = `${this.numberingStateUrl()}?$select=Id,LastYear&$filter=${encodeURIComponent(
      `Title eq '${seriesKey.replace(/'/g, "''")}'`
    )}&$top=1`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      // Not-yet-provisioned list (or transient) => treat as "no marker": the counter resets once,
      // then the marker is written, so this self-heals rather than failing number issuance.
      return undefined;
    }
    const body = (await response.json()) as { value?: Array<{ Id: number; LastYear?: number }> };
    const row = body.value?.[0];
    return row ? { id: row.Id, year: Number(row.LastYear) } : undefined;
  }

  private async setYearMarker(seriesKey: string, year: number, existingId?: number): Promise<void> {
    if (existingId !== undefined) {
      await this.context.spHttpClient.post(this.numberingStateUrl(`(${existingId})`), SPHttpClient.configurations.v1, {
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
          'IF-MATCH': '*',
          'X-HTTP-Method': 'MERGE',
        },
        body: JSON.stringify({ LastYear: year }),
      });
      return;
    }
    await this.context.spHttpClient.post(this.numberingStateUrl(), SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
      },
      body: JSON.stringify({ Title: seriesKey, LastYear: year }),
    });
  }

  // ---- Legacy per-series fallback (CORMS_Numbering on CORMS's own site) ----

  private async generateFromLegacySeries(request: INumberingRequest): Promise<string> {
    const year = new Date().getFullYear() % 100;
    const seriesKey = `${request.direction}-${year}`;
    const nextSerial = await this.incrementSeries(seriesKey);
    const funcCode = toFunctionCode(request.originatingFunction);
    const docCode = toContentTypeCode(request.contentType);
    return `OQ8-${funcCode}-${docCode}-${year}-${pad3(nextSerial)}`;
  }

  private async incrementSeries(seriesKey: string): Promise<number> {
    const existing = await this.getSeriesItem(seriesKey);
    if (!existing) {
      await this.createSeriesItem(seriesKey);
      return 1;
    }
    const nextSerial = existing.LastSerial + 1;
    await this.updateSeriesItem(existing.Id, nextSerial);
    return nextSerial;
  }

  private async getSeriesItem(seriesKey: string): Promise<ISeriesListItem | undefined> {
    const url =
      `${this.siteUrl}/_api/web/lists/getbytitle('${this.listName}')/items` +
      `?$select=Id,Title,LastSerial&$filter=${encodeURIComponent(`Title eq '${seriesKey}'`)}`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(`Failed to read ${this.listName}: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { value: ISeriesListItem[] };
    return body.value[0];
  }

  private async createSeriesItem(seriesKey: string): Promise<void> {
    const url = `${this.siteUrl}/_api/web/lists/getbytitle('${this.listName}')/items`;
    const response = await this.context.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
      },
      body: JSON.stringify({ Title: seriesKey, LastSerial: 1 }),
    });
    if (!response.ok) {
      throw new Error(`Failed to create series ${seriesKey}: ${response.status} ${response.statusText}`);
    }
  }

  private async updateSeriesItem(id: number, lastSerial: number): Promise<void> {
    const url = `${this.siteUrl}/_api/web/lists/getbytitle('${this.listName}')/items(${id})`;
    const response = await this.context.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'IF-MATCH': '*',
        'X-HTTP-Method': 'MERGE',
      },
      body: JSON.stringify({ LastSerial: lastSerial }),
    });
    if (!response.ok) {
      throw new Error(`Failed to update series (item ${id}): ${response.status} ${response.statusText}`);
    }
  }
}
