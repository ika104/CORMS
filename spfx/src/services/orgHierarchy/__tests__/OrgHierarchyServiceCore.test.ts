import { OrgHierarchyServiceCore } from '../OrgHierarchyServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const MANAGER_ID = 100;

function makeCore(site: ReturnType<typeof createFakeSite>): OrgHierarchyServiceCore {
  return new OrgHierarchyServiceCore(createFakeSp(site));
}

function seedUserRoles(site: ReturnType<typeof createFakeSite>, rows: Array<{ Id: number } & Record<string, unknown>>): void {
  seedList(site, 'CORMS_UserRoles', rows);
}

describe('OrgHierarchyServiceCore — ds.orgHierarchy live backing (CORMS_UserRoles.ManagerUser)', () => {
  it('getDirectReports returns every CORMS_UserRoles row whose ManagerUser matches, mapped to IDirectoryPerson', async () => {
    const site = createFakeSite();
    seedUserRoles(site, [
      { Id: 1, User: { Id: 10, Title: 'Layla Hassan' }, Role: 'Recipient', Department: 'Operations', ManagerUserId: MANAGER_ID },
      { Id: 2, User: { Id: 11, Title: 'Ahmed Nasser' }, Role: 'SupervisorManager', Department: 'Legal', ClearanceTier: 3, ManagerUserId: MANAGER_ID },
      { Id: 3, User: { Id: 12, Title: 'Someone Else' }, Role: 'Recipient', Department: 'Finance', ManagerUserId: 999 },
    ]);
    const core = makeCore(site);

    const reports = await core.getDirectReports(String(MANAGER_ID));

    expect(reports).toHaveLength(2);
    expect(reports.map((r) => r.id).sort()).toEqual(['10', '11']);
  });

  it('maps Role: SupervisorManager to isSupervisor: true, and other roles to false', async () => {
    const site = createFakeSite();
    seedUserRoles(site, [
      { Id: 1, User: { Id: 10, Title: 'Layla Hassan' }, Role: 'Recipient', Department: 'Operations', ManagerUserId: MANAGER_ID },
      { Id: 2, User: { Id: 11, Title: 'Ahmed Nasser' }, Role: 'SupervisorManager', Department: 'Legal', ManagerUserId: MANAGER_ID },
    ]);
    const core = makeCore(site);

    const reports = await core.getDirectReports(String(MANAGER_ID));

    expect(reports.find((r) => r.id === '10')?.isSupervisor).toBe(false);
    expect(reports.find((r) => r.id === '11')?.isSupervisor).toBe(true);
  });

  it('defaults clearanceTier to DEFAULT_CLEARANCE_TIER (1) when ClearanceTier is unset', async () => {
    const site = createFakeSite();
    seedUserRoles(site, [{ Id: 1, User: { Id: 10, Title: 'Layla Hassan' }, Role: 'Recipient', Department: 'Operations', ManagerUserId: MANAGER_ID }]);
    const core = makeCore(site);

    const reports = await core.getDirectReports(String(MANAGER_ID));

    expect(reports[0].clearanceTier).toBe(1);
  });

  it('a manager with no direct reports returns an empty array, not an error', async () => {
    const site = createFakeSite();
    seedUserRoles(site, [{ Id: 1, User: { Id: 10, Title: 'Layla Hassan' }, Role: 'Recipient', Department: 'Operations', ManagerUserId: 999 }]);
    const core = makeCore(site);

    expect(await core.getDirectReports(String(MANAGER_ID))).toEqual([]);
  });

  describe('getMyDirectReports', () => {
    it('resolves the acting user server-side and returns their direct reports', async () => {
      const site = createFakeSite(MANAGER_ID);
      seedUserRoles(site, [
        { Id: 1, User: { Id: 10, Title: 'Layla Hassan' }, Role: 'Recipient', Department: 'Operations', ManagerUserId: MANAGER_ID },
        { Id: 2, User: { Id: 99, Title: 'Someone Else' }, Role: 'Recipient', Department: 'Finance', ManagerUserId: 999 },
      ]);
      const core = makeCore(site);

      const reports = await core.getMyDirectReports();

      expect(reports.map((r) => r.id)).toEqual(['10']);
    });

    it('dedupes concurrent calls into a single underlying currentUser + direct-reports query — TeamInboxView and SubordinateInboxServiceCore both call this against the same shared instance', async () => {
      const site = createFakeSite(MANAGER_ID);
      seedUserRoles(site, [{ Id: 1, User: { Id: 10, Title: 'Layla Hassan' }, Role: 'Recipient', Department: 'Operations', ManagerUserId: MANAGER_ID }]);
      const core = makeCore(site);

      const [a, b] = await Promise.all([core.getMyDirectReports(), core.getMyDirectReports()]);

      expect(a).toEqual(b);
      expect(a.map((r) => r.id)).toEqual(['10']);
      // currentUser() + the CORMS_UserRoles query = 2 real reads total, not 4 — the second
      // concurrent call reuses the first's in-flight promise instead of re-issuing both requests.
      expect(site.requestLog).toHaveLength(2);
    });

    it('does not permanently cache — a later, non-overlapping call issues a fresh query', async () => {
      const site = createFakeSite(MANAGER_ID);
      seedUserRoles(site, [{ Id: 1, User: { Id: 10, Title: 'Layla Hassan' }, Role: 'Recipient', Department: 'Operations', ManagerUserId: MANAGER_ID }]);
      const core = makeCore(site);

      await core.getMyDirectReports();
      await core.getMyDirectReports();

      expect(site.requestLog).toHaveLength(4); // 2 + 2 — each call, once resolved, issues its own fresh pair
    });
  });
});
