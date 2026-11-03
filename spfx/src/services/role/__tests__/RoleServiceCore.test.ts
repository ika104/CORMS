import { RoleServiceCore } from '../RoleServiceCore';
import { createFakeSite, createFakeSp, seedList, seedNamedGroup } from '../../__tests__/testUtils/fakeSp';

describe('CMS-038', () => {
  it('RoleService: resolves a known user against CORMS_UserRoles', async () => {
    const site = createFakeSite(42);
    seedList(site, 'CORMS_UserRoles', [
      { Id: 1, UserId: 42, Role: 'DocumentControl', Department: 'Records' },
      { Id: 2, UserId: 99, Role: 'Auditor', Department: 'Compliance' },
    ]);
    const core = new RoleServiceCore(createFakeSp(site));

    const result = await core.getCurrentUserRole();

    expect(result).toEqual({ role: 'DocumentControl', isProvisioned: true, department: 'Records', isSiteOwner: false });
  });

  it('RoleService: defaults an unprovisioned user to Recipient', async () => {
    const site = createFakeSite(7);
    seedList(site, 'CORMS_UserRoles', [{ Id: 1, UserId: 42, Role: 'DocumentControl', Department: 'Records' }]);
    const core = new RoleServiceCore(createFakeSp(site));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await core.getCurrentUserRole();

    expect(result).toEqual({ role: 'Recipient', isProvisioned: false, isSiteOwner: false });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('RoleService: surfaces owner-group membership alongside a resolved CORMS_UserRoles row', async () => {
    const site = createFakeSite(42, /* ownerGroupMemberIds */ [42]);
    seedList(site, 'CORMS_UserRoles', [{ Id: 1, UserId: 42, Role: 'Recipient' }]);
    const core = new RoleServiceCore(createFakeSp(site));

    const result = await core.getCurrentUserRole();

    // A real CORMS_UserRoles row wins regardless of owner-group membership — useNav.ts only ever
    // consults isSiteOwner while isProvisioned is false.
    expect(result).toEqual({ role: 'Recipient', isProvisioned: true, isSiteOwner: true });
  });

  it('RoleService: surfaces the user\'s ClearanceTier from CORMS_UserRoles', async () => {
    const site = createFakeSite(42);
    seedList(site, 'CORMS_UserRoles', [{ Id: 1, UserId: 42, Role: 'DocumentControl', Department: 'Records', ClearanceTier: 4 }]);
    const core = new RoleServiceCore(createFakeSp(site));

    const result = await core.getCurrentUserRole();

    expect(result.clearanceTier).toBe(4);
  });

  it('RoleService: an unprovisioned site owner still gets isSiteOwner: true back', async () => {
    const site = createFakeSite(42, /* ownerGroupMemberIds */ [1, 42, 99]);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const core = new RoleServiceCore(createFakeSp(site));

    const result = await core.getCurrentUserRole();

    expect(result).toEqual({ role: 'Recipient', isProvisioned: false, isSiteOwner: true });
    warnSpy.mockRestore();
  });

  it('RoleService: a user absent from the owner group gets isSiteOwner: false', async () => {
    const site = createFakeSite(42, /* ownerGroupMemberIds */ [1, 99]);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const core = new RoleServiceCore(createFakeSp(site));

    const result = await core.getCurrentUserRole();

    expect(result).toEqual({ role: 'Recipient', isProvisioned: false, isSiteOwner: false });
    warnSpy.mockRestore();
  });

  it('RoleService: treats a missing CORMS_UserRoles list the same as an unprovisioned user', async () => {
    // A brand-new tenant: the list has never been created, so the real REST call would 404 —
    // simulated here with a hand-rolled SPFI-shaped object rather than fakeSp, since fakeSp's
    // items() auto-creates an empty list instead of throwing (see makeItemsCollection).
    const throwingSp = {
      web: {
        currentUser: async () => ({ Id: 42 }),
        associatedOwnerGroup: { users: { select: () => async () => [{ Id: 42 }] } },
        lists: {
          getByTitle: () => ({
            items: {
              filter: () => ({
                top: () => ({
                  select: () => async () => {
                    throw Object.assign(new Error('List not found'), { status: 404 });
                  },
                }),
              }),
            },
          }),
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const core = new RoleServiceCore(throwingSp);

    const result = await core.getCurrentUserRole();

    expect(result).toEqual({ role: 'Recipient', isProvisioned: false, isSiteOwner: true });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('is not provisioned yet'));
    warnSpy.mockRestore();
  });

  it('RoleService: a broken/missing associated owner group degrades to isSiteOwner: false rather than failing', async () => {
    const throwingOwnerGroupSp = {
      web: {
        currentUser: async () => ({ Id: 42 }),
        associatedOwnerGroup: {
          users: {
            select: () => async () => {
              throw Object.assign(new Error('Group not found'), { status: 404 });
            },
          },
        },
        lists: {
          getByTitle: () => ({
            items: { filter: () => ({ top: () => ({ select: () => async () => [] }) }) },
          }),
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const core = new RoleServiceCore(throwingOwnerGroupSp);

    const result = await core.getCurrentUserRole();

    expect(result).toEqual({ role: 'Recipient', isProvisioned: false, isSiteOwner: false });
    warnSpy.mockRestore();
  });

  it('RoleService: falls back to the "{site title} Owners" group when associatedOwnerGroup does not confirm membership', async () => {
    // Some sites don't have AssociatedOwnerGroupId wired up, so associatedOwnerGroup comes back
    // empty even for a real Owners-group member — found by testing against a real tenant.
    const site = createFakeSite(42, /* ownerGroupMemberIds */ [], /* webTitle */ 'CORMS');
    seedNamedGroup(site, 'CORMS Owners', [1, 42, 99]);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const core = new RoleServiceCore(createFakeSp(site));

    const result = await core.getCurrentUserRole();

    expect(result).toEqual({ role: 'Recipient', isProvisioned: false, isSiteOwner: true });
    warnSpy.mockRestore();
  });

  it('RoleService: the "{site title} Owners" fallback still returns false for a genuine non-owner', async () => {
    const site = createFakeSite(42, /* ownerGroupMemberIds */ [], /* webTitle */ 'CORMS');
    seedNamedGroup(site, 'CORMS Owners', [1, 99]);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const core = new RoleServiceCore(createFakeSp(site));

    const result = await core.getCurrentUserRole();

    expect(result).toEqual({ role: 'Recipient', isProvisioned: false, isSiteOwner: false });
    warnSpy.mockRestore();
  });

  it('RoleService: does not cache — a role change between two calls is picked up by the second call', async () => {
    const site = createFakeSite(42);
    seedList(site, 'CORMS_UserRoles', [{ Id: 1, UserId: 42, Role: 'Recipient' }]);
    const core = new RoleServiceCore(createFakeSp(site));

    const first = await core.getCurrentUserRole();
    site.lists.CORMS_UserRoles.items[0].Role = 'SystemAdministrator';
    const second = await core.getCurrentUserRole();

    expect(first.role).toBe('Recipient');
    expect(second.role).toBe('SystemAdministrator');
  });
});
