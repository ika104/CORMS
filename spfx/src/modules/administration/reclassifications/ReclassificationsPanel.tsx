import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useServices, useNav } from '../../../state/hooks';
import { Icon } from '../../../components/icons/Icon';
import { Spinner } from '../../../components/common/Spinner';
import { EmptyState } from '../../../components/common/EmptyState';
import { IReclassificationRequest } from '../../../models/IReclassification';
import styles from './ReclassificationsPanel.module.scss';

function nowTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 16);
}

// CMS-023 AC2 (checker) — the maker-checker review queue. Lists pending re-classification requests;
// approving applies the security-level change to the correspondence and audits it, rejecting audits
// the rejection. Never touches the file-plan classification.
const ReclassificationsPanel: React.FC = () => {
  const { t } = useTranslation();
  const { reclassificationService, auditTrailService } = useServices();
  const { currentUser } = useNav();

  const [requests, setRequests] = React.useState<IReclassificationRequest[] | undefined>(undefined);
  const [busyId, setBusyId] = React.useState<string | undefined>(undefined);

  const load = React.useCallback(() => {
    setRequests(undefined);
    reclassificationService
      .getPendingRequests()
      .then(setRequests)
      .catch(() => setRequests([]));
  }, [reclassificationService]);

  React.useEffect(() => load(), [load]);

  const decide = (req: IReclassificationRequest, approve: boolean): void => {
    setBusyId(req.id);
    const actor = currentUser?.displayName ?? 'Unknown';
    reclassificationService
      .decideRequest({ requestId: req.id, approve, decidedBy: actor })
      // AC3 — audit the decision with before/after level, actor, timestamp and justification.
      .then(() =>
        auditTrailService
          .logEvent({
            objectId: req.correspondenceId,
            actor,
            action: approve ? 'Re-classification Approved' : 'Re-classification Rejected',
            details: `${req.fromLevel} → ${req.toLevel} · ${req.justification}`,
            timestamp: nowTimestamp(),
          })
          .catch(() => undefined)
      )
      .then(load)
      .catch(() => setBusyId(undefined))
      .finally(() => setBusyId(undefined));
  };

  if (!requests) {
    return (
      <div className={styles.panel}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.intro}>{t('reclassifications.intro')}</div>
      {requests.length === 0 ? (
        <EmptyState title={t('reclassifications.emptyTitle')} description={t('reclassifications.emptyDescription')} />
      ) : (
        <div className={styles.list}>
          {requests.map((req) => (
            <div key={req.id} className={styles.card}>
              <div className={styles.cardMain}>
                <div className={styles.subject}>{req.subject}</div>
                <div className={styles.ref}>{req.correspondenceRef}</div>
                <div className={styles.change}>
                  <span className={styles.fromLevel}>{req.fromLevel}</span>
                  <Icon name="arrowRight" size={14} />
                  <span className={styles.toLevel}>{req.toLevel}</span>
                </div>
                <div className={styles.justification}>
                  <span className={styles.metaLabel}>{t('reclassifications.justification')}:</span> {req.justification}
                </div>
                <div className={styles.meta}>
                  {t('reclassifications.requestedBy', { name: req.requestedBy })} · {req.requestedAt?.slice(0, 16).replace('T', ' ')}
                </div>
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.approveBtn} disabled={busyId === req.id} onClick={() => decide(req, true)}>
                  <Icon name="check" size={14} /> {t('reclassifications.approve')}
                </button>
                <button type="button" className={styles.rejectBtn} disabled={busyId === req.id} onClick={() => decide(req, false)}>
                  <Icon name="x" size={14} /> {t('reclassifications.reject')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReclassificationsPanel;
