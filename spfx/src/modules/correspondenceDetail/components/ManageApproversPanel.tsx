import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/common/Button';
import { ApprovalWorkflowSection } from '../../createCorrespondence/sections/ApprovalWorkflowSection';
import { useCreateCorrespondenceForm } from '../../createCorrespondence/state/useCreateCorrespondenceForm';
import { ApprovalStep } from '../../createCorrespondence/state/types';
import {
  hasEmptyGroup,
  IPlacedSignature,
  overlappingSignatureStepIds,
} from '../../createCorrespondence/state/approvalChain';
import styles from './ManageApproversPanel.module.scss';

export interface IManageApproversPanelProps {
  /** Candidates must hold clearance at or above this tier (CMS-006 AC5). */
  securityTier?: number;
  /** Persists the new steps after the existing chain; rejects on failure. */
  onAdd: (steps: ApprovalStep[]) => Promise<void>;
  /** The existing chain's signers, whose boxes the new signatures must not overlap. */
  reservedSignatures: IPlacedSignature[];
}

/**
 * Requestor-only approver management on the Approvals tab. It reuses Create Correspondence's step
 * builder, so steps added here carry the same reviewer/department/group, mode and signing options.
 */
export const ManageApproversPanel: React.FC<IManageApproversPanelProps> = ({
  securityTier,
  onAdd,
  reservedSignatures,
}) => {
  const { t } = useTranslation();
  const builder = useCreateCorrespondenceForm('');
  const { setField, replaceApprovalSteps } = builder;
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    setField('securityTier', securityTier);
  }, [securityTier, setField]);

  const close = (): void => {
    replaceApprovalSteps([]);
    setError(false);
    setOpen(false);
  };

  const save = (): void => {
    setSaving(true);
    setError(false);
    onAdd(builder.state.approvalSteps)
      .then(close)
      .catch(() => setError(true))
      .finally(() => setSaving(false));
  };

  if (!open) {
    return (
      <div className={styles.collapsed}>
        <Button variant="primary" onClick={() => setOpen(true)}>
          {t('correspondenceDetail.approvals.manage.open')}
        </Button>
      </div>
    );
  }

  return (
    <section className={styles.panel} aria-label={t('correspondenceDetail.approvals.manage.title')}>
      <div className={styles.header}>
        <span className={styles.title}>{t('correspondenceDetail.approvals.manage.title')}</span>
        <span className={styles.helper}>{t('correspondenceDetail.approvals.manage.helper')}</span>
      </div>
      <ApprovalWorkflowSection form={builder} reservedSignatures={reservedSignatures} />
      {error && <div className={styles.error}>{t('correspondenceDetail.approvals.manage.error')}</div>}
      <div className={styles.actions}>
        <Button onClick={close} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={save}
          disabled={
            saving ||
            builder.state.approvalSteps.length === 0 ||
            hasEmptyGroup(builder.state.approvalSteps) ||
            overlappingSignatureStepIds(builder.state.approvalSteps, reservedSignatures).length > 0
          }
        >
          {t('correspondenceDetail.approvals.manage.save')}
        </Button>
      </div>
    </section>
  );
};
