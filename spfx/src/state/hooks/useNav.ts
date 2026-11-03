import * as React from 'react';
import { INavConfig } from '../../models/INavModel';
import { IUser } from '../../models/IUser';
import { CormsRole, ICurrentUserRole } from '../../models/ICormsRole';
import { IUserPermissions } from '../../models/IUserPermissions';
import { IRecordsHubService } from '../../services/interfaces';
import { MAX_CLEARANCE_TIER } from '../../services/common/clearance';
import { useServices } from '../../services/ServiceProvider';
import { useAppShell } from '../AppShellContext';

const CACHE_NAMESPACE = 'corms.nav';
const NAV_CACHE_KEY = 'navConfig';
const USER_CACHE_KEY = 'currentUser';

export interface IUseNavResult {
  navConfig?: INavConfig;
  currentUser?: IUser;
  /** Resolved CORMS role (CORMS_UserRoles, Epic 1 Part 1) — backs the nav footer's role label
   * (CMS-038 AC8). Undefined only while still loading. */
  currentRole?: CormsRole;
  /** CMS-055 AC3 — the signed-in user's per-user permission configuration
   * (CORMS_UserRoles.PermissionsJson), parsed. Undefined when unset (default-allow). Consumed by
   * the usePermissions() hook so buttons/tabs/dashboards can consult the same rules navigation
   * already enforces server-side. */
  currentPermissions?: IUserPermissions;
  isLoading: boolean;
}

// Identity (currentUser) is still shared per RecordsHub service instance the same way it always
// was — concurrent first mounts share one in-flight request rather than each issuing their own.
const identityInFlight = new WeakMap<IRecordsHubService, Promise<IUser>>();

function loadIdentity(service: IRecordsHubService): Promise<IUser> {
  let pending = identityInFlight.get(service);
  if (!pending) {
    pending = service.getCurrentUser();
    identityInFlight.set(service, pending);
    pending.catch(() => identityInFlight.delete(service));
  }
  return pending;
}

// RecordsHubServiceLive.getCurrentUser() always returns roles: [] — it has no line of sight into
// CORMS_UserRoles, so it can never know who's an admin. Every 'Administrator' check across the app
// (Administration screen gates, nav.json's role-gated items, correspondence/triage/team-management
// role helpers) reads that same array, so without this patch none of them can ever be satisfied in
// live mode, on any tenant. This is also where the brand-new-tenant bootstrap door lives: before
// CORMS_UserRoles has a row for this user, `resolvedRole.isSiteOwner` (membership in the site's
// associated Owners SharePoint group — a group every site has, no custom list needed) stands in
// for it, so a site owner can still reach Provision Lists to create the list in the first place.
// The moment that user gets a real CORMS_UserRoles row — even a non-admin one — `isProvisioned`
// flips true and this stops adding 'Administrator', so a deliberately-assigned lesser role isn't
// silently overridden by leftover SharePoint permissions.
function withResolvedAdminRole(user: IUser, resolvedRole: ICurrentUserRole): IUser {
  // Carry the user's clearance from CORMS_UserRoles onto the identity — RecordsHub's getCurrentUser()
  // never sets clearanceTier, so without this every clearance-gated screen (Create Correspondence's
  // Security Level picker, Inbox/Sent, Search, Doc Control, the Triage queue) falls back to the
  // lowest tier regardless of what ClearanceTier the user is assigned.
  //
  // A SystemAdministrator always resolves to the maximum tier, EXACTLY as the CORMS-owned services
  // do (resolveMyClearanceTierFromUserRoles) — so an admin whose row has no ClearanceTier still sees
  // every classification, and the client-side clearance trims (e.g. the triage queue) agree with the
  // service-side trim rather than hiding everything above Public. Non-admins use their row's value,
  // or leave it unset (screens then apply their own lowest-tier default).
  const effectiveClearance = resolvedRole.role === 'SystemAdministrator' ? MAX_CLEARANCE_TIER : resolvedRole.clearanceTier;
  // The department comes from CORMS_UserRoles too; Approval Tasks matches a department's team tasks by it.
  const withDepartment: IUser =
    !user.department && resolvedRole.department ? { ...user, department: resolvedRole.department } : user;
  const withClearance: IUser =
    effectiveClearance !== undefined ? { ...withDepartment, clearanceTier: effectiveClearance } : withDepartment;
  const isBootstrapAdmin = resolvedRole.role === 'SystemAdministrator' || (!resolvedRole.isProvisioned && resolvedRole.isSiteOwner);
  if (!isBootstrapAdmin || withClearance.roles.indexOf('Administrator') !== -1) {
    return withClearance;
  }
  return { ...withClearance, roles: [...withClearance.roles, 'Administrator'] };
}

