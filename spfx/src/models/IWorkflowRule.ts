export type WorkflowConditionValue = string;

export const CONDITION_ANY = 'Any';

/** AC4 — a rule can route to a department, a named individual, or a role group. */
export type RoutingTargetKind = 'department' | 'individual' | 'role';
export const ROUTING_TARGET_KINDS: RoutingTargetKind[] = ['department', 'individual', 'role'];

/** AC5 — how the ordered rule set is combined when resolving a route: the first matching rule
 * wins, or every matching rule contributes. Configured once for the matrix (Admin Config
 * `routing.matchMode`), not per rule. */
export type RoutingMatchMode = 'first-match' | 'all-match';

/** A single row of the WorkflowRoutingMatrix SharePoint list (CMS-012) — the rule-based
 * routing configuration that both the Workflow Matrix admin screen and Triage & Routing's
 * "default route" resolution (CMS-011) read from the same mock dataset. */
export interface IWorkflowRule {
  id: string;
  /** Record type condition, or CONDITION_ANY to match every type. */
  type: WorkflowConditionValue;
  /** Direction condition, or CONDITION_ANY. */
  direction: 'Incoming' | 'Outgoing' | 'External' | typeof CONDITION_ANY;
  /** Priority condition, or CONDITION_ANY. */
  priority: 'Normal' | 'High' | typeof CONDITION_ANY;
  /** Security level (tier name) condition, or CONDITION_ANY. */
  securityLevel: WorkflowConditionValue;
  /** Originating function condition, or CONDITION_ANY. */
  function: WorkflowConditionValue;
  /** AC3 — the item's own department as a match condition (the source/originating department),
   * or CONDITION_ANY. Distinct from `department` below, which is where a matched item is routed TO.
   * Optional so pre-existing rules (which had no department condition) default to matching Any. */
  departmentCondition?: WorkflowConditionValue;
  /** AC4 — what kind of recipient `department` names. Defaults to 'department' when absent, for
   * pre-existing rules. */
  targetKind?: RoutingTargetKind;
  /** The recipient an item routes to when this rule matches — a department name, an individual's
   * name, or a role-group name depending on `targetKind`. (Field name kept for back-compat.) */
  department: string;
  /** Ordered pipeline steps, e.g. ['Review', 'Classify', 'Approve', 'Sign']. */
  flow: string[];
  approver: string;
  /** Short rule name shown in the "Rule" column. */
  rule: string;
  note: string;
  /** Lower runs first — resolution order. */
  order: number;
  /** @deprecated Match mode is now a matrix-wide setting (Admin Config `routing.matchMode`), not
   * per rule — see resolveWorkflowRules. Kept optional so existing seed rows still parse. */
  matchMode?: RoutingMatchMode;
}
