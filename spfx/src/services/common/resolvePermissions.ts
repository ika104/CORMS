import { IUserPermissions, PermissionCategory } from '../../models/IUserPermissions';

/**
 * CMS-055 AC3 — pure resolution of the per-user permission configuration (IUserPermissions). Shared
 * by RoleServiceCore (folds the signed-in user's permissions into the resolved role),
 * NavigationServiceCore (the representative enforcement point — hides a nav view for a specific
 * user), and the usePermissions() hook (lets any button/tab consult the same rules).
 */

/** Parses a CORMS_UserRoles.PermissionsJson string. Returns undefined for a blank/absent/malformed
 * value — the default-allow contract means an unparseable column hides nothing, exactly as if it
 * were empty, rather than throwing or blocking the user. */
export function parsePermissions(raw: string | undefined): IUserPermissions | undefined {
  if (!raw || raw.trim().length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as IUserPermissions;
  } catch {
    return undefined;
  }
}

/**
 * DEFAULT-ALLOW: a feature is visible unless the user's permissions explicitly set its key to
 * `false`. An undefined permissions object, an undefined category map, or a key the admin has not
 * listed all resolve to `true` — so a feature is never hidden until an admin opts in to hiding it.
 */
export function canSee(
  permissions: IUserPermissions | undefined,
  category: PermissionCategory,
  featureKey: string
): boolean {
  if (!permissions) return true;
  const map = permissions[category];
  if (!map) return true;
  const value = map[featureKey];
  return value === undefined ? true : value !== false;
}
