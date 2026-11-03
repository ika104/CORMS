import { ITask } from '../../models/ITask';
import { ITaskListFilters } from '../../models/ITaskListFilters';

/**
 * Task Inbox backend (CMS-049) — mirrors ICorrespondenceDashboardService's shape (a single
 * getAll(filters) against the whole visible set, tiles/search computed client-side over the
 * result — see TaskListServiceCore.ts). Gated behind app.taskDataSource (src/services/
 * appDataSource/taskDataSourceConfig.ts) — NOT a ds.* toggle, same reasoning as
 * app.correspondenceDataSource: CORMS owns CORMS_Tasks outright.
 */
export interface ITaskListService {
  /** No clearance trimming — CORMS_Tasks carries no SecurityLevel field in the current schema
   * (confirmed, not silently skipped — see TaskListServiceCore.ts's file comment). "All Tasks" is
   * every row within RESULT_CAP. */
  getAll(filters?: ITaskListFilters): Promise<ITask[]>;
}
