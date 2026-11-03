import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Icon } from '../../../components/icons/Icon';
import styles from './ReplyModal.module.scss';

export interface IReplyModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  onContinue: () => void;
  hasThread: boolean;
}

// CMS-041: shown before navigating to the compose form, so the "linked to thread" behaviour
// is visible up front rather than a silent side effect of Reply.
export const ReplyModal: React.FC<IReplyModalProps> = ({ isOpen, onDismiss, onContinue, hasThread }) => {
  const { t } = useTranslation();
  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      title={t('myCorrespondence.reply')}
      width={400}
      footer={
        <>
          <Button variant="default" text={t('common.cancel')} onClick={onDismiss} />
          <Button variant="primary" text={t('correspondenceDetail.reply.continue')} onClick={onContinue} />
        </>
      }
    >
      <div className={styles.note}>
        <Icon name="link" size={14} />
        {hasThread ? t('correspondenceDetail.reply.threadNote') : t('correspondenceDetail.reply.newThreadNote')}
      </div>
    </Modal>
  );
};
