import { INavigationService } from '../interfaces/INavigationService';
import { INavConfig, INavItem } from '../../models/INavModel';
import { INavMenuEntryRow } from '../../models/INavigationMenuEntry';
import { CormsRole } from '../../models/ICormsRole';
import navData from '../../mocks/nav.json';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

function flattenToEntries(config: INavConfig): INavMenuEntryRow[] {
  const rows: INavMenuEntryRow[] = [];
  let sortOrder = 0;
  const visit = (item: INavItem, parentKey?: string): void => {
    sortOrder += 10;
    rows.push({
      key: item.id,
      translationKey: item.labelKey,
      parentKey,
      iconKey: item.icon,
      route: item.path,
      sortOrder,
      isVisible: true,
      isSystemEntry: true,
      requiredRoles: [],
    });
    (item.children ?? []).forEach((child) => visit(child, item.id));
  };
  config.groups.forEach((group) => group.items.forEach((item) => visit(item)));
  return rows;
}

/** Dev/jsdom-test stand-in for NavigationServiceLive — see NavigationServiceMock's file comment
 * on getMenuTree() for why this exists. Admin methods operate on an in-memory flattening of the
 * same static nav.json, entirely local to this instance (no persistence, matching every other
 * mock service's lifetime). */
export class NavigationServiceMock implements INavigationService {
  private entries: INavMenuEntryRow[] = flattenToEntries(navData as INavConfig);

  public getMenuTree(): Promise<INavConfig> {
    return delay(navData as INavConfig);
  }

  public listAllEntries(): Promise<INavMenuEntryRow[]> {
    return delay(this.entries.map((e) => ({ ...e })));
  }

  public setVisibility(key: string, isVisible: boolean): Promise<void> {
    this.entries = this.entries.map((e) => (e.key === key ? { ...e, isVisible } : e));
    return delay(undefined);
  }

  public setSortOrder(key: string, sortOrder: number): Promise<void> {
    this.entries = this.entries.map((e) => (e.key === key ? { ...e, sortOrder } : e));
    return delay(undefined);
  }

  public setRequiredRoles(key: string, roles: CormsRole[]): Promise<void> {
    this.entries = this.entries.map((e) => (e.key === key ? { ...e, requiredRoles: roles } : e));
    return delay(undefined);
  }

  public deleteEntry(key: string): Promise<void> {
    const entry = this.entries.find((e) => e.key === key);
    if (entry?.isSystemEntry) {
      return Promise.reject(new Error(`Navigation entry "${key}" is a system entry and cannot be deleted.`));
    }
    this.entries = this.entries.filter((e) => e.key !== key);
    return delay(undefined);
  }
}
