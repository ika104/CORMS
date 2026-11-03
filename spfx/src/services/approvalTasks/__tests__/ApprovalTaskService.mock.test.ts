import { ApprovalTaskServiceMock } from '../ApprovalTaskService.mock';
import { evaluateChainProgress } from '../approvalProgress';
import { IApprovalChainStep } from '../../../models/IApprovalChain';

const chain: IApprovalChainStep[] = [
  {
    order: 1,
    type: 'Reviewer',
    name: 'Alice',
    requireSignature: false,
    participants: [{ id: 'u-1', name: 'Alice' }],
  },
  {
    order: 2,
    type: 'Reviewer',
    name: 'Bob',
    requireSignature: false,
    participants: [{ id: 'u-2', name: 'Bob' }],
  },
];

describe('CMS-006 — ApprovalTaskServiceMock', () => {
  it('creates one task per participant, then reads them back for the correspondence', async () => {
    const svc = new ApprovalTaskServiceMock();
    const created = await svc.createTasksForChain('c-100', 'OUT-100', chain);
    expect(created).toHaveLength(2);
    const read = await svc.getTasks('c-100');
    expect(read.map((t) => t.stepOrder)).toEqual([1, 2]);
    expect(read.every((t) => t.status === 'Pending')).toBe(true);
  });

  it('appends steps added later instead of replacing the existing chain', async () => {
    const svc = new ApprovalTaskServiceMock();
    await svc.createTasksForChain('c-110', 'OUT-110', chain);
    const all = await svc.createTasksForChain('c-110', 'OUT-110', [
      {
        order: 3,
        type: 'Reviewer',
        name: 'Carol',
        requireSignature: true,
        participants: [{ id: 'u-3', name: 'Carol' }],
      },
    ]);
    expect(all.map((t) => t.stepOrder)).toEqual([1, 2, 3]);
  });

  it('swaps two pending steps, and refuses once a step has been decided', async () => {
    const svc = new ApprovalTaskServiceMock();
    await svc.createTasksForChain('c-111', 'OUT-111', chain);
    const swapped = await svc.swapSteps('c-111', 1, 2);
    expect(swapped.map((t) => `${t.stepOrder}:${t.stepName}`)).toEqual(['1:Bob', '2:Alice']);

    await svc.decide({
      taskId: swapped[0].id,
      outcome: 'Approved',
      decidedBy: 'Bob',
      decidedAt: '2026-09-24T10:00:00.000Z',
    });
    await expect(svc.swapSteps('c-111', 1, 2)).rejects.toThrow();
  });

  it('records a decision on the task and advances the chain to Approved when both steps approve', async () => {
    const svc = new ApprovalTaskServiceMock();
    const created = await svc.createTasksForChain('c-101', 'OUT-101', chain);

    let tasks = await svc.decide({
      taskId: created[0].id,
      outcome: 'Approved',
      decidedBy: 'Alice',
      decidedAt: '2026-09-05T10:00:00.000Z',
    });
    expect(evaluateChainProgress(tasks).correspondenceStatus).toBe('InReview');

    tasks = await svc.decide({
      taskId: created[1].id,
      outcome: 'Approved',
      decidedBy: 'Bob',
      decidedAt: '2026-09-05T11:00:00.000Z',
    });
    const progress = evaluateChainProgress(tasks);
    expect(progress.outcome).toBe('Approved');
    expect(progress.correspondenceStatus).toBe('Approved');
    const decided = tasks.find((t) => t.id === created[0].id)!;
    expect(decided).toMatchObject({ status: 'Approved', decidedBy: 'Alice' });
  });

  it('CMS-048 AC6 — a repeat decide on an already-decided task is an idempotent no-op', async () => {
    const svc = new ApprovalTaskServiceMock();
    const created = await svc.createTasksForChain('c-103', 'OUT-103', chain);
    await svc.decide({
      taskId: created[0].id,
      outcome: 'Approved',
      decidedBy: 'Alice',
      decidedAt: '2026-09-05T10:00:00.000Z',
    });
    // A repeat by (nominally) the same action must not overwrite the recorded decision.
    const after = await svc.decide({
      taskId: created[0].id,
      outcome: 'Rejected',
      decidedBy: 'Alice',
      decidedAt: '2026-09-05T12:00:00.000Z',
    });
    const t0 = after.find((t) => t.id === created[0].id)!;
    expect(t0.status).toBe('Approved');
    expect(t0.decidedAt).toBe('2026-09-05T10:00:00.000Z');
  });

  it('a rejection at step 1 marks it Rejected and leaves step 2 unreached', async () => {
    const svc = new ApprovalTaskServiceMock();
    const created = await svc.createTasksForChain('c-102', 'OUT-102', chain);
    const tasks = await svc.decide({
      taskId: created[0].id,
      outcome: 'Rejected',
      comment: 'Fix the figures',
      decidedBy: 'Alice',
      decidedAt: '2026-09-05T10:00:00.000Z',
    });
    const progress = evaluateChainProgress(tasks);
    expect(progress.outcome).toBe('Rejected');
    expect(progress.correspondenceStatus).toBe('Rejected');
    expect(progress.activeStepOrder).toBe(1);
    // Nobody acts on the rest of the chain, so its tasks are stored as Cancelled.
    expect(tasks.map((t) => t.status)).toEqual(['Rejected', 'Cancelled']);
  });

  it('requires a flow-verified completed signature before a signature-required task can approve', async () => {
    const svc = new ApprovalTaskServiceMock();
    const signatureChain: IApprovalChainStep[] = [
      {
        order: 1,
        type: 'Reviewer',
        name: 'Alice',
        requireSignature: true,
        participants: [{ id: 'u-1', name: 'Alice' }],
      },
    ];
    const [task] = await svc.createTasksForChain('c-104', 'OUT-104', signatureChain);

    await expect(
      svc.decide({
        taskId: task.id,
        outcome: 'Approved',
        decidedBy: 'Alice',
        decidedAt: '2026-09-05T10:00:00.000Z',
      })
    ).rejects.toThrow('completed signature is required');

    const signed = await svc.recordSignature({
      taskId: task.id,
      externalDocumentId: 'external-doc-104',
      requestedBy: 'Alice',
      requestedAt: '2026-09-05T10:01:00.000Z',
    });
    expect(signed[0]).toMatchObject({
      signatureExternalDocumentId: 'external-doc-104',
      signatureRequestedBy: 'Alice',
      signatureRequestedAt: '2026-09-05T10:01:00.000Z',
    });

    await expect(
      svc.decide({
        taskId: task.id,
        outcome: 'Approved',
        decidedBy: 'Alice',
        decidedAt: '2026-09-05T10:02:00.000Z',
      })
    ).rejects.toThrow('completed signature is required');

    const completed = await svc.recordSignatureCompletion({
      taskId: task.id,
      completedBy: 'Alice',
      completedAt: '2026-09-05T10:02:00.000Z',
    });
    expect(completed[0]).toMatchObject({
      signatureCompletedBy: 'Alice',
      signatureCompletedAt: '2026-09-05T10:02:00.000Z',
    });

    const approved = await svc.decide({
      taskId: task.id,
      outcome: 'Approved',
      decidedBy: 'Alice',
      decidedAt: '2026-09-05T10:03:00.000Z',
    });
    expect(approved[0].status).toBe('Approved');
  });
});
