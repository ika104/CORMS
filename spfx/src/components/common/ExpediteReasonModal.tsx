import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Button } from './Button';
import styles from './FlagPendingResponseModal.module.scss';

// TODO(confirm): no Figma frame yet — modeled on shared components + story ACs (CMS-015);
// confirm against design when available.
export interface IExpediteReasonModalProps {
  isOpen: boolean;
  /** Plural target count, for the title ("Expedite 1 item" vs "Expedite 3 items"). */
  targetCount: number;
  onDismiss: () => void;
  onConfirm: (reason: string) => void;
}

export const ExpediteReasonModal: React.FC<IExpediteReasonModalProps> = ({ isOpen, targetCount, onDismiss, onConfirm }) => {
  const { t } = useTranslation();
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  const trimmed = reason.trim();

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      title={t('expedite.modal.title', { count: targetCount })}
      width={420}
      footer={
        <>
          <Button variant="default" text={t('common.cancel')} onClick={onDismiss} />
          <Button variant="primary" disabled={!trimmed} text={t('expedite.modal.confirm')} onClick={() => onConfirm(trimmed)} />
        </>
      }
    >
      <div className={styles.field}>
        <span className={styles.label}>{t('expedite.modal.reason')}</span>
        <textarea
          autoFocus
          rows={3}
          className={styles.textarea}
          value={reason}
          placeholder={t('expedite.modal.reasonPlaceholder')}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </Modal>
  );
};
