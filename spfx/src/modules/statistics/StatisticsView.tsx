import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ModuleHeader } from '../../shell/ModuleHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { Spinner } from '../../components/common/Spinner';
import { useServices, useAuditViewEvent } from '../../state/hooks';
import { readAdminConfigValues } from '../../services/recordsHubConfig/recordsHubConfig';
import { POWER_BI_REPORT_URL_KEY, DEFAULT_POWER_BI_REPORT_URL, withActualSizeView } from './powerBi';
import styles from './StatisticsView.module.scss';

// The Statistics dashboard is authored and owned entirely in Power BI — CORMS only embeds the
// published "publish to web" report. All charts/KPIs live in Power BI, so there is no client-side
// aggregation here anymore (the old per-tab charts were removed). The embed URL is an Admin Config
// value (integration.powerBiReportUrl) so moving/republishing the report is a config edit, not a
// code change; it falls back to the currently published report when unset.
const StatisticsView: React.FC = () => {
  const { t } = useTranslation();
  const { devSettingsService } = useServices();
  useAuditViewEvent(t('module.statistics.title'));

  const [reportUrl, setReportUrl] = React.useState<string | undefined>(undefined);
  const [configLoaded, setConfigLoaded] = React.useState(false);
  const [frameLoaded, setFrameLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    readAdminConfigValues(devSettingsService)
      .then((values) => {
        if (cancelled) return;
        setReportUrl((values[POWER_BI_REPORT_URL_KEY] ?? '').trim() || DEFAULT_POWER_BI_REPORT_URL);
      })
      .catch(() => {
        if (!cancelled) setReportUrl(DEFAULT_POWER_BI_REPORT_URL);
      })
      .finally(() => {
        if (!cancelled) setConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [devSettingsService]);

  return (
    <div className={styles.dashboard}>
      <ModuleHeader icon="barChart" title={t('module.statistics.title')} />
      {!configLoaded ? (
        <div className={styles.centered}>
          <Spinner label={t('statistics.loading')} />
        </div>
      ) : !reportUrl ? (
        <EmptyState title={t('module.statistics.title')} description={t('statistics.notConfigured')} />
      ) : (
        <div className={styles.reportFrame}>
          {!frameLoaded && (
            <div className={styles.frameOverlay}>
              <Spinner label={t('statistics.loading')} />
            </div>
          )}
          <iframe
            title={t('module.statistics.title')}
            className={styles.iframe}
            // CMS statistics — render the report at 100% (actual size), not Power BI's default
            // fit-to-page (~76%). The frame scrolls to reach anything past its bounds.
            src={withActualSizeView(reportUrl)}
            frameBorder={0}
            allowFullScreen
            onLoad={() => setFrameLoaded(true)}
          />
        </div>
      )}
    </div>
  );
};

export default StatisticsView;
