import { NavigationServiceCore } from '../NavigationServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

function seedNav(site: ReturnType<typeof createFakeSite>): void {
  seedList(site, 'CORMS_NavigationMenu', [
    {
      Id: 1,
      Key: 'myCorrespondence',
      TranslationKey: 'nav.myCorrespondence',
      ParentKey: '',
      IconKey: 'inbox',
      Route: '/my-correspondence',
      SortOrder: 10,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: '[]',
      BadgeSourceKey: '',
    },
    {
      Id: 2,
      Key: 'administration',
      TranslationKey: 'nav.administration',
      ParentKey: '',
      IconKey: 'settings',
      Route: '',
      SortOrder: 20,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: JSON.stringify(['SystemAdministrator']),
      BadgeSourceKey: '',
    },
    {
      Id: 3,
      Key: 'administration.provisionLists',
      TranslationKey: 'nav.provisionLists',
      ParentKey: 'administration',
      IconKey: 'listChecks',
      Route: '/administration/provision-lists',
      SortOrder: 10,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: JSON.stringify(['SystemAdministrator']),
      BadgeSourceKey: '',
    },
    {
      Id: 4,
      Key: 'hiddenEntry',
      TranslationKey: 'nav.hidden',
      ParentKey: '',
      IconKey: 'circle',
      Route: '/hidden',
      SortOrder: 30,
      IsVisible: false,
      IsSystemEntry: false,
      RequiredRoles: '[]',
      BadgeSourceKey: '',
    },
    {
      Id: 5,
      Key: 'inboxSent',
      TranslationKey: 'nav.inboxSent',
      ParentKey: '',
      IconKey: 'mail',
      Route: '',
      SortOrder: 15,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: '[]',
      BadgeSourceKey: '',
    },
    {
      Id: 6,
      Key: 'inboxSent.inbox',
      TranslationKey: 'nav.inbox',
      ParentKey: 'inboxSent',
      IconKey: 'mailOpen',
      Route: '/inbox-sent/inbox',
      SortOrder: 10,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: '[]',
      BadgeSourceKey: 'inboxUnreadCount',
    },
  ]);
  seedList(site, 'CORMS_UserRoles', [{ Id: 1, UserId: site.currentUserId, Role: 'Recipient' }]);
  seedList(site, 'CORMS_Correspondence', []);
  seedList(site, 'CORMS_ReadReceipts', []);
}

