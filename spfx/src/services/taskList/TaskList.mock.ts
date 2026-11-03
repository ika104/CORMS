import { ITaskListService } from '../interfaces/ITaskListService';
import { ITask } from '../../models/ITask';
import { ITaskListFilters } from '../../models/ITaskListFilters';
import { normalizedContains } from '../common/normalizedContains';
import tasksMock from '../../mocks/tasks.json';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

/** Exported so it can be exercised directly in tests without the artificial delay. The pre-existing
 * mock dataset (tasks.json) already bakes in a consistent status/isOverdue pair per row (per the
 * same computed-Overdue decision mapTaskRow.ts applies for live rows) — filtering trusts those
 * fields as-is rather than recomputing them, since Part 4 requires the mock dataset to render
 * unchanged. */
export function applyTaskFilters(items: ITask[], filters?: ITaskListFilters): ITask[] {
  let result = items;
  if (filters?.freeText) {
    result = result.filter(
      (i) =>
        normalizedContains(i.subject, filters.freeText!) ||
        normalizedContains(i.referenceNo, filters.freeText!)
    );
  }
  if (filters?.type) result = result.filter((i) => i.type === filters.type);
  if (filters?.priority) result = result.filter((i) => i.priority === filters.priority);
  if (filters?.status) {
    result =
      filters.status === 'Overdue'
        ? result.filter((i) => i.isOverdue)
        : result.filter((i) => i.status === filters.status);
  }
  if (filters?.assignee) result = result.filter((i) => normalizedContains(i.assignee, filters.assignee!));
  return result;
}

/** Mock-mode source for the Task Inbox (app.taskDataSource=mock) — the earlier UI task's bundled
 * demo dataset, unchanged, per Part 4's explicit requirement. */
export class TaskListServiceMock implements ITaskListService {
  // Legacy demo rows predate multi-person assignment. Normalize their one display name into the
  // same collection shape as live SharePoint rows so My Tasks never needs a mock-only rendering
  // branch.
  private readonly all: ITask[] = (tasksMock as Array<Omit<ITask, 'assignees'>>).map((task) => ({
    ...task,
    assignees: task.assignee ? [{ displayName: task.assignee }] : [],
  }));

  public getAll(filters?: ITaskListFilters): Promise<ITask[]> {
    return delay(applyTaskFilters(this.all, filters));
  }
}