// Caches nav config + current-user metadata for the session (§7.6) so they are not refetched on
// every route change. Nav *structure* now comes from NavigationService.getMenuTree()
// (CORMS_NavigationMenu, Epic 1 Part 1) instead of the earlier RecordsHubService.getNavConfig()
// mock/ds.menu path — role-gating (CMS-038 AC6) is enforced server-side inside that call, not
// client-side here. `navRefreshToken` (AppShellContext) lets the Navigation Menu admin screen
// (Part 7) force every mounted useNav() caller to bypass the cache and re-fetch, without a full
// app reload.
export function useNav(): IUseNavResult {
  const { recordsHubService, navigationService, roleService, cacheService } = useServices();
  const { navRefreshToken } = useAppShell();
  const [navConfig, setNavConfig] = React.useState<INavConfig | undefined>(() =>
    cacheService.get<INavConfig>(CACHE_NAMESPACE, NAV_CACHE_KEY)
  );
  const [currentUser, setCurrentUser] = React.useState<IUser | undefined>(() =>
    cacheService.get<IUser>(CACHE_NAMESPACE, USER_CACHE_KEY)
  );
  const [currentRole, setCurrentRole] = React.useState<CormsRole | undefined>(undefined);
  const [currentPermissions, setCurrentPermissions] = React.useState<IUserPermissions | undefined>(undefined);
  const [isLoading, setIsLoading] = React.useState(!navConfig || !currentUser);
  const lastFetchedTokenRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    if (navConfig && currentUser && lastFetchedTokenRef.current === navRefreshToken) {
      return undefined;
    }
    if (lastFetchedTokenRef.current !== undefined && lastFetchedTokenRef.current !== navRefreshToken) {
      // An admin just changed the Navigation Menu — bypass whatever's cached rather than trust it.
      cacheService.invalidate(CACHE_NAMESPACE, NAV_CACHE_KEY);
    }
    lastFetchedTokenRef.current = navRefreshToken;

    let cancelled = false;
    setIsLoading(true);
    // Deliberately resolve the three independently rather than through a single Promise.all: on a
    // freshly-provisioned tenant CORMS_NavigationMenu may not exist yet, so getMenuTree() rejects —
    // and under Promise.all that one rejection would sink identity + role resolution too, leaving
    // currentUser undefined and the whole shell (including the Administration entry that lets an
    // admin *create* the nav menu) role-gated shut. Keeping them independent means a missing nav
    // list just falls back to defaultNavConfig (nav.json) while the site-owner bootstrap-admin
    // reconciliation below still runs. See withResolvedAdminRole()'s file comment.
    const settle = <T,>(p: Promise<T>): Promise<T | undefined> => p.then((v) => v, () => undefined);
    Promise.all([
      settle(navigationService.getMenuTree()),
      settle(loadIdentity(recordsHubService)),
      settle(roleService.getCurrentUserRole()),
    ])
      .then(([fetchedNav, fetchedUser, resolvedRole]) => {
        if (cancelled) return;
        const resolvedUser =
          fetchedUser && resolvedRole ? withResolvedAdminRole(fetchedUser, resolvedRole) : fetchedUser;
        if (fetchedNav) {
          cacheService.set(CACHE_NAMESPACE, NAV_CACHE_KEY, fetchedNav);
          setNavConfig(fetchedNav);
        }
        if (resolvedUser) {
          cacheService.set(CACHE_NAMESPACE, USER_CACHE_KEY, resolvedUser);
          setCurrentUser(resolvedUser);
        }
        if (resolvedRole) {
          setCurrentRole(resolvedRole.role);
          setCurrentPermissions(resolvedRole.permissions);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigationService, recordsHubService, roleService, cacheService, navRefreshToken]);

  return { navConfig, currentUser, currentRole, currentPermissions, isLoading };
}
