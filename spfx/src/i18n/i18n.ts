import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ar from './ar.json';

export const supportedLanguages = ['en', 'ar'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const rtlLanguages: SupportedLanguage[] = ['ar'];

export function isRtlLanguage(language: string): boolean {
  return rtlLanguages.indexOf(language as SupportedLanguage) !== -1;
}

let initialized = false;

export function initI18n(defaultLanguage: SupportedLanguage): typeof i18next {
  if (!initialized) {
    i18next
      .use(initReactI18next)
      .init({
        resources: {
          en: { translation: en },
          ar: { translation: ar },
        },
        lng: defaultLanguage,
        fallbackLng: 'en',
        interpolation: { escapeValue: false },
      })
      .catch(() => {
        /* i18next init failure falls back to key strings, which is an acceptable degrade */
      });
    initialized = true;
  }
  return i18next;
}
