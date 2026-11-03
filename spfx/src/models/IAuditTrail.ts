/** CMS-045 — the global, org-wide Audit Trail nav screen. Distinct from `IAuditEntry`
 * (ICorrespondenceDetail.ts), which is the per-item Audit tab's narrower row shape scoped to a
 * single correspondence; this one spans every actioned/viewed object in the app. */
export type AuditCategory = 'correspondence' | 'system' | 'access';

/** Pure UI/mock concept here — the real hash-chaining verification is a backend concern.
 * TODO(backend): real chain-status must come from the tamper-evident hash-chain verification,
 * not mock data. */
export type AuditChainStatus = 'valid' | 'broken';

export const AUDIT_CATEGORIES: AuditCategory[] = ['correspondence', 'system', 'access'];

export interface IGlobalAuditEntry {
  id: string;
  seq: number;
  objectId: string;
  actor: string;
  action: string;
  details: string;
  timestamp: string;
  category: AuditCategory;
  chainStatus: AuditChainStatus;
}
