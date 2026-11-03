/**
 * CMS-055 AC5 (= CMS-036 AC3) — the admin area must clearly distinguish configuration owned by
 * RecordsHub from configuration owned by CORMS, and state where each is stored.
 *
 * Every row on the Admin Config screen is *stored* in the CORMS-owned CORMS_AdminConfig SharePoint
 * list. What differs is which system the row governs: rows keyed `RH_*` / `recordsHub.*` are the
 * pointers/credentials that connect CORMS to RecordsHub-owned reference data (numbering schemes,
 * security levels, record classifications, org security) — that reference data itself lives in and
 * is owned by RecordsHub. Everything else is pure CORMS-owned application configuration.
 *
 * Derived purely from the key-naming conventions already used by the seed (listSchemas.ts) — no new
 * taxonomy invented — so it can never drift from the rows it labels. Kept as a pure function with
 * its own unit coverage rather than inline in the panel.
 */
export type ConfigOwner = 'RecordsHub' | 'CORMS';

export function resolveConfigOwner(key: string): ConfigOwner {
  const k = key.toLowerCase();
  // `rh_` credential/reference keys and the `recordsHub.` list-URL/record pointers both govern
  // RecordsHub-owned data; every other key is CORMS's own application config.
  if (k.indexOf('rh_') === 0 || k.indexOf('recordshub.') === 0) return 'RecordsHub';
  return 'CORMS';
}
