import { canManageApprovers, nextStepOrder } from '../approverManagement';
import { IApprovalTask } from '../../../models/IApprovalTask';

describe('canManageApprovers', () => {
  const requestor = { viewerIsRequestor: true, status: 'Registered' as const };

  it('lets the requestor add approvers to an item with no approval chain yet', () => {
    expect(canManageApprovers(requestor)).toBe(true);
  });

  it('keeps an in-review or approved chain open to more approvers', () => {
    expect(canManageApprovers({ ...requestor, status: 'InReview', chainOutcome: 'InProgress' })).toBe(true);
    expect(canManageApprovers({ ...requestor, status: 'Approved', chainOutcome: 'Approved' })).toBe(true);
  });

  it('is open to the requestor and to System Administrators only', () => {
    expect(canManageApprovers({ ...requestor, viewerIsRequestor: false, viewerIsSystemAdmin: true })).toBe(
      true
    );
    expect(canManageApprovers({ ...requestor, viewerIsRequestor: false })).toBe(false);
    expect(canManageApprovers({ ...requestor, viewerIsRequestor: undefined })).toBe(false);
  });

  it('is closed for an already-signed document and for a rejected or returned chain', () => {
    expect(canManageApprovers({ ...requestor, mainDocumentSigned: true })).toBe(false);
    expect(canManageApprovers({ ...requestor, status: 'InReview', chainOutcome: 'Rejected' })).toBe(false);
    expect(canManageApprovers({ ...requestor, status: 'Draft', chainOutcome: 'Returned' })).toBe(false);
  });

  it('is closed once the item is signed, declared or delivered', () => {
    expect(canManageApprovers({ ...requestor, status: 'Signed' })).toBe(false);
    expect(canManageApprovers({ ...requestor, status: 'Declared' })).toBe(false);
    expect(canManageApprovers({ ...requestor, status: 'Delivered' })).toBe(false);
  });
});

describe('nextStepOrder', () => {
  it('starts at 1 and otherwise follows the last existing step', () => {
    expect(nextStepOrder([])).toBe(1);
    expect(nextStepOrder([{ stepOrder: 1 }, { stepOrder: 3 }, { stepOrder: 2 }] as IApprovalTask[])).toBe(4);
  });
});
