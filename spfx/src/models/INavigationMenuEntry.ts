import { CormsRole } from './ICormsRole';

/** CORMS_NavigationMenu row, unfiltered — backs the Navigation Menu admin screen (CMS-038 Part
 * 7), distinct from the already-role/visibility-filtered tree NavigationService.getMenuTree()
 * returns for the shell itself. */
export interface INavMenuEntryRow {
  key: string;
  translationKey?: string;
  parentKey?: string;
  iconKey?: string;
  route?: string;
  sortOrder: number;
  isVisible: boolean;
  isSystemEntry: boolean;
  requiredRoles: CormsRole[];
  badgeSourceKey?: string;
}
