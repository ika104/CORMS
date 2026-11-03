import { ApprovalDecision, IApprovalTask } from '../../models/IApprovalTask';
import { ISignatureRequestResult } from '../../models/IESignature';
import { ITimelineEvent } from '../../models/ICorrespondenceDetail';
import { IApprovalTaskService } from '../../services/interfaces/IApprovalTaskService';
import { IESignatureService } from '../../services/interfaces/IESignatureService';
import { ISigningService } from '../../services/interfaces/ISigningService';
import {
  ICorrespondenceDetailService,
  isAccessDenied,
} from '../../services/interfaces/ICorrespondenceDetailService';
import { evaluateChainProgress } from '../../services/approvalTasks/approvalProgress';
import { actingOnBehalfOf } from '../../services/approvalTasks/approvalActor';
import { resolveSigningPlacement } from '../../services/approvalTasks/signingPlacement';
import { pageSigningReturnUrl } from '../../services/esignature/signingReturn';

/**
 * The approver's actions on an approval task — signing and deciding — shared by the Approval Tasks
 * screen. Each action updates the task, the correspondence and its signed main document, and
 * records the audit and Timeline entries every viewer sees.
 */

export interface IApprovalActionServices {
  approvalTaskService: IApprovalTaskService;
  eSignatureService: IESignatureService;
  signingService: ISigningService;
  correspondenceDetailService: ICorrespondenceDetailService;
}

export interface IApprovalActionContext {
  correspondenceId: string;
  referenceNumber?: string;
  subject: string;
  /** The signed-in user taking the action. */
  actorName: string;
  actorEmail?: string;
}

/** Approval events with their own Timeline marker; every other approval action is an edit. */
export const APPROVAL_TIMELINE_EVENTS: Record<string, { eventType: string; kind: ITimelineEvent['kind'] }> = {
  'Approval Approved': { eventType: 'Approved', kind: 'approved' },
  'Approval Rejected': { eventType: 'Rejected', kind: 'rejected' },
};

const FINAL_APPROVAL_SUMMARY = 'Correspondence approved — all approval steps complete';

/** "Zeyad Elmaghraby on behalf of Abdullah Reda" when someone acts for the task's assignee. */
function actorFor(task: IApprovalTask, context: IApprovalActionContext): string {
  const assignee = actingOnBehalfOf(task, { name: context.actorName, email: context.actorEmail });
  return assignee ? `${context.actorName} on behalf of ${assignee}` : context.actorName;
}

/** Audits an approval action and writes its Timeline event; a final approval adds a summary after it. */
async function recordApprovalEvent(
  services: IApprovalActionServices,
  correspondenceId: string,
  action: string,
  details: string,
  finalApproval = false
): Promise<void> {
  const { eventType } = APPROVAL_TIMELINE_EVENTS[action] ?? { eventType: 'Edited' };
  const detailService = services.correspondenceDetailService;
  await detailService.logView(correspondenceId, action, details).catch(() => undefined);
  await detailService.addTimelineEntry(correspondenceId, eventType, details).catch(() => undefined);
  if (finalApproval) {
    await detailService.addTimelineEntry(correspondenceId, 'Approved', FINAL_APPROVAL_SUMMARY).catch(() => undefined);
  }
}

/** The signed PDF becomes the main document, so the next signer signs the same, already-signed file. */
export async function saveSignedDocumentAsMain(
  services: Pick<IApprovalActionServices, 'eSignatureService' | 'correspondenceDetailService'>,
  correspondenceId: string,
  externalDocumentId: string
): Promise<void> {
  const signed = await services.eSignatureService.getSignedDocument(externalDocumentId);
  const saved = await services.correspondenceDetailService.saveSignedMainDocument(correspondenceId, signed.content);
  if (isAccessDenied(saved)) throw new Error('Access denied');
}

/**
 * Sends the current main document to the signing flow for the actor, with this task's signature box
 * moved clear of earlier signers, and records the request on the task.
 */
