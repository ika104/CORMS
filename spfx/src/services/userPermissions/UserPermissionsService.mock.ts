import { IUserPermissions } from '../../models/IUserPermissions';
import { IUserPermissionRecord, IUserPermissionsService } from '../interfaces/IUserPermissionsService';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

/** Dev/jsdom-test stand-in for UserPermissionsServiceLive — CORMS_UserRoles has no mock/live toggle
 * in production (bootstrap.ts always wires the live service), so this exists only for
 * testHarness.tsx and any component test that needs a ServiceProvider without a real SPFx context.
 * Mutations are session-only, held in this instance's own copy of the seed. */
export class UserPermissionsServiceMock implements IUserPermissionsService {
  private records: IUserPermissionRecord[] = [
    { itemId: 1, userId: '42', displayName: 'Layla Hassan', role: 'DocumentControl', permissions: {} },
    { itemId: 2, userId: '43', displayName: 'Omar Said', role: 'Reviewer', permissions: { views: { statistics: false } } },
    { itemId: 3, userId: '44', displayName: 'Sara Nabil', role: 'SystemAdministrator', permissions: {} },
  ];

  public listUsers(): Promise<IUserPermissionRecord[]> {
    return delay(this.records.map((r) => ({ ...r, permissions: { ...r.permissions } })));
  }

  public savePermissions(itemId: number, permissions: IUserPermissions): Promise<void> {
    this.records = this.records.map((r) => (r.itemId === itemId ? { ...r, permissions } : r));
    return delay(undefined);
  }
}
