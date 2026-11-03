import { IGlobalAuditEntry } from '../../../../models/IAuditTrail';
import { IAuditEntryFilters, IAuditTrailService } from '../../../interfaces/IAuditTrailService';

/** Small deterministic audit-store fake. Keeping this outside fakeSp makes any accidental
 * CORMS_AuditLog access in correspondence-detail tests visible instead of silently succeeding. */
export class InMemoryAuditTrailService implements IAuditTrailService {
  public readonly queries: IAuditEntryFilters[] = [];
  public entries: IGlobalAuditEntry[];

  constructor(entries: IGlobalAuditEntry[] = []) {
    this.entries = entries.map((entry) => ({ ...entry }));
  }

  public getEntries(query: IAuditEntryFilters = {}): Promise<IGlobalAuditEntry[]> {
    this.queries.push({ ...query });
    let matches = this.entries.filter(
      (entry) =>
        (!query.objectId || entry.objectId === query.objectId) &&
        (!query.action || entry.action === query.action)
    );
    if (query.limit !== undefined) matches = matches.slice(0, query.limit);
    return Promise.resolve(matches.map((entry) => ({ ...entry })));
  }

  public logEvent(entry: {
    objectId: string;
    actor: string;
    action: string;
    details: string;
    timestamp: string;
  }): Promise<IGlobalAuditEntry> {
    const seq = this.entries.reduce((highest, existing) => Math.max(highest, existing.seq), 0) + 1;
    const created: IGlobalAuditEntry = {
      id: `audit-${seq}`,
      seq,
      category: 'correspondence',
      chainStatus: 'valid',
      ...entry,
    };
    this.entries.push(created);
    return Promise.resolve({ ...created });
  }

  public getReassignmentsInvolving(userId: string): Promise<IGlobalAuditEntry[]> {
    return Promise.resolve(
      this.entries.filter((entry) => {
        try {
          return (JSON.parse(entry.details) as { fromUserId?: string }).fromUserId === userId;
        } catch {
          return false;
        }
      })
    );
  }
}
