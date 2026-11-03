import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { IWorkflowMatrixService } from '../interfaces/IWorkflowMatrixService';
import { IWorkflowRule } from '../../models/IWorkflowRule';
import { WorkflowMatrixServiceCore } from './WorkflowMatrixServiceCore';

/** CMS-012 — thin live wrapper over WorkflowMatrixServiceCore (CORMS_WorkflowMatrix). */
export class WorkflowMatrixServiceLive implements IWorkflowMatrixService {
  private readonly core: WorkflowMatrixServiceCore;

  constructor(context: WebPartContext, siteUrl: string, spOverride?: SPFI) {
    const sp = spOverride ?? spfi(siteUrl).using(SPFx(context));
    this.core = new WorkflowMatrixServiceCore(sp);
  }

  public getRules(): Promise<IWorkflowRule[]> {
    return this.core.getRules();
  }

  public saveRule(rule: IWorkflowRule): Promise<IWorkflowRule> {
    return this.core.saveRule(rule);
  }

  public deleteRule(id: string): Promise<void> {
    return this.core.deleteRule(id);
  }
}
