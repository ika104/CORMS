import { ICorrespondenceStub, CorrespondenceStatus } from '../../models/ICorrespondence';
import { TriageStage } from './types';

/**
 * CMS-009 — the pure queue rules behind the Triage screen: which items belong in each stage tab,
 * clearance trimming (AC3), the unseen/new count that also feeds the nav badge (AC4), and the
 * name of the next workflow step shown in the officer's own work queue (AC7). Kept dependency-free
 * of React so every rule is unit-testable on its own.
 */

export const TRIAGE_STAGES: TriageStage[] = ['incoming', 'underReview', 'byClassification'];

/** The two statuses that count as "still in triage" — an item leaves the triage pool entirely once
 * it moves past secondary review (Approved and beyond). Both the Incoming and Under Review tabs are
 * subsets of this set, and By Classification is the whole of it. */
export function isPendingTriage(status: CorrespondenceStatus): boolean {
  return status === 'Registered' || status === 'InReview';
}

/** AC8 — the stage-tab predicate. Incoming = freshly registered; Under Review = in secondary
 * review; By Classification = the full pending-triage set (both statuses). */
export function matchesStage(item: ICorrespondenceStub, stage: TriageStage): boolean {
  if (item.direction !== 'Incoming') return false;
  if (stage === 'incoming') return item.status === 'Registered';
  if (stage === 'underReview') return item.status === 'InReview';
  return isPendingTriage(item.status); // byClassification
}

/** AC3 — items above the officer's own clearance are never shown. */
export function withinClearance(item: ICorrespondenceStub, maxClearanceTier: number): boolean {
  return item.securityTier <= maxClearanceTier;
}

/**
 * CMS-010 AC6 — only triage-stage correspondence that has not yet been routed onward can be
 * classified through the triage workspace. Once the item carries a current department (it has been
 * routed) or has moved past secondary review, the classify interface is read-only.
 */
export function isTriageClassifiable(item: ICorrespondenceStub): boolean {
  return isPendingTriage(item.status) && !item.currentDepartment;
}

/** AC4 — an unseen/new item is one still awaiting triage that the officer has not opened yet
 * (`seen === false`). Items the stub marks seen, or that have left the triage pool, are not new. */
export function isUnseen(item: ICorrespondenceStub): boolean {
  return item.direction === 'Incoming' && isPendingTriage(item.status) && item.seen === false;
}

/** AC4 — how many unseen items sit in the queue within the officer's clearance. This is the number
 * rendered on-screen and surfaced as the Triage nav badge (via BadgeCountService in live). */
export function unseenCount(items: ICorrespondenceStub[], maxClearanceTier: number): number {
  return items.filter((item) => withinClearance(item, maxClearanceTier) && isUnseen(item)).length;
}

/**
 * AC7 — the next workflow step awaiting action on an item routed to the officer, named from its
 * current status. Returns an i18n key (reusing the classify Next-Action vocabulary) so the caller
 * only has to translate it; a fully-dispatched item resolves to no further step.
 */
export function nextWorkflowStepKey(item: ICorrespondenceStub): string | undefined {
  const byStatus: Partial<Record<CorrespondenceStatus, string>> = {
    Registered: 'Review',
    InReview: 'Approve',
    Approved: 'Sign',
    Signed: 'Distribute',
    Declared: 'Archive',
  };
  const action = byStatus[item.status];
  return action ? `triageRouting.classify.nextActionOption.${action}` : undefined;
}

export interface ITriageQueueFilter {
  stage: TriageStage;
  maxClearanceTier: number;
  /** Free-text match against subject + reference number (already lower-cased by the caller or
   * here — matching is case-insensitive). */
  search?: string;
  /** By Classification tab only — narrow to a single record type / security tier. */
  recordType?: string;
  securityTier?: string;
  /** AC9 — ids whose triage the officer has just completed; excluded so a completed card leaves
   * the queue and the remaining cards close the gap. */
  completedIds?: ReadonlySet<string>;
}

/**
 * The full queue projection for a stage: clearance-trimmed (AC3), stage-matched (AC8), completed
 * items removed (AC9), then narrowed by the By-Classification filters and the free-text search.
 * Order is preserved from the input (the data source already sorts newest-first).
 */
export function filterTriageQueue(items: ICorrespondenceStub[], opts: ITriageQueueFilter): ICorrespondenceStub[] {
  const completed = opts.completedIds;
  let result = items.filter(
    (item) =>
      withinClearance(item, opts.maxClearanceTier) &&
      matchesStage(item, opts.stage) &&
      !(completed && completed.has(item.id))
  );

  if (opts.stage === 'byClassification') {
    if (opts.recordType) result = result.filter((item) => item.type === opts.recordType);
    if (opts.securityTier) result = result.filter((item) => String(item.securityTier) === opts.securityTier);
  }

  const term = (opts.search ?? '').trim().toLowerCase();
  if (term) {
    result = result.filter(
      (item) =>
        item.subject.toLowerCase().indexOf(term) !== -1 ||
        item.referenceNumber.toLowerCase().indexOf(term) !== -1
    );
  }

  return result;
}

/** Per-stage counts for the tab badges — computed over the clearance-trimmed, not-yet-completed
 * set, ignoring the search/classification narrowing (the tabs show the true stage totals). */
export function stageCounts(
  items: ICorrespondenceStub[],
  maxClearanceTier: number,
  completedIds?: ReadonlySet<string>
): Record<TriageStage, number> {
  const visible = items.filter(
    (item) => withinClearance(item, maxClearanceTier) && !(completedIds && completedIds.has(item.id))
  );
  return {
    incoming: visible.filter((item) => matchesStage(item, 'incoming')).length,
    underReview: visible.filter((item) => matchesStage(item, 'underReview')).length,
    byClassification: visible.filter((item) => matchesStage(item, 'byClassification')).length,
  };
}
