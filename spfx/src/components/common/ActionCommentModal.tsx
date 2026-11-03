import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Button } from './Button';
import styles from './FlagPendingResponseModal.module.scss';

/**
 * A reusable "enter a comment before this action" modal. The comment is mandatory — the confirm
 * button stays disabled until non-whitespace text is entered — so an action that requires an
 * accountable note (e.g. editing correspondence details, deleting a draft) cannot proceed without
 * one. Modeled on ExpediteReasonModal; titles/labels are passed in so one component serves every
 * such action rather than a bespoke modal per action.
 */
export interface IActionCommentModalProps {
  isOpen: boolean;
  /** Modal heading, already localized. */
  title: string;
  /** Confirm button text, already localized. Defaults to a generic "Save". */
  confirmText?: string;
  /** Primary button tone — 'danger' for destructive actions like delete. Defaults to 'primary'. */
  confirmTone?: 'primary' | 'danger';
  onDismiss: () => void;
  onConfirm: (comment: string) => void;
}

export const ActionCommentModal: React.FC<IActionCommentModalProps> = ({
  isOpen,
  title,
  confirmText,
  confirmTone = 'primary',
  onDismiss,
  onConfirm,
}) => {
  const { t } = useTranslation();
  const [comment, setComment] = React.useState('');

  React.useEffect(() => {
    if (isOpen) setComment('');
  }, [isOpen]);

  const trimmed = comment.trim();

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      title={title}
      width={420}
      footer={
        <>
          <Button variant="default" text={t('common.cancel')} onClick={onDismiss} />
          <Button
            variant={confirmTone === 'danger' ? 'danger' : 'primary'}
            disabled={!trimmed}
            text={confirmText ?? t('common.save')}
            onClick={() => onConfirm(trimmed)}
          />
        </>
      }
    >
      <div className={styles.field}>
        <span className={styles.label}>
          {t('actionComment.label')}
          <span style={{ color: '#c50f1f' }}> *</span>
        </span>
        <textarea
          autoFocus
          rows={3}
          className={styles.textarea}
          value={comment}
          placeholder={t('actionComment.placeholder')}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
    </Modal>
  );
};
