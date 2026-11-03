// TODO(confirm): brand hex values read from reference screenshot; confirm against OQ8/RecordsHub official brand guide.
export interface IThemeTokens {
  brandRed: string;
  brandNavy: string;
  brandNavyHover: string;
  neutralPage: string;
  neutralPanel: string;
  neutralBorder: string;
  textPrimary: string;
  textSecondary: string;
  stateFocus: string;
  stateWarning: string;
  railBackground: string;
  railBackgroundActive: string;
  contentBackground: string;
  cardSurface: string;
  cardBorder: string;
  toolbarPrimary: string;
  headerBg: string;
  sidebarBg: string;
  sidebarText: string;
  sidebarActive: string;
  sidebarActiveText: string;
}

export const lightTokens: IThemeTokens = {
  brandRed: '#C8102E',
  brandNavy: '#1F3864',
  brandNavyHover: '#16294C',
  neutralPage: '#FFFFFF',
  neutralPanel: '#F3F2F1',
  neutralBorder: '#E1DFDD',
  textPrimary: '#201F1E',
  textSecondary: '#605E5C',
  stateFocus: '#1F3864',
  stateWarning: '#D29200',
  railBackground: '#F3F2F1',
  railBackgroundActive: '#E7ECF3',
  contentBackground: '#EAF2FB',
  cardSurface: '#FFFFFF',
  cardBorder: '#dbeafe',
  toolbarPrimary: '#0070d0',
  headerBg: '#0078d4',
  sidebarBg: '#ffffff',
  sidebarText: '#374151',
  sidebarActive: '#eff6ff',
  sidebarActiveText: '#2563eb',
};

export const darkRailTokens: IThemeTokens = {
  ...lightTokens,
  railBackground: '#1F3864',
  railBackgroundActive: '#16294C',
  contentBackground: '#EAF2FB',
  cardSurface: '#FFFFFF',
  cardBorder: '#dbeafe',
  toolbarPrimary: '#0070d0',
  headerBg: '#0078d4',
  sidebarBg: '#ffffff',
  sidebarText: '#374151',
  sidebarActive: '#eff6ff',
  sidebarActiveText: '#2563eb',
};

export const tokenCssVarMap: { [K in keyof IThemeTokens]: string } = {
  brandRed: '--corms-brand-red',
  brandNavy: '--corms-brand-navy',
  brandNavyHover: '--corms-brand-navy-hover',
  neutralPage: '--corms-neutral-page',
  neutralPanel: '--corms-neutral-panel',
  neutralBorder: '--corms-neutral-border',
  textPrimary: '--corms-text-primary',
  textSecondary: '--corms-text-secondary',
  stateFocus: '--corms-state-focus',
  stateWarning: '--corms-state-warning',
  railBackground: '--corms-rail-background',
  railBackgroundActive: '--corms-rail-background-active',
  contentBackground: '--corms-content-bg',
  cardSurface: '--corms-card-surface',
  cardBorder: '--corms-card-border',
  toolbarPrimary: '--corms-toolbar-primary',
  headerBg: '--corms-header-bg',
  sidebarBg: '--corms-sidebar-bg',
  sidebarText: '--corms-sidebar-text',
  sidebarActive: '--corms-sidebar-active',
  sidebarActiveText: '--corms-sidebar-active-text',
};
