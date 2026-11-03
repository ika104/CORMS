import { WorkflowMatrixServiceCore } from '../WorkflowMatrixServiceCore';
import { CONDITION_ANY, IWorkflowRule } from '../../../models/IWorkflowRule';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const LIST = 'CORMS_WorkflowMatrix';

function rule(overrides: Partial<IWorkflowRule>): IWorkflowRule {
  return {
    id: 'wm-new-1',
    type: 'Letter',
    direction: 'Incoming',
    priority: 'High',
    securityLevel: CONDITION_ANY,
    function: CONDITION_ANY,
    departmentCondition: 'Finance',
    targetKind: 'department',
    department: 'Executive Affairs',
    flow: ['Review', 'Approve', 'Sign'],
    approver: 'Executive Office',
    rule: 'Urgent Finance Letters',
    note: 'note',
    order: 3,
    ...overrides,
  };
}

describe('CMS-012 WorkflowMatrixServiceCore — CORMS_WorkflowMatrix persistence', () => {
  it('adds a new rule (unseen id) and returns its persisted wm-<Id>', async () => {
    const site = createFakeSite(1);
    seedList(site, LIST, []);
    const core = new WorkflowMatrixServiceCore(createFakeSp(site));

    const saved = await core.saveRule(rule({ id: 'wm-new-123' }));
    expect(saved.id).toMatch(/^wm-\d+$/);

    const row = site.lists.CORMS_WorkflowMatrix.items[0];
    expect(row.Title).toBe('Urgent Finance Letters');
    expect(row.RuleType).toBe('Letter');
    expect(row.DepartmentCondition).toBe('Finance');
    expect(row.TargetKind).toBe('department');
    expect(row.TargetValue).toBe('Executive Affairs');
    expect(row.Flow).toBe('Review, Approve, Sign');
    expect(row.SortOrder).toBe(3);
  });

  it('maps rows back to the IWorkflowRule shape (flow split, target kind, conditions)', async () => {
    const site = createFakeSite(1);
    seedList(site, LIST, [
      {
        Id: 7,
        Title: 'Route to Legal Counsel',
        RuleType: 'Memo',
        Direction: 'Incoming',
        Priority: 'Any',
        SecurityLevel: 'Secret',
        FunctionCondition: 'Any',
        DepartmentCondition: 'Any',
        TargetKind: 'individual',
        TargetValue: 'Sara Al Habsi',
        Flow: 'Review, Sign',
        Approver: '',
        RuleNote: '',
        SortOrder: 5,
      },
    ]);
    const core = new WorkflowMatrixServiceCore(createFakeSp(site));

    const rules = await core.getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual<IWorkflowRule>({
      id: 'wm-7',
      rule: 'Route to Legal Counsel',
      type: 'Memo',
      direction: 'Incoming',
      priority: 'Any',
      securityLevel: 'Secret',
      function: 'Any',
      departmentCondition: 'Any',
      targetKind: 'individual',
      department: 'Sara Al Habsi',
      flow: ['Review', 'Sign'],
      approver: '',
      note: '',
      order: 5,
    });
  });

  it('updates an existing rule in place (persisted id) and deletes by id', async () => {
    const site = createFakeSite(1);
    seedList(site, LIST, [{ Id: 4, Title: 'Old', RuleType: 'Letter', TargetValue: 'Ops', Flow: 'Review', SortOrder: 1 }]);
    const core = new WorkflowMatrixServiceCore(createFakeSp(site));

    await core.saveRule(rule({ id: 'wm-4', rule: 'Renamed', department: 'Finance', order: 2 }));
    expect(site.lists.CORMS_WorkflowMatrix.items[0].Title).toBe('Renamed');
    expect(site.lists.CORMS_WorkflowMatrix.items[0].TargetValue).toBe('Finance');

    await core.deleteRule('wm-4');
    expect(site.lists.CORMS_WorkflowMatrix.items).toHaveLength(0);
  });
});
