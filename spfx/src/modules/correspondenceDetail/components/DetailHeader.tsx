import * as React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../../components/icons/Icon';
import { ActionsMenu, IActionsMenuItem } from '../../../components/common/ActionsMenu';
import styles from './DetailHeader.module.scss';

export interface IDetailHeaderProps {
  backPath: string;
  backLabel: string;
  /** Omitted when the viewer is not cleared to see the item (CMS-040 AC9) — the header then
   * renders the return-to-list action and nothing else, so not even the subject or reference
   * number reaches the DOM. */
  fileTitle?: string;
  refNo?: string;
  /** CMS-040 AC8 — every action available on the item, in one grouped menu rather than scattered
   * across the tab bodies. Omitted (or empty) renders no trigger at all. */
  actions?: IActionsMenuItem[];
}

// Header bar for the consolidated correspondence detail screen (CMS-040): back link + title +
// the single grouped actions menu (AC8).
export const DetailHeader: React.FC<IDetailHeaderProps> = ({ backPath, backLabel, fileTitle, refNo, actions }) => (
  <div className={styles.header}>
    <div className={styles.titleGroup}>
      <Link to={backPath} className={styles.backLink}>
        <Icon name="chevronLeft" size={16} />
        {backLabel}
      </Link>
      {fileTitle && (
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{fileTitle}</h1>
          {refNo && <span className={styles.refNo}>{refNo}</span>}
        </div>
      )}
    </div>
    {!!actions?.length && (
      <div className={styles.actionsGroup}>
        <ActionsMenu items={actions} ariaLabelKey="correspondenceDetail.actionsMenu" />
      </div>
    )}
  </div>
);
