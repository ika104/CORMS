import * as React from 'react';
import { ThemeProvider as FluentThemeProvider } from '@fluentui/react';
import type { WebPartContext } from '@microsoft/sp-webpart-base';
import { buildFluentTheme } from './fluentTheme';
import { themes, ThemeName, defaultThemeName } from './themes';
import { tokenCssVarMap } from './tokens';
import { useSharePointTheme } from './spTheme';
import { useServices } from '../services/ServiceProvider';
import styles from './ThemeProvider.module.scss';

// SharePoint "Change the look" accent colors, mapped onto the subset of our own tokens
// that represent brand/accent surfaces. Neutrals and the light-blue content background
// stay driven by our own light/dark switch — only the accent band follows the site theme.
const SP_ACCENT_CSS_VARS: {
  cssVar: string;
  paletteKey: 'themePrimary' | 'themeDarkAlt' | 'themeLighterAlt' | 'themeLighter';
}[] = [
  { cssVar: '--corms-brand-navy', paletteKey: 'themePrimary' },
  { cssVar: '--corms-toolbar-primary', paletteKey: 'themePrimary' },
  { cssVar: '--corms-header-bg', paletteKey: 'themePrimary' },
  { cssVar: '--corms-state-focus', paletteKey: 'themePrimary' },
  { cssVar: '--corms-sidebar-active-text', paletteKey: 'themePrimary' },
  { cssVar: '--corms-brand-navy-hover', paletteKey: 'themeDarkAlt' },
  { cssVar: '--corms-sidebar-active', paletteKey: 'themeLighterAlt' },
  { cssVar: '--corms-rail-background-active', paletteKey: 'themeLighter' },
  // The screen background tints to a light wash of the site theme (blue → light blue, green →
  // light green, red → light pink) so the app visibly follows "Change the look", matching the
  // RecordsHub screens. themeLighter keeps the same softness as the default #EAF2FB blue while the
  // white cards still read clearly on top.
  { cssVar: '--corms-content-bg', paletteKey: 'themeLighter' },
];

export interface IThemeContext {
  themeName: ThemeName;
  isRtl: boolean;
  setThemeName: (name: ThemeName) => void;
}

const ThemeContext = React.createContext<IThemeContext | undefined>(undefined);

const CACHE_NAMESPACE = 'corms.theme';
const CACHE_KEY = 'themeName';

export interface IThemeProviderProps {
  isRtl: boolean;
  children: React.ReactNode;
  // Present when running as a real SPFx web part; absent in the jsdom test harness.
  // When present, the SharePoint site's "Change the look" theme drives the brand/accent
  // CSS variables so the app follows live theme changes.
  spfxContext?: WebPartContext;
}

export const ThemeProvider: React.FC<IThemeProviderProps> = ({ isRtl, children, spfxContext }) => {
  const { cacheService } = useServices();
  const [themeName, setThemeNameState] = React.useState<ThemeName>(() => {
    const cached = cacheService.get<ThemeName>(CACHE_NAMESPACE, CACHE_KEY);
    return cached && themes[cached] ? cached : defaultThemeName;
  });

  const setThemeName = React.useCallback(
    (name: ThemeName) => {
      setThemeNameState(name);
      cacheService.set(CACHE_NAMESPACE, CACHE_KEY, name);
    },
    [cacheService]
  );

  const definition = themes[themeName];
  const spTheme = useSharePointTheme(spfxContext?.serviceScope);
  const spPalette = spTheme?.palette;

  // Tokens are published as CSS custom properties on the document root (not the app
  // root) so Fluent surfaces that portal to document.body — callouts, panels, dialogs —
  // still resolve them. The names are `--corms-*` prefixed, so nothing else on the
  // hosting page can collide with them. The SharePoint accent palette (when available)
  // is layered on top so a site theme change re-colors the app without a reload.
  React.useEffect(() => {
    const root = document.documentElement;
    (Object.keys(tokenCssVarMap) as (keyof typeof tokenCssVarMap)[]).forEach((key) => {
      root.style.setProperty(tokenCssVarMap[key], definition.tokens[key]);
    });

    if (spPalette) {
      SP_ACCENT_CSS_VARS.forEach(({ cssVar, paletteKey }) => {
        const value = spPalette[paletteKey];
        if (value) {
          root.style.setProperty(cssVar, value);
        }
      });
    }
  }, [definition, spPalette]);

  const fluentTheme = React.useMemo(
    () => buildFluentTheme(definition.tokens, isRtl, spPalette),
    [definition, isRtl, spPalette]
  );

  const contextValue = React.useMemo<IThemeContext>(
    () => ({ themeName, isRtl, setThemeName }),
    [themeName, isRtl, setThemeName]
  );

  // `dir` is set on the SPA root rather than <html>: the SPA owns everything below the
  // SharePoint site header (§5), so it must not flip the direction of the host page.
  // Fluent's own RTL handling comes from theme.rtl, which covers its portalled surfaces.
  return (
    <ThemeContext.Provider value={contextValue}>
      <FluentThemeProvider theme={fluentTheme} dir={isRtl ? 'rtl' : 'ltr'} className={styles.appRoot}>
        {children}
      </FluentThemeProvider>
    </ThemeContext.Provider>
  );
};

export function useTheme(): IThemeContext {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
