import { normalizeForFilter } from '../../components/grid/textNormalizer';

/**
 * Arabic-aware "does this text contain this term" check, normalizing *both* sides with the grid's
 * own `normalizeForFilter` helper (textNormalizer.ts) — the two-directional counterpart to
 * buildTaskFilter.ts's query-term-only normalization, usable wherever the candidate text is
 * already in memory rather than sitting in a SharePoint column.
 *
 * Shared by TaskListServiceMock (whole dataset in memory) and TaskListServiceCore's client-side
 * assignee match (see that file for why assignee can't be a server-side $filter clause), so mock
 * and live mode agree on what "contains" means instead of each having their own copy.
 */
export function normalizedContains(haystack: string | undefined, needle: string): boolean {
  const text = normalizeForFilter(haystack ?? '') ?? '';
  const term = normalizeForFilter(needle) ?? '';
  return text.indexOf(term) !== -1;
}
