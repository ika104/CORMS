import {
  IRoutingRecipient,
  IRoutingSelection,
  applyRoutingToStub,
  buildRoutingAuditDetails,
  canRoute,
  describeRecipients,
  firstFlowAction,
  isNextAction,
  resolveMatrixRouting,
} from '../routing';
import { IWorkflowRule } from '../../../models/IWorkflowRule';
import { ICorrespondenceStub } from '../../../models/ICorrespondence';

const dept = (name: string): IRoutingRecipient => ({ id: name, name, kind: 'department' });
const user = (id: string, name: string): IRoutingRecipient => ({ id, name, kind: 'user' });

const item: ICorrespondenceStub = {
  id: 'c1',
  referenceNumber: 'REF-1',
  subject: 'Subject',
  type: 'Letter',
  direction: 'Incoming',
  status: 'Registered',
  priority: 'Normal',
  securityTier: 2,
  department: 'Registry',
  createdAt: '2025-01-01',
};

function rule(overrides: Partial<IWorkflowRule> = {}): IWorkflowRule {
  return {
    id: 'r1',
    type: 'Any',
    direction: 'Incoming',
    priority: 'Any',
    securityLevel: 'Any',
    function: 'Any',
    department: 'Finance',
    flow: ['Classify', 'Approve', 'Sign'],
    approver: 'Head of Finance',
    rule: 'Default',
    note: '',
    order: 1,
    matchMode: 'first-match',
    ...overrides,
  };
}

describe('CMS-011 routing — controlled next-action list (AC2)', () => {
  it('accepts only the five controlled actions', () => {
    ['Review', 'Approve', 'Sign', 'Distribute', 'Archive'].forEach((a) => expect(isNextAction(a)).toBe(true));
    expect(isNextAction('Classify')).toBe(false);
    expect(isNextAction(undefined)).toBe(false);
  });
});

describe('CMS-011 routing — matrix auto-apply (AC5)', () => {
  it('derives the department recipient and the first pipeline action from a matched rule', () => {
    const selection = resolveMatrixRouting(rule());
    expect(selection).toBeDefined();
    expect(selection!.recipients).toEqual([{ id: 'Finance', name: 'Finance', kind: 'department' }]);
    expect(selection!.nextAction).toBe('Approve'); // 'Classify' is not a routing action; 'Approve' is the first that is
    expect(selection!.matrixApplied).toBe(true);
  });

  it('falls back to Review when the pipeline has no routing action', () => {
    expect(firstFlowAction(['Classify', 'Register'])).toBe('Review');
    expect(firstFlowAction([])).toBe('Review');
  });

  it('returns undefined when no rule matched (route ad-hoc instead)', () => {
    expect(resolveMatrixRouting(undefined)).toBeUndefined();
    expect(resolveMatrixRouting(rule({ department: '' }))).toBeUndefined();
  });
});

describe('CMS-011 routing — validity gate (AC1/AC4)', () => {
  it('needs at least one recipient and a valid next action', () => {
    expect(canRoute({ recipients: [], nextAction: 'Review' })).toBe(false);
    expect(canRoute({ recipients: [dept('Finance')], nextAction: undefined })).toBe(false);
    expect(canRoute({ recipients: [dept('Finance')], nextAction: 'Review' })).toBe(true);
  });

  it('accepts a mix of individuals and departments (AC4)', () => {
    const selection: IRoutingSelection = { recipients: [user('u-9', 'Sara'), dept('Legal')], nextAction: 'Approve' };
    expect(canRoute(selection)).toBe(true);
    expect(describeRecipients(selection.recipients)).toBe('Sara, Legal');
  });
});

describe('CMS-011 routing — audit payload (AC6)', () => {
  it('serialises recipients, action, and the matrix flag', () => {
    const details = buildRoutingAuditDetails({
      recipients: [user('u-9', 'Sara'), dept('Legal')],
      nextAction: 'Approve',
      matrixApplied: false,
    });
    const parsed = JSON.parse(details);
    expect(parsed.nextAction).toBe('Approve');
    expect(parsed.matrixApplied).toBe(false);
    expect(parsed.recipients).toEqual([
      { id: 'u-9', name: 'Sara', kind: 'user' },
      { id: 'Legal', name: 'Legal', kind: 'department' },
    ]);
  });
});

describe('CMS-011 routing — item projection (AC3/AC8)', () => {
  it('records next action, promotes recipients, attributes, and advances status out of the queue', () => {
    const routed = applyRoutingToStub(
      item,
      { recipients: [user('u-9', 'Sara'), dept('Legal')], nextAction: 'Approve' },
      'Officer Zed',
      '2025-02-01T10:00:00Z'
    );
    expect(routed.status).toBe('InReview'); // no longer 'Registered' → leaves the incoming queue
    expect(routed.nextAction).toBe('Approve');
    expect(routed.assignedTo).toBe('u-9');
    expect(routed.currentDepartment).toBe('Legal');
    expect(routed.routedBy).toBe('Officer Zed');
    expect(routed.routedAt).toBe('2025-02-01T10:00:00Z');
  });
});
