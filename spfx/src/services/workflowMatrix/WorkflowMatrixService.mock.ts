import { IWorkflowMatrixService } from '../interfaces/IWorkflowMatrixService';
import { IWorkflowRule } from '../../models/IWorkflowRule';
import workflowMatrixMock from '../../mocks/workflowMatrix.json';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

// Mock stand-in for the WorkflowRoutingMatrix SharePoint list — no live implementation yet
// (CMS-012 is UI-only for now), same reasoning as auditTrailService in bootstrap.ts.
// Mutations (Add/Edit/Delete Rule) are session-only, held in this instance's own copy of the
// seed data, same as CorrespondenceDetailServiceMock's client-side patching.
export class WorkflowMatrixServiceMock implements IWorkflowMatrixService {
  private rules: IWorkflowRule[] = (workflowMatrixMock as IWorkflowRule[]).map((r) => ({ ...r }));

  public getRules(): Promise<IWorkflowRule[]> {
    return delay([...this.rules].sort((a, b) => a.order - b.order));
  }

  public saveRule(rule: IWorkflowRule): Promise<IWorkflowRule> {
    const existingIndex = this.rules.findIndex((r) => r.id === rule.id);
    if (existingIndex === -1) {
      this.rules = [...this.rules, rule];
    } else {
      this.rules = this.rules.map((r, i) => (i === existingIndex ? rule : r));
    }
    return delay(rule);
  }

  public deleteRule(id: string): Promise<void> {
    this.rules = this.rules.filter((r) => r.id !== id);
    return delay(undefined);
  }
}
