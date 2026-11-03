import { INavGroup, INavItem } from '../../models/INavModel';
import { IUserFolder } from '../../models/IFolder';

/** The Inbox entry's route — the one identifier that is stable across both nav sources. The
 * fallback mock (`src/mocks/nav.json`) keys it `inbox`, while the live CORMS_NavigationMenu seed
 * keys it `inboxSent.inbox` (NavigationServiceCore maps `Key` straight onto `INavItem.id`), so
 * matching on `id` alone silently stopped nesting custom folders the moment the shell switched to
 * the live nav source. Matching on the route keeps CMS-054 AC6 / CMS-039 AC13 true for both. */
const INBOX_ROUTE = '/inbox-sent/inbox';

function isInboxEntry(item: INavItem): boolean {
  return item.path === INBOX_ROUTE;
}

function toNavItem(folder: IUserFolder): INavItem {
  return { id: `folder-${folder.id}`, label: folder.name, icon: 'folder', path: `/inbox-sent/folder/${folder.id}` };
}

function mapItem(item: INavItem, folders: IUserFolder[]): INavItem {
  if (isInboxEntry(item) && folders.length) {
    return { ...item, children: [...(item.children ?? []), ...folders.map(toNavItem)] };
  }
  if (item.children) {
    return { ...item, children: item.children.map((child) => mapItem(child, folders)) };
  }
  return item;
}

// Custom folders (CMS-054) nest under the "inbox" nav item, one level deeper than
// Inbox/Sent/Drafts — computed at render time from FoldersContext rather than persisted
// into navConfig, since they're user-local saved searches, not part of the RecordsHub menu.
export function mergeFoldersIntoNav(groups: INavGroup[], folders: IUserFolder[]): INavGroup[] {
  if (!folders.length) return groups;
  return groups.map((group) => ({ ...group, items: group.items.map((item) => mapItem(item, folders)) }));
}
