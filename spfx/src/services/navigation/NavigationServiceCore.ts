import type { SPFI } from '@pnp/sp';
import { INavBadge, INavConfig, INavItem } from '../../models/INavModel';
import { CormsRole } from '../../models/ICormsRole';
import { IUserPermissions } from '../../models/IUserPermissions';
import { INavMenuEntryRow } from '../../models/INavigationMenuEntry';
import { escapeODataLiteral } from '../common/odata';
import { canSee } from '../common/resolvePermissions';
import { RoleServiceCore } from '../role/RoleServiceCore';
import { BadgeCountServiceCore } from './BadgeCountServiceCore';

const LIST_TITLE = 'CORMS_NavigationMenu';
const ENTRY_FIELDS = [
  'Key',
  'TranslationKey',
  'ParentKey',
  'IconKey',
  'Route',
  'SortOrder',
  'IsVisible',
  'IsSystemEntry',
  'RequiredRoles',
  'BadgeSourceKey',
];
const APPROVAL_WORKFLOWS_NAVIGATION_KEY = 'administration.approvalWorkflows';

// Sites created before Approval Workflows was introduced do not yet have this system row in
// CORMS_NavigationMenu. Keep the new page discoverable until an administrator runs Provision
// Lists, which creates the persistent row. We only supply it when the row is entirely absent;
// an existing hidden row remains an administrator's intentional visibility choice.
const APPROVAL_WORKFLOWS_NAVIGATION_FALLBACK: INavMenuListItem = {
  Key: APPROVAL_WORKFLOWS_NAVIGATION_KEY,
  TranslationKey: 'nav.approvalWorkflows',
  ParentKey: 'administration',
  IconKey: 'workflow',
  Route: '/administration/approval-workflows',
  SortOrder: 3,
  IsVisible: true,
  IsSystemEntry: true,
  RequiredRoles: JSON.stringify(['SystemAdministrator']),
};

// My Tasks became a group of two screens. Sites seeded before that have a flat My Tasks row with
// its own route and no children, and seeding never edits an existing row, so the group shape is
// applied here: the parent loses its route (it only groups) and any missing child is supplied.
// Children an administrator already has — hidden or not — are left exactly as they are.
const MY_TASKS_NAVIGATION_KEY = 'myTasks';
const MY_TASKS_CHILD_FALLBACKS: INavMenuListItem[] = [
  {
    Key: 'myTasks.tasks',
    TranslationKey: 'nav.tasks',
    ParentKey: MY_TASKS_NAVIGATION_KEY,
    IconKey: 'listChecks',
    Route: '/my-tasks',
    SortOrder: 1,
    IsVisible: true,
    IsSystemEntry: true,
    RequiredRoles: JSON.stringify([]),
  },
  {
    Key: 'myTasks.approvalTasks',
    TranslationKey: 'nav.approvalTasks',
    ParentKey: MY_TASKS_NAVIGATION_KEY,
    IconKey: 'pen',
    Route: '/approval-tasks',
    SortOrder: 2,
    IsVisible: true,
    IsSystemEntry: true,
    RequiredRoles: JSON.stringify([]),
  },
];

interface INavMenuListItem {
  Key: string;
  TranslationKey?: string;
  ParentKey?: string;
  IconKey?: string;
  Route?: string;
  SortOrder?: number;
  IsVisible?: boolean;
  IsSystemEntry?: boolean;
  RequiredRoles?: string;
  BadgeSourceKey?: string;
}

