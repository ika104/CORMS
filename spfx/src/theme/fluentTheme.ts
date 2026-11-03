import { createTheme, ITheme, IPalette } from '@fluentui/react';
import { IThemeTokens } from './tokens';

// spPalette carries the live SharePoint "Change the look" accent colors (when hosted in
// SharePoint). Where present, it wins over our own brand tokens for the primary/accent
// slots, so Fluent surfaces (Panel, Callout, Dropdown, ...) follow the site theme.
export function buildFluentTheme(tokens: IThemeTokens, isRtl: boolean, spPalette?: Partial<IPalette>): ITheme {
  return createTheme({
    rtl: isRtl,
    palette: {
      themePrimary: spPalette?.themePrimary ?? tokens.brandNavy,
      themeDarker: spPalette?.themeDarker ?? tokens.brandNavyHover,
      themeDark: spPalette?.themeDark ?? tokens.brandNavyHover,
      themeDarkAlt: spPalette?.themeDarkAlt ?? tokens.brandNavyHover,
      themeSecondary: spPalette?.themeSecondary ?? tokens.brandNavy,
      themeTertiary: spPalette?.themeTertiary ?? tokens.brandNavy,
      themeLight: spPalette?.themeLight ?? tokens.neutralPanel,
      themeLighter: spPalette?.themeLighter ?? tokens.neutralPanel,
      themeLighterAlt: spPalette?.themeLighterAlt ?? tokens.neutralPage,
      neutralPrimary: tokens.textPrimary,
      neutralSecondary: tokens.textSecondary,
      neutralLight: tokens.neutralPanel,
      neutralLighter: tokens.neutralPanel,
      neutralLighterAlt: tokens.neutralPage,
      white: tokens.neutralPage,
    },
  });
}
