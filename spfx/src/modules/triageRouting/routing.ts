import { IWorkflowRule } from '../../models/IWorkflowRule';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { NEXT_ACTIONS, NextAction } from './types';

/**
 * CMS-011 — the pure rules behind Step 2, Route: the controlled next-action list (AC2), the
 * ad-hoc vs matrix-derived recipient/action selection (AC5), the validity gate for routing (AC1),
 * and the structured audit payload written when an item is routed (AC6). Dependency-free of React
 * so every rule is unit-testable.
 */

export type RoutingRecipientKind = 'user' | 'department';

/** An internal recipient of a routed item — an individual or a whole department (AC4). */
export interface IRoutingRecipient {
  id: string;
  name: string;
  kind: RoutingRecipientKind;
}

export interface IRoutingSelection {
  recipients: IRoutingRecipient[];
  nextAction?: NextAction;
  /** True when the selection was populated from the routing matrix rather than hand-picked (AC5) —
   * recorded in the audit so the two paths are distinguishable. */
  matrixApplied?: boolean;
}

export function isNextAction(value: string | undefined): value is NextAction {
  return !!value && (NEXT_ACTIONS as string[]).indexOf(value) !== -1;
}

/** The default next action implied by a matrix rule's pipeline: its first step that is itself a
 * valid routing action, falling back to 'Review' (the safe default first action). */
export function firstFlowAction(flow: string[] | undefined): NextAction {
  const match = (flow ?? []).find((step) => isNextAction(step));
  return isNextAction(match) ? match : 'Review';
}

/**
 * AC5 — the routing implied by a matched workflow-matrix rule: the rule's destination department
 * as the recipient and the pipeline's first action as the next action. Returns undefined when no
 * rule matched (nothing to auto-apply), so the officer routes ad-hoc instead.
 */
export function resolveMatrixRouting(rule: IWorkflowRule | undefined): IRoutingSelection | undefined {
  if (!rule || !rule.department) return undefined;
  return {
    recipients: [{ id: rule.department, name: rule.department, kind: 'department' }],
    nextAction: firstFlowAction(rule.flow),
    matrixApplied: true,
  };
}

/** AC1/AC2/AC4 — a routing is only valid once at least one recipient and a next action are set.
 * (Classification precedes routing on the screen; the caller gates the whole step on that.) */
export function canRoute(selection: IRoutingSelection): boolean {
  return selection.recipients.length > 0 && isNextAction(selection.nextAction);
}

export function describeRecipients(recipients: IRoutingRecipient[]): string {
  return recipients.map((r) => r.name).join(', ');
}

/**
 * AC6 — the structured audit payload for a routing action: the recipients (with kind), the next
 * action, and whether it came from the matrix. The caller adds actor + timestamp via logEvent.
 */
export function buildRoutingAuditDetails(selection: IRoutingSelection): string {
  return JSON.stringify({
    recipients: selection.recipients.map((r) => ({ id: r.id, name: r.name, kind: r.kind })),
    nextAction: selection.nextAction,
    matrixApplied: !!selection.matrixApplied,
  });
}

/**
 * AC3/AC6/AC8 — the item's own fields after routing: the next action recorded on it (shown to the
 * recipient as the Next Step), a department recipient promoted to CurrentDepartment and a user
 * recipient to the primary assignee, routing attribution, and the status advanced to 'InReview' so
 * it leaves the triage (Registered) queue. Pure projection — the service persists the same shape.
 */
export function applyRoutingToStub(
  item: ICorrespondenceStub,
  selection: IRoutingSelection,
  actor: string,
  timestampIso: string
): ICorrespondenceStub {
  const department = selection.recipients.find((r) => r.kind === 'department');
  const user = selection.recipients.find((r) => r.kind === 'user');
  return {
    ...item,
    status: 'InReview',
    nextAction: selection.nextAction,
    currentDepartment: department?.name ?? item.currentDepartment,
    assignedTo: user?.id ?? item.assignedTo,
    routedBy: actor,
    routedAt: timestampIso,
  };
}
