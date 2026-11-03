import { ApprovalTaskServiceMock } from '../../../services/approvalTasks/ApprovalTaskService.mock';
import { IApprovalActionServices, decideApprovalTask } from '../approvalTaskActions';

describe('decideApprovalTask', () => {
  it('records the decision, moves the correspondence to the chain status and writes audit and Timeline', async () => {
    const approvalTaskService = new ApprovalTaskServiceMock();
    const [task] = await approvalTaskService.createTasksForChain('c-501', 'REF-501', [
      {
        order: 1,
        type: 'Reviewer',
        name: 'Abdullah Reda',
        requireSignature: false,
        participants: [{ id: 'i:0#.f|membership|abdullah@example.com', name: 'Abdullah Reda' }],
      },
    ]);
    const detail = {
      setStatus: jest.fn().mockResolvedValue(undefined),
      logView: jest.fn().mockResolvedValue(undefined),
      addTimelineEntry: jest.fn().mockResolvedValue(undefined),
    };
    const services = {
      approvalTaskService,
      correspondenceDetailService: detail,
    } as unknown as IApprovalActionServices;

    const updated = await decideApprovalTask(
      services,
      { correspondenceId: 'c-501', subject: 'Memo', actorName: 'Zeyad Elmaghraby', actorEmail: 'zeyad@example.com' },
      task,
      'Approved',
      'Looks good'
    );

    expect(updated[0].status).toBe('Approved');
    expect(detail.setStatus).toHaveBeenCalledWith('c-501', 'Approved');
    expect(detail.logView).toHaveBeenCalledWith(
      'c-501',
      'Approval Approved',
      expect.stringContaining('approved by Zeyad Elmaghraby on behalf of Abdullah Reda — Looks good')
    );
    // The step event, then the final "all steps complete" summary.
    expect(detail.addTimelineEntry.mock.calls.map((call) => call[1])).toEqual(['Approved', 'Approved']);
  });
});
