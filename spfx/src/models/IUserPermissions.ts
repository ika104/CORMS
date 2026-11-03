/**
 * CMS-055 AC3 (= CMS-036 AC3) — the per-user permission configuration. An admin edits, per user, a
 * JSON object controlling which views, tabs, buttons and dashboards that user can see. Persisted as
 * a JSON string in CORMS_UserRoles.PermissionsJson (additive Note column).
 *
 * Each category maps a feature key (a navigation entry Key for `views`, an app-defined key for the
 * rest) to a boolean. The contract is DEFAULT-ALLOW: a category, or an individual key, that is
 * absent leaves the feature visible. Nothing is hidden until an admin explicitly sets a key to
 * `false`, so a blank/missing PermissionsJson never hard-blocks anyone. See resolvePermissions.ts.
 */
export interface IUserPermissions {
  views?: Record<string, boolean>;
  tabs?: Record<string, boolean>;
  buttons?: Record<string, boolean>;
  dashboards?: Record<string, boolean>;
}

export type PermissionCategory = 'views' | 'tabs' | 'buttons' | 'dashboards';

export const PERMISSION_CATEGORIES: PermissionCategory[] = ['views', 'tabs', 'buttons', 'dashboards'];
