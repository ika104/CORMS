import * as React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { INavItem } from '../../models/INavModel';
import { railIcons } from '../../components/icons/railIcons';
import styles from './NavItem.module.scss';

export interface INavItemProps {
  item: INavItem;
  isExpanded: boolean;
  isNested?: boolean;
  userRoles: string[];
}

function hasAccess(item: INavItem, userRoles: string[]): boolean {
  return !item.roles || item.roles.some((role) => userRoles.indexOf(role) !== -1);
}

function containsPath(item: INavItem, pathname: string): boolean {
  return !!item.children?.some((child) => !!child.path && pathname.indexOf(child.path) === 0);
}

export const NavItem: React.FC<INavItemProps> = ({ item, isExpanded, isNested, userRoles }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const hasActiveChild = containsPath(item, location.pathname);
  const [childrenOpen, setChildrenOpen] = React.useState(hasActiveChild);

  React.useEffect(() => {
    if (hasActiveChild) {
      setChildrenOpen(true);
    }
  }, [hasActiveChild]);

  if (!hasAccess(item, userRoles)) {
    return null;
  }

  const RailIconComponent = railIcons[item.icon];
  const visibleChildren = item.children?.filter((child) => hasAccess(child, userRoles));
  const hasChildren = !!visibleChildren?.length;
  const isActive = !!item.path && location.pathname === item.path;
  // A custom folder passes a raw `label` (a user-entered name, not a translation key);
  // every built-in item still goes through `labelKey` as before.
  const label = item.label ?? (item.labelKey ? t(item.labelKey) : '');
  const badgeTone = item.badge?.tone;
  const badgeToneClass = badgeTone === 'warning' || badgeTone === 'danger' ? styles[badgeTone] : '';
  // A zero count has nothing to announce — render nothing rather than an empty-looking
  // "0" pill (expanded) or a dot implying unread items that aren't there (collapsed).
  const showBadge = !!item.badge && item.badge.count > 0;
  // Cap the displayed number so a large count can't stretch the pill wide enough to crowd/overflow
  // the row — anything over 99 shows as "99+".
  const badgeText = item.badge && item.badge.count > 99 ? '99+' : item.badge?.count;
  const showChildren = hasChildren && isExpanded && childrenOpen;

  // A group that is ALSO directly navigable (its own route, e.g. Inbox once a custom folder
  // is pinned under it) still gets a dedicated chevron button — useful for expanding without
  // navigating away from wherever you currently are — but the row's NavLink also toggles on
  // click. Without that, the natural first click (on the label) only navigates and silently
  // does nothing to the children, and it takes a second, more careful click landing exactly
  // on the small arrow to actually expand it.
  const content = (
    <>
      <span className={styles.icon}>{RailIconComponent && <RailIconComponent size={15} />}</span>
      {isExpanded && <span className={styles.label}>{label}</span>}
      {showBadge &&
        (isExpanded ? (
          <span className={`${styles.badge} ${badgeToneClass}`}>{badgeText}</span>
        ) : (
          <span className={`${styles.badgeDot} ${badgeToneClass}`} aria-hidden="true" />
        ))}
    </>
  );

  const toggleChildren = (): void => setChildrenOpen((prev) => !prev);
  const openFirstChild = (): void => {
    // Once the user is already within this group, retain the normal expand/collapse behavior.
    // The first click remains a useful shortcut to the group's primary destination.
    if (hasActiveChild) {
      toggleChildren();
      return;
    }
    const firstChild = visibleChildren?.find((child) => !!child.path);
    if (!firstChild?.path) {
      toggleChildren();
      return;
    }
    setChildrenOpen(true);
    navigate(firstChild.path);
  };

  return (
    <>
      {item.path && hasChildren ? (
        <div
          className={`${styles.item} ${isNested ? styles.nested : ''} ${
            isActive || (hasActiveChild && !showChildren) ? styles.active : ''
          }`}
        >
          <NavLink to={item.path} className={styles.itemLink} title={!isExpanded ? label : undefined} onClick={toggleChildren}>
            {content}
          </NavLink>
          {isExpanded && (
            <button
              type="button"
              className={`${styles.chevronBtn} ${childrenOpen ? styles.open : ''}`}
              onClick={toggleChildren}
              aria-expanded={childrenOpen}
              aria-label={t(childrenOpen ? 'rail.collapseGroup' : 'rail.expandGroup', { label })}
            >
              {childrenOpen ? '▾' : '▸'}
            </button>
          )}
        </div>
      ) : item.path ? (
        <NavLink
          to={item.path}
          className={({ isActive: linkActive }) =>
            `${styles.item} ${isNested ? styles.nested : ''} ${linkActive || isActive ? styles.active : ''}`
          }
          title={!isExpanded ? label : undefined}
        >
          {content}
        </NavLink>
      ) : (
        <button
          type="button"
          className={`${styles.item} ${isNested ? styles.nested : ''} ${
            hasActiveChild && !showChildren ? styles.active : ''
          }`}
          onClick={openFirstChild}
          title={!isExpanded ? label : undefined}
          aria-expanded={hasChildren ? childrenOpen : undefined}
        >
          {content}
          {isExpanded && hasChildren && (
            <span className={`${styles.chevron} ${childrenOpen ? styles.open : ''}`}>
              {childrenOpen ? '▾' : '▸'}
            </span>
          )}
        </button>
      )}
      {showChildren &&
        visibleChildren!.map((child) => (
          <NavItem key={child.id} item={child} isExpanded={isExpanded} isNested userRoles={userRoles} />
        ))}
    </>
  );
};
