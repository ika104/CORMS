import {
  POWER_APPS_TASK_DETAIL_URL_KEY,
  POWER_APPS_TASK_FORM_URL_KEY,
  buildTaskDetailUrl,
  buildTaskFormUrl,
  readPowerAppsTaskUrls,
} from '../powerAppsUrls';
import { IDevSettingsService } from '../../interfaces/IDevSettingsService';
import { IDevSettingRow } from '../../dataSource/devSettingsMapping';

function makeFakeDevSettingsService(rows: IDevSettingRow[] | undefined): IDevSettingsService {
  return { getSettings: async () => rows, saveSettings: async () => undefined };
}

describe('CMS-050/052 Part 0 — Power Apps task URL config', () => {
  it('readPowerAppsTaskUrls returns empty strings when neither row exists yet', async () => {
    const urls = await readPowerAppsTaskUrls(makeFakeDevSettingsService([]));

    expect(urls).toEqual({ taskFormUrl: '', taskDetailUrl: '' });
  });

  it('readPowerAppsTaskUrls returns empty strings when the underlying list is unavailable (undefined)', async () => {
    const urls = await readPowerAppsTaskUrls(makeFakeDevSettingsService(undefined));

    expect(urls).toEqual({ taskFormUrl: '', taskDetailUrl: '' });
  });

  it('readPowerAppsTaskUrls reads back the real configured values', async () => {
    const urls = await readPowerAppsTaskUrls(
      makeFakeDevSettingsService([
        { key: POWER_APPS_TASK_FORM_URL_KEY, value: 'https://apps.powerapps.com/task-form', category: 'Integration' },
        { key: POWER_APPS_TASK_DETAIL_URL_KEY, value: 'https://apps.powerapps.com/task-detail?taskId={taskId}', category: 'Integration' },
      ])
    );

    expect(urls.taskFormUrl).toBe('https://apps.powerapps.com/task-form');
    expect(urls.taskDetailUrl).toBe('https://apps.powerapps.com/task-detail?taskId={taskId}');
  });

  describe('CMS-052: buildTaskDetailUrl', () => {
    it('substitutes the {taskId} placeholder', () => {
      expect(buildTaskDetailUrl('https://apps.powerapps.com/task-detail?taskId={taskId}', '42')).toBe(
        'https://apps.powerapps.com/task-detail?taskId=42'
      );
    });

    it('URI-encodes the task id', () => {
      expect(buildTaskDetailUrl('https://apps.powerapps.com/task-detail?taskId={taskId}', 'a b')).toBe(
        'https://apps.powerapps.com/task-detail?taskId=a%20b'
      );
    });

    it('falls back to appending a query param when the template has no placeholder', () => {
      expect(buildTaskDetailUrl('https://apps.powerapps.com/task-detail', '42')).toBe(
        'https://apps.powerapps.com/task-detail?taskId=42'
      );
      expect(buildTaskDetailUrl('https://apps.powerapps.com/task-detail?x=1', '42')).toBe(
        'https://apps.powerapps.com/task-detail?x=1&taskId=42'
      );
    });
  });

  describe('CMS-050: buildTaskFormUrl', () => {
    it('appends ?requestedBy= when a user id is given', () => {
      expect(buildTaskFormUrl('https://apps.powerapps.com/task-form', 'u-1001')).toBe(
        'https://apps.powerapps.com/task-form?requestedBy=u-1001'
      );
    });

    it('appends &requestedBy= when the template already has a query string', () => {
      expect(buildTaskFormUrl('https://apps.powerapps.com/task-form?x=1', 'u-1001')).toBe(
        'https://apps.powerapps.com/task-form?x=1&requestedBy=u-1001'
      );
    });

    it('leaves the URL untouched when no user id is available', () => {
      expect(buildTaskFormUrl('https://apps.powerapps.com/task-form', undefined)).toBe('https://apps.powerapps.com/task-form');
    });
  });
});