describe('CMS-038', () => {
  it('NavigationService.getMenuTree: filters out entries requiring a role the current user does not hold (AC6)', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    const tree = await core.getMenuTree();

    const keys = tree.groups[0].items.map((i) => i.id);
    expect(keys).not.toContain('administration');
    expect(keys).toContain('myCorrespondence');
  });

  it('NavigationService.getMenuTree: includes role-gated entries for a user who holds the role', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);
    site.lists.CORMS_UserRoles.items[0].Role = 'SystemAdministrator';

    const tree = await core.getMenuTree();

    const admin = tree.groups[0].items.find((i) => i.id === 'administration');
    expect(admin).toBeDefined();
    expect(admin?.children?.map((c) => c.id)).toContain('administration.provisionLists');
  });

  it('NavigationService.getMenuTree: exposes Approval Workflows for existing sites until its system row is provisioned', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    site.lists.CORMS_UserRoles.items[0].Role = 'SystemAdministrator';
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    const tree = await core.getMenuTree();

    const admin = tree.groups[0].items.find((i) => i.id === 'administration');
    expect(admin?.children?.map((c) => c.id)).toContain('administration.approvalWorkflows');
  });

  it('NavigationService.getMenuTree: respects an administrator hiding Approval Workflows after it is provisioned', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    site.lists.CORMS_UserRoles.items[0].Role = 'SystemAdministrator';
    site.lists.CORMS_NavigationMenu.items.push({
      Id: 7,
      Key: 'administration.approvalWorkflows',
      TranslationKey: 'nav.approvalWorkflows',
      ParentKey: 'administration',
      IconKey: 'workflow',
      Route: '/administration/approval-workflows',
      SortOrder: 3,
      IsVisible: false,
      IsSystemEntry: true,
      RequiredRoles: JSON.stringify(['SystemAdministrator']),
      BadgeSourceKey: '',
    });
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    const tree = await core.getMenuTree();

    const admin = tree.groups[0].items.find((i) => i.id === 'administration');
    expect(admin?.children?.map((c) => c.id)).not.toContain('administration.approvalWorkflows');
  });

  it('NavigationService.getMenuTree: turns an existing flat My Tasks row into the Tasks / Approval Tasks group', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    site.lists.CORMS_NavigationMenu.items.push({
      Id: 8,
      Key: 'myTasks',
      TranslationKey: 'nav.myTasks',
      ParentKey: '',
      IconKey: 'listChecks',
      Route: '/my-tasks',
      SortOrder: 12,
      IsVisible: true,
      IsSystemEntry: true,
      RequiredRoles: '[]',
      BadgeSourceKey: '',
    });
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    const tree = await core.getMenuTree();

    const myTasks = tree.groups[0].items.find((i) => i.id === 'myTasks');
    expect(myTasks?.path).toBeFalsy();
    expect(myTasks?.children?.map((c) => [c.id, c.path])).toEqual([
      ['myTasks.tasks', '/my-tasks'],
      ['myTasks.approvalTasks', '/approval-tasks'],
    ]);
  });

  it('AC6: a child of a role-gated parent is dropped entirely, never re-surfaced at the top level', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    // A child that is itself open to all roles, under a parent only SystemAdministrator may see.
    // The whole subtree must disappear for a Recipient — the risk this guards is an orphaned
    // child being promoted to the top level once its parent is filtered out, which would surface
    // an Administration screen to a user with no Administration entry at all.
    site.lists.CORMS_NavigationMenu.items.push({
      Id: 7,
      Key: 'administration.openToAll',
      TranslationKey: 'nav.openToAll',
      ParentKey: 'administration',
      IconKey: 'sliders',
      Route: '/administration/open',
      SortOrder: 20,
      IsVisible: true,
      IsSystemEntry: false,
      RequiredRoles: '[]',
      BadgeSourceKey: '',
    });
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    const tree = await core.getMenuTree();

    const allKeys: string[] = [];
    tree.groups[0].items.forEach((item) => {
      allKeys.push(item.id);
      (item.children ?? []).forEach((child) => allKeys.push(child.id));
    });
    expect(allKeys).not.toContain('administration');
    expect(allKeys).not.toContain('administration.openToAll');
  });

  it('NavigationService.getMenuTree: excludes IsVisible = false entries', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    const tree = await core.getMenuTree();

    const keys = tree.groups[0].items.map((i) => i.id);
    expect(keys).not.toContain('hiddenEntry');
  });

  it('NavigationService.getMenuTree: assembles the parent/child tree by ParentKey, sorted by SortOrder', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    const tree = await core.getMenuTree();

    const topLevelKeys = tree.groups[0].items.map((i) => i.id);
    // myCorrespondence (10) then inboxSent (15) — SortOrder-ascending.
    expect(topLevelKeys.slice(0, 2)).toEqual(['myCorrespondence', 'inboxSent']);
    const inboxSent = tree.groups[0].items.find((i) => i.id === 'inboxSent');
    expect(inboxSent?.children?.map((c) => c.id)).toEqual(['inboxSent.inbox']);
  });

  it('NavigationService.getMenuTree: wires the inboxUnreadCount badge from real CORMS_Correspondence/CORMS_ReadReceipts data', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    seedList(site, 'CORMS_Correspondence', [
      {
        Id: 100,
        Direction: 'Incoming',
        AssignedToId: 1,
        SecurityLevel: 'Public/Unclassified',
        DateCreated: '2026-01-01T00:00:00Z',
      },
      {
        Id: 101,
        Direction: 'Incoming',
        AssignedToId: 1,
        SecurityLevel: 'Public/Unclassified',
        DateCreated: '2026-01-02T00:00:00Z',
      },
    ]);
    seedList(site, 'CORMS_ReadReceipts', [
      { Id: 1, CorrespondenceId: '100', UserId: 1, ReadAt: '2026-01-01T00:00:00Z' },
    ]);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 5);

    const tree = await core.getMenuTree();

    const inbox = tree.groups[0].items
      .find((i) => i.id === 'inboxSent')
      ?.children?.find((c) => c.id === 'inboxSent.inbox');
    expect(inbox?.badge).toEqual({ count: 1, tone: 'danger' });
  });

  it('a failing badge lookup never takes down the rest of the menu (e.g. CORMS_Correspondence not reachable)', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    // No CORMS_Correspondence/CORMS_ReadReceipts seeded — simulate the list not being reachable
    // by making any query against it reject, the way an un-provisioned list or a permissions
    // error would in production.
    const sp = createFakeSp(site);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalGetByTitle = (sp as any).web.lists.getByTitle;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sp as any).web.lists.getByTitle = (title: string) => {
      if (title === 'CORMS_Correspondence') {
        throw Object.assign(new Error('List not found'), { status: 404 });
      }
      return originalGetByTitle(title);
    };
    const core = new NavigationServiceCore(sp, async () => 1);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const tree = await core.getMenuTree();

    const keys = tree.groups[0].items.map((i) => i.id);
    expect(keys).toContain('myCorrespondence');
    const inbox = tree.groups[0].items
      .find((i) => i.id === 'inboxSent')
      ?.children?.find((c) => c.id === 'inboxSent.inbox');
    expect(inbox).toBeDefined();
    expect(inbox?.badge).toBeUndefined();
    warnSpy.mockRestore();
  });
});

