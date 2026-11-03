import {
  TRIAGE_STAGES,
  filterTriageQueue,
  isPendingTriage,
  isTriageClassifiable,
  isUnseen,
  matchesStage,
  nextWorkflowStepKey,
  stageCounts,
  unseenCount,
  withinClearance,
} from '../triageQueue';
import { ICorrespondenceStub, CorrespondenceStatus } from '../../../models/ICorrespondence';

function stub(id: string, overrides: Partial<ICorrespondenceStub> = {}): ICorrespondenceStub {
  return {
    id,
    referenceNumber: `REF-${id}`,
    subject: `Subject ${id}`,
    type: 'Letter',
    direction: 'Incoming',
    status: 'Registered',
    priority: 'Normal',
    securityTier: 1,
    department: 'Legal',
    createdAt: '2025-01-01',
    seen: true,
    ...overrides,
  };
}

describe('CMS-009 triageQueue — stage membership (AC8)', () => {
  it('exposes the three stages in tab order', () => {
    expect(TRIAGE_STAGES).toEqual(['incoming', 'underReview', 'byClassification']);
  });

  it('Incoming = registered incoming; Under Review = in-review incoming', () => {
    const reg = stub('a', { status: 'Registered' });
    const rev = stub('b', { status: 'InReview' });
    expect(matchesStage(reg, 'incoming')).toBe(true);
    expect(matchesStage(reg, 'underReview')).toBe(false);
    expect(matchesStage(rev, 'underReview')).toBe(true);
    expect(matchesStage(rev, 'incoming')).toBe(false);
  });

  it('By Classification = the full pending-triage set (both statuses)', () => {
    expect(matchesStage(stub('a', { status: 'Registered' }), 'byClassification')).toBe(true);
    expect(matchesStage(stub('b', { status: 'InReview' }), 'byClassification')).toBe(true);
    expect(matchesStage(stub('c', { status: 'Approved' }), 'byClassification')).toBe(false);
  });

  it('never includes non-incoming items in any stage', () => {
    const outgoing = stub('o', { direction: 'Outgoing', status: 'Registered' });
    expect(matchesStage(outgoing, 'incoming')).toBe(false);
    expect(matchesStage(outgoing, 'byClassification')).toBe(false);
  });

  it('isPendingTriage covers only Registered / InReview', () => {
    const statuses: CorrespondenceStatus[] = ['Draft', 'PendingNumber', 'Registered', 'InReview', 'Approved', 'Signed', 'Declared', 'Delivered'];
    expect(statuses.filter(isPendingTriage)).toEqual(['Registered', 'InReview']);
  });
});

describe('CMS-009 triageQueue — clearance (AC3)', () => {
  it('trims items above the officer clearance', () => {
    expect(withinClearance(stub('a', { securityTier: 3 }), 3)).toBe(true);
    expect(withinClearance(stub('b', { securityTier: 4 }), 3)).toBe(false);
  });

  it('filterTriageQueue drops over-clearance items entirely', () => {
    const items = [stub('a', { securityTier: 2 }), stub('b', { securityTier: 5 })];
    const out = filterTriageQueue(items, { stage: 'incoming', maxClearanceTier: 2 });
    expect(out.map((i) => i.id)).toEqual(['a']);
  });
});

describe('CMS-010 triageQueue — classifiable gate (AC6)', () => {
  it('a not-yet-routed triage-stage item can be classified', () => {
    expect(isTriageClassifiable(stub('a', { status: 'Registered' }))).toBe(true);
    expect(isTriageClassifiable(stub('b', { status: 'InReview' }))).toBe(true);
  });

  it('an item that has been routed onward is locked (AC6)', () => {
    expect(isTriageClassifiable(stub('c', { status: 'InReview', currentDepartment: 'Finance' }))).toBe(false);
  });

  it('an item past triage cannot be classified here', () => {
    expect(isTriageClassifiable(stub('d', { status: 'Approved' }))).toBe(false);
  });
});

