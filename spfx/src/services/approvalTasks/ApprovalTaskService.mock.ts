import { IApprovalTaskService } from '../interfaces/IApprovalTaskService';
import { IApprovalChainStep } from '../../models/IApprovalChain';
import {
  IApprovalDecisionInput,
  IApprovalSignatureCompletionInput,
  IApprovalSignatureInput,
  IApprovalTask,
} from '../../models/IApprovalTask';
import { expandChainToTaskDrafts } from './approvalTaskFactory';
import { assertStepsSwappable } from './approvalReorder';
import { isAssignedTo } from './approvalActor';
import { IApprovalInboxScope, IApprovalInboxSource } from '../../models/IApprovalInbox';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import correspondenceMock from '../../mocks/correspondence.json';

const demoCorrespondence = correspondenceMock as ICorrespondenceStub[];

const SIMULATED_LATENCY_MS = 120;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

/**
 * CMS-006 — in-memory approval-task store for DEV / tests. Tasks created by createTasksForChain
 * persist for the life of the session (module-scoped, shared across service instances) so a chain
 * routed on Send is still there when the correspondence detail screen reads it back.
 */
const store = new Map<string, IApprovalTask[]>();
let idCounter = 0;

export class ApprovalTaskServiceMock implements IApprovalTaskService {
  public getTasks(correspondenceId: string): Promise<IApprovalTask[]> {
    return delay((store.get(correspondenceId) ?? []).map((t) => ({ ...t })));
  }

  public getInbox(scope: IApprovalInboxScope): Promise<IApprovalInboxSource> {
    const all = Array.from(store.values()).reduce((acc, tasks) => acc.concat(tasks), [] as IApprovalTask[]);
    const ids = new Set(
      all.filter((task) => scope.allUsers || isAssignedTo(task, scope)).map((t) => t.correspondenceId)
    );
    const tasks = all.filter((task) => ids.has(task.correspondenceId)).map((t) => ({ ...t }));
    const correspondences = Array.from(ids).map((id) => {
      const stub = demoCorrespondence.find((c) => c.id === id);
      return {
        id,
        subject: stub?.subject ?? tasks.find((t) => t.correspondenceId === id)?.referenceNo ?? id,
        referenceNumber: stub?.referenceNumber,
        dueDate: stub?.dueDate,
        priority: stub?.priority,
        securityTier: stub?.securityTier,
        status: stub?.status,
        senderName: stub?.senderName,
      };
    });
    return delay({ tasks, correspondences });
  }

  public createTasksForChain(
    correspondenceId: string,
    referenceNo: string | undefined,
    chain: IApprovalChainStep[]
  ): Promise<IApprovalTask[]> {
    const tasks: IApprovalTask[] = expandChainToTaskDrafts(correspondenceId, referenceNo, chain).map(
      (draft) => {
        idCounter += 1;
        return { ...draft, id: `apt-${idCounter}`, status: 'Pending' };
      }
    );
    const all = (store.get(correspondenceId) ?? []).concat(tasks);
    store.set(correspondenceId, all);
    return delay(all.map((t) => ({ ...t })));
  }

  public swapSteps(
    correspondenceId: string,
    stepOrder: number,
    otherStepOrder: number
  ): Promise<IApprovalTask[]> {
    const tasks = store.get(correspondenceId) ?? [];
    try {
      assertStepsSwappable(tasks, stepOrder, otherStepOrder);
    } catch (err) {
      return Promise.reject(err);
    }
    // Sorted like the live list's StepOrder ordering.
    const swapped = tasks
      .map((t) =>
        t.stepOrder === stepOrder
          ? { ...t, stepOrder: otherStepOrder }
          : t.stepOrder === otherStepOrder
            ? { ...t, stepOrder }
            : t
      )
      .sort((a, b) => a.stepOrder - b.stepOrder);
    store.set(correspondenceId, swapped);
    return delay(swapped.map((t) => ({ ...t })));
  }

  public recordSignature(input: IApprovalSignatureInput): Promise<IApprovalTask[]> {
    const keys = Array.from(store.keys());
    for (const correspondenceId of keys) {
      const tasks = store.get(correspondenceId) ?? [];
      const index = tasks.findIndex((t) => t.id === input.taskId);
      if (index === -1) continue;
      tasks[index] = {
        ...tasks[index],
        signatureExternalDocumentId: input.externalDocumentId,
        signatureRequestedBy: input.requestedBy,
        signatureRequestedAt: input.requestedAt,
        ...(input.signaturePlacement ? { signaturePlacement: input.signaturePlacement } : {}),
      };
      store.set(correspondenceId, tasks);
      return delay(tasks.map((t) => ({ ...t })));
    }
    return delay([]);
  }

  public recordSignatureCompletion(input: IApprovalSignatureCompletionInput): Promise<IApprovalTask[]> {
    const keys = Array.from(store.keys());
    for (const correspondenceId of keys) {
      const tasks = store.get(correspondenceId) ?? [];
      const index = tasks.findIndex((t) => t.id === input.taskId);
      if (index === -1) continue;
      if (!tasks[index].signatureExternalDocumentId) {
        return Promise.reject(
          new Error('A signing request is required before its completion can be recorded.')
        );
      }
      tasks[index] = {
        ...tasks[index],
        signatureCompletedBy: input.completedBy,
        signatureCompletedAt: input.completedAt,
      };
      store.set(correspondenceId, tasks);
      return delay(tasks.map((t) => ({ ...t })));
    }
    return delay([]);
  }

  public decide(input: IApprovalDecisionInput): Promise<IApprovalTask[]> {
    const keys = Array.from(store.keys());
    for (const correspondenceId of keys) {
      const tasks = store.get(correspondenceId) ?? [];
      const index = tasks.findIndex((t) => t.id === input.taskId);
      if (index === -1) continue;
      // CMS-048 AC6 — recording a decision is idempotent: a task that has already been decided is
      // never re-advanced or overwritten by a repeat action.
      if (tasks[index].status !== 'Pending') return delay(tasks.map((t) => ({ ...t })));
      if (
        input.outcome === 'Approved' &&
        tasks[index].requireSignature &&
        !tasks[index].signatureCompletedAt
      ) {
        return Promise.reject(
          new Error('A completed signature is required before this task can be approved.')
        );
      }
      tasks[index] = {
        ...tasks[index],
        status: input.outcome,
        decisionComment: input.comment,
        decidedBy: input.decidedBy,
        decidedAt: input.decidedAt,
      };
      // A rejection ends the chain, so every task still waiting is cancelled (as the live list does).
      if (input.outcome === 'Rejected') {
        tasks.forEach((task, i) => {
          if (task.status === 'Pending')
            tasks[i] = { ...task, status: 'Cancelled', decidedAt: input.decidedAt };
        });
      }
      store.set(correspondenceId, tasks);
      return delay(tasks.map((t) => ({ ...t })));
    }
    return delay([]);
  }
}
