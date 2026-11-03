import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { SECURITY_TIERS } from '../../../models/ICorrespondence';
import { ITeamInboxItem } from '../../../models/ITeamInbox';
import { IDirectoryPerson } from '../../../models/IDelegation';
import styles from './ReassignModal.module.scss';

export interface IReassignConfirmInput {
  itemId: string;
  toOwnerId: string;
  toOwnerName: string;
  reason: string;
}

export interface IReassignModalProps {
  isOpen: boolean;
  item?: ITeamInboxItem;
  /** Display name of item.ownerId — resolved by TeamInboxView from its own `subordinates` state
   * rather than this modal reading a directory fixture directly. */
  currentOwnerName: string;
  /** The supervisor's other subordinates (candidate targets, current owner excluded). */
  candidates: IDirectoryPerson[];
  onDismiss: () => void;
  /** Resolves once services.reassignmentService.reassign() settles. Rejections are caught here
   * (not by the caller) — e.g. CMS-019 AC1/AC2's server-side clearance re-check — so a failed
   * reassign surfaces as a clear inline error without losing the form's entered data. */
  onConfirm: (input: IReassignConfirmInput) => Promise<void>;
}

export const ReassignModal: React.FC<IReassignModalProps> = ({
  isOpen,
  item,
  currentOwnerName,
  candidates,
  onDismiss,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [toOwnerId, setToOwnerId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | undefined>(undefined);

  const reset = (): void => {
    setToOwnerId('');
    setReason('');
    setTouched(false);
    setSaveError(undefined);
  };

  const handleDismiss = (): void => {
    reset();
    onDismiss();
  };

  if (!item) return null;

  const tierName = SECURITY_TIERS.find((tier) => tier.tier === item.securityTier)?.name ?? '';

  // CMS-019 hard rule: a subordinate can only receive an item their own max clearance covers.
  const eligible = candidates.filter((c) => c.clearanceTier >= item.securityTier);
  const ineligible = candidates.filter((c) => c.clearanceTier < item.securityTier);
  const hasEligible = eligible.length > 0;

  const toValid = !!toOwnerId;
  const reasonValid = reason.trim().length > 0;
  const isValid = hasEligible && toValid && reasonValid;

  const handleConfirm = (): void => {
    setTouched(true);
    if (!isValid) return;
    const toOwnerName = candidates.find((c) => c.id === toOwnerId)?.displayName ?? toOwnerId;
    setSaveError(undefined);
    setSaving(true);
    onConfirm({ itemId: item.id, toOwnerId, toOwnerName, reason })
      .then(() => {
        setSaving(false);
        reset();
      })
      .catch((err: unknown) => {
        setSaving(false);
        setSaveError(err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={handleDismiss}
      title={t('reassign.modal.title')}
      footer={
        <>
          <Button variant="default" text={t('reassign.modal.cancel')} onClick={handleDismiss} disabled={saving} />
          <Button
            variant="primary"
            text={t('reassign.modal.confirm')}
            onClick={handleConfirm}
            disabled={!hasEligible || saving}
          />
        </>
      }
    >
      {saveError && <div className={styles.saveError}>{saveError}</div>}

      <div className={styles.context}>
        <div className={styles.contextRow}>
          <span className={styles.contextLabel}>{item.referenceNo}</span>
          <span className={styles.contextSubject}>{item.subject}</span>
        </div>
        <div className={styles.contextMeta}>
          {t('reassign.modal.currentlyAssigned', { name: currentOwnerName })} · {tierName}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.label}>{t('reassign.modal.reassignTo')} *</span>
        <select
          className={`${styles.select} ${touched && !toValid ? styles.invalid : ''}`}
          value={toOwnerId}
          onChange={(e) => setToOwnerId(e.target.value)}
          disabled={!hasEligible}
        >
          <option value="">{t('reassign.modal.selectPlaceholder')}</option>
          {eligible.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
          {ineligible.map((p) => (
            <option key={p.id} value={p.id} disabled>
              {p.displayName} — {t('reassign.modal.clearanceHint')}
            </option>
          ))}
        </select>
        {touched && !toValid && hasEligible && <span className={styles.error}>{t('common.requiredField')}</span>}
        {!hasEligible && <span className={styles.error}>{t('reassign.modal.noEligible')}</span>}
      </div>

      <div className={styles.field}>
        <span className={styles.label}>{t('reassign.modal.reason')} *</span>
        <textarea
          className={`${styles.textarea} ${touched && !reasonValid ? styles.invalid : ''}`}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={!hasEligible}
        />
        {touched && !reasonValid && <span className={styles.error}>{t('common.requiredField')}</span>}
      </div>
    </Modal>
  );
};
