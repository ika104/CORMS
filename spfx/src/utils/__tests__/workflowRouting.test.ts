import { resolveWorkflowRule, resolveWorkflowRules } from '../workflowRouting';
import { CONDITION_ANY, IWorkflowRule } from '../../models/IWorkflowRule';

function rule(overrides: Partial<IWorkflowRule>): IWorkflowRule {
  return {
    id: 'r',
    type: CONDITION_ANY,
    direction: CONDITION_ANY,
    priority: CONDITION_ANY,
    securityLevel: CONDITION_ANY,
    function: CONDITION_ANY,
    department: 'Ops',
    flow: ['Review'],
    approver: '',
    rule: 'rule',
    note: '',
    order: 1,
    ...overrides,
  };
}

describe('resolveWorkflowRule — conditions incl. Department (CMS-012 AC3)', () => {
  const rules = [
    rule({ id: 'a', order: 1, type: 'Letter', departmentCondition: 'Finance', department: 'Finance Review' }),
    rule({ id: 'b', order: 2, type: 'Letter', department: 'General Pool' }),
  ];

  it('matches the source-department condition', () => {
    expect(resolveWorkflowRule(rules, { type: 'Letter', direction: 'Incoming', department: 'Finance' })?.id).toBe('a');
  });
  it('falls through to the department-agnostic rule when the department differs', () => {
    expect(resolveWorkflowRule(rules, { type: 'Letter', direction: 'Incoming', department: 'Legal' })?.id).toBe('b');
  });
  it('treats an unset departmentCondition as Any', () => {
    expect(resolveWorkflowRule([rule({ id: 'c', departmentCondition: undefined })], { type: 'x', direction: 'Incoming', department: 'Anything' })?.id).toBe('c');
  });
});

describe('resolveWorkflowRules — configurable match mode (CMS-012 AC5)', () => {
  const rules = [
    rule({ id: 'a', order: 1, priority: 'High' }),
    rule({ id: 'b', order: 2, priority: CONDITION_ANY }),
    rule({ id: 'c', order: 3, type: 'Memo' }), // does not match a High Letter
  ];
  const criteria = { type: 'Letter', direction: 'Incoming', priority: 'High' };

  it('first-match returns only the first matching rule in order', () => {
    expect(resolveWorkflowRules(rules, criteria, 'first-match').map((r) => r.id)).toEqual(['a']);
  });
  it('all-match returns every matching rule in order', () => {
    expect(resolveWorkflowRules(rules, criteria, 'all-match').map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('resolveWorkflowRule stays first-match and agrees with the plural form', () => {
    expect(resolveWorkflowRule(rules, criteria)?.id).toBe(resolveWorkflowRules(rules, criteria, 'first-match')[0].id);
  });
});
