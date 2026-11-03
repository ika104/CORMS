import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, PenLine } from 'lucide-react';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { useServices } from '../../../services/ServiceProvider';
import { useNav } from '../../../state/hooks/useNav';
import { ApprovalDecision, IApprovalTask } from '../../../models/IApprovalTask';
import { IApprovalInboxItem } from '../../../models/IApprovalInbox';
import { SECURITY_TIERS, STATUS_CONFIG } from '../../../models/ICorrespondence';
import { evaluateChainProgress } from '../../../services/approvalTasks/approvalProgress';
import { decidedOnBehalfOf } from '../../../services/approvalTasks/approvalActor';
import { formatCardDate } from '../../../utils/formatDateTime';
import { ApprovalDecisionModal } from '../../correspondenceDetail/components/ApprovalDecisionModal';
import {
  completeApprovalSignature,
  decideApprovalTask,
  IApprovalActionContext,
  requestApprovalSignature,
} from '../approvalTaskActions';
import { inboxStateBadge, stepStatusTone } from '../approvalTaskBadges';
import styles from './ApprovalTaskModal.module.scss';

const DECISION_LABEL_KEY: Record<ApprovalDecision, string> = {
  Approved: 'correspondenceDetail.approvals.approve',
  Rejected: 'correspondenceDetail.approvals.reject',
  Returned: 'correspondenceDetail.approvals.return',
};

export interface IApprovalTaskModalProps {
  item?: IApprovalInboxItem;
  onDismiss: () => void;
  /** Called after the task changed, so the list can reload. */
  onChanged: () => void;
}

/**
 * One approval task in context: the correspondence, the approver's step and the whole chain's
 * progress. When it is the approver's turn, they sign and decide here.
 */
