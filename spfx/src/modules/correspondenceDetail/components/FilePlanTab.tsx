import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/icons/Icon';
import { ICorrespondenceDetail } from '../../../models/ICorrespondenceDetail';
import styles from './FilePlanTab.module.scss';

export interface IFilePlanTabProps {
  detail: ICorrespondenceDetail;
}

/**
 * CMS-027 AC1/AC3 — the File Plan tab: the enclosing business-activity File the correspondence is
 * filed under, and that file's position in the RecordsHub file plan. Read-only context (the item's
 * classification is amended from Triage/Details, not here), so navigating in never mutates the item.
 */
export const FilePlanTab: React.FC<IFilePlanTabProps> = ({ detail }) => {
  const { t } = useTranslation();
  const filePlan = detail.filePlan;

  if (!filePlan) {
    return (
      <div className={`${styles.tab} ${styles.empty}`}>
        <Icon name="folderOpen" size={28} />
        <span>{t('correspondenceDetail.filePlan.unfiled')}</span>
      </div>
    );
  }

  const rows: { label: string; value: string }[] = [
    { label: t('correspondenceDetail.filePlan.fileName'), value: filePlan.fileName || '—' },
    { label: t('correspondenceDetail.filePlan.fileNumber'), value: filePlan.fileNumber || '—' },
    { label: t('correspondenceDetail.filePlan.position'), value: filePlan.filePlanPosition || '—' },
    { label: t('correspondenceDetail.filePlan.classification'), value: detail.recordClassificationName || '—' },
  ];

  return (
    <div className={styles.tab}>
      <div className={styles.fileCard}>
        <span className={styles.fileIcon}>
          <Icon name="folderOpen" size={22} />
        </span>
        <div className={styles.fileHeadings}>
          <span className={styles.fileTitle}>{filePlan.fileName || filePlan.fileNumber}</span>
          <span className={styles.fileSubtitle}>{t('correspondenceDetail.filePlan.enclosingFile')}</span>
        </div>
      </div>

      <div className={styles.fieldList}>
        {rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <span className={styles.label}>{row.label}</span>
            <span className={styles.valueText}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
