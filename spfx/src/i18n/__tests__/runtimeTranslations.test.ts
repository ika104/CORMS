import {
  unflattenKeys,
  flattenKeys,
  diffFromDefaults,
  mergeWithDefaults,
  bundledFlatDefaults,
  parseCacheHours,
  isCacheFresh,
  applyTranslations,
  loadRuntimeTranslations,
  DEFAULT_TRANSLATIONS_CACHE_HOURS,
} from '../runtimeTranslations';
import { ITranslationEntry } from '../../models/ITranslationEntry';
import { ITranslationsService } from '../../services/interfaces/ITranslationsService';
import { IDevSettingsService } from '../../services/interfaces/IDevSettingsService';

describe('unflattenKeys', () => {
  it('expands flat dot-keys into the nested object i18next resolves against', () => {
    expect(unflattenKeys({ 'nav.search': 'Search', 'nav.statistics': 'Stats', 'common.save': 'Save' })).toEqual({
      nav: { search: 'Search', statistics: 'Stats' },
      common: { save: 'Save' },
    });
  });

  it('handles a single-segment key and an empty map', () => {
    expect(unflattenKeys({ title: 'X' })).toEqual({ title: 'X' });
    expect(unflattenKeys({})).toEqual({});
  });
});

describe('flattenKeys / diff / merge', () => {
  it('flattenKeys is the inverse of unflattenKeys', () => {
    const flat = { 'nav.search': 'Search', 'common.save': 'Save' };
    expect(flattenKeys(unflattenKeys(flat))).toEqual(flat);
  });

  it('diffFromDefaults keeps only changed or new keys', () => {
    const defaults = { 'nav.search': 'Search', 'common.save': 'Save' };
    const full = { 'nav.search': 'Find', 'common.save': 'Save', 'x.new': 'New' };
    expect(diffFromDefaults(full, defaults)).toEqual({ 'nav.search': 'Find', 'x.new': 'New' });
  });

  it('mergeWithDefaults lays overrides over the bundled defaults', () => {
    const merged = mergeWithDefaults('en', { 'nav.search': 'Find' });
    expect(merged['nav.search']).toBe('Find');
    // A key that exists in the bundled dictionary but wasn't overridden keeps its default.
    expect(Object.keys(merged).length).toBe(Object.keys(bundledFlatDefaults('en')).length);
  });

  it('bundledFlatDefaults exposes the in-code labels flat (e.g. the renamed nav.search)', () => {
    expect(bundledFlatDefaults('en')['nav.search']).toBe('Search');
  });
});

describe('parseCacheHours', () => {
  it('defaults blank/invalid/non-positive input to one week', () => {
    expect(parseCacheHours(undefined)).toBe(DEFAULT_TRANSLATIONS_CACHE_HOURS);
    expect(parseCacheHours('')).toBe(DEFAULT_TRANSLATIONS_CACHE_HOURS);
    expect(parseCacheHours('abc')).toBe(DEFAULT_TRANSLATIONS_CACHE_HOURS);
    expect(parseCacheHours('0')).toBe(DEFAULT_TRANSLATIONS_CACHE_HOURS);
    expect(parseCacheHours('-5')).toBe(DEFAULT_TRANSLATIONS_CACHE_HOURS);
  });
  it('reads a valid positive number', () => {
    expect(parseCacheHours('24')).toBe(24);
    expect(parseCacheHours(' 12 ')).toBe(12);
  });
});

describe('isCacheFresh', () => {
  const now = 1_000_000_000_000;
  it('is fresh within the TTL window', () => {
    expect(isCacheFresh(now - 1 * 3600 * 1000, 168, now)).toBe(true);
  });
  it('is stale past the TTL window', () => {
    expect(isCacheFresh(now - 169 * 3600 * 1000, 168, now)).toBe(false);
  });
  it('is never fresh with no timestamp or a non-positive TTL', () => {
    expect(isCacheFresh(0, 168, now)).toBe(false);
    expect(isCacheFresh(now, 0, now)).toBe(false);
  });
});

describe('loadRuntimeTranslations — stale-while-revalidate (#5 fix)', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* jsdom always has localStorage */
    }
  });

  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  function makeI18n(): { i18n: Parameters<typeof applyTranslations>[0]; bundles: unknown[][] } {
    const bundles: unknown[][] = [];
    const i18n = { addResourceBundle: (...args: unknown[]) => bundles.push(args) } as unknown as Parameters<
      typeof applyTranslations
    >[0];
    return { i18n, bundles };
  }

  const devSettings: IDevSettingsService = { getSettings: () => Promise.resolve([]), saveSettings: () => Promise.resolve() };
  const service = (fullEn: Record<string, string>): ITranslationsService =>
    ({ getEntries: () => Promise.resolve([{ code: 'en', label: 'English', json: fullEn }]) } as unknown as ITranslationsService);

  it('serves a fresh cache immediately, then applies a newly-added source label in the background and re-renders', async () => {
    const oldFull = bundledFlatDefaults('en'); // no overrides yet
    const newFull = { ...bundledFlatDefaults('en'), 'x.brandNew': 'Brand New' };

    // First load with no cache writes the cache from the OLD source.
    const first = makeI18n();
    await loadRuntimeTranslations({ i18n: first.i18n, translationsService: service(oldFull), devSettings });

    // Second load: cache is fresh (just written) so it is applied immediately; the background
    // revalidation sees the new label and re-applies + fires onRevalidated.
    const second = makeI18n();
    let revalidated = false;
    await loadRuntimeTranslations({
      i18n: second.i18n,
      translationsService: service(newFull),
      devSettings,
      onRevalidated: () => {
        revalidated = true;
      },
    });
    await flush();

    expect(revalidated).toBe(true);
    const applied = second.bundles.map((b) => b[2]);
    expect(applied.some((bundle) => (bundle as { x?: { brandNew?: string } }).x?.brandNew === 'Brand New')).toBe(true);
  });

  it('does not re-render when the source is unchanged since the cache was written', async () => {
    const full = { ...bundledFlatDefaults('en'), 'x.same': 'Same' };
    await loadRuntimeTranslations({ i18n: makeI18n().i18n, translationsService: service(full), devSettings });

    let revalidated = false;
    await loadRuntimeTranslations({
      i18n: makeI18n().i18n,
      translationsService: service(full),
      devSettings,
      onRevalidated: () => {
        revalidated = true;
      },
    });
    await flush();

    expect(revalidated).toBe(false);
  });
});

describe('applyTranslations', () => {
  it('adds an unflattened, deep, overwriting bundle per non-empty entry and skips empty ones', () => {
    const calls: unknown[][] = [];
    const i18n = { addResourceBundle: (...args: unknown[]) => calls.push(args) } as unknown as Parameters<typeof applyTranslations>[0];
    const entries: ITranslationEntry[] = [
      { code: 'en', label: 'English', json: { 'nav.search': 'Search' } },
      { code: 'ar', label: 'Arabic', json: {} },
    ];
    applyTranslations(i18n, entries);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['en', 'translation', { nav: { search: 'Search' } }, true, true]);
  });
});
