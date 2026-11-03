import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { INavGroup } from '../../models/INavModel';
import { NavItem } from './NavItem';
import styles from './NavRail.module.scss';

export interface INavGroupProps {
  group: INavGroup;
  isExpanded: boolean;
  userRoles: string[];
}

// CMS-038: grouped, expandable sections with chevron headers. The header is only
// meaningful when the rail is expanded — collapsed (icons-only) the group renders as
// a plain divided block, matching the reference rail.
export const NavGroup: React.FC<INavGroupProps> = ({ group, isExpanded, userRoles }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(true);

  const collapsible = group.collapsible !== false && !!group.labelKey;
  const showHeader = isExpanded && !!group.labelKey;
  const showItems = !showHeader || !collapsible || isOpen;

  return (
    <div className={styles.group}>
      {showHeader && (
        <button
          type="button"
          className={styles.groupHeader}
          onClick={() => collapsible && setIsOpen((prev) => !prev)}
          aria-expanded={collapsible ? isOpen : undefined}
          disabled={!collapsible}
        >
          <span className={styles.groupLabel}>{t(group.labelKey!)}</span>
          {collapsible && (
            <span className={`${styles.groupChevron} ${isOpen ? styles.open : ''}`}>
              <ChevronRight size={14} />
            </span>
          )}
        </button>
      )}
      {showItems &&
        group.items.map((item) => (
          <NavItem key={item.id} item={item} isExpanded={isExpanded} userRoles={userRoles} />
        ))}
    </div>
  );
};
