import type { SPFI } from '@pnp/sp';
import { IUserPermissions } from '../../models/IUserPermissions';
import { IUserPermissionRecord } from '../interfaces/IUserPermissionsService';
import { parsePermissions } from '../common/resolvePermissions';
import { USER_ROLES_LIST_TITLE } from '../common/mapUserRoleRow';

/** Same server-side result ceiling every other list-backed Core class applies — see
 * DelegationServiceCore's RESULT_CAP comment. */
const RESULT_CAP = 2000;

interface IUserRolePermissionRow {
  Id: number;
  User?: { Id: number; Title?: string };
  Role?: string;
  PermissionsJson?: string;
}

/**
 * CMS-055 AC3 — pure CORMS_UserRoles read/write of the per-user PermissionsJson column, factored
 * out of the live wrapper the same way RoleServiceCore is (Core classes only `import type { SPFI }`
 * — see provisioningCore.ts's file comment). UserPermissionsService.live.ts is the thin real
 * wrapper; UserPermissionsService.mock.ts backs jsdom/dev.
 *
 * Deliberately its own narrow service rather than an extension of RoleServiceCore, which resolves
 * only the *signed-in* user's single row and never lists the directory (its file comment says so).
 * Listing every user and writing an arbitrary user's row is a distinct, admin-only concern.
 */
export class UserPermissionsServiceCore {
  constructor(private readonly sp: SPFI) {}

  public async listUsers(): Promise<IUserPermissionRecord[]> {
    const rows = (await this.sp.web.lists
      .getByTitle(USER_ROLES_LIST_TITLE)
      .items.select('Id', 'User/Id', 'User/Title', 'Role', 'PermissionsJson')
      .expand('User')
      .top(RESULT_CAP)()) as IUserRolePermissionRow[];
    // Rows whose People field failed to expand carry no user id — dropped rather than surfaced as
    // a blank, unwritable row, same as toDirectoryPeople() in mapUserRoleRow.ts.
    return rows
      .filter((row) => !!row.User?.Id)
      .map((row) => ({
        itemId: row.Id,
        userId: String(row.User?.Id ?? ''),
        displayName: row.User?.Title ?? '',
        role: row.Role ?? '',
        permissions: parsePermissions(row.PermissionsJson) ?? {},
      }));
  }

  public async savePermissions(itemId: number, permissions: IUserPermissions): Promise<void> {
    await this.sp.web.lists
      .getByTitle(USER_ROLES_LIST_TITLE)
      .items.getById(itemId)
      .update({ PermissionsJson: JSON.stringify(permissions) });
  }
}
