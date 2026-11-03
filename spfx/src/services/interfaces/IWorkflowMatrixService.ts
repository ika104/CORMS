import { IWorkflowRule } from '../../models/IWorkflowRule';

/** Backs the WorkflowRoutingMatrix SharePoint list (CMS-012). Read by both the Workflow
 * Matrix admin screen and Triage & Routing's default-route resolution (CMS-011), so both
 * stay consistent — there is no separate "routing" dataset. */
export interface IWorkflowMatrixService {
  getRules(): Promise<IWorkflowRule[]>;
  /** Creates a rule when `rule.id` is unseen, otherwise updates the existing one. */
  saveRule(rule: IWorkflowRule): Promise<IWorkflowRule>;
  deleteRule(id: string): Promise<void>;
}
