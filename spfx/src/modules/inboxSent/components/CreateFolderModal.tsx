import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import {
  CorrespondenceStatus,
  CorrespondencePriority,
  SECURITY_TIERS,
  STATUS_CONFIG,
} from '../../../models/ICorrespondence';
import { IFolderCriteria } from '../../../models/IFolder';
import { IRecordClassification } from '../../../models/ICorrespondenceMetadata';
import { priorityLabel } from '../folderUtils';
import styles from './CreateFolderModal.module.scss';

const STATUS_OPTIONS: CorrespondenceStatus[] = [
  'Registered',
  'InReview',
  'Approved',
  'Rejected',
  'Signed',
  'Delivered',
];
const PRIORITY_OPTIONS: CorrespondencePriority[] = ['Normal', 'High'];

export interface ICreateFolderModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  onSave: (input: { name: string; criteria: IFolderCriteria }) => void;
  maxClearanceTier: number;
  recordClassifications: IRecordClassification[];
}

export const CreateFolderModal: React.FC<ICreateFolderModalProps> = ({
  isOpen,
  onDismiss,
  onSave,
  maxClearanceTier,
  recordClassifications,
}) => {
  const { t } = useTranslation();
  const [name, setName] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [securityTier, setSecurityTier] = React.useState('');
  const [priority, setPriority] = React.useState('');
  const [recordClassificationId, setRecordClassificationId] = React.useState('');
  const [sender, setSender] = React.useState('');

  const reset = (): void => {
    setName('');
    setStatus('');
    setSecurityTier('');
    setPriority('');
    setRecordClassificationId('');
    setSender('');
  };

  const handleDismiss = (): void => {
    reset();
    onDismiss();
  };

  const handleCreate = (): void => {
    if (!name.trim()) return;
    const criteria: IFolderCriteria = {
      ...(status ? { status: status as CorrespondenceStatus } : {}),
      ...(securityTier ? { securityTier: Number(securityTier) } : {}),
      ...(priority ? { priority: priority as CorrespondencePriority } : {}),
      ...(recordClassificationId ? { recordClassificationId } : {}),
      ...(sender.trim() ? { sender: sender.trim() } : {}),
    };
    onSave({ name: name.trim(), criteria });
    reset();
  };

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={handleDismiss}
      title={t('inboxSent.createFolderModal.title')}
      width={460}
      footer={
        <>
          <Button variant="default" text={t('inboxSent.createFolderModal.cancel')} onClick={handleDismiss} />
          <Button
            variant="primary"
            text={t('inboxSent.createFolderModal.create')}
            onClick={handleCreate}
            disabled={!name.trim()}
          />
        </>
      }
    >
      <div className={styles.field}>
        <label className={styles.label}>{t('inboxSent.createFolderModal.folderName')}</label>
        <input
          className={styles.input}
          value={name}
          autoFocus
          placeholder={t('inboxSent.createFolderModal.folderNamePlaceholder')}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className={styles.helper}>{t('inboxSent.createFolderModal.helper')}</div>
      <div className={styles.grid}>
        <div className={styles.field}>
          <label className={styles.label}>{t('inboxSent.createFolderModal.status')}</label>
          <select className={styles.select} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('inboxSent.createFolderModal.any')}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_CONFIG[s]?.label ?? s}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>{t('inboxSent.createFolderModal.security')}</label>
          <select
            className={styles.select}
            value={securityTier}
            onChange={(e) => setSecurityTier(e.target.value)}
          >
            <option value="">{t('inboxSent.createFolderModal.any')}</option>
            {SECURITY_TIERS.filter((tier) => tier.tier <= maxClearanceTier).map((tier) => (
              <option key={tier.tier} value={String(tier.tier)}>
                {tier.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>{t('inboxSent.createFolderModal.priority')}</label>
          <select className={styles.select} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">{t('inboxSent.createFolderModal.any')}</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p, t)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>{t('inboxSent.createFolderModal.classification')}</label>
          <select
            className={styles.select}
            value={recordClassificationId}
            onChange={(e) => setRecordClassificationId(e.target.value)}
          >
            <option value="">{t('inboxSent.createFolderModal.any')}</option>
            {recordClassifications.map((rc) => (
              <option key={rc.id} value={rc.id}>
                {rc.name}
              </option>
            ))}
          </select>
        </div>
        <div className={`${styles.field} ${styles.fieldWide}`}>
          <label className={styles.label}>{t('inboxSent.createFolderModal.sender')}</label>
          <input
            className={styles.input}
            value={sender}
            placeholder={t('inboxSent.createFolderModal.senderPlaceholder')}
            onChange={(e) => setSender(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
};
