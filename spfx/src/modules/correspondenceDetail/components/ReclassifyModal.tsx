import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Icon } from '../../../components/icons/Icon';
import { SECURITY_TIERS } from '../../../models/ICorrespondence';
import styles from './ReclassifyModal.module.scss';

export interface IReclassifyModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  currentTier: number;
  goesDirect: boolean;
  onSubmit: (newTier: number, justification: string) => void;
}

// CMS-023: re-classification action, launched from the Security tab. Never changes the
// file-plan classification (Details tab's Record Classification field) — a distinct concept.
export const ReclassifyModal: React.FC<IReclassifyModalProps> = ({ isOpen, onDismiss, currentTier, goesDirect, onSubmit }) => {
  const { t } = useTranslation();
  const [newTier, setNewTier] = React.useState(currentTier);
  const [justification, setJustification] = React.useState('');

  React.useEffect(() => {
    if (isOpen) {
      setNewTier(currentTier);
      setJustification('');
    }
  }, [isOpen, currentTier]);

  const canSubmit = justification.trim().length > 0 && newTier !== currentTier;

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      title={t('correspondenceDetail.security.reclassify')}
      width={440}
      footer={
        <>
          <Button variant="default" text={t('common.cancel')} onClick={onDismiss} />
          <Button
            variant="primary"
            disabled={!canSubmit}
            text={t('correspondenceDetail.security.reclassifySubmit')}
            onClick={() => onSubmit(newTier, justification.trim())}
          />
        </>
      }
    >
      <div className={styles.field}>
        <label className={styles.label}>{t('correspondenceDetail.security.newLevel')}</label>
        <select className={styles.select} value={newTier} onChange={(e) => setNewTier(Number(e.target.value))}>
          {SECURITY_TIERS.map((tier) => (
            <option key={tier.tier} value={tier.tier}>
              {tier.name}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>{t('correspondenceDetail.security.justification')}</label>
        <textarea
          className={styles.textarea}
          rows={3}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          placeholder={t('correspondenceDetail.security.justificationPlaceholder')}
        />
      </div>
      <div className={goesDirect ? styles.noteDirect : styles.noteApproval}>
        <Icon name="info" size={14} />
        {goesDirect ? t('correspondenceDetail.security.goesDirectNote') : t('correspondenceDetail.security.goesApprovalNote')}
      </div>
    </Modal>
  );
};
