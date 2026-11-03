/** Task Inbox filter state (CMS-049 AC5) — every field is ANDed, an unset field is ignored.
 * Mirrors ICorrespondenceListFilters's shape (server-side $filter translation via
 * buildTaskFilter), consumed by TaskListService.getAll() and the Advanced Search "Tasks" type
 * (CMS-046 AC10). */
export interface ITaskListFilters {
  /** Matched against Subject (Title) / ReferenceNo, contains-style, Arabic-aware-normalized. */
  freeText?: string;
  /** CORMS_Tasks.TaskType Choice value, e.g. "Follow-up Task". */
  type?: string;
  /** CORMS_Tasks.Priority Choice value. */
  priority?: string;
  /** CORMS_Tasks.Status Choice value ('Pending' | 'In Progress' | 'Overdue' | 'Completed'). A
   * value of 'Overdue' is translated to the computed condition (DueDate < today AND Status !=
   * Completed) rather than a literal Status equality — see buildTaskFilter.ts. */
  status?: string;
  /** Matched against the assignee's display name (AssignedToUser/Title), contains-style,
   * Arabic-aware-normalized. The one dimension matched client-side rather than in `$filter` —
   * SharePoint REST rejects substringof() on a projected People/Lookup path (see
   * buildTaskFilter.ts / TaskListServiceCore.getAll). */
  assignee?: string;
}

export function isEmptyTaskFilters(filters: ITaskListFilters | undefined): boolean {
  if (!filters) return true;
  return !filters.freeText && !filters.type && !filters.priority && !filters.status && !filters.assignee;
}
