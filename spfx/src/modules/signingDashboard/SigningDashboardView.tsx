import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { History, RefreshCw, Search, X } from 'lucide-react';
import { ModuleHeader } from '../../shell/ModuleHeader';
import { StatusBadge, StatusBadgeTone } from '../../components/common/StatusBadge';
import { Spinner } from '../../components/common/Spinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useServices, useNav, useAuditViewEvent } from '../../state/hooks';
import {
  ISigningSession,
  ISigningSessionFilters,
  SIGNING_SESSION_STATUSES,
  SigningSessionStatus,
} from '../../models/ISigningSession';
import { canCancel, canResend, filterSigningSessions } from './signingDashboardLogic';
import styles from './SigningDashboardView.module.scss';

const STATUS_TONE: Record<SigningSessionStatus, StatusBadgeTone> = {
  Sent: 'info',
  Viewed: 'info',
  Signed: 'success',
  Declined: 'danger',
  Cancelled: 'neutral',
  Expired: 'warning',
};

// CMS-007 — the signing dashboard (AC1). Searchable across signer / reference / subject, status and
// date range (AC2), with the document-control actions resend / cancel / view history (AC3). The
// The provider-independent Power Automate signing integration is what this dashboard tracks.
const SigningDashboardView: React.FC = () => {
  const { t } = useTranslation();
  const { signingService } = useServices();
  const { currentUser } = useNav();
  useAuditViewEvent(t('signing.title'));

  const [sessions, setSessions] = React.useState<ISigningSession[] | undefined>(undefined);
  const [filters, setFilters] = React.useState<ISigningSessionFilters>({});
  const [busyId, setBusyId] = React.useState<string | undefined>(undefined);
  const [historySession, setHistorySession] = React.useState<ISigningSession | undefined>(undefined);

  React.useEffect(() => {
    signingService
      .getSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [signingService]);

  const filtered = React.useMemo(() => filterSigningSessions(sessions ?? [], filters), [sessions, filters]);

  const actor = currentUser?.displayName ?? 'Unknown';

  const replaceSession = (updated: ISigningSession | undefined): void => {
    if (!updated) return;
    setSessions((prev) => (prev ? prev.map((s) => (s.id === updated.id ? updated : s)) : prev));
    setHistorySession((prev) => (prev && prev.id === updated.id ? updated : prev));
  };

  const handleResend = (session: ISigningSession): void => {
    setBusyId(session.id);
    signingService
      .resend(session.id, actor)
      .then(replaceSession)
      .catch(() => undefined)
      .finally(() => setBusyId(undefined));
  };

  const handleCancel = (session: ISigningSession): void => {
    if (!window.confirm(t('signing.confirmCancel', { ref: session.referenceNumber }))) return;
    setBusyId(session.id);
    signingService
      .cancel(session.id, actor)
      .then(replaceSession)
      .catch(() => undefined)
      .finally(() => setBusyId(undefined));
  };

  const setFilter = <K extends keyof ISigningSessionFilters>(
    key: K,
    value: ISigningSessionFilters[K]
  ): void => setFilters((prev) => ({ ...prev, [key]: value || undefined }));

  const hasFilters = !!(filters.text || filters.status || filters.dateFrom || filters.dateTo);

  return (
    <>
      <ModuleHeader icon="pen" title={t('signing.title')} />
      <div className={styles.page}>
        <p className={styles.intro}>{t('signing.intro')}</p>

        <div className={styles.searchBar}>
          <div className={styles.searchInputWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t('signing.searchPlaceholder')}
              value={filters.text ?? ''}
              onChange={(e) => setFilter('text', e.target.value)}
            />
          </div>
          <select
            className={styles.select}
            value={filters.status ?? ''}
            onChange={(e) =>
              setFilter('status', (e.target.value || undefined) as SigningSessionStatus | undefined)
            }
          >
            <option value="">{t('signing.filter.allStatuses')}</option>
            {SIGNING_SESSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`signing.status.${s}`)}
              </option>
            ))}
          </select>
          <label className={styles.dateField}>
            <span className={styles.dateLabel}>{t('signing.filter.from')}</span>
            <input
              type="date"
              className={styles.dateInput}
              value={filters.dateFrom ?? ''}
              onChange={(e) => setFilter('dateFrom', e.target.value)}
            />
          </label>
          <label className={styles.dateField}>
            <span className={styles.dateLabel}>{t('signing.filter.to')}</span>
            <input
              type="date"
              className={styles.dateInput}
              value={filters.dateTo ?? ''}
              onChange={(e) => setFilter('dateTo', e.target.value)}
            />
          </label>
          {hasFilters && (
            <button type="button" className={styles.clearButton} onClick={() => setFilters({})}>
              <X size={13} /> {t('signing.filter.clear')}
            </button>
          )}
        </div>

        {!sessions ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={t('signing.empty.title')}
            description={hasFilters ? t('signing.empty.filtered') : t('signing.empty.none')}
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('signing.col.reference')}</th>
                  <th>{t('signing.col.subject')}</th>
                  <th>{t('signing.col.signer')}</th>
                  <th>{t('signing.col.status')}</th>
                  <th>{t('signing.col.created')}</th>
                  <th>{t('signing.col.updated')}</th>
                  <th className={styles.actionsCol}>{t('signing.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((session) => (
                  <tr key={session.id}>
                    <td className={styles.mono}>{session.referenceNumber}</td>
                    <td>{session.subject}</td>
                    <td>{session.signerName}</td>
                    <td>
                      <StatusBadge
                        label={t(`signing.status.${session.status}`)}
                        tone={STATUS_TONE[session.status]}
                      />
                    </td>
                    <td className={styles.date}>{formatDate(session.createdAt)}</td>
                    <td className={styles.date}>{formatDate(session.updatedAt)}</td>
                    <td className={styles.actionsCol}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        disabled={!canResend(session.status) || busyId === session.id}
                        onClick={() => handleResend(session)}
                        title={t('signing.action.resend')}
                      >
                        <RefreshCw size={13} /> {t('signing.action.resend')}
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        disabled={!canCancel(session.status) || busyId === session.id}
                        onClick={() => handleCancel(session)}
                        title={t('signing.action.cancel')}
                      >
                        <X size={13} /> {t('signing.action.cancel')}
                      </button>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => setHistorySession(session)}
                        title={t('signing.action.history')}
                      >
                        <History size={13} /> {t('signing.action.history')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {historySession && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => setHistorySession(undefined)}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>{t('signing.history.title')}</h2>
                <span className={styles.modalSub}>
                  {historySession.referenceNumber} · {historySession.signerName}
                </span>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setHistorySession(undefined)}
                aria-label={t('common.cancel')}
              >
                <X size={16} />
              </button>
            </div>
            <ol className={styles.timeline}>
              {historySession.events.map((ev) => (
                <li key={ev.id} className={styles.timelineItem}>
                  <span className={styles.timelineEvent}>{t(`signing.event.${ev.event}`, ev.event)}</span>
                  <span className={styles.timelineMeta}>
                    {formatDateTime(ev.timestamp)} · {ev.actor}
                  </span>
                  {ev.detail && <span className={styles.timelineDetail}>{ev.detail}</span>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </>
  );
};

function formatDate(iso: string): string {
  return (iso ?? '').slice(0, 10);
}
function formatDateTime(iso: string): string {
  return (iso ?? '').replace('T', ' ').slice(0, 16);
}

export default SigningDashboardView;