export const ApprovalTaskModal: React.FC<IApprovalTaskModalProps> = ({ item, onDismiss, onChanged }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const services = useServices();
  const { currentUser } = useNav();
  // The chain as last saved; signing and deciding update it before the list reloads.
  const [chainTasks, setChainTasks] = React.useState<IApprovalTask[]>([]);
  const [pendingOutcome, setPendingOutcome] = React.useState<ApprovalDecision | undefined>(undefined);

  React.useEffect(() => {
    setChainTasks(item?.chainTasks ?? []);
    setPendingOutcome(undefined);
  }, [item]);

  if (!item) return null;

  const task = chainTasks.find((candidate) => candidate.id === item.task.id) ?? item.task;
  const { correspondence } = item;
  const progress = evaluateChainProgress(chainTasks);
  const canAct = item.state === 'ToDo' && task.status === 'Pending';
  const context: IApprovalActionContext = {
    correspondenceId: correspondence.id,
    referenceNumber: correspondence.referenceNumber,
    subject: correspondence.subject,
    actorName: currentUser?.displayName ?? 'Unknown',
    actorEmail: currentUser?.email,
  };

  const requestSignature = async (): Promise<{ externalDocumentId: string; signingUrl: string }> => {
    const result = await requestApprovalSignature(
      services,
      context,
      task,
      chainTasks,
      t('correspondenceDetail.approvals.signatureIdentityMissing'),
      t('correspondenceDetail.eSignature.noDocument')
    );
    setChainTasks(result.tasks);
    return result.request;
  };

  const checkSignature = async (externalDocumentId: string): Promise<boolean> => {
    const updated = await completeApprovalSignature(
      services,
      context,
      task,
      externalDocumentId,
      t('correspondenceDetail.eSignature.saveSignedFailed')
    );
    if (updated) setChainTasks(updated);
    return !!updated;
  };

  const confirmDecision = async (comment: string): Promise<void> => {
    const outcome = pendingOutcome;
    if (!outcome) return;
    // Keep pendingOutcome set while saving. Clearing it here used to reveal this parent modal with
    // its stale Pending task before the decision service had completed.
    await decideApprovalTask(services, context, task, outcome, comment);
    onChanged();
    onDismiss();
  };

  const securityLevel = SECURITY_TIERS.find((tier) => tier.tier === correspondence.securityTier)?.name;
  const onBehalfOf = decidedOnBehalfOf(task);
  const stateBadge = inboxStateBadge(item.state, task);

  return (
    <>
      <Modal
        isOpen={!pendingOutcome}
        onDismiss={onDismiss}
        title={correspondence.subject || t('approvalTasks.modal.title')}
        width={720}
        footer={
          <>
            <Button variant="default" text={t('common.close')} onClick={onDismiss} />
            {canAct && (
              <>
                <Button
                  variant="default"
                  text={t('correspondenceDetail.approvals.return')}
                  onClick={() => setPendingOutcome('Returned')}
                />
                <Button
                  variant="danger"
                  text={t('correspondenceDetail.approvals.reject')}
                  onClick={() => setPendingOutcome('Rejected')}
                />
                <Button
                  variant="primary"
                  text={t('correspondenceDetail.approvals.approve')}
                  onClick={() => setPendingOutcome('Approved')}
                />
              </>
            )}
          </>
        }
      >
        <div className={styles.body}>
          <dl className={styles.summary}>
            <div>
              <dt>{t('approvalTasks.field.reference')}</dt>
              <dd>{correspondence.referenceNumber || '—'}</dd>
            </div>
            <div>
              <dt>{t('approvalTasks.field.sender')}</dt>
              <dd>{correspondence.senderName || '—'}</dd>
            </div>
            <div>
              <dt>{t('approvalTasks.field.dueDate')}</dt>
              <dd className={item.isOverdue ? styles.overdue : undefined}>
                {correspondence.dueDate ? formatCardDate(correspondence.dueDate) : '—'}
              </dd>
            </div>
            <div>
              <dt>{t('approvalTasks.field.security')}</dt>
              <dd>{securityLevel || '—'}</dd>
            </div>
            <div>
              <dt>{t('approvalTasks.field.correspondenceStatus')}</dt>
              <dd>{correspondence.status ? STATUS_CONFIG[correspondence.status].label : '—'}</dd>
            </div>
          </dl>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('approvalTasks.modal.yourTask')}</h3>
            <div className={styles.taskRow}>
              <div>
                <div className={styles.taskName}>
                  {t('approvalTasks.stepLabel', { order: task.stepOrder, name: task.stepName })}
                </div>
                <div className={styles.taskMeta}>
                  {t(`correspondenceDetail.approvals.stepType.${task.stepType}`)}
                  {task.assignedToName && ` · ${task.assignedToName}`}
                  {task.requireSignature && (
                    <span className={styles.signature}>
                      <PenLine size={11} /> {t('correspondenceDetail.approvals.signatureRequired')}
                    </span>
                  )}
                </div>
                {task.status !== 'Pending' && task.decidedBy && (
                  <div className={styles.taskMeta}>
                    {task.decidedBy}
                    {onBehalfOf && ` ${t('correspondenceDetail.approvals.onBehalfOf', { name: onBehalfOf })}`}
                    {task.decisionComment && ` — ${task.decisionComment}`}
                  </div>
                )}
              </div>
              <StatusBadge label={t(stateBadge.labelKey)} tone={stateBadge.tone} />
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('approvalTasks.modal.progress')}</h3>
            <ol className={styles.steps}>
              {progress.steps.map((step) => (
                <li
                  key={step.stepOrder}
                  className={`${styles.step} ${step.stepOrder === task.stepOrder ? styles.stepCurrent : ''}`}
                >
                  <span className={styles.stepOrder}>{step.stepOrder}</span>
                  <span className={styles.stepName}>{step.stepName}</span>
                  <StatusBadge
                    label={t(`correspondenceDetail.approvals.status.${step.status}`)}
                    tone={stepStatusTone(step.status)}
                  />
                </li>
              ))}
            </ol>
          </section>

          <button
            type="button"
            className={styles.openLink}
            onClick={() => {
              onDismiss();
              navigate(`/correspondence/${correspondence.id}`);
            }}
          >
            <ExternalLink size={13} /> {t('approvalTasks.modal.openCorrespondence')}
          </button>
        </div>
      </Modal>

      {pendingOutcome && (
        <ApprovalDecisionModal
          isOpen
          task={task}
          outcome={pendingOutcome}
          title={t('correspondenceDetail.approvals.decisionTitle', {
            action: t(DECISION_LABEL_KEY[pendingOutcome]),
          })}
          confirmText={t(DECISION_LABEL_KEY[pendingOutcome])}
          confirmTone={pendingOutcome === 'Rejected' ? 'danger' : 'primary'}
          onRequestSignature={requestSignature}
          onCheckSignatureCompletion={checkSignature}
          onDismiss={() => setPendingOutcome(undefined)}
          onConfirm={confirmDecision}
        />
      )}
    </>
  );
};
