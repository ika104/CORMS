import { CONDITION_ANY, IWorkflowRule, RoutingMatchMode } from '../models/IWorkflowRule';

export interface IRoutingCriteria {
  type: string;
  direction: string;
  priority?: string;
  securityLevel?: string;
  function?: string;
  /** AC3 — the item's own (source) department, matched against a rule's departmentCondition. */
  department?: string;
}

function conditionMatches(condition: string | undefined, value: string | undefined): boolean {
  return !condition || condition === CONDITION_ANY || !value || condition === value;
}

/** True when every condition on the rule matches the criteria (or is CONDITION_ANY / unset). */
function ruleMatches(rule: IWorkflowRule, criteria: IRoutingCriteria): boolean {
  return (
    conditionMatches(rule.type, criteria.type) &&
    conditionMatches(rule.direction, criteria.direction) &&
    conditionMatches(rule.priority, criteria.priority) &&
    conditionMatches(rule.securityLevel, criteria.securityLevel) &&
    conditionMatches(rule.function, criteria.function) &&
    conditionMatches(rule.departmentCondition, criteria.department)
  );
}

/** First-match resolution over an ordered rule set (CMS-011/012) — every condition on a rule
 * must match (or be CONDITION_ANY) for that rule to win. Shared by Triage & Routing's
 * "default route" line and the Workflow Matrix admin screen's Test Mode simulator, so both
 * resolve identically against the same WorkflowRoutingMatrix dataset. */
export function resolveWorkflowRule(rules: IWorkflowRule[], criteria: IRoutingCriteria): IWorkflowRule | undefined {
  return [...rules].sort((a, b) => a.order - b.order).find((rule) => ruleMatches(rule, criteria));
}

/**
 * AC5 — configurable resolution: 'first-match' returns just the first matching rule in order,
 * 'all-match' returns every matching rule (in order). Returning an array lets a caller union the
 * targets of all matched rules under all-match, or take the head under first-match; the match mode
 * is a matrix-wide Admin Config setting (`routing.matchMode`), not stored per rule.
 */
export function resolveWorkflowRules(
  rules: IWorkflowRule[],
  criteria: IRoutingCriteria,
  mode: RoutingMatchMode
): IWorkflowRule[] {
  const matched = [...rules].sort((a, b) => a.order - b.order).filter((rule) => ruleMatches(rule, criteria));
  return mode === 'all-match' ? matched : matched.slice(0, 1);
}
