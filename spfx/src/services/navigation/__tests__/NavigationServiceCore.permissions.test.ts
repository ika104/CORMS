import { NavigationServiceCore } from '../NavigationServiceCore';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

function seedNav(site: ReturnType<typeof createFakeSite>): void {
  seedList(site, 'CORMS_NavigationMenu', [
    { Id: 1, Key: 'myCorrespondence', TranslationKey: 'nav.myCorrespondence', ParentKey: '', IconKey: 'inbox', Route: '/my-correspondence', SortOrder: 10, IsVisible: true, IsSystemEntry: true, RequiredRoles: '[]', BadgeSourceKey: '' },
    { Id: 2, Key: 'statistics', TranslationKey: 'nav.statistics', ParentKey: '', IconKey: 'barChart', Route: '/statistics', SortOrder: 20, IsVisible: true, IsSystemEntry: true, RequiredRoles: '[]', BadgeSourceKey: '' },
  ]);
  seedList(site, 'CORMS_Correspondence', []);
  seedList(site, 'CORMS_ReadReceipts', []);
}

describe('CMS-055 AC3 — per-user permission JSON folds into navigation view visibility', () => {
  it('hides a view a user has been opted out of via PermissionsJson (views.<Key> = false)', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    seedList(site, 'CORMS_UserRoles', [
      { Id: 1, UserId: 1, Role: 'Recipient', PermissionsJson: '{"views":{"statistics":false}}' },
    ]);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    const keys = (await core.getMenuTree()).groups[0].items.map((i) => i.id);

    expect(keys).toContain('myCorrespondence');
    expect(keys).not.toContain('statistics');
  });

  it('default-allow: an unset/blank PermissionsJson hides nothing (role-gating behaviour unchanged)', async () => {
    const site = createFakeSite(1);
    seedNav(site);
    seedList(site, 'CORMS_UserRoles', [{ Id: 1, UserId: 1, Role: 'Recipient' }]);
    const core = new NavigationServiceCore(createFakeSp(site), async () => 1);

    const keys = (await core.getMenuTree()).groups[0].items.map((i) => i.id);

    expect(keys).toContain('myCorrespondence');
    expect(keys).toContain('statistics');
  });
});
