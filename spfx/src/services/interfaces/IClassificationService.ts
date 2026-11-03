/**
 * CMS-010 — persists a triage officer's receive-time classification (AC5) and reasoned amendment
 * (AC9) onto CORMS_Correspondence, and writes the mandatory before/after audit entry. Mirrors
 * IRoutingService (CMS-011): the triage view used to apply these changes only to local state, so
 * the server record never changed and no audit row was written. Document content is never touched —
 * metadata only.
 */
export interface IApplyClassificationInput {
  correspondenceId: string;
  /** RecordHub content type -> CORMS_Correspondence.ContentTypeName. */
  contentType?: string;
  /** 'Normal' | 'High' -> Priority. */
  priority?: string;
  /** Ascending tier (1..5) -> SecurityLevel Choice (via tierToSecurityLevel). */
  securityTier?: number;
  /** Record classification label -> RecordClassification. */
  recordClassification?: string;
  /** Response/handling deadline (ISO or yyyy-mm-dd) -> DueDate. Blank clears it. */
  responseDeadline?: string;
  /** Audit action label — 'Correspondence Classified' (AC5) or 'Correspondence Classification
   * Amended' (AC9) — routed to the Correspondence audit section. */
  action: string;
  /** Pre-built before/after (+ mandatory reason for AC9) JSON, stored as the audit entry's details.
   * Built by the caller so the field-diff/formatting stays in one place (classificationAudit.ts). */
  auditDetails: string;
  /** Short human summary for the correspondence Timeline row. */
  summary: string;
}

export interface IClassificationService {
  /** Persists the provided classification fields (only those defined are written), writes the
   * before/after audit entry, and adds a Timeline row. Rejects if the persistence write fails so the
   * caller can surface it; audit/timeline are best-effort and never block the change. */
  applyClassification(input: IApplyClassificationInput): Promise<void>;
}
