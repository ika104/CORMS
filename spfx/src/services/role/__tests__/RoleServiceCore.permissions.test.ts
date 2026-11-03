import { RoleServiceCore } from '../RoleServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

describe('CMS-055 AC3 — RoleServiceCore resolves the current user\'s PermissionsJson', () => {
  it('parses PermissionsJson into the resolved role', async () => {
    const site = createFakeSite(42);
    seedList(site, 'CORMS_UserRoles', [
      { Id: 1, UserId: 42, Role: 'Reviewer', PermissionsJson: '{"views":{"statistics":false}}' },
    ]);
    const core = new RoleServiceCore(createFakeSp(site));

    const result = await core.getCurrentUserRole();

    expect(result.permissions).toEqual({ views: { statistics: false } });
  });

  it('leaves permissions undefined (default-allow) when the column is blank', async () => {
    const site = createFakeSite(42);
    seedList(site, 'CORMS_UserRoles', [{ Id: 1, UserId: 42, Role: 'Reviewer' }]);
    const core = new RoleServiceCore(createFakeSp(site));

    const result = await core.getCurrentUserRole();

    expect(result.permissions).toBeUndefined();
  });

  // Regression: a tenant that hasn't re-provisioned CORMS_UserRoles since CMS-055 has no
  // PermissionsJson column, so naming it in $select 400s the whole query. That must NOT collapse
  // the user's real role to the default (which had hidden Administration/Audit for admins).
  it('still resolves the real role when the PermissionsJson column is not provisioned (select 400s)', async () => {
    const selectedFieldSets: string[][] = [];
    const roleRow = { Role: 'SystemAdministrator', Department: 'IT', ClearanceTier: 5 };
    const rolesItems = {
      filter: () => rolesItems,
      top: () => rolesItems,
      select: (...fields: string[]) => () => {
        selectedFieldSets.push(fields);
        return fields.indexOf('PermissionsJson') !== -1
          ? Promise.reject(new Error('400: field PermissionsJson does not exist'))
          : Promise.resolve([roleRow]);
      },
    };
    const emptyUsers = { users: { select: () => () => Promise.resolve([]) } };
    const sp = {
      web: {
        currentUser: () => Promise.resolve({ Id: 42 }),
        associatedOwnerGroup: emptyUsers,
        select: () => () => Promise.resolve({ Title: 'CORMS' }),
        siteGroups: { getByName: () => emptyUsers },
        lists: { getByTitle: () => ({ items: rolesItems }) },
      },
    } as unknown as ConstructorParameters<typeof RoleServiceCore>[0];

    const result = await new RoleServiceCore(sp).getCurrentUserRole();

    expect(result.role).toBe('SystemAdministrator');
    expect(result.isProvisioned).toBe(true);
    expect(result.permissions).toBeUndefined();
    // It attempted the PermissionsJson read first, then retried with the core fields only.
    expect(selectedFieldSets.some((f) => f.indexOf('PermissionsJson') !== -1)).toBe(true);
    expect(selectedFieldSets.some((f) => f.indexOf('PermissionsJson') === -1)).toBe(true);
  });
});
