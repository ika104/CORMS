import { IFormErrors } from './types';

export type ValidationSection = 'coreMetadata' | 'composeDocument' | 'approvalWorkflow';

// Keep this in the same order as the form, rather than relying on object insertion order. That is
// especially important for server validation errors, whose order is not a UI contract.
const FIELD_ORDER = [
  'subject',
  'sender',
  'recipient',
  'securityTier',
  'classifiedCapture',
  'recordClassification',
  'destination',
  'composeDocument',
  'approvalWorkflow',
];

export function firstInvalidField(errors: IFormErrors): string | undefined {
  return FIELD_ORDER.find((field) => !!errors[field]) ?? Object.keys(errors).find((field) => !!errors[field]);
}

export function validationSection(errors: IFormErrors): ValidationSection | undefined {
  const field = firstInvalidField(errors);
  if (!field) return undefined;
  if (field === 'composeDocument' || field === 'approvalWorkflow') return field;
  return 'coreMetadata';
}

/**
 * Moves attention to an explicitly registered error target. Targets are present on custom controls
 * too, so a people picker, segmented widget, or contentEditable editor is handled as reliably as
 * a native input. Called only after a blocked Send attempt; it must never run while the user edits.
 */
export function focusFirstInvalidField(errors: IFormErrors, root: ParentNode = document): boolean {
  const field = firstInvalidField(errors);
  if (!field) return false;

  // Classified-capture is a validation rule on the security picker rather than an independent
  // editable field, so return the user to the control where they can choose a permitted level.
  const targetField = field === 'classifiedCapture' ? 'securityTier' : field;
  const target = root.querySelector<HTMLElement>(`[data-validation-field="${targetField}"]`);
  if (!target) return false;

  target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
  return true;
}
