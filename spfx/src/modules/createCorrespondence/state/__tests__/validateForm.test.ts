import { validateForSend } from '../validateForm';
import { ApprovalStep, createInitialFormState, ICreateCorrespondenceFormState } from '../types';

// A state that passes every rule except the one under test in each case below.
function validState(overrides: Partial<ICreateCorrespondenceFormState> = {}): ICreateCorrespondenceFormState {
  return {
    ...createInitialFormState('Alice'),
    subject: 'Test subject',
    sender: 'Alice',
    recipientIds: ['i:0#.f|membership|bob@corp.com'],
    recipientNames: ['Bob'],
    securityTier: 2,
    // CMS-034 — a valid state now carries a selected, active record classification.
    recordClassificationId: 'rc-1',
    recordClassificationLabel: 'rc-1 - Minutes of Meeting',
    recordClassificationActive: true,
    destinationType: 'Internal',
    destinationDepartmentIds: ['d-1'],
    destinationDepartmentNames: ['Finance'],
    ...overrides,
  };
}

// CMS-001 AC6/AC7, found via manual testing: the correspondence record is its own main document
// — Send must not succeed with no document identified at all (upload, scan, or a template with a
// body). Rendering the template to PDF is a separate, out-of-scope downstream integration; this
// rule only checks that a document/body exists.
describe('validateForSend — compose document is mandatory', () => {
  it('Incoming: rejects when nothing has been scanned', () => {
    const state = validState({ correspondenceType: 'Incoming' });

    expect(validateForSend(state).composeDocument).toBe(
      'createCorrespondence.validation.composeDocumentRequired'
    );
  });

  it('Incoming: passes once a document has been scanned', () => {
    const state = validState({ correspondenceType: 'Incoming', scannedDocumentName: 'scan-1.pdf' });

    expect(validateForSend(state).composeDocument).toBeUndefined();
  });

  it('Incoming: passes once a document has been uploaded (CMS-040 — Incoming gained an Upload option alongside Scan)', () => {
    const state = validState({ correspondenceType: 'Incoming', uploadedDocumentName: 'letter.pdf' });

    expect(validateForSend(state).composeDocument).toBeUndefined();
  });

  it('Outgoing, upload mode: rejects with neither an upload nor a scan', () => {
    const state = validState({ correspondenceType: 'Outgoing', composeMode: 'upload' });

    expect(validateForSend(state).composeDocument).toBe(
      'createCorrespondence.validation.composeDocumentRequired'
    );
  });

  it('Outgoing, upload mode: passes with an uploaded document', () => {
    const state = validState({
      correspondenceType: 'Outgoing',
      composeMode: 'upload',
      uploadedDocumentName: 'doc.pdf',
    });

    expect(validateForSend(state).composeDocument).toBeUndefined();
  });

  it('Outgoing, upload mode: passes with a scanned document even though composeMode is "upload"', () => {
    const state = validState({
      correspondenceType: 'Outgoing',
      composeMode: 'upload',
      scannedDocumentName: 'scan-1.pdf',
    });

    expect(validateForSend(state).composeDocument).toBeUndefined();
  });

  it('Outgoing, template mode: rejects with no template selected', () => {
    const state = validState({
      correspondenceType: 'Outgoing',
      composeMode: 'template',
      bodyHtml: '<p>Body</p>',
    });

    expect(validateForSend(state).composeDocument).toBe(
      'createCorrespondence.validation.composeDocumentRequired'
    );
  });

  it('Outgoing, template mode: rejects a selected template with an empty body', () => {
    const state = validState({
      correspondenceType: 'Outgoing',
      composeMode: 'template',
      selectedTemplateId: 'tpl-1',
      bodyHtml: '   ',
    });

    expect(validateForSend(state).composeDocument).toBe(
      'createCorrespondence.validation.composeDocumentRequired'
    );
  });

  it('Outgoing, template mode: passes with a selected template and a non-empty body', () => {
    const state = validState({
      correspondenceType: 'Outgoing',
      composeMode: 'template',
      selectedTemplateId: 'tpl-1',
      bodyHtml: '<p>Body</p>',
    });

    expect(validateForSend(state).composeDocument).toBeUndefined();
  });
});

describe('validateForSend — recipient (people picker) is mandatory', () => {
  it('rejects when no recipient has been picked', () => {
    const state = validState({ recipientIds: [], recipientNames: [], uploadedDocumentName: 'doc.pdf' });

    expect(validateForSend(state).recipient).toBe('createCorrespondence.validation.required');
  });

  it('passes with at least one recipient', () => {
    const state = validState({
      recipientIds: ['i:0#.f|membership|bob@corp.com'],
      recipientNames: ['Bob'],
      uploadedDocumentName: 'doc.pdf',
    });

    expect(validateForSend(state).recipient).toBeUndefined();
  });
});

