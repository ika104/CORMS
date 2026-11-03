import type { SPFI } from '@pnp/sp';
import { CormsRole, CORMS_ROLES, DEFAULT_UNPROVISIONED_ROLE, ICurrentUserRole } from '../../models/ICormsRole';
import { getCurrentSiteUserId } from '../common/currentUserId';
import { parsePermissions } from '../common/resolvePermissions';

const LIST_TITLE = 'CORMS_UserRoles';

interface IUserRoleListItem {
  Role: string;
  Department?: string;
  ClearanceTier?: number;
  PermissionsJson?: string;
}

function isCormsRole(value: string | undefined): value is CormsRole {
  return !!value && (CORMS_ROLES as string[]).indexOf(value) !== -1;
}

/**
 * Pure CORMS_UserRoles lookup logic, factored out of RoleService.live.ts the same way
 * ProvisioningCore is factored out of ProvisioningService.ts — @pnp/sp ships ESM-only and this
 * project's Jest runtime can't require() it, so only *types* are imported here (erased at
 * compile time), never the real spfi()/SPFx(). See provisioningCore.ts's file comment for the
 * full rationale; RoleServiceLive is the thin wrapper that actually touches SharePoint.
 *
 * Resolves the signed-in user's numeric CORMS-site user id via PnPjs's sp.web.currentUser()
 * (scoped to whichever site `sp` was built against — CORMS's own site, not RecordsHub's, since
 * CORMS_UserRoles lives there) and filters CORMS_UserRoles on it. Never throws for an
 * unprovisioned user — defaults to 'Recipient' and logs a warning instead, so a user with no
 * role row yet doesn't hard-fail the whole shell.
 *
 * Deliberately NOT cached across calls. RoleServiceLive is a bootstrap-singleton that lives for
 * the whole SPA session, not per-request — caching the resolved role here (an earlier version of
 * this file did) meant an admin editing CORMS_UserRoles while the app was already open stayed
 * invisible to every already-loaded consumer (NavRail, the Navigation Menu admin screen's
 * "Refresh Navigation" button, bulk-action role gates) until a full page reload, with no way to
 * force it short of that reload. One cheap REST call per lookup is a better trade than that
 * staleness class of bug.
 *
 * Also tolerates CORMS_UserRoles not existing *at all* yet (a brand-new tenant, before Provision
 * Lists has run) — not just an existing list with no row for this user. Both cases resolve to the
 * same `isProvisioned: false` result carrying `isSiteOwner` (membership in the site's Owners
 * SharePoint group — a group that exists on every site with zero custom lists, see
 * isCurrentUserSiteOwner()'s comment for how that group is located), which useNav.ts uses as a
 * bootstrap door into Administration so someone can actually reach Provision Lists on a virgin
 * tenant. See useNav.ts's file comment for how that fallback is scoped so it stops applying the
 * moment a user gets a real CORMS_UserRoles row.
 */
export class RoleServiceCore {
  constructor(private readonly sp: SPFI) {}

  public async getCurrentUserRole(): Promise<ICurrentUserRole> {
    const currentUserId = await getCurrentSiteUserId(this.sp);
    const isSiteOwner = await this.isCurrentUserSiteOwner(currentUserId);
    let row: IUserRoleListItem | undefined;
    let listAvailable = true;
    // CMS-055 added PermissionsJson to this read. It is an ADDITIVE column: on a tenant that hasn't
    // re-run Provision Lists since that change the column doesn't exist, and naming it in $select
    // 400s the WHOLE query — which previously collapsed role resolution to the default role and hid
    // role-gated nav (Administration, Audit) for real admins. So try with PermissionsJson, and on
    // failure retry with only the always-present fields before concluding the list is unavailable;
    // a missing column just means "no per-user permissions", never a lost role.
    const CORE_FIELDS = ['Role', 'Department', 'ClearanceTier'] as const;
    const queryRow = (fields: readonly string[]): Promise<IUserRoleListItem[]> =>
      this.sp.web.lists
        .getByTitle(LIST_TITLE)
        .items.filter(`UserId eq ${currentUserId}`)
        .top(1)
        .select(...fields)() as Promise<IUserRoleListItem[]>;
    try {
      row = (await queryRow([...CORE_FIELDS, 'PermissionsJson']))[0];
    } catch {
      try {
        row = (await queryRow(CORE_FIELDS))[0];
      } catch {
        listAvailable = false;
      }
    }
    if (!row || !isCormsRole(row.Role)) {
      const reason = listAvailable
        ? `no CORMS_UserRoles row for the current user (site user id ${currentUserId})`
        : `${LIST_TITLE} is not provisioned yet`;
      console.warn(
        `RoleService: ${reason} — defaulting to '${DEFAULT_UNPROVISIONED_ROLE}' ` +
          `(isSiteOwner=${isSiteOwner}, so the Administration bootstrap door is ` +
          `${isSiteOwner ? 'OPEN' : 'CLOSED'} for this user).`
      );
      return { role: DEFAULT_UNPROVISIONED_ROLE, isProvisioned: false, isSiteOwner };
    }
    return {
      role: row.Role,
      isProvisioned: true,
      department: row.Department,
      isSiteOwner,
      clearanceTier: typeof row.ClearanceTier === 'number' ? row.ClearanceTier : undefined,
      // CMS-055 AC3 — the user's per-user permission JSON (default-allow; undefined when blank).
      permissions: parsePermissions(row.PermissionsJson),
    };
  }

  /**
   * Checks `currentUserId` against the site's Owners group. Tries `associatedOwnerGroup` first
   * (the canonical, rename-proof pointer) — but some sites (depending on how they were created)
   * don't have AssociatedOwnerGroupId wired up, so that comes back empty/erroring even for a real
   * owner. Falls back to SharePoint's own default naming convention for that group, "{site title}
   * Owners" (this project's site is titled "CORMS", so its Owners group is "CORMS Owners" — found
   * by testing against a real tenant where `associatedOwnerGroup` didn't resolve it). Each attempt
   * has its own try/catch — a missing/misconfigured group should degrade to "not an owner", never
   * fail the whole role lookup.
   */
  private async isCurrentUserSiteOwner(currentUserId: number): Promise<boolean> {
    if (await this.isMemberOf(() => this.sp.web.associatedOwnerGroup.users.select('Id')(), currentUserId)) {
      return true;
    }
    try {
      const web = (await this.sp.web.select('Title')()) as { Title: string };
      const ownersGroupName = `${web.Title} Owners`;
      return await this.isMemberOf(
        () => this.sp.web.siteGroups.getByName(ownersGroupName).users.select('Id')(),
        currentUserId
      );
    } catch {
      return false;
    }
  }

  private async isMemberOf(fetchMembers: () => Promise<unknown>, currentUserId: number): Promise<boolean> {
    try {
      const members = (await fetchMembers()) as Array<{ Id: number }>;
      return members.some((member) => member.Id === currentUserId);
    } catch {
      return false;
    }
  }
}
