/** CMS-056 — one row of the Translations admin screen: a language's full button/label
 * JSON dictionary (a curated subset of src/i18n/{code}.json for this mock, not a live mirror
 * of the app's actual runtime dictionary). */
export interface ITranslationEntry {
  code: 'en' | 'ar';
  label: string;
  json: Record<string, string>;
}
