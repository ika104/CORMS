import { CorrespondencePriority, ICorrespondenceStub, SECURITY_TIERS, STATUS_CONFIG } from '../../models/ICorrespondence';
import { IFolderCriteria } from '../../models/IFolder';
import { IRecordClassification } from '../../models/ICorrespondenceMetadata';

/** Priority is a translated value everywhere else in the app (the Create Correspondence
 * form owns the canonical keys) — reuse those rather than leaking the raw enum token, which
 * would otherwise render as English inside an Arabic sentence. */
export function priorityLabel(priority: CorrespondencePriority, t: (key: string) => string): string {
  return priority === 'High' ? t('createCorrespondence.field.high') : t('createCorrespondence.field.normal');
}

/** A custom folder's contents = Inbox items matching ALL set criteria, union pinned ids
 * (§ CMS-054 AC — folders only ever surface Incoming items, matching is done by the caller). */
export function matchesFolderCriteria(item: ICorrespondenceStub, criteria: IFolderCriteria): boolean {
  if (criteria.status && item.status !== criteria.status) return false;
  if (typeof criteria.securityTier === 'number' && item.securityTier !== criteria.securityTier) return false;
  if (criteria.priority && item.priority !== criteria.priority) return false;
  if (criteria.recordClassificationId && item.recordClassificationId !== criteria.recordClassificationId) return false;
  if (criteria.sender && !(item.senderName || '').toLowerCase().includes(criteria.sender.toLowerCase())) return false;
  return true;
}

export function folderCriteriaSummary(
  criteria: IFolderCriteria,
  t: (key: string, options?: Record<string, unknown>) => string,
  recordClassifications: IRecordClassification[]
): string {
  const parts: string[] = [];
  // The display label, not the raw enum token — otherwise 'InReview' surfaces verbatim.
  if (criteria.status) parts.push(STATUS_CONFIG[criteria.status]?.label ?? criteria.status);
  if (typeof criteria.securityTier === 'number') {
    parts.push(SECURITY_TIERS.find((tier) => tier.tier === criteria.securityTier)?.name ?? `Tier ${criteria.securityTier}`);
  }
  if (criteria.priority) parts.push(t('inboxSent.criteria.priority', { priority: priorityLabel(criteria.priority, t) }));
  if (criteria.recordClassificationId) {
    const found = recordClassifications.find((rc) => rc.id === criteria.recordClassificationId);
    if (found) parts.push(found.name);
  }
  if (criteria.sender) parts.push(t('inboxSent.criteria.sender', { sender: criteria.sender }));
  return parts.length ? parts.join(' · ') : t('inboxSent.criteria.allIncoming');
}
