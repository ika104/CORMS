import { INavConfig } from '../../models/INavModel';
import { INavMenuEntryRow } from '../../models/INavigationMenuEntry';
import { CormsRole } from '../../models/ICormsRole';

/** CORMS_NavigationMenu-backed nav structure (CMS-038) — always live, no ds.* mock/live toggle
 * (nav *structure* is CORMS-owned; this is distinct from ds.menu, RecordsHub's own unrelated
 * menu-naming toggle, which this task does not touch). Returns an INavConfig shaped identically
 * to the pre-existing navConfig.ts mock / RecordsHub ds.menu shape, so NavRail and
 * mergeFoldersIntoNav consume it with zero changes. */
export interface INavigationService {
  /** Reads CORMS_NavigationMenu, filters to IsVisible = true AND (RequiredRoles is empty OR the
   * current user's CORMS role is in RequiredRoles), assembles the parent/child tree by
   * ParentKey, sorted by SortOrder, and resolves each entry's badge via BadgeCountService. This
   * is the actual server-side enforcement of CMS-038 AC6 — entries the user's role may not
   * access are never included in the returned tree, not merely hidden client-side. */
  getMenuTree(): Promise<INavConfig>;

  /** Admin-only: every CORMS_NavigationMenu row regardless of IsVisible, unfiltered by role —
   * backs the Navigation Menu admin screen (Part 7). */
  listAllEntries(): Promise<INavMenuEntryRow[]>;
  /** Flips IsVisible — the admin screen's core show/hide control (Part 7), effective immediately
   * once the caller also bumps AppShellContext's navRefreshToken (see useNav.ts). */
  setVisibility(key: string, isVisible: boolean): Promise<void>;
  /** Reorders an entry within its own parent scope (top-level vs a given ParentKey's children).
   * The admin screen's own responsibility to keep sibling SortOrder values sane — this just
   * writes whatever value it's given. */
  setSortOrder(key: string, sortOrder: number): Promise<void>;
  /** Empty array = visible to all roles (CMS-038's "All roles" semantics), matching how
   * NavigationServiceCore.isPermitted() already treats an empty RequiredRoles array. */
  setRequiredRoles(key: string, roles: CormsRole[]): Promise<void>;
  /** Non-system entries only. Throws if `key` resolves to an IsSystemEntry row — system entries
   * can be hidden (setVisibility) but never deleted (Part 7 spec). */
  deleteEntry(key: string): Promise<void>;
}
