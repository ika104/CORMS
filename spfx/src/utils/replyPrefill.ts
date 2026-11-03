/** Passed via router state from a Reply action (CMS-041) to pre-fill the compose form. Kept outside
 * both modules to avoid a createCorrespondence <-> correspondenceDetail import cycle. */
export interface IReplyPrefill {
  subject: string;
  recipientName: string;
  /** The original item's thread/chain reference — inherited by the reply (CMS-041/CMS-022). Falls
   * back to the parent's reference number when the parent predates threading. */
  chainId?: string;
  /** CMS-022 — the parent item's id, stored on the reply (ParentReplyToId) and used to clear the
   * parent's pending-response flag once the reply is submitted. */
  parentId?: string;
  // CMS-041 AC8 — the source item's core metadata, pre-filled into the reply (all editable before
  // sending). Only the fields the source surface actually carries are populated.
  priority?: 'Normal' | 'High';
  securityTier?: number;
  recordClassificationId?: string;
  recordClassificationLabel?: string;
  originatingFunction?: string;
}

/** Source fields a Reply can be built from. Deliberately a subset of ICorrespondenceStub, so both a
 * list row (stub) and the detail view (which extends the stub) can be passed straight in. List rows
 * carry fewer fields than the detail view, but both now carry the classification + originating
 * function needed for AC8. */
export interface IReplySource {
  id: string;
  subject: string;
  senderName?: string;
  chainId?: string;
  referenceNumber?: string;
  priority?: 'Normal' | 'High';
  securityTier?: number;
  recordClassificationId?: string;
  recordClassificationName?: string;
  originatingFunction?: string;
}

/**
 * Builds the reply prefill from the source item (CMS-041). Subject is prefixed 'RE:' (not doubled
 * when already prefixed, AC3), the recipient becomes the original sender, the reply inherits the
 * source's chain (falling back to its reference number, CMS-022 AC4), records the parent for the
 * pending-response clear (AC7), and carries the source's core metadata (AC8).
 *
 * The file-plan classification is persisted as a single string (not an id/label pair), so when no
 * distinct id exists the classification name doubles as the id — the compose form's classification
 * picker keys on the id, so without this the pre-filled classification would not display.
 */
export function buildReplyPrefill(source: IReplySource): IReplyPrefill {
  const prefix = /^\s*re:/i.test(source.subject) ? '' : 'RE: ';
  const classificationId = source.recordClassificationId || source.recordClassificationName || undefined;
  return {
    subject: `${prefix}${source.subject}`,
    recipientName: source.senderName ?? '',
    chainId: source.chainId || source.referenceNumber || undefined,
    parentId: source.id,
    priority: source.priority,
    securityTier: source.securityTier,
    recordClassificationId: classificationId,
    recordClassificationLabel: source.recordClassificationName || classificationId,
    originatingFunction: source.originatingFunction,
  };
}

/**
 * Builds the compose prefill for Forward. A forward is part of the source correspondence's thread
 * so the full exchange remains visible from either item, but it deliberately has no `parentId`:
 * only a reply clears its parent's pending-response state when submitted. The recipient is left
 * blank for the user to choose and the subject is prefixed 'FW:' (not doubled when already
 * forwarded).
 */
export function buildForwardPrefill(source: IReplySource): IReplyPrefill {
  const prefix = /^\s*fw:/i.test(source.subject) ? '' : 'FW: ';
  const classificationId = source.recordClassificationId || source.recordClassificationName || undefined;
  return {
    subject: `${prefix}${source.subject}`,
    recipientName: '',
    chainId: source.chainId || source.referenceNumber || undefined,
    priority: source.priority,
    securityTier: source.securityTier,
    recordClassificationId: classificationId,
    recordClassificationLabel: source.recordClassificationName || classificationId,
    originatingFunction: source.originatingFunction,
  };
}
