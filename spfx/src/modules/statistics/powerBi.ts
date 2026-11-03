/** CORMS_AdminConfig key holding the Power BI "publish to web" embed URL for the Statistics
 * dashboard. Configurable so republishing the report (which mints a new `?r=` token) or pointing at
 * a different workspace is an Admin Config edit, not a code change. */
export const POWER_BI_REPORT_URL_KEY = 'integration.powerBiReportUrl';

/** The currently published CORMS_Reports embed URL — used until/unless an Admin Config value
 * overrides it, so the dashboard renders out of the box. */
export const DEFAULT_POWER_BI_REPORT_URL =
  'https://app.powerbi.com/view?r=eyJrIjoiYTQ5ODU5YmEtODgyNi00NDAwLWFmNGMtMWJlMTM0NDI0ZTBhIiwidCI6ImNhNmViMjljLTEyNGItNDkwYS1hZDI3LTA4ZmQ0MzI2N2UyOSIsImMiOjl9';

/**
 * Power BI's default embed view is "fit to page", which scales the report down to fit the frame
 * (~76% here). Requesting `pageView=ActualSize` renders it at 100% (actual size) instead — the frame
 * then scrolls to reach anything past its bounds. Idempotent: leaves an explicit `pageView` the admin
 * already set on the configured URL untouched, and no-ops on a blank URL.
 */
export function withActualSizeView(url: string): string {
  if (!url) return url;
  if (/[?&]pageView=/i.test(url)) return url;
  return `${url}${url.indexOf('?') === -1 ? '?' : '&'}pageView=ActualSize`;
}
