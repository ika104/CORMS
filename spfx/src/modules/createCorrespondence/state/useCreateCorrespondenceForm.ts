import * as React from 'react';
import {
  ComposeMode,
  ApprovalStep,
  CorrespondenceTypeValue,
  createInitialFormState,
  DEFAULT_SIGNATURE_PLACEMENT,
  DestinationTypeValue,
  ICreateCorrespondenceFormState,
  IDepartmentStep,
  IGroupStep,
  IPhysicalAttachment,
  IReviewerStep,
  ISignaturePlacement,
  ISupportingDocument,
  SupportingDocsMode,
} from './types';
import { clampSignaturePlacement, toggleGroupMember as toggleGroupMemberInStep } from './approvalChain';

let stepIdCounter = 0;
function nextStepId(): string {
  stepIdCounter += 1;
  return `step-${stepIdCounter}`;
}

let docIdCounter = 0;
function nextDocId(): string {
  docIdCounter += 1;
  return `doc-${docIdCounter}`;
}

export interface IUseCreateCorrespondenceForm {
  state: ICreateCorrespondenceFormState;
  setField: <K extends keyof ICreateCorrespondenceFormState>(
    field: K,
    value: ICreateCorrespondenceFormState[K]
  ) => void;
  /** Merge a batch of fields at once — used to reopen a saved draft in edit mode. */
  hydrate: (patch: Partial<ICreateCorrespondenceFormState>) => void;
  setCorrespondenceType: (value: CorrespondenceTypeValue) => void;
  setDestinationType: (value: DestinationTypeValue) => void;
  setComposeMode: (value: ComposeMode) => void;
  setSupportingDocsMode: (value: SupportingDocsMode) => void;
  toggleDestinationDepartment: (id: string, name: string) => void;
  toggleExternalOrg: (id: string, name: string) => void;
  toggleRecipient: (id: string, name: string) => void;
  applyTemplate: (templateId: string, header: string, footer: string, version?: number) => void;
  addSupportingDocument: (doc: Omit<ISupportingDocument, 'id'>) => void;
  removeSupportingDocument: (id: string) => void;
  addPhysicalAttachment: (attachment: Omit<IPhysicalAttachment, 'id'>) => void;
  removePhysicalAttachment: (id: string) => void;
  addReviewerStep: (userId: string, userName: string, department?: string) => void;
  addDepartmentStep: (departmentId: string, departmentName: string) => void;
  addGroupStep: (groupName: string, memberIds: string[], memberNames: string[]) => void;
  toggleGroupMember: (stepId: string, memberId: string, memberName: string) => void;
  removeApprovalStep: (id: string) => void;
  moveApprovalStep: (id: string, direction: 'up' | 'down') => void;
  toggleStepSignature: (id: string, required: boolean) => void;
  setStepSignaturePlacement: (id: string, placement: ISignaturePlacement) => void;
  setStepApprovalMode: (id: string, mode: 'any' | 'all') => void;
  /** Replaces the chain with an administrator-managed predefined workflow. */
  replaceApprovalSteps: (steps: ApprovalStep[]) => void;
  reset: () => void;
}

