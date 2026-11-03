import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IGlobalAuditEntry } from '../../models/IAuditTrail';
import { ELASTIC_CONFIG_KEYS, isAuditingEnabled } from '../elastic/elasticQuery';
import { IAuditEntryFilters, IAuditTrailService } from '../interfaces/IAuditTrailService';
import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import { readAdminConfigValues } from '../recordsHubConfig/recordsHubConfig';
import { resolveAuditCategory } from '../common/auditCategory';
import { AuditFetch, AuditTrailServiceCore } from './AuditTrailServiceCore';

const DEFAULT_AUDIT_INDEX = 'sslaudit';

/**
 * Resolves the Elasticsearch connection from CORMS_AdminConfig for each operation, so endpoint,
 * key, or audit-index changes take effect without a redeploy. Acting-user and site enrichment is
 * derived from trusted SPFx context rather than caller-supplied audit text.
 *
 * Auditing has a single master on/off switch (integration.auditingEnabled). When the admin turns
 * it off, logEvent becomes a no-op — nothing is written to Elasticsearch (and, since the SharePoint
 * audit list is retired, nothing is written there either). Reads still return whatever history
 * already exists, so turning auditing off never hides the record of what happened while it was on.
 */
export class AuditTrailServiceLive implements IAuditTrailService {
  constructor(
    private readonly context: WebPartContext,
    private readonly devSettings: IDevSettingsService,
    private readonly fetchOverride?: AuditFetch
  ) {}

  private coreFrom(values: Record<string, string>): AuditTrailServiceCore {
    return new AuditTrailServiceCore(
      {
        endpoint: values[ELASTIC_CONFIG_KEYS.endpoint] ?? '',
        apiKey: values[ELASTIC_CONFIG_KEYS.apiKey] ?? '',
        index: (values[ELASTIC_CONFIG_KEYS.auditIndex] ?? '').trim() || DEFAULT_AUDIT_INDEX,
        userName: this.context.pageContext.user.displayName,
        userEmail: this.context.pageContext.user.email,
        siteUrl: this.context.pageContext.web.absoluteUrl,
      },
      this.fetchOverride
    );
  }

  public async getEntries(filters?: IAuditEntryFilters): Promise<IGlobalAuditEntry[]> {
    const values = await readAdminConfigValues(this.devSettings);
    return this.coreFrom(values).getEntries(filters);
  }

  public async logEvent(entry: {
    objectId: string;
    actor: string;
    action: string;
    details: string;
    timestamp: string;
  }): Promise<IGlobalAuditEntry> {
    const values = await readAdminConfigValues(this.devSettings);
    // Master switch: when auditing is disabled, record nothing anywhere. Return a benign,
    // un-persisted entry (no id) so fire-and-forget callers keep working unchanged.
    if (!isAuditingEnabled(values)) {
      return {
        id: '',
        seq: 0,
        objectId: String(entry.objectId),
        actor: entry.actor,
        action: entry.action,
        details: entry.details,
        timestamp: entry.timestamp || new Date().toISOString(),
        category: resolveAuditCategory(entry.action),
        chainStatus: 'valid',
      };
    }
    return this.coreFrom(values).logEvent(entry);
  }

  public async getReassignmentsInvolving(userId: string): Promise<IGlobalAuditEntry[]> {
    const values = await readAdminConfigValues(this.devSettings);
    return this.coreFrom(values).getReassignmentsInvolving(userId);
  }
}
