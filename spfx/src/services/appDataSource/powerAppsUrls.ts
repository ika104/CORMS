import { IDevSettingsService } from '../interfaces/IDevSettingsService';

/**
 * CMS-050/CMS-052 Part 0 — "Create New Task" / "View Task Details" are pure SPFx-side entry
 * points: a button/link that navigates to a Power Apps URL sourced from CORMS_AdminConfig, never
 * hard-coded. These two keys already existed as hard-coded placeholders on the static
 * ConfigService (src/services/config/ConfigService.ts, IConfigService.powerAppsTaskFormUrl/
 * powerAppsTaskDetailUrl) from the earlier UI-only My Tasks task — this module is the "confirm it
 * now lives in the real CORMS_AdminConfig list rather than being redefined" piece: same key names,
 * Category 'Integration', read/written via the same live devSettings REST client every other
 * CORMS_AdminConfig row in this app-owned family uses (see appDataSourceConfig.ts's file comment
 * for why IDevSettingsService, not IAdminConfigService — it has no live implementation).
 * ConfigService's own two fields are untouched — they still back the unrelated, already-disclosed
 * mock-only CMS-055/056 Admin Config screen (AdminConfigServiceMock's constructor args) — this is
 * a second, genuinely-live source for the same two key *names*, not a replacement of that one.
 */
export const POWER_APPS_TASK_FORM_URL_KEY = 'powerAppsTaskFormUrl';
export const POWER_APPS_TASK_DETAIL_URL_KEY = 'powerAppsTaskDetailUrl';

export interface IPowerAppsTaskUrls {
  /** Empty string when unconfigured — callers render a disabled state, never a broken navigation. */
  taskFormUrl: string;
  /** Empty string when unconfigured. Contains a literal `{taskId}` placeholder, substituted by
   * buildTaskDetailUrl() before navigating. */
  taskDetailUrl: string;
}

const EMPTY_URLS: IPowerAppsTaskUrls = { taskFormUrl: '', taskDetailUrl: '' };

export async function readPowerAppsTaskUrls(devSettingsService: IDevSettingsService): Promise<IPowerAppsTaskUrls> {
  const rows = await devSettingsService.getSettings();
  if (!rows) return EMPTY_URLS;
  const formRow = rows.find((r) => r.key === POWER_APPS_TASK_FORM_URL_KEY);
  const detailRow = rows.find((r) => r.key === POWER_APPS_TASK_DETAIL_URL_KEY);
  return { taskFormUrl: formRow?.value ?? '', taskDetailUrl: detailRow?.value ?? '' };
}

/** Substitutes the selected task's id into the `{taskId}` placeholder (CMS-052 Part 0). Falls back
 * to appending a `?taskId=`/`&taskId=` query param when the configured template has no literal
 * placeholder — defensive only; the documented convention is the placeholder. */
export function buildTaskDetailUrl(template: string, taskId: string): string {
  const encoded = encodeURIComponent(taskId);
  if (template.indexOf('{taskId}') !== -1) {
    return template.replace('{taskId}', encoded);
  }
  const separator = template.indexOf('?') === -1 ? '?' : '&';
  return `${template}${separator}taskId=${encoded}`;
}

/**
 * CMS-050 Part 2 — appends the current user's id as a `?requestedBy=` query param so Power Apps
 * can pre-fill an "assign to myself" default. TODO(confirm): confirm with the Power Apps team what
 * query parameters, if any, their form actually expects for pre-fill — this is a trivial,
 * best-effort addition per the task's own instruction, not a contract this code assumes Power Apps
 * honors.
 */
export function buildTaskFormUrl(template: string, requestedByUserId: string | undefined): string {
  if (!requestedByUserId) return template;
  const separator = template.indexOf('?') === -1 ? '?' : '&';
  return `${template}${separator}requestedBy=${encodeURIComponent(requestedByUserId)}`;
}