describe('CMS-009 triageQueue — unseen / new (AC4)', () => {
  it('an unseen item is incoming, pending triage, and not seen', () => {
    expect(isUnseen(stub('a', { seen: false, status: 'Registered' }))).toBe(true);
    expect(isUnseen(stub('b', { seen: true, status: 'Registered' }))).toBe(false);
    expect(isUnseen(stub('c', { seen: false, status: 'Approved' }))).toBe(false);
    expect(isUnseen(stub('d', { seen: false, direction: 'Outgoing', status: 'Registered' }))).toBe(false);
  });

  it('unseenCount respects clearance', () => {
    const items = [
      stub('a', { seen: false, securityTier: 1 }),
      stub('b', { seen: false, securityTier: 2 }),
      stub('c', { seen: false, securityTier: 5 }), // over clearance — not counted
      stub('d', { seen: true, securityTier: 1 }), // seen — not counted
    ];
    expect(unseenCount(items, 2)).toBe(2);
  });
});

describe('CMS-009 triageQueue — next workflow step (AC7)', () => {
  it('names the next step from the current status', () => {
    expect(nextWorkflowStepKey(stub('a', { status: 'Registered' }))).toBe('triageRouting.classify.nextActionOption.Review');
    expect(nextWorkflowStepKey(stub('b', { status: 'InReview' }))).toBe('triageRouting.classify.nextActionOption.Approve');
    expect(nextWorkflowStepKey(stub('c', { status: 'Approved' }))).toBe('triageRouting.classify.nextActionOption.Sign');
    expect(nextWorkflowStepKey(stub('d', { status: 'Signed' }))).toBe('triageRouting.classify.nextActionOption.Distribute');
  });

  it('resolves to no further step once fully delivered', () => {
    expect(nextWorkflowStepKey(stub('e', { status: 'Delivered' }))).toBeUndefined();
  });
});

describe('CMS-009 triageQueue — filtering (AC8/AC9) and counts', () => {
  const items = [
    stub('a', { status: 'Registered', type: 'Letter', securityTier: 2, subject: 'Budget request' }),
    stub('b', { status: 'Registered', type: 'Memo', securityTier: 3, referenceNumber: 'MEMO-01' }),
    stub('c', { status: 'InReview', type: 'Letter', securityTier: 1 }),
    stub('d', { status: 'Approved', type: 'Letter', securityTier: 1 }), // out of triage
  ];

  it('By Classification narrows by record type and security tier', () => {
    expect(filterTriageQueue(items, { stage: 'byClassification', maxClearanceTier: 5, recordType: 'Memo' }).map((i) => i.id)).toEqual(['b']);
    expect(filterTriageQueue(items, { stage: 'byClassification', maxClearanceTier: 5, securityTier: '1' }).map((i) => i.id)).toEqual(['c']);
  });

  it('search matches subject or reference number, case-insensitively', () => {
    expect(filterTriageQueue(items, { stage: 'incoming', maxClearanceTier: 5, search: 'BUDGET' }).map((i) => i.id)).toEqual(['a']);
    expect(filterTriageQueue(items, { stage: 'incoming', maxClearanceTier: 5, search: 'memo-01' }).map((i) => i.id)).toEqual(['b']);
  });

  it('AC9 — completed items are removed so the remaining cards close the gap', () => {
    const out = filterTriageQueue(items, { stage: 'incoming', maxClearanceTier: 5, completedIds: new Set(['a']) });
    expect(out.map((i) => i.id)).toEqual(['b']);
  });

  it('stageCounts reports true per-stage totals ignoring search/classification narrowing', () => {
    expect(stageCounts(items, 5)).toEqual({ incoming: 2, underReview: 1, byClassification: 3 });
  });

  it('stageCounts excludes completed items', () => {
    expect(stageCounts(items, 5, new Set(['a']))).toEqual({ incoming: 1, underReview: 1, byClassification: 2 });
  });
});
