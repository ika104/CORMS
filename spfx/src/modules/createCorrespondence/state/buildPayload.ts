import { ICreateCorrespondencePayload } from '../../../models/ICorrespondencePayload';
import { ICreateCorrespondenceFormState, isMainDocumentSigned } from './types';
import {
  buildSignOff,
  buildTemplateValues,
  composePrintableDocument,
  interpolatePlaceholders,
} from './templateContent';
import { buildApprovalChainPayload } from './approvalChain';

/**
 * CMS-005 AC15 — assembles the print-ready document HTML for an outgoing, template-authored item:
 * the interpolated header, the authored body, the auto sign-off and the interpolated footer. Only
 * produced when the item is Outgoing, a template is selected and a body exists (the same gate Send
 * enforces via validateForSend); otherwise undefined so uploaded/scanned/incoming items are left
 * untouched. `senderRole` is threaded from the caller so the sign-off carries the role where known.
 */
export function buildComposedDocumentHtml(
  state: ICreateCorrespondenceFormState,
  senderRole?: string
): string | undefined {
  const authoredFromTemplate =
    state.correspondenceType === 'Outgoing' && !!state.selectedTemplateId && !!state.bodyHtml.trim();
  if (!authoredFromTemplate) return undefined;
  const values = buildTemplateValues(state, senderRole);
  return composePrintableDocument({
    header: interpolatePlaceholders(state.templateHeader, values),
    bodyHtml: state.bodyHtml,
    signOff: buildSignOff(state.sender, senderRole),
    footer: interpolatePlaceholders(state.templateFooter, values),
    dir: state.bodyDir,
  });
}

/**
 * Builds ICorrespondenceService.create()'s payload from the form's own UI-shaped state — the one
 * place that translates ICreateCorrespondenceFormState into the backend's shape, so
 * CreateCorrespondenceView's handlers stay a thin call site.
 *
 * Destination departments/organizations are written by display name (not id) — the schema fields
 * they land in (DestinationDepartments/ExternalOrganizations, both Note) are plain text with no
 * established id-resolution convention on the read side yet, so names are what's actually useful
 * if the raw value is ever displayed directly.
 */
export function buildPayloadFromFormState(
  state: ICreateCorrespondenceFormState,
  senderRole?: string
): ICreateCorrespondencePayload {
  const mainDocumentSigned = isMainDocumentSigned(state);
  return {
    existingId: state.existingId,
    // CMS-022 — carry the reply's chain/parent linkage so the created item joins the parent thread.
    chainId: state.chainId,
    parentId: state.parentReplyToId,
    subject: state.subject,
    direction: state.correspondenceType,
    priority: state.priority,
    contentType: state.contentTypeName,
    channel: state.channel,
    originatingFunction: state.originatingFunction,
    securityTier: state.securityTier,
    recordClassification: state.recordClassificationLabel,
    destinationType: state.destinationType,
    destinationDepartments: state.destinationDepartmentNames,
    externalOrganizations: state.externalOrgNames,
    sender: state.sender,
    senderId: state.senderId,
    existingDocumentUrl: state.existingDocumentUrl,
    existingDocumentName: state.existingDocumentName,
    recipient: state.recipientNames.length ? state.recipientNames.join('; ') : undefined,
    dueDate: state.dueDate,
    deliveryEmail: state.deliveryEmail,
    deliveryPhysicalMail: state.deliveryPhysicalMail,
    // Only carry the dispatch when Physical Mail is actually selected, so an unticked box never
    // ships a stale dispatch captured earlier.
    physicalDispatch: state.deliveryPhysicalMail ? state.physicalDispatch : undefined,
    comments: state.comments,
    // Passed unconditionally (not gated on direction here) so CorrespondenceServiceCore's own
    // Incoming+template rejection (CMS-001 AC3) genuinely catches stale state — e.g. a template
    // picked while Outgoing, then the user flips to Incoming (setCorrespondenceType doesn't clear
    // selectedTemplateId today).
    templateReference: state.selectedTemplateId,
    // CMS-037 AC4 — the template revision the body was authored from, captured at selection time
    // (applyTemplate) and stamped onto the correspondence so a declared/delivered record carries it.
    templateVersion: state.selectedTemplateVersion,
    // CMS-005 AC15 — the print-ready document that becomes the main document (rendered to PDF
    // downstream). Undefined for uploaded/scanned/incoming items.
    composedDocumentHtml: buildComposedDocumentHtml(state, senderRole),
    // CMS-006 AC8/AC9 — the built approval chain, Outgoing only and only when at least one step
    // exists (the approval section isn't presented for Incoming). Undefined otherwise so no chain
    // is ever routed for an incoming item or an outgoing one with no reviewers, or for an already
    // signed document, which needs no approvals.
    approvalChain:
      state.correspondenceType === 'Outgoing' && !mainDocumentSigned && state.approvalSteps.length > 0
        ? buildApprovalChainPayload(state.approvalSteps)
        : undefined,
    mainDocumentSigned,
  };
}
