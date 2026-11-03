import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { ITask } from '../../models/ITask';

export type SearchType = 'Correspondence' | 'Tasks';

export interface ICorrespondenceSearchFilters {
  status: string;
  securityLevel: string;
  team: string;
  dateFrom: string;
  dateTo: string;
  /** CMS-025 AC1 — the metadata filter set alongside the free-text box: Reference No., Subject,
   * Sender, Recipient (substring) and Type, Priority (exact). The CMS-046 correspondence-tab
   * filter set (Status / Security / Team / Date) is a subset of these. */
  referenceNo: string;
  subject: string;
  sender: string;
  recipient: string;
  type: string;
  priority: string;
  /** CMS-025 AC8: routing is called out as a search criterion so items can be retrieved by their
   * routing (resolved against the workflow matrix, applied client-side after the ES fetch). */
  routing: string;
}

export interface ITaskSearchFilters {
  type: string;
  priority: string;
  status: string;
  assignee: string;
}

export const BLANK_CORRESPONDENCE_FILTERS: ICorrespondenceSearchFilters = {
  status: '',
  securityLevel: '',
  team: '',
  dateFrom: '',
  dateTo: '',
  referenceNo: '',
  subject: '',
  sender: '',
  recipient: '',
  type: '',
  priority: '',
  routing: '',
};

export const BLANK_TASK_FILTERS: ITaskSearchFilters = {
  type: '',
  priority: '',
  status: '',
  assignee: '',
};

/** One saved search session (CMS-046) — each tab owns its own query, filters, and cached
 * result set independently, so switching tabs never re-runs or clears another tab's search. */
export interface ISearchTab {
  id: string;
  searchType: SearchType;
  query: string;
  correspondenceFilters: ICorrespondenceSearchFilters;
  taskFilters: ITaskSearchFilters;
  hasSearched: boolean;
  correspondenceResults: ICorrespondenceStub[];
  taskResults: ITask[];
}

let tabSeq = 0;
export function createBlankTab(): ISearchTab {
  tabSeq += 1;
  return {
    id: `search-tab-${Date.now()}-${tabSeq}`,
    searchType: 'Correspondence',
    query: '',
    correspondenceFilters: { ...BLANK_CORRESPONDENCE_FILTERS },
    taskFilters: { ...BLANK_TASK_FILTERS },
    hasSearched: false,
    correspondenceResults: [],
    taskResults: [],
  };
}

function hasActiveFilters(tab: ISearchTab): boolean {
  if (tab.searchType === 'Correspondence') {
    return Object.keys(tab.correspondenceFilters).some(
      (key) => tab.correspondenceFilters[key as keyof ICorrespondenceSearchFilters] !== ''
    );
  }
  return Object.keys(tab.taskFilters).some((key) => tab.taskFilters[key as keyof ITaskSearchFilters] !== '');
}

export function resultCount(tab: ISearchTab): number {
  return tab.searchType === 'Correspondence' ? tab.correspondenceResults.length : tab.taskResults.length;
}

type TFn = (key: string, options?: Record<string, unknown>) => string;

/** Auto-generated tab title (CMS-046) — "Correspondence: All Records" before a query/filter
 * narrows it, "Correspondence: "keyword"" once one is set, plus a result count once searched. */
export function tabTitle(tab: ISearchTab, t: TFn): string {
  const typeLabel = t(`search.type.${tab.searchType === 'Correspondence' ? 'correspondence' : 'tasks'}`);
  const base = tab.query.trim()
    ? t('search.tab.titleQuery', { type: typeLabel, query: tab.query.trim() })
    : hasActiveFilters(tab)
      ? t('search.tab.titleFiltered', { type: typeLabel })
      : t('search.tab.titleAllRecords', { type: typeLabel });
  if (!tab.hasSearched) return base;
  return t('search.tab.titleWithResults', { base, count: resultCount(tab) });
}

export function tabSubtitle(tab: ISearchTab, t: TFn): string {
  if (!tab.hasSearched) return t('search.tab.subtitleNotSearched');
  return t('search.tab.subtitleResults', { count: resultCount(tab) });
}