export function useCreateCorrespondenceForm(
  senderName: string,
  senderId?: string
): IUseCreateCorrespondenceForm {
  const [state, setState] = React.useState<ICreateCorrespondenceFormState>(() =>
    createInitialFormState(senderName, senderId)
  );

  const setField = React.useCallback(
    <K extends keyof ICreateCorrespondenceFormState>(field: K, value: ICreateCorrespondenceFormState[K]) => {
      setState((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const hydrate = React.useCallback((patch: Partial<ICreateCorrespondenceFormState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setCorrespondenceType = React.useCallback((value: CorrespondenceTypeValue) => {
    setState((prev) => ({
      ...prev,
      correspondenceType: value,
      // Incoming has no Compose tabs/Approval Workflow (observed prototype behaviour) — reset
      // the fields those sections own so stale state can't leak back in if the user flips again.
      composeMode: 'upload',
      approvalSteps: value === 'Incoming' ? [] : prev.approvalSteps,
    }));
  }, []);

  const setDestinationType = React.useCallback((value: DestinationTypeValue) => {
    setState((prev) => ({ ...prev, destinationType: value }));
  }, []);

  const setComposeMode = React.useCallback((value: ComposeMode) => {
    setState((prev) => ({ ...prev, composeMode: value }));
  }, []);

  const setSupportingDocsMode = React.useCallback((value: SupportingDocsMode) => {
    setState((prev) => ({ ...prev, supportingDocsMode: value }));
  }, []);

  const toggleDestinationDepartment = React.useCallback((id: string, name: string) => {
    setState((prev) => {
      const has = prev.destinationDepartmentIds.indexOf(id) !== -1;
      return has
        ? {
            ...prev,
            destinationDepartmentIds: prev.destinationDepartmentIds.filter((x) => x !== id),
            destinationDepartmentNames: prev.destinationDepartmentNames.filter((x) => x !== name),
          }
        : {
            ...prev,
            destinationDepartmentIds: [...prev.destinationDepartmentIds, id],
            destinationDepartmentNames: [...prev.destinationDepartmentNames, name],
          };
    });
  }, []);

  const toggleExternalOrg = React.useCallback((id: string, name: string) => {
    setState((prev) => {
      const has = prev.externalOrgIds.indexOf(id) !== -1;
      return has
        ? {
            ...prev,
            externalOrgIds: prev.externalOrgIds.filter((x) => x !== id),
            externalOrgNames: prev.externalOrgNames.filter((x) => x !== name),
          }
        : {
            ...prev,
            externalOrgIds: [...prev.externalOrgIds, id],
            externalOrgNames: [...prev.externalOrgNames, name],
          };
    });
  }, []);

  // Recipient people picker (multi-value). Toggles by index of the id so two people sharing a
  // display name are handled correctly (unlike the name-based filter the older toggles use).
  const toggleRecipient = React.useCallback((id: string, name: string) => {
    setState((prev) => {
      const index = prev.recipientIds.indexOf(id);
      if (index === -1) {
        return {
          ...prev,
          recipientIds: [...prev.recipientIds, id],
          recipientNames: [...prev.recipientNames, name],
        };
      }
      return {
        ...prev,
        recipientIds: prev.recipientIds.filter((_, i) => i !== index),
        recipientNames: prev.recipientNames.filter((_, i) => i !== index),
      };
    });
  }, []);

  // Template switch updates header/footer/letterhead only and preserves entered body text
  // (TASK-05 §4.2 behaviours — CMS-005/CMS-037).
  const applyTemplate = React.useCallback(
    (templateId: string, header: string, footer: string, version?: number) => {
      // CMS-037 AC4 — capture the template version in force at selection time alongside its id, so the
      // exact revision the body was authored from is stamped onto the correspondence at creation.
      setState((prev) => ({
        ...prev,
        selectedTemplateId: templateId,
        selectedTemplateVersion: version,
        templateHeader: header,
        templateFooter: footer,
      }));
    },
    []
  );

  const addSupportingDocument = React.useCallback((doc: Omit<ISupportingDocument, 'id'>) => {
    setState((prev) => ({
      ...prev,
      supportingDocuments: [...prev.supportingDocuments, { ...doc, id: nextDocId() }],
    }));
  }, []);

  const removeSupportingDocument = React.useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      supportingDocuments: prev.supportingDocuments.filter((d) => d.id !== id),
    }));
  }, []);

  const addPhysicalAttachment = React.useCallback((attachment: Omit<IPhysicalAttachment, 'id'>) => {
    setState((prev) => ({
      ...prev,
      physicalAttachments: [...prev.physicalAttachments, { ...attachment, id: nextDocId() }],
    }));
  }, []);

  const removePhysicalAttachment = React.useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      physicalAttachments: prev.physicalAttachments.filter((a) => a.id !== id),
    }));
  }, []);

  const addReviewerStep = React.useCallback((userId: string, userName: string, department?: string) => {
    const step: IReviewerStep = {
      id: nextStepId(),
      kind: 'reviewer',
      userId,
      userName,
      department,
      requireSignature: false,
      signaturePlacement: { ...DEFAULT_SIGNATURE_PLACEMENT },
    };
    setState((prev) => ({ ...prev, approvalSteps: [...prev.approvalSteps, step] }));
  }, []);

  const addDepartmentStep = React.useCallback((departmentId: string, departmentName: string) => {
    const step: IDepartmentStep = {
      id: nextStepId(),
      kind: 'department',
      departmentId,
      departmentName,
      mode: 'all',
      requireSignature: false,
      signaturePlacement: { ...DEFAULT_SIGNATURE_PLACEMENT },
    };
    setState((prev) => ({ ...prev, approvalSteps: [...prev.approvalSteps, step] }));
  }, []);

  const addGroupStep = React.useCallback((groupName: string, memberIds: string[], memberNames: string[]) => {
    const step: IGroupStep = {
      id: nextStepId(),
      kind: 'group',
      groupName,
      memberIds,
      memberNames,
      mode: 'any',
      requireSignature: false,
      signaturePlacement: { ...DEFAULT_SIGNATURE_PLACEMENT },
    };
    setState((prev) => ({ ...prev, approvalSteps: [...prev.approvalSteps, step] }));
  }, []);

  const toggleGroupMember = React.useCallback((stepId: string, memberId: string, memberName: string) => {
    setState((prev) => ({
      ...prev,
      approvalSteps: prev.approvalSteps.map((s) =>
        s.id === stepId && s.kind === 'group' ? toggleGroupMemberInStep(s, memberId, memberName) : s
      ),
    }));
  }, []);

  const removeApprovalStep = React.useCallback((id: string) => {
    setState((prev) => ({ ...prev, approvalSteps: prev.approvalSteps.filter((s) => s.id !== id) }));
  }, []);

  const moveApprovalStep = React.useCallback((id: string, direction: 'up' | 'down') => {
    setState((prev) => {
      const steps = [...prev.approvalSteps];
      const index = steps.findIndex((s) => s.id === id);
      const swapWith = direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || swapWith < 0 || swapWith >= steps.length) {
        return prev;
      }
      [steps[index], steps[swapWith]] = [steps[swapWith], steps[index]];
      return { ...prev, approvalSteps: steps };
    });
  }, []);

  const toggleStepSignature = React.useCallback((id: string, required: boolean) => {
    setState((prev) => ({
      ...prev,
      approvalSteps: prev.approvalSteps.map((s) => (s.id === id ? { ...s, requireSignature: required } : s)),
    }));
  }, []);

  // CMS-006 AC16 — record the drag/resize position + page chosen on the signature-placement
  // canvas, clamped so the box always stays on the page.
  const setStepSignaturePlacement = React.useCallback((id: string, placement: ISignaturePlacement) => {
    const next = clampSignaturePlacement(placement);
    setState((prev) => ({
      ...prev,
      approvalSteps: prev.approvalSteps.map((s) => (s.id === id ? { ...s, signaturePlacement: next } : s)),
    }));
  }, []);

  const setStepApprovalMode = React.useCallback((id: string, mode: 'any' | 'all') => {
    setState((prev) => ({
      ...prev,
      approvalSteps: prev.approvalSteps.map((s) =>
        s.id === id && (s.kind === 'group' || s.kind === 'department') ? { ...s, mode } : s
      ),
    }));
  }, []);

  const replaceApprovalSteps = React.useCallback((steps: ApprovalStep[]) => {
    setState((prev) => ({
      ...prev,
      approvalSteps: steps.map((step) =>
        step.kind === 'group'
          ? {
              ...step,
              signaturePlacement: { ...step.signaturePlacement },
              memberIds: [...step.memberIds],
              memberNames: [...step.memberNames],
            }
          : { ...step, signaturePlacement: { ...step.signaturePlacement } }
      ),
    }));
  }, []);

  const reset = React.useCallback(() => {
    setState(createInitialFormState(senderName, senderId));
  }, [senderName, senderId]);

  return {
    state,
    setField,
    hydrate,
    setCorrespondenceType,
    setDestinationType,
    setComposeMode,
    setSupportingDocsMode,
    toggleDestinationDepartment,
    toggleRecipient,
    toggleExternalOrg,
    applyTemplate,
    addSupportingDocument,
    removeSupportingDocument,
    addPhysicalAttachment,
    removePhysicalAttachment,
    addReviewerStep,
    addDepartmentStep,
    addGroupStep,
    toggleGroupMember,
    removeApprovalStep,
    moveApprovalStep,
    toggleStepSignature,
    setStepSignaturePlacement,
    setStepApprovalMode,
    replaceApprovalSteps,
    reset,
  };
}
