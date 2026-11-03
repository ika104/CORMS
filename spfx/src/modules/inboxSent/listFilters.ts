import { CorrespondenceStatus, ICorrespondenceStub } from '../../models/ICorrespondence';

/**
 * Inbox/Sent/Drafts listing filter state (CMS-039 AC4/AC5) — the free-text box plus the
 * date-range/status/security/team filter row that share a single "Clear Filters" action.
 *
 * Kept as a pure module (rather than inline predicates in InboxSentView) so the matching rules are
 * unit-testable without rendering the 700-line screen, the same way `folderUtils.matchesFolderCriteria`
 * already is. The shape deliberately mirrors `ICorrespondenceListFilters` (the server-side
 * `$filter` translation used by CorrespondenceListService) field-for-field, so switching this
 * screen from its current client-side data flow to that service is a swap of *where* the predicate
 * runs, not a re-specification of *what* it means.
 */
export interface IListFilters {
  /** Matched against subject and reference number, contains-style, case-insensitive (AC4). */
  freeText: string;
  /** Inclusive `yyyy-MM-dd` bounds compared against createdAt (AC5). */
  dateFrom: string;
  dateTo: string;
  status: string;
  /** Security tier as a string (the raw <select> value); '' means "any". */
  securityTier: string;
  /** "Team" filter — the item's owning department (AC5). */
  department: string;
}

export const EMPTY_LIST_FILTERS: IListFilters = {
  freeText: '',
  dateFrom: '',
  dateTo: '',
  status: '',
  securityTier: '',
  department: '',
};

export function hasActiveListFilters(filters: IListFilters): boolean {
  return (
    !!filters.freeText.trim() ||
    !!filters.dateFrom ||
    !!filters.dateTo ||
    !!filters.status ||
    !!filters.securityTier ||
    !!filters.department
  );
}

/** `createdAt` is `yyyy-MM-dd` in the current data flow and a full ISO timestamp in the
 * SharePoint-backed one — take the date part of either so a range bound compares like-for-like. */
function datePart(value: string | undefined): string {
  return (value ?? '').slice(0, 10);
}

export function matchesListFilters(item: ICorrespondenceStub, filters: IListFilters): boolean {
  const term = filters.freeText.trim().toLowerCase();
  if (
    term &&
    item.subject.toLowerCase().indexOf(term) === -1 &&
    (item.referenceNumber || '').toLowerCase().indexOf(term) === -1
  ) {
    return false;
  }

  const created = datePart(item.createdAt);
  if (filters.dateFrom && created < filters.dateFrom) return false;
  if (filters.dateTo && created > filters.dateTo) return false;

  if (filters.status && item.status !== (filters.status as CorrespondenceStatus)) return false;
  if (filters.securityTier && item.securityTier !== Number(filters.securityTier)) return false;
  if (filters.department && (item.department || '') !== filters.department) return false;

  return true;
}
