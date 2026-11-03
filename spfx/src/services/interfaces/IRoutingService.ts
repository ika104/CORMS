/**
 * CMS-011 — Route Incoming Correspondence backend. Persists a triage officer's routing decision
 * (next action + recipients) onto CORMS_Correspondence and writes the attributed, timestamped
 * audit entry (AC6). Like reassignment (CMS-019), the in-app "notification" (AC7) is the item
 * surfacing as unread in the recipient's inbox — real-time push / email stays a Power Automate
 * concern, out of scope for this SPFx/SharePoint-only task.
 */
export type RouteRecipientKind = 'user' | 'department';

export interface IRouteRecipient {
  id: string;
  name: string;
  kind: RouteRecipientKind;
}

export interface IRouteInput {
  correspondenceId: string;
  referenceNo?: string;
  subject?: string;
  /** One or more internal recipients — individuals and/or departments (AC4). */
  recipients: IRouteRecipient[];
  /** One of the controlled next actions (Review / Approve / Sign / Distribute / Archive) (AC2). */
  nextAction: string;
  /** True when the selection was auto-applied from the routing matrix rather than hand-picked
   * (AC5) — recorded in the audit. */
  matrixApplied?: boolean;
}

export interface IRoutingService {
  /** Routes the item: records the next action + recipients + attribution, advances the item out
   * of the triage queue, and logs the audit. */
  route(input: IRouteInput): Promise<void>;
}