export async function requestApprovalSignature(
  services: IApprovalActionServices,
  context: IApprovalActionContext,
  task: IApprovalTask,
  tasks: IApprovalTask[],
  missingIdentityMessage: string,
  noDocumentMessage: string
): Promise<{ request: ISignatureRequestResult; tasks: IApprovalTask[] }> {
  if (!context.actorName || !context.actorEmail) throw new Error(missingIdentityMessage);
  const attachments = await services.correspondenceDetailService.getAttachments(context.correspondenceId);
  const uploaded = isAccessDenied(attachments) ? [] : attachments.uploaded;
  const main = uploaded.find((attachment) => attachment.isMain) ?? uploaded[0];
  if (!main?.url) throw new Error(noDocumentMessage);

  // no-store: each signed version replaces the main document at the same address.
  const fileResp = await fetch(main.url, { cache: 'no-store' });
  if (!fileResp.ok) throw new Error(`Could not read the document (${fileResp.status}).`);
  const placement = resolveSigningPlacement(task, tasks);
  const request = await services.eSignatureService.sendForSignature({
    correspondenceId: context.correspondenceId,
    referenceNumber: context.referenceNumber ?? '',
    subject: context.subject,
    fileName: main.name,
    fileContent: await fileResp.blob(),
    signers: [{ name: context.actorName, email: context.actorEmail, placement }],
    returnUrl: pageSigningReturnUrl(),
  });
  await services.signingService.createSession(
    {
      correspondenceId: context.correspondenceId,
      referenceNumber: context.referenceNumber ?? '',
      subject: context.subject,
      signerName: context.actorName,
      signerEmail: context.actorEmail,
      externalDocumentId: request.externalDocumentId,
    },
    context.actorName
  );
  const updated = await services.approvalTaskService.recordSignature({
    taskId: task.id,
    externalDocumentId: request.externalDocumentId,
    requestedBy: context.actorName,
    requestedAt: new Date().toISOString(),
    signaturePlacement: placement,
  });
  await recordApprovalEvent(
    services,
    context.correspondenceId,
    'Approval signature requested',
    `Step ${task.stepOrder} (${task.stepName}) signing request created by ${actorFor(task, context)} — external document ${request.externalDocumentId}`
  );
  return { request, tasks: updated };
}

/**
 * Confirms the signature with the flow and, once complete, saves the signed PDF as the main document
 * before recording completion on the task — so a failed save is retried by checking again. Resolves
 * undefined while the document is not signed yet.
 */
export async function completeApprovalSignature(
  services: IApprovalActionServices,
  context: IApprovalActionContext,
  task: IApprovalTask,
  externalDocumentId: string,
  saveFailedMessage: string
): Promise<IApprovalTask[] | undefined> {
  const status = await services.eSignatureService.getSignatureStatus(externalDocumentId);
  if (!status.isCompleted) return undefined;
  try {
    await saveSignedDocumentAsMain(services, context.correspondenceId, externalDocumentId);
  } catch {
    throw new Error(saveFailedMessage);
  }
  const updated = await services.approvalTaskService.recordSignatureCompletion({
    taskId: task.id,
    completedBy: context.actorName,
    completedAt: new Date().toISOString(),
  });
  await recordApprovalEvent(
    services,
    context.correspondenceId,
    'Approval signature completed',
    `Step ${task.stepOrder} (${task.stepName}) signature verified for external document ${externalDocumentId}`
  );
  return updated;
}

/** Records Approve / Reject / Return on the task and moves the correspondence to the chain's status. */
export async function decideApprovalTask(
  services: IApprovalActionServices,
  context: IApprovalActionContext,
  task: IApprovalTask,
  outcome: ApprovalDecision,
  comment: string
): Promise<IApprovalTask[]> {
  const updated = await services.approvalTaskService.decide({
    taskId: task.id,
    outcome,
    comment,
    decidedBy: context.actorName,
    decidedAt: new Date().toISOString(),
  });
  const progress = evaluateChainProgress(updated);
  await services.correspondenceDetailService
    .setStatus(context.correspondenceId, progress.correspondenceStatus)
    .catch(() => undefined);
  const stepStatus = progress.steps.find((step) => step.stepOrder === task.stepOrder)?.status ?? 'Pending';
  // CMS-048 AC8 — the signer, step and resulting step status are all in the audit trail.
  await recordApprovalEvent(
    services,
    context.correspondenceId,
    `Approval ${outcome}`,
    `Step ${task.stepOrder} (${task.stepName}) ${outcome.toLowerCase()} by ${actorFor(task, context)} — ${comment} · step now ${stepStatus}`,
    progress.outcome === 'Approved'
  );
  return updated;
}
