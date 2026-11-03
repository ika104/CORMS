export interface INavBadge {
  count: number;
  tone?: 'default' | 'warning' | 'danger';
}

export interface INavItem {
  id: string;
  /** Translation key for the label. Omit when `label` is set (e.g. a user-named custom folder). */
  labelKey?: string;
  /** Raw display label, takes precedence over `labelKey` — for names that aren't translatable strings. */
  label?: string;
  icon: string;
  path?: string;
  badge?: INavBadge;
  roles?: string[];
  children?: INavItem[];
}

export interface INavGroup {
  id: string;
  labelKey?: string;
  items: INavItem[];
  collapsible?: boolean;
}

export interface INavConfig {
  groups: INavGroup[];
}