// CMS-034 AC4 — Record Classification is mandatory before a controlled number is issued.
describe('validateForSend — record classification is mandatory (CMS-034 AC4)', () => {
  it('rejects when no classification has been selected', () => {
    const state = validState({ recordClassificationId: undefined, recordClassificationActive: undefined });

    expect(validateForSend(state).recordClassification).toBe(
      'createCorrespondence.validation.recordClassificationRequired'
    );
  });

  it('passes with an active classification selected', () => {
    const state = validState();

    expect(validateForSend(state).recordClassification).toBeUndefined();
  });
});

// CMS-034 AC3 — a selected classification that has become inactive/retired blocks Send.
describe('validateForSend — inactive record classification blocks Send (CMS-034 AC3)', () => {
  it('rejects a selected classification that is no longer active', () => {
    const state = validState({ recordClassificationActive: false });

    expect(validateForSend(state).recordClassification).toBe(
      'createCorrespondence.validation.recordClassificationInactive'
    );
  });

  it('does not block when the active state is still unknown (treated as allowed)', () => {
    const state = validState({ recordClassificationActive: undefined });

    expect(validateForSend(state).recordClassification).toBeUndefined();
  });
});

// CMS-034 AC5 — capture at/above the configured threshold is restricted to vetted users.
describe('validateForSend — classified-capture vetting (CMS-034 AC5)', () => {
  it('blocks a non-vetted user capturing at/above the threshold', () => {
    const state = validState({ securityTier: 4 });

    const errors = validateForSend(state, {
      classifiedCaptureThreshold: 4,
      isVettedForClassifiedCapture: false,
    });

    expect(errors.classifiedCapture).toBe('createCorrespondence.validation.classifiedCaptureNotVetted');
  });

  it('allows a vetted user capturing at/above the threshold', () => {
    const state = validState({ securityTier: 5 });

    const errors = validateForSend(state, {
      classifiedCaptureThreshold: 4,
      isVettedForClassifiedCapture: true,
    });

    expect(errors.classifiedCapture).toBeUndefined();
  });

  it('allows a non-vetted user capturing below the threshold', () => {
    const state = validState({ securityTier: 2 });

    const errors = validateForSend(state, {
      classifiedCaptureThreshold: 4,
      isVettedForClassifiedCapture: false,
    });

    expect(errors.classifiedCapture).toBeUndefined();
  });

  it('is a no-op when no vetting context is provided (pre-CMS-034 callers)', () => {
    const state = validState({ securityTier: 5 });

    expect(validateForSend(state).classifiedCapture).toBeUndefined();
  });
});

describe('validateForSend — approval groups need members', () => {
  const emptyGroup = {
    id: 'g',
    kind: 'group' as const,
    groupName: 'Group Reviewers',
    memberIds: [],
    memberNames: [],
    mode: 'any' as const,
    requireSignature: false,
    signaturePlacement: { page: 1, x: 70, y: 85, width: 20, height: 8 },
  };

  it('blocks Send while an Outgoing chain has a group with no members', () => {
    const state = validState({ correspondenceType: 'Outgoing', approvalSteps: [emptyGroup] });
    expect(validateForSend(state).approvalWorkflow).toBe(
      'createCorrespondence.validation.groupMembersRequired'
    );
  });

  it('ignores the chain of an already-signed document, which routes no approvals', () => {
    const state = validState({
      correspondenceType: 'Outgoing',
      composeMode: 'upload',
      mainDocumentSigned: true,
      approvalSteps: [emptyGroup],
    });
    expect(validateForSend(state).approvalWorkflow).toBeUndefined();
  });
});

describe('validateForSend — signature boxes may not overlap', () => {
  const signer = (id: string, x: number): ApprovalStep => ({
    id,
    kind: 'reviewer',
    userId: id,
    userName: id,
    requireSignature: true,
    signaturePlacement: { page: 1, x, y: 85, width: 20, height: 8 },
  });

  it('blocks Send while two signers share a spot on the document', () => {
    const state = validState({
      correspondenceType: 'Outgoing',
      approvalSteps: [signer('a', 70), signer('b', 75)],
    });
    expect(validateForSend(state).approvalWorkflow).toBe('createCorrespondence.validation.signaturesOverlap');
    expect(
      validateForSend(
        validState({ correspondenceType: 'Outgoing', approvalSteps: [signer('a', 70), signer('b', 40)] })
      ).approvalWorkflow
    ).toBeUndefined();
  });
});
