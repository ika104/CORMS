import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { initI18n, isRtlLanguage, SupportedLanguage } from './i18n';
import { loadRuntimeTranslations } from './runtimeTranslations';
import { useServices } from '../services/ServiceProvider';

export interface ILocalizationContext {
  language: SupportedLanguage;
  isRtl: boolean;
  setLanguage: (language: SupportedLanguage) => void;
}

const LocalizationContext = React.createContext<ILocalizationContext | undefined>(undefined);

const CACHE_NAMESPACE = 'corms.locale';
const CACHE_KEY = 'language';
const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export interface ILocalizationProviderProps {
  children: React.ReactNode;
}

export const LocalizationProvider: React.FC<ILocalizationProviderProps> = ({ children }) => {
  const { cacheService, translationsService, devSettingsService } = useServices();
  const [language, setLanguageState] = React.useState<SupportedLanguage>(() => {
    const cached = cacheService.get<SupportedLanguage>(CACHE_NAMESPACE, CACHE_KEY);
    return cached ?? DEFAULT_LANGUAGE;
  });

  const i18nInstance = React.useMemo(() => initI18n(language), [language]);
  useTranslation();

  // Runtime translations (CMS-056): merge the admin-managed label JSON (Translations tab) over the
  // bundled defaults so any label can be changed from the admin screen without a code change. Runs
  // once on mount — the loader serves from the browser cache while fresh (general.translationsCacheHours,
  // default one week) and otherwise re-fetches. changeLanguage re-renders once the overrides land.
  React.useEffect(() => {
    let cancelled = false;
    const reRender = (): void => {
      if (!cancelled) i18nInstance.changeLanguage(i18nInstance.language).catch(() => undefined);
    };
    loadRuntimeTranslations({
      i18n: i18nInstance,
      translationsService,
      devSettings: devSettingsService,
      // Stale-while-revalidate: the background refresh calls this when the source changed (e.g. a
      // newly-added label), so it appears on this open instead of waiting out the cache window.
      onRevalidated: reRender,
    })
      .catch(() => undefined)
      .then(reRender)
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Applied for every language at once, so this only needs to run on mount, not per language switch.
  }, [i18nInstance, translationsService, devSettingsService]);

  const setLanguage = React.useCallback(
    (next: SupportedLanguage) => {
      setLanguageState(next);
      cacheService.set(CACHE_NAMESPACE, CACHE_KEY, next);
      i18nInstance.changeLanguage(next).catch(() => undefined);
    },
    [cacheService, i18nInstance]
  );

  React.useEffect(() => {
    i18nInstance.changeLanguage(language).catch(() => undefined);
  }, [i18nInstance, language]);

  const contextValue = React.useMemo<ILocalizationContext>(
    () => ({ language, isRtl: isRtlLanguage(language), setLanguage }),
    [language, setLanguage]
  );

  return <LocalizationContext.Provider value={contextValue}>{children}</LocalizationContext.Provider>;
};

export function useLocale(): ILocalizationContext {
  const ctx = React.useContext(LocalizationContext);
  if (!ctx) {
    throw new Error('useLocale must be used within a LocalizationProvider');
  }
  return ctx;
}
