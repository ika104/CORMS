import { ITranslationEntry } from '../../models/ITranslationEntry';

/** CMS-056 — the Translations admin screen. */
export interface ITranslationsService {
  getEntries(): Promise<ITranslationEntry[]>;
  saveEntry(code: ITranslationEntry['code'], json: Record<string, string>): Promise<ITranslationEntry>;
}
