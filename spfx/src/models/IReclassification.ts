/**
 * CMS-023 — a re-classification request. Records Admins change the security level directly; everyone
 * else raises one of these for a checker to approve/reject (maker-checker). Re-classification only
 * ever changes the SECURITY LEVEL — never the file-plan (record) classification (AC4).
 */
export type ReclassificationStatus = 'Pending' | 'Approved' | 'Rejected';

export interface IReclassificationRequest {
  id: string;
  correspondenceId: string;
  /** Reference number + subject, denormalised so the checker queue reads without a second fetch. */
  correspondenceRef: string;
  subject: string;
  fromTier: number;
  toTier: number;
  /** Display names for the tiers (before/after) — for the audit trail and checker UI. */
  fromLevel: string;
  toLevel: string;
  justification: string;
  requestedBy: string;
  requestedAt: string;
  status: ReclassificationStatus;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

/** Input to raise a re-classification request (maker) or apply one directly (Records Admin). */
export interface IReclassificationInput {
  correspondenceId: string;
  correspondenceRef: string;
  subject: string;
  fromTier: number;
  toTier: number;
  justification: string;
  actor: string;
}

export interface IReclassificationDecision {
  requestId: string;
  approve: boolean;
  decidedBy: string;
  decisionNote?: string;
}
