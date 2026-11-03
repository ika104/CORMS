import type { i18n as I18n } from 'i18next';
import { ITranslationEntry } from '../models/ITranslationEntry';
import { ITranslationsService } from '../services/interfaces/ITranslationsService';
import { IDevSettingsService } from '../services/interfaces/IDevSettingsService';
import { readAdminConfigValues } from '../services/recordsHubConfig/recordsHubConfig';
import en from './en.json';
import ar from './ar.json';

/** CORMS_AdminConfig key holding how long (hours) the runtime translation JSON is cached in the
 * browser before it's re-fetched. Default is one week — the admin can change any label and it
 * propagates within this window (or immediately after an explicit refresh). */
export const TRANSLATIONS_CACHE_HOURS_KEY = 'general.translationsCacheHours';
export const DEFAULT_TRANSLATIONS_CACHE_HOURS = 168; // one week

const CACHE_STORAGE_KEY = 'corms.translations.cache.v1';

export interface ICachedTranslations {
  cachedAt: number;
  entries: ITranslationEntry[];
}

/**
 * Turns a flat dot-key map — the shape the Translations admin JSON stores, e.g.
 * `{ "nav.search": "Search" }` — into the nested object i18next resolves against
 * (`{ nav: { search: "Search" } }`). Lets admins edit friendly flat keys while the runtime merge
 * still overrides the bundled nested dictionary correctly.
 */
export function unflattenKeys(flat: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.keys(flat ?? {}).forEach((dotted) => {
    const parts = dotted.split('.');
    let node = out;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
      node = node[part] as Record<string, unknown>;
    }
    node[parts[parts.length - 1]] = flat[dotted];
  });
  return out;
}

/** Inverse of unflattenKeys — turns a nested dictionary (like en.json) into the flat dot-key map the
 * Translations tab edits. */
export function flattenKeys(nested: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  Object.keys(nested ?? {}).forEach((key) => {
    const value = nested[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenKeys(value as Record<string, unknown>, path));
    } else {
      out[path] = String(value);
    }
  });
  return out;
}

/** The bundled in-code labels for a language, flattened — the defaults the Translations tab shows
 * so every label is visible and editable, and the baseline a saved edit is diffed against. */
export function bundledFlatDefaults(code: ITranslationEntry['code']): Record<string, string> {
  return flattenKeys((code === 'ar' ? ar : en) as Record<string, unknown>);
}

/** Keeps only the entries that actually differ from the bundled defaults (or are entirely new), so
 * the store/cache holds just the real overrides — an unchanged label keeps following the code
 * default and a later code change to it is never masked by a stale full snapshot. */
export function diffFromDefaults(full: Record<string, string>, defaults: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  Object.keys(full ?? {}).forEach((key) => {
    if (full[key] !== defaults[key]) out[key] = full[key];
  });
  return out;
}

/** The full editable dictionary for a language: bundled defaults with the admin's stored overrides
 * laid on top. Backs the Translations tab so it shows every current label. */
export function mergeWithDefaults(code: ITranslationEntry['code'], overrides: Record<string, string>): Record<string, string> {
  return { ...bundledFlatDefaults(code), ...(overrides ?? {}) };
}

/** Parses the cache-duration Admin Config value, falling back to one week for blank/invalid input. */
export function parseCacheHours(raw: string | undefined): number {
  const n = Number((raw ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TRANSLATIONS_CACHE_HOURS;
}

export function isCacheFresh(cachedAt: number, ttlHours: number, now: number): boolean {
  if (!cachedAt || ttlHours <= 0) return false;
  return now - cachedAt < ttlHours * 3600 * 1000;
}

function readCache(): ICachedTranslations | undefined {
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ICachedTranslations) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(entries: ITranslationEntry[]): void {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify({ cachedAt: Date.now(), entries }));
  } catch {
    /* localStorage unavailable (private mode/quota) — cache is best-effort. */
  }
}