describe('CMS-038 Part 7 — Navigation Menu admin screen backend', () => {
  it('listAllEntries: returns every row regardless of IsVisible or role, unlike getMenuTree', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    const entries = await core.listAllEntries();

    expect(entries.map((e) => e.key)).toEqual(
      expect.arrayContaining(['myCorrespondence', 'administration', 'hiddenEntry'])
    );
    const hidden = entries.find((e) => e.key === 'hiddenEntry');
    expect(hidden?.isVisible).toBe(false);
  });

  it('setVisibility: flips IsVisible on the matching row', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    await core.setVisibility('hiddenEntry', true);

    const row = site.lists.CORMS_NavigationMenu.items.find((r) => r.Key === 'hiddenEntry');
    expect(row?.IsVisible).toBe(true);
  });

  it('deleteEntry: removes a non-system entry', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    await core.deleteEntry('hiddenEntry');

    expect(site.lists.CORMS_NavigationMenu.items.some((r) => r.Key === 'hiddenEntry')).toBe(false);
  });

  it('deleteEntry: throws for a system entry rather than deleting it', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    await expect(core.deleteEntry('myCorrespondence')).rejects.toThrow();
    expect(site.lists.CORMS_NavigationMenu.items.some((r) => r.Key === 'myCorrespondence')).toBe(true);
  });

  it('setSortOrder: writes SortOrder on the matching row, including a system entry', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    await core.setSortOrder('myCorrespondence', 5);

    const row = site.lists.CORMS_NavigationMenu.items.find((r) => r.Key === 'myCorrespondence');
    expect(row?.SortOrder).toBe(5);
  });

  it('setSortOrder: reflected in the next getMenuTree() ordering', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    await core.setSortOrder('myCorrespondence', 999);
    const tree = await core.getMenuTree();

    const topLevelKeys = tree.groups[0].items.map((i) => i.id);
    expect(topLevelKeys[topLevelKeys.length - 1]).toBe('myCorrespondence');
  });

  it('setRequiredRoles: writes the JSON-serialized role array on the matching row', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    await core.setRequiredRoles('myCorrespondence', ['Auditor', 'SystemAdministrator']);

    const row = site.lists.CORMS_NavigationMenu.items.find((r) => r.Key === 'myCorrespondence');
    expect(row?.RequiredRoles).toBe(JSON.stringify(['Auditor', 'SystemAdministrator']));
  });

  it('setRequiredRoles: an empty array means "All roles" — visible to everyone again', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    // Restrict, then verify it's actually gated, then clear it and verify it's visible again.
    await core.setRequiredRoles('inboxSent', ['SystemAdministrator']);
    const gatedTree = await core.getMenuTree();
    expect(gatedTree.groups[0].items.map((i) => i.id)).not.toContain('inboxSent');

    await core.setRequiredRoles('inboxSent', []);
    const openTree = await core.getMenuTree();
    expect(openTree.groups[0].items.map((i) => i.id)).toContain('inboxSent');
  });
});
