/** CMS-019 — Reassign Correspondence backend. A supervisor moves an item from one direct report
 * to another; both server-side gates (both-direct-reports validation and clearance) are
 * re-validated here regardless of what the caller's UI already filtered, since a caller could
 * construct this service directly and skip any client-side candidate filtering. */
export interface IReassignInput {
  correspondenceId: string;
  fromUserId: string;
  toUserId: string;
  reason: string;
}

export interface IReassignmentService {
  /** The acting supervisor is resolved server-side (getCurrentSiteUserId), never taken from the
   * input — a caller-supplied supervisorId would let anyone reassign work between someone else's
   * direct reports simply by naming that supervisor, which is exactly the gate AC1/AC2 exist to
   * enforce. */
  reassign(input: IReassignInput): Promise<void>;
}
