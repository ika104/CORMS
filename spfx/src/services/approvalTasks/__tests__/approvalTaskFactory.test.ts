import { expandChainToTaskDrafts } from '../approvalTaskFactory';
import { IApprovalChainStep } from '../../../models/IApprovalChain';

const sig = { page: 2, x: 60, y: 80, width: 25, height: 8 };

describe('CMS-006 AC9 — expandChainToTaskDrafts', () => {
  const chain: IApprovalChainStep[] = [
    { order: 1, type: 'Reviewer', name: 'Alice', requireSignature: true, signaturePlacement: sig, participants: [{ id: 'u-1', name: 'Alice' }] },
    {
      order: 2,
      type: 'Group',
      name: 'Board',
      mode: 'Any',
      requireSignature: false,
      participants: [{ id: 'u-2', name: 'Bob' }, { id: 'u-3', name: 'Carol' }],
    },
    { order: 3, type: 'Department', name: 'Finance', mode: 'All', requireSignature: false, participants: [], departmentId: 'd-1' },
  ];

  it('creates one task per participant (Reviewer 1, Group N, Department 1 team)', () => {
    const drafts = expandChainToTaskDrafts('c1', 'OUT-1', chain);
    expect(drafts).toHaveLength(4); // 1 + 2 + 1

    const reviewer = drafts.filter((d) => d.stepOrder === 1);
    expect(reviewer).toHaveLength(1);
    expect(reviewer[0]).toMatchObject({ assignedToId: 'u-1', assignedToName: 'Alice', correspondenceId: 'c1', referenceNo: 'OUT-1' });

    const group = drafts.filter((d) => d.stepOrder === 2);
    expect(group.map((g) => g.assignedToId)).toEqual(['u-2', 'u-3']);
    expect(group.every((g) => g.mode === 'Any')).toBe(true);

    const dept = drafts.filter((d) => d.stepOrder === 3);
    expect(dept).toHaveLength(1);
    expect(dept[0]).toMatchObject({ assignedToTeam: 'Finance', mode: 'All' });
    expect(dept[0].assignedToId).toBeUndefined();
  });

  it('carries signature placement only on signature-enabled steps', () => {
    const drafts = expandChainToTaskDrafts('c1', undefined, chain);
    expect(drafts.find((d) => d.stepOrder === 1)!.signaturePlacement).toEqual(sig);
    expect(drafts.find((d) => d.stepOrder === 2)!.signaturePlacement).toBeUndefined();
  });

  it('CMS-048 — expands a Department step with ordered members into ascending-seniority tasks', () => {
    const deptChain: IApprovalChainStep[] = [
      {
        order: 1,
        type: 'Department',
        name: 'Finance',
        mode: 'All',
        requireSignature: false,
        participants: [],
        departmentId: 'd-1',
        members: [
          { id: 'u-junior', name: 'Junior' },
          { id: 'u-mid', name: 'Mid' },
          { id: 'u-head', name: 'Head' },
        ],
      },
    ];
    const drafts = expandChainToTaskDrafts('c1', 'OUT-1', deptChain);
    expect(drafts).toHaveLength(3);
    expect(drafts.map((d) => [d.assignedToId, d.seniority])).toEqual([
      ['u-junior', 1],
      ['u-mid', 2],
      ['u-head', 3],
    ]);
    expect(drafts.every((d) => d.assignedToTeam === 'Finance')).toBe(true);
  });

  it('CMS-048 — a Department step with no members stays a single team task', () => {
    const deptChain: IApprovalChainStep[] = [
      { order: 1, type: 'Department', name: 'Finance', mode: 'All', requireSignature: false, participants: [], departmentId: 'd-1' },
    ];
    const drafts = expandChainToTaskDrafts('c1', undefined, deptChain);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ assignedToTeam: 'Finance' });
    expect(drafts[0].seniority).toBeUndefined();
  });
});
