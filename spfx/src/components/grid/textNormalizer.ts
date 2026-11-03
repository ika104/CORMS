/* eslint-disable @rushstack/no-new-null */
// AG Grid's TextFormatter type requires null — this is a legacy API boundary.
export const normalizeForFilter = (value?: string | null): string | null => {
  if (value === undefined || value === null) return null;
  return value
    .replace(/[ً-ْٰ]/g, '')
    .replace(/ـ/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/ç/g, 'c')
    .replace(/ñ/g, 'n');
};

export const DEFAULT_TEXT_FILTER_PARAMS = {
  textFormatter: normalizeForFilter,
  debounceMs: 300,
  trimInput: true,
};
