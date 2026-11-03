import { ITranslationsService } from '../interfaces/ITranslationsService';
import { ITranslationEntry } from '../../models/ITranslationEntry';
import { bundledFlatDefaults, diffFromDefaults, mergeWithDefaults } from '../../i18n/runtimeTranslations';

const SIMULATED_LATENCY_MS = 150;
const LABELS: Record<ITranslationEntry['code'], string> = { en: 'English', ar: 'Arabic' };
const CODES: ITranslationEntry['code'][] = ['en', 'ar'];

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

// Dev/jsdom stand-in for TranslationsServiceLive — same contract: getEntries returns the FULL
// dictionary (built-in defaults overlaid with overrides) so the Translations tab shows every label;
// saveEntry keeps only the diff from the defaults. Overrides are session-only (in-memory).
export class TranslationsServiceMock implements ITranslationsService {
  private overrides: Record<ITranslationEntry['code'], Record<string, string>> = { en: {}, ar: {} };

  public getEntries(): Promise<ITranslationEntry[]> {
    return delay(CODES.map((code) => ({ code, label: LABELS[code], json: mergeWithDefaults(code, this.overrides[code]) })));
  }

  public saveEntry(code: ITranslationEntry['code'], json: Record<string, string>): Promise<ITranslationEntry> {
    this.overrides[code] = diffFromDefaults(json, bundledFlatDefaults(code));
    return delay({ code, label: LABELS[code], json: mergeWithDefaults(code, this.overrides[code]) });
  }
}
