import { IRoleService } from '../interfaces/IRoleService';
import { ICurrentUserRole } from '../../models/ICormsRole';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

/** Dev/jsdom-test stand-in for RoleServiceLive — CORMS_UserRoles has no mock/live toggle in
 * production (bootstrap.ts always wires RoleServiceLive), so this exists only for testHarness.tsx
 * and any component test that needs a ServiceProvider without a real SPFx/PnPjs context. */
export class RoleServiceMock implements IRoleService {
  constructor(
    private readonly role: ICurrentUserRole = {
      role: 'SystemAdministrator',
      isProvisioned: true,
      department: 'IT',
      isSiteOwner: true,
    }
  ) {}

  public getCurrentUserRole(): Promise<ICurrentUserRole> {
    return delay(this.role);
  }
}
