import { SPHttpClient } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IApprovalTaskService } from '../interfaces/IApprovalTaskService';
import { IApprovalChainStep, ISignaturePlacement } from '../../models/IApprovalChain';
import {
  ApprovalMode,
  ApprovalTaskStatus,
  IApprovalDecisionInput,
  IApprovalSignatureCompletionInput,
  IApprovalSignatureInput,
  IApprovalTask,
} from '../../models/IApprovalTask';
import { ApprovalStepType } from '../../models/IApprovalChain';
import { expandChainToTaskDrafts } from './approvalTaskFactory';
import {
  IApprovalCorrespondenceSummary,
  IApprovalInboxScope,
  IApprovalInboxSource,
} from '../../models/IApprovalInbox';
import { escapeODataLiteral, idInClause } from '../common/odata';
import { mapStatus } from '../common/mapCorrespondenceRow';
import { securityLevelToTier } from '../common/clearance';
import { assertStepsSwappable } from './approvalReorder';

interface IApprovalTaskListItem {
  Id: number;
  Title?: string;
  CorrespondenceId?: string;
  ReferenceNo?: string;
  StepOrder?: number;
  StepType?: string;
  StepName?: string;
  ApprovalMode?: string;
  AssignedToId?: string;
  AssignedToName?: string;
  AssignedToTeam?: string;
  Seniority?: number;
  RequireSignature?: boolean;
  SignaturePlacement?: string;
  SignatureExternalDocumentId?: string;
  SignatureRequestedAt?: string;
  SignatureRequestedBy?: string;
  SignatureCompletedAt?: string;
  SignatureCompletedBy?: string;
  Status?: string;
  DecisionComment?: string;
  DecidedBy?: string;
  DecidedAt?: string;
}

const CORRESPONDENCE_LIST = 'CORMS_Correspondence';
/** Ids per OR-filter, keeping each request URL well within SharePoint's limits. */
const QUERY_CHUNK = 20;
const INBOX_LIMIT = 1000;

interface ICorrespondenceSummaryItem {
  Id: number;
  Title?: string;
  ReferenceNo?: string;
  DueDate?: string;
  Priority?: string;
  SecurityLevel?: string;
  Status?: string;
  Sender?: { Title?: string };
}

function toSummary(item: ICorrespondenceSummaryItem): IApprovalCorrespondenceSummary {
  return {
    id: String(item.Id),
    subject: item.Title ?? '',
    referenceNumber: item.ReferenceNo || undefined,
    dueDate: item.DueDate || undefined,
    priority: item.Priority === 'High' ? 'High' : 'Normal',
    securityTier: item.SecurityLevel ? securityLevelToTier(item.SecurityLevel) : undefined,
    status: mapStatus(item.Status),
    senderName: item.Sender?.Title || undefined,
  };
}

/** A user's own tasks: their people-picker key contains their email, else their name matches, or a
 * team task is for their department. */
function ownTasksFilter(scope: IApprovalInboxScope): string | undefined {
  const clauses: string[] = [];
  if (scope.email) clauses.push(`substringof('${escapeODataLiteral(scope.email)}', AssignedToId)`);
  if (scope.name) clauses.push(`AssignedToName eq '${escapeODataLiteral(scope.name)}'`);
  if (scope.department) clauses.push(`AssignedToTeam eq '${escapeODataLiteral(scope.department)}'`);
  return clauses.length > 0 ? clauses.join(' or ') : undefined;
}

function chunk<T>(values: T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < values.length; i += size) parts.push(values.slice(i, i + size));
  return parts;
}

// CMS-006 — live CORMS_ApprovalTasks store. Assignees are held as plain text (claims key + display
// name) rather than a People field, so a task can be written without resolving the picker's login
// to a site-user id — the detail screen matches on the same claims key it routed with.
export class ApprovalTaskServiceLive implements IApprovalTaskService {
  constructor(
    private readonly context: WebPartContext,
    private readonly siteUrl: string,
    private readonly listName: string = 'CORMS_ApprovalTasks'
  ) {}

