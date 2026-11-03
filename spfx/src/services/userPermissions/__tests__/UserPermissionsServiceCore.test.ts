import { UserPermissionsServiceCore } from '../UserPermissionsServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

describe('CMS-055 AC3 — UserPermissionsServiceCore (CORMS_UserRoles.PermissionsJson)', () => {
  it('listUsers() returns each provisioned user with parsed permissions (blank -> {})', async () => {
    const site = createFakeSite(1);
    seedList(site, 'CORMS_UserRoles', [
      { Id: 10, User: { Id: 42, Title: 'Layla Hassan' }, Role: 'DocumentControl', PermissionsJson: '{"views":{"statistics":false}}' },
      { Id: 11, User: { Id: 43, Title: 'Omar Said' }, Role: 'Reviewer', PermissionsJson: '' },
    ]);
    const core = new UserPermissionsServiceCore(createFakeSp(site));

    const users = await core.listUsers();

    expect(users).toEqual([
      { itemId: 10, userId: '42', displayName: 'Layla Hassan', role: 'DocumentControl', permissions: { views: { statistics: false } } },
      { itemId: 11, userId: '43', displayName: 'Omar Said', role: 'Reviewer', permissions: {} },
    ]);
  });

  it('listUsers() drops rows whose People field did not expand (no user id)', async () => {
    const site = createFakeSite(1);
    seedList(site, 'CORMS_UserRoles', [
      { Id: 10, User: { Id: 42, Title: 'Layla Hassan' }, Role: 'Reviewer' },
      { Id: 11, Role: 'Reviewer' },
    ]);
    const core = new UserPermissionsServiceCore(createFakeSp(site));

    const users = await core.listUsers();

    expect(users.map((u) => u.itemId)).toEqual([10]);
  });

  it('savePermissions() writes the serialized JSON onto the row so a re-read sees it', async () => {
    const site = createFakeSite(1);
    seedList(site, 'CORMS_UserRoles', [{ Id: 10, User: { Id: 42, Title: 'Layla Hassan' }, Role: 'Reviewer' }]);
    const core = new UserPermissionsServiceCore(createFakeSp(site));

    await core.savePermissions(10, { views: { search: false }, buttons: { export: false } });

    expect(site.lists.CORMS_UserRoles.items[0].PermissionsJson).toBe('{"views":{"search":false},"buttons":{"export":false}}');
    const users = await core.listUsers();
    expect(users[0].permissions).toEqual({ views: { search: false }, buttons: { export: false } });
  });
});
