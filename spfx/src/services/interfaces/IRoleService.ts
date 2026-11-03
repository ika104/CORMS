import { ICurrentUserRole } from '../../models/ICormsRole';

/** CORMS_UserRoles-backed role resolution (Epic 1 workspace-shell-backend task) — always live,
 * no ds.* mock/live toggle. Drives role-gated navigation (CMS-038 AC6), clearance/role-gated
 * services across this epic, and the nav footer role label (CMS-038 AC8). */
export interface IRoleService {
  /** Resolves the signed-in user against CORMS_UserRoles. Never rejects for an unprovisioned
   * user — defaults to 'Recipient' (isProvisioned: false) and logs a warning, so the shell never
   * hard-fails for a user with no role row yet. */
  getCurrentUserRole(): Promise<ICurrentUserRole>;
}
