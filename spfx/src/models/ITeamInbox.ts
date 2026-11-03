import { StatusBadgeTone } from '../components/common/StatusBadge';
import { ICorrespondenceStub } from './ICorrespondence';

export type TeamInboxStatus = 'New' | 'InProgress' | 'PendingResponse';

export const TEAM_INBOX_STATUS_CONFIG: Record<TeamInboxStatus, { labelKey: string; tone: StatusBadgeTone }> = {
  New: { labelKey: 'teamInbox.status.new', tone: 'info' },
  InProgress: { labelKey: 'teamInbox.status.inProgress', tone: 'warning' },
  PendingResponse: { labelKey: 'teamInbox.status.pendingResponse', tone: 'purple' },
};

export type TeamInboxPriority = 'Normal' | 'High';

export interface ITeamInboxItem {
  id: string;
  referenceNo: string;
  subject: string;
  type: string;
  priority: TeamInboxPriority;
  /** 1 (Public/Unclassified) .. 5 (Top Secret) — see SECURITY_TIERS in ICorrespondence.ts. */
  securityTier: number;
  status: TeamInboxStatus;
  date: string;
  /** Subordinate currently holding the item. */
  ownerId: string;
}

/**
 * CMS-018 (Subordinate Inboxes) query-side result shape — a real CORMS_Correspondence row
 * (ICorrespondenceStub, from the shared correspondenceList mapper) plus the two Team Inbox
 * projections that have no direct list-side equivalent: which subordinate currently holds it,
 * and a computed three-way display status. Deliberately distinct from ITeamInboxItem above (the
 * earlier UI-only mock shape) rather than replacing it — SubordinateInboxService is the new,
 * real-query-backed source; ITeamInboxItem/TEAM_INBOX_STATUS_CONFIG stay as-is for existing UI
 * consumers.
 */
export interface ITeamInboxQueryItem extends ICorrespondenceStub {
  /** Subordinate currently holding the item (= the row's AssignedTo user id). */
  ownerId: string;
  /**
   * Computed display status — NOT the same as ICorrespondenceStub.status (the raw
   * CorrespondenceStatus). Mapping (see SubordinateInboxServiceCore.getTeamInbox for the exact
   * precedence):
   *  - 'PendingResponse': stubbed false always for now — CMS-014's backend flag doesn't exist
   *    yet, so this branch never fires today.
   *  - 'InProgress': raw Status is 'In Review' or 'Approved' (model CorrespondenceStatus
   *    'InReview' | 'Approved').
   *  - 'New': no CORMS_ReadReceipts row exists for (CorrespondenceId, UserId = ownerId) — i.e.
   *    the assigned subordinate hasn't opened it.
   *  - Precedence when both could apply: InProgress is checked first, then New, then default to
   *    'InProgress' for anything else (e.g. Registered-but-read).
   */
  displayStatus: TeamInboxStatus;
}
