import {
  buildApprovalChainPayload,
  clampSignaturePlacement,
  hasEmptyGroup,
  isEligibleForStep,
  overlappingSignatureStepIds,
  spreadSignatureSteps,
  MIN_SIGNATURE_SIZE_PCT,
  toggleGroupMember,
} from '../approvalChain';
import { ApprovalStep, DEFAULT_SIGNATURE_PLACEMENT, IGroupStep } from '../types';

describe('CMS-006 AC5 — isEligibleForStep', () => {
  it('allows a candidate whose clearance meets or exceeds the security level', () => {
    expect(isEligibleForStep(3, 3)).toBe(true);
    expect(isEligibleForStep(5, 3)).toBe(true);
  });

  it('rejects a candidate whose known clearance is below the security level', () => {
    expect(isEligibleForStep(2, 3)).toBe(false);
    expect(isEligibleForStep(1, 5)).toBe(false);
  });

  it('treats an unknown clearance, or an unset security level, as eligible', () => {
    expect(isEligibleForStep(undefined, 4)).toBe(true);
    expect(isEligibleForStep(1, undefined)).toBe(true);
  });
});

describe('CMS-006 AC16 — clampSignaturePlacement', () => {
  it('keeps a box that already fits unchanged (rounded)', () => {
    expect(clampSignaturePlacement({ page: 2, x: 10, y: 20, width: 30, height: 8 })).toEqual({
      page: 2,
      x: 10,
      y: 20,
      width: 30,
      height: 8,
    });
  });

  it('clamps a box that overflows the right/bottom edges back onto the page', () => {
    const clamped = clampSignaturePlacement({ page: 1, x: 90, y: 96, width: 30, height: 20 });
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(100);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(100);
  });

  it('enforces a minimum size and a page floor of 1', () => {
    const clamped = clampSignaturePlacement({ page: 0, x: -10, y: -5, width: 1, height: 0 });
    expect(clamped.page).toBe(1);
    expect(clamped.width).toBe(MIN_SIGNATURE_SIZE_PCT);
    expect(clamped.height).toBe(MIN_SIGNATURE_SIZE_PCT);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
  });
});

describe('CMS-006 AC9/AC12 — buildApprovalChainPayload', () => {
  const sig = { ...DEFAULT_SIGNATURE_PLACEMENT };

  it('serialises reviewer, department and group steps in execution order', () => {
    const steps: ApprovalStep[] = [
      {
        id: 's1',
        kind: 'reviewer',
        userId: 'u-1',
        userName: 'Alice',
        department: 'Legal',
        requireSignature: false,
        signaturePlacement: sig,
      },
      {
        id: 's2',
        kind: 'department',
        departmentId: 'd-1',
        departmentName: 'Finance',
        mode: 'all',
        requireSignature: false,
        signaturePlacement: sig,
      },
      {
        id: 's3',
        kind: 'group',
        groupName: 'Board',
        memberIds: ['u-2', 'u-3'],
        memberNames: ['Bob', 'Carol'],
        mode: 'any',
        requireSignature: false,
        signaturePlacement: sig,
      },
    ];
    const payload = buildApprovalChainPayload(steps);

    expect(payload.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(payload[0]).toMatchObject({
      type: 'Reviewer',
      name: 'Alice',
      participants: [{ id: 'u-1', name: 'Alice' }],
    });
    expect(payload[0].mode).toBeUndefined();
    expect(payload[1]).toMatchObject({
      type: 'Department',
      name: 'Finance',
      mode: 'All',
      participants: [],
      departmentId: 'd-1',
    });
    expect(payload[2]).toMatchObject({
      type: 'Group',
      name: 'Board',
      mode: 'Any',
      participants: [
        { id: 'u-2', name: 'Bob' },
        { id: 'u-3', name: 'Carol' },
      ],
    });
  });

  it('emits signaturePlacement only for signature-enabled steps (AC7/AC16)', () => {
    const steps: ApprovalStep[] = [
      {
        id: 's1',
        kind: 'reviewer',
        userId: 'u-1',
        userName: 'Alice',
        requireSignature: true,
        signaturePlacement: { page: 2, x: 60, y: 80, width: 25, height: 8 },
      },
      {
        id: 's2',
        kind: 'reviewer',
        userId: 'u-2',
        userName: 'Bob',
        requireSignature: false,
        signaturePlacement: sig,
      },
    ];
    const payload = buildApprovalChainPayload(steps);
    expect(payload[0].signaturePlacement).toEqual({ page: 2, x: 60, y: 80, width: 25, height: 8 });
    expect(payload[1].signaturePlacement).toBeUndefined();
  });
});

describe('buildApprovalChainPayload — steps added after an existing chain', () => {
  it('numbers the new steps from the given first order', () => {
    const reviewer = (id: string, userName: string): ApprovalStep => ({
      id,
      kind: 'reviewer',
      userId: id,
      userName,
      requireSignature: false,
      signaturePlacement: { ...DEFAULT_SIGNATURE_PLACEMENT },
    });
    const chain = buildApprovalChainPayload([reviewer('u-1', 'Alice'), reviewer('u-2', 'Bob')], 3);
    expect(chain.map((step) => step.order)).toEqual([3, 4]);
  });
});

describe('group members', () => {
  const emptyGroup: IGroupStep = {
    id: 'g',
    kind: 'group',
    groupName: 'Group Reviewers',
    memberIds: [],
    memberNames: [],
    mode: 'any',
    requireSignature: false,
    signaturePlacement: { ...DEFAULT_SIGNATURE_PLACEMENT },
  };

  it('adds a person, and removes them when toggled again', () => {
    const withAlice = toggleGroupMember(emptyGroup, 'u-1', 'Alice');
    expect(withAlice).toMatchObject({ memberIds: ['u-1'], memberNames: ['Alice'] });
    expect(toggleGroupMember(withAlice, 'u-1', 'Alice')).toMatchObject({ memberIds: [], memberNames: [] });
  });

  it('flags a chain that still has a group with no members', () => {
    expect(hasEmptyGroup([emptyGroup])).toBe(true);
    expect(hasEmptyGroup([toggleGroupMember(emptyGroup, 'u-1', 'Alice')])).toBe(false);
  });
});

describe('signature boxes on the shared document', () => {
  const signer = (id: string, x: number, requireSignature = true): ApprovalStep => ({
    id,
    kind: 'reviewer',
    userId: id,
    userName: id,
    requireSignature,
    signaturePlacement: { page: 1, x, y: 85, width: 20, height: 8 },
  });

  it('spreads signature steps that share a box, leaving unsigned steps alone', () => {
    const spread = spreadSignatureSteps([signer('a', 70), signer('b', 70), signer('c', 70, false)]);
    expect(spread.map((step) => step.signaturePlacement.x)).toEqual([70, 40, 70]);
    expect(overlappingSignatureStepIds(spread)).toEqual([]);
  });

  it('flags signature steps that overlap each other or an existing signer', () => {
    expect(overlappingSignatureStepIds([signer('a', 70), signer('b', 72), signer('c', 10)])).toEqual([
      'a',
      'b',
    ]);
    expect(
      overlappingSignatureStepIds(
        [signer('c', 10)],
        [{ label: 'Existing', placement: signer('x', 12).signaturePlacement }]
      )
    ).toEqual(['c']);
  });
});
