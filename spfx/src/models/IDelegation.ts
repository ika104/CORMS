import { StatusBadgeTone } from '../components/common/StatusBadge';

// TODO(confirm): CMS-017 states self-service delegation requires NO approval (applied
// immediately) and admin delegation also needs no approval, but the Figma this screen is
// built from shows a Pending -> Accept/Reject flow. Built here as per Figma; needs a
// decision — either the story changes to include an approval step, or Pending/Rejected
// get dropped and every new delegation lands as Active.
export type DelegationStatus = 'Active' | 'Pending' | 'Rejected' | 'Revoked';

export const DELEGATION_STATUS_CONFIG: Record<DelegationStatus, { labelKey: string; tone: StatusBadgeTone }> = {
  Active: { labelKey: 'delegation.status.active', tone: 'success' },
  Pending: { labelKey: 'delegation.status.pending', tone: 'warning' },
  Rejected: { labelKey: 'delegation.status.rejected', tone: 'danger' },
  Revoked: { labelKey: 'delegation.status.revoked', tone: 'neutral' },
};

export interface IDelegation {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: DelegationStatus;
}

export interface IDelegationAuditRow {
  userId: string;
  userName: string;
  team: string;
  totalCreated: number;
  accepted: number;
  rejected: number;
}

// Directory of people usable as delegate/delegator/subordinate across Delegation and Team
// Inbox — clearanceTier follows the same 1 (Public) .. 5 (Top Secret) scale as
// SECURITY_TIERS in ICorrespondence.ts.
export interface IDirectoryPerson {
  id: string;
  displayName: string;
  team: string;
  clearanceTier: number;
  isSupervisor?: boolean;
}
