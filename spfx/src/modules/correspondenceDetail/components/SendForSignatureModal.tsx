import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { ISignatureSigner } from '../../../models/IESignature';
import styles from './SendForSignatureModal.module.scss';

export interface ISendForSignatureModalProps {
  isOpen: boolean;
  /** Pre-fills the signer name from the correspondence recipient when known. */
  defaultSignerName?: string;
  defaultSignerEmail?: string;
  /** True while the request is being sent to the provider — disables the form and shows a spinner. */
  busy?: boolean;
  /** A signing-flow error message to surface. */
  error?: string;
  onDismiss: () => void;
  onSend: (signer: ISignatureSigner) => void;
}

// Collects the single signer (name + email) for a signing-flow request. Kept intentionally
// small — one signer covers the demo/common case; multi-signer chains can extend `onSend` later.
export const SendForSignatureModal: React.FC<ISendForSignatureModalProps> = ({
  isOpen,
  defaultSignerName,
  defaultSignerEmail,
  busy,
  error,
  onDismiss,
  onSend,
}) => {
  const { t } = useTranslation();
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');

  React.useEffect(() => {
    if (isOpen) {
      setName(defaultSignerName ?? '');
      setEmail(defaultSignerEmail ?? '');
    }
  }, [isOpen, defaultSignerName, defaultSignerEmail]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSend = !!name.trim() && emailValid && !busy;

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      title={t('correspondenceDetail.eSignature.title')}
      width={440}
      footer={
        <>
          <Button variant="default" text={t('common.cancel')} onClick={onDismiss} disabled={busy} />
          <Button
            variant="primary"
            text={
              busy ? t('correspondenceDetail.eSignature.sending') : t('correspondenceDetail.eSignature.send')
            }
            disabled={!canSend}
            onClick={() => onSend({ name: name.trim(), email: email.trim() })}
          />
        </>
      }
    >
      <p className={styles.help}>{t('correspondenceDetail.eSignature.help')}</p>
      <div className={styles.field}>
        <label className={styles.label}>
          {t('correspondenceDetail.eSignature.signerName')}
          <span className={styles.required}> *</span>
        </label>
        <input
          type="text"
          className={styles.input}
          value={name}
          disabled={busy}
          placeholder={t('correspondenceDetail.eSignature.signerNamePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label}>
          {t('correspondenceDetail.eSignature.signerEmail')}
          <span className={styles.required}> *</span>
        </label>
        <input
          type="email"
          className={styles.input}
          value={email}
          disabled={busy}
          placeholder={t('correspondenceDetail.eSignature.signerEmailPlaceholder')}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error && <div className={styles.error}>{error}</div>}
    </Modal>
  );
};
