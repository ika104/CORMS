export type TriageStage = 'incoming' | 'underReview' | 'byClassification';

export type NextAction = 'Review' | 'Approve' | 'Sign' | 'Distribute' | 'Archive';

export const NEXT_ACTIONS: NextAction[] = ['Review', 'Approve', 'Sign', 'Distribute', 'Archive'];

/** Per-item classification/routing working state (CMS-010/011) — session-local until the
 * officer completes triage; seeded from the item's own stub fields on first selection. */
export interface ITriageDraft {
  contentTypeId?: string;
  contentTypeName?: string;
  priority: 'Normal' | 'High';
  securityTier?: number;
  recordClassificationId?: string;
  recordClassificationLabel?: string;
  /** CMS-010 AC3 — the handling / response deadline captured at classification; feeds the CMS-016
   * escalation timers. ISO date (yyyy-mm-dd) from the date input. */
  responseDeadline?: string;
}
