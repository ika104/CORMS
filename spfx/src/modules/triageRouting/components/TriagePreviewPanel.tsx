import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { formatCardDateTime } from '../../../utils/formatDateTime';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Icon } from '../../../components/icons/Icon';
import { ICorrespondenceStub, SECURITY_TIERS, correspondenceStatusTone } from '../../../models/ICorrespondence';
import styles from './TriagePreviewPanel.module.scss';

export interface ITriagePreviewPanelProps {
  item: ICorrespondenceStub;
  isOpen: boolean;
  onDismiss: () => void;
  /** AC6/AC10 — jump from the preview to the full correspondence view. */
  onOpenFull: () => void;
}

/**
 * CMS-009 AC10 — a read-only preview of the full correspondence, openable from any stage of the
 * triage workflow (both the compact card strip and the officer's own work queue). It surfaces the
 * complete field set AC2 requires without leaving the triage screen, and offers a one-click jump
 * to the full record (AC6). Fed by the same stub the queue already holds, so no extra fetch.
 */
export const TriagePreviewPanel: React.FC<ITriagePreviewPanelProps> = ({ item, isOpen, onDismiss, onOpenFull }) => {
  const { t } = useTranslation();
  const security = SECURITY_TIERS.find((tier) => tier.tier === item.securityTier);

  const rows: { label: string; node: React.ReactNode }[] = [
    { label: t('triageRouting.preview.field.reference'), node: item.referenceNumber || t('myCorrespondence.draftNotRegistered') },
    { label: t('triageRouting.preview.field.type'), node: item.type },
    {
      label: t('triageRouting.preview.field.status'),
      node: <StatusBadge label={item.status} tone={correspondenceStatusTone(item.status)} />,
    },
    {
      label: t('triageRouting.preview.field.priority'),
      node: <StatusBadge label={item.priority} tone={item.priority === 'High' ? 'danger' : 'neutral'} />,
    },
    {
      label: t('triageRouting.preview.field.security'),
      node: <StatusBadge label={security?.name ?? String(item.securityTier)} tone="neutral" />,
    },
    { label: t('triageRouting.preview.field.department'), node: item.department || '—' },
    { label: t('triageRouting.preview.field.received'), node: formatCardDateTime(item.createdAt) },
    ...(item.senderName ? [{ label: t('triageRouting.preview.field.sender'), node: item.senderName }] : []),
    ...(item.recipientName ? [{ label: t('triageRouting.preview.field.recipient'), node: item.recipientName }] : []),
  ];

  return (
    <Modal isOpen={isOpen} onDismiss={onDismiss} title={t('triageRouting.preview.title')} width={520}>
      <div className={styles.subject}>{item.subject}</div>

      {item.expedited && (
        <div className={styles.expediteBanner}>
          <Icon name="alertTriangle" size={14} />
          <span>{t('triageRouting.preview.expedited', { reason: item.expedited.reason })}</span>
        </div>
      )}

      <dl className={styles.fields}>
        {rows.map((row, i) => (
          <div key={i} className={styles.fieldRow}>
            <dt className={styles.fieldLabel}>{row.label}</dt>
            <dd className={styles.fieldValue}>{row.node}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.footer}>
        <Button onClick={onDismiss}>{t('common.close')}</Button>
        <Button variant="primary" onClick={onOpenFull}>
          {t('triageRouting.preview.openFull')}
        </Button>
      </div>
    </Modal>
  );
};
