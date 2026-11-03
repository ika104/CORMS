import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Icon } from '../../../components/icons/Icon';
import styles from './ShareLinkModal.module.scss';

export interface IShareLinkModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  canShare: boolean;
  shareLink?: string;
  onGenerate: () => void;
  onRevoke: () => void;
}

// CMS-035: link generation is mocked client-side — accessing that link elsewhere must validate
// the accessor's clearance against the item's security level, which is a backend concern.
export const ShareLinkModal: React.FC<IShareLinkModalProps> = ({ isOpen, onDismiss, canShare, shareLink, onGenerate, onRevoke }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = React.useState(false);

  const handleCopy = (): void => {
    if (!shareLink) return;
    navigator.clipboard?.writeText(shareLink).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      title={t('correspondenceDetail.details.share')}
      width={440}
      footer={<Button variant="default" text={t('common.close')} onClick={onDismiss} />}
    >
      {!canShare ? (
        <div className={styles.blocked}>{t('correspondenceDetail.share.notPermitted')}</div>
      ) : shareLink ? (
        <>
          <div className={styles.linkRow}>
            <input type="text" readOnly value={shareLink} className={styles.linkInput} />
            <button type="button" className={styles.copyBtn} onClick={handleCopy}>
              <Icon name="copy" size={14} /> {copied ? t('correspondenceDetail.share.copied') : t('correspondenceDetail.share.copy')}
            </button>
          </div>
          <div className={styles.note}>{t('correspondenceDetail.share.clearanceNote')}</div>
          <Button variant="danger" onClick={onRevoke} text={t('correspondenceDetail.share.revoke')} />
        </>
      ) : (
        <>
          <p className={styles.intro}>{t('correspondenceDetail.share.intro')}</p>
          <Button variant="primary" onClick={onGenerate} text={t('correspondenceDetail.share.generate')} />
        </>
      )}
    </Modal>
  );
};
