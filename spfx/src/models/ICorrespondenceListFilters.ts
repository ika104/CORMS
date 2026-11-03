import { CorrespondenceStatus } from './ICorrespondence';

/** Inbox/Sent/Drafts filter state (CMS-039 AC5/AC6) — every field is ANDed, an unset field is
 * ignored. Shared between CorrespondenceListService (server-side $filter translation) and any
 * screen's filter panel, and reused by CustomFolderService (Part 5) for folder criteria. */
export interface ICorrespondenceListFilters {
  /** Matched against Subject/ReferenceNo, contains-style. */
  freeText?: string;
  /** Inclusive, compared against DateCreated. ISO date strings (yyyy-MM-dd). */
  dateFrom?: string;
  dateTo?: string;
  status?: CorrespondenceStatus;
  /** CORMS_Correspondence.SecurityLevel Choice value, e.g. "Confidential". */
  securityLevel?: string;
  department?: string;
  quickFilter?: 'all' | 'unread' | 'highPriority';
}

export function isEmptyFilters(filters: ICorrespondenceListFilters | undefined): boolean {
  if (!filters) return true;
  return (
    !filters.freeText &&
    !filters.dateFrom &&
    !filters.dateTo &&
    !filters.status &&
    !filters.securityLevel &&
    !filters.department &&
    (!filters.quickFilter || filters.quickFilter === 'all')
  );
}
