import { resolveMyClearanceTierFromUserRoles } from '../mapUserRoleRow';
import { createFakeSite, createFakeSp, seedList } from '../../__tests__/testUtils/fakeSp';

const ME = 42;

describe('resolveMyClearanceTierFromUserRoles', () => {
  it("returns the signed-in user's own ClearanceTier from CORMS_UserRoles", async () => {
    const site = createFakeSite(ME);
    seedList(site, 'CORMS_UserRoles', [
      { Id: 1, UserId: ME, Role: 'DocumentControl', ClearanceTier: 4 },
      { Id: 2, UserId: 99, Role: 'Reviewer', ClearanceTier: 2 },
    ]);

    expect(await resolveMyClearanceTierFromUserRoles(createFakeSp(site), ME)).toBe(4);
  });

  it('grants a SystemAdministrator the maximum tier regardless of a blank/low ClearanceTier', async () => {
    const site = createFakeSite(ME);
    // No ClearanceTier column value at all — an admin must still see everything.
    seedList(site, 'CORMS_UserRoles', [{ Id: 1, UserId: ME, Role: 'SystemAdministrator' }]);

    expect(await resolveMyClearanceTierFromUserRoles(createFakeSp(site), ME)).toBe(5);
  });

  it('falls back to the lowest tier (1) when the user has a row but no ClearanceTier', async () => {
    const site = createFakeSite(ME);
    seedList(site, 'CORMS_UserRoles', [{ Id: 1, UserId: ME, Role: 'Recipient' }]);

    expect(await resolveMyClearanceTierFromUserRoles(createFakeSp(site), ME)).toBe(1);
  });

  it('fails safe to tier 1 when the current user has no CORMS_UserRoles row', async () => {
    const site = createFakeSite(ME);
    seedList(site, 'CORMS_UserRoles', [{ Id: 1, UserId: 99, Role: 'SystemAdministrator', ClearanceTier: 5 }]);

    // A different user's row (even an admin's) must not leak clearance to the signed-in user.
    expect(await resolveMyClearanceTierFromUserRoles(createFakeSp(site), ME)).toBe(1);
  });
});
