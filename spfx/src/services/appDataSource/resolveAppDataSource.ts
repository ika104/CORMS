import { ICorrespondenceListService } from '../interfaces/ICorrespondenceListService';
import { ICorrespondenceDashboardService } from '../interfaces/ICorrespondenceDashboardService';
import { ITaskListService } from '../interfaces/ITaskListService';
import { IDelegationService } from '../interfaces/IDelegationService';
import { ISubordinateInboxService } from '../interfaces/ISubordinateInboxService';
import { IReassignmentService } from '../interfaces/IReassignmentService';
import { IRoutingService } from '../interfaces/IRoutingService';
import { IClassificationService } from '../interfaces/IClassificationService';
import { IWorkflowMatrixService } from '../interfaces/IWorkflowMatrixService';
import { IESignatureService } from '../interfaces/IESignatureService';
import { AppDataSourceMode } from './appDataSourceConfig';

/**
 * Mirrors resolveService.ts's buildXService(...) shape exactly, so screens don't each hand-roll
 * an if/else on the mode — the one difference is the driving mode comes from
 * app.correspondenceDataSource (read via IAdminConfigService), not a ds.* FeatureKey.
 */
export function resolveCorrespondenceListService(
  mode: AppDataSourceMode,
  mock: ICorrespondenceListService,
  live: ICorrespondenceListService
): ICorrespondenceListService {
  return mode === 'live' ? live : mock;
}

export function resolveCorrespondenceDashboardService(
  mode: AppDataSourceMode,
  mock: ICorrespondenceDashboardService,
  live: ICorrespondenceDashboardService
): ICorrespondenceDashboardService {
  return mode === 'live' ? live : mock;
}

/** app.taskDataSource (CMS-049 Part 4) — same shape, driven by its own independent mode (see
 * taskDataSourceConfig.ts), never app.correspondenceDataSource's. */
export function resolveTaskListService(
  mode: AppDataSourceMode,
  mock: ITaskListService,
  live: ITaskListService
): ITaskListService {
  return mode === 'live' ? live : mock;
}

/** app.delegationDataSource (Delegation & Reassignment Backend task, Part 4) — same shape, driven
 * by its own independent mode (see delegationDataSourceConfig.ts). One toggle for all three of
 * DelegationService/SubordinateInboxService/ReassignmentService — they're one screen-pair's data. */
export function resolveDelegationService(
  mode: AppDataSourceMode,
  mock: IDelegationService,
  live: IDelegationService
): IDelegationService {
  return mode === 'live' ? live : mock;
}

export function resolveSubordinateInboxService(
  mode: AppDataSourceMode,
  mock: ISubordinateInboxService,
  live: ISubordinateInboxService
): ISubordinateInboxService {
  return mode === 'live' ? live : mock;
}

export function resolveReassignmentService(
  mode: AppDataSourceMode,
  mock: IReassignmentService,
  live: IReassignmentService
): IReassignmentService {
  return mode === 'live' ? live : mock;
}

/** CMS-011 — routing writes to CORMS_Correspondence, so it follows app.correspondenceDataSource
 * (the same mode driving Triage & Routing's own data), not the delegation toggle above. */
export function resolveRoutingService(
  mode: AppDataSourceMode,
  mock: IRoutingService,
  live: IRoutingService
): IRoutingService {
  return mode === 'live' ? live : mock;
}

/** CMS-010 — classify/amend writes to CORMS_Correspondence, so it follows app.correspondenceDataSource
 * (the same mode driving Triage & Routing's data and routing), not a ds.* toggle. */
export function resolveClassificationService(
  mode: AppDataSourceMode,
  mock: IClassificationService,
  live: IClassificationService
): IClassificationService {
  return mode === 'live' ? live : mock;
}

/** CMS-012 — the Routing Matrix (CORMS_WorkflowMatrix) is admin config read/written by the
 * Workflow Matrix screen and read by Triage & Routing; it follows the same app.correspondenceDataSource
 * mode as routing so the whole routing surface is mock or live together. */
export function resolveWorkflowMatrixService(
  mode: AppDataSourceMode,
  mock: IWorkflowMatrixService,
  live: IWorkflowMatrixService
): IWorkflowMatrixService {
  return mode === 'live' ? live : mock;
}

export function resolveESignatureService(
  mode: AppDataSourceMode,
  mock: IESignatureService,
  live: IESignatureService
): IESignatureService {
  return mode === 'live' ? live : mock;
}
