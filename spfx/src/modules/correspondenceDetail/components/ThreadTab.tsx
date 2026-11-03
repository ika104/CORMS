import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { formatCardDateTime } from '../../../utils/formatDateTime';
import { Icon } from '../../../components/icons/Icon';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { ICorrespondenceStub, STATUS_CONFIG, correspondenceStatusTone } from '../../../models/ICorrespondence';
import styles from './ThreadTab.module.scss';

export interface IThreadTabProps {
  items: ICorrespondenceStub[];
  currentId: string;
  chainId: string;
  onNavigate: (id: string) => void;
}

export const ThreadTab: React.FC<IThreadTabProps> = ({ items, currentId, chainId, onNavigate }) => {
  const { t } = useTranslation();
  const sorted = [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const currentIndex = sorted.findIndex((i) => i.id === currentId);
  const prevItem = currentIndex > 0 ? sorted[currentIndex - 1] : undefined;
  const nextItem = currentIndex >= 0 && currentIndex < sorted.length - 1 ? sorted[currentIndex + 1] : undefined;

  return (
    <div className={styles.tab}>
      <div className={styles.refRow}>
        <span className={styles.refLabel}>{t('correspondenceDetail.thread.reference')}</span>
        <span className={styles.refValue}>{chainId}</span>
      </div>

      <div className={styles.navRow}>
        <button type="button" disabled={!prevItem} onClick={() => prevItem && onNavigate(prevItem.id)}>
          <Icon name="chevronLeft" size={14} /> {t('correspondenceDetail.thread.previous')}
        </button>
        <button type="button" disabled={!nextItem} onClick={() => nextItem && onNavigate(nextItem.id)}>
          {t('correspondenceDetail.thread.next')} <Icon name="chevronRight" size={14} />
        </button>
      </div>

      <div className={styles.rail}>
        {sorted.map((item, i) => {
          const isCurrent = item.id === currentId;
          return (
            <button
              type="button"
              key={item.id}
              className={isCurrent ? `${styles.item} ${styles.itemCurrent}` : styles.item}
              onClick={() => !isCurrent && onNavigate(item.id)}
            >
              <span className={styles.badgeNo}>{i + 1}</span>
              <span className={styles.body}>
                <span className={styles.subjectRow}>
                  <span className={styles.subject}>{item.subject}</span>
                  <span className={styles.date}>{formatCardDateTime(item.createdAt)}</span>
                </span>
                <span className={styles.metaRow}>
                  <span className={styles.metaRef}>{item.referenceNumber || '—'}</span>
                  {/* CMS-022 AC3 — each entry shows direction, date (above) and status. */}
                  <span className={styles.metaDirection}>{t(`correspondenceDetail.direction.${item.direction}`)}</span>
                  {item.type && <span className={styles.metaType}>{item.type}</span>}
                  <StatusBadge label={STATUS_CONFIG[item.status]?.label ?? item.status} tone={correspondenceStatusTone(item.status)} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