  private itemsUrl(): string {
    return `${this.siteUrl}/_api/web/lists/getbytitle('${this.listName}')/items`;
  }

  private toModel(item: IApprovalTaskListItem): IApprovalTask {
    return {
      id: String(item.Id),
      correspondenceId: item.CorrespondenceId ?? '',
      referenceNo: item.ReferenceNo || undefined,
      stepOrder: item.StepOrder ?? 1,
      stepType: (item.StepType as ApprovalStepType) ?? 'Reviewer',
      stepName: item.StepName ?? '',
      mode: (item.ApprovalMode as ApprovalMode) ?? 'All',
      assignedToId: item.AssignedToId || undefined,
      assignedToName: item.AssignedToName || undefined,
      assignedToTeam: item.AssignedToTeam || undefined,
      seniority: typeof item.Seniority === 'number' ? item.Seniority : undefined,
      requireSignature: item.RequireSignature === true,
      signaturePlacement: parsePlacement(item.SignaturePlacement),
      signatureExternalDocumentId: item.SignatureExternalDocumentId || undefined,
      signatureRequestedAt: item.SignatureRequestedAt || undefined,
      signatureRequestedBy: item.SignatureRequestedBy || undefined,
      signatureCompletedAt: item.SignatureCompletedAt || undefined,
      signatureCompletedBy: item.SignatureCompletedBy || undefined,
      status: (item.Status as ApprovalTaskStatus) ?? 'Pending',
      decisionComment: item.DecisionComment || undefined,
      decidedBy: item.DecidedBy || undefined,
      decidedAt: item.DecidedAt || undefined,
    };
  }

