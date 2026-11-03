import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/icons/Icon';
import styles from './AccessDeniedView.module.scss';

export interface IAccessDeniedViewProps {
  /** Omitted when the caller genuinely doesn't have the classification level to show — the live
   * CorrespondenceDetailService (CMS-040 AC9) returns no metadata at all for a denied item, by
   * design, so there is nothing to interpolate here in that path; falls back to a generic
   * message instead of a level-specific one. */
  securityLevelName?: string;
}

// Renders in place of all tab content when the item's security level exceeds the viewer's
// clearance — no tab content is rendered underneath (spec: "no tab content rendered").
export const AccessDeniedView: React.FC<IAccessDeniedViewProps> = ({ securityLevelName }) => {
  const { t } = useTranslation();
  return (
    <div className={styles.wrap}>
      <Icon name="lock" size={40} />
      <div className={styles.title}>{t('correspondenceDetail.accessDenied.title')}</div>
      <div className={styles.description}>
        {securityLevelName
          ? t('correspondenceDetail.accessDenied.description', { level: securityLevelName })
          : t('correspondenceDetail.accessDenied.descriptionGeneric')}
      </div>
    </div>
  );
};
