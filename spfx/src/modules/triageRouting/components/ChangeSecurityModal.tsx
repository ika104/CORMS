import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Icon } from '../../../components/icons/Icon';
import { Spinner } from '../../../components/common/Spinner';
import { ICorrespondenceStub, SECURITY_TIERS } from '../../../models/ICorrespondence';
import { ITriageDraft } from '../types';
import styles from './AmendClassificationModal.module.scss';

export interface IChangeSecurityModalProps {
  item: ICorrespondenceStub;
  captured: ITriageDraft;
  maxClearanceTier: number;
  onDismiss: () => void;
  onSubmit: (next: ITriageDraft, reason: string) => Promise<void>;
}

/** Security changes are intentionally isolated: they need protected focus, a reason, and an audit trail. */
export const ChangeSecurityModal: React.FC<IChangeSecurityModalProps> = ({
  item,
  captured,
  maxClearanceTier,
  onDismiss,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [securityTier, setSecurityTier] = React.useState<number | undefined>(captured.securityTier);
  const [reason, setReason] = React.useState('');
  // Only surface the "reason required" error after interaction / a save attempt, not on first open.
  const [reasonTouched, setReasonTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | undefined>(undefined);
  const previousName = SECURITY_TIERS.find((tier) => tier.tier === captured.securityTier)?.name ?? t('triageRouting.classify.selectPlaceholder');
  const nextName = SECURITY_TIERS.find((tier) => tier.tier === securityTier)?.name ?? t('triageRouting.classify.selectPlaceholder');
  const canSubmit = securityTier !== captured.securityTier && reason.trim().length > 0;

  const save = async (): Promise<void> => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      await onSubmit({ ...captured, securityTier }, reason.trim());
      setSaved(true);
    } catch {
      setSaveError(t('triageRouting.securityChange.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = (): void => {
    setReasonTouched(true);
    save().catch(() => undefined);
  };

  return (
    <Modal
      isOpen
      onDismiss={onDismiss}
      title={t('triageRouting.securityChange.title')}
      width={500}
      isDismissable={!saving}
      footer={
        saved ? <Button variant="primary" text={t('common.close')} onClick={onDismiss} /> : (
          <>
            <Button text={t('common.cancel')} onClick={onDismiss} disabled={saving} />
            <Button variant="primary" disabled={!canSubmit || saving} text={saving ? t('triageRouting.securityChange.saving') : t('triageRouting.securityChange.submit')} onClick={handleSaveClick} />
          </>
        )
      }
    >
      {saving && <div className={styles.saveState}><Spinner label={t('triageRouting.securityChange.saving')} /></div>}
      {saved && <div className={styles.successState}><Icon name="check" size={18} /><div><strong>{t('triageRouting.securityChange.savedTitle')}</strong><span>{t('triageRouting.securityChange.savedDescription')}</span></div></div>}
      {saveError && <div className={styles.errorState} role="alert">{saveError}</div>}
      {!saved && !saving && <>
      <div className={styles.introNote}>
        <Icon name="shieldCheck" size={14} />
        <span>{t('triageRouting.securityChange.helper', { subject: item.subject })}</span>
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{t('triageRouting.classify.securityLevel')}</span>
        <select className={styles.select} value={securityTier ?? ''} disabled={saving} onChange={(event) => setSecurityTier(event.target.value ? Number(event.target.value) : undefined)}>
          <option value="">{t('triageRouting.classify.selectPlaceholder')}</option>
          {SECURITY_TIERS.map((tier) => <option key={tier.tier} value={tier.tier} disabled={tier.tier > maxClearanceTier}>{tier.name}</option>)}
        </select>
      </div>
      <div className={styles.changePreview}>
        <div className={styles.previewTitle}>{t('triageRouting.securityChange.changeSummary')}</div>
        <div className={styles.changeRow}>
          <span className={styles.changeField}>{t('triageRouting.classify.securityLevel')}</span>
          <span className={styles.changeFrom}>{previousName}</span>
          <Icon name="arrow" size={12} />
          <span className={styles.changeTo}>{nextName}</span>
        </div>
      </div>
      <div className={styles.field}>
        <span className={styles.label}>{t('triageRouting.amend.reasonLabel')} <span className={styles.required}>*</span></span>
        <textarea className={styles.reason} rows={3} value={reason} disabled={saving} placeholder={t('triageRouting.amend.reasonPlaceholder')} onChange={(event) => setReason(event.target.value)} onBlur={() => setReasonTouched(true)} />
        {reasonTouched && !reason.trim() && <div className={styles.reasonHint}>{t('triageRouting.amend.reasonRequired')}</div>}
      </div>
      </>}
    </Modal>
  );
};
