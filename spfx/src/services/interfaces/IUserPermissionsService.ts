import { IUserPermissions } from '../../models/IUserPermissions';

/** CMS-055 AC3 — one CORMS_UserRoles row surfaced on the User Permissions admin screen. */
export interface IUserPermissionRecord {
  /** CORMS_UserRoles list item Id — the write key for savePermissions(). */
  itemId: number;
  /** The user's numeric CORMS-site id (string form), for reference. */
  userId: string;
  displayName: string;
  /** The user's CORMS role, shown for context on the admin screen. */
  role: string;
  /** Parsed PermissionsJson — an empty object when the column is blank (default-allow). */
  permissions: IUserPermissions;
}

/**
 * CMS-055 AC3 (= CMS-036 AC3) — reads/writes each user's per-user permission JSON
 * (CORMS_UserRoles.PermissionsJson). Always live in production (CORMS-owned data), no mock/live
 * ds.* toggle — same stance as IRoleService.
 */
export interface IUserPermissionsService {
  /** Every provisioned CORMS_UserRoles user with their current permission JSON. */
  listUsers(): Promise<IUserPermissionRecord[]>;
  /** Persists `permissions` (serialized to JSON) onto the given CORMS_UserRoles item. */
  savePermissions(itemId: number, permissions: IUserPermissions): Promise<void>;
}
