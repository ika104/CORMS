import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/icons/Icon';
import { ITimelineEvent, TimelineEventKind } from '../../../models/ICorrespondenceDetail';
import { formatCardDateTime } from '../../../utils/formatDateTime';
import styles from './TimelineTab.module.scss';

export interface ITimelineTabProps {
  events: ITimelineEvent[];
}

const KIND_CONFIG: Record<TimelineEventKind, { iconName: string; color: string; labelKey: string }> = {
  created: { iconName: 'plus', color: '#0070d0', labelKey: 'correspondenceDetail.timeline.kind.created' },
  edited: { iconName: 'pencil', color: '#605e5c', labelKey: 'correspondenceDetail.timeline.kind.edited' },
  submitted: { iconName: 'send', color: '#835b00', labelKey: 'correspondenceDetail.timeline.kind.submitted' },
  referenceAssigned: {
    iconName: 'fileCheck',
    color: '#0070d0',
    labelKey: 'correspondenceDetail.timeline.kind.referenceAssigned',
  },
  routed: { iconName: 'route', color: '#835b00', labelKey: 'correspondenceDetail.timeline.kind.routed' },
  approved: { iconName: 'check', color: '#107c10', labelKey: 'correspondenceDetail.timeline.kind.approved' },
  rejected: { iconName: 'x', color: '#c50f1f', labelKey: 'correspondenceDetail.timeline.kind.rejected' },
  signatureRequested: {
    iconName: 'pencil',
    color: '#5c2d91',
    labelKey: 'correspondenceDetail.timeline.kind.signatureRequested',
  },
  signed: {
    iconName: 'shieldCheck',
    color: '#107c10',
    labelKey: 'correspondenceDetail.timeline.kind.signed',
  },
  emailSent: { iconName: 'mail', color: '#0070d0', labelKey: 'correspondenceDetail.timeline.kind.emailSent' },
  reminder: { iconName: 'bell', color: '#835b00', labelKey: 'correspondenceDetail.timeline.kind.reminder' },
  reply: { iconName: 'reply', color: '#0070d0', labelKey: 'correspondenceDetail.timeline.kind.reply' },
  expedited: {
    iconName: 'alertTriangle',
    color: '#c50f1f',
    labelKey: 'correspondenceDetail.timeline.kind.expedited',
  },
  delivered: {
    iconName: 'checkCircle',
    color: '#107c10',
    labelKey: 'correspondenceDetail.timeline.kind.delivered',
  },
  acknowledged: {
    iconName: 'shieldCheck',
    color: '#107c10',
    labelKey: 'correspondenceDetail.timeline.kind.acknowledged',
  },
  reassigned: {
    iconName: 'route',
    color: '#5c2d91',
    labelKey: 'correspondenceDetail.timeline.kind.reassigned',
  },
};

export const TimelineTab: React.FC<ITimelineTabProps> = ({ events }) => {
  const { t } = useTranslation();
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  return (
    <div className={styles.tab}>
      <div className={styles.intro}>{t('correspondenceDetail.timeline.intro')}</div>
      <div className={styles.rail}>
        {sorted.map((ev) => {
          const cfg = KIND_CONFIG[ev.kind];
          return (
            <div key={ev.id} className={styles.item}>
              <div
                className={styles.dot}
                style={{ background: cfg.color, boxShadow: `0 0 0 2px ${cfg.color}44` }}
              >
                <Icon name={cfg.iconName} size={16} color="#fff" />
              </div>
              <div className={styles.body}>
                <div className={styles.headRow}>
                  <span className={styles.action}>{t(cfg.labelKey)}</span>
                  <span className={styles.timestamp}>{formatCardDateTime(ev.timestamp)}</span>
                </div>
                <div className={styles.actor}>{ev.actor}</div>
                {ev.details && <div className={styles.details}>{ev.details}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
