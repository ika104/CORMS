import { IAuditEntryFilters, IAuditTrailService } from '../interfaces/IAuditTrailService';
import { IGlobalAuditEntry } from '../../models/IAuditTrail';
import { formatAuditEntryId, resolveAuditCategory } from '../common/auditCategory';
import auditTrailMock from '../../mocks/auditTrail.json';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

// Session-only stand-in for the Elasticsearch audit store. It keeps the same filtering surface as
// the live service while retaining the deterministic fixture sequence used by UI tests.
export class AuditTrailServiceMock implements IAuditTrailService {
  private entries: IGlobalAuditEntry[] = (auditTrailMock as IGlobalAuditEntry[]).map((e) => ({ ...e }));

  public getEntries(filters: IAuditEntryFilters = {}): Promise<IGlobalAuditEntry[]> {
    const limit = filters.limit === undefined ? this.entries.length : Math.max(0, Math.floor(filters.limit));
    const entries = this.entries
      .filter((entry) => !filters.objectId || entry.objectId === filters.objectId)
      .filter((entry) => !filters.action || entry.action === filters.action)
      .sort((a, b) => b.seq - a.seq)
      .slice(0, limit);
    return delay(entries);
  }

  public logEvent(entry: {
    objectId: string;
    actor: string;
    action: string;
    details: string;
    timestamp: string;
  }): Promise<IGlobalAuditEntry> {
    const nextSeq = this.entries.reduce((max, e) => Math.max(max, e.seq), 0) + 1;
    const newEntry: IGlobalAuditEntry = {
      id: formatAuditEntryId(nextSeq),
      seq: nextSeq,
      category: resolveAuditCategory(entry.action),
      chainStatus: 'valid',
      ...entry,
    };
    this.entries = [...this.entries, newEntry];
    return delay(newEntry);
  }

  public getReassignmentsInvolving(userId: string): Promise<IGlobalAuditEntry[]> {
    const matches = this.entries.filter((e) => {
      if (e.action !== 'Correspondence Reassigned') return false;
      try {
        return (JSON.parse(e.details) as { fromUserId?: string }).fromUserId === userId;
      } catch {
        return false;
      }
    });
    return delay([...matches].sort((a, b) => b.seq - a.seq));
  }
}
