import * as React from 'react';
import { ICreateCorrespondenceFormState } from './types';

/**
 * CMS-005 AC8 — the draft is saved server-side automatically (so it is reopenable on any device or
 * session and the author's work is never lost), not only when Save Draft is clicked. This hook
 * watches the form, and a debounced interval after the last change it calls the provided `save`
 * (which persists via ICorrespondenceService.create(mode:'draft'), reusing existingId so it updates
 * the one row rather than inserting duplicates). It never fires while a submit/confirmation is in
 * flight, never re-saves unchanged content, and serialises its own saves so two can't race.
 */
export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface IUseDraftAutosaveParams {
  state: ICreateCorrespondenceFormState;
  /** False while the form has nothing worth saving, or while a manual Save Draft / Send is running
   * or the confirmation screen is shown — autosave stands down in all those cases. */
  enabled: boolean;
  save: () => Promise<void>;
  /** Debounce window after the last edit (default 4s). */
  delayMs?: number;
}

export interface IUseDraftAutosaveResult {
  status: AutosaveStatus;
}

// The fields worth autosaving, serialised so a save fires only when the draft actually changed —
// not on every render — and identical content is never re-saved.
export function draftSignature(state: ICreateCorrespondenceFormState): string {
  return JSON.stringify({
    subject: state.subject,
    correspondenceType: state.correspondenceType,
    priority: state.priority,
    contentTypeName: state.contentTypeName,
    originatingFunction: state.originatingFunction,
    securityTier: state.securityTier,
    recordClassificationLabel: state.recordClassificationLabel,
    destinationType: state.destinationType,
    destinationDepartmentNames: state.destinationDepartmentNames,
    externalOrgNames: state.externalOrgNames,
    sender: state.sender,
    senderId: state.senderId,
    recipientNames: state.recipientNames,
    dueDate: state.dueDate,
    comments: state.comments,
    composeMode: state.composeMode,
    selectedTemplateId: state.selectedTemplateId,
    templateHeader: state.templateHeader,
    templateFooter: state.templateFooter,
    bodyHtml: state.bodyHtml,
    bodyDir: state.bodyDir,
    uploadedDocumentName: state.uploadedDocumentName,
    scannedDocumentName: state.scannedDocumentName,
    existingDocumentName: state.existingDocumentName,
    existingDocumentUrl: state.existingDocumentUrl,
  });
}

/** There is something worth autosaving once a subject, body or a document/template exists — an
 * untouched blank form is never persisted. */
export function hasAutosaveableContent(state: ICreateCorrespondenceFormState): boolean {
  return !!(
    state.subject.trim() ||
    state.bodyHtml.trim() ||
    state.uploadedDocumentName ||
    state.scannedDocumentName ||
    state.existingDocumentUrl ||
    state.selectedTemplateId
  );
}

export function useDraftAutosave({
  state,
  enabled,
  save,
  delayMs = 4000,
}: IUseDraftAutosaveParams): IUseDraftAutosaveResult {
  const [status, setStatus] = React.useState<AutosaveStatus>('idle');
  // The signature last persisted (or the mount baseline) — a change from this is what triggers a save.
  const savedSignatureRef = React.useRef<string>(draftSignature(state));
  const inFlightRef = React.useRef(false);
  const saveRef = React.useRef(save);
  saveRef.current = save;

  const signature = draftSignature(state);
  const meaningful = hasAutosaveableContent(state);

  React.useEffect(() => {
    if (!enabled || !meaningful) return undefined;
    if (signature === savedSignatureRef.current) return undefined;
    if (inFlightRef.current) return undefined; // a save is running; its completion re-runs this effect
    const handle = setTimeout(() => {
      inFlightRef.current = true;
      setStatus('saving');
      const pending = signature;
      saveRef
        .current()
        .then(() => {
          savedSignatureRef.current = pending;
          setStatus('saved');
        })
        .catch(() => setStatus('error'))
        .finally(() => {
          inFlightRef.current = false;
        });
    }, delayMs);
    return () => clearTimeout(handle);
    // `status` is a dependency so that when an in-flight save finishes, the effect re-evaluates and
    // schedules a follow-up save for any edits made while it was running (never-lost, AC8).
  }, [signature, enabled, meaningful, delayMs, status]);

  return { status };
}
