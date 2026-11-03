import { ICreateCorrespondenceFormState, IFormErrors, isMainDocumentSigned } from './types';
import { hasEmptyGroup, overlappingSignatureStepIds } from './approvalChain';
import { isClassifiedCaptureTier } from './classificationRules';

/**
 * CMS-034 AC5 — the vetting context Send needs to enforce the classified-capture threshold. Both
 * fields are optional so callers that don't have them (e.g. isFormValid, unit tests of the other
 * rules) get the pre-CMS-034 behaviour: with no threshold, or vetting unknown, the gate is a no-op.
 */
export interface ISendValidationContext {
  /** Security tier at/above which capture is restricted to vetted users (CORMS_AdminConfig). */
  classifiedCaptureThreshold?: number;
  /** Whether the current user is vetted for classified capture. Only a *known* false blocks. */
  isVettedForClassifiedCapture?: boolean;
}

// Send-time validation per TASK-05 §5 step 1 — the required core-metadata set from §4.1's
// required markers (Type, Subject, Sender, Recipient, Security Level, Record Classification,
// Destination Type, Destination). No number is consumed until this passes (CMS-034 AC4).
export function validateForSend(
  state: ICreateCorrespondenceFormState,
  context: ISendValidationContext = {}
): IFormErrors {
  const errors: IFormErrors = {};

  if (!state.subject.trim()) {
    errors.subject = 'createCorrespondence.validation.required';
  }
  if (!state.sender.trim()) {
    errors.sender = 'createCorrespondence.validation.required';
  }
  if (state.recipientIds.length === 0) {
    errors.recipient = 'createCorrespondence.validation.required';
  }
  if (!state.securityTier) {
    errors.securityTier = 'createCorrespondence.validation.required';
  }

  // CMS-034 AC4 — Record Classification is mandatory and validated before a controlled number is
  // issued; AC3 — a previously-selected classification that has since become inactive/retired
  // blocks Send with its own explanatory message rather than being silently accepted.
  if (!state.recordClassificationId) {
    errors.recordClassification = 'createCorrespondence.validation.recordClassificationRequired';
  } else if (state.recordClassificationActive === false) {
    errors.recordClassification = 'createCorrespondence.validation.recordClassificationInactive';
  }

  // CMS-034 AC5 — capturing at/above the configured classified-capture threshold is restricted to
  // vetted users. Only a *known* non-vetted user is blocked (undefined vetting is treated as
  // allowed, so the gate never falsely blocks before the signal resolves).
  if (
    isClassifiedCaptureTier(state.securityTier, context.classifiedCaptureThreshold) &&
    context.isVettedForClassifiedCapture === false
  ) {
    errors.classifiedCapture = 'createCorrespondence.validation.classifiedCaptureNotVetted';
  }

  if (state.destinationType === 'Internal' && state.destinationDepartmentIds.length === 0) {
    errors.destination = 'createCorrespondence.validation.destinationRequired';
  }
  if (state.destinationType === 'External' && state.externalOrgIds.length === 0) {
    errors.destination = 'createCorrespondence.validation.destinationRequired';
  }

  // CMS-001 AC6/AC7 (main letter identification), flagged via manual testing: the correspondence
  // record *is* its main document — Send must not succeed with no document identified at all.
  // Only Outgoing has a "Use Template" mode at all (Incoming always has both upload and scan,
  // ComposeDocumentSection's Upload/Scan pairing, CMS-040) — everywhere else, an uploaded or
  // scanned document satisfies this. Rendering the template to PDF is a separate, already-flagged
  // downstream integration (CreateCorrespondenceView's own TODO(confirm)) — this only checks that
  // a document/body exists, not that it's been converted.
  const hasComposeDocument =
    state.correspondenceType === 'Outgoing' && state.composeMode === 'template'
      ? Boolean(state.selectedTemplateId) && Boolean(state.bodyHtml.trim())
      : Boolean(
          state.uploadedDocumentName ||
          state.scannedDocumentName ||
          (state.existingDocumentName && state.existingDocumentUrl)
        );
  if (!hasComposeDocument) {
    errors.composeDocument = 'createCorrespondence.validation.composeDocumentRequired';
  }

  // A group is added empty and filled afterwards; routing one with no members would create a task
  // nobody can act on.
  const routesApprovals = state.correspondenceType === 'Outgoing' && !isMainDocumentSigned(state);
  if (routesApprovals && hasEmptyGroup(state.approvalSteps)) {
    errors.approvalWorkflow = 'createCorrespondence.validation.groupMembersRequired';
  } else if (routesApprovals && overlappingSignatureStepIds(state.approvalSteps).length > 0) {
    // Every signer signs the same document, so two boxes in one place would print over each other.
    errors.approvalWorkflow = 'createCorrespondence.validation.signaturesOverlap';
  }

  return errors;
}

export function isFormValid(state: ICreateCorrespondenceFormState): boolean {
  return Object.keys(validateForSend(state)).length === 0;
}
