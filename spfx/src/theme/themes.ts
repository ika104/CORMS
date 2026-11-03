import { darkRailTokens, IThemeTokens, lightTokens } from './tokens';

export type ThemeName = 'light' | 'brandDark';

export interface IThemeDefinition {
  name: ThemeName;
  labelKey: string;
  tokens: IThemeTokens;
}

// Structured so adding a theme is one entry here — see §7.3 (selectable colour themes).
export const themes: Record<ThemeName, IThemeDefinition> = {
  light: {
    name: 'light',
    labelKey: 'theme.light',
    tokens: lightTokens,
  },
  brandDark: {
    name: 'brandDark',
    labelKey: 'theme.brandDark',
    tokens: darkRailTokens,
  },
};

export const defaultThemeName: ThemeName = 'light';
