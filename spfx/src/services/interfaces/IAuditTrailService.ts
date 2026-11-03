import { IGlobalAuditEntry } from '../../models/IAuditTrail';

export interface IAuditEntryFilters {
  /** Business object identity stored in Elasticsearch as `entity_id`. */
  objectId?: string;
  /** Exact audit action. */
  action?: string;
  /** Maximum number of newest entries to return. */
  limit?: number;
}

/** CMS-045 — backs the global, org-wide Audit Trail nav screen. Append-only: there is no
 * update/delete, matching the story's "entries are append-only" requirement. */
export interface IAuditTrailService {
  getEntries(filters?: IAuditEntryFilters): Promise<IGlobalAuditEntry[]>;
  /** Appends a new entry. `category` is derived from `action` by the service itself (the
   * story requires the action-to-section mapping to be "defined and maintained by CORMS",
   * not chosen ad hoc by each caller) and `chainStatus` always starts 'valid' for a freshly
   * logged entry — only seed/mock data demonstrates a 'broken' chain. */
  logEvent(entry: {
    objectId: string;
    actor: string;
    action: string;
    details: string;
    timestamp: string;
  }): Promise<IGlobalAuditEntry>;
  /** Delegation & Reassignment Backend task (CMS-019 AC5) — "the original recipient can see it
   * was reassigned away" needs a queryable answer, not just the item's absence from their inbox.
   * Returns every `Correspondence Reassigned` entry whose structured `details` JSON has
   * `fromUserId === userId` (i.e. every correspondence moved away from this user). */
  getReassignmentsInvolving(userId: string): Promise<IGlobalAuditEntry[]>;
}
