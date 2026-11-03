import { ApprovalStep } from './types';

/** CORMS_AdminConfig key holding the administrator-managed approval workflow definitions. */
export const APPROVAL_WORKFLOWS_CONFIG_KEY = 'admin.approvalWorkflowsJson';

export interface IApprovalWorkflow {
  id: string;
  name: string;
  steps: ApprovalStep[];
}

const DEFAULT_WORKFLOWS: IApprovalWorkflow[] = [
  { id: 'standard', name: 'Standard Approval', steps: [] },
  { id: 'board', name: 'Board-Level Approval', steps: [] },
  { id: 'fast-track', name: 'Fast Track', steps: [] },
];

const DEFAULT_IDS = DEFAULT_WORKFLOWS.map((workflow) => workflow.id);

export function isDefaultApprovalWorkflow(workflowId: string): boolean {
  return DEFAULT_IDS.indexOf(workflowId) !== -1;
}

export function cloneApprovalSteps(steps: ApprovalStep[]): ApprovalStep[] {
  return steps.map((step) => {
    const base = { ...step, signaturePlacement: { ...step.signaturePlacement } };
    return step.kind === 'group'
      ? { ...base, memberIds: [...step.memberIds], memberNames: [...step.memberNames] }
      : base;
  });
}

function isApprovalStep(value: unknown): value is ApprovalStep {
  if (!value || typeof value !== 'object') return false;
  const step = value as Partial<ApprovalStep>;
  if (typeof step.id !== 'string' || typeof step.requireSignature !== 'boolean' || !step.signaturePlacement) return false;
  if (step.kind === 'reviewer') return typeof step.userId === 'string' && typeof step.userName === 'string';
  if (step.kind === 'department') {
    return typeof step.departmentId === 'string' && typeof step.departmentName === 'string' && (step.mode === 'any' || step.mode === 'all');
  }
  return (
    step.kind === 'group' &&
    typeof step.groupName === 'string' &&
    Array.isArray(step.memberIds) &&
    Array.isArray(step.memberNames) &&
    (step.mode === 'any' || step.mode === 'all')
  );
}

function isWorkflow(value: unknown): value is IApprovalWorkflow {
  if (!value || typeof value !== 'object') return false;
  const workflow = value as Partial<IApprovalWorkflow>;
  return typeof workflow.id === 'string' && workflow.id.trim().length > 0 && typeof workflow.name === 'string' && Array.isArray(workflow.steps) && workflow.steps.every(isApprovalStep);
}

/**
 * Parses persisted configuration defensively and always restores the three required workflows.
 * A malformed tenant value never prevents a correspondence from being created.
 */
export function parseApprovalWorkflowsJson(raw: string | undefined): IApprovalWorkflow[] {
  let parsed: unknown;
  try {
    parsed = raw?.trim() ? JSON.parse(raw) : [];
  } catch {
    parsed = [];
  }
  const rawWorkflows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { workflows?: unknown }).workflows)
      ? (parsed as { workflows: unknown[] }).workflows
      : [];
  const configured = rawWorkflows.filter(isWorkflow);
  const byId = new Map(configured.map((workflow) => [workflow.id, workflow]));
  const required = DEFAULT_WORKFLOWS.map((fallback) => {
    const configuredWorkflow = byId.get(fallback.id);
    return configuredWorkflow
      ? { ...configuredWorkflow, name: configuredWorkflow.name.trim() || fallback.name, steps: cloneApprovalSteps(configuredWorkflow.steps) }
      : { ...fallback, steps: [] };
  });
  const custom = configured
    .filter((workflow) => !isDefaultApprovalWorkflow(workflow.id))
    .map((workflow) => ({ ...workflow, steps: cloneApprovalSteps(workflow.steps) }));
  return [...required, ...custom];
}

export function serializeApprovalWorkflows(workflows: IApprovalWorkflow[]): string {
  return JSON.stringify({
    workflows: workflows.map((workflow) => ({ ...workflow, name: workflow.name.trim(), steps: cloneApprovalSteps(workflow.steps) })),
  });
}
