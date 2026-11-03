import { AuditCategory } from '../../models/IAuditTrail';

/**
 * The action -> audit-section mapping is "defined and maintained by CORMS" per CMS-045's story — a
 * simple action-prefix table, not an admin-editable one. Shared by AuditTrailServiceMock and the
 * live AuditTrailServiceCore so mock and live mode can never categorize the same action
 * differently; adding a prefix here changes both at once.
 *
 * Order matters: first matching prefix wins. Everything unmatched (Viewed Tab, Config Updated,
 * Translation Updated, Workflow Rule Updated, ...) falls under "System & Configuration Events".
 */
const CATEGORY_PREFIX_MAP: { prefix: string; category: AuditCategory }[] = [
  { prefix: 'Correspondence', category: 'correspondence' },
  { prefix: 'Login', category: 'access' },
  { prefix: 'Permission', category: 'access' },
  { prefix: 'Delegation', category: 'access' },
  { prefix: 'Access Denied', category: 'access' },
  { prefix: 'Clearance', category: 'access' },
];

export function resolveAuditCategory(action: string): AuditCategory {
  const match = CATEGORY_PREFIX_MAP.find((m) => action.indexOf(m.prefix) === 0);
  return match?.category ?? 'system';
}

/** Legacy CORMS_AuditLog choice values <-> the AuditCategory the UI models. Retained by the
 * Elasticsearch mapper so backfilled or projected history keeps its original category. */
export const AUDIT_CATEGORY_TO_CHOICE: Record<AuditCategory, string> = {
  correspondence: 'CorrespondenceActions',
  system: 'SystemConfig',
  access: 'AccessSecurity',
};

export const AUDIT_CHOICE_TO_CATEGORY: Record<string, AuditCategory> = {
  CorrespondenceActions: 'correspondence',
  SystemConfig: 'system',
  AccessSecurity: 'access',
};

/** Display id for an audit entry — zero-padded to four digits, e.g. seq 7 -> "AUD-0007". */
export function formatAuditEntryId(seq: number): string {
  const seqStr = String(seq);
  return `AUD-${'0000'.slice(seqStr.length) + seqStr}`;
}
