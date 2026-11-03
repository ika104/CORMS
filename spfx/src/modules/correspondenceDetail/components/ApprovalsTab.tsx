import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, PenLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useServices } from '../../../services/ServiceProvider';
import { CorrespondenceStatus } from '../../../models/ICorrespondence';
import { IApprovalTask } from '../../../models/IApprovalTask';
import {
  evaluateChainProgress,
  IChainProgress,
  isTaskCancelled,
  StepStatus,
} from '../../../services/approvalTasks/approvalProgress';
import { isActiveAssignee, releasedTaskIds } from '../../../services/approvalTasks/signatureHierarchy';
import { reorderTarget, StepMoveDirection } from '../../../services/approvalTasks/approvalReorder';
import { decidedOnBehalfOf } from '../../../services/approvalTasks/approvalActor';
import { Spinner } from '../../../components/common/Spinner';
import { EmptyState } from '../../../components/common/EmptyState';
import { buildApprovalChainPayload } from '../../createCorrespondence/state/approvalChain';
import { ApprovalStep } from '../../createCorrespondence/state/types';
import { canManageApprovers, nextStepOrder } from '../approverManagement';
import { ManageApproversPanel } from './ManageApproversPanel';
import styles from './ApprovalsTab.module.scss';

export interface IApprovalsTabProps {
  correspondenceId: string;
  referenceNo?: string;
  correspondenceStatus: CorrespondenceStatus;
  securityTier?: number;
  /** Only the requestor or a System Administrator manage approvers (see canManageApprovers). */
  viewerIsRequestor?: boolean;
  viewerIsSystemAdmin?: boolean;
  mainDocumentSigned?: boolean;
  currentUserName?: string;
  /** Push the chain-derived status back onto the correspondence (InReview / Approved / Draft). */
  onCorrespondenceStatusChange: (status: CorrespondenceStatus) => void;
  /** Audit each routing action (AC12) via the detail view's shared logger. */
  onAudit: (action: string, details: string) => void;
}

const STATUS_TONE: Record<StepStatus, string> = {
  Pending: styles.tonePending,
  Approved: styles.toneApproved,
  Rejected: styles.toneRejected,
  Returned: styles.toneReturned,
  Cancelled: styles.toneCancelled,
};

