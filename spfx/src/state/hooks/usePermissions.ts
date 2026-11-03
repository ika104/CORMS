import { useNav } from './useNav';
import { PermissionCategory } from '../../models/IUserPermissions';
import { canSee } from '../../services/common/resolvePermissions';

export interface IUsePermissionsResult {
  /** DEFAULT-ALLOW visibility check for the signed-in user's per-user permission JSON
   * (CORMS_UserRoles.PermissionsJson, CMS-055 AC3). Returns true unless an admin has explicitly set
   * `<category>.<featureKey>` to false for this user. */
  canSee(category: PermissionCategory, featureKey: string): boolean;
}

/**
 * CMS-055 AC3 — the per-user permission-resolution hook. Reads the signed-in user's parsed
 * PermissionsJson (resolved once by useNav from CORMS_UserRoles) and exposes canSee() so any
 * button, tab or dashboard can consult the same rules navigation already enforces server-side
 * (NavigationServiceCore folds `views` in). Adoption is incremental: the mechanism, the pure
 * resolution and one representative enforcement point (navigation view visibility) are delivered;
 * a widget opts in by calling canSee('buttons'|'tabs'|'dashboards', '<its key>') and hiding itself
 * when it returns false. Nothing needs retrofitting up front — an unset key leaves a widget visible.
 */
export function usePermissions(): IUsePermissionsResult {
  const { currentPermissions } = useNav();
  return {
    canSee: (category: PermissionCategory, featureKey: string): boolean =>
      canSee(currentPermissions, category, featureKey),
  };
}
