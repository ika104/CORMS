import { IApprovalTask } from '../../../models/IApprovalTask';
import { actingOnBehalfOf, decidedOnBehalfOf } from '../approvalActor';

function task(overrides: Partial<IApprovalTask> = {}): IApprovalTask {
  return {
    id: 't',
    correspondenceId: 'c1',
    stepOrder: 1,
    stepType: 'Reviewer',
    stepName: 'Abdullah Reda',
    mode: 'All',
    requireSignature: false,
    status: 'Pending',
    assignedToId: 'i:0#.f|membership|abdullah.reda@ssloman.com',
    assignedToName: 'Abdullah Reda',
    ...overrides,
  };
}

describe('actingOnBehalfOf', () => {
  it('is undefined when the assignee acts, matched on the email in their claims key', () => {
    expect(
      actingOnBehalfOf(task(), { name: 'Abdullah R.', email: 'Abdullah.Reda@ssloman.com' })
    ).toBeUndefined();
  });

  it('names the assignee when an administrator or delegate acts for them', () => {
    expect(actingOnBehalfOf(task(), { name: 'Zeyad Elmaghraby', email: 'zeyad@ssloman.com' })).toBe(
      'Abdullah Reda'
    );
  });

  it('falls back to names when no email is known, and ignores team tasks', () => {
    expect(actingOnBehalfOf(task({ assignedToId: '12' }), { name: 'Abdullah Reda' })).toBeUndefined();
    expect(
      actingOnBehalfOf(task({ assignedToId: undefined, assignedToName: undefined }), { name: 'Anyone' })
    ).toBeUndefined();
  });
});

describe('decidedOnBehalfOf', () => {
  it('reports the assignee only when someone else recorded the decision', () => {
    expect(decidedOnBehalfOf(task({ status: 'Approved', decidedBy: 'Zeyad Elmaghraby' }))).toBe(
      'Abdullah Reda'
    );
    expect(decidedOnBehalfOf(task({ status: 'Approved', decidedBy: 'Abdullah Reda' }))).toBeUndefined();
    expect(decidedOnBehalfOf(task({ decidedBy: 'Zeyad Elmaghraby' }))).toBeUndefined();
  });
});
