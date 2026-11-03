import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/site-users/web';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ITaskListService } from '../interfaces/ITaskListService';
import { ITask } from '../../models/ITask';
import { ITaskListFilters } from '../../models/ITaskListFilters';
import { TaskListServiceCore } from './TaskListServiceCore';

/** Thin wrapper — same construction pattern as CorrespondenceDashboardServiceLive, minus the
 * clearance-tier plumbing (CORMS_Tasks has no SecurityLevel field — see TaskListServiceCore.ts). */
export class TaskListServiceLive implements ITaskListService {
  private readonly core: TaskListServiceCore;

  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new TaskListServiceCore(sp);
  }

  public getAll(filters?: ITaskListFilters): Promise<ITask[]> {
    return this.core.getAll(filters);
  }
}