  public async getTasks(correspondenceId: string): Promise<IApprovalTask[]> {
    const filter = `CorrespondenceId eq '${correspondenceId.replace(/'/g, "''")}'`;
    const url = `${this.itemsUrl()}?$filter=${encodeURIComponent(filter)}&$orderby=StepOrder asc&$top=200`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(`Failed to read ${this.listName}: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { value: IApprovalTaskListItem[] };
    return body.value.map((item) => this.toModel(item));
  }

  public async getInbox(scope: IApprovalInboxScope): Promise<IApprovalInboxSource> {
    const ownFilter = scope.allUsers ? undefined : ownTasksFilter(scope);
    if (!scope.allUsers && !ownFilter) return { tasks: [], correspondences: [] };
    const scoped = await this.queryTasks(ownFilter);
    const ids = Array.from(new Set(scoped.map((task) => task.correspondenceId).filter(Boolean)));
    if (ids.length === 0) return { tasks: [], correspondences: [] };
    // The rest of each chain decides whether the user's task is theirs to act on yet.
    const tasks = scope.allUsers
      ? scoped
      : ([] as IApprovalTask[]).concat(
          ...(await Promise.all(
            chunk(ids, QUERY_CHUNK).map((part) => this.queryTasks(idInClause('CorrespondenceId', part)))
          ))
        );
    return { tasks, correspondences: await this.readCorrespondenceSummaries(ids) };
  }

  private async queryTasks(filter: string | undefined): Promise<IApprovalTask[]> {
    const where = filter ? `$filter=${encodeURIComponent(filter)}&` : '';
    const url = `${this.itemsUrl()}?${where}$orderby=Created desc&$top=${INBOX_LIMIT}`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(`Failed to read ${this.listName}: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { value: IApprovalTaskListItem[] };
    return body.value.map((item) => this.toModel(item));
  }

  private async readCorrespondenceSummaries(ids: string[]): Promise<IApprovalCorrespondenceSummary[]> {
    const numericIds = ids.filter((id) => /^\d+$/.test(id));
    const parts = await Promise.all(
      chunk(numericIds, QUERY_CHUNK).map(async (part) => {
        const filter = part.map((id) => `Id eq ${id}`).join(' or ');
        const url =
          `${this.siteUrl}/_api/web/lists/getbytitle('${CORRESPONDENCE_LIST}')/items` +
          `?$select=Id,Title,ReferenceNo,DueDate,Priority,SecurityLevel,Status,Sender/Title&$expand=Sender` +
          `&$filter=${encodeURIComponent(filter)}&$top=${QUERY_CHUNK}`;
        const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
          headers: { Accept: 'application/json;odata=nometadata' },
        });
        if (!response.ok) return [];
        const body = (await response.json()) as { value: ICorrespondenceSummaryItem[] };
        return body.value.map(toSummary);
      })
    );
    return ([] as IApprovalCorrespondenceSummary[]).concat(...parts);
  }

  public async createTasksForChain(
    correspondenceId: string,
    referenceNo: string | undefined,
    chain: IApprovalChainStep[]
  ): Promise<IApprovalTask[]> {
    const drafts = expandChainToTaskDrafts(correspondenceId, referenceNo, chain);
    for (const draft of drafts) {
      const body = {
        Title: `Approval — Step ${draft.stepOrder} — ${draft.stepName}`,
        CorrespondenceId: draft.correspondenceId,
        ReferenceNo: draft.referenceNo ?? '',
        StepOrder: draft.stepOrder,
        StepType: draft.stepType,
        StepName: draft.stepName,
        ApprovalMode: draft.mode,
        AssignedToId: draft.assignedToId ?? '',
        AssignedToName: draft.assignedToName ?? '',
        AssignedToTeam: draft.assignedToTeam ?? '',
        Seniority: draft.seniority ?? null,
        RequireSignature: draft.requireSignature,
        SignaturePlacement: draft.signaturePlacement ? JSON.stringify(draft.signaturePlacement) : '',
        Status: 'Pending',
      };
      const response = await this.context.spHttpClient.post(this.itemsUrl(), SPHttpClient.configurations.v1, {
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`Failed to create ${this.listName} item: ${response.status} ${response.statusText}`);
      }
    }
    return this.getTasks(correspondenceId);
  }

  public async swapSteps(
    correspondenceId: string,
    stepOrder: number,
    otherStepOrder: number
  ): Promise<IApprovalTask[]> {
    const tasks = await this.getTasks(correspondenceId);
    assertStepsSwappable(tasks, stepOrder, otherStepOrder);
    const moves = tasks
      .filter((task) => task.stepOrder === stepOrder || task.stepOrder === otherStepOrder)
      .map((task) => ({ task, order: task.stepOrder === stepOrder ? otherStepOrder : stepOrder }));
    for (const { task, order } of moves) {
      await this.mergeItem(task.id, {
        StepOrder: order,
        Title: `Approval — Step ${order} — ${task.stepName}`,
      });
    }
    return this.getTasks(correspondenceId);
  }

  public async recordSignature(input: IApprovalSignatureInput): Promise<IApprovalTask[]> {
    const itemUrl = `${this.itemsUrl()}(${input.taskId})`;
    const getResp = await this.context.spHttpClient.get(itemUrl, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!getResp.ok) {
      throw new Error(
        `Failed to read ${this.listName} item ${input.taskId}: ${getResp.status} ${getResp.statusText}`
      );
    }
    const item = (await getResp.json()) as IApprovalTaskListItem;
    if (item.Status && item.Status !== 'Pending') return this.getTasks(item.CorrespondenceId ?? '');

    const updateResp = await this.context.spHttpClient.post(itemUrl, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'IF-MATCH': '*',
        'X-HTTP-Method': 'MERGE',
      },
      body: JSON.stringify({
        SignatureExternalDocumentId: input.externalDocumentId,
        SignatureRequestedBy: input.requestedBy,
        SignatureRequestedAt: input.requestedAt,
        ...(input.signaturePlacement ? { SignaturePlacement: JSON.stringify(input.signaturePlacement) } : {}),
      }),
    });
    if (!updateResp.ok) {
      throw new Error(
        `Failed to record the signing request for ${this.listName} item ${input.taskId}: ${updateResp.status} ${updateResp.statusText}`
      );
    }
    return this.getTasks(item.CorrespondenceId ?? '');
  }

  public async recordSignatureCompletion(input: IApprovalSignatureCompletionInput): Promise<IApprovalTask[]> {
    const itemUrl = `${this.itemsUrl()}(${input.taskId})`;
    const getResp = await this.context.spHttpClient.get(itemUrl, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!getResp.ok) {
      throw new Error(
        `Failed to read ${this.listName} item ${input.taskId}: ${getResp.status} ${getResp.statusText}`
      );
    }
    const item = (await getResp.json()) as IApprovalTaskListItem;
    if (item.Status && item.Status !== 'Pending') return this.getTasks(item.CorrespondenceId ?? '');
    if (!item.SignatureExternalDocumentId) {
      throw new Error('A signing request is required before its completion can be recorded.');
    }

    const updateResp = await this.context.spHttpClient.post(itemUrl, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'IF-MATCH': '*',
        'X-HTTP-Method': 'MERGE',
      },
      body: JSON.stringify({
        SignatureCompletedBy: input.completedBy,
        SignatureCompletedAt: input.completedAt,
      }),
    });
    if (!updateResp.ok) {
      throw new Error(
        `Failed to record the completed signature for ${this.listName} item ${input.taskId}: ${updateResp.status} ${updateResp.statusText}`
      );
    }
    return this.getTasks(item.CorrespondenceId ?? '');
  }

  public async decide(input: IApprovalDecisionInput): Promise<IApprovalTask[]> {
    // Read the task first to learn its correspondence, so we can return the refreshed chain.
    const itemUrl = `${this.itemsUrl()}(${input.taskId})`;
    const getResp = await this.context.spHttpClient.get(itemUrl, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!getResp.ok) {
      throw new Error(
        `Failed to read ${this.listName} item ${input.taskId}: ${getResp.status} ${getResp.statusText}`
      );
    }
    const item = (await getResp.json()) as IApprovalTaskListItem;
    // CMS-048 AC6 — idempotent: a task that has already been decided is not re-advanced.
    if (item.Status && item.Status !== 'Pending') {
      return this.getTasks(item.CorrespondenceId ?? '');
    }
    if (input.outcome === 'Approved' && item.RequireSignature && !item.SignatureCompletedAt) {
      throw new Error('A completed signature is required before this task can be approved.');
    }
    const updateResp = await this.context.spHttpClient.post(itemUrl, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'IF-MATCH': '*',
        'X-HTTP-Method': 'MERGE',
      },
      body: JSON.stringify({
        Status: input.outcome,
        DecisionComment: input.comment ?? '',
        DecidedBy: input.decidedBy,
        DecidedAt: input.decidedAt,
      }),
    });
    if (!updateResp.ok) {
      throw new Error(
        `Failed to update ${this.listName} item ${input.taskId}: ${updateResp.status} ${updateResp.statusText}`
      );
    }
    const tasks = await this.getTasks(item.CorrespondenceId ?? '');
    if (input.outcome !== 'Rejected') return tasks;
    // A rejection ends the chain: nobody acts on the tasks still waiting, so they are cancelled.
    const pending = tasks.filter((task) => task.status === 'Pending');
    for (const task of pending) {
      await this.mergeItem(task.id, { Status: 'Cancelled', DecidedAt: input.decidedAt });
    }
    return pending.length > 0 ? this.getTasks(item.CorrespondenceId ?? '') : tasks;
  }

  private async mergeItem(id: string, fields: Record<string, unknown>): Promise<void> {
    const response = await this.context.spHttpClient.post(
      `${this.itemsUrl()}(${id})`,
      SPHttpClient.configurations.v1,
      {
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
          'IF-MATCH': '*',
          'X-HTTP-Method': 'MERGE',
        },
        body: JSON.stringify(fields),
      }
    );
    if (!response.ok) {
      throw new Error(
        `Failed to update ${this.listName} item ${id}: ${response.status} ${response.statusText}`
      );
    }
  }
}

function parsePlacement(raw: string | undefined): ISignaturePlacement | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as ISignaturePlacement;
    return typeof parsed?.page === 'number' ? parsed : undefined;
  } catch {
    return undefined;
  }
}