// The correspondence's approval chain, for its requestor and System Administrators: its progress,
// plus adding approvers and reordering the steps nobody has acted on. Approvers sign and decide
// from the Approval Tasks screen.
export const ApprovalsTab: React.FC<IApprovalsTabProps> = ({
  correspondenceId,
  referenceNo,
  correspondenceStatus,
  securityTier,
  viewerIsRequestor,
  viewerIsSystemAdmin,
  mainDocumentSigned,
  currentUserName,
  onCorrespondenceStatusChange,
  onAudit,
}) => {
  const { t } = useTranslation();
  const { approvalTaskService } = useServices();
  const [tasks, setTasks] = React.useState<IApprovalTask[] | undefined>(undefined);
  const [loadError, setLoadError] = React.useState(false);
  const [reordering, setReordering] = React.useState(false);
  const [reorderError, setReorderError] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    setTasks(undefined);
    setLoadError(false);
    approvalTaskService
      .getTasks(correspondenceId)
      .then((result) => live && setTasks(result))
      .catch(() => {
        if (!live) return;
        setTasks([]);
        setLoadError(true);
      });
    return () => {
      live = false;
    };
  }, [approvalTaskService, correspondenceId]);

  const progress: IChainProgress | undefined = React.useMemo(
    () => (tasks ? evaluateChainProgress(tasks) : undefined),
    [tasks]
  );

  // New steps run after the existing chain; adding them reopens the chain, so the correspondence
  // status is re-derived (an approved or not-yet-routed item moves to In Review).
  const addApprovers = async (steps: ApprovalStep[]): Promise<void> => {
    const chain = buildApprovalChainPayload(steps, nextStepOrder(tasks ?? []));
    const updated = await approvalTaskService.createTasksForChain(correspondenceId, referenceNo, chain);
    setTasks(updated);
    onCorrespondenceStatusChange(evaluateChainProgress(updated).correspondenceStatus);
    onAudit(
      'Approval Steps Added',
      `${chain.map((step) => `Step ${step.order} (${step.name})`).join(', ')} added by ${currentUserName ?? 'Unknown'}`
    );
  };

  // The requestor may reorder steps nobody has acted on yet; each move swaps two neighbours.
  const moveStep = (stepOrder: number, direction: StepMoveDirection): void => {
    if (!tasks) return;
    const target = reorderTarget(tasks, stepOrder, direction);
    if (target === undefined) return;
    const stepName = tasks.find((task) => task.stepOrder === stepOrder)?.stepName ?? '';
    setReordering(true);
    setReorderError(false);
    approvalTaskService
      .swapSteps(correspondenceId, stepOrder, target)
      .then((updated) => {
        setTasks(updated);
        onAudit(
          'Approval Steps Reordered',
          `Step ${stepOrder} (${stepName}) moved to step ${target} by ${currentUserName ?? 'Unknown'}`
        );
      })
      .catch(() => setReorderError(true))
      .finally(() => setReordering(false));
  };

  if (!tasks)
    return (
      <div className={styles.panel}>
        <Spinner />
      </div>
    );

  const canManage =
    !loadError &&
    canManageApprovers({
      viewerIsRequestor,
      viewerIsSystemAdmin,
      mainDocumentSigned,
      status: correspondenceStatus,
      chainOutcome: progress && tasks.length > 0 ? progress.outcome : undefined,
    });
  // New signatures go on the same document as the existing signers, so their boxes stay clear.
  const reservedSignatures = tasks
    .filter((task) => task.requireSignature && task.signaturePlacement && task.status !== 'Cancelled')
    .map((task) => ({ label: task.assignedToName ?? task.stepName, placement: task.signaturePlacement! }));
  const manageApprovers = canManage && (
    <ManageApproversPanel
      securityTier={securityTier}
      onAdd={addApprovers}
      reservedSignatures={reservedSignatures}
    />
  );

  if (tasks.length === 0) {
    return (
      <div className={styles.panel}>
        <EmptyState
          title={t(
            loadError
              ? 'correspondenceDetail.approvals.loadErrorTitle'
              : 'correspondenceDetail.approvals.emptyTitle'
          )}
          description={t(
            loadError
              ? 'correspondenceDetail.approvals.loadErrorDescription'
              : canManage
                ? 'correspondenceDetail.approvals.manage.emptyDescription'
                : 'correspondenceDetail.approvals.emptyDescription'
          )}
        />
        {manageApprovers}
      </div>
    );
  }

  const stepOrders = progress ? progress.steps.map((s) => s.stepOrder) : [];

  return (
    <div className={styles.panel}>
      <p className={styles.decideHint}>
        {t('correspondenceDetail.approvals.decideInApprovalTasks')}{' '}
        <Link to="/approval-tasks">{t('nav.approvalTasks')}</Link>
      </p>
      {manageApprovers}
      {reorderError && (
        <div className={styles.reorderError}>{t('correspondenceDetail.approvals.manage.reorderError')}</div>
      )}
      {progress && (
        <div className={styles.overallRow}>
          <span className={styles.overallLabel}>{t('correspondenceDetail.approvals.overall')}</span>
          <span className={`${styles.statusChip} ${outcomeTone(progress.outcome)}`}>
            {t(`correspondenceDetail.approvals.outcome.${progress.outcome}`)}
          </span>
        </div>
      )}

      {stepOrders.map((order) => {
        const stepProgress = progress!.steps.find((s) => s.stepOrder === order)!;
        const stepTasks = tasks.filter((tk) => tk.stepOrder === order);
        const mode = stepTasks[0]?.mode ?? 'All';
        // CMS-048 — Department members are shown in ascending seniority order (most junior first),
        // the order in which the item climbs the ladder. `released` members can no longer sign
        // because another signature already satisfied the step (AC4).
        const orderedTasks =
          stepTasks[0]?.stepType === 'Department'
            ? [...stepTasks].sort((a, b) => (a.seniority ?? 0) - (b.seniority ?? 0))
            : stepTasks;
        const released = releasedTaskIds(stepTasks);
        return (
          <div
            key={order}
            className={`${styles.stepCard} ${stepProgress.active ? styles.stepCardActive : ''}`}
          >
            <div className={styles.stepHeader}>
              {canManage && (
                <div className={styles.reorderCol}>
                  <button
                    type="button"
                    className={styles.reorderButton}
                    disabled={reordering || reorderTarget(tasks, order, 'up') === undefined}
                    onClick={() => moveStep(order, 'up')}
                    aria-label={t('correspondenceDetail.approvals.manage.moveUp')}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.reorderButton}
                    disabled={reordering || reorderTarget(tasks, order, 'down') === undefined}
                    onClick={() => moveStep(order, 'down')}
                    aria-label={t('correspondenceDetail.approvals.manage.moveDown')}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              )}
              <span className={styles.stepBadge}>{order}</span>
              <div className={styles.stepTitle}>
                <span className={styles.stepName}>{stepProgress.stepName}</span>
                <span className={styles.stepMeta}>
                  {t(`correspondenceDetail.approvals.stepType.${stepTasks[0]?.stepType ?? 'Reviewer'}`)}
                  {(stepTasks[0]?.stepType === 'Department' || stepTasks[0]?.stepType === 'Group') &&
                    ` · ${t(`correspondenceDetail.approvals.mode.${mode}`)}`}
                </span>
              </div>
              <span className={`${styles.statusChip} ${STATUS_TONE[stepProgress.status]}`}>
                {t(`correspondenceDetail.approvals.status.${stepProgress.status}`)}
              </span>
            </div>

            <ul className={styles.taskList}>
              {orderedTasks.map((task) => {
                // AC7 — only the current active assignee of the live step is due to act; the rest wait.
                const isCancelled = isTaskCancelled(task, progress!);
                const active = !isCancelled && stepProgress.active && isActiveAssignee(stepTasks, task.id);
                const isReleased = !isCancelled && released.indexOf(task.id) !== -1;
                const isWaiting =
                  !isCancelled && stepProgress.active && task.status === 'Pending' && !active && !isReleased;
                return (
                  <li key={task.id} className={styles.taskRow}>
                    <div className={styles.taskWho}>
                      <span className={styles.taskName}>
                        {task.seniority ? `${task.seniority}. ` : ''}
                        {task.assignedToName ??
                          task.assignedToTeam ??
                          t('correspondenceDetail.approvals.unassigned')}
                      </span>
                      {task.requireSignature && (
                        <span className={styles.sigFlag}>
                          <PenLine size={11} /> {t('correspondenceDetail.approvals.signatureRequired')}
                        </span>
                      )}
                      {task.status !== 'Pending' && !isCancelled && (
                        <span className={styles.taskDecision}>
                          {t(`correspondenceDetail.approvals.status.${task.status}`)}
                          {task.decidedBy && ` · ${task.decidedBy}`}
                          {decidedOnBehalfOf(task) &&
                            ` ${t('correspondenceDetail.approvals.onBehalfOf', { name: decidedOnBehalfOf(task) })}`}
                          {task.decisionComment && ` — ${task.decisionComment}`}
                        </span>
                      )}
                      {active && task.status === 'Pending' && (
                        <span className={styles.taskAwaiting}>
                          {t('correspondenceDetail.approvals.awaitingDecision')}
                        </span>
                      )}
                      {isWaiting && (
                        <span className={styles.taskWaiting}>
                          {t('correspondenceDetail.approvals.waiting')}
                        </span>
                      )}
                      {isReleased && (
                        <span className={styles.taskReleased}>
                          {t('correspondenceDetail.approvals.released')}
                        </span>
                      )}
                      {isCancelled && (
                        <span className={styles.taskCancelled}>
                          {t('correspondenceDetail.approvals.status.Cancelled')}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

function outcomeTone(outcome: IChainProgress['outcome']): string {
  if (outcome === 'Approved') return styles.toneApproved;
  if (outcome === 'Rejected') return styles.toneRejected;
  if (outcome === 'Returned') return styles.toneReturned;
  return styles.tonePending;
}
