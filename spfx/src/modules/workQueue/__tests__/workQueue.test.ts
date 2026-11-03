import {
  requiredNextStep,
  isActionable,
  holdsLiveStep,
  isUnread,
  sortWorkQueue,
  filterWorkQueue,
  workQueueUnreadCount,
} from '../workQueue';
import { ICorrespondenceStub, CorrespondenceStatus } from '../../../models/ICorrespondence';

function stub(overrides: Partial<ICorrespondenceStub>): ICorrespondenceStub {
  return {
    id: 'c1',
    referenceNumber: 'REF-1',
    subject: 'Subject',
    type: 'Letter',
    direction: 'Incoming',
    status: 'Registered',
    priority: 'Normal',
    securityTier: 1,
    department: 'Ops',
    createdAt: '2026-09-01',
    assignedTo: 'u-me',
    seen: true,
    ...overrides,
  };
}

describe('requiredNextStep (CMS-013 AC1)', () => {
  it('prefers the explicit routed nextAction when it is a controlled action', () => {
    expect(requiredNextStep(stub({ status: 'Registered', nextAction: 'Sign' }))).toBe('Sign');
    expect(requiredNextStep(stub({ nextAction: 'Distribute' }))).toBe('Distribute');
  });
  it('falls back to the status-derived step when there is no nextAction', () => {
    expect(requiredNextStep(stub({ status: 'Registered', nextAction: undefined }))).toBe('Review');
    expect(requiredNextStep(stub({ status: 'InReview', nextAction: undefined }))).toBe('Approve');
    expect(requiredNextStep(stub({ status: 'Approved', nextAction: undefined }))).toBe('Sign');
  });
  it('ignores an unrecognized nextAction value', () => {
    expect(requiredNextStep(stub({ status: 'InReview', nextAction: 'Frobnicate' }))).toBe('Approve');
  });
});

describe('isActionable (CMS-013 AC2)', () => {
  it('excludes draft, pending-number, signed, declared and delivered items', () => {
    const excluded: CorrespondenceStatus[] = ['Draft', 'PendingNumber', 'Signed', 'Declared', 'Delivered'];
    excluded.forEach((status) => expect(isActionable(stub({ status }))).toBe(false));
  });
  it('includes the actionable statuses', () => {
    (['Registered', 'InReview', 'Approved'] as CorrespondenceStatus[]).forEach((status) =>
      expect(isActionable(stub({ status }))).toBe(true)
    );
  });
  it('a Signed item is excluded even if it carries a later nextAction', () => {
    expect(isActionable(stub({ status: 'Signed', nextAction: 'Distribute' }))).toBe(false);
  });
});

describe('holdsLiveStep (CMS-013 AC3)', () => {
  it('is true only for the current assignee', () => {
    expect(holdsLiveStep(stub({ assignedTo: 'u-me' }), 'u-me')).toBe(true);
    expect(holdsLiveStep(stub({ assignedTo: 'u-other' }), 'u-me')).toBe(false);
    expect(holdsLiveStep(stub({ assignedTo: undefined }), 'u-me')).toBe(false);
  });
});

describe('sortWorkQueue (CMS-013 AC5)', () => {
  it('orders by priority (High first) then received date (newest first)', () => {
    const items = [
      stub({ id: 'a', priority: 'Normal', createdAt: '2026-09-03' }),
      stub({ id: 'b', priority: 'High', createdAt: '2026-09-01' }),
      stub({ id: 'c', priority: 'High', createdAt: '2026-09-05' }),
    ];
    expect(sortWorkQueue(items).map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('filterWorkQueue (CMS-013 AC2/AC3/AC5/AC7)', () => {
  const items = [
    stub({ id: 'mine-high', assignedTo: 'u-me', priority: 'High', status: 'InReview', createdAt: '2026-09-02' }),
    stub({ id: 'mine-normal', assignedTo: 'u-me', priority: 'Normal', status: 'Registered', createdAt: '2026-09-04' }),
    stub({ id: 'mine-signed', assignedTo: 'u-me', status: 'Signed' }), // excluded (AC2)
    stub({ id: 'theirs', assignedTo: 'u-other', status: 'Registered' }), // excluded (AC3)
    stub({ id: 'too-secret', assignedTo: 'u-me', status: 'Registered', securityTier: 5 }), // excluded (AC7)
  ];

  it('keeps only the user’s actionable, cleared items, sorted', () => {
    const result = filterWorkQueue(items, { userId: 'u-me', maxClearanceTier: 3 });
    expect(result.map((i) => i.id)).toEqual(['mine-high', 'mine-normal']);
  });

  it('honours excludeIds (e.g. actions completed this session)', () => {
    const result = filterWorkQueue(items, { userId: 'u-me', maxClearanceTier: 3, excludeIds: new Set(['mine-high']) });
    expect(result.map((i) => i.id)).toEqual(['mine-normal']);
  });
});

describe('unread (CMS-013 AC8)', () => {
  it('flags and counts unseen items', () => {
    expect(isUnread(stub({ seen: false }))).toBe(true);
    expect(isUnread(stub({ seen: true }))).toBe(false);
    const q = [stub({ id: 'a', seen: false }), stub({ id: 'b', seen: true }), stub({ id: 'c', seen: false })];
    expect(workQueueUnreadCount(q)).toBe(2);
  });
});