function parseRequiredRoles(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Pure CORMS_NavigationMenu tree-assembly logic — see provisioningCore.ts's file comment for why
 * Core classes only `import type { SPFI }`. NavigationService.live.ts is the thin real wrapper.
 *
 * This is the actual server-side enforcement of CMS-038 AC6: entries the current user's role
 * cannot access are filtered out here, before the tree is ever built — never sent to the client
 * for it to hide. Output shape (INavConfig) is identical to the pre-existing navConfig.ts mock /
 * ds.menu shape, so NavRail and mergeFoldersIntoNav (custom folders, CMS-039 AC13) need no
 * changes to consume it.
 */
export class NavigationServiceCore {
  private readonly roleService: RoleServiceCore;
  private readonly badgeCountService: BadgeCountServiceCore;

  constructor(
    private readonly sp: SPFI,
    getCurrentUserClearanceTier: () => Promise<number>
  ) {
    this.roleService = new RoleServiceCore(sp);
    this.badgeCountService = new BadgeCountServiceCore(sp, getCurrentUserClearanceTier);
  }

  public async getMenuTree(): Promise<INavConfig> {
    const [{ role, permissions }, menuItems] = await Promise.all([
      this.roleService.getCurrentUserRole(),
      this.fetchMenuItems(),
    ]);

    const rawItems = this.withMyTasksGroup(this.withMissingApprovalWorkflowsEntry(menuItems));
    const permitted = rawItems
      .filter((item) => item.IsVisible && this.isPermitted(item, role, permissions))
      .slice()
      .sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));

    const resolved = await Promise.all(
      permitted.map(async (item) => ({
        item,
        badge: await this.resolveBadgeSafely(item.BadgeSourceKey),
      }))
    );

    const byKey = new Map<string, INavItem>(
      resolved.map(({ item, badge }) => [item.Key, this.toNavItem(item, badge)])
    );
    const topLevel: INavItem[] = [];

    resolved.forEach(({ item }) => {
      const navItem = byKey.get(item.Key);
      if (!navItem) return;
      if (!item.ParentKey) {
        topLevel.push(navItem);
        return;
      }
      const parent = byKey.get(item.ParentKey);
      // An orphaned child (its parent was itself filtered out by role, or renamed/deleted) is
      // dropped entirely rather than surfaced at the top level — a hidden parent should hide its
      // whole subtree.
      if (parent) {
        parent.children = [...(parent.children ?? []), navItem];
      }
    });

    return { groups: [{ id: 'main', items: topLevel }] };
  }

  // A badge is inherently "nice to have" — e.g. inboxUnreadCount depends on CORMS_Correspondence
  // and CORMS_ReadReceipts both being reachable, which is a real-world failure mode (not yet
  // provisioned on a given site, a transient throttling error, etc.) that has nothing to do with
  // whether the nav item itself should render. Before this, one badge failing rejected the whole
  // Promise.all() above and took the entire menu tree down with it — a single missing list could
  // make every role-gated entry (Administration, Audit Trail, …) silently disappear, which looks
  // exactly like a role-resolution bug even though role resolution never ran into trouble at all.
  private async resolveBadgeSafely(badgeSourceKey: string | undefined): Promise<INavBadge | undefined> {
    try {
      return await this.badgeCountService.resolveBadge(badgeSourceKey);
    } catch (err) {
      console.warn(
        `NavigationService: failed to resolve badge "${String(badgeSourceKey)}" — showing no badge.`,
        err
      );
      return undefined;
    }
  }

  // CMS-038 AC6 role gate, now ALSO folding in the per-user permission JSON (CMS-055 AC3): an admin
  // can hide a specific view for a specific user via CORMS_UserRoles.PermissionsJson `views.<Key>`.
  // This is the representative enforcement point — the same canSee() resolution the usePermissions()
  // hook exposes for buttons/tabs, applied server-side here so hidden entries are never sent to the
  // client. Default-allow: an unset key leaves the entry visible, so role-gating behaviour is
  // unchanged until an admin explicitly opts a user out of a view.
  private isPermitted(
    item: INavMenuListItem,
    role: CormsRole,
    permissions: IUserPermissions | undefined
  ): boolean {
    const required = parseRequiredRoles(item.RequiredRoles);
    const roleAllows = required.length === 0 || required.indexOf(role) !== -1;
    return roleAllows && canSee(permissions, 'views', item.Key);
  }

  private toNavItem(item: INavMenuListItem, badge: INavBadge | undefined): INavItem {
    return {
      id: item.Key,
      labelKey: item.TranslationKey,
      icon: item.IconKey || 'circle',
      path: item.Route || undefined,
      badge,
    };
  }

  /**
   * Load all rows so a deliberately hidden system entry can be distinguished from a missing one.
   * The visibility and role gates remain applied before the navigation tree is returned.
   */
  private async fetchMenuItems(): Promise<INavMenuListItem[]> {
    return (await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.select(...ENTRY_FIELDS)
      .orderBy('SortOrder', true)()) as INavMenuListItem[];
  }

  private withMissingApprovalWorkflowsEntry(items: INavMenuListItem[]): INavMenuListItem[] {
    return items.some((item) => item.Key === APPROVAL_WORKFLOWS_NAVIGATION_KEY)
      ? items
      : [...items, APPROVAL_WORKFLOWS_NAVIGATION_FALLBACK];
  }

  private withMyTasksGroup(items: INavMenuListItem[]): INavMenuListItem[] {
    if (!items.some((item) => item.Key === MY_TASKS_NAVIGATION_KEY)) return items;
    const missing = MY_TASKS_CHILD_FALLBACKS.filter((child) => !items.some((item) => item.Key === child.Key));
    return items
      .map((item) => (item.Key === MY_TASKS_NAVIGATION_KEY ? { ...item, Route: '' } : item))
      .concat(missing);
  }

  /** Admin-only — every row regardless of IsVisible, unfiltered by role (Part 7). */
  public async listAllEntries(): Promise<INavMenuEntryRow[]> {
    const items = (await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.select(...ENTRY_FIELDS)
      .orderBy('SortOrder', true)()) as INavMenuListItem[];
    return items.map((item) => ({
      key: item.Key,
      translationKey: item.TranslationKey,
      parentKey: item.ParentKey,
      iconKey: item.IconKey,
      route: item.Route,
      sortOrder: item.SortOrder ?? 0,
      isVisible: !!item.IsVisible,
      isSystemEntry: !!item.IsSystemEntry,
      requiredRoles: parseRequiredRoles(item.RequiredRoles) as CormsRole[],
      badgeSourceKey: item.BadgeSourceKey,
    }));
  }

  public async setVisibility(key: string, isVisible: boolean): Promise<void> {
    const idNum = await this.getItemIdByKey(key);
    await this.sp.web.lists.getByTitle(LIST_TITLE).items.getById(idNum).update({ IsVisible: isVisible });
  }

  public async setSortOrder(key: string, sortOrder: number): Promise<void> {
    const idNum = await this.getItemIdByKey(key);
    await this.sp.web.lists.getByTitle(LIST_TITLE).items.getById(idNum).update({ SortOrder: sortOrder });
  }

  public async setRequiredRoles(key: string, roles: CormsRole[]): Promise<void> {
    const idNum = await this.getItemIdByKey(key);
    await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.getById(idNum)
      .update({ RequiredRoles: JSON.stringify(roles) });
  }

  public async deleteEntry(key: string): Promise<void> {
    const rows = (await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.filter(`Key eq '${escapeODataLiteral(key)}'`)
      .top(1)
      .select('Id', 'IsSystemEntry')()) as Array<{ Id: number; IsSystemEntry?: boolean }>;
    const row = rows[0];
    if (!row) return;
    if (row.IsSystemEntry) {
      throw new Error(`Navigation entry "${key}" is a system entry and cannot be deleted.`);
    }
    await this.sp.web.lists.getByTitle(LIST_TITLE).items.getById(row.Id).delete();
  }

  private async getItemIdByKey(key: string): Promise<number> {
    const rows = (await this.sp.web.lists
      .getByTitle(LIST_TITLE)
      .items.filter(`Key eq '${escapeODataLiteral(key)}'`)
      .top(1)
      .select('Id')()) as Array<{ Id: number }>;
    const row = rows[0];
    if (!row) throw new Error(`Navigation entry "${key}" not found.`);
    return row.Id;
  }
}
