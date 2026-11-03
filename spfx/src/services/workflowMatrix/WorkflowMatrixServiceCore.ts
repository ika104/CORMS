import type { SPFI } from '@pnp/sp';
import { CONDITION_ANY, IWorkflowRule, RoutingTargetKind } from '../../models/IWorkflowRule';

const LIST_TITLE = 'CORMS_WorkflowMatrix';
const RESULT_CAP = 500;

/**
 * CMS-012 — live persistence for the Routing Matrix (CORMS_WorkflowMatrix). See provisioningCore.ts
 * for why Core classes only `import type { SPFI }`; WorkflowMatrixService.live.ts is the thin real
 * wrapper. A rule's SharePoint item Id IS its business id (`wm-<Id>`), so a save with an unseen /
 * `wm-new-…` id is an add and any other is an update of that item. Flow is stored as a
 * comma-delimited Note. Matches the mock's shape exactly so the admin screen and Triage & Routing
 * resolve identically whether live or mock.
 */

interface IMatrixListItem {
  Id: number;
  Title?: string;
  RuleType?: string;
  Direction?: string;
  Priority?: string;
  SecurityLevel?: string;
  FunctionCondition?: string;
  DepartmentCondition?: string;
  TargetKind?: string;
  TargetValue?: string;
  Flow?: string;
  Approver?: string;
  RuleNote?: string;
  SortOrder?: number;
}

const VALID_TARGET_KINDS: RoutingTargetKind[] = ['department', 'individual', 'role'];

function mapKind(raw: string | undefined): RoutingTargetKind {
  return (VALID_TARGET_KINDS as string[]).indexOf(raw ?? '') !== -1 ? (raw as RoutingTargetKind) : 'department';
}

function splitFlow(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,>]|→/)
    .map((step) => step.trim())
    .filter(Boolean);
}

function mapRow(item: IMatrixListItem): IWorkflowRule {
  return {
    id: `wm-${item.Id}`,
    rule: item.Title ?? '',
    type: item.RuleType || CONDITION_ANY,
    direction: (item.Direction || CONDITION_ANY) as IWorkflowRule['direction'],
    priority: (item.Priority || CONDITION_ANY) as IWorkflowRule['priority'],
    securityLevel: item.SecurityLevel || CONDITION_ANY,
    function: item.FunctionCondition || CONDITION_ANY,
    departmentCondition: item.DepartmentCondition || CONDITION_ANY,
    targetKind: mapKind(item.TargetKind),
    department: item.TargetValue ?? '',
    flow: splitFlow(item.Flow),
    approver: item.Approver ?? '',
    note: item.RuleNote ?? '',
    order: item.SortOrder ?? 0,
  };
}

function toListItem(rule: IWorkflowRule): Partial<IMatrixListItem> {
  return {
    Title: rule.rule,
    RuleType: rule.type,
    Direction: rule.direction,
    Priority: rule.priority,
    SecurityLevel: rule.securityLevel,
    FunctionCondition: rule.function,
    DepartmentCondition: rule.departmentCondition ?? CONDITION_ANY,
    TargetKind: rule.targetKind ?? 'department',
    TargetValue: rule.department,
    Flow: rule.flow.join(', '),
    Approver: rule.approver,
    RuleNote: rule.note,
    SortOrder: rule.order,
  };
}

/** A rule id of the form `wm-<number>` maps back to its SharePoint item id; anything else
 * (e.g. the modal's `wm-new-<timestamp>`) is a not-yet-persisted rule. */
function itemIdFromRuleId(ruleId: string): number | undefined {
  const match = /^wm-(\d+)$/.exec(ruleId);
  return match ? Number(match[1]) : undefined;
}

export class WorkflowMatrixServiceCore {
  constructor(private readonly sp: SPFI) {}

  public async getRules(): Promise<IWorkflowRule[]> {
    const items = (await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.select(
        'Id',
        'Title',
        'RuleType',
        'Direction',
        'Priority',
        'SecurityLevel',
        'FunctionCondition',
        'DepartmentCondition',
        'TargetKind',
        'TargetValue',
        'Flow',
        'Approver',
        'RuleNote',
        'SortOrder'
      )
      .orderBy('SortOrder', true)
      .top(RESULT_CAP)()) as IMatrixListItem[];
    return items.map(mapRow);
  }

  public async saveRule(rule: IWorkflowRule): Promise<IWorkflowRule> {
    const itemId = itemIdFromRuleId(rule.id);
    if (itemId === undefined) {
      const created = (await this.sp.web.lists.getByTitle(LIST_TITLE).items.add(toListItem(rule))) as { Id: number };
      return { ...rule, id: `wm-${created.Id}` };
    }
    await this.sp.web.lists.getByTitle(LIST_TITLE).items.getById(itemId).update(toListItem(rule));
    return rule;
  }

  public async deleteRule(id: string): Promise<void> {
    const itemId = itemIdFromRuleId(id);
    if (itemId === undefined) return;
    await this.sp.web.lists.getByTitle(LIST_TITLE).items.getById(itemId).delete();
  }
}
