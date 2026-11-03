import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { formatCardDateTime } from '../../utils/formatDateTime';
import {
  ICorrespondenceStub,
  SECURITY_TIERS,
  STATUS_CONFIG,
  correspondenceStatusTone,
} from '../../models/ICorrespondence';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Icon } from '../../components/icons/Icon';
import { ActionsMenu, IActionsMenuItem } from '../../components/common/ActionsMenu';
import { filterWorkQueue, isUnread, requiredNextStep, workQueueUnreadCount } from './workQueue';
import styles from './WorkQueuePanel.module.scss';

export interface IWorkQueuePanelProps {
  /** Raw candidate items — the panel does the clearance/holder/actionable filtering and the
   * priority-then-date sort itself (CMS-013), so both surfaces pass their own data unchanged. */
  items: ICorrespondenceStub[];
  /** The queue owner (AC3). */
  userId: string;
  /** AC7 — items above this clearance tier are hidden. */
  maxClearanceTier: number;
  /** Ids to exclude (e.g. actions completed this session). */
  excludeIds?: ReadonlySet<string>;
  /** Opens the full record. */
  onOpen: (item: ICorrespondenceStub) => void;
  /** Optional in-panel preview (triage surface provides it; the dashboard omits it). */
  onPreview?: (item: ICorrespondenceStub) => void;
  /** Panel heading; defaults to the generic Work Queue title. */
  titleKey?: string;
}

function priorityTone(priority: ICorrespondenceStub['priority']): 'danger' | 'neutral' {
  return priority === 'High' ? 'danger' : 'neutral';
}

/**
 * CMS-013 — a user's personal Work Queue, shared by the dashboard (CMS-029) and the triage screen
 * (CMS-009) so both show the same rules (AC4). Each row names the required next step (AC1) and
 * displays Reference No., Subject, Priority, Security Level, Received Date and the Expedite flag
 * (AC6); unread items are visually distinguished (AC8). Filtering (clearance AC7, live-step holder
 * AC3, actionable-only AC2) and the priority-then-date sort (AC5) live in workQueue.ts.
 */
export const WorkQueuePanel: React.FC<IWorkQueuePanelProps> = ({
  items,
  userId,
  maxClearanceTier,
  excludeIds,
  onOpen,
  onPreview,
  titleKey = 'workQueue.title',
}) => {
  const { t } = useTranslation();
  const queue = filterWorkQueue(items, { userId, maxClearanceTier, excludeIds });
  const unread = workQueueUnreadCount(queue);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>{t(titleKey, { count: queue.length })}</span>
        {unread > 0 && <span className={styles.unreadPill}>{t('workQueue.unreadCount', { count: unread })}</span>}
      </div>

      {queue.length === 0 ? (
        <div className={styles.empty}>{t('workQueue.empty')}</div>
      ) : (
        <ul className={styles.list}>
          {queue.map((item) => {
            const step = requiredNextStep(item);
            const tierName = SECURITY_TIERS.find((tier) => tier.tier === item.securityTier)?.name;
            const menuItems: IActionsMenuItem[] = [
              ...(onPreview
                ? [{ key: 'preview', labelKey: 'triageRouting.preview.action', iconName: 'eye', onClick: () => onPreview(item) }]
                : []),
              { key: 'open', labelKey: 'myCorrespondence.viewDetails', iconName: 'externalLink', onClick: () => onOpen(item) },
            ];
            return (
              <li key={item.id} className={isUnread(item) ? `${styles.row} ${styles.rowUnread}` : styles.row}>
                {/* AC8 — per-item unread marker: the dot plus an explicit "New" badge so an
                    unopened item is unmistakably distinguished, matching the header's "N new" count. */}
                <span className={styles.unreadDot} aria-hidden={!isUnread(item)} />
                {isUnread(item) && <span className={styles.newBadge}>{t('workQueue.new')}</span>}
                <span className={styles.refNo}>{item.referenceNumber || '—'}</span>
                <span className={styles.subject} title={item.subject}>
                  {item.subject}
                </span>
                <StatusBadge label={t(`myTasks.priority.${item.priority === 'High' ? 'high' : 'normal'}`)} tone={priorityTone(item.priority)} />
                {tierName && <StatusBadge label={tierName} tone="neutral" />}
                <span className={styles.received}>{formatCardDateTime(item.createdAt)}</span>
                {item.expedited ? (
                  <span className={styles.expedite} title={item.expedited.reason}>
                    <Icon name="alertTriangle" size={11} /> {t('triageRouting.card.expedited')}
                  </span>
                ) : (
                  <span className={styles.expeditePlaceholder} />
                )}
                {/* AC1 — the named next step */}
                <span className={styles.nextStep}>
                  {step ? (
                    <>
                      <Icon name="arrow" size={12} /> {t(`triageRouting.classify.nextActionOption.${step}`)}
                    </>
                  ) : (
                    '—'
                  )}
                </span>
                {/* status kept for context alongside the required step */}
                <StatusBadge label={STATUS_CONFIG[item.status]?.label ?? item.status} tone={correspondenceStatusTone(item.status)} />
                <ActionsMenu items={menuItems} ariaLabelKey="myCorrespondence.actions" />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