/** Drops the cached translations so the next load re-fetches — called when an admin saves an edit,
 * so a changed label doesn't wait out the remaining cache window. */
export function clearTranslationsCache(): void {
  try {
    localStorage.removeItem(CACHE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Merges each language's admin overrides on top of the bundled dictionary (deep + overwrite), so
 * any key present in the JSON wins over the code default while every other key keeps working. */
export function applyTranslations(i18n: I18n, entries: ITranslationEntry[]): void {
  entries.forEach((entry) => {
    if (!entry.json || Object.keys(entry.json).length === 0) return;
    i18n.addResourceBundle(entry.code, 'translation', unflattenKeys(entry.json), true, true);
  });
}

/** getEntries returns the FULL dictionary (for the admin screen); reduce it to just the overrides
 * before applying/caching, so the cache stays small and a later code change to an unedited label is
 * never masked by a stale cached copy of the old default. */
async function fetchOverrides(translationsService: ITranslationsService): Promise<ITranslationEntry[]> {
  const entries = await translationsService.getEntries();
  return entries.map((entry) => ({ ...entry, json: diffFromDefaults(entry.json, bundledFlatDefaults(entry.code)) }));
}

/** Stable serialization of an override set, for detecting whether the source changed since the cache
 * was written (order-independent per language). */
function fingerprint(entries: ITranslationEntry[]): string {
  return JSON.stringify(
    [...entries]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((e) => {
        const json = e.json ?? {};
        return [e.code, Object.keys(json).sort().map((k) => `${k}=${json[k]}`)];
      })
  );
}

/**
 * Loads the admin-managed translation JSON into i18next at runtime, stale-while-revalidate:
 * - When the browser cache is fresh (per general.translationsCacheHours) it is applied immediately
 *   for a fast first paint, AND a background re-fetch runs; if the source has since changed (e.g. an
 *   admin added a new label), the fresh overrides are applied, the cache is rewritten, and
 *   `onRevalidated` is called so the UI re-renders — so a source change shows up on the next open
 *   without waiting out the cache window (the previous behaviour, which is what hid a newly-added
 *   label until the week-long TTL expired).
 * - When the cache is missing/stale it fetches synchronously, applies, and caches.
 * Overrides merge over the bundled defaults, so the app always renders — a fetch failure just leaves
 * the built-in (or last-cached) labels in place.
 */
export async function loadRuntimeTranslations(deps: {
  i18n: I18n;
  translationsService: ITranslationsService;
  devSettings: IDevSettingsService;
  /** Called after a background revalidation actually changed the applied overrides, so the caller can
   * trigger a re-render (react-i18next only repaints on an i18n event). */
  onRevalidated?: () => void;
}): Promise<void> {
  const { i18n, translationsService, devSettings, onRevalidated } = deps;

  let ttlHours = DEFAULT_TRANSLATIONS_CACHE_HOURS;
  try {
    const values = await readAdminConfigValues(devSettings);
    ttlHours = parseCacheHours(values[TRANSLATIONS_CACHE_HOURS_KEY]);
  } catch {
    /* keep default TTL */
  }

  const cached = readCache();
  if (cached && isCacheFresh(cached.cachedAt, ttlHours, Date.now())) {
    applyTranslations(i18n, cached.entries);
    // Revalidate in the background: pick up a source change without waiting out the TTL. Errors are
    // swallowed inside, so the floating promise never rejects.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      try {
        const fresh = await fetchOverrides(translationsService);
        if (fingerprint(fresh) !== fingerprint(cached.entries)) {
          applyTranslations(i18n, fresh);
          writeCache(fresh);
          onRevalidated?.();
        }
      } catch {
        /* keep the cached labels on a background-fetch failure */
      }
    })();
    return;
  }

  const overrides = await fetchOverrides(translationsService);
  applyTranslations(i18n, overrides);
  writeCache(overrides);
}
