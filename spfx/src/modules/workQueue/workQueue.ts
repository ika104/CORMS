import {
  CorrespondencePriority,
  CorrespondenceStatus,
  ICorrespondenceStub,
} from '../../models/ICorrespondence';

/**
 * CMS-013 — the pure rules behind a user's personal Work Queue: which routed items require their
 * action, the named next step, clearance trimming, and the priority-then-date ordering. Kept free
 * of React so every rule is unit-testable and so the same logic drives the queue on both the
 * personal dashboard (CMS-029) and the triage screen (CMS-009) — AC4.
 */

/** AC1 — the controlled set of next steps a queued item can be awaiting. */
export const WORK_QUEUE_ACTIONS = ['Review', 'Approve', 'Sign', 'Distribute', 'Archive'] as const;
export type WorkQueueAction = (typeof WORK_QUEUE_ACTIONS)[number];

function isWorkQueueAction(value: string | undefined): value is WorkQueueAction {
  return !!value && (WORK_QUEUE_ACTIONS as readonly string[]).indexOf(value) !== -1;
}

/**
 * AC2 — statuses whose items never appear in ANY work queue: still a draft (or awaiting its number),
 * or already past the actionable pipeline (signed / declared / delivered). The actionable statuses
 * are Registered, InReview and Approved — each held by whoever must Review / Approve / Sign next.
 */
const EXCLUDED_STATUSES: CorrespondenceStatus[] = [
  'Draft',
  'PendingNumber',
  'Rejected',
  'Signed',
  'Declared',
  'Delivered',
];

const STATUS_STEP: Partial<Record<CorrespondenceStatus, WorkQueueAction>> = {
  Registered: 'Review',
  InReview: 'Approve',
  Approved: 'Sign',
};

/**
 * AC1 — the next step awaiting action on an item. A routed item carries the explicit action it was
 * routed with (CMS-011 `nextAction`), which wins; otherwise the step is inferred from the item's
 * status. Returns undefined for an item that has no actionable step (which therefore never queues).
 */
export function requiredNextStep(item: ICorrespondenceStub): WorkQueueAction | undefined {
  if (isWorkQueueAction(item.nextAction)) return item.nextAction;
  return STATUS_STEP[item.status];
}

/** AC2 — true when the item is at an actionable step (not draft/signed/declared/delivered and it
 * resolves to a named next step). */
export function isActionable(item: ICorrespondenceStub): boolean {
  return EXCLUDED_STATUSES.indexOf(item.status) === -1 && requiredNextStep(item) !== undefined;
}

/**
 * AC3 — the user who currently holds the live step. In a multi-step chain an item is assigned to
 * exactly one holder at a time (`assignedTo`), so it appears only in that user's queue; a
 * department-only routing (no personal assignee) belongs to no individual's personal queue.
 */
export function holdsLiveStep(item: ICorrespondenceStub, userId: string): boolean {
  return !!item.assignedTo && item.assignedTo === userId;
}

/** AC8 — an item the holder has not opened yet is visually distinguished as new/unread. */
export function isUnread(item: ICorrespondenceStub): boolean {
  return item.seen === false;
}

const PRIORITY_RANK: Record<CorrespondencePriority, number> = { High: 0, Normal: 1 };

/** AC5 — priority first (High before Normal), then by received date (most recent first), matching
 * the newest-first ordering used across the app's other lists. Returns a new array. */
export function sortWorkQueue(items: ICorrespondenceStub[]): ICorrespondenceStub[] {
  return [...items].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
  });
}

export interface IWorkQueueOptions {
  /** The queue owner — only items whose live step they hold are included (AC3). */
  userId: string;
  /** AC7 — items above the user's clearance are never shown. */
  maxClearanceTier: number;
  /** Ids to exclude (e.g. items whose action was just completed this session). */
  excludeIds?: ReadonlySet<string>;
}

/**
 * The full personal work-queue projection: clearance-trimmed (AC7), only items whose live step the
 * user holds (AC3), only actionable ones (AC2), minus any excluded ids, sorted priority-then-date
 * (AC5).
 */
export function filterWorkQueue(
  items: ICorrespondenceStub[],
  opts: IWorkQueueOptions
): ICorrespondenceStub[] {
  const exclude = opts.excludeIds;
  const matched = items.filter(
    (item) =>
      item.securityTier <= opts.maxClearanceTier &&
      holdsLiveStep(item, opts.userId) &&
      isActionable(item) &&
      !(exclude && exclude.has(item.id))
  );
  return sortWorkQueue(matched);
}

/** AC8 count of unread items in a resolved queue — for the panel header / a nav badge. */
export function workQueueUnreadCount(items: ICorrespondenceStub[]): number {
  return items.filter(isUnread).length;
}
