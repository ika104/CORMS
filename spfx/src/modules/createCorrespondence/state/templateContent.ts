/**
 * CMS-005 — pure helpers for template-bound outgoing drafting. Kept free of React/DOM so the
 * placeholder interpolation (AC14), the auto sign-off (AC12) and the final printable-document
 * assembly (AC15) are all unit-testable in isolation from the Compose section that renders them.
 */

import { ICreateCorrespondenceFormState } from './types';

/** The wildcard placeholders the system replaces across a template's header, body and footer with
 * the correspondence's own data (CMS-005 AC14). TODO(confirm) exact token syntax (TASK-05 §8
 * item 1) — this repo uses {{sender}}, {{recipient}}, {{referenceNumber}}, {{date}}, {{subject}}
 * and {{role}}. */
export interface ITemplateValues {
  sender: string;
  recipient: string;
  referenceNumber: string;
  date: string;
  subject: string;
  /** The sender's resolved role/job title — empty when it cannot be resolved (AC12). */
  role: string;
}

/**
 * Replaces every {{placeholder}} in `text` with the matching value. Unknown placeholders are left
 * untouched (rather than blanked) so an authored token the data doesn't cover is visible to the
 * author instead of silently vanishing. A known-but-empty value (e.g. an unissued reference
 * number, a role that couldn't be resolved) collapses to an empty string.
 */
export function interpolatePlaceholders(text: string, values: Partial<ITemplateValues>): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = (values as Record<string, string | undefined>)[key];
    return value === undefined ? match : value;
  });
}

/** Builds the interpolation value map from the current form state. `referenceNumber` is blank
 * until submission issues one, so the placeholder collapses to nothing on a draft rather than
 * showing a stale token. */
export function buildTemplateValues(state: ICreateCorrespondenceFormState, senderRole?: string): ITemplateValues {
  return {
    sender: state.sender,
    recipient: state.recipientNames.join('; '),
    referenceNumber: state.referenceNumber ?? '',
    date: state.dateCreated,
    subject: state.subject,
    role: (senderRole ?? '').trim(),
  };
}

/**
 * CMS-005 AC12 — the sign-off auto-fills as "Yours faithfully," followed by the sender's name and,
 * where known, the sender's role. The role line is omitted entirely when it cannot be resolved
 * (blank), rather than leaving an empty line. Returns an HTML fragment so it renders with the same
 * line breaks in the preview and in the assembled document.
 */
export function buildSignOff(senderName: string, senderRole?: string): string {
  const name = (senderName ?? '').trim();
  const role = (senderRole ?? '').trim();
  const lines = ['Yours faithfully,', name];
  if (role) lines.push(role);
  return lines
    .filter((line) => line.length > 0)
    .map((line) => escapeHtml(line))
    .join('<br/>');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface IPrintableDocumentRegions {
  header: string;
  bodyHtml: string;
  signOff: string;
  footer: string;
  dir: 'ltr' | 'rtl';
}

/**
 * CMS-005 AC15 — assembles the letterhead header, authored body, auto sign-off and footer into one
 * self-contained HTML document. Once authoring is complete this is what gets rendered to PDF and
 * becomes the correspondence's main document; the binary PDF conversion itself is a downstream
 * server step (see CreateCorrespondenceView), so this produces the print-ready HTML it converts.
 * All regions are already interpolated by the caller.
 */
export function composePrintableDocument(regions: IPrintableDocumentRegions): string {
  const { header, bodyHtml, signOff, footer, dir } = regions;
  const parts: string[] = [];
  if (header.trim()) parts.push(`<header class="corms-doc-header">${header}</header>`);
  parts.push(`<main class="corms-doc-body">${bodyHtml}</main>`);
  if (signOff.trim()) parts.push(`<section class="corms-doc-signoff">${signOff}</section>`);
  if (footer.trim()) parts.push(`<footer class="corms-doc-footer">${footer}</footer>`);
  return `<article class="corms-document" dir="${dir}">${parts.join('')}</article>`;
}
