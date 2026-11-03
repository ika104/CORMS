import { resolveCorrespondenceDashboardService, resolveCorrespondenceListService, resolveTaskListService } from '../resolveAppDataSource';
import { ICorrespondenceListService } from '../../interfaces/ICorrespondenceListService';
import { ICorrespondenceDashboardService } from '../../interfaces/ICorrespondenceDashboardService';
import { ITaskListService } from '../../interfaces/ITaskListService';

function stubListService(tag: string): ICorrespondenceListService {
  return {
    getInbox: async () => [{ id: tag } as never],
    getSent: async () => [],
    getDrafts: async () => [],
  };
}

function stubDashboardService(tag: string): ICorrespondenceDashboardService {
  return { getAll: async () => [{ id: tag } as never] };
}

function stubTaskListService(tag: string): ITaskListService {
  return { getAll: async () => [{ id: tag } as never] };
}

describe('Part 4/5 — app.correspondenceDataSource resolver', () => {
  it('resolveCorrespondenceListService picks mock by default and live when explicitly toggled', async () => {
    const mock = stubListService('mock');
    const live = stubListService('live');

    expect((await resolveCorrespondenceListService('mock', mock, live).getInbox())[0].id).toBe('mock');
    expect((await resolveCorrespondenceListService('live', mock, live).getInbox())[0].id).toBe('live');
  });

  it('resolveCorrespondenceDashboardService picks mock by default and live when explicitly toggled', async () => {
    const mock = stubDashboardService('mock');
    const live = stubDashboardService('live');

    expect((await resolveCorrespondenceDashboardService('mock', mock, live).getAll())[0].id).toBe('mock');
    expect((await resolveCorrespondenceDashboardService('live', mock, live).getAll())[0].id).toBe('live');
  });

  it('reverting from live back to mock never touches the live instance again', async () => {
    const mock = stubListService('mock');
    const live = stubListService('live');
    const liveGetInboxSpy = jest.spyOn(live, 'getInbox');

    resolveCorrespondenceListService('live', mock, live);
    resolveCorrespondenceListService('mock', mock, live);
    await resolveCorrespondenceListService('mock', mock, live).getInbox();

    expect(liveGetInboxSpy).not.toHaveBeenCalled();
  });

  it('resolveTaskListService picks mock by default and live when explicitly toggled', async () => {
    const mock = stubTaskListService('mock');
    const live = stubTaskListService('live');

    expect((await resolveTaskListService('mock', mock, live).getAll())[0].id).toBe('mock');
    expect((await resolveTaskListService('live', mock, live).getAll())[0].id).toBe('live');
  });
});
