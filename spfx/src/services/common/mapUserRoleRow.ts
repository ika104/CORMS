import type { SPFI } from '@pnp/sp';
import { IDirectoryPerson } from '../../models/IDelegation';
import { DEFAULT_CLEARANCE_TIER, MAX_CLEARANCE_TIER } from './clearance';

/**
 * One shared CORMS_UserRoles row shape + `IDirectoryPerson` mapper, the same way
 * mapCorrespondenceRow.ts / mapTaskRow.ts own their lists' row shapes — so the select/expand column
 * list, the `Role === 'SupervisorManager'` supervisor rule, and the unset-clearance default live in
 * exactly one place rather than once per Core class that reads this list.
 *
 * Consumed by OrgHierarchyServiceCore (`getDirectReports`, filtered by ManagerUserId) and
 * DelegationServiceCore (`listDirectory`, unfiltered) — the two directory-shaped reads of
 * CORMS_UserRoles. RoleServiceCore's own narrower `Role`/`Department` read is deliberately left
 * alone: it resolves a single row for the signed-in user and never produces an IDirectoryPerson.
 */
export const USER_ROLES_LIST_TITLE = 'CORMS_UserRoles';

export const USER_ROLES_DIRECTORY_SELECT = ['User/Id', 'User/Title', 'Role', 'Department', 'ClearanceTier'] as const;
export const USER_ROLES_DIRECTORY_EXPAND = ['User'] as const;

export interface IUserRoleListItem {
  User?: { Id: number; Title?: string };
  Role?: string;
  Department?: string;
  ClearanceTier?: number;
}

export function mapUserRoleRowToDirectoryPerson(row: IUserRoleListItem): IDirectoryPerson {
  return {
    id: String(row.User?.Id ?? ''),
    displayName: row.User?.Title ?? '',
    team: row.Department ?? '',
    // ClearanceTier was added to CORMS_USER_ROLES_SCHEMA by the Delegation & Reassignment Backend
    // task and is unset on every pre-existing row — see that section of the README for why the
    // default is deliberately the *lowest* tier rather than the safest-to-read one.
    clearanceTier: row.ClearanceTier ?? DEFAULT_CLEARANCE_TIER,
    isSupervisor: row.Role === 'SupervisorManager',
  };
}

/** Directory rows for users whose People field failed to expand carry no id and can't be matched
 * against anything — dropped rather than surfaced as a blank-id person. */
export function toDirectoryPeople(rows: IUserRoleListItem[]): IDirectoryPerson[] {
  return rows.filter((row) => !!row.User?.Id).map(mapUserRoleRowToDirectoryPerson);
}

/**
 * Resolves the *signed-in* user's own effective clearance tier directly from CORMS_UserRoles
 * (Role + ClearanceTier), mirroring RoleServiceCore.getCurrentUserRole()'s exact `UserId eq {n}`
 * single-row lookup. This is the live source of truth for the caller's clearance — RecordsHub's
 * getCurrentUser() never populated clearanceTier, so resolving it there collapsed every user
 * (admins included) to DEFAULT_CLEARANCE_TIER (1), i.e. only Public/Unclassified was ever visible.
 *
 * Two rules on top of the raw column:
 * - A SystemAdministrator always gets MAX_CLEARANCE_TIER — an admin is expected to see every
 *   correspondence regardless of whatever (often unset) ClearanceTier their own row carries.
 * - Any other user gets their ClearanceTier, or DEFAULT_CLEARANCE_TIER when it's blank/absent.
 *
 * Fail-safe: any read error (list not provisioned, transient failure) resolves to
 * DEFAULT_CLEARANCE_TIER rather than rejecting — a clearance lookup must never empty/blow up the
 * whole list query it gates (the exact regression resolveClearanceTier.ts's comment records).
 */
export async function resolveMyClearanceTierFromUserRoles(sp: SPFI, currentUserId: number): Promise<number> {
  try {
    const items = (await sp.web.lists
      .getByTitle(USER_ROLES_LIST_TITLE)
      .items.filter(`UserId eq ${currentUserId}`)
      .top(1)
      .select('Role', 'ClearanceTier')()) as Array<{ Role?: string; ClearanceTier?: number }>;
    const row = items[0];
    if (row?.Role === 'SystemAdministrator') return MAX_CLEARANCE_TIER;
    return row?.ClearanceTier ?? DEFAULT_CLEARANCE_TIER;
  } catch {
    return DEFAULT_CLEARANCE_TIER;
  }
}
