import { ITranslationsService } from '../interfaces/ITranslationsService';
import { ITranslationEntry } from '../../models/ITranslationEntry';
import { IDevSettingsService } from '../interfaces/IDevSettingsService';
import { bundledFlatDefaults, diffFromDefaults, mergeWithDefaults, clearTranslationsCache } from '../../i18n/runtimeTranslations';

/**
 * Live Translations store — the single home for editable labels. The admin's overrides live in
 * CORMS_AdminConfig under `translations.{code}` (a flat dot-key → text map of ONLY the labels that
 * differ from the built-in defaults), written through the existing IDevSettingsService.
 *
 * getEntries returns the FULL dictionary (built-in defaults with the stored overrides laid on top),
 * so the Translations tab shows every current label and the admin can change any of them. saveEntry
 * stores only the diff from the defaults, so the store stays small and a later code change to an
 * unedited label is never masked. A save clears the runtime cache so the change is picked up on the
 * next load. See i18n/runtimeTranslations.ts for the runtime merge.
 */
const KEY_PREFIX = 'translations.';
const LABELS: Record<ITranslationEntry['code'], string> = { en: 'English', ar: 'Arabic' };
const CODES: ITranslationEntry['code'][] = ['en', 'ar'];

function parseJsonMap(raw: string | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(raw ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export class TranslationsServiceLive implements ITranslationsService {
  constructor(private readonly devSettings: IDevSettingsService) {}

  public async getEntries(): Promise<ITranslationEntry[]> {
    const rows = (await this.devSettings.getSettings()) ?? [];
    const byKey = new Map(rows.map((row) => [row.key, row.value]));
    return CODES.map((code) => ({
      code,
      label: LABELS[code],
      json: mergeWithDefaults(code, parseJsonMap(byKey.get(`${KEY_PREFIX}${code}`))),
    }));
  }

  public async saveEntry(code: ITranslationEntry['code'], json: Record<string, string>): Promise<ITranslationEntry> {
    const overrides = diffFromDefaults(json, bundledFlatDefaults(code));
    await this.devSettings.saveSettings([
      {
        key: `${KEY_PREFIX}${code}`,
        value: JSON.stringify(overrides),
        category: 'General',
        description: `${LABELS[code] ?? code} label overrides (flat dot-key → text; only values that differ from the built-in defaults).`,
      },
    ]);
    clearTranslationsCache();
    // Return the full dictionary so the tab keeps showing every label after a save.
    return { code, label: LABELS[code] ?? code, json: mergeWithDefaults(code, overrides) };
  }
}
