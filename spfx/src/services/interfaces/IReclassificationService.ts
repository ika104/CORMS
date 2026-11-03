import { IReclassificationDecision, IReclassificationInput, IReclassificationRequest } from '../../models/IReclassification';

/**
 * CMS-023 — re-classify / declassify a correspondence's security level. Records Admins apply the
 * change directly; other users raise a request that a checker approves. All paths are audited with
 * before/after level, actor, timestamp and justification; none touch the file-plan classification.
 */
export interface IReclassificationService {
  /** AC1 — Records Admin: change the security level immediately (persisted + audited). Access
   * control follows the persisted level (AC5). */
  applyDirect(input: IReclassificationInput): Promise<void>;

  /** AC2 (maker) — raise a re-classification request for a checker to approve; the level is NOT
   * changed until approved. Audited as "requested". */
  requestReclassification(input: IReclassificationInput): Promise<void>;

  /** The checker queue — pending requests awaiting a decision. */
  getPendingRequests(): Promise<IReclassificationRequest[]>;

  /** AC2 (checker) — approve (applies the level change) or reject a request; audited either way. */
  decideRequest(decision: IReclassificationDecision): Promise<void>;
}
